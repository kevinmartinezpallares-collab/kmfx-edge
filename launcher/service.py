from __future__ import annotations

import hashlib
import base64
import html
import json
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import uvicorn
from fastapi import FastAPI, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse

from .backend_client import BackendClient
from .connection_keys import resolve_effective_connection_key
from .config import LauncherConfig, load_bridge_config, mask_connection_key, load_config, save_bridge_config, save_config
from .log_utils import configure_logging, read_recent_logs
from .state_store import LauncherStateStore


LOCAL_OAUTH_REDIRECT_URL = "http://localhost:8766/auth/callback"
LOCAL_OAUTH_ALLOWED_REDIRECT_URLS = (
    LOCAL_OAUTH_REDIRECT_URL,
    "http://127.0.0.1:8766/auth/callback",
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def json_response(content: Any, status_code: int = 200) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=content, headers={"Connection": "close"})


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


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
        self.bridge_config = load_bridge_config()
        bridge_connection_key = str(self.bridge_config.get("connection_key") or "").strip()
        if bridge_connection_key:
            self.config.connection_key = bridge_connection_key
            self.logger.info("[KMFX][BRIDGE] connection_key loaded: %s", mask_connection_key(bridge_connection_key))
        else:
            self.config.connection_key = ""
            self.logger.warning("[KMFX][BRIDGE] WARNING: no connection_key config found")
        self.store = LauncherStateStore()
        self.backend = BackendClient(config)
        self.stop_event = threading.Event()
        self.worker_thread: threading.Thread | None = None
        self.oauth_state: dict[str, Any] = {"status": "idle", "message": ""}
        self.oauth_lock = threading.RLock()

    def auth_session_payload(self) -> dict[str, Any]:
        self.config = load_config().ensure_runtime_values()
        self.backend.config = self.config
        authenticated = bool(self.config.auth_access_token and self.config.auth_email)
        return {
            "authenticated": authenticated,
            "user": {
                "id": self.config.auth_user_id,
                "email": self.config.auth_email,
                "name": self.config.auth_name or self.name_from_email(self.config.auth_email),
            },
        }

    def name_from_email(self, email: str) -> str:
        local = str(email or "").split("@")[0].replace(".", " ").replace("_", " ").replace("-", " ").strip()
        return " ".join(part.capitalize() for part in local.split()[:2]) or "Usuario KMFX"

    def store_auth_response(self, body: dict[str, Any]) -> None:
        user = body.get("user") if isinstance(body.get("user"), dict) else {}
        metadata = user.get("user_metadata") if isinstance(user.get("user_metadata"), dict) else {}
        email = str(user.get("email") or self.config.auth_email or "").strip().lower()
        name = str(metadata.get("full_name") or metadata.get("name") or self.name_from_email(email)).strip()
        expires_at = int(body.get("expires_at") or (int(time.time()) + int(body.get("expires_in") or 3600)))
        self.config.auth_access_token = str(body.get("access_token") or "")
        self.config.auth_refresh_token = str(body.get("refresh_token") or self.config.auth_refresh_token or "")
        self.config.auth_expires_at = expires_at
        self.config.auth_user_id = str(user.get("id") or self.config.auth_user_id or "")
        self.config.auth_email = email
        self.config.auth_name = name
        self.config.backend_token = self.config.auth_access_token
        save_config(self.config)
        self.backend.config = self.config

    def ensure_remote_account_link(self) -> dict[str, Any]:
        has_local_link = (
            self.config.connection_key
            and self.config.connection_key_user_id
            and self.config.connection_key_user_id == self.config.auth_user_id
        )
        if not self.config.auth_user_id:
            return {"ok": False, "message": "Sesión no iniciada."}
        response = self.backend.link_account(user_id=self.config.auth_user_id, label="KMFX Connector MT5")
        if not response.ok:
            self.logger.warning("[KMFX][AUTH][LINK] account link failed status=%s", response.status_code)
            if has_local_link:
                save_bridge_config(self.config, user_id=self.config.auth_user_id)
                self.reload_bridge_config(force_log=True)
                return {"ok": True, "connection_key": mask_connection_key(self.config.connection_key)}
            return {"ok": False, "message": "No se pudo preparar la vinculación de cuenta."}

        body = response.body or {}
        connection_key = str(body.get("connection_key") or body.get("launcher_config", {}).get("connection_key") or "").strip()
        if not connection_key:
            return {"ok": False, "message": "El backend no devolvió connection key."}
        self.config.connection_key = connection_key
        self.config.connection_key_user_id = self.config.auth_user_id
        save_config(self.config)
        save_bridge_config(self.config, user_id=self.config.auth_user_id)
        self.reload_bridge_config(force_log=True)
        self.logger.info("[KMFX][AUTH][LINK] connection_key ready key=%s", mask_connection_key(connection_key))
        return {"ok": True, "connection_key": mask_connection_key(connection_key)}

    def auth_error_message(self, response: Any) -> str:
        body = response.body or {}
        raw = str(body.get("msg") or body.get("message") or body.get("error_description") or body.get("error") or "").strip()
        code = str(body.get("error_code") or body.get("code") or body.get("error") or "").strip().lower()
        normalized_raw = raw.lower()
        if code == "invalid_credentials" or "invalid login credentials" in normalized_raw:
            return "Email o contraseña incorrectos. Si tu cuenta usa Google, entra con Google o crea una contraseña desde recuperación."
        if response.status_code == 0:
            return "No se pudo conectar con el servidor"
        if response.status_code in {400, 401, 403}:
            return "No se pudo iniciar sesión. Revisa tus credenciales."
        return "No se pudo conectar con el servidor"

    def begin_google_oauth(self) -> dict[str, Any]:
        verifier = secrets.token_urlsafe(64)
        code_challenge = pkce_challenge(verifier)
        auth_url = self.backend.google_oauth_url(
            redirect_to=LOCAL_OAUTH_REDIRECT_URL,
            code_challenge=code_challenge,
        )
        with self.oauth_lock:
            self.oauth_state = {
                "status": "pending",
                "code_verifier": verifier,
                "started_at": now_iso(),
                "message": "Esperando autorización de Google.",
                "session": self.auth_session_payload(),
            }
        self.logger.info(
            "[KMFX][AUTH][GOOGLE] start redirect_to=%s external_browser=true allowed_redirects=%s",
            LOCAL_OAUTH_REDIRECT_URL,
            ",".join(LOCAL_OAUTH_ALLOWED_REDIRECT_URLS),
        )
        self.logger.info(
            "[KMFX][AUTH][GOOGLE] oauth_params state_sent=false code_challenge=%s",
            code_challenge,
        )
        self.logger.info("[KMFX][AUTH][GOOGLE] oauth_url=%s", auth_url)
        return {"ok": True, "auth_url": auth_url, "redirect_to": LOCAL_OAUTH_REDIRECT_URL}

    def oauth_status(self) -> dict[str, Any]:
        with self.oauth_lock:
            safe_state = {key: value for key, value in self.oauth_state.items() if key not in {"state", "code_verifier"}}
        safe_state.setdefault("status", "idle")
        safe_state["session"] = self.auth_session_payload()
        return safe_state

    def complete_google_oauth(self, *, code: str, state: str, error: str = "", error_description: str = "") -> dict[str, Any]:
        with self.oauth_lock:
            verifier = str(self.oauth_state.get("code_verifier") or "")
        self.logger.info(
            "[KMFX][AUTH][GOOGLE] callback received has_code=%s has_state=%s has_error=%s query_state_ignored=%s",
            bool(code),
            bool(state),
            bool(error),
            bool(state),
        )
        if error:
            self.logger.warning("[KMFX][AUTH][GOOGLE][ERROR] error=%s detail=%s", error, error_description)
            with self.oauth_lock:
                self.oauth_state = {"status": "error", "message": "No se pudo iniciar sesión con Google."}
            return {"ok": False, "message": "No se pudo iniciar sesión con Google."}
        if not verifier:
            self.logger.warning("[KMFX][AUTH][GOOGLE][ERROR] missing PKCE verifier")
            with self.oauth_lock:
                self.oauth_state = {"status": "error", "message": "No se pudo validar la sesión OAuth."}
            return {"ok": False, "message": "No se pudo validar la sesión OAuth."}
        if not code:
            with self.oauth_lock:
                self.oauth_state = {"status": "error", "message": "Login con Google cancelado o sin respuesta."}
            return {"ok": False, "message": "Login con Google cancelado o sin respuesta."}

        self.logger.info("[KMFX][AUTH][GOOGLE] token_exchange=start grant_type=pkce")
        response = self.backend.exchange_pkce_code(auth_code=code, code_verifier=verifier)
        if not response.ok:
            message = self.auth_error_message(response)
            self.logger.warning("[KMFX][AUTH][GOOGLE] token_exchange=error status=%s", response.status_code)
            with self.oauth_lock:
                self.oauth_state = {"status": "error", "message": message}
            return {"ok": False, "message": message}

        self.logger.info("[KMFX][AUTH][GOOGLE] token_exchange=ok status=%s", response.status_code)
        self.store_auth_response(response.body)
        self.ensure_remote_account_link()
        session = self.auth_session_payload()
        with self.oauth_lock:
            self.oauth_state = {"status": "authenticated", "message": "Sesión iniciada con Google.", "session": session}
        self.logger.info("[KMFX][AUTH][GOOGLE] session_saved user=%s", self.config.auth_email)
        return {"ok": True, "message": "Sesión iniciada con Google.", "session": session}

    def reload_bridge_config(self, force_log: bool = False) -> str:
        previous_key = str(self.bridge_config.get("connection_key") or "").strip()
        self.bridge_config = load_bridge_config()
        next_key = str(self.bridge_config.get("connection_key") or "").strip()
        self.config.connection_key = next_key
        if next_key and next_key != previous_key:
            self.logger.info(
                "[KMFX][BRIDGE] connection_key reloaded previous=%s current=%s",
                mask_connection_key(previous_key),
                mask_connection_key(next_key),
            )
        elif next_key and force_log:
            self.logger.info("[KMFX][BRIDGE] connection_key reload confirmed key=%s", mask_connection_key(next_key))
        elif not next_key and force_log:
            self.logger.warning("[KMFX][BRIDGE] WARNING: no connection_key config found after reload")
        return next_key

    def effective_connection_key(self) -> str:
        return self.reload_bridge_config()

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
        return login or self.effective_connection_key()

    def inject_connection_key(self, payload: dict[str, Any] | None, header_connection_key: str = "") -> dict[str, Any]:
        safe_payload = payload if isinstance(payload, dict) else {}
        explicit_key = str(header_connection_key or safe_payload.get("connection_key") or "").strip()
        bridge_key = self.effective_connection_key()
        effective_key, key_source = resolve_effective_connection_key(explicit_key=explicit_key, bridge_key=bridge_key)
        if effective_key and explicit_key and bridge_key and explicit_key != bridge_key:
            self.logger.info(
                "[KMFX][BRIDGE] explicit connection_key kept payload_key=%s bridge_key=%s",
                mask_connection_key(explicit_key),
                mask_connection_key(bridge_key),
            )
        if effective_key and safe_payload.get("connection_key") != effective_key:
            safe_payload["connection_key"] = effective_key
            self.logger.info(
                "[KMFX][BRIDGE] connection_key injected into payload key=%s source=%s",
                mask_connection_key(effective_key),
                key_source,
            )
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
            target_path = self.config.backend_sync_path
            method = "POST"
        else:
            target_path = self.config.backend_journal_path
            method = "POST"
        self.logger.info(
            "[KMFX][BACKEND][POST] kind=%s id=%s method=%s url=%s",
            kind,
            item_id,
            method,
            self.config.backend_base_url.rstrip("/") + target_path,
        )
        if kind == "snapshot":
            backend_response = self.backend.post_snapshot(payload)
        else:
            backend_response = self.backend.post_journal(payload)

        self.logger.info(
            "[KMFX][BACKEND][RESPONSE] kind=%s id=%s attempted=%s method=%s url=%s status=%s",
            kind,
            item_id,
            backend_response.request_attempted,
            backend_response.method,
            backend_response.request_url,
            backend_response.status_code,
        )

        if backend_response.ok:
            disposition = str(backend_response.body.get("disposition") or "accepted")
            reason = str(
                backend_response.body.get("rejection_reason")
                or backend_response.body.get("reason")
                or ""
            )
            details = backend_response.body.get("details")
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
            self.logger.info(
                "[KMFX][BACKEND] delivered kind=%s id=%s disposition=%s reason=%s details=%s",
                kind,
                item_id,
                disposition,
                reason,
                details,
            )
            return {
                "delivered": True,
                "disposition": disposition,
                "body": backend_response.body,
                "status_code": backend_response.status_code,
                "request_attempted": backend_response.request_attempted,
                "request_url": backend_response.request_url,
                "method": backend_response.method,
            }

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
                return {
                    "delivered": False,
                    "disposition": "dropped",
                    "body": backend_response.body,
                    "status_code": backend_response.status_code,
                    "request_attempted": backend_response.request_attempted,
                    "request_url": backend_response.request_url,
                    "method": backend_response.method,
                }

            self.mark_retried(kind, item_id, attempts, backend_response.error or f"status={backend_response.status_code}")
            self.logger.warning("[KMFX][BACKEND] queued retry kind=%s id=%s attempts=%s error=%s", kind, item_id, attempts, backend_response.error)
            return {
                "delivered": False,
                "disposition": "queued",
                "body": backend_response.body,
                "status_code": backend_response.status_code,
                "request_attempted": backend_response.request_attempted,
                "request_url": backend_response.request_url,
                "method": backend_response.method,
            }

        receipt = {
            "received_at": now_iso(),
            "disposition": "rejected",
            "status_code": backend_response.status_code,
            "body": backend_response.body,
            "error": backend_response.error,
        }
        self.mark_delivered(kind, item_id, receipt)
        self.logger.error(
            "[KMFX][BACKEND] rejected kind=%s id=%s status=%s reason=%s details=%s",
            kind,
            item_id,
            backend_response.status_code,
            backend_response.body.get("rejection_reason")
            or backend_response.body.get("reason")
            or backend_response.error
            or "",
            backend_response.body.get("details"),
        )
        return {
            "delivered": False,
            "disposition": "rejected",
            "body": backend_response.body,
            "status_code": backend_response.status_code,
            "request_attempted": backend_response.request_attempted,
            "request_url": backend_response.request_url,
            "method": backend_response.method,
        }

    def try_dispatch_immediately(self, kind: str, item_id: str) -> dict[str, Any]:
        item = self.store.find_queue_item(kind, item_id)
        if not item:
            receipt = self.store.find_receipt(kind, item_id)
            if receipt:
                body = receipt.get("body") or {}
                self.logger.warning(
                    "[KMFX][SERVICE] cached receipt hit kind=%s id=%s disposition=%s status=%s",
                    kind,
                    item_id,
                    receipt.get("disposition", "accepted"),
                    receipt.get("status_code", 200),
                )
                return {
                    "delivered": False,
                    "disposition": receipt.get("disposition", "accepted"),
                    "body": body,
                    "status_code": receipt.get("status_code", 200),
                    "request_attempted": False,
                    "request_url": "",
                    "method": "",
                    "from_receipt_cache": True,
                }
            return {
                "delivered": False,
                "disposition": "missing",
                "body": {},
                "status_code": 404,
                "request_attempted": False,
                "request_url": "",
                "method": "",
                "from_receipt_cache": False,
            }
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
            "backend_base_url": self.config.backend_base_url,
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
    runtime.logger.info("[KMFX][LAUNCHER] backend target resolved url=%s", config.backend_base_url)
    runtime.logger.info("[KMFX][LAUNCHER] local bridge listening on http://%s:%s", config.local_host, config.local_port)
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


