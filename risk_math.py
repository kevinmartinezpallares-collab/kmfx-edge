"""
Funciones matemáticas y helpers puros del motor de riesgo.
"""

from __future__ import annotations

import math
import random
from datetime import date, datetime, timezone
from statistics import NormalDist
from typing import Any, Dict, Iterable, List, Optional, Sequence
from zoneinfo import ZoneInfo

from risk_models import (
    ClusterDetail,
    CorrelationExposure,
    DrawdownPathMetrics,
    MonteCarloRiskSummary,
    OutlierDependencyMetrics,
    Position,
    PropFirmIntelligenceMetrics,
    PropFirmPassProbabilityMetrics,
    PropFirmPayoutLedgerMetrics,
    RecoveryMetrics,
    RiskAdjustedMetrics,
    RiskOfRuinMetrics,
    SampleQualityMetrics,
    Side,
    SizingSurvivalMetrics,
    StrategyAllocationMetrics,
    StrategyAllocationSummaryMetrics,
    StrategyCorrelationMetrics,
    StrategyCorrelationPairMetrics,
    StrategyDisciplineMetrics,
    StrategyPortfolioHeatMetrics,
    StrategyScoreMetrics,
    TailRiskMetrics,
    TradePerformanceMetrics,
    VolatilitySignal,
)
from risk_policy import RiskPolicy


def ensure_aware(dt: Optional[datetime]) -> datetime:
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def normalize_symbol(symbol: str) -> str:
    return symbol.strip().upper()


def format_money(value: float) -> str:
    sign = "-" if value < 0 else ""
    return f"{sign}€{abs(value):,.2f}"


def finite_numbers(values: Iterable[float]) -> List[float]:
    numbers: List[float] = []
    for value in values:
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if math.isfinite(number):
            numbers.append(number)
    return numbers


def percentile(values: Sequence[float], percentile_value: float) -> float:
    numbers = sorted(finite_numbers(values))
    if not numbers:
        return 0.0
    pct = min(max(float(percentile_value), 0.0), 1.0)
    if len(numbers) == 1:
        return numbers[0]
    index = pct * (len(numbers) - 1)
    lower = math.floor(index)
    upper = math.ceil(index)
    if lower == upper:
        return numbers[int(index)]
    weight = index - lower
    return numbers[lower] + ((numbers[upper] - numbers[lower]) * weight)


def round_optional(value: Optional[float], digits: int = 4) -> Optional[float]:
    if value is None or not math.isfinite(value):
        return None
    return round(value, digits)


def clamp(value: float, min_value: float = 0.0, max_value: float = 100.0) -> float:
    if not math.isfinite(value):
        return min_value
    return min(max(value, min_value), max_value)


def calculate_sample_quality(sample_size: int) -> SampleQualityMetrics:
    safe_sample = max(0, int(sample_size or 0))
    min_acceptable = 30
    min_robust = 100
    if safe_sample <= 0:
        level = "sin_muestra"
        label = "Sin muestra"
        text = "Sin trades cerrados; las métricas de edge no tienen muestra."
    elif safe_sample < min_acceptable:
        level = "insuficiente"
        label = "Muestra insuficiente"
        text = f"{safe_sample} trades cerrados; lectura temprana, no robusta."
    elif safe_sample < min_robust:
        level = "aceptable"
        label = "Muestra aceptable"
        text = f"{safe_sample} trades cerrados; lectura operativa con prudencia."
    else:
        level = "robusta"
        label = "Muestra robusta"
        text = f"{safe_sample} trades cerrados; lectura estadística más estable."
    return SampleQualityMetrics(
        sample_size=safe_sample,
        level=level,
        label=label,
        min_trades_for_acceptable=min_acceptable,
        min_trades_for_robust=min_robust,
        dashboard_text=text,
    )


def calculate_outlier_dependency(pnl_values: Sequence[float]) -> OutlierDependencyMetrics:
    pnls = finite_numbers(pnl_values)
    positive_pnls = sorted((pnl for pnl in pnls if pnl > 0), reverse=True)
    net_pnl = sum(pnls)

    def top_sum(count: int) -> float:
        return round(sum(positive_pnls[:count]), 2)

    top_1 = top_sum(1)
    top_3 = top_sum(3)
    top_5 = top_sum(5)

    def share(amount: float) -> Optional[float]:
        if net_pnl <= 0:
            return None
        return round((amount / net_pnl) * 100.0, 4)

    top_1_share = share(top_1)
    top_3_share = share(top_3)
    top_5_share = share(top_5)
    if net_pnl <= 0:
        text = "P&L neto no positivo; dependencia de outliers no evaluable sobre beneficio."
    else:
        text = f"Top 1 explica {top_1_share:.2f}% del P&L neto; top 5 explica {top_5_share:.2f}%."
    return OutlierDependencyMetrics(
        top_1_pnl=top_1,
        top_3_pnl=top_3,
        top_5_pnl=top_5,
        top_1_share_pct=top_1_share,
        top_3_share_pct=top_3_share,
        top_5_share_pct=top_5_share,
        denominator_pnl=round(net_pnl, 2) if net_pnl > 0 else 0.0,
        dashboard_text=text,
    )


def calculate_trade_performance_metrics(
    pnl_values: Sequence[float],
    r_multiples: Optional[Sequence[float]] = None,
) -> TradePerformanceMetrics:
    pnls = finite_numbers(pnl_values)
    sample_size = len(pnls)
    wins = [pnl for pnl in pnls if pnl > 0]
    losses = [pnl for pnl in pnls if pnl < 0]
    breakevens = [pnl for pnl in pnls if pnl == 0]
    wins_count = len(wins)
    losses_count = len(losses)
    breakeven_count = len(breakevens)
    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))
    net_pnl = sum(pnls)
    average_win = gross_profit / wins_count if wins_count else 0.0
    average_loss = gross_loss / losses_count if losses_count else 0.0
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else None
    payoff_ratio = (average_win / average_loss) if average_loss > 0 else None
    average_trade = net_pnl / sample_size if sample_size else 0.0

    max_wins = 0
    max_losses = 0
    current_wins = 0
    current_losses = 0
    for pnl in pnls:
        if pnl > 0:
            current_wins += 1
            current_losses = 0
        elif pnl < 0:
            current_losses += 1
            current_wins = 0
        else:
            current_wins = 0
            current_losses = 0
        max_wins = max(max_wins, current_wins)
        max_losses = max(max_losses, current_losses)

    r_values = finite_numbers(r_multiples or [])
    average_r = sum(r_values) / len(r_values) if r_values else None
    expectancy_r = average_r
    sample_quality = calculate_sample_quality(sample_size)
    outlier_dependency = calculate_outlier_dependency(pnls)
    dashboard_text = (
        f"Expectancy {format_money(average_trade)}; PF "
        f"{profit_factor:.2f}; WR {(wins_count / sample_size) * 100.0:.2f}%."
        if sample_size and profit_factor is not None
        else sample_quality.dashboard_text
    )
    return TradePerformanceMetrics(
        sample_size=sample_size,
        wins_count=wins_count,
        losses_count=losses_count,
        breakeven_count=breakeven_count,
        win_rate_pct=round((wins_count / sample_size) * 100.0, 4) if sample_size else 0.0,
        loss_rate_pct=round((losses_count / sample_size) * 100.0, 4) if sample_size else 0.0,
        breakeven_rate_pct=round((breakeven_count / sample_size) * 100.0, 4) if sample_size else 0.0,
        gross_profit=round(gross_profit, 2),
        gross_loss=round(gross_loss, 2),
        net_pnl=round(net_pnl, 2),
        average_trade=round(average_trade, 2),
        average_win=round(average_win, 2),
        average_loss=round(average_loss, 2),
        profit_factor=round_optional(profit_factor, 4),
        payoff_ratio=round_optional(payoff_ratio, 4),
        expectancy_amount=round(average_trade, 2),
        expectancy_r=round_optional(expectancy_r, 4),
        average_r=round_optional(average_r, 4),
        best_trade=round(max(pnls), 2) if pnls else 0.0,
        worst_trade=round(min(pnls), 2) if pnls else 0.0,
        max_consecutive_wins=max_wins,
        max_consecutive_losses=max_losses,
        outlier_dependency=outlier_dependency,
        sample_quality=sample_quality,
        dashboard_text=dashboard_text,
    )


def compound_return_pct(returns_pct: Sequence[float]) -> float:
    equity = 1.0
    for value in finite_numbers(returns_pct):
        equity *= max(0.0, 1 + (value / 100.0))
    return (equity - 1.0) * 100.0


def calculate_risk_adjusted_metrics(
    returns_pct: Sequence[float],
    *,
    max_drawdown_pct: float = 0.0,
) -> RiskAdjustedMetrics:
    returns = finite_numbers(returns_pct)
    sample_size = len(returns)
    safe_max_dd = max(0.0, float(max_drawdown_pct or 0.0))
    if not returns:
        return RiskAdjustedMetrics(
            sample_size=0,
            return_basis="per_trade_pct",
            mean_return_pct=0.0,
            volatility_pct=0.0,
            downside_deviation_pct=0.0,
            total_return_pct=0.0,
            sharpe_ratio=None,
            sortino_ratio=None,
            calmar_ratio=None,
            gain_to_pain_ratio=None,
            tail_ratio=None,
            skewness=None,
            kurtosis=None,
            excess_kurtosis=None,
            p05_return_pct=0.0,
            p95_return_pct=0.0,
            max_drawdown_pct=round(safe_max_dd, 4),
            dashboard_text="Sin retornos por trade; ratios ajustados por riesgo no disponibles.",
        )

    mean_return = sum(returns) / sample_size
    variance = sum((value - mean_return) ** 2 for value in returns) / sample_size
    volatility = math.sqrt(variance)
    downside_variance = sum((min(0.0, value)) ** 2 for value in returns) / sample_size
    downside_deviation = math.sqrt(downside_variance)
    positive_return_sum = sum(value for value in returns if value > 0)
    negative_return_sum = abs(sum(value for value in returns if value < 0))
    p05_return = percentile(returns, 0.05)
    p95_return = percentile(returns, 0.95)
    total_return = compound_return_pct(returns)

    sharpe = mean_return / volatility if volatility > 0 else None
    sortino = mean_return / downside_deviation if downside_deviation > 0 else None
    calmar = total_return / safe_max_dd if safe_max_dd > 0 else None
    gain_to_pain = positive_return_sum / negative_return_sum if negative_return_sum > 0 else None
    tail_ratio = abs(p95_return / p05_return) if p05_return < 0 else None

    if volatility > 0:
        third_moment = sum((value - mean_return) ** 3 for value in returns) / sample_size
        fourth_moment = sum((value - mean_return) ** 4 for value in returns) / sample_size
        skewness = third_moment / (volatility ** 3)
        kurtosis = fourth_moment / (volatility ** 4)
        excess_kurtosis = kurtosis - 3.0
    else:
        skewness = None
        kurtosis = None
        excess_kurtosis = None

    text = (
        f"Sharpe {sharpe:.2f}, Sortino {sortino:.2f}, Gain-to-Pain {gain_to_pain:.2f}."
        if sharpe is not None and sortino is not None and gain_to_pain is not None
        else "Ratios ajustados calculados con muestra parcial de retornos por trade."
    )
    return RiskAdjustedMetrics(
        sample_size=sample_size,
        return_basis="per_trade_pct",
        mean_return_pct=round(mean_return, 6),
        volatility_pct=round(volatility, 6),
        downside_deviation_pct=round(downside_deviation, 6),
        total_return_pct=round(total_return, 6),
        sharpe_ratio=round_optional(sharpe, 4),
        sortino_ratio=round_optional(sortino, 4),
        calmar_ratio=round_optional(calmar, 4),
        gain_to_pain_ratio=round_optional(gain_to_pain, 4),
        tail_ratio=round_optional(tail_ratio, 4),
        skewness=round_optional(skewness, 4),
        kurtosis=round_optional(kurtosis, 4),
        excess_kurtosis=round_optional(excess_kurtosis, 4),
        p05_return_pct=round(p05_return, 6),
        p95_return_pct=round(p95_return, 6),
        max_drawdown_pct=round(safe_max_dd, 4),
        dashboard_text=text,
    )


