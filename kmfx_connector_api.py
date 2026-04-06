from __future__ import annotations

import hashlib
import json
import logging
import os
import tempfile
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from account_service import AccountService
from account_store import JsonFileAccountStore
from risk_enforcement_engine import build_risk_status
from risk_metrics_engine import build_risk_metrics, extract_previous_risk_snapshot
from risk_policy_engine import build_policy_snapshot, evaluate_risk_policy


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("kmfx_connector_api")

app = FastAPI(title="KMFX Connector API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
log.info(
    "Connector API startup configured | response_helper=connector_json_response routes=%s",
    ["/api/mt5/sync", "/api/mt5/journal", "/api/mt5/policy", "/api/accounts/snapshot"],
)


LAST_SYNC_BY_LOGIN: dict[str, dict[str, Any]] = {}
ACCOUNTS_STATE_PATH = os.path.join(os.path.dirname(__file__), ".kmfx-accounts.json")
SYNC_RECEIPTS_STATE_PATH = os.path.join(os.path.dirname(__file__), ".kmfx-sync-receipts.json")
JOURNAL_RECEIPTS_STATE_PATH = os.path.join(os.path.dirname(__file__), ".kmfx-journal-receipts.json")
JOURNAL_TRADES_STATE_PATH = os.path.join(os.path.dirname(__file__), ".kmfx-journal-trades.json")
SYNC_RECEIPT_TTL = timedelta(days=7)
account_service = AccountService(JsonFileAccountStore(ACCOUNTS_STATE_PATH))

# 1003 is our sync validation error bucket:
# the request reached the API, but some required structural field was invalid
# or could not be normalized safely enough for ingestion.
SYNC_ERROR_INVALID_PAYLOAD = 1003


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def connector_json_response(content: Any, status_code: int = 200) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=content,
        headers={"Connection": "close"},
    )


def _parse_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def load_sync_receipts() -> dict[str, dict[str, Any]]:
    if not os.path.exists(SYNC_RECEIPTS_STATE_PATH):
        return {}
    try:
        with open(SYNC_RECEIPTS_STATE_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}
    records = payload.get("sync_receipts") if isinstance(payload, dict) else {}
    if not isinstance(records, dict):
        return {}
    return {str(key): value for key, value in records.items() if isinstance(value, dict)}


def load_journal_receipts() -> dict[str, dict[str, Any]]:
    if not os.path.exists(JOURNAL_RECEIPTS_STATE_PATH):
        return {}
    try:
        with open(JOURNAL_RECEIPTS_STATE_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}
    records = payload.get("journal_receipts") if isinstance(payload, dict) else {}
    if not isinstance(records, dict):
        return {}
    return {str(key): value for key, value in records.items() if isinstance(value, dict)}


def load_journal_trade_store() -> dict[str, list[dict[str, Any]]]:
    if not os.path.exists(JOURNAL_TRADES_STATE_PATH):
        return {}
    try:
        with open(JOURNAL_TRADES_STATE_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}
    records = payload.get("journal_trades") if isinstance(payload, dict) else {}
    if not isinstance(records, dict):
        return {}
    return {
        str(key): [item for item in value if isinstance(item, dict)]
        for key, value in records.items()
        if isinstance(value, list)
    }


def save_sync_receipts(records: dict[str, dict[str, Any]]) -> None:
    os.makedirs(os.path.dirname(SYNC_RECEIPTS_STATE_PATH) or ".", exist_ok=True)
    payload = {
        "sync_receipts": records,
        "saved_at": now_iso(),
    }
    with tempfile.NamedTemporaryFile("w", delete=False, dir=os.path.dirname(SYNC_RECEIPTS_STATE_PATH) or ".", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=True, indent=2)
        temp_path = handle.name
    os.replace(temp_path, SYNC_RECEIPTS_STATE_PATH)


def save_journal_receipts(records: dict[str, dict[str, Any]]) -> None:
    os.makedirs(os.path.dirname(JOURNAL_RECEIPTS_STATE_PATH) or ".", exist_ok=True)
    payload = {
        "journal_receipts": records,
        "saved_at": now_iso(),
    }
    with tempfile.NamedTemporaryFile("w", delete=False, dir=os.path.dirname(JOURNAL_RECEIPTS_STATE_PATH) or ".", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=True, indent=2)
        temp_path = handle.name
    os.replace(temp_path, JOURNAL_RECEIPTS_STATE_PATH)


