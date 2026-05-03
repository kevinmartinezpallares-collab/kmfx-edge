from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from risk_math import (
    calculate_analytical_risk_of_ruin,
    calculate_drawdown_path_metrics,
    calculate_sizing_survival_metrics,
    calculate_monte_carlo_risk_summary,
    calculate_monte_carlo_var_metrics,
    calculate_parametric_tail_risk_metrics,
    calculate_prop_firm_intelligence_metrics,
    calculate_risk_adjusted_metrics,
    calculate_tail_risk_metrics,
    calculate_strategy_discipline_metrics,
    calculate_strategy_allocation_summary,
    calculate_strategy_correlation_metrics,
    calculate_strategy_portfolio_heat_metrics,
    calculate_strategy_score_metrics,
    calculate_trade_performance_metrics,
)


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


def trade_net_pnl(trade: dict[str, Any]) -> float:
    profit_keys = ("profit", "commission", "swap")
    if any(key in trade for key in profit_keys):
        return round(sum(safe_float(trade.get(key)) for key in profit_keys), 2)
    if "net" in trade:
        return round(safe_float(trade.get("net")), 2)
    return round(safe_float(trade.get("pnl")), 2)


def build_closed_trade_pnls(trades: list[dict[str, Any]]) -> list[float]:
    return [trade_net_pnl(trade) for trade in sorted_by_time(trades)]


def trade_r_multiple(trade: dict[str, Any], net_pnl: float) -> float | None:
    for key in ("r_multiple", "rMultiple", "result_r", "resultR", "r"):
        if key in trade:
            value = safe_float(trade.get(key), float("nan"))
            if value == value:
                return round(value, 4)

    for risk_key in ("risk_amount", "initial_risk_amount", "planned_risk_amount"):
        risk_amount = safe_float(trade.get(risk_key), 0.0)
        if risk_amount > 0:
            return round(net_pnl / risk_amount, 4)
    return None


def build_trade_r_multiples(trades: list[dict[str, Any]], trade_pnls: list[float]) -> list[float]:
    r_values: list[float] = []
    for trade, pnl in zip(sorted_by_time(trades), trade_pnls):
        r_multiple = trade_r_multiple(trade, pnl)
        if r_multiple is not None:
            r_values.append(r_multiple)
    return r_values


def build_equity_path_from_trades(balance: float, equity: float, trade_pnls: list[float]) -> list[float]:
    realized_pnl = sum(trade_pnls)
    estimated_start_equity = max(balance - realized_pnl, 0.0)
    running_equity = estimated_start_equity
    equity_path = [round(running_equity, 2)]

    for pnl in trade_pnls:
        running_equity += pnl
        equity_path.append(round(running_equity, 2))

    if not equity_path or abs(equity_path[-1] - equity) > 0.01:
        equity_path.append(round(max(equity, 0.0), 2))

    return equity_path


def build_trade_returns_pct(trade_pnls: list[float], equity_path: list[float]) -> list[float]:
    returns_pct: list[float] = []
    for index, pnl in enumerate(trade_pnls):
        base_equity = equity_path[index] if index < len(equity_path) else 0.0
        if base_equity > 0:
            returns_pct.append(round((pnl / base_equity) * 100.0, 6))
    return returns_pct


def trade_timestamp(trade: dict[str, Any]) -> str:
    for key in ("time", "close_time", "closeTime", "date", "when", "open_time", "openTime"):
        value = safe_str(trade.get(key))
        if value:
            return value
    return now_utc_iso()


def trade_bucket_key(trade: dict[str, Any], bucket: str, timezone_name: str = "UTC") -> str:
    tz, _warnings = resolve_timezone(timezone_name)
    timestamp = parse_iso_datetime(trade_timestamp(trade)).astimezone(tz)
    if bucket == "week":
        iso_year, iso_week, _weekday = timestamp.isocalendar()
        return f"{iso_year}-W{iso_week:02d}"
    return timestamp.date().isoformat()