def _remaining_budget(limit_pct: Optional[float], current_pct: float) -> Optional[float]:
    if limit_pct is None or limit_pct <= 0:
        return None
    return round(max(0.0, limit_pct - max(0.0, current_pct)), 4)


def _pct_usage(current_pct: float, limit_pct: Optional[float]) -> Optional[float]:
    if limit_pct is None or limit_pct <= 0:
        return None
    return round((max(0.0, current_pct) / limit_pct) * 100.0, 4)


def _amount_from_pct(equity: float, pct_value: Optional[float]) -> Optional[float]:
    if pct_value is None or equity <= 0:
        return None
    return round(equity * (pct_value / 100.0), 2)


def calculate_kelly_fraction_pct(win_rate_pct: float, payoff_ratio: Optional[float]) -> Optional[float]:
    payoff = payoff_ratio if payoff_ratio is not None and payoff_ratio > 0 else None
    if payoff is None:
        return None
    win_probability = min(max(win_rate_pct / 100.0, 0.0), 1.0)
    loss_probability = 1.0 - win_probability
    return round(((win_probability * payoff) - loss_probability) / payoff * 100.0, 4)


def calculate_sizing_survival_metrics(
    *,
    sample_size: int,
    win_rate_pct: float,
    payoff_ratio: Optional[float],
    equity: float,
    total_open_risk_pct: float = 0.0,
    total_open_risk_amount: float = 0.0,
    max_trade_risk_pct: float = 0.0,
    max_trade_risk_policy_pct: Optional[float] = None,
    daily_drawdown_pct: float = 0.0,
    daily_dd_limit_pct: Optional[float] = None,
    max_drawdown_pct: float = 0.0,
    max_dd_limit_pct: Optional[float] = None,
    open_heat_limit_pct: Optional[float] = None,
    target_profit_remaining_pct: Optional[float] = None,
) -> SizingSurvivalMetrics:
    safe_equity = max(0.0, float(equity or 0.0))
    safe_open_heat_pct = round(max(0.0, float(total_open_risk_pct or 0.0)), 4)
    explicit_open_heat_amount = max(0.0, float(total_open_risk_amount or 0.0))
    derived_open_heat_amount = safe_equity * (safe_open_heat_pct / 100.0) if safe_equity > 0 and safe_open_heat_pct > 0 else 0.0
    safe_open_heat_amount = round(explicit_open_heat_amount or derived_open_heat_amount, 2)
    safe_max_trade_risk_pct = round(max(0.0, float(max_trade_risk_pct or 0.0)), 4)
    safe_trade_policy = max_trade_risk_policy_pct if max_trade_risk_policy_pct is not None and max_trade_risk_policy_pct > 0 else None
    safe_daily_limit = daily_dd_limit_pct if daily_dd_limit_pct is not None and daily_dd_limit_pct > 0 else None
    safe_max_limit = max_dd_limit_pct if max_dd_limit_pct is not None and max_dd_limit_pct > 0 else None
    safe_heat_limit = open_heat_limit_pct if open_heat_limit_pct is not None and open_heat_limit_pct > 0 else None
    daily_remaining = _remaining_budget(safe_daily_limit, daily_drawdown_pct)
    weekly_remaining = _remaining_budget(safe_max_limit, max_drawdown_pct)
    daily_after_open = round(max(0.0, daily_remaining - safe_open_heat_pct), 4) if daily_remaining is not None else None
    weekly_after_open = round(max(0.0, weekly_remaining - safe_open_heat_pct), 4) if weekly_remaining is not None else None
    kelly = calculate_kelly_fraction_pct(win_rate_pct, payoff_ratio)
    positive_kelly = max(0.0, kelly) if kelly is not None else None
    half_kelly = round(positive_kelly * 0.5, 4) if positive_kelly is not None else None
    quarter_kelly = round(positive_kelly * 0.25, 4) if positive_kelly is not None else None
    recommended = quarter_kelly
    if kelly is None:
        kelly_state = "unavailable"
    elif kelly <= 0:
        kelly_state = "negative_edge"
    elif kelly > 5:
        kelly_state = "capped_aggressive"
        recommended = min(quarter_kelly or 0.0, 1.0)
    else:
        kelly_state = "usable_fractional"

    risk_to_target_basis = "not_configured"
    risk_to_target = None
    if target_profit_remaining_pct is not None and target_profit_remaining_pct > 0:
        risk_to_target = round((safe_open_heat_pct / target_profit_remaining_pct) * 100.0, 4)
        risk_to_target_basis = "profit_target_remaining_pct"

    risk_to_ruin_basis = "max_dd_remaining_pct" if weekly_remaining is not None else "not_configured"
    risk_to_ruin = round((safe_open_heat_pct / weekly_remaining) * 100.0, 4) if weekly_remaining and weekly_remaining > 0 else None
    text = (
        f"Kelly 1/4 {recommended:.2f}% con heat abierto {safe_open_heat_pct:.2f}%."
        if recommended is not None
        else "Sizing profesional pendiente de payoff ratio y win rate válidos."
    )
    return SizingSurvivalMetrics(
        sample_size=max(0, int(sample_size or 0)),
        kelly_fraction_pct=round_optional(kelly, 4),
        half_kelly_pct=half_kelly,
        quarter_kelly_pct=quarter_kelly,
        recommended_fractional_kelly_pct=round_optional(recommended, 4),
        kelly_state=kelly_state,
        daily_risk_budget_remaining_pct=daily_remaining,
        daily_risk_budget_after_open_risk_pct=daily_after_open,
        daily_risk_budget_remaining_amount=_amount_from_pct(safe_equity, daily_remaining),
        weekly_risk_budget_remaining_pct=weekly_remaining,
        weekly_risk_budget_after_open_risk_pct=weekly_after_open,
        weekly_risk_budget_remaining_amount=_amount_from_pct(safe_equity, weekly_remaining),
        weekly_budget_basis="max_dd_limit_pct",
        open_heat_pct=safe_open_heat_pct,
        open_heat_amount=safe_open_heat_amount,
        open_heat_limit_pct=round_optional(safe_heat_limit, 4),
        open_heat_usage_ratio_pct=_pct_usage(safe_open_heat_pct, safe_heat_limit),
        max_trade_risk_pct=safe_max_trade_risk_pct,
        max_trade_risk_policy_pct=round_optional(safe_trade_policy, 4),
        max_trade_risk_usage_ratio_pct=_pct_usage(safe_max_trade_risk_pct, safe_trade_policy),
        risk_to_target_ratio_pct=risk_to_target,
        risk_to_target_basis=risk_to_target_basis,
        risk_to_ruin_ratio_pct=risk_to_ruin,
        risk_to_ruin_basis=risk_to_ruin_basis,
        dashboard_text=text,
    )


def calculate_prop_firm_pass_probability_metrics(
    returns_pct: Sequence[float],
    *,
    target_remaining_pct: Optional[float],
    max_dd_buffer_pct: Optional[float],
    simulations: int = 1000,
    horizon_trades: Optional[int] = None,
    seed: int = 47,
) -> PropFirmPassProbabilityMetrics:
    returns = finite_numbers(returns_pct)
    safe_simulations = max(1, int(simulations or 1))
    safe_horizon = max(1, int(horizon_trades or len(returns) or 30))
    safe_target = target_remaining_pct if target_remaining_pct is not None and target_remaining_pct > 0 else None
    safe_dd_buffer = max_dd_buffer_pct if max_dd_buffer_pct is not None and max_dd_buffer_pct > 0 else None

    if not returns or safe_target is None or safe_dd_buffer is None:
        return PropFirmPassProbabilityMetrics(
            simulations=safe_simulations,
            horizon_trades=safe_horizon,
            sample_size=len(returns),
            target_remaining_pct=round_optional(safe_target, 4),
            max_dd_buffer_pct=round_optional(safe_dd_buffer, 4),
            pass_probability_pct=None,
            rule_breach_probability_pct=None,
            timeout_probability_pct=None,
            basis="unavailable",
            dashboard_text="Probabilidad de pasar challenge pendiente de retornos, target y buffer de DD.",
        )

    rng = random.Random(seed)
    pass_count = 0
    breach_count = 0
    timeout_count = 0
    for _simulation_index in range(safe_simulations):
        cumulative_return = 0.0
        peak_return = 0.0
        resolved = False
        for _trade_index in range(safe_horizon):
            cumulative_return += rng.choice(returns)
            peak_return = max(peak_return, cumulative_return)
            drawdown_from_peak = peak_return - cumulative_return
            if cumulative_return >= safe_target:
                pass_count += 1
                resolved = True
                break
            if drawdown_from_peak >= safe_dd_buffer or cumulative_return <= -safe_dd_buffer:
                breach_count += 1
                resolved = True
                break
        if not resolved:
            timeout_count += 1

    pass_probability = (pass_count / safe_simulations) * 100.0
    breach_probability = (breach_count / safe_simulations) * 100.0
    timeout_probability = (timeout_count / safe_simulations) * 100.0
    return PropFirmPassProbabilityMetrics(
        simulations=safe_simulations,
        horizon_trades=safe_horizon,
        sample_size=len(returns),
        target_remaining_pct=round(safe_target, 4),
        max_dd_buffer_pct=round(safe_dd_buffer, 4),
        pass_probability_pct=round(pass_probability, 4),
        rule_breach_probability_pct=round(breach_probability, 4),
        timeout_probability_pct=round(timeout_probability, 4),
        basis="bootstrap_trade_returns_pct",
        dashboard_text=(
            f"Probabilidad bootstrap de pasar {pass_probability:.2f}% "
            f"en {safe_horizon} trades; breach {breach_probability:.2f}%."
        ),
    )