def save_journal_trade_store(records: dict[str, list[dict[str, Any]]]) -> None:
    os.makedirs(os.path.dirname(JOURNAL_TRADES_STATE_PATH) or ".", exist_ok=True)
    payload = {
        "journal_trades": records,
        "saved_at": now_iso(),
    }
    with tempfile.NamedTemporaryFile("w", delete=False, dir=os.path.dirname(JOURNAL_TRADES_STATE_PATH) or ".", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=True, indent=2)
        temp_path = handle.name
    os.replace(temp_path, JOURNAL_TRADES_STATE_PATH)


PROCESSED_SYNC_RECEIPTS: dict[str, dict[str, Any]] = load_sync_receipts()
PROCESSED_JOURNAL_RECEIPTS: dict[str, dict[str, Any]] = load_journal_receipts()
JOURNAL_TRADES_BY_IDENTITY: dict[str, list[dict[str, Any]]] = load_journal_trade_store()


def purge_expired_sync_receipts() -> None:
    cutoff = datetime.now(timezone.utc) - SYNC_RECEIPT_TTL
    expired_ids = [
        sync_id
        for sync_id, record in PROCESSED_SYNC_RECEIPTS.items()
        if (_parse_datetime(record.get("received_at")) or datetime.min.replace(tzinfo=timezone.utc)) < cutoff
    ]
    if not expired_ids:
        return
    for sync_id in expired_ids:
        PROCESSED_SYNC_RECEIPTS.pop(sync_id, None)
    save_sync_receipts(PROCESSED_SYNC_RECEIPTS)
    expired_batch_ids = [
        batch_id
        for batch_id, record in PROCESSED_JOURNAL_RECEIPTS.items()
        if (_parse_datetime(record.get("received_at")) or datetime.min.replace(tzinfo=timezone.utc)) < cutoff
    ]
    for batch_id in expired_batch_ids:
        PROCESSED_JOURNAL_RECEIPTS.pop(batch_id, None)
    if expired_batch_ids:
        save_journal_receipts(PROCESSED_JOURNAL_RECEIPTS)


def get_processed_sync_receipt(sync_id: str) -> dict[str, Any] | None:
    purge_expired_sync_receipts()
    return PROCESSED_SYNC_RECEIPTS.get(sync_id)


def remember_processed_sync(sync_id: str, *, login: str, account_id: str, policy_hash: str) -> None:
    purge_expired_sync_receipts()
    PROCESSED_SYNC_RECEIPTS[sync_id] = {
        "sync_id": sync_id,
        "login": login,
        "account_id": account_id,
        "policy_hash": policy_hash,
        "received_at": now_iso(),
    }
    save_sync_receipts(PROCESSED_SYNC_RECEIPTS)


def get_processed_journal_receipt(batch_id: str) -> dict[str, Any] | None:
    purge_expired_sync_receipts()
    return PROCESSED_JOURNAL_RECEIPTS.get(batch_id)


def remember_processed_journal(batch_id: str, *, identity_key: str, trade_count: int) -> None:
    purge_expired_sync_receipts()
    PROCESSED_JOURNAL_RECEIPTS[batch_id] = {
        "batch_id": batch_id,
        "identity_key": identity_key,
        "trade_count": trade_count,
        "received_at": now_iso(),
    }
    save_journal_receipts(PROCESSED_JOURNAL_RECEIPTS)


def resolve_connection_key(payload: dict[str, Any], request: Request | None = None) -> str:
    if request is not None:
        header_value = safe_str(request.headers.get("x-kmfx-connection-key"))
        if header_value:
            return header_value
    explicit = safe_str(payload.get("connection_key"))
    if explicit:
        return explicit
    return ""


def resolve_identity_key(connection_key: str, login: str) -> str:
    return connection_key or login


def journal_trades_for_identity(identity_key: str) -> list[dict[str, Any]]:
    return list(JOURNAL_TRADES_BY_IDENTITY.get(identity_key) or [])


