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
