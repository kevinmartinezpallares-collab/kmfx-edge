from __future__ import annotations

from typing import Any


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


DEFAULT_HEAT_LIMITS_BY_LEVEL = {
    "PROTECT": 1.0,
    "BASE": 2.0,
    "+1": 3.0,
    "+2": 4.0,
    "+3": 5.0,
}


def build_policy_snapshot(raw_policy: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    current_level = safe_str(raw_policy.get("current_level"), "BASE")
    explicit_heat_limit = raw_policy.get("portfolio_heat_limit_pct")

    if explicit_heat_limit is None or explicit_heat_limit == "":
        portfolio_heat_limit_pct = DEFAULT_HEAT_LIMITS_BY_LEVEL.get(current_level, 2.0)
        warnings.append(
            f"portfolio_heat_limit_pct inferido a {portfolio_heat_limit_pct:.2f}% según current_level={current_level}."
        )
        heat_limit_source = "inferred_from_current_level"
    else:
        portfolio_heat_limit_pct = safe_float(explicit_heat_limit, 0.0)
        heat_limit_source = "policy"

    policy_snapshot = {
        "risk_per_trade_pct": safe_float(raw_policy.get("max_risk_per_trade_pct"), 0.0),
        "daily_dd_limit_pct": safe_float(raw_policy.get("daily_dd_hard_stop"), 0.0),
        "max_dd_limit_pct": safe_float(raw_policy.get("total_dd_hard_stop"), 0.0),
        "portfolio_heat_limit_pct": round(portfolio_heat_limit_pct, 4),
        "portfolio_heat_limit_source": heat_limit_source,
        "profit_target_pct": safe_float(raw_policy.get("profit_target_pct"), 0.0),
        "profit_target_remaining_pct": safe_float(raw_policy.get("profit_target_remaining_pct"), 0.0),
        "max_volume": safe_float(raw_policy.get("max_volume"), 0.0),
        "allowed_sessions": list(raw_policy.get("allowed_sessions") or []),
        "allowed_symbols": list(raw_policy.get("allowed_symbols") or []),
        "auto_block_enabled": bool(raw_policy.get("auto_block")),
        "current_level": current_level,
        "recommended_level": safe_str(raw_policy.get("recommended_level"), current_level),
        "trading_timezone": safe_str(raw_policy.get("trading_timezone"), "UTC"),
    }
    return policy_snapshot, warnings


def _usage_ratio(current: float, limit_value: float) -> float | None:
    if limit_value <= 0:
        return None
    return round((current / limit_value) * 100.0, 2)


def evaluate_risk_policy(risk_snapshot: dict[str, Any], policy: dict[str, Any]) -> dict[str, Any]:
    summary = risk_snapshot.get("summary") if isinstance(risk_snapshot.get("summary"), dict) else {}

    peak_to_equity_drawdown_pct = safe_float(summary.get("peak_to_equity_drawdown_pct"), 0.0)
    daily_drawdown_pct = safe_float(summary.get("daily_drawdown_pct"), 0.0)
    total_open_risk_pct = safe_float(summary.get("total_open_risk_pct"), 0.0)
    max_open_trade_risk_pct = safe_float(summary.get("max_open_trade_risk_pct"), 0.0)

    max_dd_limit_pct = safe_float(policy.get("max_dd_limit_pct"), 0.0)
    daily_dd_limit_pct = safe_float(policy.get("daily_dd_limit_pct"), 0.0)
    heat_limit_pct = safe_float(policy.get("portfolio_heat_limit_pct"), 0.0)
    trade_risk_limit_pct = safe_float(policy.get("risk_per_trade_pct"), 0.0)

    breaches: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []

    def maybe_add_limit(metric_key: str, label: str, current: float, limit_value: float) -> dict[str, Any]:
        usage = _usage_ratio(current, limit_value)
        state = "ok"
        if limit_value > 0 and current >= limit_value:
            state = "breach"
            breaches.append(
                {
                    "code": metric_key.upper() + "_BREACH",
                    "metric": metric_key,
                    "label": label,
                    "current": round(current, 4),
                    "limit": round(limit_value, 4),
                    "usage_ratio_pct": usage,
                    "message": f"{label} {current:.2f}% >= límite {limit_value:.2f}%",
                }
            )
        elif limit_value > 0 and current >= limit_value * 0.8:
            state = "warning"
            warnings.append(
                {
                    "code": metric_key.upper() + "_WARNING",
                    "metric": metric_key,
                    "label": label,
                    "current": round(current, 4),
                    "limit": round(limit_value, 4),
                    "usage_ratio_pct": usage,
                    "message": f"{label} en 80%+ del límite ({current:.2f}% / {limit_value:.2f}%).",
                }
            )
        distance = round(max(0.0, limit_value - current), 4) if limit_value > 0 else None
        return {
            "state": state,
            "current_pct": round(current, 4),
            "limit_pct": round(limit_value, 4),
            "usage_ratio_pct": usage,
            "distance_to_limit_pct": distance,
        }

    limits_status = {
        "max_drawdown": maybe_add_limit("max_drawdown", "Max drawdown", peak_to_equity_drawdown_pct, max_dd_limit_pct),
        "daily_drawdown": maybe_add_limit("daily_drawdown", "Daily drawdown", daily_drawdown_pct, daily_dd_limit_pct),
        "portfolio_heat": maybe_add_limit("portfolio_heat", "Portfolio heat", total_open_risk_pct, heat_limit_pct),
        "risk_per_trade": maybe_add_limit("risk_per_trade", "Risk per trade", max_open_trade_risk_pct, trade_risk_limit_pct),
    }

    return {
        "ok": len(breaches) == 0,
        "breaches": breaches,
        "warnings": warnings,
        "limits_status": limits_status,
    }
