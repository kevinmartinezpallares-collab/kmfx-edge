from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import traceback
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from account_service import AccountService
from account_store import JsonFileAccountStore


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


LAST_SYNC_BY_LOGIN: dict[str, dict[str, Any]] = {}
ACCOUNTS_STATE_PATH = os.path.join(os.path.dirname(__file__), ".kmfx-accounts.json")
account_service = AccountService(JsonFileAccountStore(ACCOUNTS_STATE_PATH))

# 1003 is our sync validation error bucket:
# the request reached the API, but some required structural field was invalid
# or could not be normalized safely enough for ingestion.
SYNC_ERROR_INVALID_PAYLOAD = 1003


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
        connector_mode = safe_str(last_sync.get("mode"))
        if connector_mode:
            policy["enforcement_mode"] = connector_mode

    policy_hash_source = json.dumps(policy, sort_keys=True, ensure_ascii=True).encode("utf-8")
    policy["policy_hash"] = hashlib.sha256(policy_hash_source).hexdigest()[:16]
    return policy


def pct_drop_from_peak(peak_value: float, current_value: float) -> float:
    if peak_value <= 0:
        return 0.0
    return round(max(0.0, ((peak_value - current_value) / peak_value) * 100.0), 4)


def calculate_floating_drawdown_pct(balance: float, equity: float) -> float:
    # Floating drawdown is the live compression of equity versus settled balance.
    return pct_drop_from_peak(balance, equity)


def extract_previous_risk_snapshot(previous_account_payload: dict[str, Any] | None) -> dict[str, Any]:
    if not previous_account_payload or not isinstance(previous_account_payload, dict):
        return {}
    snapshot = previous_account_payload.get("riskSnapshot")
    return snapshot if isinstance(snapshot, dict) else {}


def calculate_rolling_max_drawdown_pct(balance: float, trades: list[dict[str, Any]], equity: float) -> float:
    realized_pnl = sum(
        safe_float(trade.get("profit")) + safe_float(trade.get("commission")) + safe_float(trade.get("swap"))
        for trade in trades
    )
    estimated_start_equity = max(balance - realized_pnl, 0.0)
    running_equity = estimated_start_equity
    rolling_peak_equity = estimated_start_equity
    rolling_max_drawdown_pct = 0.0

    for trade in sorted_by_time(trades):
        running_equity += (
            safe_float(trade.get("profit"))
            + safe_float(trade.get("commission"))
            + safe_float(trade.get("swap"))
        )
        rolling_peak_equity = max(rolling_peak_equity, running_equity)
        rolling_max_drawdown_pct = max(
            rolling_max_drawdown_pct,
            pct_drop_from_peak(rolling_peak_equity, running_equity),
        )

    rolling_peak_equity = max(rolling_peak_equity, equity)
    rolling_max_drawdown_pct = max(
        rolling_max_drawdown_pct,
        pct_drop_from_peak(rolling_peak_equity, equity),
    )
    return round(rolling_max_drawdown_pct, 4)


def position_risk_pct(position: dict[str, Any], balance: float) -> float:
    direct_pct = safe_float(position.get("risk_pct"), -1.0)
    if direct_pct >= 0:
        return round(direct_pct, 4)

    risk_amount = safe_float(position.get("risk_amount"), 0.0)
    if balance > 0 and risk_amount > 0:
        return round((risk_amount / balance) * 100.0, 4)

    return 0.0


def position_risk_amount(position: dict[str, Any], balance: float) -> float:
    direct_amount = safe_float(position.get("risk_amount"), -1.0)
    if direct_amount >= 0:
        return round(direct_amount, 2)

    risk_pct = safe_float(position.get("risk_pct"), 0.0)
    if balance > 0 and risk_pct > 0:
        return round(balance * (risk_pct / 100.0), 2)

    return 0.0


