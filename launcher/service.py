from __future__ import annotations

import hashlib
import json
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import uvicorn
from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from .backend_client import BackendClient
from .config import LauncherConfig, load_config
from .log_utils import configure_logging, read_recent_logs
from .state_store import LauncherStateStore


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def json_response(content: Any, status_code: int = 200) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=content, headers={"Connection": "close"})


def fallback_policy(identity_key: str) -> dict[str, Any]:
    policy = {
        "enforcement_mode": "SAFE_MODE",
        "panic_lock_active": False,
        "panic_lock_expires_at": "",
        "close_all_required": False,
        "auto_block": True,
        "allowed_symbols": ["EURUSD", "GBPUSD", "XAUUSD", "NAS100", "US30"],
        "allowed_sessions": ["London", "New York"],
        "max_risk_per_trade_pct": 0.5,
        "portfolio_heat_limit_pct": "",
        "max_volume": 1.0,
        "current_level": "BASE",
        "recommended_level": "BASE",
        "daily_dd_hard_stop": 1.2,
        "total_dd_hard_stop": 8.0,
        "trading_timezone": "Europe/Andorra",
        "risk_status": "active_monitoring",
        "blocking_rule": "",
        "action_required": "Launcher local sin backend. Operativa en modo degradado.",
        "reason_code": "LOCAL_CACHE_FALLBACK",
        "severity": "warning",
    }
    policy_hash_source = json.dumps({"identity_key": identity_key, **policy}, sort_keys=True, ensure_ascii=True).encode("utf-8")
    policy["policy_hash"] = hashlib.sha256(policy_hash_source).hexdigest()[:16]
    return policy