@app.post("/bridge/reload-config")
async def bridge_reload_config() -> JSONResponse:
    connection_key = runtime.reload_bridge_config(force_log=True)
    return json_response({"ok": True, "connection_key": mask_connection_key(connection_key)})


@app.get("/logs")
async def logs() -> PlainTextResponse:
    return PlainTextResponse(read_recent_logs())


@app.get("/auth/google/start")
async def auth_google_start() -> JSONResponse:
    return json_response(runtime.begin_google_oauth())


@app.get("/auth/status")
async def auth_status() -> JSONResponse:
    return json_response(runtime.oauth_status())


@app.get("/auth/callback")
async def auth_callback(
    code: str = Query("", min_length=0),
    state: str = Query("", min_length=0),
    error: str = Query("", min_length=0),
    error_description: str = Query("", min_length=0),
) -> HTMLResponse:
    runtime.logger.info(
        "[KMFX][AUTH][GOOGLE] callback hit query_keys=%s",
        ",".join(key for key, value in {
            "code": code,
            "state": state,
            "error": error,
            "error_description": error_description,
        }.items() if value) or "none",
    )
    result = runtime.complete_google_oauth(
        code=code,
        state=state,
        error=error,
        error_description=error_description,
    )
    title = "KMFX Launcher conectado" if result.get("ok") else "No se pudo conectar"
    message = result.get("message") or ("Ya puedes volver a KMFX Launcher." if result.get("ok") else "Vuelve al launcher e inténtalo de nuevo.")
    accent = "#55D38A" if result.get("ok") else "#fb7185"
    mark = "✓" if result.get("ok") else "!"
    html_body = f"""
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>{html.escape(title)}</title>
      </head>
      <body style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif;background:#141413;color:rgba(255,255,255,.96);display:grid;place-items:center;min-height:100vh;margin:0;">
        <main style="width:min(360px,calc(100vw - 40px));text-align:center;padding:30px 26px;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:#18181A;">
          <div style="display:grid;width:48px;height:48px;place-items:center;border-radius:14px;background:rgba(85,211,138,.14);color:{accent};font-size:26px;font-weight:900;margin:0 auto 18px;">{mark}</div>
          <h1 style="font-size:24px;line-height:1.15;letter-spacing:-.03em;margin:0 0 10px;">{html.escape(title)}</h1>
          <p style="color:rgba(255,255,255,.72);font-size:14px;line-height:1.5;margin:0;">Ya puedes volver al launcher.</p>
          <p style="color:rgba(255,255,255,.48);font-size:12px;line-height:1.5;margin:8px 0 0;">{html.escape(str(message))}</p>
          <button id="close-tab-button" onclick="closeKmfxTab()" style="margin-top:22px;height:40px;padding:0 16px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:#26262B;color:rgba(255,255,255,.96);font:inherit;font-weight:700;cursor:pointer;">Cerrar esta pestaña</button>
        </main>
        <script>
          function closeKmfxTab() {{
            var button = document.getElementById('close-tab-button');
            window.close();
            setTimeout(function() {{
              if (button) button.textContent = 'Puedes volver al launcher';
            }}, 250);
          }}
          setTimeout(closeKmfxTab, 1000);
        </script>
      </body>
    </html>
    """
    return HTMLResponse(content=html_body)