def calculate_prop_firm_payout_ledger_metrics(
    entries: Optional[Sequence[Dict[str, Any]]] = None,
) -> PropFirmPayoutLedgerMetrics:
    rows = entries or []
    gross_gains = 0.0
    withdrawals = 0.0
    fees = 0.0
    refunds = 0.0
    adjustments = 0.0

    for entry in rows:
        if not isinstance(entry, dict):
            continue
        entry_type = str(entry.get("type") or entry.get("kind") or "adjustment").strip().lower()
        amount = _dict_float(entry, "amount")
        if amount == 0.0:
            amount = _dict_float(entry, "value")
        normalized = entry_type.replace("-", "_").replace(" ", "_")
        if normalized in {"gain", "gains", "profit", "trading_gain", "gross_gain"}:
            gross_gains += amount
        elif normalized in {"payout", "withdrawal", "withdraw", "profit_split"}:
            withdrawals += abs(amount)
        elif normalized in {"fee", "fees", "challenge_fee", "reset_fee", "subscription_fee"}:
            fees += abs(amount)
        elif normalized in {"refund", "refunds"}:
            refunds += abs(amount)
        else:
            adjustments += amount

    net_cashflow = withdrawals + refunds + adjustments - fees
    return PropFirmPayoutLedgerMetrics(
        entry_count=sum(1 for entry in rows if isinstance(entry, dict)),
        gross_gains_amount=round(gross_gains, 2),
        withdrawals_amount=round(withdrawals, 2),
        fees_amount=round(fees, 2),
        refunds_amount=round(refunds, 2),
        adjustments_amount=round(adjustments, 2),
        net_cashflow_amount=round(net_cashflow, 2),
        dashboard_text=(
            f"Payout ledger neto {format_money(net_cashflow)}; "
            f"retiros {format_money(withdrawals)}, fees {format_money(fees)}."
        ),
    )


def calculate_prop_firm_intelligence_metrics(
    *,
    equity: float,
    daily_drawdown_pct: float = 0.0,
    max_drawdown_pct: float = 0.0,
    total_open_risk_pct: float = 0.0,
    daily_dd_limit_pct: Optional[float] = None,
    max_dd_limit_pct: Optional[float] = None,
    profit_target_pct: Optional[float] = None,
    profit_target_remaining_pct: Optional[float] = None,
    daily_pnls: Optional[Sequence[float]] = None,
    returns_pct: Optional[Sequence[float]] = None,
    consistency_max_day_share_pct: Optional[float] = None,
    minimum_trading_days: Optional[int] = None,
    payout_ledger_entries: Optional[Sequence[Dict[str, Any]]] = None,
    pass_probability_simulations: int = 1000,
    pass_probability_horizon_trades: Optional[int] = None,
) -> PropFirmIntelligenceMetrics:
    safe_equity = max(0.0, float(equity or 0.0))
    safe_daily_used = round(max(0.0, float(daily_drawdown_pct or 0.0)), 4)
    safe_max_used = round(max(0.0, float(max_drawdown_pct or 0.0)), 4)
    safe_open_risk = round(max(0.0, float(total_open_risk_pct or 0.0)), 4)
    safe_daily_limit = daily_dd_limit_pct if daily_dd_limit_pct is not None and daily_dd_limit_pct > 0 else None
    safe_max_limit = max_dd_limit_pct if max_dd_limit_pct is not None and max_dd_limit_pct > 0 else None
    safe_target = profit_target_pct if profit_target_pct is not None and profit_target_pct > 0 else None
    safe_target_remaining = (
        max(0.0, float(profit_target_remaining_pct))
        if profit_target_remaining_pct is not None and profit_target_remaining_pct >= 0
        else None
    )

    daily_buffer = _remaining_budget(safe_daily_limit, safe_daily_used)
    max_buffer = _remaining_budget(safe_max_limit, safe_max_used)
    active_buffers = [buffer for buffer in (daily_buffer, max_buffer) if buffer is not None]
    risk_allowed_before_open = min(active_buffers) if active_buffers else None
    risk_allowed_after_open = (
        round(max(0.0, risk_allowed_before_open - safe_open_risk), 4)
        if risk_allowed_before_open is not None
        else None
    )

    target_progress = None
    if safe_target is not None and safe_target_remaining is not None:
        target_progress = round(clamp(((safe_target - safe_target_remaining) / safe_target) * 100.0), 4)

    daily_values = finite_numbers(daily_pnls or [])
    active_trading_days = len(daily_values)
    positive_daily_pnls = [pnl for pnl in daily_values if pnl > 0]
    top_day_profit = max(positive_daily_pnls, default=0.0)
    gross_positive_daily_pnl = sum(positive_daily_pnls)
    consistency_limit = (
        consistency_max_day_share_pct
        if consistency_max_day_share_pct is not None and consistency_max_day_share_pct > 0
        else None
    )
    top_day_share = (
        round((top_day_profit / gross_positive_daily_pnl) * 100.0, 4)
        if gross_positive_daily_pnl > 0
        else None
    )
    consistency_pass = None
    consistency_buffer = None
    if consistency_limit is not None and top_day_share is not None:
        consistency_pass = top_day_share <= consistency_limit
        consistency_buffer = round(consistency_limit - top_day_share, 4)

    safe_min_days = minimum_trading_days if minimum_trading_days is not None and minimum_trading_days > 0 else None
    minimum_days_remaining = max(0, safe_min_days - active_trading_days) if safe_min_days is not None else None
    minimum_days_pass = active_trading_days >= safe_min_days if safe_min_days is not None else None
    pass_probability = calculate_prop_firm_pass_probability_metrics(
        returns_pct or [],
        target_remaining_pct=safe_target_remaining,
        max_dd_buffer_pct=max_buffer,
        simulations=pass_probability_simulations,
        horizon_trades=pass_probability_horizon_trades,
    )
    payout_ledger = calculate_prop_firm_payout_ledger_metrics(payout_ledger_entries)

    breach_alert = False
    if daily_buffer is not None and daily_buffer <= 0:
        breach_alert = True
    if max_buffer is not None and max_buffer <= 0:
        breach_alert = True
    if risk_allowed_before_open is not None and safe_open_risk > risk_allowed_before_open:
        breach_alert = True
    if consistency_pass is False:
        breach_alert = True

    if breach_alert:
        alert_level = "breach_or_block"
    elif risk_allowed_after_open is not None and risk_allowed_after_open <= 0:
        alert_level = "no_new_risk"
    elif risk_allowed_after_open is not None and risk_allowed_after_open < 0.25:
        alert_level = "thin_buffer"
    else:
        alert_level = "within_rules"

    risk_allowed_basis = "daily_and_max_dd_limits" if active_buffers else "not_configured"
    allowed_text = (
        f"{risk_allowed_after_open:.2f}%"
        if risk_allowed_after_open is not None
        else "n/a"
    )
    dashboard_text = (
        f"Prop firm buffer: riesgo adicional permitido {allowed_text}; "
        f"estado {alert_level}."
    )
    return PropFirmIntelligenceMetrics(
        equity=round(safe_equity, 2),
        daily_dd_limit_pct=round_optional(safe_daily_limit, 4),
        daily_dd_used_pct=safe_daily_used,
        daily_dd_buffer_pct=daily_buffer,
        daily_dd_buffer_amount=_amount_from_pct(safe_equity, daily_buffer),
        max_dd_limit_pct=round_optional(safe_max_limit, 4),
        max_dd_used_pct=safe_max_used,
        max_dd_buffer_pct=max_buffer,
        max_dd_buffer_amount=_amount_from_pct(safe_equity, max_buffer),
        profit_target_pct=round_optional(safe_target, 4),
        profit_target_remaining_pct=round_optional(safe_target_remaining, 4),
        profit_target_progress_pct=target_progress,
        consistency_rule_limit_pct=round_optional(consistency_limit, 4),
        consistency_top_day_profit_amount=round(top_day_profit, 2),
        consistency_top_day_share_pct=top_day_share,
        consistency_rule_pass=consistency_pass,
        consistency_buffer_pct=consistency_buffer,
        active_trading_days_count=active_trading_days,
        minimum_trading_days=safe_min_days,
        minimum_days_remaining=minimum_days_remaining,
        minimum_days_pass=minimum_days_pass,
        open_risk_pct=safe_open_risk,
        risk_allowed_before_open_risk_pct=risk_allowed_before_open,
        risk_allowed_after_open_risk_pct=risk_allowed_after_open,
        risk_allowed_after_open_risk_amount=_amount_from_pct(safe_equity, risk_allowed_after_open),
        pass_probability=pass_probability,
        payout_ledger=payout_ledger,
        breach_alert=breach_alert,
        alert_level=alert_level,
        risk_allowed_basis=risk_allowed_basis,
        dashboard_text=dashboard_text,
    )