class LauncherServiceRuntime:
    def __init__(self, config: LauncherConfig) -> None:
        self.config = config
        self.logger = configure_logging(config.debug)
        self.store = LauncherStateStore()
        self.backend = BackendClient(config)
        self.stop_event = threading.Event()
        self.worker_thread: threading.Thread | None = None

    def identity_key(self, payload: dict[str, Any] | None, login: str = "", connection_key: str = "") -> str:
        if connection_key:
            return connection_key
        if payload:
            payload_key = str(payload.get("connection_key") or "").strip()
            if payload_key:
                return payload_key
            account = payload.get("account")
            if isinstance(account, dict):
                account_login = str(account.get("login") or "").strip()
                if account_login:
                    return account_login
            payload_login = str(payload.get("login") or "").strip()
            if payload_login:
                return payload_login
        return login or self.config.connection_key

    def inject_connection_key(self, payload: dict[str, Any] | None, header_connection_key: str = "") -> dict[str, Any]:
        safe_payload = payload if isinstance(payload, dict) else {}
        explicit_key = str(header_connection_key or safe_payload.get("connection_key") or "").strip()
        effective_key = explicit_key or self.config.connection_key
        if effective_key and not explicit_key:
            safe_payload["connection_key"] = effective_key
            self.logger.info("[KMFX][SERVICE] injected connection_key from launcher config")
        return safe_payload

    def build_queue_item(self, kind: str, item_id: str, identity_key: str, payload: dict[str, Any], attempts: int = 0) -> dict[str, Any]:
        return {
            "item_id": item_id,
            "kind": kind,
            "identity_key": identity_key,
            "payload": payload,
            "attempts": attempts,
            "next_retry_at": now_iso(),
            "created_at": now_iso(),
            "status": "queued",
            "last_error": "",
        }

    def backoff_seconds(self, attempts: int) -> int:
        delay = 3 * (2 ** max(attempts - 1, 0))
        return min(delay, 180)

    def mark_retried(self, kind: str, item_id: str, attempts: int, error: str) -> None:
        next_retry_at = (datetime.now(timezone.utc) + timedelta(seconds=self.backoff_seconds(attempts))).isoformat()
        self.store.update_queue_item(kind, item_id, attempts=attempts, next_retry_at=next_retry_at, status="queued", last_error=error)
        self.store.set_last_backend_error(error)

    def mark_delivered(self, kind: str, item_id: str, response: dict[str, Any]) -> None:
        self.store.save_receipt(kind, item_id, response)
        self.store.remove_queue_item(kind, item_id)
        self.store.set_last_backend_error("")

    def dispatch(self, kind: str, item: dict[str, Any]) -> dict[str, Any]:
        item_id = item["item_id"]
        payload = item["payload"]
        self.logger.info("[KMFX][SERVICE] dispatch kind=%s id=%s attempts=%s", kind, item_id, item.get("attempts", 0))
        if kind == "snapshot":
            backend_response = self.backend.post_snapshot(payload)
        else:
            backend_response = self.backend.post_journal(payload)

        if backend_response.ok:
            disposition = str(backend_response.body.get("disposition") or "accepted")
            receipt = {
                "received_at": now_iso(),
                "disposition": disposition,
                "status_code": backend_response.status_code,
                "body": backend_response.body,
            }
            self.mark_delivered(kind, item_id, receipt)
            if kind == "snapshot":
                self.store.set_last_sync(
                    {
                        "identity_key": item.get("identity_key", ""),
                        "sync_id": item_id,
                        "status": disposition,
                        "timestamp": now_iso(),
                    }
                )
            self.logger.info("[KMFX][BACKEND] delivered kind=%s id=%s disposition=%s", kind, item_id, disposition)
            return {"delivered": True, "disposition": disposition, "body": backend_response.body, "status_code": backend_response.status_code}

        if backend_response.status_code >= 500 or backend_response.status_code == 0:
            attempts = int(item.get("attempts", 0)) + 1
            if attempts > self.config.max_attempts:
                self.store.remove_queue_item(kind, item_id)
                dropped_receipt = {
                    "received_at": now_iso(),
                    "disposition": "dropped",
                    "status_code": backend_response.status_code,
                    "body": backend_response.body,
                    "error": backend_response.error,
                }
                self.store.save_receipt(kind, item_id, dropped_receipt)
                self.logger.error("[KMFX][BACKEND] dropped kind=%s id=%s error=%s", kind, item_id, backend_response.error)
                return {"delivered": False, "disposition": "dropped", "body": backend_response.body, "status_code": backend_response.status_code}

            self.mark_retried(kind, item_id, attempts, backend_response.error or f"status={backend_response.status_code}")
            self.logger.warning("[KMFX][BACKEND] queued retry kind=%s id=%s attempts=%s error=%s", kind, item_id, attempts, backend_response.error)
            return {"delivered": False, "disposition": "queued", "body": backend_response.body, "status_code": backend_response.status_code}

        receipt = {
            "received_at": now_iso(),
            "disposition": "rejected",
            "status_code": backend_response.status_code,
            "body": backend_response.body,
            "error": backend_response.error,
        }
        self.mark_delivered(kind, item_id, receipt)
        self.logger.error("[KMFX][BACKEND] rejected kind=%s id=%s status=%s", kind, item_id, backend_response.status_code)
        return {"delivered": False, "disposition": "rejected", "body": backend_response.body, "status_code": backend_response.status_code}

    def try_dispatch_immediately(self, kind: str, item_id: str) -> dict[str, Any]:
        item = self.store.find_queue_item(kind, item_id)
        if not item:
            receipt = self.store.find_receipt(kind, item_id)
            if receipt:
                body = receipt.get("body") or {}
                return {"delivered": True, "disposition": receipt.get("disposition", "accepted"), "body": body, "status_code": receipt.get("status_code", 200)}
            return {"delivered": False, "disposition": "missing", "body": {}, "status_code": 404}
        return self.dispatch(kind, item)

    def process_due_queue(self) -> None:
        now_value = now_iso()
        for kind in ("snapshot", "journal"):
            item = self.store.pop_due_item(kind, now_value)
            if item:
                self.dispatch(kind, item)

    def background_loop(self) -> None:
        self.logger.info("[KMFX][SERVICE] background worker started")
        while not self.stop_event.is_set():
            self.process_due_queue()
            self.stop_event.wait(self.config.service_retry_interval_seconds)
        self.logger.info("[KMFX][SERVICE] background worker stopped")

    def start(self) -> None:
        if self.worker_thread and self.worker_thread.is_alive():
            return
        self.stop_event.clear()
        self.worker_thread = threading.Thread(target=self.background_loop, daemon=True)
        self.worker_thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        if self.worker_thread and self.worker_thread.is_alive():
            self.worker_thread.join(timeout=2)

    def status(self) -> dict[str, Any]:
        backend_health = self.backend.healthcheck()
        snapshot = self.store.snapshot()
        return {
            "ok": True,
            "service": "kmfx_launcher_service",
            "service_running": True,
            "backend_reachable": backend_health.ok,
            "backend_status_code": backend_health.status_code,
            "queue_depth": {
                "snapshot": len(snapshot["queue"]["snapshot"]),
                "journal": len(snapshot["queue"]["journal"]),
            },
            "last_sync": snapshot.get("last_sync", {}),
            "last_policy": snapshot.get("last_policy", {}),
            "last_backend_error": snapshot.get("last_backend_error", ""),
            "last_local_error": snapshot.get("last_local_error", ""),
            "connection_key": self.config.connection_key,
            "timestamp": now_iso(),
        }


config = load_config().ensure_runtime_values()
runtime = LauncherServiceRuntime(config)
app = FastAPI(title="KMFX Launcher Service", version="0.1.0")


@app.on_event("startup")
async def on_startup() -> None:
    runtime.start()
    runtime.logger.info("[KMFX][LAUNCHER] service startup host=%s port=%s backend=%s", config.local_host, config.local_port, config.backend_base_url)


@app.on_event("shutdown")
async def on_shutdown() -> None:
    runtime.stop()


@app.get("/health")
async def health() -> JSONResponse:
    return json_response(runtime.status())


@app.get("/status")
async def status() -> JSONResponse:
    return json_response(runtime.status())


@app.get("/logs")
async def logs() -> PlainTextResponse:
    return PlainTextResponse(read_recent_logs())


