"""
Configuración y política editable del motor de riesgo.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Tuple


EQUITY_PEAK: float = 100_000.00
CURRENT_LEVEL: str = "BASE"

SYMBOL_CORRELATION_MATRIX: Dict[str, Dict[str, float]] = {
    "EURUSD": {"GBPUSD": 0.86, "DXY": -0.91, "XAUUSD": 0.28},
    "GBPUSD": {"EURUSD": 0.86, "DXY": -0.79, "XAUUSD": 0.21},
    "DXY": {"EURUSD": -0.91, "GBPUSD": -0.79, "XAUUSD": -0.35},
    "XAUUSD": {"EURUSD": 0.28, "GBPUSD": 0.21, "DXY": -0.35, "XAGUSD": 0.88},
    "XAGUSD": {"XAUUSD": 0.88},
    "NAS100": {"US500": 0.92},
    "US500": {"NAS100": 0.92},
}

MAX_CORRELATED_RISK: float = 1.25
MAX_TOTAL_OPEN_RISK_PCT: float = 2.50
CORRELATION_THRESHOLD: float = 0.80
ATR_VOL_MULTIPLIER_THRESHOLD: float = 1.30
ATR_RELEASE_MULTIPLIER_THRESHOLD: float = 1.10
ATR_LOOKBACK_DAYS: int = 5
DAILY_DD_LIMIT: float = 0.012
MAX_DD_LIMIT: float = 0.06
PANIC_LOCK_HOURS: int = 24
BROKER_TIMEZONE: str = "UTC"
VOLATILITY_CONFIRMATION_EVENTS: int = 2
VOLATILITY_COOLDOWN_MINUTES: int = 30

RISK_LADDER: Tuple[str, ...] = ("PROTECT", "BASE", "+1", "+2", "+3")
RISK_LADDER_PCT: Dict[str, float] = {
    "PROTECT": 0.25,
    "BASE": 0.50,
    "+1": 0.75,
    "+2": 1.00,
    "+3": 1.25,
}


@dataclass(frozen=True)
class RiskPolicy:
    equity_peak: float = EQUITY_PEAK
    current_level: str = CURRENT_LEVEL
    risk_ladder: Tuple[str, ...] = RISK_LADDER
    risk_ladder_pct: Dict[str, float] = field(default_factory=lambda: dict(RISK_LADDER_PCT))
    symbol_correlation_matrix: Dict[str, Dict[str, float]] = field(
        default_factory=lambda: {key: dict(value) for key, value in SYMBOL_CORRELATION_MATRIX.items()}
    )
    max_risk_per_trade_pct: float = RISK_LADDER_PCT[CURRENT_LEVEL]
    max_total_open_risk_pct: float = MAX_TOTAL_OPEN_RISK_PCT
    max_correlated_risk_pct: float = MAX_CORRELATED_RISK
    correlation_threshold: float = CORRELATION_THRESHOLD
    atr_vol_multiplier_threshold: float = ATR_VOL_MULTIPLIER_THRESHOLD
    atr_release_multiplier_threshold: float = ATR_RELEASE_MULTIPLIER_THRESHOLD
    atr_lookback_days: int = ATR_LOOKBACK_DAYS
    daily_dd_limit: float = DAILY_DD_LIMIT
    max_dd_limit: float = MAX_DD_LIMIT
    panic_lock_hours: int = PANIC_LOCK_HOURS
    broker_timezone: str = BROKER_TIMEZONE
    volatility_confirmation_events: int = VOLATILITY_CONFIRMATION_EVENTS
    volatility_cooldown_minutes: int = VOLATILITY_COOLDOWN_MINUTES


def default_risk_policy() -> RiskPolicy:
    return RiskPolicy()
