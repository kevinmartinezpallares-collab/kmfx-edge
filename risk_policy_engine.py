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


CONFIGURED_POLICY_SOURCES = {"user", "funding", "account", "backend_config", "policy", "configured"}
REFERENCE_POLICY_SOURCES = {"default", "reference_default", "inferred", "inferred_from_current_level", "not_configured"}


def _policy_sources(raw_policy: dict[str, Any]) -> dict[str, str]:
    raw_sources = raw_policy.get("policy_sources")
    if not isinstance(raw_sources, dict):
        raw_sources = {}
    return {safe_str(key): safe_str(value).lower() for key, value in raw_sources.items()}


def _source_for_limit(raw_policy: dict[str, Any], canonical_key: str, raw_key: str, *, fallback: str) -> str:
    sources = _policy_sources(raw_policy)
    return (
        safe_str(raw_policy.get(f"{raw_key}_source")).lower()
        or safe_str(raw_policy.get(f"{canonical_key}_source")).lower()
        or sources.get(raw_key)
        or sources.get(canonical_key)
        or fallback
    )


def _is_configured_source(source: str) -> bool:
    normalized = safe_str(source).lower()
    if not normalized:
        return False
    if normalized in REFERENCE_POLICY_SOURCES:
        return False
    return normalized in CONFIGURED_POLICY_SOURCES


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
        heat_limit_source = _source_for_limit(
            raw_policy,
            "portfolio_heat_limit_pct",
            "portfolio_heat_limit_pct",
            fallback="policy",
        )

    risk_per_trade_source = _source_for_limit(
        raw_policy,
        "risk_per_trade_pct",
        "max_risk_per_trade_pct",
        fallback="policy" if raw_policy.get("max_risk_per_trade_pct") not in (None, "") else "not_configured",
    )
    daily_dd_source = _source_for_limit(
        raw_policy,
        "daily_dd_limit_pct",
        "daily_dd_hard_stop",
        fallback="policy" if raw_policy.get("daily_dd_hard_stop") not in (None, "") else "not_configured",
    )
    max_dd_source = _source_for_limit(
        raw_policy,
        "max_dd_limit_pct",
        "total_dd_hard_stop",
        fallback="policy" if raw_policy.get("total_dd_hard_stop") not in (None, "") else "not_configured",
    )

    policy_snapshot = {
        "risk_per_trade_pct": safe_float(raw_policy.get("max_risk_per_trade_pct"), 0.0),
        "daily_dd_limit_pct": safe_float(raw_policy.get("daily_dd_hard_stop"), 0.0),
        "max_dd_limit_pct": safe_float(raw_policy.get("total_dd_hard_stop"), 0.0),
        "portfolio_heat_limit_pct": round(portfolio_heat_limit_pct, 4),
        "risk_per_trade_pct_source": risk_per_trade_source,
        "daily_dd_limit_pct_source": daily_dd_source,
        "max_dd_limit_pct_source": max_dd_source,
        "portfolio_heat_limit_source": heat_limit_source,
        "policy_sources": {
            "risk_per_trade": risk_per_trade_source,
            "daily_drawdown": daily_dd_source,
            "max_drawdown": max_dd_source,
            "portfolio_heat": heat_limit_source,
        },
        "configured_limits": {
            "risk_per_trade": _is_configured_source(risk_per_trade_source),
            "daily_drawdown": _is_configured_source(daily_dd_source),
            "max_drawdown": _is_configured_source(max_dd_source),
            "portfolio_heat": _is_configured_source(heat_limit_source),
        },
        "reference_assumptions": {
            "risk_per_trade": not _is_configured_source(risk_per_trade_source),
            "daily_drawdown": not _is_configured_source(daily_dd_source),
            "max_drawdown": not _is_configured_source(max_dd_source),
            "portfolio_heat": not _is_configured_source(heat_limit_source),
        },
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

    configured_limits = policy.get("configured_limits") if isinstance(policy.get("configured_limits"), dict) else {}
    policy_sources = policy.get("policy_sources") if isinstance(policy.get("policy_sources"), dict) else {}

    def maybe_add_limit(metric_key: str, label: str, current: float, limit_value: float) -> dict[str, Any]:
        source = safe_str(policy_sources.get(metric_key) or "not_configured")
        is_configured = bool(configured_limits.get(metric_key)) and _is_configured_source(source)
        usage = _usage_ratio(current, limit_value)
        state = "ok" if is_configured else "reference"
        if is_configured and limit_value > 0 and current >= limit_value:
            state = "breach"
            breaches.append(
                {
                    "code": metric_key.upper() + "_BREACH",
                    "metric": metric_key,
                    "label": label,
                    "current": round(current, 4),
                    "limit": round(limit_value, 4),
                    "source": source,
                    "usage_ratio_pct": usage,
                    "message": f"{label} {current:.2f}% >= límite {limit_value:.2f}%",
                }
            )
        elif is_configured and limit_value > 0 and current >= limit_value * 0.8:
            state = "warning"
            warnings.append(
                {
                    "code": metric_key.upper() + "_WARNING",
                    "metric": metric_key,
                    "label": label,
                    "current": round(current, 4),
                    "limit": round(limit_value, 4),
                    "source": source,
                    "usage_ratio_pct": usage,
                    "message": f"{label} en 80%+ del límite ({current:.2f}% / {limit_value:.2f}%).",
                }
            )
        distance = round(max(0.0, limit_value - current), 4) if limit_value > 0 else None
        return {
            "state": state,
            "current_pct": round(current, 4),
            "limit_pct": round(limit_value, 4),
            "source": source,
            "is_configured": is_configured,
            "is_reference": not is_configured,
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