def calculate_tail_risk_metrics(pnl_values: Sequence[float], confidence: float = 0.95) -> TailRiskMetrics:
    """
    Calcula VaR/CVaR histórico desde resultados de trades.

    `pnl_values` usa convención trader: positivo = ganancia, negativo = pérdida.
    Internamente se transforma a distribución de pérdidas con `loss = -pnl`.
    El resultado se expresa como pérdida positiva y se limita a 0 cuando el
    cuantíl cae en zona de ganancia.
    """
    pnls = finite_numbers(pnl_values)
    safe_confidence = min(max(float(confidence), 0.0), 0.9999)
    if not pnls:
        return TailRiskMetrics(
            confidence=round(safe_confidence, 4),
            var_amount=0.0,
            cvar_amount=0.0,
            sample_size=0,
            tail_count=0,
            method="historical",
            dashboard_text="Sin trades cerrados; VaR/CVaR no disponible.",
        )

    losses = [-pnl for pnl in pnls]
    raw_var = percentile(losses, safe_confidence)
    var_amount = max(0.0, raw_var)
    tail_losses = [loss for loss in losses if loss >= raw_var and loss > 0]
    cvar_amount = sum(tail_losses) / len(tail_losses) if tail_losses else var_amount
    label = f"{int(round(safe_confidence * 100))}%"
    return TailRiskMetrics(
        confidence=round(safe_confidence, 4),
        var_amount=round(var_amount, 2),
        cvar_amount=round(max(0.0, cvar_amount), 2),
        sample_size=len(pnls),
        tail_count=len(tail_losses),
        method="historical",
        dashboard_text=f"VaR {label} {format_money(var_amount)}; CVaR {label} {format_money(cvar_amount)}.",
    )


def calculate_parametric_tail_risk_metrics(
    pnl_values: Sequence[float],
    confidence: float = 0.95,
    *,
    min_sample_size: int = 30,
) -> TailRiskMetrics:
    pnls = finite_numbers(pnl_values)
    safe_confidence = min(max(float(confidence), 0.0), 0.9999)
    safe_min_sample = max(2, int(min_sample_size or 30))
    if len(pnls) < safe_min_sample:
        return TailRiskMetrics(
            confidence=round(safe_confidence, 4),
            var_amount=0.0,
            cvar_amount=0.0,
            sample_size=len(pnls),
            tail_count=0,
            method="parametric_normal",
            dashboard_text=f"Muestra menor a {safe_min_sample}; VaR paramétrico no disponible.",
        )

    mean_pnl = sum(pnls) / len(pnls)
    variance = sum((value - mean_pnl) ** 2 for value in pnls) / len(pnls)
    volatility = math.sqrt(variance)
    if volatility <= 0:
        return TailRiskMetrics(
            confidence=round(safe_confidence, 4),
            var_amount=max(0.0, round(-mean_pnl, 2)),
            cvar_amount=max(0.0, round(-mean_pnl, 2)),
            sample_size=len(pnls),
            tail_count=0,
            method="parametric_normal",
            dashboard_text="Distribución sin volatilidad; VaR paramétrico degenerado.",
        )

    normal = NormalDist()
    z_score = normal.inv_cdf(safe_confidence)
    tail_density = math.exp(-0.5 * z_score * z_score) / math.sqrt(2 * math.pi)
    mean_loss = -mean_pnl
    var_amount = max(0.0, mean_loss + (volatility * z_score))
    cvar_amount = max(0.0, mean_loss + (volatility * (tail_density / max(1e-9, 1 - safe_confidence))))
    label = f"{int(round(safe_confidence * 100))}%"
    return TailRiskMetrics(
        confidence=round(safe_confidence, 4),
        var_amount=round(var_amount, 2),
        cvar_amount=round(cvar_amount, 2),
        sample_size=len(pnls),
        tail_count=max(1, round(len(pnls) * (1 - safe_confidence))),
        method="parametric_normal",
        dashboard_text=f"VaR paramétrico {label} {format_money(var_amount)}; CVaR {label} {format_money(cvar_amount)}.",
    )


def calculate_monte_carlo_var_metrics(
    pnl_values: Sequence[float],
    confidence: float = 0.95,
    *,
    simulations: int = 1000,
    horizon_trades: int = 1,
    seed: int = 42,
) -> TailRiskMetrics:
    pnls = finite_numbers(pnl_values)
    safe_confidence = min(max(float(confidence), 0.0), 0.9999)
    safe_simulations = max(1, int(simulations or 1))
    safe_horizon = max(1, int(horizon_trades or 1))
    if not pnls:
        return TailRiskMetrics(
            confidence=round(safe_confidence, 4),
            var_amount=0.0,
            cvar_amount=0.0,
            sample_size=0,
            tail_count=0,
            method="monte_carlo_bootstrap",
            dashboard_text="Sin trades cerrados; VaR Monte Carlo no disponible.",
        )

    rng = random.Random(seed)
    simulated_pnls = [
        sum(rng.choice(pnls) for _trade_index in range(safe_horizon))
        for _simulation_index in range(safe_simulations)
    ]
    base = calculate_tail_risk_metrics(simulated_pnls, confidence=safe_confidence)
    label = f"{int(round(safe_confidence * 100))}%"
    return TailRiskMetrics(
        confidence=base.confidence,
        var_amount=base.var_amount,
        cvar_amount=base.cvar_amount,
        sample_size=len(pnls),
        tail_count=base.tail_count,
        method="monte_carlo_bootstrap",
        dashboard_text=(
            f"VaR Monte Carlo {label} {format_money(base.var_amount)}; "
            f"{safe_simulations} simulaciones, horizonte {safe_horizon} trades."
        ),
    )


def calculate_drawdown_path_metrics(equity_values: Sequence[float]) -> DrawdownPathMetrics:
    equity = finite_numbers(equity_values)
    if not equity:
        return DrawdownPathMetrics(
            max_drawdown_amount=0.0,
            max_drawdown_pct=0.0,
            average_drawdown_amount=0.0,
            average_drawdown_pct=0.0,
            max_drawdown_duration_periods=0,
            longest_underwater_periods=0,
            time_to_recovery_periods=None,
            current_drawdown_pct=0.0,
            recovery_factor=None,
            ulcer_index=0.0,
            peak_value=0.0,
            valley_value=0.0,
            equity_high_water_mark=0.0,
            dashboard_text="Sin curva de equity; drawdown path no disponible.",
        )

    peak_value = equity[0]
    peak_index = 0
    underwater_start: Optional[int] = None
    longest_underwater = 0
    max_drawdown_amount = 0.0
    max_drawdown_pct = 0.0
    max_drawdown_duration = 0
    max_drawdown_peak = peak_value
    max_drawdown_valley = equity[0]
    max_drawdown_valley_index = 0
    drawdown_amounts: List[float] = []
    drawdown_pcts: List[float] = []
    ulcer_components: List[float] = []

    for index, value in enumerate(equity):
        if value >= peak_value:
            if underwater_start is not None:
                longest_underwater = max(longest_underwater, index - underwater_start)
                underwater_start = None
            peak_value = value
            peak_index = index
            ulcer_components.append(0.0)
            continue

        if underwater_start is None:
            underwater_start = peak_index
        drawdown_amount = peak_value - value
        drawdown_pct = (drawdown_amount / peak_value) * 100 if peak_value > 0 else 0.0
        drawdown_amounts.append(drawdown_amount)
        drawdown_pcts.append(drawdown_pct)
        ulcer_components.append(drawdown_pct ** 2)
        if drawdown_amount > max_drawdown_amount:
            max_drawdown_amount = drawdown_amount
            max_drawdown_pct = drawdown_pct
            max_drawdown_duration = index - peak_index
            max_drawdown_peak = peak_value
            max_drawdown_valley = value
            max_drawdown_valley_index = index

    if underwater_start is not None:
        longest_underwater = max(longest_underwater, len(equity) - 1 - underwater_start)

    current_peak = max(equity)
    current_drawdown_pct = ((current_peak - equity[-1]) / current_peak) * 100 if current_peak > 0 else 0.0
    net_profit = equity[-1] - equity[0]
    recovery_factor = (net_profit / max_drawdown_amount) if max_drawdown_amount > 0 else None
    average_drawdown_amount = sum(drawdown_amounts) / len(drawdown_amounts) if drawdown_amounts else 0.0
    average_drawdown_pct = sum(drawdown_pcts) / len(drawdown_pcts) if drawdown_pcts else 0.0
    ulcer_index = math.sqrt(sum(ulcer_components) / len(equity)) if equity else 0.0
    time_to_recovery: Optional[int] = None
    if max_drawdown_amount > 0:
        for recovery_index in range(max_drawdown_valley_index + 1, len(equity)):
            if equity[recovery_index] >= max_drawdown_peak:
                time_to_recovery = recovery_index - max_drawdown_valley_index
                break

    return DrawdownPathMetrics(
        max_drawdown_amount=round(max_drawdown_amount, 2),
        max_drawdown_pct=round(max_drawdown_pct, 4),
        average_drawdown_amount=round(average_drawdown_amount, 2),
        average_drawdown_pct=round(average_drawdown_pct, 4),
        max_drawdown_duration_periods=max_drawdown_duration,
        longest_underwater_periods=longest_underwater,
        time_to_recovery_periods=time_to_recovery,
        current_drawdown_pct=round(max(0.0, current_drawdown_pct), 4),
        recovery_factor=round(recovery_factor, 4) if recovery_factor is not None and math.isfinite(recovery_factor) else None,
        ulcer_index=round(ulcer_index, 4),
        peak_value=round(max_drawdown_peak, 2),
        valley_value=round(max_drawdown_valley, 2),
        equity_high_water_mark=round(current_peak, 2),
        dashboard_text=(
            f"Max DD {format_money(max_drawdown_amount)} ({max_drawdown_pct:.2f}%) "
            f"durante {max_drawdown_duration} periodos."
        ),
    )