def merge_trade_sources(primary: list[dict[str, Any]], secondary: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in list(primary or []) + list(secondary or []):
        trade_id = safe_str(item.get("trade_id") or item.get("ticket") or item.get("position_id"))
        if trade_id and trade_id in seen:
            continue
        if trade_id:
            seen.add(trade_id)
        merged.append(item)
    return merged


def remember_journal_trades(identity_key: str, trades: list[dict[str, Any]]) -> None:
    existing = JOURNAL_TRADES_BY_IDENTITY.get(identity_key) or []
    by_trade_id: dict[str, dict[str, Any]] = {}
    for trade in existing + trades:
        trade_id = safe_str(trade.get("trade_id") or trade.get("ticket"))
        if trade_id:
            by_trade_id[trade_id] = trade
    ordered = sorted(by_trade_id.values(), key=lambda item: safe_timestamp(item.get("time")), reverse=True)
    JOURNAL_TRADES_BY_IDENTITY[identity_key] = ordered[:200]
    save_journal_trade_store(JOURNAL_TRADES_BY_IDENTITY)


def resolve_sync_id(payload: dict[str, Any]) -> str:
    explicit_sync_id = safe_str(payload.get("sync_id"))
    if explicit_sync_id:
        return explicit_sync_id
    payload_hash = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=True).encode("utf-8")).hexdigest()
    return payload_hash[:24]


def safe_str(value: Any, default: str = "") -> str:
    if value is None:
        return default
    try:
        return str(value).strip()
    except Exception:
        return default


def safe_float(value: Any, default: float = 0.0) -> float:
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def safe_timestamp(value: Any) -> str:
    text = safe_str(value)
    return text or now_iso()