def build_trade_pnl_buckets(trades: list[dict[str, Any]], bucket: str, timezone_name: str = "UTC") -> list[float]:
    buckets: dict[str, float] = {}
    for trade in sorted(trades, key=trade_timestamp):
        key = trade_bucket_key(trade, bucket, timezone_name)
        buckets[key] = buckets.get(key, 0.0) + trade_net_pnl(trade)
    return [round(value, 2) for key, value in sorted(buckets.items())]


def build_tail_risk_horizon_metrics(
    trades: list[dict[str, Any]],
    trade_pnls: list[float],
    timezone_name: str = "UTC",
) -> dict[str, Any]:
    daily_pnls = build_trade_pnl_buckets(trades, "day", timezone_name)
    weekly_pnls = build_trade_pnl_buckets(trades, "week", timezone_name)

    def horizon_payload(values: list[float], sample_basis: str) -> dict[str, Any]:
        var_95 = calculate_tail_risk_metrics(values, confidence=0.95)
        var_99 = calculate_tail_risk_metrics(values, confidence=0.99)
        return {
            "sample_basis": sample_basis,
            "sample_size": len(values),
            "var_95": asdict(var_95),
            "var_99": asdict(var_99),
        }

    return {
        "one_trade": horizon_payload(trade_pnls, "closed_trade_pnl"),
        "one_day": horizon_payload(daily_pnls, "daily_realized_pnl"),
        "one_week": horizon_payload(weekly_pnls, "weekly_realized_pnl"),
    }


def strategy_group_key(trade: dict[str, Any]) -> str:
    for key in ("strategy_tag", "strategyTag", "setup", "setup_name", "magic", "comment"):
        value = safe_str(trade.get(key))
        if value:
            return value
    return "Sin estrategia"


def build_strategy_daily_pnl_series(
    groups: dict[str, list[dict[str, Any]]],
    timezone_name: str,
) -> tuple[dict[str, list[float]], list[str]]:
    bucket_maps: dict[str, dict[str, float]] = {}
    all_buckets: set[str] = set()
    for strategy, trades in groups.items():
        strategy_buckets: dict[str, float] = {}
        for trade in sorted(trades, key=trade_timestamp):
            bucket_key = trade_bucket_key(trade, "day", timezone_name)
            strategy_buckets[bucket_key] = strategy_buckets.get(bucket_key, 0.0) + trade_net_pnl(trade)
            all_buckets.add(bucket_key)
        bucket_maps[strategy] = strategy_buckets

    ordered_buckets = sorted(all_buckets)
    series = {
        strategy: [
            round(bucket_map.get(bucket_key, 0.0), 2)
            for bucket_key in ordered_buckets
        ]
        for strategy, bucket_map in bucket_maps.items()
    }
    return series, ordered_buckets