def calculate_monte_carlo_risk_summary(
    returns_pct: Sequence[float],
    *,
    simulations: int = 1000,
    horizon_trades: Optional[int] = None,
    ruin_threshold_pct: float = 20.0,
    seed: int = 42,
) -> MonteCarloRiskSummary:
    """
    Simula secuencias de retornos por trade mediante bootstrap con reemplazo.

    `returns_pct` son retornos porcentuales por operación, por ejemplo:
    -0.5 representa -0.5% de equity y 1.2 representa +1.2%.
    """
    returns = finite_numbers(returns_pct)
    sample_size = len(returns)
    safe_simulations = max(1, int(simulations or 1))
    safe_horizon = max(1, int(horizon_trades or sample_size or 1))
    safe_ruin_threshold = max(0.0, float(ruin_threshold_pct or 0.0))

    if not returns:
        return MonteCarloRiskSummary(
            simulations=safe_simulations,
            horizon_trades=safe_horizon,
            ruin_threshold_pct=round(safe_ruin_threshold, 4),
            ruin_probability_pct=0.0,
            median_return_pct=0.0,
            p05_return_pct=0.0,
            p95_return_pct=0.0,
            median_max_drawdown_pct=0.0,
            p95_max_drawdown_pct=0.0,
            sample_size=0,
            dashboard_text="Sin retornos; Monte Carlo no disponible.",
        )

    rng = random.Random(seed)
    ending_returns: List[float] = []
    max_drawdowns: List[float] = []
    ruin_hits = 0
    ruin_level = 100.0 * (1 - (safe_ruin_threshold / 100.0))

    for _ in range(safe_simulations):
        equity = 100.0
        peak = equity
        max_drawdown = 0.0
        ruined = False
        for _trade_index in range(safe_horizon):
            trade_return_pct = rng.choice(returns)
            equity *= max(0.0, 1 + (trade_return_pct / 100.0))
            peak = max(peak, equity)
            drawdown_pct = ((peak - equity) / peak) * 100 if peak > 0 else 100.0
            max_drawdown = max(max_drawdown, drawdown_pct)
            if equity <= ruin_level:
                ruined = True
        if ruined:
            ruin_hits += 1
        ending_returns.append(equity - 100.0)
        max_drawdowns.append(max_drawdown)

    ruin_probability_pct = (ruin_hits / safe_simulations) * 100.0
    return MonteCarloRiskSummary(
        simulations=safe_simulations,
        horizon_trades=safe_horizon,
        ruin_threshold_pct=round(safe_ruin_threshold, 4),
        ruin_probability_pct=round(ruin_probability_pct, 4),
        median_return_pct=round(percentile(ending_returns, 0.50), 4),
        p05_return_pct=round(percentile(ending_returns, 0.05), 4),
        p95_return_pct=round(percentile(ending_returns, 0.95), 4),
        median_max_drawdown_pct=round(percentile(max_drawdowns, 0.50), 4),
        p95_max_drawdown_pct=round(percentile(max_drawdowns, 0.95), 4),
        sample_size=sample_size,
        dashboard_text=(
            f"Riesgo de ruina {ruin_probability_pct:.2f}% con límite "
            f"-{safe_ruin_threshold:.1f}% en {safe_horizon} trades."
        ),
    )


def _risk_of_ruin_confidence(sample_size: int) -> tuple[str, str]:
    safe_sample = max(0, int(sample_size or 0))
    if safe_sample <= 0:
        return "unavailable", "Sin muestra"
    if safe_sample < 30:
        return "low", "Baja"
    if safe_sample < 100:
        return "medium", "Media"
    return "high", "Alta"


def calculate_analytical_risk_of_ruin(
    *,
    sample_size: int,
    win_rate_pct: float,
    payoff_ratio: Optional[float],
    risk_per_trade_pct: float,
    ruin_threshold_pct: float = 20.0,
    risk_per_trade_basis: str = "policy_max_risk_per_trade_pct",
) -> RiskOfRuinMetrics:
    """
    Aproximación analítica de Risk of Ruin para sizing fijo por trade.

    Modela cada trade como +payoff_ratio R con probabilidad `win_rate` y -1R
    con probabilidad de pérdida. La probabilidad de tocar el umbral se estima
    con una aproximación Brownian/infinite-horizon:

        P(ruin) ~= exp(-2 * edge_R * risk_units_to_ruin / variance_R)

    Si el edge es <= 0, la ruina eventual se considera 100% para evitar una
    lectura optimista falsa. Monte Carlo sigue siendo la lectura empírica para
    distribuciones reales de retornos.
    """
    safe_sample = max(0, int(sample_size or 0))
    safe_threshold = round(max(0.0, float(ruin_threshold_pct or 0.0)), 4)
    safe_risk = round(max(0.0, float(risk_per_trade_pct or 0.0)), 4)
    confidence_level, confidence_label = _risk_of_ruin_confidence(safe_sample)
    payoff = payoff_ratio if payoff_ratio is not None and payoff_ratio > 0 else None
    win_probability = min(max(float(win_rate_pct or 0.0) / 100.0, 0.0), 1.0)
    loss_probability = 1.0 - win_probability

    if safe_sample <= 0 or payoff is None or safe_risk <= 0 or safe_threshold <= 0:
        return RiskOfRuinMetrics(
            sample_size=safe_sample,
            method="analytical_brownian",
            ruin_threshold_pct=safe_threshold,
            risk_per_trade_pct=safe_risk,
            risk_per_trade_basis=risk_per_trade_basis,
            win_rate_pct=round(win_probability * 100.0, 4),
            payoff_ratio=round_optional(payoff, 4),
            expectancy_r=None,
            risk_units_to_ruin=None,
            analytic_ruin_probability_pct=None,
            confidence_level=confidence_level,
            confidence_label=confidence_label,
            dashboard_text="Risk of Ruin analítico pendiente de muestra, payoff, riesgo por trade y umbral de ruina.",
        )

    expectancy_r = (win_probability * payoff) - loss_probability
    risk_units_to_ruin = safe_threshold / safe_risk
    if loss_probability <= 0:
        probability_pct = 0.0
    elif win_probability <= 0 or expectancy_r <= 0:
        probability_pct = 100.0
    else:
        variance_r = (
            win_probability * ((payoff - expectancy_r) ** 2)
            + loss_probability * ((-1.0 - expectancy_r) ** 2)
        )
        probability_pct = 0.0 if variance_r <= 0 else math.exp((-2.0 * expectancy_r * risk_units_to_ruin) / variance_r) * 100.0

    probability_pct = min(100.0, max(0.0, probability_pct))
    text_probability = f"{probability_pct:.2f}%"
    return RiskOfRuinMetrics(
        sample_size=safe_sample,
        method="analytical_brownian",
        ruin_threshold_pct=safe_threshold,
        risk_per_trade_pct=safe_risk,
        risk_per_trade_basis=risk_per_trade_basis,
        win_rate_pct=round(win_probability * 100.0, 4),
        payoff_ratio=round_optional(payoff, 4),
        expectancy_r=round_optional(expectancy_r, 4),
        risk_units_to_ruin=round_optional(risk_units_to_ruin, 4),
        analytic_ruin_probability_pct=round(probability_pct, 4),
        confidence_level=confidence_level,
        confidence_label=confidence_label,
        dashboard_text=(
            f"Risk of Ruin analítico {text_probability} con límite -{safe_threshold:.2f}% "
            f"y {safe_risk:.2f}% de riesgo por trade; confianza {confidence_label.lower()}."
        ),
    )