def build_symbol_exposure(positions: list[dict[str, Any]], balance: float) -> list[dict[str, Any]]:
    exposure: dict[str, dict[str, Any]] = {}

    for position in positions:
        symbol = safe_str(position.get("symbol"), "UNKNOWN")
        risk_amount = position_risk_amount(position, balance)
        risk_pct = position_risk_pct(position, balance)
        volume = safe_float(position.get("volume"))
        open_pnl = safe_float(position.get("profit"))
        side = safe_str(position.get("type") or position.get("side"), "BUY").upper()

        bucket = exposure.setdefault(
            symbol,
            {
                "symbol": symbol,
                "positions": 0,
                "net_volume": 0.0,
                "open_pnl": 0.0,
                "risk_amount": 0.0,
                "risk_pct": 0.0,
                "sides": set(),
            },
        )
        bucket["positions"] += 1
        bucket["net_volume"] += volume
        bucket["open_pnl"] += open_pnl
        bucket["risk_amount"] += risk_amount
        bucket["risk_pct"] += risk_pct
        bucket["sides"].add(side)

    rows = []
    for item in exposure.values():
        rows.append(
            {
                "symbol": item["symbol"],
                "positions": item["positions"],
                "net_volume": round(item["net_volume"], 2),
                "open_pnl": round(item["open_pnl"], 2),
                "risk_amount": round(item["risk_amount"], 2),
                "risk_pct": round(item["risk_pct"], 4),
                "direction": "/".join(sorted(item["sides"])) if item["sides"] else "N/A",
            }
        )

    return sorted(rows, key=lambda item: item["risk_amount"], reverse=True)


def build_open_trade_risk(positions: list[dict[str, Any]], balance: float) -> list[dict[str, Any]]:
    rows = []
    for position in positions:
        rows.append(
            {
                "position_id": safe_str(position.get("position_id") or position.get("ticket")),
                "symbol": safe_str(position.get("symbol"), "UNKNOWN"),
                "side": safe_str(position.get("type") or position.get("side"), "BUY").upper(),
                "risk_amount": position_risk_amount(position, balance),
                "risk_pct": position_risk_pct(position, balance),
                "entry_price": safe_float(position.get("price_open")),
                "stop_loss": safe_float(position.get("sl")),
                "open_pnl": safe_float(position.get("profit")),
            }
        )
    return sorted(rows, key=lambda item: item["risk_amount"], reverse=True)


def infer_portfolio_heat_limit_pct(policy: dict[str, Any]) -> tuple[float | None, list[str]]:
    warnings: list[str] = []
    explicit_value = policy.get("portfolio_heat_limit_pct")
    if explicit_value is None or explicit_value == "":
        warnings.append(
            "portfolio_heat_limit_pct no está definido en la policy actual; "
            "distance_to_heat_limit_pct queda sin calcular."
        )
        return None, warnings

    try:
        parsed = float(explicit_value)
    except (TypeError, ValueError):
        warnings.append(
            "portfolio_heat_limit_pct llegó con tipo no numérico; "
            "distance_to_heat_limit_pct queda sin calcular."
        )
        return None, warnings

    if not math.isfinite(parsed) or parsed <= 0:
        warnings.append(
            "portfolio_heat_limit_pct no es un valor positivo finito; "
            "distance_to_heat_limit_pct queda sin calcular."
        )
        return None, warnings

    return round(parsed, 4), warnings