def build_strategy_risk_breakdown(
    trades: list[dict[str, Any]],
    *,
    equity: float,
    risk_per_trade_pct: float,
    ruin_threshold_pct: float,
    portfolio_heat_limit_pct: float = 0.0,
    timezone_name: str = "UTC",
) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for trade in trades:
        key = strategy_group_key(trade)
        groups.setdefault(key, []).append(trade)

    rows: list[dict[str, Any]] = []
    for key, group_trades in sorted(groups.items(), key=lambda item: item[0].lower()):
        group_pnls = build_closed_trade_pnls(group_trades)
        group_r_values = build_trade_r_multiples(group_trades, group_pnls)
        performance = calculate_trade_performance_metrics(group_pnls, group_r_values)
        average_loss_risk_pct = (performance.average_loss / equity) * 100.0 if equity > 0 and performance.average_loss > 0 else 0.0
        group_risk_per_trade = risk_per_trade_pct or average_loss_risk_pct
        group_basis = "policy_max_risk_per_trade_pct" if risk_per_trade_pct > 0 else "average_loss_to_equity_pct"
        group_equity_path = build_equity_path_from_trades(equity, equity, group_pnls)
        drawdown_path = calculate_drawdown_path_metrics(group_equity_path)
        var_95 = calculate_tail_risk_metrics(group_pnls, confidence=0.95)
        var_99 = calculate_tail_risk_metrics(group_pnls, confidence=0.99)
        risk_of_ruin = calculate_analytical_risk_of_ruin(
            sample_size=len(group_pnls),
            win_rate_pct=performance.win_rate_pct,
            payoff_ratio=performance.payoff_ratio,
            risk_per_trade_pct=group_risk_per_trade,
            ruin_threshold_pct=ruin_threshold_pct,
            risk_per_trade_basis=group_basis,
        )
        discipline = calculate_strategy_discipline_metrics(group_trades)
        strategy_score = calculate_strategy_score_metrics(
            performance,
            drawdown_path,
            var_95,
            risk_of_ruin,
            discipline,
        )
        rows.append({
            "strategy": key,
            "sample_size": len(group_pnls),
            "net_pnl": performance.net_pnl,
            "performance": asdict(performance),
            "strategy_discipline": asdict(discipline),
            "strategy_score": asdict(strategy_score),
            "drawdown_path": asdict(drawdown_path),
            "tail_risk": {
                "var_95": asdict(var_95),
                "var_99": asdict(var_99),
                "horizons": build_tail_risk_horizon_metrics(group_trades, group_pnls, timezone_name),
            },
            "risk_of_ruin": asdict(risk_of_ruin),
        })

    rows.sort(
        key=lambda item: (
            item["strategy_score"]["score"],
            item["sample_size"],
            item["net_pnl"],
        ),
        reverse=True,
    )
    daily_series, daily_buckets = build_strategy_daily_pnl_series(groups, timezone_name)
    correlation = calculate_strategy_correlation_metrics(
        daily_series,
        basis="daily_realized_pnl",
    )
    portfolio_heat = calculate_strategy_portfolio_heat_metrics(correlation)
    risk_allocation = calculate_strategy_allocation_summary(
        rows,
        total_risk_budget_pct=portfolio_heat_limit_pct if portfolio_heat_limit_pct > 0 else None,
    )
    return {
        "group_count": len(rows),
        "correlation": asdict(correlation),
        "portfolio_heat": asdict(portfolio_heat),
        "risk_allocation": asdict(risk_allocation),
        "daily_bucket_count": len(daily_buckets),
        "groups": rows,
    }