@app.get("/mt5/policy")
async def mt5_policy(
    request: Request,
    login: str = Query("", min_length=0),
    connection_key: str = Query("", min_length=0),
) -> JSONResponse:
    bridge_connection_key = runtime.effective_connection_key()
    explicit_connection_key = str(request.headers.get("X-KMFX-Connection-Key") or connection_key or "").strip()
    effective_connection_key, key_source = resolve_effective_connection_key(
        explicit_key=explicit_connection_key,
        bridge_key=bridge_connection_key,
    )
    if bridge_connection_key and explicit_connection_key and bridge_connection_key != explicit_connection_key:
        runtime.logger.info(
            "[KMFX][BRIDGE] explicit policy connection_key kept query_key=%s bridge_key=%s",
            mask_connection_key(explicit_connection_key),
            mask_connection_key(bridge_connection_key),
        )
    identity_key = runtime.identity_key(None, login=login, connection_key=effective_connection_key)
    backend_response = runtime.backend.get_policy(login=login, connection_key=effective_connection_key)
    if backend_response.ok:
        runtime.store.set_cached_policy(identity_key, backend_response.body)
        runtime.store.set_last_policy({"identity_key": identity_key, "status": "fresh", "timestamp": now_iso()})
        runtime.logger.info(
            "[KMFX][BACKEND] policy fresh identity=%s key_source=%s",
            mask_connection_key(identity_key) or identity_key,
            key_source,
        )
        return json_response(backend_response.body)

    cached_policy = runtime.store.get_cached_policy(identity_key)
    if cached_policy:
        runtime.store.set_last_policy({"identity_key": identity_key, "status": "cached", "timestamp": now_iso()})
        runtime.logger.warning("[KMFX][BACKEND] policy cached identity=%s error=%s", mask_connection_key(identity_key) or identity_key, backend_response.error)
        return json_response(cached_policy)

    fallback = fallback_policy(identity_key)
    runtime.store.set_last_policy({"identity_key": identity_key, "status": "fallback", "timestamp": now_iso()})
    runtime.logger.warning("[KMFX][BACKEND] policy fallback identity=%s error=%s", mask_connection_key(identity_key) or identity_key, backend_response.error)
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
    identity_key = runtime.identity_key(payload, connection_key=str(payload.get("connection_key") or runtime.effective_connection_key()).strip())
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
        runtime.logger.info("[KMFX][SERVICE] snapshot queued sync_id=%s identity=%s", sync_id, mask_connection_key(identity_key) or identity_key)

    result = runtime.try_dispatch_immediately("snapshot", sync_id)
    if result["delivered"]:
        body = result["body"] or {}
        body.setdefault("sync_id", sync_id)
        body.setdefault("disposition", result["disposition"])
        return json_response(body)

    runtime.logger.warning(
        "[KMFX][SERVICE] snapshot not delivered sync_id=%s attempted=%s method=%s url=%s status=%s disposition=%s",
        sync_id,
        result.get("request_attempted", False),
        result.get("method", ""),
        result.get("request_url", ""),
        result.get("status_code", 0),
        result.get("disposition", ""),
    )

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
    identity_key = runtime.identity_key(payload, connection_key=str(payload.get("connection_key") or runtime.effective_connection_key()).strip())
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
        runtime.logger.info("[KMFX][SERVICE] journal queued batch_id=%s identity=%s", batch_id, mask_connection_key(identity_key) or identity_key)

    result = runtime.try_dispatch_immediately("journal", batch_id)
    if result["delivered"]:
        body = result["body"] or {}
        body.setdefault("batch_id", batch_id)
        body.setdefault("disposition", result["disposition"])
        return json_response(body)

    runtime.logger.warning(
        "[KMFX][SERVICE] journal not delivered batch_id=%s attempted=%s method=%s url=%s status=%s disposition=%s",
        batch_id,
        result.get("request_attempted", False),
        result.get("method", ""),
        result.get("request_url", ""),
        result.get("status_code", 0),
        result.get("disposition", ""),
    )

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
    uvicorn.run(app, host=config.local_host, port=config.local_port, reload=False, log_level="info")


if __name__ == "__main__":
    main()