def sorted_by_time(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(items, key=lambda item: safe_timestamp(item.get("time")))


def normalize_login(payload: dict[str, Any]) -> str:
    account = payload.get("account")
    if isinstance(account, dict):
        login = account.get("login")
        text = safe_str(login)
        if text:
            return text
    top_level_login = payload.get("login")
    text = safe_str(top_level_login)
    if text:
        return text
    return ""


def ensure_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def ensure_list_of_dicts(value: Any, section: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    items: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []

    if value is None:
        return items, issues
    if not isinstance(value, list):
        issues.append(
            {
                "section": section,
                "field": section,
                "problem": "expected_list",
                "value_type": type(value).__name__,
            }
        )
        return items, issues

    for index, item in enumerate(value):
        if isinstance(item, dict):
            items.append(item)
        else:
            issues.append(
                {
                    "section": section,
                    "field": f"{section}[{index}]",
                    "problem": "expected_object",
                    "value_type": type(item).__name__,
                }
            )

    return items, issues


def sanitize_account(raw_account: Any) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    account = ensure_dict(raw_account)
    issues: list[dict[str, Any]] = []

    if not account:
        issues.append(
            {
                "section": "account",
                "field": "account",
                "problem": "missing_or_invalid",
                "value_type": type(raw_account).__name__,
            }
        )

    sanitized = {
        "login": safe_str(account.get("login")),
        "name": safe_str(account.get("name")),
        "broker": safe_str(account.get("broker")),
        "server": safe_str(account.get("server")),
        "currency": safe_str(account.get("currency")),
        "balance": safe_float(account.get("balance")),
        "equity": safe_float(account.get("equity")),
        "margin": safe_float(account.get("margin")),
        "free_margin": safe_float(account.get("free_margin")),
        "profit": safe_float(account.get("profit")),
        "leverage": safe_str(account.get("leverage")),
        "timestamp": safe_timestamp(account.get("timestamp")),
    }

    if not sanitized["login"]:
        issues.append(
            {
                "section": "account",
                "field": "account.login",
                "problem": "missing_required",
                "value_type": type(account.get("login")).__name__,
            }
        )

    return sanitized, issues


def sanitize_positions(raw_positions: Any) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    positions, issues = ensure_list_of_dicts(raw_positions, "positions")
    sanitized: list[dict[str, Any]] = []

    for index, position in enumerate(positions):
        sanitized.append(
            {
                "position_id": safe_str(position.get("position_id")),
                "ticket": safe_str(position.get("ticket")),
                "symbol": safe_str(position.get("symbol")),
                "type": safe_str(position.get("type")),
                "volume": safe_float(position.get("volume")),
                "price_open": safe_float(position.get("price_open")),
                "price_current": safe_float(position.get("price_current")),
                "sl": safe_float(position.get("sl")),
                "tp": safe_float(position.get("tp")),
                "profit": safe_float(position.get("profit")),
                "risk_amount": safe_float(position.get("risk_amount")),
                "risk_pct": safe_float(position.get("risk_pct")),
                "strategy_tag": safe_str(position.get("strategy_tag")),
                "time": safe_timestamp(position.get("time")),
            }
        )
        if not safe_str(position.get("symbol")):
            issues.append(
                {
                    "section": "positions",
                    "field": f"positions[{index}].symbol",
                    "problem": "missing_optional_render_field",
                    "value_type": type(position.get("symbol")).__name__,
                }
            )

    return sanitized, issues


def sanitize_trades(raw_trades: Any) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    trades, issues = ensure_list_of_dicts(raw_trades, "trades")
    sanitized: list[dict[str, Any]] = []

    for index, trade in enumerate(trades):
        sanitized.append(
            {
                "trade_id": safe_str(trade.get("trade_id") or trade.get("ticket")),
                "ticket": safe_str(trade.get("ticket")),
                "position_id": safe_str(trade.get("position_id")),
                "symbol": safe_str(trade.get("symbol")),
                "type": safe_str(trade.get("type")),
                "volume": safe_float(trade.get("volume")),
                "price": safe_float(trade.get("price")),
                "profit": safe_float(trade.get("profit")),
                "commission": safe_float(trade.get("commission")),
                "swap": safe_float(trade.get("swap")),
                "comment": safe_str(trade.get("comment")),
                "time": safe_timestamp(trade.get("time")),
            }
        )
        if not safe_str(trade.get("time")):
            issues.append(
                {
                    "section": "trades",
                    "field": f"trades[{index}].time",
                    "problem": "missing_optional_render_field",
                    "value_type": type(trade.get("time")).__name__,
                }
            )

    return sanitized, issues


def build_policy(login: str) -> dict[str, Any]:
    policy = {
        "enforcement_mode": "SAFE_MODE",
        "panic_lock_active": False,
        "panic_lock_expires_at": "",
        "close_all_required": False,
        "auto_block": True,
        "allowed_symbols": ["EURUSD", "GBPUSD", "XAUUSD", "NAS100", "US30"],
        "allowed_sessions": ["London", "New York"],
        "max_risk_per_trade_pct": 0.50,
        "portfolio_heat_limit_pct": "",
        "max_volume": 1.00,
        "current_level": "BASE",
        "recommended_level": "BASE",
        "daily_dd_hard_stop": 1.20,
        "total_dd_hard_stop": 8.00,
        "trading_timezone": os.getenv("KMFX_TRADING_TIMEZONE", "Europe/Andorra"),
    }

    last_sync = LAST_SYNC_BY_LOGIN.get(login)
    if last_sync:
        connector_mode = safe_str(last_sync.get("mode"))
        if connector_mode:
            policy["enforcement_mode"] = connector_mode

    policy_hash_source = json.dumps(policy, sort_keys=True, ensure_ascii=True).encode("utf-8")
    policy["policy_hash"] = hashlib.sha256(policy_hash_source).hexdigest()[:16]
    return policy


def build_connector_policy_response(login: str) -> dict[str, Any]:
    policy = build_policy(login)
    return {
        **policy,
        "risk_status": "active_monitoring",
        "blocking_rule": "",
        "action_required": "Opera dentro de la política activa y respeta los límites locales.",
        "reason_code": "OK",
        "severity": "info",
    }


def build_dashboard_account_payload(
    account: dict[str, Any],
    positions: list[dict[str, Any]],
    trades: list[dict[str, Any]],
    raw_payload: dict[str, Any],
    previous_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    closed_pnl = sum(
        safe_float(trade.get("profit")) + safe_float(trade.get("commission")) + safe_float(trade.get("swap"))
        for trade in trades
    )
    winning_trades = sum(
        1
        for trade in trades
        if (safe_float(trade.get("profit")) + safe_float(trade.get("commission")) + safe_float(trade.get("swap"))) > 0
    )
    win_rate = (winning_trades / len(trades) * 100.0) if trades else 0.0
    raw_policy = build_policy(safe_str(account.get("login")))
    previous_snapshot = extract_previous_risk_snapshot(previous_payload)
    metrics_snapshot = build_risk_metrics(
        account=account,
        positions=positions,
        trades=trades,
        previous_snapshot=previous_snapshot,
        trading_timezone=safe_str(raw_policy.get("trading_timezone"), "UTC"),
    )
    policy_snapshot, policy_warnings = build_policy_snapshot(raw_policy)
    policy_evaluation = evaluate_risk_policy(metrics_snapshot, policy_snapshot)
    status_snapshot = build_risk_status(policy_evaluation, policy_snapshot)
    summary = {
        **metrics_snapshot["summary"],
        "max_drawdown_limit_pct": policy_snapshot["max_dd_limit_pct"],
        "distance_to_max_dd_limit_pct": policy_evaluation["limits_status"]["max_drawdown"]["distance_to_limit_pct"],
        "portfolio_heat_limit_pct": policy_snapshot["portfolio_heat_limit_pct"],
        "distance_to_heat_limit_pct": policy_evaluation["limits_status"]["portfolio_heat"]["distance_to_limit_pct"],
        "heat_usage_ratio_pct": policy_evaluation["limits_status"]["portfolio_heat"]["usage_ratio_pct"],
        "max_risk_per_trade_pct": policy_snapshot["risk_per_trade_pct"],
        "distance_to_daily_dd_limit_pct": policy_evaluation["limits_status"]["daily_drawdown"]["distance_to_limit_pct"],
    }
    risk_snapshot = {
        "summary": summary,
        "policy": policy_snapshot,
        "policy_evaluation": policy_evaluation,
        "status": status_snapshot,
        "symbol_exposure": metrics_snapshot["symbol_exposure"],
        "open_trade_risks": metrics_snapshot["open_trade_risks"],
        "metadata": {
            **metrics_snapshot["metadata"],
            "snapshot_version": "3.0.0",
            "calculation_mode": "sync -> metrics -> policy -> enforcement -> snapshot",
            "warnings": list(metrics_snapshot["metadata"].get("warnings") or []) + policy_warnings,
        },
    }
    return {
        "accountName": account.get("name") or account.get("broker") or "MT5 Account",
        "name": account.get("name") or account.get("broker") or "MT5 Account",
        "broker": account.get("broker") or "MT5",
        "server": account.get("server") or "",
        "environment": "live",
        "platform": "mt5",
        "mode": safe_str(raw_payload.get("mode"), "SAFE_MODE"),
        "balance": account.get("balance", 0.0),
        "equity": account.get("equity", account.get("balance", 0.0)),
        "openPnl": account.get("profit", 0.0),
        "floatingPnl": account.get("profit", 0.0),
        "closedPnl": closed_pnl,
        "totalPnl": closed_pnl + safe_float(account.get("profit")),
        "winRate": win_rate,
        "drawdownPct": summary["peak_to_equity_drawdown_pct"],
        "openPositionsCount": len(positions),
        "totalTrades": len(trades),
        "timestamp": safe_timestamp(raw_payload.get("timestamp") or account.get("timestamp")),
        "payloadSource": "mt5_sync_live",
        "positions": positions,
        "trades": trades,
        "history": raw_payload.get("history") if isinstance(raw_payload.get("history"), list) else [],
        "riskSnapshot": risk_snapshot,
        "riskRules": [
            {
                "title": "DD pico a equity",
                "description": status_snapshot["blocking_rule"] or "Presión vigente sobre capital.",
                "value": f"{summary['peak_to_equity_drawdown_pct']:.2f}%",
            },
            {
                "title": "Heat abierto",
                "description": "Riesgo total estimado en posiciones abiertas.",
                "value": f"{summary['total_open_risk_pct']:.2f}%",
            },
        ],
        "riskProfile": {
            "currentRiskPct": summary["total_open_risk_pct"],
            "dailyLossLimitPct": policy_snapshot["daily_dd_limit_pct"],
            "weeklyHeatLimitPct": policy_snapshot["max_dd_limit_pct"],
            "maxTradeRiskPct": policy_snapshot["risk_per_trade_pct"],
            "maxVolume": policy_snapshot["max_volume"],
            "allowedSessions": policy_snapshot["allowed_sessions"],
            "allowedSymbols": policy_snapshot["allowed_symbols"],
            "autoBlock": policy_snapshot["auto_block_enabled"],
        },
    }


def sync_error_response(reason: str, details: Any, http_status: int = 200, sync_id: str = "") -> JSONResponse:
    return connector_json_response(
        {
            "ok": False,
            "received": False,
            "sync_id": sync_id,
            "disposition": "rejected",
            "reason": reason,
            "error_code": SYNC_ERROR_INVALID_PAYLOAD,
            "details": details,
            "timestamp": now_iso(),
        },
        status_code=http_status,
    )


@app.get("/")
async def healthcheck() -> JSONResponse:
    return connector_json_response({
        "ok": True,
        "service": "kmfx_connector_api",
        "timestamp": now_iso(),
    })


@app.post("/accounts")
async def create_account(request: Request) -> JSONResponse:
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    alias = safe_str(payload.get("alias"))
    platform = safe_str(payload.get("platform"), "mt5")
    if not alias:
        return connector_json_response(
            {
                "ok": False,
                "reason": "missing_alias",
                "details": {"field": "alias"},
                "timestamp": now_iso(),
            },
            status_code=400,
        )

    created = account_service.create_pending_account(
        user_id="local",
        alias=alias,
        platform=platform or "mt5",
    )
    return connector_json_response(
        {
            "ok": True,
            "account_id": created.account_id,
            "alias": created.alias,
            "platform": created.platform,
            "connection_key": created.api_key,
            "status": created.status,
            "created_at": created.created_at.isoformat(),
            "timestamp": now_iso(),
        },
        status_code=201,
    )


@app.get("/accounts")
async def list_accounts() -> JSONResponse:
    return connector_json_response(
        {
            "ok": True,
            "accounts": account_service.build_accounts_registry("local"),
            "timestamp": now_iso(),
        }
    )


@app.get("/accounts/pending")
async def list_pending_accounts() -> JSONResponse:
    pending_accounts = [
        account
        for account in account_service.build_accounts_registry("local")
        if account.get("status") in {"pending_setup", "waiting_sync"}
    ]
    return connector_json_response(
        {
            "ok": True,
            "accounts": [
                {
                    "account_id": account.get("account_id", ""),
                    "alias": account.get("alias", ""),
                    "platform": account.get("platform", "mt5"),
                    "connection_key": account.get("connection_key", ""),
                    "created_at": account.get("created_at", ""),
                }
                for account in pending_accounts
            ],
            "timestamp": now_iso(),
        }
    )


@app.post("/api/mt5/sync")
async def mt5_sync(request: Request) -> JSONResponse:
    sync_id = ""
    try:
        payload = await request.json()
    except Exception as exc:
        log.exception("SYNC invalid JSON payload: %s", exc)
        return sync_error_response(
            "invalid_json",
            {
                "section": "root",
                "field": "body",
                "problem": "invalid_json",
                "message": str(exc),
            },
        )

    if not isinstance(payload, dict):
        log.error("SYNC payload is not an object | value_type=%s", type(payload).__name__)
        return sync_error_response(
            "invalid_payload_shape",
            {
                "section": "root",
                "field": "body",
                "problem": "expected_object",
                "value_type": type(payload).__name__,
            },
        )

    try:
        issues: list[dict[str, Any]] = []
        sync_id = resolve_sync_id(payload)
        connection_key = resolve_connection_key(payload, request)
        sanitized_account, account_issues = sanitize_account(payload.get("account"))
        sanitized_positions, position_issues = sanitize_positions(payload.get("positions"))
        sanitized_trades, trade_issues = sanitize_trades(payload.get("trades"))
        issues.extend(account_issues)
        issues.extend(position_issues)
        issues.extend(trade_issues)

        login = normalize_login(payload)
        if not login:
            details = {
                "section": "account",
                "field": "account.login",
                "problem": "missing_required",
                "payload_sections": {
                    "has_account": isinstance(payload.get("account"), dict),
                    "has_top_level_login": payload.get("login") is not None,
                },
                "issues": issues,
            }
            log.error("SYNC rejected | reason=missing_login details=%s", details)
            return sync_error_response("missing_login", details, sync_id=sync_id)

        connector_version = safe_str(payload.get("connector_version"), "unknown")
        sync_timestamp = safe_timestamp(payload.get("timestamp"))
        identity_key = resolve_identity_key(connection_key, login)
        policy = build_connector_policy_response(identity_key)
        existing_receipt = get_processed_sync_receipt(sync_id)
        if existing_receipt:
            log.info(
                "SYNC duplicate | sync_id=%s login=%s original_received_at=%s",
                sync_id,
                login,
                existing_receipt.get("received_at", ""),
            )
            return connector_json_response(
                {
                    "ok": True,
                    "received": True,
                    "sync_id": sync_id,
                    "disposition": "duplicate",
                    "login": login,
                    "policy_hash": existing_receipt.get("policy_hash") or policy["policy_hash"],
                    "reason": "already_processed",
                    "error_code": None,
                    "details": {
                        "account_id": existing_receipt.get("account_id", ""),
                        "received_at": existing_receipt.get("received_at", ""),
                    },
                    "timestamp": now_iso(),
                },
            )

        LAST_SYNC_BY_LOGIN[identity_key] = {
            "received_at": now_iso(),
            "sync_id": sync_id,
            "connection_key": connection_key,
            "mode": safe_str(payload.get("mode"), "unknown"),
            "connector_version": connector_version,
            "timestamp": sync_timestamp,
            "account": sanitized_account,
            "positions_count": len(sanitized_positions),
            "trades_count": len(sanitized_trades),
            "positions": sanitized_positions,
            "trades": sanitized_trades,
            "issues": issues,
            "raw": payload,
        }

        bound_account = account_service.get_account_by_api_key(user_id="local", api_key=connection_key)
        previous_account = bound_account or account_service.get_account_by_identity(
            user_id="local",
            platform="mt5",
            broker=safe_str(sanitized_account.get("broker"), "Unknown broker"),
            server=safe_str(sanitized_account.get("server")),
            login=login,
        )
        effective_trades = merge_trade_sources(sanitized_trades, journal_trades_for_identity(identity_key))
        dashboard_payload = build_dashboard_account_payload(
            sanitized_account,
            sanitized_positions,
            effective_trades,
            payload,
            previous_account.latest_payload if previous_account else None,
        )
        log.info(
            "DASHBOARD payload built | account_id=%s login=%s balance=%.2f equity=%.2f open_pnl=%.2f closed_pnl=%.2f trades=%s history=%s positions=%s",
            previous_account.account_id if previous_account else (bound_account.account_id if bound_account else ""),
            login,
            safe_float(dashboard_payload.get("balance")),
            safe_float(dashboard_payload.get("equity")),
            safe_float(dashboard_payload.get("openPnl")),
            safe_float(dashboard_payload.get("closedPnl")),
            len(dashboard_payload.get("trades") or []),
            len(dashboard_payload.get("history") or []),
            len(dashboard_payload.get("positions") or []),
        )
        synced_account = account_service.link_connector_sync(
            user_id="local",
            account_info={
                **sanitized_account,
                "platform": "mt5",
            },
            payload=dashboard_payload,
            account_id=bound_account.account_id if bound_account else None,
            api_key=connection_key,
            nickname=bound_account.alias if bound_account else None,
        )
        log.info(
            "ACCOUNT sync upsert | account_id=%s login=%s status=%s broker=%s server=%s last_sync_at=%s",
            synced_account.account_id,
            synced_account.login,
            synced_account.status,
            synced_account.broker,
            synced_account.server,
            synced_account.last_sync_at.isoformat() if synced_account.last_sync_at else "",
        )
        log.info(
            "RISK snapshot built | login=%s floating_dd=%.4f peak_to_equity_dd=%.4f open_risk=%.4f",
            login,
            dashboard_payload["riskSnapshot"]["summary"]["floating_drawdown_pct"],
            dashboard_payload["riskSnapshot"]["summary"]["peak_to_equity_drawdown_pct"],
            dashboard_payload["riskSnapshot"]["summary"]["total_open_risk_pct"],
        )

        if issues:
            log.warning(
                "SYNC accepted with issues | sync_id=%s login=%s connector_version=%s issues=%s",
                sync_id,
                login,
                connector_version,
                issues,
            )
        else:
            log.info(
                "SYNC accepted | sync_id=%s login=%s connector_version=%s positions=%s trades=%s",
                sync_id,
                login,
                connector_version,
                len(sanitized_positions),
                len(sanitized_trades),
            )

        remember_processed_sync(
            sync_id,
            login=login,
            account_id=synced_account.account_id,
            policy_hash=policy["policy_hash"],
        )

        return connector_json_response(
            {
                "ok": True,
                "received": True,
                "sync_id": sync_id,
                "disposition": "accepted",
                "login": login,
                "policy_hash": policy["policy_hash"],
                "reason": "accepted",
                "error_code": None,
                "details": {
                    "positions_count": len(sanitized_positions),
                    "trades_count": len(sanitized_trades),
                    "issues": issues,
                    "account_id": synced_account.account_id,
                },
                "timestamp": now_iso(),
            },
        )
    except Exception as exc:  # pragma: no cover
        details = {
            "section": "root",
            "field": "sync_handler",
            "problem": "unexpected_exception",
            "message": str(exc),
            "exception_type": type(exc).__name__,
            "traceback": traceback.format_exc(),
        }
        log.exception("SYNC unexpected failure | details=%s", details)
        return sync_error_response("unexpected_exception", details, sync_id=sync_id)


@app.post("/api/mt5/journal")
async def mt5_journal(request: Request) -> JSONResponse:
    batch_id = ""
    try:
        payload = await request.json()
    except Exception as exc:
        log.exception("JOURNAL invalid JSON payload: %s", exc)
        return connector_json_response(
            {
                "ok": False,
                "received": False,
                "batch_id": batch_id,
                "disposition": "rejected",
                "reason": "invalid_json",
                "error_code": SYNC_ERROR_INVALID_PAYLOAD,
                "details": {"message": str(exc)},
                "timestamp": now_iso(),
            }
        )

    if not isinstance(payload, dict):
        return connector_json_response(
            {
                "ok": False,
                "received": False,
                "batch_id": batch_id,
                "disposition": "rejected",
                "reason": "invalid_payload_shape",
                "error_code": SYNC_ERROR_INVALID_PAYLOAD,
                "details": {"problem": "expected_object"},
                "timestamp": now_iso(),
            }
        )

    batch_id = safe_str(payload.get("batch_id"))
    connection_key = resolve_connection_key(payload, request)
    login = normalize_login(payload)
    identity_key = resolve_identity_key(connection_key, login)
    if not batch_id or not identity_key:
        return connector_json_response(
            {
                "ok": False,
                "received": False,
                "batch_id": batch_id,
                "disposition": "rejected",
                "reason": "missing_identity_or_batch",
                "error_code": SYNC_ERROR_INVALID_PAYLOAD,
                "details": {"batch_id": batch_id, "identity_key": identity_key},
                "timestamp": now_iso(),
            }
        )

    existing_receipt = get_processed_journal_receipt(batch_id)
    if existing_receipt:
        return connector_json_response(
            {
                "ok": True,
                "received": True,
                "batch_id": batch_id,
                "disposition": "duplicate",
                "reason": "already_processed",
                "error_code": None,
                "details": {
                    "trade_count": existing_receipt.get("trade_count", 0),
                    "received_at": existing_receipt.get("received_at", ""),
                },
                "timestamp": now_iso(),
            }
        )

    trades, trade_issues = sanitize_trades(payload.get("trades"))
    remember_journal_trades(identity_key, trades)
    remember_processed_journal(batch_id, identity_key=identity_key, trade_count=len(trades))
    log.info("JOURNAL accepted | batch_id=%s identity=%s trades=%s issues=%s", batch_id, identity_key, len(trades), trade_issues)
    return connector_json_response(
        {
            "ok": True,
            "received": True,
            "batch_id": batch_id,
            "disposition": "accepted",
            "reason": "accepted",
            "error_code": None,
            "details": {
                "trade_count": len(trades),
                "issues": trade_issues,
            },
            "timestamp": now_iso(),
        }
    )


@app.get("/api/mt5/policy")
async def mt5_policy(
    request: Request,
    login: str = Query("", min_length=0),
    connection_key: str = Query("", min_length=0),
) -> JSONResponse:
    normalized_login = safe_str(login)
    normalized_connection_key = safe_str(connection_key) or safe_str(request.headers.get("x-kmfx-connection-key"))
    identity_key = resolve_identity_key(normalized_connection_key, normalized_login)
    if not identity_key:
        return connector_json_response({
            "ok": False,
            "reason": "missing_identity",
            "error_code": 4001,
            "details": {"field": "connection_key|login", "problem": "one identity value is required"},
            "timestamp": now_iso(),
        })

    policy = build_connector_policy_response(identity_key)
    log.info("Policy requested | identity=%s hash=%s", identity_key, policy["policy_hash"])
    return connector_json_response(policy)


@app.get("/api/accounts/snapshot")
async def accounts_snapshot() -> JSONResponse:
    snapshot = account_service.build_accounts_snapshot("local")
    log.info(
        "Accounts snapshot built | accounts=%s active_account_id=%s",
        len(snapshot.get("accounts") or []),
        snapshot.get("active_account_id") or "",
    )
    return connector_json_response(snapshot)


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("kmfx_connector_api:app", host="0.0.0.0", port=port, reload=False)
