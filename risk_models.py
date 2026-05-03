"""
Modelos tipados del motor de riesgo.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class Side(str, Enum):
    LONG = "long"
    SHORT = "short"


class RiskStatus(str, Enum):
    WITHIN_LIMITS = "within_limits"
    ACTIVE_MONITORING = "active_monitoring"
    PROTECTION_MODE = "protection_mode"
    MANUAL_LOCK = "manual_lock"


class AlertCode(str, Enum):
    EXPOSURE_DUPLICATED = "EXPOSURE_DUPLICATED"
    DAILY_DD_LIMIT = "DAILY_DD_LIMIT"
    MAX_DD_LIMIT = "MAX_DD_LIMIT"
    LOSS_STREAK_PROTECTION = "LOSS_STREAK_PROTECTION"
    TOTAL_OPEN_RISK = "TOTAL_OPEN_RISK"
    PANIC_LOCK = "PANIC_LOCK"
    VOLATILITY_STEP_DOWN = "VOLATILITY_STEP_DOWN"


class DecisionCode(str, Enum):
    ALLOWED = "ALLOWED"
    PANIC_LOCK_ACTIVE = "PANIC_LOCK_ACTIVE"
    MAX_DD_LIMIT_BREACH = "MAX_DD_LIMIT_BREACH"
    DAILY_DD_LIMIT_BREACH = "DAILY_DD_LIMIT_BREACH"
    TRADE_RISK_ABOVE_LEVEL = "TRADE_RISK_ABOVE_LEVEL"
    TOTAL_OPEN_RISK_BREACH = "TOTAL_OPEN_RISK_BREACH"
    CORRELATED_RISK_BREACH = "CORRELATED_RISK_BREACH"
    VOLATILITY_OVERRIDE_ACTIVE = "VOLATILITY_OVERRIDE_ACTIVE"


class SyncState(str, Enum):
    ACTIVE = "activo_mt5"
    PENDING = "pendiente"
    DISABLED = "desactivado"


@dataclass(frozen=True)
class Position:
    position_id: str
    symbol: str
    side: Side
    risk_pct: float
    risk_amount: float
    size: float
    entry_price: float
    stop_loss: float
    opened_at: datetime
    strategy_tag: Optional[str] = None
    current_price: Optional[float] = None


@dataclass(frozen=True)
class RiskAlert:
    code: AlertCode
    active: bool
    severity: str
    title: str
    message: str
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ClusterDetail:
    symbols: List[str]
    position_ids: List[str]
    pair_count: int
    effective_risk_pct: float
    gross_risk_pct: float
    exceeds_limit: bool
    details: List[Dict[str, Any]]


@dataclass(frozen=True)
class CorrelationExposure:
    alert: bool
    symbols: List[str]
    effective_risk_pct: float
    gross_risk_pct: float
    cluster_breakdown: List[ClusterDetail]
    dashboard_text: str


@dataclass(frozen=True)
class RecoveryMetrics:
    drawdown_amount: float
    drawdown_pct: float
    recovery_pct: float
    dashboard_text: str


@dataclass(frozen=True)
class TailRiskMetrics:
    confidence: float
    var_amount: float
    cvar_amount: float
    sample_size: int
    tail_count: int
    method: str
    dashboard_text: str


@dataclass(frozen=True)
class SampleQualityMetrics:
    sample_size: int
    level: str
    label: str
    min_trades_for_acceptable: int
    min_trades_for_robust: int
    dashboard_text: str


@dataclass(frozen=True)
class OutlierDependencyMetrics:
    top_1_pnl: float
    top_3_pnl: float
    top_5_pnl: float
    top_1_share_pct: Optional[float]
    top_3_share_pct: Optional[float]
    top_5_share_pct: Optional[float]
    denominator_pnl: float
    dashboard_text: str


@dataclass(frozen=True)
class TradePerformanceMetrics:
    sample_size: int
    wins_count: int
    losses_count: int
    breakeven_count: int
    win_rate_pct: float
    loss_rate_pct: float
    breakeven_rate_pct: float
    gross_profit: float
    gross_loss: float
    net_pnl: float
    average_trade: float
    average_win: float
    average_loss: float
    profit_factor: Optional[float]
    payoff_ratio: Optional[float]
    expectancy_amount: float
    expectancy_r: Optional[float]
    average_r: Optional[float]
    best_trade: float
    worst_trade: float
    max_consecutive_wins: int
    max_consecutive_losses: int
    outlier_dependency: OutlierDependencyMetrics
    sample_quality: SampleQualityMetrics
    dashboard_text: str


@dataclass(frozen=True)
class DrawdownPathMetrics:
    max_drawdown_amount: float
    max_drawdown_pct: float
    average_drawdown_amount: float
    average_drawdown_pct: float
    max_drawdown_duration_periods: int
    longest_underwater_periods: int
    time_to_recovery_periods: Optional[int]
    current_drawdown_pct: float
    recovery_factor: Optional[float]
    ulcer_index: float
    peak_value: float
    valley_value: float
    equity_high_water_mark: float
    dashboard_text: str


@dataclass(frozen=True)
class MonteCarloRiskSummary:
    simulations: int
    horizon_trades: int
    ruin_threshold_pct: float
    ruin_probability_pct: float
    median_return_pct: float
    p05_return_pct: float
    p95_return_pct: float
    median_max_drawdown_pct: float
    p95_max_drawdown_pct: float
    sample_size: int
    dashboard_text: str


@dataclass(frozen=True)
class RiskOfRuinMetrics:
    sample_size: int
    method: str
    ruin_threshold_pct: float
    risk_per_trade_pct: float
    risk_per_trade_basis: str
    win_rate_pct: float
    payoff_ratio: Optional[float]
    expectancy_r: Optional[float]
    risk_units_to_ruin: Optional[float]
    analytic_ruin_probability_pct: Optional[float]
    confidence_level: str
    confidence_label: str
    dashboard_text: str


@dataclass(frozen=True)
class StrategyDisciplineMetrics:
    sample_size: int
    tagged_sample_size: int
    coverage_pct: float
    discipline_score: Optional[float]
    compliance_score: Optional[float]
    rule_pass_rate_pct: Optional[float]
    mistake_rate_pct: float
    emotional_risk_rate_pct: Optional[float]
    confidence_level: str
    dashboard_text: str


@dataclass(frozen=True)
class StrategyScoreMetrics:
    sample_size: int
    score: float
    grade: str
    status: str
    profitability_score: float
    stability_score: float
    risk_score: float
    sample_score: float
    expectancy_r: Optional[float]
    profit_factor: Optional[float]
    recovery_factor: Optional[float]
    max_drawdown_pct: float
    var_95_amount: float
    risk_of_ruin_pct: Optional[float]
    overoptimization_alert: bool
    dashboard_text: str
    discipline_score: Optional[float] = None
    discipline_coverage_pct: float = 0.0
    discipline_sample_size: int = 0
    discipline_confidence: str = "unavailable"


@dataclass(frozen=True)
class StrategyCorrelationPairMetrics:
    strategy_a: str
    strategy_b: str
    correlation: Optional[float]
    overlap_periods: int
    co_loss_periods: int
    co_loss_amount: float
    heat_score: float
    heat_level: str
    dashboard_text: str


@dataclass(frozen=True)
class StrategyCorrelationMetrics:
    basis: str
    strategy_count: int
    bucket_count: int
    pair_count: int
    pairs: List[StrategyCorrelationPairMetrics]
    dashboard_text: str


@dataclass(frozen=True)
class StrategyPortfolioHeatMetrics:
    basis: str
    strategy_count: int
    bucket_count: int
    pair_count: int
    high_heat_pair_count: int
    portfolio_heat_score: float
    highest_heat_pair: Optional[str]
    top_pairs: List[StrategyCorrelationPairMetrics]
    dashboard_text: str


@dataclass(frozen=True)
class StrategyAllocationMetrics:
    strategy: str
    allocation_pct: float
    risk_budget_pct: Optional[float]
    basis_score: float
    status: str
    score: float
    dashboard_text: str


@dataclass(frozen=True)
class StrategyAllocationSummaryMetrics:
    basis: str
    strategy_count: int
    allocated_count: int
    total_allocation_pct: float
    reserve_allocation_pct: float
    total_risk_budget_pct: Optional[float]
    risk_budget_basis: str
    allocations: List[StrategyAllocationMetrics]
    dashboard_text: str


@dataclass(frozen=True)
class PropFirmPassProbabilityMetrics:
    simulations: int
    horizon_trades: int
    sample_size: int
    target_remaining_pct: Optional[float]
    max_dd_buffer_pct: Optional[float]
    pass_probability_pct: Optional[float]
    rule_breach_probability_pct: Optional[float]
    timeout_probability_pct: Optional[float]
    basis: str
    dashboard_text: str


@dataclass(frozen=True)
class PropFirmPayoutLedgerMetrics:
    entry_count: int
    gross_gains_amount: float
    withdrawals_amount: float
    fees_amount: float
    refunds_amount: float
    adjustments_amount: float
    net_cashflow_amount: float
    dashboard_text: str


@dataclass(frozen=True)
class PropFirmIntelligenceMetrics:
    equity: float
    daily_dd_limit_pct: Optional[float]
    daily_dd_used_pct: float
    daily_dd_buffer_pct: Optional[float]
    daily_dd_buffer_amount: Optional[float]
    max_dd_limit_pct: Optional[float]
    max_dd_used_pct: float
    max_dd_buffer_pct: Optional[float]
    max_dd_buffer_amount: Optional[float]
    profit_target_pct: Optional[float]
    profit_target_remaining_pct: Optional[float]
    profit_target_progress_pct: Optional[float]
    consistency_rule_limit_pct: Optional[float]
    consistency_top_day_profit_amount: float
    consistency_top_day_share_pct: Optional[float]
    consistency_rule_pass: Optional[bool]
    consistency_buffer_pct: Optional[float]
    active_trading_days_count: int
    minimum_trading_days: Optional[int]
    minimum_days_remaining: Optional[int]
    minimum_days_pass: Optional[bool]
    open_risk_pct: float
    risk_allowed_before_open_risk_pct: Optional[float]
    risk_allowed_after_open_risk_pct: Optional[float]
    risk_allowed_after_open_risk_amount: Optional[float]
    pass_probability: PropFirmPassProbabilityMetrics
    payout_ledger: PropFirmPayoutLedgerMetrics
    breach_alert: bool
    alert_level: str
    risk_allowed_basis: str
    dashboard_text: str


@dataclass(frozen=True)
class RiskAdjustedMetrics:
    sample_size: int
    return_basis: str
    mean_return_pct: float
    volatility_pct: float
    downside_deviation_pct: float
    total_return_pct: float
    sharpe_ratio: Optional[float]
    sortino_ratio: Optional[float]
    calmar_ratio: Optional[float]
    gain_to_pain_ratio: Optional[float]
    tail_ratio: Optional[float]
    skewness: Optional[float]
    kurtosis: Optional[float]
    excess_kurtosis: Optional[float]
    p05_return_pct: float
    p95_return_pct: float
    max_drawdown_pct: float
    dashboard_text: str


@dataclass(frozen=True)
class SizingSurvivalMetrics:
    sample_size: int
    kelly_fraction_pct: Optional[float]
    half_kelly_pct: Optional[float]
    quarter_kelly_pct: Optional[float]
    recommended_fractional_kelly_pct: Optional[float]
    kelly_state: str
    daily_risk_budget_remaining_pct: Optional[float]
    daily_risk_budget_after_open_risk_pct: Optional[float]
    daily_risk_budget_remaining_amount: Optional[float]
    weekly_risk_budget_remaining_pct: Optional[float]
    weekly_risk_budget_after_open_risk_pct: Optional[float]
    weekly_risk_budget_remaining_amount: Optional[float]
    weekly_budget_basis: str
    open_heat_pct: float
    open_heat_amount: float
    open_heat_limit_pct: Optional[float]
    open_heat_usage_ratio_pct: Optional[float]
    max_trade_risk_pct: float
    max_trade_risk_policy_pct: Optional[float]
    max_trade_risk_usage_ratio_pct: Optional[float]
    risk_to_target_ratio_pct: Optional[float]
    risk_to_target_basis: str
    risk_to_ruin_ratio_pct: Optional[float]
    risk_to_ruin_basis: str
    dashboard_text: str


@dataclass(frozen=True)
class VolatilitySignal:
    triggered: bool
    previous_level: str
    suggested_level: str
    atr_ratio: float
    override_active: bool
    confirmation_count: int
    cooldown_active: bool
    dashboard_text: str


@dataclass(frozen=True)
class OrderRequest:
    position_id: str
    symbol: str
    side: Side
    risk_pct: float
    risk_amount: float
    size: float
    entry_price: float
    stop_loss: float
    strategy_tag: Optional[str] = None


@dataclass(frozen=True)
class OrderDecision:
    allowed: bool
    severity: str
    reason_code: DecisionCode
    message: str
    suggested_action: str
    state_snapshot: "RiskEngineSnapshot"


@dataclass
class RiskEngineState:
    equity_peak: float
    current_equity: float
    daily_start_equity: float
    daily_peak_equity: float
    current_level: str
    recommended_level: str
    volatility_override_active: bool = False
    volatility_confirmation_count: int = 0
    volatility_normalization_count: int = 0
    last_volatility_change_at: Optional[datetime] = None
    open_positions: Dict[str, Position] = field(default_factory=dict)
    active_alerts: List[RiskAlert] = field(default_factory=list)
    loss_streak: int = 0
    panic_lock_started_at: Optional[datetime] = None
    panic_lock_expires_at: Optional[datetime] = None
    last_equity_update_at: Optional[datetime] = None
    last_operating_date: Optional[date] = None
    mt5_limit_states: Dict[str, SyncState] = field(
        default_factory=lambda: {
            "risk_per_trade": SyncState.ACTIVE,
            "daily_dd_limit": SyncState.ACTIVE,
            "max_dd_limit": SyncState.ACTIVE,
        }
    )


@dataclass(frozen=True)
class RiskEngineSnapshot:
    risk_status: RiskStatus
    dominant_risk_trigger: str
    blocking_rule: str
    action_required: str
    remaining_daily_margin_pct: float
    total_open_risk_amount: float
    total_open_risk_pct: float
    effective_correlated_risk: float
    recovery_metrics: RecoveryMetrics
    volatility_signal: VolatilitySignal
    recommended_level: str
    volatility_override_active: bool
    panic_lock_active: bool
    panic_lock_expires_at: Optional[datetime]
    mt5_limit_states: Dict[str, str]
    active_alerts: List[RiskAlert]