@app.get("/mt5/policy")
async def mt5_policy(login: str = Query("", min_length=0), connection_key: str = Query("", min_length=0)) -> JSONResponse:
    identity_key = runtime.identity_key(None, login=login, connection_key=connection_key)
    backend_response = runtime.backend.get_policy(login=login, connection_key=connection_key or runtime.config.connection_key)
    if backend_response.ok:
        runtime.store.set_cached_policy(identity_key, backend_response.body)
        runtime.store.set_last_policy({"identity_key": identity_key, "status": "fresh", "timestamp": now_iso()})
        runtime.logger.info("[KMFX][BACKEND] policy fresh identity=%s", identity_key)
        return json_response(backend_response.body)

    cached_policy = runtime.store.get_cached_policy(identity_key)
    if cached_policy:
        runtime.store.set_last_policy({"identity_key": identity_key, "status": "cached", "timestamp": now_iso()})
        runtime.logger.warning("[KMFX][BACKEND] policy cached identity=%s error=%s", identity_key, backend_response.error)
        return json_response(cached_policy)

    fallback = fallback_policy(identity_key)
    runtime.store.set_last_policy({"identity_key": identity_key, "status": "fallback", "timestamp": now_iso()})
    runtime.logger.warning("[KMFX][BACKEND] policy fallback identity=%s error=%s", identity_key, backend_response.error)
    return json_response(fallback)


def resolve_sync_id(payload: dict[str, Any]) -> str:
    explicit = str(payload.get("sync_id") or "").strip()
    if explicit:
        return explicit
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=True).encode("utf-8")).hexdigest()[:24]


def resolve_batch_id(payload: dict[str, Any]) -> str:
    explicit = str(payload.get("batch_id") or "").strip()
    if explicit:
        return explicit
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=True).encode("utf-8")).hexdigest()[:24]


@app.post("/mt5/sync")
async def mt5_sync(request: Request) -> JSONResponse:
    payload = await request.json()
    payload = runtime.inject_connection_key(payload, request.headers.get("X-KMFX-Connection-Key", ""))
    sync_id = resolve_sync_id(payload)
    identity_key = runtime.identity_key(payload, connection_key=request.headers.get("X-KMFX-Connection-Key", ""))
    receipt = runtime.store.find_receipt("snapshot", sync_id)
    if receipt:
        runtime.logger.info("[KMFX][SERVICE] duplicate snapshot sync_id=%s", sync_id)
        body = receipt.get("body") or {}
        body.setdefault("sync_id", sync_id)
        body.setdefault("disposition", receipt.get("disposition", "duplicate"))
        return json_response(body)

    if not runtime.store.find_queue_item("snapshot", sync_id):
        item = runtime.build_queue_item("snapshot", sync_id, identity_key, payload)
        runtime.store.enqueue("snapshot", item, runtime.config.max_queue_size)
        runtime.logger.info("[KMFX][SERVICE] snapshot queued sync_id=%s identity=%s", sync_id, identity_key)

    result = runtime.try_dispatch_immediately("snapshot", sync_id)
    if result["delivered"]:
        body = result["body"] or {}
        body.setdefault("sync_id", sync_id)
        body.setdefault("disposition", result["disposition"])
        return json_response(body)

    return json_response(
        {
            "ok": True,
            "received": True,
            "sync_id": sync_id,
            "disposition": "queued",
            "reason": "stored_locally",
            "timestamp": now_iso(),
        }
    )


@app.post("/mt5/journal")
async def mt5_journal(request: Request) -> JSONResponse:
    payload = await request.json()
    payload = runtime.inject_connection_key(payload, request.headers.get("X-KMFX-Connection-Key", ""))
    batch_id = resolve_batch_id(payload)
    identity_key = runtime.identity_key(payload, connection_key=request.headers.get("X-KMFX-Connection-Key", ""))
    receipt = runtime.store.find_receipt("journal", batch_id)
    if receipt:
        runtime.logger.info("[KMFX][SERVICE] duplicate journal batch_id=%s", batch_id)
        body = receipt.get("body") or {}
        body.setdefault("batch_id", batch_id)
        body.setdefault("disposition", receipt.get("disposition", "duplicate"))
        return json_response(body)

    if not runtime.store.find_queue_item("journal", batch_id):
        item = runtime.build_queue_item("journal", batch_id, identity_key, payload)
        runtime.store.enqueue("journal", item, runtime.config.max_queue_size)
        runtime.logger.info("[KMFX][SERVICE] journal queued batch_id=%s identity=%s", batch_id, identity_key)

    result = runtime.try_dispatch_immediately("journal", batch_id)
    if result["delivered"]:
        body = result["body"] or {}
        body.setdefault("batch_id", batch_id)
        body.setdefault("disposition", result["disposition"])
        return json_response(body)

    return json_response(
        {
            "ok": True,
            "received": True,
            "batch_id": batch_id,
            "disposition": "queued",
            "reason": "stored_locally",
            "timestamp": now_iso(),
        }
    )


def main() -> None:
    uvicorn.run("launcher.service:app", host=config.local_host, port=config.local_port, reload=False, log_level="info")


if __name__ == "__main__":
    main()
