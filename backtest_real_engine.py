"""
Motor Backtest vs Real manual-ready.

Acepta metricas de backtest registradas manualmente o importadas en el futuro,
las compara contra trades reales y devuelve diagnostico accionable sin tocar UI.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Optional, Sequence


METRIC_DIRECTIONS = {
    "profit_factor": "higher",
    "expectancy_amount": "higher",
    "expectancy_r": "higher",
    "win_rate_pct": "higher",
    "sharpe_ratio": "higher",
    "max_drawdown_pct": "lower",
    "trade_count": "context",
}


def safe_str(value: Any, default: str = "") -> str:
    if value is None:
        return default
    try:
        text = str(value).strip()
    except Exception:
        return default
    return text or default


def safe_float(value: Any, default: float = 0.0) -> float:
    if value is None or value == "":
        return default
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(number):
        return default
    return number


def round_optional(value: Optional[float], digits: int = 4) -> Optional[float]:
    if value is None or not math.isfinite(value):
        return None
    return round(value, digits)


def read_first(data: dict[str, Any], keys: Sequence[str], default: Any = None) -> Any:
    for key in keys:
        if key in data and data.get(key) not in (None, ""):
            return data.get(key)
    return default


def trade_net_pnl(trade: dict[str, Any]) -> float:
    if any(key in trade for key in ("profit", "commission", "swap")):
        return round(
            safe_float(trade.get("profit"))
            + safe_float(trade.get("commission"))
            + safe_float(trade.get("swap")),
            2,
        )
    for key in ("net", "pnl", "net_pnl", "result"):
        if key in trade:
            return round(safe_float(trade.get(key)), 2)
    return 0.0


def trade_timestamp(trade: dict[str, Any]) -> str:
    for key in ("time", "close_time", "closeTime", "date", "when", "open_time", "openTime"):
        value = safe_str(trade.get(key))
        if value:
            return value
    return ""


def parse_hour(value: Any) -> str:
    text = safe_str(value)
    if not text:
        return "Sin hora"
    normalized = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return "Sin hora"
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return f"{parsed.hour:02d}:00"


def trade_key(trade: dict[str, Any], dimension: str) -> str:
    if dimension == "symbol":
        return safe_str(trade.get("symbol"), "UNKNOWN")
    if dimension == "session":
        return safe_str(trade.get("session") or trade.get("trade_session"), "Sin sesion")
    if dimension == "direction":
        return safe_str(trade.get("direction") or trade.get("type") or trade.get("side"), "N/A").upper()
    if dimension == "hour":
        return parse_hour(trade_timestamp(trade))
    if dimension == "strategy":
        return strategy_key_from_trade(trade)
    return "Sin dato"


def strategy_key_from_trade(trade: dict[str, Any]) -> str:
    return safe_str(
        trade.get("strategy_tag")
        or trade.get("strategyTag")
        or trade.get("setup")
        or trade.get("setup_name")
        or trade.get("magic")
        or trade.get("comment"),
        "Sin estrategia",
    )


def strategy_key_from_backtest(backtest: dict[str, Any]) -> str:
    return safe_str(
        backtest.get("strategy")
        or backtest.get("strategy_tag")
        or backtest.get("strategyTag")
        or backtest.get("setup")
        or backtest.get("name")
        or backtest.get("id"),
        "Sin estrategia",
    )


def extract_r_multiple(trade: dict[str, Any], net_pnl: float) -> Optional[float]:
    for key in ("r_multiple", "rMultiple", "result_r", "resultR", "r"):
        if key in trade:
            return safe_float(trade.get(key), 0.0)
    for key in ("risk_amount", "initial_risk_amount", "planned_risk_amount"):
        risk_amount = safe_float(trade.get(key))
        if risk_amount > 0:
            return net_pnl / risk_amount
    return None


def calculate_max_drawdown_pct(pnls: Sequence[float], starting_equity: float) -> float:
    equity = max(float(starting_equity or 0.0), 0.0)
    if equity <= 0:
        return 0.0
    peak = equity
    max_drawdown = 0.0
    for pnl in pnls:
        equity += pnl
        peak = max(peak, equity)
        if peak > 0:
            max_drawdown = max(max_drawdown, ((peak - equity) / peak) * 100.0)
    return round(max_drawdown, 4)


def calculate_sharpe(values: Sequence[float]) -> Optional[float]:
    numbers = [safe_float(value) for value in values if math.isfinite(safe_float(value))]
    if len(numbers) < 2:
        return None
    mean = sum(numbers) / len(numbers)
    variance = sum((value - mean) ** 2 for value in numbers) / len(numbers)
    volatility = math.sqrt(variance)
    if volatility <= 0:
        return None
    return round(mean / volatility, 4)


def calculate_trade_metrics(trades: Sequence[dict[str, Any]], *, starting_equity: float = 100_000.0) -> dict[str, Any]:
    pnls = [trade_net_pnl(trade) for trade in trades]
    wins = [pnl for pnl in pnls if pnl > 0]
    losses = [pnl for pnl in pnls if pnl < 0]
    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))
    trade_count = len(pnls)
    r_values = [
        value
        for trade, pnl in zip(trades, pnls)
        for value in [extract_r_multiple(trade, pnl)]
        if value is not None
    ]
    returns_pct = [
        (pnl / starting_equity) * 100.0
        for pnl in pnls
        if starting_equity > 0
    ]
    return {
        "trade_count": trade_count,
        "net_pnl": round(sum(pnls), 2),
        "gross_profit": round(gross_profit, 2),
        "gross_loss": round(gross_loss, 2),
        "win_rate_pct": round((len(wins) / trade_count) * 100.0, 4) if trade_count else 0.0,
        "profit_factor": round(gross_profit / gross_loss, 4) if gross_loss > 0 else (round(gross_profit, 4) if gross_profit > 0 else None),
        "expectancy_amount": round((sum(pnls) / trade_count), 2) if trade_count else 0.0,
        "expectancy_r": round((sum(r_values) / len(r_values)), 4) if r_values else None,
        "max_drawdown_pct": calculate_max_drawdown_pct(pnls, starting_equity),
        "sharpe_ratio": calculate_sharpe(returns_pct),
        "average_slippage": average_optional(trades, ("slippage", "slippage_points", "slippage_pips")),
        "average_spread": average_optional(trades, ("spread", "spread_points", "spread_pips")),
        "commission_per_trade": average_optional(trades, ("commission", "commission_amount")),
    }


def average_optional(rows: Sequence[dict[str, Any]], keys: Sequence[str]) -> Optional[float]:
    values: list[float] = []
    for row in rows:
        for key in keys:
            if key in row and row.get(key) not in (None, ""):
                values.append(safe_float(row.get(key)))
                break
    if not values:
        return None
    return round(sum(values) / len(values), 4)


def normalize_metric_payload(payload: dict[str, Any]) -> dict[str, Any]:
    source = payload.get("metrics") if isinstance(payload.get("metrics"), dict) else payload
    normalized = {
        "trade_count": int(safe_float(read_first(source, ("trade_count", "trades", "total_trades", "sample_size"), 0))),
        "profit_factor": round_optional(safe_float(read_first(source, ("profit_factor", "profitFactor", "pf"), 0.0)), 4),
        "expectancy_amount": round_optional(safe_float(read_first(source, ("expectancy_amount", "expectancy", "avg_trade", "average_trade"), 0.0)), 4),
        "expectancy_r": None,
        "win_rate_pct": round_optional(safe_float(read_first(source, ("win_rate_pct", "winRate", "win_rate"), 0.0)), 4),
        "max_drawdown_pct": round_optional(safe_float(read_first(source, ("max_drawdown_pct", "drawdown_pct", "maxDD", "max_dd_pct"), 0.0)), 4),
        "sharpe_ratio": None,
        "average_slippage": round_optional(safe_float(read_first(source, ("average_slippage", "avg_slippage", "slippage"), 0.0)), 4),
        "average_spread": round_optional(safe_float(read_first(source, ("average_spread", "avg_spread", "spread"), 0.0)), 4),
        "commission_per_trade": round_optional(safe_float(read_first(source, ("commission_per_trade", "avg_commission", "commission"), 0.0)), 4),
    }
    expectancy_r = read_first(source, ("expectancy_r", "expectancyR", "avg_r", "average_r"), None)
    if expectancy_r not in (None, ""):
        normalized["expectancy_r"] = round_optional(safe_float(expectancy_r), 4)
    sharpe = read_first(source, ("sharpe_ratio", "sharpe", "sharpeRatio"), None)
    if sharpe not in (None, ""):
        normalized["sharpe_ratio"] = round_optional(safe_float(sharpe), 4)
    return normalized


def compare_metric(metric: str, backtest_value: Any, real_value: Any) -> dict[str, Any]:
    backtest = None if backtest_value is None else safe_float(backtest_value)
    real = None if real_value is None else safe_float(real_value)
    if backtest is None or real is None:
        return {
            "metric": metric,
            "backtest": backtest,
            "real": real,
            "delta": None,
            "delta_pct": None,
            "state": "missing",
            "direction": METRIC_DIRECTIONS.get(metric, "context"),
        }

    delta = real - backtest
    delta_pct = (delta / abs(backtest)) * 100.0 if abs(backtest) > 1e-9 else None
    direction = METRIC_DIRECTIONS.get(metric, "context")
    state = "neutral"
    if direction == "higher":
        if delta_pct is not None and delta_pct <= -20.0:
            state = "degraded"
        elif delta_pct is not None and delta_pct >= 15.0:
            state = "improved"
        else:
            state = "in_range"
    elif direction == "lower":
        if delta_pct is not None and delta_pct >= 25.0:
            state = "degraded"
        elif delta_pct is not None and delta_pct <= -15.0:
            state = "improved"
        else:
            state = "in_range"
    return {
        "metric": metric,
        "backtest": round(backtest, 4),
        "real": round(real, 4),
        "delta": round(delta, 4),
        "delta_pct": round_optional(delta_pct, 4),
        "state": state,
        "direction": direction,
    }


def compare_metric_set(backtest_metrics: dict[str, Any], real_metrics: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        compare_metric(metric, backtest_metrics.get(metric), real_metrics.get(metric))
        for metric in (
            "trade_count",
            "profit_factor",
            "expectancy_amount",
            "expectancy_r",
            "win_rate_pct",
            "max_drawdown_pct",
            "sharpe_ratio",
        )
    ]


def group_real_trades(trades: Sequence[dict[str, Any]], dimension: str) -> dict[str, list[dict[str, Any]]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for trade in trades:
        groups.setdefault(trade_key(trade, dimension), []).append(trade)
    return groups


def normalize_backtest_breakdown(backtest: dict[str, Any], dimension: str) -> dict[str, dict[str, Any]]:
    breakdowns = backtest.get("breakdowns") if isinstance(backtest.get("breakdowns"), dict) else {}
    candidates = breakdowns.get(dimension) or backtest.get(f"{dimension}_breakdown") or backtest.get(dimension)
    if not candidates:
        return {}
    if isinstance(candidates, dict):
        return {
            safe_str(key): normalize_metric_payload(value if isinstance(value, dict) else {"expectancy_amount": value})
            for key, value in candidates.items()
        }
    if isinstance(candidates, list):
        result: dict[str, dict[str, Any]] = {}
        for item in candidates:
            if not isinstance(item, dict):
                continue
            key = safe_str(item.get("key") or item.get("name") or item.get(dimension))
            if key:
                result[key] = normalize_metric_payload(item)
        return result
    return {}


def compare_dimension(
    backtest: dict[str, Any],
    real_trades: Sequence[dict[str, Any]],
    dimension: str,
    *,
    starting_equity: float,
) -> list[dict[str, Any]]:
    backtest_groups = normalize_backtest_breakdown(backtest, dimension)
    real_groups = {
        key: calculate_trade_metrics(group_trades, starting_equity=starting_equity)
        for key, group_trades in group_real_trades(real_trades, dimension).items()
    }
    keys = sorted(set(backtest_groups) | set(real_groups))
    rows: list[dict[str, Any]] = []
    for key in keys:
        bt_metrics = backtest_groups.get(key, {})
        real_metrics = real_groups.get(key, {})
        comparisons = compare_metric_set(bt_metrics, real_metrics)
        degraded_count = sum(1 for item in comparisons if item["state"] == "degraded")
        rows.append({
            "key": key,
            "dimension": dimension,
            "backtest": bt_metrics,
            "real": real_metrics,
            "comparisons": comparisons,
            "degradation_score": degraded_count,
            "state": (
                "missing_in_backtest" if key not in backtest_groups
                else "missing_in_real" if key not in real_groups
                else "degraded" if degraded_count >= 2
                else "watch" if degraded_count == 1
                else "in_range"
            ),
        })
    return sorted(rows, key=lambda item: (item["degradation_score"], abs(safe_float(item["real"].get("net_pnl")))), reverse=True)


def build_cost_comparison(backtest_metrics: dict[str, Any], real_metrics: dict[str, Any]) -> dict[str, Any]:
    rows = []
    for metric in ("average_slippage", "average_spread", "commission_per_trade"):
        rows.append(compare_metric(metric, backtest_metrics.get(metric), real_metrics.get(metric)))
    extra_cost_flags = [
        item for item in rows
        if item["delta"] is not None and item["delta"] > 0
    ]
    return {
        "comparisons": rows,
        "has_extra_cost": bool(extra_cost_flags),
        "dashboard_text": (
            "Costes reales por encima del backtest; revisar slippage, spread y comisiones."
            if extra_cost_flags
            else "Sin evidencia de coste real superior al backtest."
        ),
    }


def diagnose_strategy(
    *,
    backtest_metrics: dict[str, Any],
    real_metrics: dict[str, Any],
    metric_comparisons: Sequence[dict[str, Any]],
    dimension_breakdown: dict[str, list[dict[str, Any]]],
    min_real_trades: int,
    min_backtest_trades: int,
) -> tuple[str, list[str], str]:
    backtest_count = int(safe_float(backtest_metrics.get("trade_count")))
    real_count = int(safe_float(real_metrics.get("trade_count")))
    degraded = [item for item in metric_comparisons if item["state"] == "degraded"]
    improved = [item for item in metric_comparisons if item["state"] == "improved"]
    worst_dimension = None
    for dimension, rows in dimension_breakdown.items():
        candidate = next((row for row in rows if row["state"] == "degraded"), None)
        if candidate is not None:
            worst_dimension = (dimension, candidate["key"])
            break

    actions: list[str] = []
    if backtest_count and backtest_count < min_backtest_trades:
        actions.append("No asignar capital por este backtest hasta ampliar muestra o validar dataset.")
        return "backtest_not_reliable", actions, "Backtest con muestra insuficiente para comparar edge."
    if real_count < min_real_trades:
        actions.append("Mantener estrategia en testing y ampliar muestra real antes de decidir.")
        return "sample_insufficient", actions, "Muestra real insuficiente frente al umbral configurado."
    if len(degraded) >= 2:
        actions.append("Reducir sizing o pausar incremento de capital hasta revisar causa de degradacion.")
        if worst_dimension is not None:
            actions.append(f"Revisar foco de degradacion: {worst_dimension[0]}={worst_dimension[1]}.")
        actions.append("Comparar ejecucion, slippage, horario y contexto de mercado contra el backtest.")
        return "edge_degraded", actions, "Dos o mas metricas clave se han degradado frente al backtest."
    if improved and not degraded:
        actions.append("Mantener en observacion; no subir riesgo solo por outperformance hasta ampliar muestra.")
        return "real_outperforms_backtest", actions, "El real supera al backtest en metricas clave."
    actions.append("Mantener plan y seguir acumulando evidencia por estrategia y sesion.")
    return "within_expected_variance", actions, "Real dentro de rango operativo frente al backtest."


def build_backtest_vs_real_report(
    *,
    backtests: Sequence[dict[str, Any]],
    real_trades: Sequence[dict[str, Any]],
    starting_equity: float = 100_000.0,
    min_real_trades: int = 30,
    min_backtest_trades: int = 100,
) -> dict[str, Any]:
    strategies = []
    real_groups = group_real_trades(real_trades, "strategy")

    for backtest in backtests:
        if not isinstance(backtest, dict):
            continue
        strategy = strategy_key_from_backtest(backtest)
        real_strategy_trades = real_groups.get(strategy, [])
        backtest_metrics = normalize_metric_payload(backtest)
        real_metrics = calculate_trade_metrics(real_strategy_trades, starting_equity=starting_equity)
        metric_comparisons = compare_metric_set(backtest_metrics, real_metrics)
        dimensions = {
            dimension: compare_dimension(
                backtest,
                real_strategy_trades,
                dimension,
                starting_equity=starting_equity,
            )
            for dimension in ("symbol", "hour", "session", "direction")
        }
        status, actions, diagnostic_text = diagnose_strategy(
            backtest_metrics=backtest_metrics,
            real_metrics=real_metrics,
            metric_comparisons=metric_comparisons,
            dimension_breakdown=dimensions,
            min_real_trades=min_real_trades,
            min_backtest_trades=min_backtest_trades,
        )
        cost_comparison = build_cost_comparison(backtest_metrics, real_metrics)
        if cost_comparison["has_extra_cost"]:
            actions.append("Revisar costes reales: spread, comisiones o slippage superan el backtest.")
        strategies.append({
            "strategy": strategy,
            "status": status,
            "diagnostic_text": diagnostic_text,
            "backtest": backtest_metrics,
            "real": real_metrics,
            "metric_comparisons": metric_comparisons,
            "dimension_breakdown": dimensions,
            "cost_comparison": cost_comparison,
            "actions": actions,
        })

    real_without_backtest = sorted(set(real_groups) - {strategy["strategy"] for strategy in strategies})
    strategies.sort(key=lambda item: (item["status"] != "edge_degraded", item["strategy"]))
    return {
        "schema_version": "1.0.0",
        "report_type": "backtest_vs_real",
        "strategy_count": len(strategies),
        "real_strategy_without_backtest_count": len(real_without_backtest),
        "real_strategies_without_backtest": real_without_backtest,
        "diagnostic_counts": {
            status: sum(1 for item in strategies if item["status"] == status)
            for status in ("edge_degraded", "sample_insufficient", "real_outperforms_backtest", "backtest_not_reliable", "within_expected_variance")
        },
        "strategies": strategies,
        "dashboard_text": (
            f"{len(strategies)} estrategias comparadas; "
            f"{sum(1 for item in strategies if item['status'] == 'edge_degraded')} con edge degradado."
        ),
    }