def _normalized_discipline_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    replacements = {
        "á": "a",
        "é": "e",
        "í": "i",
        "ó": "o",
        "ú": "u",
        "ü": "u",
        "ñ": "n",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return " ".join(text.split())


def _score_compliance_value(value: Any) -> Optional[float]:
    if isinstance(value, bool):
        return 100.0 if value else 20.0
    text = _normalized_discipline_text(value)
    if not text:
        return None
    if text in {"true", "1"}:
        return 100.0
    if text in {"false", "0"}:
        return 20.0
    if any(token in text for token in ("cumplida", "cumplido", "passed", "pass", "ok", "todo correcto", "full", "si", "yes")):
        return 100.0
    if any(token in text for token in ("parcial", "partial", "mixed", "warning", "duda")):
        return 65.0
    if any(token in text for token in ("rota", "roto", "incumplida", "incumplido", "failed", "fail", "broken", "violation", "no")):
        return 20.0
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if math.isfinite(numeric):
        return clamp(numeric, 0.0, 100.0)
    return None


def _score_emotion_value(value: Any) -> Optional[float]:
    text = _normalized_discipline_text(value)
    if not text:
        return None
    if any(token in text for token in ("calma", "calm", "tranquilo", "focused", "foco")):
        return 100.0
    if any(token in text for token in ("confianza", "confidence")):
        return 90.0
    if "neutral" in text:
        return 80.0
    if any(token in text for token in ("duda", "doubt", "hesitation")):
        return 65.0
    if any(token in text for token in ("ansiedad", "anxiety", "fomo", "impulso", "impulsive", "frustracion", "tilt", "revenge", "rabia", "ira")):
        return 35.0
    return None


def _has_mistake(value: Any) -> bool:
    text = _normalized_discipline_text(value)
    if not text:
        return False
    return text not in {"no", "none", "n/a", "na", "sin error", "sin errores", "ninguno", "-"}


def _iter_rule_answers(trade: dict[str, Any]) -> Iterable[Any]:
    for key in (
        "londonConfirmation",
        "london_confirmation",
        "obEntry",
        "ob_entry",
        "validSetup",
        "valid_setup",
        "beActivated",
        "be_activated",
        "allowedPairs",
        "allowed_pairs",
        "plan_followed",
        "followed_plan",
    ):
        if key in trade and trade.get(key) is not None:
            yield trade.get(key)
    custom_answers = trade.get("customAnswers") or trade.get("custom_answers")
    if isinstance(custom_answers, dict):
        for value in custom_answers.values():
            if isinstance(value, bool):
                yield value


def calculate_strategy_discipline_metrics(trades: Sequence[dict[str, Any]]) -> StrategyDisciplineMetrics:
    sample_size = len(trades or [])
    if sample_size <= 0:
        return StrategyDisciplineMetrics(
            sample_size=0,
            tagged_sample_size=0,
            coverage_pct=0.0,
            discipline_score=None,
            compliance_score=None,
            rule_pass_rate_pct=None,
            mistake_rate_pct=0.0,
            emotional_risk_rate_pct=None,
            confidence_level="unavailable",
            dashboard_text="Sin trades; disciplina por estrategia no disponible.",
        )

    trade_scores: list[float] = []
    compliance_scores: list[float] = []
    rule_answers = 0
    rule_passes = 0
    mistake_count = 0
    emotion_scores: list[float] = []
    emotional_risk_count = 0

    for trade in trades:
        evidence_scores: list[float] = []
        for key in (
            "compliance",
            "execution_compliance",
            "discipline_compliance",
            "rule_compliance",
            "plan_compliance",
            "tag_status",
        ):
            if key not in trade:
                continue
            score = _score_compliance_value(trade.get(key))
            if score is not None:
                evidence_scores.append(score)
                compliance_scores.append(score)

        for answer in _iter_rule_answers(trade):
            score = _score_compliance_value(answer)
            if score is None:
                continue
            evidence_scores.append(score)
            rule_answers += 1
            if score >= 80.0:
                rule_passes += 1

        emotion_score = _score_emotion_value(
            trade.get("emotion")
            or trade.get("emotionalState")
            or trade.get("emotional_state")
        )
        if emotion_score is not None:
            evidence_scores.append(emotion_score)
            emotion_scores.append(emotion_score)
            if emotion_score < 60.0:
                emotional_risk_count += 1

        mistake_present = _has_mistake(
            trade.get("mistake")
            or trade.get("error")
            or trade.get("execution_error")
            or trade.get("main_mistake")
        )
        if mistake_present:
            mistake_count += 1
            if not evidence_scores:
                evidence_scores.append(45.0)

        if not evidence_scores:
            continue
        trade_score = sum(evidence_scores) / len(evidence_scores)
        if mistake_present:
            trade_score -= 12.0
        if trade.get("tagSkipped") is True or trade.get("tag_skipped") is True:
            trade_score -= 10.0
        if trade.get("tagPartial") is True or trade.get("tag_partial") is True:
            trade_score -= 6.0
        trade_scores.append(clamp(trade_score))

    tagged_sample_size = len(trade_scores)
    coverage_pct = round((tagged_sample_size / sample_size) * 100.0, 4) if sample_size else 0.0
    discipline_score = round(sum(trade_scores) / tagged_sample_size, 4) if tagged_sample_size else None
    compliance_score = round(sum(compliance_scores) / len(compliance_scores), 4) if compliance_scores else None
    rule_pass_rate = round((rule_passes / rule_answers) * 100.0, 4) if rule_answers else None
    mistake_rate = round((mistake_count / tagged_sample_size) * 100.0, 4) if tagged_sample_size else 0.0
    emotional_risk_rate = round((emotional_risk_count / len(emotion_scores)) * 100.0, 4) if emotion_scores else None

    if tagged_sample_size <= 0:
        confidence = "unavailable"
        text = "Sin tags reales de ejecución; Strategy Score usa solo rendimiento y riesgo."
    elif tagged_sample_size < 5 or coverage_pct < 35.0:
        confidence = "low"
        text = f"Disciplina {discipline_score:.1f}/100 con cobertura baja ({coverage_pct:.1f}%)."
    elif tagged_sample_size < 20 or coverage_pct < 70.0:
        confidence = "medium"
        text = f"Disciplina {discipline_score:.1f}/100 con cobertura media ({coverage_pct:.1f}%)."
    else:
        confidence = "high"
        text = f"Disciplina {discipline_score:.1f}/100 con cobertura alta ({coverage_pct:.1f}%)."

    return StrategyDisciplineMetrics(
        sample_size=sample_size,
        tagged_sample_size=tagged_sample_size,
        coverage_pct=coverage_pct,
        discipline_score=discipline_score,
        compliance_score=compliance_score,
        rule_pass_rate_pct=rule_pass_rate,
        mistake_rate_pct=mistake_rate,
        emotional_risk_rate_pct=emotional_risk_rate,
        confidence_level=confidence,
        dashboard_text=text,
    )


def calculate_strategy_score_metrics(
    performance: TradePerformanceMetrics,
    drawdown_path: DrawdownPathMetrics,
    tail_risk_95: TailRiskMetrics,
    risk_of_ruin: RiskOfRuinMetrics,
    discipline: Optional[StrategyDisciplineMetrics] = None,
) -> StrategyScoreMetrics:
    sample_size = max(0, int(performance.sample_size or 0))

    if sample_size <= 0:
        return StrategyScoreMetrics(
            sample_size=0,
            score=0.0,
            grade="F",
            status="discarded",
            profitability_score=0.0,
            stability_score=0.0,
            risk_score=0.0,
            sample_score=0.0,
            expectancy_r=None,
            profit_factor=None,
            recovery_factor=None,
            max_drawdown_pct=0.0,
            var_95_amount=0.0,
            risk_of_ruin_pct=None,
            overoptimization_alert=False,
            dashboard_text="Sin muestra; Strategy Score no disponible.",
        )

    profit_factor = performance.profit_factor
    if profit_factor is None:
        profit_factor_component = 100.0 if performance.net_pnl > 0 and performance.losses_count == 0 else 35.0
    else:
        profit_factor_component = clamp(((profit_factor - 0.8) / 1.2) * 100.0)

    expectancy_r = performance.expectancy_r
    if expectancy_r is None and performance.average_loss > 0:
        expectancy_r = performance.average_trade / performance.average_loss
    if expectancy_r is None:
        expectancy_component = 75.0 if performance.average_trade > 0 else 20.0 if performance.average_trade < 0 else 50.0
    else:
        expectancy_component = clamp(50.0 + (expectancy_r * 50.0))

    win_rate_component = clamp(((performance.win_rate_pct - 35.0) / 35.0) * 100.0)
    profitability_score = (
        (profit_factor_component * 0.45)
        + (expectancy_component * 0.40)
        + (win_rate_component * 0.15)
    )
    if performance.net_pnl <= 0:
        profitability_score = min(profitability_score, 35.0)

    top_1_share = performance.outlier_dependency.top_1_share_pct
    outlier_penalty = 0.0
    if top_1_share is not None and top_1_share > 50.0:
        outlier_penalty = min(30.0, (top_1_share - 50.0) * 0.8)

    recovery_bonus = 0.0
    if drawdown_path.recovery_factor is not None:
        recovery_bonus = clamp(drawdown_path.recovery_factor * 4.0, 0.0, 12.0)
    stability_score = clamp(
        100.0
        - min(45.0, drawdown_path.max_drawdown_pct * 4.0)
        - min(35.0, drawdown_path.ulcer_index * 4.0)
        - min(20.0, drawdown_path.longest_underwater_periods * 1.2)
        - outlier_penalty
        + recovery_bonus
    )

    ruin_probability = risk_of_ruin.analytic_ruin_probability_pct
    ruin_component = 45.0 if ruin_probability is None else clamp(100.0 - (ruin_probability * 5.0))
    tail_basis = max(
        performance.average_loss,
        performance.average_win,
        abs(performance.average_trade),
        1.0,
    )
    tail_ratio = tail_risk_95.cvar_amount / tail_basis
    tail_component = clamp(100.0 - (max(0.0, tail_ratio - 1.0) * 30.0))
    risk_score = (ruin_component * 0.65) + (tail_component * 0.35)

    if sample_size < 30:
        sample_score = clamp((sample_size / 30.0) * 55.0)
    elif sample_size < 100:
        sample_score = 55.0 + (((sample_size - 30.0) / 70.0) * 30.0)
    else:
        sample_score = clamp(85.0 + min(15.0, ((sample_size - 100.0) / 200.0) * 15.0))

    score = clamp(
        (profitability_score * 0.35)
        + (stability_score * 0.25)
        + (risk_score * 0.20)
        + (sample_score * 0.20)
    )
    discipline_score = discipline.discipline_score if discipline is not None else None
    discipline_coverage_pct = discipline.coverage_pct if discipline is not None else 0.0
    discipline_sample_size = discipline.tagged_sample_size if discipline is not None else 0
    discipline_confidence = discipline.confidence_level if discipline is not None else "unavailable"
    if discipline_score is not None:
        coverage_ratio = min(max(discipline_coverage_pct / 100.0, 0.0), 1.0)
        coverage_adjusted_discipline = (discipline_score * coverage_ratio) + (50.0 * (1.0 - coverage_ratio))
        score = clamp(
            (profitability_score * 0.30)
            + (stability_score * 0.22)
            + (risk_score * 0.18)
            + (sample_score * 0.15)
            + (coverage_adjusted_discipline * 0.15)
        )

    if score >= 85.0:
        grade = "A"
    elif score >= 70.0:
        grade = "B"
    elif score >= 55.0:
        grade = "C"
    elif score >= 40.0:
        grade = "D"
    else:
        grade = "F"

    synthetic_profit_factor = profit_factor if profit_factor is not None else (999.0 if performance.net_pnl > 0 and performance.losses_count == 0 else 0.0)
    curve_too_clean = drawdown_path.max_drawdown_pct < 1.0 and performance.losses_count <= max(1, round(sample_size * 0.05))
    outlier_heavy = top_1_share is not None and top_1_share > 65.0
    overoptimization_alert = bool(
        (sample_size < 30 and synthetic_profit_factor >= 3.0)
        or (sample_size < 100 and synthetic_profit_factor >= 4.0 and curve_too_clean)
        or outlier_heavy
    )

    if sample_size < 30:
        status = "testing"
    elif score >= 70.0 and risk_score >= 60.0 and stability_score >= 55.0:
        status = "active"
    elif score >= 45.0:
        status = "paused"
    else:
        status = "discarded"
    if discipline_score is not None and discipline_coverage_pct >= 35.0 and discipline_score < 55.0 and status == "active":
        status = "paused"

    status_label = {
        "testing": "testing",
        "active": "activa",
        "paused": "pausada",
        "discarded": "descartada",
    }[status]
    ruin_text = "sin lectura" if ruin_probability is None else f"{ruin_probability:.2f}%"
    dashboard_text = (
        f"Strategy Score {grade} {score:.1f}/100; estado {status_label}. "
        f"RoR {ruin_text}, VaR95 {format_money(tail_risk_95.var_amount)}, "
        f"DD {drawdown_path.max_drawdown_pct:.2f}%."
    )
    if overoptimization_alert:
        dashboard_text += " Revisar posible sobreoptimizacion o dependencia de outliers."
    if discipline_score is not None:
        dashboard_text += f" Disciplina real {discipline_score:.1f}/100; cobertura {discipline_coverage_pct:.1f}%."
    elif discipline is not None:
        dashboard_text += " Sin tags reales de disciplina para esta estrategia."

    return StrategyScoreMetrics(
        sample_size=sample_size,
        score=round(score, 2),
        grade=grade,
        status=status,
        profitability_score=round(profitability_score, 2),
        stability_score=round(stability_score, 2),
        risk_score=round(risk_score, 2),
        sample_score=round(sample_score, 2),
        expectancy_r=round_optional(expectancy_r, 4),
        profit_factor=round_optional(profit_factor, 4),
        recovery_factor=round_optional(drawdown_path.recovery_factor, 4),
        max_drawdown_pct=round(drawdown_path.max_drawdown_pct, 4),
        var_95_amount=round(tail_risk_95.var_amount, 2),
        risk_of_ruin_pct=round_optional(ruin_probability, 4),
        overoptimization_alert=overoptimization_alert,
        dashboard_text=dashboard_text,
        discipline_score=round_optional(discipline_score, 4),
        discipline_coverage_pct=round(discipline_coverage_pct, 4),
        discipline_sample_size=discipline_sample_size,
        discipline_confidence=discipline_confidence,
    )


def calculate_pearson_correlation(series_a: Sequence[float], series_b: Sequence[float]) -> Optional[float]:
    length = min(len(series_a), len(series_b))
    if length < 2:
        return None

    values_a = finite_numbers(series_a[:length])
    values_b = finite_numbers(series_b[:length])
    if len(values_a) != length or len(values_b) != length:
        return None

    mean_a = sum(values_a) / length
    mean_b = sum(values_b) / length
    variance_a = sum((value - mean_a) ** 2 for value in values_a)
    variance_b = sum((value - mean_b) ** 2 for value in values_b)
    if variance_a <= 0 or variance_b <= 0:
        return None

    covariance = sum((a - mean_a) * (b - mean_b) for a, b in zip(values_a, values_b))
    return round(covariance / math.sqrt(variance_a * variance_b), 4)


def _aligned_series(values: Sequence[float], length: int) -> List[float]:
    numbers = finite_numbers(values)
    if len(numbers) >= length:
        return numbers[:length]
    return numbers + ([0.0] * (length - len(numbers)))


def _strategy_heat_level(heat_score: float) -> str:
    if heat_score >= 70.0:
        return "high"
    if heat_score >= 45.0:
        return "elevated"
    if heat_score >= 20.0:
        return "moderate"
    if heat_score > 0.0:
        return "low"
    return "none"


def calculate_strategy_correlation_metrics(
    strategy_series: Dict[str, Sequence[float]],
    *,
    basis: str = "daily_realized_pnl",
) -> StrategyCorrelationMetrics:
    strategies = sorted(key for key, values in strategy_series.items() if values)
    bucket_count = max((len(strategy_series[strategy]) for strategy in strategies), default=0)
    if len(strategies) < 2 or bucket_count < 2:
        return StrategyCorrelationMetrics(
            basis=basis,
            strategy_count=len(strategies),
            bucket_count=bucket_count,
            pair_count=0,
            pairs=[],
            dashboard_text="Correlacion entre estrategias pendiente de al menos dos estrategias con historico comparable.",
        )

    aligned = {
        strategy: _aligned_series(strategy_series[strategy], bucket_count)
        for strategy in strategies
    }
    pairs: List[StrategyCorrelationPairMetrics] = []
    for index, strategy_a in enumerate(strategies):
        for strategy_b in strategies[index + 1:]:
            series_a = aligned[strategy_a]
            series_b = aligned[strategy_b]
            correlation = calculate_pearson_correlation(series_a, series_b)
            overlap_periods = sum(1 for a, b in zip(series_a, series_b) if a != 0 or b != 0)
            co_loss_periods = sum(1 for a, b in zip(series_a, series_b) if a < 0 and b < 0)
            co_loss_amount = sum(abs(a) + abs(b) for a, b in zip(series_a, series_b) if a < 0 and b < 0)
            co_loss_ratio = co_loss_periods / max(1, overlap_periods)
            positive_correlation = max(0.0, correlation or 0.0)
            heat_score = clamp((positive_correlation * 65.0) + (co_loss_ratio * 35.0))
            heat_level = _strategy_heat_level(heat_score)
            corr_text = "n/a" if correlation is None else f"{correlation:.2f}"
            pairs.append(StrategyCorrelationPairMetrics(
                strategy_a=strategy_a,
                strategy_b=strategy_b,
                correlation=round_optional(correlation, 4),
                overlap_periods=overlap_periods,
                co_loss_periods=co_loss_periods,
                co_loss_amount=round(co_loss_amount, 2),
                heat_score=round(heat_score, 2),
                heat_level=heat_level,
                dashboard_text=(
                    f"{strategy_a} / {strategy_b}: corr {corr_text}, "
                    f"{co_loss_periods} periodos de perdida conjunta."
                ),
            ))

    pairs.sort(key=lambda pair: (pair.heat_score, pair.co_loss_amount), reverse=True)
    top_pair = pairs[0] if pairs else None
    dashboard_text = (
        f"{len(pairs)} pares comparados; mayor heat {top_pair.strategy_a} / {top_pair.strategy_b} "
        f"({top_pair.heat_score:.1f}/100)."
        if top_pair is not None
        else "Sin pares de estrategias comparables."
    )
    return StrategyCorrelationMetrics(
        basis=basis,
        strategy_count=len(strategies),
        bucket_count=bucket_count,
        pair_count=len(pairs),
        pairs=pairs,
        dashboard_text=dashboard_text,
    )


def calculate_strategy_portfolio_heat_metrics(
    correlation_metrics: StrategyCorrelationMetrics,
) -> StrategyPortfolioHeatMetrics:
    top_pairs = sorted(
        correlation_metrics.pairs,
        key=lambda pair: (pair.heat_score, pair.co_loss_amount),
        reverse=True,
    )[:5]
    high_heat_pairs = [
        pair for pair in correlation_metrics.pairs
        if pair.heat_level in {"high", "elevated"}
    ]
    score_basis = top_pairs[:3]
    portfolio_heat_score = sum(pair.heat_score for pair in score_basis) / len(score_basis) if score_basis else 0.0
    highest_pair = f"{top_pairs[0].strategy_a} / {top_pairs[0].strategy_b}" if top_pairs else None
    dashboard_text = (
        f"Portfolio heat {portfolio_heat_score:.1f}/100; foco en {highest_pair}."
        if highest_pair
        else "Portfolio heat pendiente de pares correlacionados."
    )
    return StrategyPortfolioHeatMetrics(
        basis=correlation_metrics.basis,
        strategy_count=correlation_metrics.strategy_count,
        bucket_count=correlation_metrics.bucket_count,
        pair_count=correlation_metrics.pair_count,
        high_heat_pair_count=len(high_heat_pairs),
        portfolio_heat_score=round(portfolio_heat_score, 2),
        highest_heat_pair=highest_pair,
        top_pairs=top_pairs,
        dashboard_text=dashboard_text,
    )


def _allocation_status_cap(status: str) -> float:
    if status == "active":
        return 100.0
    if status == "paused":
        return 20.0
    if status == "testing":
        return 10.0
    return 0.0


def _dict_float(data: Dict[str, Any], key: str, default: float = 0.0) -> float:
    try:
        value = float(data.get(key, default))
    except (TypeError, ValueError):
        return default
    return value if math.isfinite(value) else default


def calculate_strategy_allocation_summary(
    strategy_rows: Sequence[Dict[str, Any]],
    *,
    total_risk_budget_pct: Optional[float] = None,
    basis: str = "strategy_score_risk_budget",
) -> StrategyAllocationSummaryMetrics:
    safe_budget = total_risk_budget_pct if total_risk_budget_pct is not None and total_risk_budget_pct > 0 else None
    prepared: List[Dict[str, Any]] = []
    for row in strategy_rows:
        strategy = str(row.get("strategy") or "Sin estrategia")
        score_data = row.get("strategy_score") if isinstance(row.get("strategy_score"), dict) else {}
        score = clamp(_dict_float(score_data, "score"))
        risk_score = clamp(_dict_float(score_data, "risk_score"))
        stability_score = clamp(_dict_float(score_data, "stability_score"))
        sample_score = clamp(_dict_float(score_data, "sample_score"))
        status = str(score_data.get("status") or "discarded")
        status_multiplier = {
            "active": 1.0,
            "paused": 0.35,
            "testing": 0.25,
            "discarded": 0.0,
        }.get(status, 0.0)
        basis_score = score * (risk_score / 100.0) * (stability_score / 100.0) * (sample_score / 100.0) * status_multiplier
        prepared.append({
            "strategy": strategy,
            "status": status,
            "score": score,
            "basis_score": max(0.0, basis_score),
            "cap": _allocation_status_cap(status),
        })

    total_basis = sum(item["basis_score"] for item in prepared)
    allocations: List[StrategyAllocationMetrics] = []
    for item in prepared:
        uncapped_allocation = (item["basis_score"] / total_basis) * 100.0 if total_basis > 0 else 0.0
        allocation_pct = min(uncapped_allocation, item["cap"])
        risk_budget_pct = (allocation_pct / 100.0) * safe_budget if safe_budget is not None else None
        text_budget = (
            f", presupuesto {risk_budget_pct:.2f}%"
            if risk_budget_pct is not None
            else ""
        )
        allocations.append(StrategyAllocationMetrics(
            strategy=item["strategy"],
            allocation_pct=round(allocation_pct, 2),
            risk_budget_pct=round_optional(risk_budget_pct, 4),
            basis_score=round(item["basis_score"], 4),
            status=item["status"],
            score=round(item["score"], 2),
            dashboard_text=(
                f"{item['strategy']}: {allocation_pct:.1f}% del presupuesto relativo"
                f"{text_budget}; estado {item['status']}."
            ),
        ))

    allocations.sort(key=lambda item: (item.allocation_pct, item.basis_score), reverse=True)
    total_allocation = min(100.0, sum(item.allocation_pct for item in allocations))
    reserve_allocation = max(0.0, 100.0 - total_allocation)
    allocated_count = sum(1 for item in allocations if item.allocation_pct > 0)
    risk_budget_basis = "portfolio_heat_limit_pct" if safe_budget is not None else "relative_share_only"
    dashboard_text = (
        f"Asignacion por riesgo: {total_allocation:.1f}% distribuido, "
        f"{reserve_allocation:.1f}% en reserva."
    )
    return StrategyAllocationSummaryMetrics(
        basis=basis,
        strategy_count=len(prepared),
        allocated_count=allocated_count,
        total_allocation_pct=round(total_allocation, 2),
        reserve_allocation_pct=round(reserve_allocation, 2),
        total_risk_budget_pct=round_optional(safe_budget, 4),
        risk_budget_basis=risk_budget_basis,
        allocations=allocations,
        dashboard_text=dashboard_text,
    )


def get_operating_date(now: Optional[datetime], broker_timezone: str) -> date:
    current_time = ensure_aware(now)
    tz = ZoneInfo(broker_timezone)
    return current_time.astimezone(tz).date()


def get_correlation(symbol_a: str, symbol_b: str, matrix: Dict[str, Dict[str, float]]) -> float:
    a = normalize_symbol(symbol_a)
    b = normalize_symbol(symbol_b)
    if a == b:
        return 1.0
    return matrix.get(a, {}).get(b) or matrix.get(b, {}).get(a) or 0.0


def direction_factor(position_a: Position, position_b: Position) -> int:
    """
    Convierte el lado de la posición en signo de exposición.

    En la fórmula:
        rho_ij * direction_factor

    usamos:
        +1 si ambas posiciones empujan en el mismo sentido de exposición
        -1 si están en direcciones opuestas

    Esto permite que:
        - correlación positiva + lados opuestos => compensación parcial
        - correlación negativa + lados opuestos => amplificación de riesgo
    """
    return 1 if position_a.side == position_b.side else -1


def compute_total_open_risk(positions: Sequence[Position]) -> tuple[float, float]:
    total_amount = sum(position.risk_amount for position in positions)
    total_pct = sum(position.risk_pct for position in positions)
    return round(total_amount, 2), round(total_pct, 4)


def detect_correlated_exposure(
    positions: Sequence[Position],
    policy: RiskPolicy,
) -> CorrelationExposure:
    """
    Calcula riesgo efectivo por clúster correlacionado con la fórmula:

        effective_cluster_risk² =
            Σ(r_i²) + 2 Σ(r_i * r_j * rho_ij * direction_factor)

    Luego:

        effective_cluster_risk = sqrt(max(0, effective_cluster_risk²))

    Notas:
        - r_i se modela aquí en porcentaje de riesgo, no en dinero.
        - el clúster se construye con pares cuya |correlación| supera el umbral
          o son el mismo símbolo.
        - direction_factor introduce la orientación de la exposición.
    """
    if not positions:
        return CorrelationExposure(
            alert=False,
            symbols=[],
            effective_risk_pct=0.0,
            gross_risk_pct=0.0,
            cluster_breakdown=[],
            dashboard_text="Sin posiciones abiertas; no hay exposición correlacionada.",
        )

    adjacency: Dict[int, set[int]] = {index: set() for index in range(len(positions))}
    pair_meta: Dict[tuple[int, int], Dict[str, float]] = {}

    for i, position_i in enumerate(positions):
        for j in range(i + 1, len(positions)):
            position_j = positions[j]
            rho = get_correlation(position_i.symbol, position_j.symbol, policy.symbol_correlation_matrix)
            if not math.isfinite(rho):
                continue
            if abs(rho) < policy.correlation_threshold:
                continue

            adjacency[i].add(j)
            adjacency[j].add(i)
            pair_meta[(i, j)] = {
                "rho": round(rho, 4),
                "direction_factor": float(direction_factor(position_i, position_j)),
            }

    visited: set[int] = set()
    components: List[List[int]] = []
    for root in range(len(positions)):
        if root in visited:
            continue
        stack = [root]
        component: List[int] = []
        while stack:
            node = stack.pop()
            if node in visited:
                continue
            visited.add(node)
            component.append(node)
            stack.extend(adjacency[node] - visited)
        components.append(component)

    cluster_breakdown: List[ClusterDetail] = []
    top_cluster: Optional[ClusterDetail] = None

    for component in components:
        component_positions = [positions[index] for index in component]
        gross_risk_pct = sum(
            position.risk_pct
            for position in component_positions
            if math.isfinite(position.risk_pct) and position.risk_pct > 0
        )

        squared_risk_sum = sum(
            position.risk_pct ** 2
            for position in component_positions
            if math.isfinite(position.risk_pct) and position.risk_pct > 0
        )
        covariance_term = 0.0
        pair_details: List[Dict[str, float]] = []

        for component_index, i in enumerate(component):
            for j in component[component_index + 1:]:
                meta = pair_meta.get((min(i, j), max(i, j)))
                if not meta:
                    continue

                position_i = positions[i]
                position_j = positions[j]
                rho = meta["rho"]
                dir_factor = meta["direction_factor"]
                if not (
                    math.isfinite(position_i.risk_pct)
                    and math.isfinite(position_j.risk_pct)
                    and position_i.risk_pct >= 0
                    and position_j.risk_pct >= 0
                ):
                    continue

                pair_contribution = 2 * position_i.risk_pct * position_j.risk_pct * rho * dir_factor
                if not math.isfinite(pair_contribution):
                    continue
                covariance_term += pair_contribution
                pair_details.append(
                    {
                        "position_i": i,
                        "position_j": j,
                        "rho": round(rho, 4),
                        "direction_factor": dir_factor,
                        "pair_contribution": round(pair_contribution, 6),
                    }
                )

        effective_risk_squared = squared_risk_sum + covariance_term
        if not math.isfinite(effective_risk_squared):
            effective_risk_squared = 0.0
        effective_risk_pct = math.sqrt(max(0.0, effective_risk_squared))
        if not math.isfinite(effective_risk_pct):
            effective_risk_pct = 0.0
        cluster = ClusterDetail(
            symbols=sorted({normalize_symbol(position.symbol) for position in component_positions}),
            position_ids=[position.position_id for position in component_positions],
            pair_count=len(pair_details),
            effective_risk_pct=round(effective_risk_pct, 4),
            gross_risk_pct=round(gross_risk_pct, 4),
            exceeds_limit=len(component_positions) > 1 and effective_risk_pct > policy.max_correlated_risk_pct,
            details=pair_details,
        )
        cluster_breakdown.append(cluster)
        if top_cluster is None or cluster.effective_risk_pct > top_cluster.effective_risk_pct:
            top_cluster = cluster

    assert top_cluster is not None
    alert = top_cluster.exceeds_limit
    if alert:
        dashboard_text = (
            f"Riesgo correlacionado efectivo {top_cluster.effective_risk_pct:.2f}% "
            f"en {', '.join(top_cluster.symbols)}."
        )
    else:
        dashboard_text = "La exposición correlacionada efectiva está dentro del límite."

    return CorrelationExposure(
        alert=alert,
        symbols=top_cluster.symbols,
        effective_risk_pct=top_cluster.effective_risk_pct,
        gross_risk_pct=top_cluster.gross_risk_pct,
        cluster_breakdown=cluster_breakdown,
        dashboard_text=dashboard_text,
    )


def calculate_recovery_metrics(current_equity: float, equity_peak: float) -> RecoveryMetrics:
    if equity_peak <= 0:
        raise ValueError("EQUITY_PEAK debe ser mayor que cero.")
    if current_equity <= 0:
        raise ValueError("La equity actual debe ser mayor que cero.")

    if current_equity >= equity_peak:
        return RecoveryMetrics(
            drawdown_amount=0.0,
            drawdown_pct=0.0,
            recovery_pct=0.0,
            dashboard_text="Equity en peak; no hay drawdown activo.",
        )

    drawdown_amount = equity_peak - current_equity
    drawdown_decimal = drawdown_amount / equity_peak
    if drawdown_decimal >= 0.999999:
        raise ValueError("El drawdown es demasiado extremo para calcular recuperación segura.")

    recovery_pct = (1 / (1 - drawdown_decimal)) - 1
    return RecoveryMetrics(
        drawdown_amount=round(drawdown_amount, 2),
        drawdown_pct=round(drawdown_decimal * 100, 4),
        recovery_pct=round(recovery_pct * 100, 4),
        dashboard_text=(
            f"DD {format_money(drawdown_amount)} ({drawdown_decimal * 100:.2f}%). "
            f"Recuperación requerida {recovery_pct * 100:.2f}%."
        ),
    )


def level_step_down(current_level: str, ladder: Sequence[str]) -> str:
    if current_level not in ladder:
        return ladder[0]
    index = ladder.index(current_level)
    if index == 0:
        return ladder[0]
    return ladder[index - 1]


def evaluate_volatility_signal(
    *,
    current_atr: Optional[float],
    atr_history: Optional[Sequence[float]],
    current_level: str,
    current_recommended_level: str,
    override_active: bool,
    last_volatility_change_at: Optional[datetime],
    confirmation_count: int,
    normalization_count: int,
    now: Optional[datetime],
    policy: RiskPolicy,
) -> tuple[VolatilitySignal, bool, str, int, int, Optional[datetime]]:
    current_time = ensure_aware(now)
    if current_atr is None or not atr_history:
        signal = VolatilitySignal(
            triggered=False,
            previous_level=current_level,
            suggested_level=current_recommended_level,
            atr_ratio=1.0,
            override_active=override_active,
            confirmation_count=confirmation_count,
            cooldown_active=False,
            dashboard_text="Sin datos ATR suficientes; mantener recomendación actual.",
        )
        return signal, override_active, current_recommended_level, confirmation_count, normalization_count, last_volatility_change_at

    history = [
        value
        for value in atr_history[-policy.atr_lookback_days:]
        if isinstance(value, (int, float)) and math.isfinite(value) and value > 0
    ]
    if not history:
        raise ValueError("Se requiere histórico ATR válido.")

    avg_atr = sum(history) / len(history)
    atr_ratio = current_atr / avg_atr
    cooldown_active = False
    if last_volatility_change_at is not None:
        cooldown_active = (current_time - last_volatility_change_at).total_seconds() < policy.volatility_cooldown_minutes * 60

    new_override_active = override_active
    new_recommended_level = current_recommended_level
    new_confirmation_count = confirmation_count
    new_normalization_count = normalization_count
    new_change_at = last_volatility_change_at

    if atr_ratio >= policy.atr_vol_multiplier_threshold:
        new_confirmation_count += 1
        new_normalization_count = 0
        if (
            not override_active
            and new_confirmation_count >= policy.volatility_confirmation_events
            and not cooldown_active
        ):
            new_override_active = True
            new_recommended_level = level_step_down(current_level, policy.risk_ladder)
            new_change_at = current_time
    elif atr_ratio <= policy.atr_release_multiplier_threshold:
        new_normalization_count += 1
        new_confirmation_count = 0
        if (
            override_active
            and new_normalization_count >= policy.volatility_confirmation_events
            and not cooldown_active
        ):
            new_override_active = False
            new_recommended_level = current_level
            new_change_at = current_time
    else:
        new_confirmation_count = 0
        new_normalization_count = 0

    signal = VolatilitySignal(
        triggered=atr_ratio >= policy.atr_vol_multiplier_threshold,
        previous_level=current_level,
        suggested_level=new_recommended_level,
        atr_ratio=round(atr_ratio, 4),
        override_active=new_override_active,
        confirmation_count=max(new_confirmation_count, new_normalization_count),
        cooldown_active=cooldown_active,
        dashboard_text=(
            f"ATR ratio {atr_ratio:.2f}x. "
            f"{'Override activo.' if new_override_active else 'Sin override activo.'}"
        ),
    )
    return (
        signal,
        new_override_active,
        new_recommended_level,
        new_confirmation_count,
        new_normalization_count,
        new_change_at,
    )
