from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("kmfx_connector_api")

app = FastAPI(title="KMFX Connector API", version="0.1.0")


LAST_SYNC_BY_LOGIN: dict[str, dict[str, Any]] = {}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_login(payload: dict[str, Any]) -> str:
    account = payload.get("account")
    if isinstance(account, dict):
        login = account.get("login")
        if login is not None and str(login).strip():
            return str(login).strip()
    top_level_login = payload.get("login")
    if top_level_login is not None and str(top_level_login).strip():
        return str(top_level_login).strip()
    return ""


def build_policy(login: str) -> dict[str, Any]:
    policy = {
        "risk_status": "active_monitoring",
        "blocking_rule": "",
        "action_required": "Opera dentro de la política activa y respeta los límites locales.",
        "enforcement_mode": "SAFE_MODE",
        "panic_lock_active": False,
        "panic_lock_expires_at": "",
        "close_all_required": False,
        "auto_block": True,
        "allowed_symbols": ["EURUSD", "GBPUSD", "XAUUSD", "NAS100", "US30"],
        "allowed_sessions": ["London", "New York"],
        "max_risk_per_trade_pct": 0.50,
        "max_volume": 1.00,
        "current_level": "BASE",
        "recommended_level": "BASE",
        "daily_dd_hard_stop": 1.20,
        "total_dd_hard_stop": 8.00,
        "reason_code": "OK",
        "severity": "info",
    }

    last_sync = LAST_SYNC_BY_LOGIN.get(login)
    if last_sync:
        connector_mode = str(last_sync.get("mode") or "").strip()
        if connector_mode:
            policy["enforcement_mode"] = connector_mode

    policy_hash_source = json.dumps(policy, sort_keys=True, ensure_ascii=True).encode("utf-8")
    policy["policy_hash"] = hashlib.sha256(policy_hash_source).hexdigest()[:16]
    return policy


@app.get("/")
async def healthcheck() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "kmfx_connector_api",
        "timestamp": now_iso(),
    }


@app.post("/api/mt5/sync")
async def mt5_sync(request: Request) -> dict[str, Any]:
    try:
        payload = await request.json()
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=400, detail=f"Invalid JSON payload: {exc}") from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Payload must be a JSON object.")

    login = normalize_login(payload)
    if not login:
        raise HTTPException(status_code=400, detail="Missing required account.login field.")

    connector_version = str(payload.get("connector_version") or "unknown")
    positions = payload.get("positions")
    trades = payload.get("trades")

    LAST_SYNC_BY_LOGIN[login] = {
        "received_at": now_iso(),
        "mode": payload.get("mode") or "unknown",
        "connector_version": connector_version,
        "account": payload.get("account") if isinstance(payload.get("account"), dict) else {},
        "positions_count": len(positions) if isinstance(positions, list) else 0,
        "trades_count": len(trades) if isinstance(trades, list) else 0,
        "raw": payload,
    }

    policy = build_policy(login)
    log.info(
        "Sync received | login=%s connector_version=%s positions=%s trades=%s",
        login,
        connector_version,
        LAST_SYNC_BY_LOGIN[login]["positions_count"],
        LAST_SYNC_BY_LOGIN[login]["trades_count"],
    )

    return {
        "ok": True,
        "received": True,
        "login": login,
        "policy_hash": policy["policy_hash"],
        "timestamp": now_iso(),
    }


@app.get("/api/mt5/policy")
async def mt5_policy(login: str = Query(..., min_length=1)) -> dict[str, Any]:
    normalized_login = str(login).strip()
    if not normalized_login:
        raise HTTPException(status_code=400, detail="login query param is required.")

    policy = build_policy(normalized_login)
    log.info("Policy requested | login=%s hash=%s", normalized_login, policy["policy_hash"])
    return policy