def build_professional_metrics(
    balance: float,
    equity: float,
    trades: list[dict[str, Any]],
    sizing_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    trade_pnls = build_closed_trade_pnls(trades)
    trade_r_values = build_trade_r_multiples(trades, trade_pnls)
    equity_path = build_equity_path_from_trades(balance, equity, trade_pnls)
    returns_pct = build_trade_returns_pct(trade_pnls, equity_path)
    sizing_context = sizing_context or {}
    trading_timezone = safe_str(sizing_context.get("trading_timezone"), "UTC") or "UTC"
    warnings: list[str] = []

    if not trade_pnls:
        warnings.append("Sin trades cerrados: VaR, CVaR y Monte Carlo no tienen muestra real.")
    elif len(trade_pnls) < 30:
        warnings.append("Muestra menor a 30 trades: las metricas profesionales son direccionales, no robustas.")
    if trade_pnls and len(returns_pct) < len(trade_pnls):
        warnings.append("Algunas operaciones no tienen base de equity positiva para calcular retorno porcentual.")

    var_95 = calculate_tail_risk_metrics(trade_pnls, confidence=0.95)
    var_99 = calculate_tail_risk_metrics(trade_pnls, confidence=0.99)
    parametric_var_95 = calculate_parametric_tail_risk_metrics(trade_pnls, confidence=0.95)
    parametric_var_99 = calculate_parametric_tail_risk_metrics(trade_pnls, confidence=0.99)
    daily_pnls = build_trade_pnl_buckets(trades, "day", trading_timezone)
    monte_carlo_var_95 = calculate_monte_carlo_var_metrics(
        trade_pnls,
        confidence=0.95,
        simulations=1000,
        horizon_trades=1,
        seed=43,
    )
    monte_carlo_var_99 = calculate_monte_carlo_var_metrics(
        trade_pnls,
        confidence=0.99,
        simulations=1000,
        horizon_trades=1,
        seed=44,
    )
    tail_risk_horizons = build_tail_risk_horizon_metrics(trades, trade_pnls, trading_timezone)
    performance = calculate_trade_performance_metrics(trade_pnls, trade_r_values)
    policy_risk_per_trade_pct = safe_float(sizing_context.get("max_risk_per_trade_pct"), 0.0)
    average_loss_risk_pct = (performance.average_loss / equity) * 100.0 if equity > 0 and performance.average_loss > 0 else 0.0
    risk_per_trade_for_ruin = policy_risk_per_trade_pct or average_loss_risk_pct
    risk_per_trade_basis = "policy_max_risk_per_trade_pct" if policy_risk_per_trade_pct > 0 else "average_loss_to_equity_pct"
    ruin_threshold_pct = safe_float(sizing_context.get("max_dd_limit_pct"), 20.0) or 20.0
    risk_of_ruin = calculate_analytical_risk_of_ruin(
        sample_size=len(trade_pnls),
        win_rate_pct=performance.win_rate_pct,
        payoff_ratio=performance.payoff_ratio,
        risk_per_trade_pct=risk_per_trade_for_ruin,
        ruin_threshold_pct=ruin_threshold_pct,
        risk_per_trade_basis=risk_per_trade_basis,
    )
    drawdown_path = calculate_drawdown_path_metrics(equity_path)
    risk_adjusted = calculate_risk_adjusted_metrics(
        returns_pct,
        max_drawdown_pct=drawdown_path.max_drawdown_pct,
    )
    sizing = calculate_sizing_survival_metrics(
        sample_size=len(trade_pnls),
        win_rate_pct=performance.win_rate_pct,
        payoff_ratio=performance.payoff_ratio,
        equity=equity,
        total_open_risk_pct=safe_float(sizing_context.get("total_open_risk_pct"), 0.0),
        total_open_risk_amount=safe_float(sizing_context.get("total_open_risk_amount"), 0.0),
        max_trade_risk_pct=safe_float(sizing_context.get("max_open_trade_risk_pct"), 0.0),
        max_trade_risk_policy_pct=safe_float(sizing_context.get("max_risk_per_trade_pct"), 0.0),
        daily_drawdown_pct=safe_float(sizing_context.get("daily_drawdown_pct"), 0.0),
        daily_dd_limit_pct=safe_float(sizing_context.get("daily_dd_limit_pct"), 0.0),
        max_drawdown_pct=safe_float(sizing_context.get("peak_to_equity_drawdown_pct"), drawdown_path.current_drawdown_pct),
        max_dd_limit_pct=safe_float(sizing_context.get("max_dd_limit_pct"), 0.0),
        open_heat_limit_pct=safe_float(sizing_context.get("portfolio_heat_limit_pct"), 0.0),
        target_profit_remaining_pct=safe_float(sizing_context.get("profit_target_remaining_pct"), 0.0),
    )
    prop_firm = calculate_prop_firm_intelligence_metrics(
        equity=equity,
        daily_drawdown_pct=safe_float(sizing_context.get("daily_drawdown_pct"), 0.0),
        max_drawdown_pct=safe_float(sizing_context.get("peak_to_equity_drawdown_pct"), drawdown_path.current_drawdown_pct),
        total_open_risk_pct=safe_float(sizing_context.get("total_open_risk_pct"), 0.0),
        daily_dd_limit_pct=safe_float(sizing_context.get("daily_dd_limit_pct"), 0.0),
        max_dd_limit_pct=safe_float(sizing_context.get("max_dd_limit_pct"), 0.0),
        profit_target_pct=safe_float(sizing_context.get("profit_target_pct"), 0.0),
        profit_target_remaining_pct=safe_float(sizing_context.get("profit_target_remaining_pct"), 0.0),
        daily_pnls=daily_pnls,
        returns_pct=returns_pct,
        consistency_max_day_share_pct=safe_float(sizing_context.get("consistency_max_day_share_pct"), 0.0),
        minimum_trading_days=int(safe_float(sizing_context.get("minimum_trading_days"), 0.0)) or None,
        payout_ledger_entries=sizing_context.get("payout_ledger_entries") if isinstance(sizing_context.get("payout_ledger_entries"), list) else [],
        pass_probability_simulations=int(safe_float(sizing_context.get("pass_probability_simulations"), 1000.0)) or 1000,
        pass_probability_horizon_trades=int(safe_float(sizing_context.get("pass_probability_horizon_trades"), 0.0)) or None,
    )
    monte_carlo = calculate_monte_carlo_risk_summary(
        returns_pct,
        simulations=1000,
        horizon_trades=max(len(returns_pct), 30) if returns_pct else 30,
        ruin_threshold_pct=20.0,
        seed=42,
    )
    strategy_breakdown = build_strategy_risk_breakdown(
        trades,
        equity=equity,
        risk_per_trade_pct=risk_per_trade_for_ruin,
        ruin_threshold_pct=ruin_threshold_pct,
        portfolio_heat_limit_pct=safe_float(sizing_context.get("portfolio_heat_limit_pct"), 0.0),
        timezone_name=trading_timezone,
    )

    return {
        "performance": asdict(performance),
        "risk_adjusted": asdict(risk_adjusted),
        "sizing": asdict(sizing),
        "prop_firm": asdict(prop_firm),
        "tail_risk": {
            "var_95": asdict(var_95),
            "var_99": asdict(var_99),
            "parametric_var_95": asdict(parametric_var_95),
            "parametric_var_99": asdict(parametric_var_99),
            "monte_carlo_var_95": asdict(monte_carlo_var_95),
            "monte_carlo_var_99": asdict(monte_carlo_var_99),
            "horizons": tail_risk_horizons,
        },
        "risk_of_ruin": asdict(risk_of_ruin),
        "strategy_breakdown": strategy_breakdown,
        "drawdown_path": asdict(drawdown_path),
        "monte_carlo": asdict(monte_carlo),
        "inputs": {
            "closed_trades_count": len(trade_pnls),
            "equity_points_count": len(equity_path),
            "returns_count": len(returns_pct),
            "r_multiples_count": len(trade_r_values),
            "win_rate_pct": performance.win_rate_pct,
            "payoff_ratio": performance.payoff_ratio,
            "risk_per_trade_pct": risk_of_ruin.risk_per_trade_pct,
            "risk_per_trade_basis": risk_of_ruin.risk_per_trade_basis,
            "capital_amount": round(equity, 2),
            "equity": round(equity, 2),
            "balance": round(balance, 2),
            "ruin_limit_pct": risk_of_ruin.ruin_threshold_pct,
            "tail_risk_daily_samples": tail_risk_horizons["one_day"]["sample_size"],
            "tail_risk_weekly_samples": tail_risk_horizons["one_week"]["sample_size"],
            "strategy_group_count": strategy_breakdown["group_count"],
            "monte_carlo_horizon_trades": monte_carlo.horizon_trades,
            "ruin_threshold_pct": monte_carlo.ruin_threshold_pct,
            "analytical_ruin_threshold_pct": risk_of_ruin.ruin_threshold_pct,
            "analytical_ruin_risk_per_trade_pct": risk_of_ruin.risk_per_trade_pct,
            "analytical_ruin_risk_per_trade_basis": risk_of_ruin.risk_per_trade_basis,
            "prop_firm_risk_allowed_after_open_risk_pct": prop_firm.risk_allowed_after_open_risk_pct,
            "prop_firm_alert_level": prop_firm.alert_level,
        },
        "warnings": warnings,
    }


def calculate_rolling_max_drawdown_pct(balance: float, trades: list[dict[str, Any]], equity: float) -> float:
    trade_pnls = build_closed_trade_pnls(trades)
    equity_path = build_equity_path_from_trades(balance, equity, trade_pnls)
    rolling_peak_equity = equity_path[0] if equity_path else 0.0
    rolling_max_drawdown_pct = 0.0

    for running_equity in equity_path:
        rolling_peak_equity = max(rolling_peak_equity, running_equity)
        rolling_max_drawdown_pct = max(
            rolling_max_drawdown_pct,
            pct_drop_from_peak(rolling_peak_equity, running_equity),
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
    policy_snapshot: dict[str, Any] | None = None,
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
    policy_snapshot = policy_snapshot or {}
    sizing_context = {
        "total_open_risk_pct": total_open_risk_pct,
        "total_open_risk_amount": total_open_risk_amount,
        "max_open_trade_risk_pct": max_open_trade_risk_pct,
        "daily_drawdown_pct": daily_context["daily_drawdown_pct"],
        "peak_to_equity_drawdown_pct": peak_to_equity_drawdown_pct,
        "max_risk_per_trade_pct": policy_snapshot.get("risk_per_trade_pct"),
        "daily_dd_limit_pct": policy_snapshot.get("daily_dd_limit_pct"),
        "max_dd_limit_pct": policy_snapshot.get("max_dd_limit_pct"),
        "portfolio_heat_limit_pct": policy_snapshot.get("portfolio_heat_limit_pct"),
        "profit_target_pct": policy_snapshot.get("profit_target_pct") or policy_snapshot.get("target_profit_pct"),
        "profit_target_remaining_pct": policy_snapshot.get("profit_target_remaining_pct"),
        "consistency_max_day_share_pct": policy_snapshot.get("consistency_max_day_share_pct"),
        "minimum_trading_days": policy_snapshot.get("minimum_trading_days"),
        "payout_ledger_entries": policy_snapshot.get("payout_ledger") or policy_snapshot.get("payout_ledger_entries") or [],
        "pass_probability_simulations": policy_snapshot.get("pass_probability_simulations"),
        "pass_probability_horizon_trades": policy_snapshot.get("pass_probability_horizon_trades"),
        "trading_timezone": trading_timezone,
    }

    symbol_exposure = build_symbol_exposure(positions, balance)
    open_trade_risks = build_open_trade_risks(positions, balance)
    professional_metrics = build_professional_metrics(balance, equity, trades, sizing_context=sizing_context)

    if not trades:
        warnings.append("rolling_max_drawdown_pct usa una ventana vacía de trades; el valor refleja solo el estado live actual.")
    warnings.extend(professional_metrics.get("warnings") or [])

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
        "professional_metrics": professional_metrics,
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
    total_equity = 0.0
    total_var_95 = 0.0
    total_cvar_95 = 0.0
    total_var_99 = 0.0
    total_cvar_99 = 0.0
    total_closed_trades = 0
    accounts_with_var_count = 0
    highest_ruin_probability_pct = 0.0

    for account in accounts:
        payload = account.get("dashboard_payload") if isinstance(account, dict) else {}
        snapshot = payload.get("riskSnapshot") if isinstance(payload, dict) else {}
        summary = snapshot.get("summary") if isinstance(snapshot, dict) else {}
        if isinstance(summary, dict):
            summaries.append(summary)

        professional = snapshot.get("professional_metrics") if isinstance(snapshot, dict) else {}
        tail_risk = professional.get("tail_risk") if isinstance(professional, dict) else {}
        inputs = professional.get("inputs") if isinstance(professional, dict) else {}
        var_95 = tail_risk.get("var_95") if isinstance(tail_risk, dict) else {}
        var_99 = tail_risk.get("var_99") if isinstance(tail_risk, dict) else {}
        monte_carlo = professional.get("monte_carlo") if isinstance(professional, dict) else {}
        risk_of_ruin = professional.get("risk_of_ruin") if isinstance(professional, dict) else {}
        account_payload = payload.get("account") if isinstance(payload, dict) and isinstance(payload.get("account"), dict) else {}
        equity = (
            safe_float(payload.get("equity")) if isinstance(payload, dict) else 0.0
        ) or safe_float(account_payload.get("equity")) or safe_float(inputs.get("equity") if isinstance(inputs, dict) else 0.0)
        total_equity += max(equity, 0.0)

        if isinstance(var_95, dict) or isinstance(var_99, dict):
            var_95_amount = safe_float(var_95.get("var_amount") if isinstance(var_95, dict) else 0.0)
            cvar_95_amount = safe_float(var_95.get("cvar_amount") if isinstance(var_95, dict) else 0.0)
            var_99_amount = safe_float(var_99.get("var_amount") if isinstance(var_99, dict) else 0.0)
            cvar_99_amount = safe_float(var_99.get("cvar_amount") if isinstance(var_99, dict) else 0.0)
            sample_size = int(safe_float(var_95.get("sample_size") if isinstance(var_95, dict) else 0.0))
            if sample_size > 0 or var_95_amount > 0 or var_99_amount > 0:
                accounts_with_var_count += 1
            total_var_95 += var_95_amount
            total_cvar_95 += cvar_95_amount
            total_var_99 += var_99_amount
            total_cvar_99 += cvar_99_amount

        if isinstance(inputs, dict):
            total_closed_trades += int(safe_float(inputs.get("closed_trades_count"), 0.0))

        highest_ruin_probability_pct = max(
            highest_ruin_probability_pct,
            safe_float(monte_carlo.get("ruin_probability_pct") if isinstance(monte_carlo, dict) else 0.0),
            safe_float(risk_of_ruin.get("analytic_ruin_probability_pct") if isinstance(risk_of_ruin, dict) else 0.0),
        )

    combined_open_risk_pct = round(sum(safe_float(item.get("total_open_risk_pct")) for item in summaries), 4)
    combined_open_risk_amount = round(sum(safe_float(item.get("total_open_risk_amount")) for item in summaries), 2)
    combined_peak_to_equity_drawdown_pct = round(
        max((safe_float(item.get("peak_to_equity_drawdown_pct")) for item in summaries), default=0.0),
        4,
    )
    equity_base = total_equity if total_equity > 0 else 0.0

    def equity_pct(amount: float) -> float:
        return round((amount / equity_base) * 100.0, 4) if equity_base > 0 else 0.0

    return {
        "accounts_count": len(summaries),
        "combined_open_risk_pct": combined_open_risk_pct,
        "combined_open_risk_amount": combined_open_risk_amount,
        "combined_peak_to_equity_drawdown_pct": combined_peak_to_equity_drawdown_pct,
        "accounts_with_var_count": accounts_with_var_count,
        "closed_trades_count": total_closed_trades,
        "equity": round(total_equity, 2),
        "var_95_amount": round(total_var_95, 2),
        "var_95_equity_pct": equity_pct(total_var_95),
        "cvar_95_amount": round(total_cvar_95, 2),
        "cvar_95_equity_pct": equity_pct(total_cvar_95),
        "var_99_amount": round(total_var_99, 2),
        "var_99_equity_pct": equity_pct(total_var_99),
        "cvar_99_amount": round(total_cvar_99, 2),
        "cvar_99_equity_pct": equity_pct(total_cvar_99),
        "highest_ruin_probability_pct": round(highest_ruin_probability_pct, 4),
        "method": "conservative_sum_of_account_var",
        "assumptions": [
            "VaR portfolio suma el VaR por cuenta de forma conservadora.",
            "No aplica matriz de correlacion entre cuentas hasta tener historico sincronizado multi-cuenta.",
        ],
    }
