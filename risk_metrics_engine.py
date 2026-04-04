from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo


def now_utc_iso() -> str:
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
    return text or now_utc_iso()


def parse_iso_datetime(value: Any) -> datetime:
    text = safe_timestamp(value).replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return datetime.now(timezone.utc)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def sorted_by_time(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(items, key=lambda item: safe_timestamp(item.get("time")))


def pct_drop_from_peak(peak_value: float, current_value: float) -> float:
    if peak_value <= 0:
        return 0.0
    return round(max(0.0, ((peak_value - current_value) / peak_value) * 100.0), 4)


def calculate_floating_drawdown_pct(balance: float, equity: float) -> float:
    return pct_drop_from_peak(balance, equity)


def resolve_timezone(timezone_name: str) -> tuple[timezone | ZoneInfo, list[str]]:
    warnings: list[str] = []
    normalized = safe_str(timezone_name, "UTC") or "UTC"
    try:
        return ZoneInfo(normalized), warnings
    except Exception:
        warnings.append(f"Timezone '{normalized}' no válida; usando UTC.")
        return timezone.utc, warnings


def trading_day_key(timestamp_value: Any, timezone_name: str) -> tuple[str, list[str]]:
    tz, warnings = resolve_timezone(timezone_name)
    dt = parse_iso_datetime(timestamp_value).astimezone(tz)
    return dt.strftime("%Y-%m-%d"), warnings


def extract_previous_risk_snapshot(previous_account_payload: dict[str, Any] | None) -> dict[str, Any]:
    if not previous_account_payload or not isinstance(previous_account_payload, dict):
        return {}
    snapshot = previous_account_payload.get("riskSnapshot")
    return snapshot if isinstance(snapshot, dict) else {}


def extract_previous_metadata(previous_snapshot: dict[str, Any] | None) -> dict[str, Any]:
    previous_snapshot = previous_snapshot or {}
    metadata = previous_snapshot.get("metadata")
    return metadata if isinstance(metadata, dict) else {}


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


def build_open_trade_risks(positions: list[dict[str, Any]], balance: float) -> list[dict[str, Any]]:
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


def compute_daily_context(
    *,
    current_equity: float,
    current_balance: float,
    as_of: str,
    timezone_name: str,
    previous_metadata: dict[str, Any],
) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    current_day_key, tz_warnings = trading_day_key(as_of, timezone_name)
    warnings.extend(tz_warnings)

    previous_day_key = safe_str(previous_metadata.get("daily_trading_day"), "")
    previous_daily_peak_equity = safe_float(previous_metadata.get("daily_peak_equity"), current_equity)
    previous_daily_start_equity = safe_float(previous_metadata.get("daily_start_equity"), current_equity)
    previous_daily_start_balance = safe_float(previous_metadata.get("daily_start_balance"), current_balance)
    previous_daily_reset_timestamp = safe_str(previous_metadata.get("daily_reset_timestamp"), as_of)

    if previous_day_key != current_day_key:
        daily_start_equity = current_equity
        daily_start_balance = current_balance
        daily_peak_equity = current_equity
        daily_reset_timestamp = as_of
    else:
        daily_start_equity = previous_daily_start_equity
        daily_start_balance = previous_daily_start_balance
        daily_peak_equity = max(previous_daily_peak_equity, current_equity)
        daily_reset_timestamp = previous_daily_reset_timestamp

    daily_drawdown_pct = pct_drop_from_peak(daily_peak_equity, current_equity)
    return {
        "daily_trading_day": current_day_key,
        "daily_start_equity": round(daily_start_equity, 2),
        "daily_start_balance": round(daily_start_balance, 2),
        "daily_peak_equity": round(daily_peak_equity, 2),
        "daily_reset_timestamp": daily_reset_timestamp,
        "daily_drawdown_pct": daily_drawdown_pct,
    }, warnings


def build_risk_metrics(
    *,
    account: dict[str, Any],
    positions: list[dict[str, Any]],
    trades: list[dict[str, Any]],
    previous_snapshot: dict[str, Any] | None = None,
    trading_timezone: str = "UTC",
) -> dict[str, Any]:
    balance = safe_float(account.get("balance"))
    equity = safe_float(account.get("equity"), balance)
    as_of = safe_timestamp(account.get("timestamp"))

    previous_metadata = extract_previous_metadata(previous_snapshot)
    previous_persisted_peak_equity = safe_float(previous_metadata.get("persisted_peak_equity"), max(balance, equity))
    previous_persisted_max_drawdown_pct = safe_float(previous_metadata.get("persisted_max_drawdown_pct"), 0.0)

    daily_context, warnings = compute_daily_context(
        current_equity=equity,
        current_balance=balance,
        as_of=as_of,
        timezone_name=trading_timezone,
        previous_metadata=previous_metadata,
    )

    floating_drawdown_pct = calculate_floating_drawdown_pct(balance, equity)
    persisted_peak_equity = round(max(previous_persisted_peak_equity, balance, equity), 2)
    peak_to_equity_drawdown_pct = pct_drop_from_peak(persisted_peak_equity, equity)
    rolling_max_drawdown_pct = calculate_rolling_max_drawdown_pct(balance, trades, equity)
    persisted_max_drawdown_pct = round(max(previous_persisted_max_drawdown_pct, peak_to_equity_drawdown_pct), 4)
    total_open_risk_amount = round(sum(position_risk_amount(position, balance) for position in positions), 2)
    total_open_risk_pct = round(sum(position_risk_pct(position, balance) for position in positions), 4)
    max_open_trade_risk_pct = round(max((position_risk_pct(position, balance) for position in positions), default=0.0), 4)

    symbol_exposure = build_symbol_exposure(positions, balance)
    open_trade_risks = build_open_trade_risks(positions, balance)

    if not trades:
        warnings.append("rolling_max_drawdown_pct usa una ventana vacía de trades; el valor refleja solo el estado live actual.")

    return {
        "summary": {
            "floating_drawdown_pct": floating_drawdown_pct,
            "peak_to_equity_drawdown_pct": peak_to_equity_drawdown_pct,
            "rolling_max_drawdown_pct": rolling_max_drawdown_pct,
            "persisted_max_drawdown_pct": persisted_max_drawdown_pct,
            "total_open_risk_amount": total_open_risk_amount,
            "total_open_risk_pct": total_open_risk_pct,
            "max_open_trade_risk_pct": max_open_trade_risk_pct,
            "open_positions_count": len(positions),
            "daily_drawdown_pct": daily_context["daily_drawdown_pct"],
            "daily_peak_equity": daily_context["daily_peak_equity"],
        },
        "symbol_exposure": symbol_exposure,
        "open_trade_risks": open_trade_risks,
        "metadata": {
            "generated_at": as_of,
            "snapshot_version": "3.0.0",
            "calculation_mode": "institutional_metrics_engine",
            "drawdown_basis": {
                "floating_drawdown_pct": "balance_to_equity_live",
                "peak_to_equity_drawdown_pct": "persisted_peak_equity_to_current_equity",
                "rolling_max_drawdown_pct": "recent_trades_window_plus_live_equity",
                "persisted_max_drawdown_pct": "persisted_peak_to_equity_high_water_mark",
                "daily_drawdown_pct": "daily_peak_equity_to_current_equity",
            },
            "warnings": warnings,
            "persisted_peak_equity": persisted_peak_equity,
            "persisted_max_drawdown_pct": persisted_max_drawdown_pct,
            "rolling_trades_window_size": len(trades),
            "trading_timezone": trading_timezone,
            **daily_context,
            "assumptions": [
                "total_open_risk_pct depende de risk_amount/risk_pct enviados por el connector.",
                "rolling_max_drawdown_pct no representa histórico absoluto si la ventana de trades es parcial.",
            ],
        },
    }


def aggregate_portfolio_risk(accounts: list[dict[str, Any]]) -> dict[str, Any]:
    summaries = []
    for account in accounts:
        payload = account.get("dashboard_payload") if isinstance(account, dict) else {}
        snapshot = payload.get("riskSnapshot") if isinstance(payload, dict) else {}
        summary = snapshot.get("summary") if isinstance(snapshot, dict) else {}
        if isinstance(summary, dict):
            summaries.append(summary)

    combined_open_risk_pct = round(sum(safe_float(item.get("total_open_risk_pct")) for item in summaries), 4)
    combined_open_risk_amount = round(sum(safe_float(item.get("total_open_risk_amount")) for item in summaries), 2)
    combined_peak_to_equity_drawdown_pct = round(
        max((safe_float(item.get("peak_to_equity_drawdown_pct")) for item in summaries), default=0.0),
        4,
    )

    return {
        "accounts_count": len(summaries),
        "combined_open_risk_pct": combined_open_risk_pct,
        "combined_open_risk_amount": combined_open_risk_amount,
        "combined_peak_to_equity_drawdown_pct": combined_peak_to_equity_drawdown_pct,
    }