def build_risk_snapshot(
    account: dict[str, Any],
    positions: list[dict[str, Any]],
    trades: list[dict[str, Any]],
    policy: dict[str, Any],
    previous_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    balance = safe_float(account.get("balance"))
    equity = safe_float(account.get("equity"), balance)
    previous_snapshot = previous_snapshot or {}
    previous_metadata = previous_snapshot.get("metadata") if isinstance(previous_snapshot.get("metadata"), dict) else {}
    previous_persisted_peak_equity = safe_float(previous_metadata.get("persisted_peak_equity"), max(balance, equity))
    previous_persisted_max_drawdown_pct = safe_float(previous_metadata.get("persisted_max_drawdown_pct"), 0.0)

    floating_drawdown_pct = calculate_floating_drawdown_pct(balance, equity)
    persisted_peak_equity = round(max(previous_persisted_peak_equity, balance, equity), 2)
    peak_to_equity_drawdown_pct = pct_drop_from_peak(persisted_peak_equity, equity)
    rolling_max_drawdown_pct = calculate_rolling_max_drawdown_pct(balance, trades, equity)
    persisted_max_drawdown_pct = round(max(previous_persisted_max_drawdown_pct, peak_to_equity_drawdown_pct), 4)
    total_open_risk_amount = round(sum(position_risk_amount(position, balance) for position in positions), 2)
    total_open_risk_pct = round(sum(position_risk_pct(position, balance) for position in positions), 4)
    max_open_trade_risk_pct = round(max((position_risk_pct(position, balance) for position in positions), default=0.0), 4)
    max_risk_per_trade_pct = safe_float(policy.get("max_risk_per_trade_pct"), 0.0)
    max_drawdown_limit_pct = safe_float(policy.get("total_dd_hard_stop"), 0.0)
    distance_to_max_dd_limit_pct = round(max(0.0, max_drawdown_limit_pct - peak_to_equity_drawdown_pct), 4)
    portfolio_heat_limit_pct, heat_warnings = infer_portfolio_heat_limit_pct(policy)
    distance_to_heat_limit_pct = (
        round(max(0.0, portfolio_heat_limit_pct - total_open_risk_pct), 4)
        if portfolio_heat_limit_pct is not None
        else None
    )
    symbol_exposure = build_symbol_exposure(positions, balance)
    open_trade_risks = build_open_trade_risk(positions, balance)
    warnings = list(heat_warnings)
    if not trades:
        warnings.append("rolling_max_drawdown_pct usa una ventana vacía de trades; el valor refleja solo el estado live actual.")

    return {
        "summary": {
            "floating_drawdown_pct": floating_drawdown_pct,
            "peak_to_equity_drawdown_pct": peak_to_equity_drawdown_pct,
            "rolling_max_drawdown_pct": rolling_max_drawdown_pct,
            "persisted_max_drawdown_pct": persisted_max_drawdown_pct,
            "max_drawdown_limit_pct": max_drawdown_limit_pct,
            "distance_to_max_dd_limit_pct": distance_to_max_dd_limit_pct,
            "total_open_risk_amount": total_open_risk_amount,
            "total_open_risk_pct": total_open_risk_pct,
            "max_risk_per_trade_pct": max_risk_per_trade_pct,
            "max_open_trade_risk_pct": max_open_trade_risk_pct,
            "open_positions_count": len(positions),
            "portfolio_heat_limit_pct": portfolio_heat_limit_pct,
            "distance_to_heat_limit_pct": distance_to_heat_limit_pct,
        },
        "policy": {
            "risk_per_trade_pct": max_risk_per_trade_pct,
            "daily_dd_limit_pct": safe_float(policy.get("daily_dd_hard_stop"), 0.0),
            "max_dd_limit_pct": max_drawdown_limit_pct,
            "portfolio_heat_limit_pct": portfolio_heat_limit_pct,
            "max_volume": safe_float(policy.get("max_volume"), 0.0),
            "allowed_sessions": list(policy.get("allowed_sessions") or []),
            "allowed_symbols": list(policy.get("allowed_symbols") or []),
            "auto_block_enabled": bool(policy.get("auto_block")),
            "current_level": safe_str(policy.get("current_level")),
            "recommended_level": safe_str(policy.get("recommended_level")),
        },
        "status": {
            "risk_status": safe_str(policy.get("risk_status"), "active_monitoring"),
            "severity": safe_str(policy.get("severity"), "info"),
            "reason_code": safe_str(policy.get("reason_code"), "OK"),
            "blocking_rule": safe_str(policy.get("blocking_rule")),
            "action_required": safe_str(policy.get("action_required")),
        },
        "symbol_exposure": symbol_exposure,
        "open_trade_risks": open_trade_risks,
        "metadata": {
            "generated_at": now_iso(),
            "snapshot_version": "2.0.0",
            "calculation_mode": "connector_sync_institutional_lite",
            "drawdown_basis": {
                "floating_drawdown_pct": "balance_to_equity_live",
                "peak_to_equity_drawdown_pct": "persisted_peak_equity_to_current_equity",
                "rolling_max_drawdown_pct": "recent_trades_window_plus_live_equity",
                "persisted_max_drawdown_pct": "persisted_peak_to_equity_high_water_mark",
            },
            "warnings": warnings,
            "persisted_peak_equity": persisted_peak_equity,
            "persisted_max_drawdown_pct": persisted_max_drawdown_pct,
            "rolling_trades_window_size": len(trades),
            "assumptions": [
                "total_open_risk_pct depende de risk_amount/risk_pct enviados por el connector.",
                "rolling_max_drawdown_pct no representa histórico absoluto si la ventana de trades es parcial.",
            ],
        },
    }


def build_dashboard_account_payload(
    account: dict[str, Any],
    positions: list[dict[str, Any]],
    trades: list[dict[str, Any]],
    raw_payload: dict[str, Any],
    previous_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    policy = build_policy(safe_str(account.get("login")))
    risk_snapshot = build_risk_snapshot(account, positions, trades, policy, extract_previous_risk_snapshot(previous_payload))
    summary = risk_snapshot["summary"]
    policy_snapshot = risk_snapshot["policy"]
    status_snapshot = risk_snapshot["status"]
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
        "positions": positions,
        "trades": trades,
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


def sync_error_response(reason: str, details: Any, http_status: int = 200) -> JSONResponse:
    return JSONResponse(
        status_code=http_status,
        content={
            "ok": False,
            "received": False,
            "reason": reason,
            "error_code": SYNC_ERROR_INVALID_PAYLOAD,
            "details": details,
            "timestamp": now_iso(),
        },
    )


@app.get("/")
async def healthcheck() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "kmfx_connector_api",
        "timestamp": now_iso(),
    }


@app.post("/api/mt5/sync")
async def mt5_sync(request: Request) -> JSONResponse:
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
            return sync_error_response("missing_login", details)

        connector_version = safe_str(payload.get("connector_version"), "unknown")
        sync_timestamp = safe_timestamp(payload.get("timestamp"))

        LAST_SYNC_BY_LOGIN[login] = {
            "received_at": now_iso(),
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

        previous_account = account_service.get_account_by_identity(
            user_id="local",
            platform="mt5",
            broker=safe_str(sanitized_account.get("broker"), "Unknown broker"),
            server=safe_str(sanitized_account.get("server")),
            login=login,
        )
        dashboard_payload = build_dashboard_account_payload(
            sanitized_account,
            sanitized_positions,
            sanitized_trades,
            payload,
            previous_account.latest_payload if previous_account else None,
        )
        synced_account = account_service.link_connector_sync(
            user_id="local",
            account_info={
                **sanitized_account,
                "platform": "mt5",
            },
            payload=dashboard_payload,
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

        policy = build_policy(login)
        if issues:
            log.warning(
                "SYNC accepted with issues | login=%s connector_version=%s issues=%s",
                login,
                connector_version,
                issues,
            )
        else:
            log.info(
                "SYNC accepted | login=%s connector_version=%s positions=%s trades=%s",
                login,
                connector_version,
                len(sanitized_positions),
                len(sanitized_trades),
            )

        return JSONResponse(
            status_code=200,
            content={
                "ok": True,
                "received": True,
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
        return sync_error_response("unexpected_exception", details)


@app.get("/api/mt5/policy")
async def mt5_policy(login: str = Query(..., min_length=1)) -> dict[str, Any]:
    normalized_login = safe_str(login)
    if not normalized_login:
        return {
            "ok": False,
            "reason": "missing_login",
            "error_code": 4001,
            "details": {"field": "login", "problem": "login query param is required"},
            "timestamp": now_iso(),
        }

    policy = build_policy(normalized_login)
    log.info("Policy requested | login=%s hash=%s", normalized_login, policy["policy_hash"])
    return policy


@app.get("/api/accounts/snapshot")
async def accounts_snapshot() -> dict[str, Any]:
    snapshot = account_service.build_accounts_snapshot("local")
    log.info(
        "Accounts snapshot built | accounts=%s active_account_id=%s",
        len(snapshot.get("accounts") or []),
        snapshot.get("active_account_id") or "",
    )
    return snapshot
