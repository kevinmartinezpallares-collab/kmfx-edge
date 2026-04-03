"""
Motor event-driven de riesgo institucional-lite.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timedelta
from typing import List, Optional, Sequence

from risk_math import (
    calculate_recovery_metrics,
    compute_total_open_risk,
    detect_correlated_exposure,
    ensure_aware,
    evaluate_volatility_signal,
    get_operating_date,
)
from risk_models import (
    AlertCode,
    DecisionCode,
    OrderDecision,
    OrderRequest,
    Position,
    RiskAlert,
    RiskEngineSnapshot,
    RiskEngineState,
    RiskStatus,
)
from risk_policy import RiskPolicy, default_risk_policy


class RiskEngine:
    def __init__(
        self,
        policy: Optional[RiskPolicy] = None,
        state: Optional[RiskEngineState] = None,
        max_loss_streak: int = 3,
    ) -> None:
        self.policy = deepcopy(policy or default_risk_policy())
        self.max_loss_streak = max_loss_streak
        self.state = deepcopy(state) if state is not None else RiskEngineState(
            equity_peak=self.policy.equity_peak,
            current_equity=self.policy.equity_peak,
            daily_start_equity=self.policy.equity_peak,
            daily_peak_equity=self.policy.equity_peak,
            current_level=self.policy.current_level,
            recommended_level=self.policy.current_level,
        )

    # ------------------------------------------------------------------
    # Panic lock
    # ------------------------------------------------------------------

    def activate_panic_lock(self, now: Optional[datetime] = None) -> datetime:
        current_time = ensure_aware(now)
        self.state.panic_lock_started_at = current_time
        self.state.panic_lock_expires_at = current_time + timedelta(hours=self.policy.panic_lock_hours)
        return self.state.panic_lock_expires_at

    def is_panic_lock_active(self, now: Optional[datetime] = None) -> bool:
        current_time = ensure_aware(now)
        return bool(self.state.panic_lock_expires_at and current_time < self.state.panic_lock_expires_at)

    # ------------------------------------------------------------------
    # Eventos
    # ------------------------------------------------------------------

    def on_tick(self, now: Optional[datetime] = None) -> RiskEngineSnapshot:
        current_time = ensure_aware(now)
        self._roll_daily_window(current_time)
        return self._snapshot(current_time)

    def on_price_update(
        self,
        symbol: str,
        price: float,
        now: Optional[datetime] = None,
    ) -> RiskEngineSnapshot:
        current_time = ensure_aware(now)
        self._roll_daily_window(current_time)
        for position_id, position in list(self.state.open_positions.items()):
            if position.symbol.upper() == symbol.upper():
                self.state.open_positions[position_id] = replace(position, current_price=price)
        return self._snapshot(current_time)

    def on_order_request(
        self,
        order: OrderRequest,
        now: Optional[datetime] = None,
    ) -> OrderDecision:
        current_time = ensure_aware(now)
        self._roll_daily_window(current_time)
        snapshot = self._snapshot(current_time)
        effective_trade_risk_limit = self._effective_trade_risk_limit()
        total_open_risk_amount, total_open_risk_pct = compute_total_open_risk(list(self.state.open_positions.values()))

        if self.is_panic_lock_active(current_time):
            return self._deny(
                DecisionCode.PANIC_LOCK_ACTIVE,
                "critical",
                "Bloqueo manual activo.",
                "No abras nuevas órdenes hasta que expire o liberes el panic lock.",
                snapshot,
            )

        if self._max_drawdown_breached():
            return self._deny(
                DecisionCode.MAX_DD_LIMIT_BREACH,
                "critical",
                "Máximo drawdown consumido.",
                "Bloquea operativa y reevalúa capital antes de continuar.",
                snapshot,
            )

        if self._daily_drawdown_breached():
            return self._deny(
                DecisionCode.DAILY_DD_LIMIT_BREACH,
                "critical",
                "Límite de DD diario superado.",
                "Cierra operativa y espera el siguiente día operativo.",
                snapshot,
            )

        if order.risk_pct > effective_trade_risk_limit:
            if self.state.volatility_override_active:
                return self._deny(
                    DecisionCode.VOLATILITY_OVERRIDE_ACTIVE,
                    "warning",
                    f"Override de volatilidad activo. Riesgo permitido <= {effective_trade_risk_limit:.2f}%.",
                    "Opera al nivel recomendado mientras persista la volatilidad alta.",
                    snapshot,
                )
            return self._deny(
                DecisionCode.TRADE_RISK_ABOVE_LEVEL,
                "high",
                f"Riesgo por trade {order.risk_pct:.2f}% por encima del nivel permitido.",
                f"Reduce la orden a <= {effective_trade_risk_limit:.2f}%.",
                snapshot,
            )

        prospective_total_pct = total_open_risk_pct + order.risk_pct
        if prospective_total_pct > self.policy.max_total_open_risk_pct:
            return self._deny(
                DecisionCode.TOTAL_OPEN_RISK_BREACH,
                "high",
                f"Riesgo abierto total {prospective_total_pct:.2f}% supera el límite.",
                f"Recorta exposición total por debajo de {self.policy.max_total_open_risk_pct:.2f}%.",
                snapshot,
            )

        prospective_positions = list(self.state.open_positions.values()) + [
            Position(
                position_id=order.position_id,
                symbol=order.symbol,
                side=order.side,
                risk_pct=order.risk_pct,
                risk_amount=order.risk_amount,
                size=order.size,
                entry_price=order.entry_price,
                stop_loss=order.stop_loss,
                opened_at=current_time,
                strategy_tag=order.strategy_tag,
                current_price=order.entry_price,
            )
        ]
        correlated = detect_correlated_exposure(prospective_positions, self.policy)
        if correlated.alert:
            return self._deny(
                DecisionCode.CORRELATED_RISK_BREACH,
                "high",
                correlated.dashboard_text,
                "Reduce clúster correlacionado antes de añadir riesgo nuevo.",
                snapshot,
            )

        if self.state.volatility_override_active:
            return OrderDecision(
                allowed=True,
                severity="warning",
                reason_code=DecisionCode.ALLOWED,
                message="Orden aprobada con override de volatilidad activo.",
                suggested_action=f"Mantén el riesgo <= {effective_trade_risk_limit:.2f}% mientras dure el override.",
                state_snapshot=snapshot,
            )

        return OrderDecision(
            allowed=True,
            severity="info",
            reason_code=DecisionCode.ALLOWED,
            message="Orden aprobada por el gatekeeper de riesgo.",
            suggested_action="Enviar orden a MT5.",
            state_snapshot=snapshot,
        )

    def on_position_opened(self, position: Position, now: Optional[datetime] = None) -> RiskEngineSnapshot:
        current_time = ensure_aware(now)
        self._roll_daily_window(current_time)
        self.state.open_positions[position.position_id] = position
        return self._snapshot(current_time)

    def on_position_closed(
        self,
        position_id: str,
        realized_pnl: float,
        now: Optional[datetime] = None,
    ) -> RiskEngineSnapshot:
        current_time = ensure_aware(now)
        self._roll_daily_window(current_time)
        self.state.open_positions.pop(position_id, None)
        self.state.current_equity += realized_pnl
        self.state.daily_peak_equity = max(self.state.daily_peak_equity, self.state.current_equity)
        if realized_pnl < 0:
            self.state.loss_streak += 1
        else:
            self.state.loss_streak = 0
        return self._snapshot(current_time)

    def on_equity_update(
        self,
        equity: float,
        now: Optional[datetime] = None,
        current_atr: Optional[float] = None,
        atr_history: Optional[Sequence[float]] = None,
    ) -> RiskEngineSnapshot:
        current_time = ensure_aware(now)
        if equity <= 0:
            raise ValueError("La equity debe ser mayor que cero.")

        self._roll_daily_window(current_time)
        self.state.current_equity = equity
        self.state.last_equity_update_at = current_time
        self.state.equity_peak = max(self.state.equity_peak, equity)
        self.state.daily_peak_equity = max(self.state.daily_peak_equity, equity)

        (
            _signal,
            self.state.volatility_override_active,
            self.state.recommended_level,
            self.state.volatility_confirmation_count,
            self.state.volatility_normalization_count,
            self.state.last_volatility_change_at,
        ) = evaluate_volatility_signal(
            current_atr=current_atr,
            atr_history=atr_history,
            current_level=self.state.current_level,
            current_recommended_level=self.state.recommended_level,
            override_active=self.state.volatility_override_active,
            last_volatility_change_at=self.state.last_volatility_change_at,
            confirmation_count=self.state.volatility_confirmation_count,
            normalization_count=self.state.volatility_normalization_count,
            now=current_time,
            policy=self.policy,
        )
        return self._snapshot(current_time, current_atr=current_atr, atr_history=atr_history)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _deny(
        self,
        reason_code: DecisionCode,
        severity: str,
        message: str,
        suggested_action: str,
        snapshot: RiskEngineSnapshot,
    ) -> OrderDecision:
        return OrderDecision(
            allowed=False,
            severity=severity or "warning",
            reason_code=reason_code,
            message=message or "Orden bloqueada por validación de riesgo.",
            suggested_action=suggested_action or "Revisar estado del motor antes de continuar.",
            state_snapshot=snapshot,
        )

    def _effective_trade_risk_limit(self) -> float:
        effective_level = self.state.recommended_level if self.state.volatility_override_active else self.state.current_level
        return float(self.policy.risk_ladder_pct.get(effective_level, self.policy.max_risk_per_trade_pct))

    def _roll_daily_window(self, now: datetime) -> None:
        operating_date = get_operating_date(now, self.policy.broker_timezone)
        if self.state.last_operating_date == operating_date:
            return
        self.state.last_operating_date = operating_date
        self.state.daily_start_equity = self.state.current_equity
        self.state.daily_peak_equity = self.state.current_equity

    def _snapshot(
        self,
        now: datetime,
        current_atr: Optional[float] = None,
        atr_history: Optional[Sequence[float]] = None,
    ) -> RiskEngineSnapshot:
        positions = list(self.state.open_positions.values())
        total_open_risk_amount, total_open_risk_pct = compute_total_open_risk(positions)
        correlated = detect_correlated_exposure(positions, self.policy)
        recovery = calculate_recovery_metrics(self.state.current_equity, self.state.equity_peak)
        volatility_signal, _, _, _, _, _ = evaluate_volatility_signal(
            current_atr=current_atr,
            atr_history=atr_history,
            current_level=self.state.current_level,
            current_recommended_level=self.state.recommended_level,
            override_active=self.state.volatility_override_active,
            last_volatility_change_at=self.state.last_volatility_change_at,
            confirmation_count=self.state.volatility_confirmation_count,
            normalization_count=self.state.volatility_normalization_count,
            now=now,
            policy=self.policy,
        )
        alerts = self._build_alerts(now, total_open_risk_pct, correlated, volatility_signal)
        self.state.active_alerts = list(alerts)
        risk_status, dominant_trigger, blocking_rule, action_required = self._derive_system_state(alerts, correlated)
        return RiskEngineSnapshot(
            risk_status=risk_status,
            dominant_risk_trigger=dominant_trigger,
            blocking_rule=blocking_rule,
            action_required=action_required,
            remaining_daily_margin_pct=round(self._remaining_daily_margin_pct(), 4),
            total_open_risk_amount=round(total_open_risk_amount, 2),
            total_open_risk_pct=round(total_open_risk_pct, 4),
            effective_correlated_risk=correlated.effective_risk_pct,
            recovery_metrics=recovery,
            volatility_signal=volatility_signal,
            recommended_level=self.state.recommended_level,
            volatility_override_active=self.state.volatility_override_active,
            panic_lock_active=self.is_panic_lock_active(now),
            panic_lock_expires_at=self.state.panic_lock_expires_at,
            mt5_limit_states={key: value.value for key, value in dict(self.state.mt5_limit_states).items()},
            active_alerts=list(alerts),
        )

    def _build_alerts(
        self,
        now: datetime,
        total_open_risk_pct: float,
        correlated,
        volatility_signal,
    ) -> List[RiskAlert]:
        alerts: List[RiskAlert] = []
        if self._max_drawdown_breached():
            alerts.append(
                RiskAlert(
                    code=AlertCode.MAX_DD_LIMIT,
                    active=True,
                    severity="critical",
                    title="Max DD consumido",
                    message="La cuenta superó el drawdown máximo permitido.",
                    details={"max_dd_limit": self.policy.max_dd_limit},
                )
            )
        if self._daily_drawdown_breached():
            alerts.append(
                RiskAlert(
                    code=AlertCode.DAILY_DD_LIMIT,
                    active=True,
                    severity="critical",
                    title="DD diario consumido",
                    message="El límite diario de drawdown está agotado.",
                    details={"daily_dd_limit": self.policy.daily_dd_limit},
                )
            )
        if self.state.loss_streak >= self.max_loss_streak:
            alerts.append(
                RiskAlert(
                    code=AlertCode.LOSS_STREAK_PROTECTION,
                    active=True,
                    severity="critical",
                    title="Racha de pérdidas",
                    message=f"Racha de {self.state.loss_streak} pérdidas consecutivas.",
                    details={"loss_streak": self.state.loss_streak},
                )
            )
        if total_open_risk_pct > self.policy.max_total_open_risk_pct:
            alerts.append(
                RiskAlert(
                    code=AlertCode.TOTAL_OPEN_RISK,
                    active=True,
                    severity="high",
                    title="Riesgo abierto total",
                    message=f"Riesgo abierto {total_open_risk_pct:.2f}% supera el límite permitido.",
                    details={"total_open_risk_pct": total_open_risk_pct},
                )
            )
        if correlated.alert:
            alerts.append(
                RiskAlert(
                    code=AlertCode.EXPOSURE_DUPLICATED,
                    active=True,
                    severity="high",
                    title="Exposición correlacionada",
                    message=correlated.dashboard_text,
                    details={"effective_correlated_risk": correlated.effective_risk_pct},
                )
            )
        if volatility_signal.override_active:
            alerts.append(
                RiskAlert(
                    code=AlertCode.VOLATILITY_STEP_DOWN,
                    active=True,
                    severity="warning",
                    title="Override de volatilidad",
                    message=volatility_signal.dashboard_text,
                    details={"suggested_level": volatility_signal.suggested_level},
                )
            )
        if self.is_panic_lock_active(now):
            alerts.append(
                RiskAlert(
                    code=AlertCode.PANIC_LOCK,
                    active=True,
                    severity="critical",
                    title="Panic lock activo",
                    message="La operativa está congelada manualmente.",
                    details={"expires_at": self.state.panic_lock_expires_at.isoformat() if self.state.panic_lock_expires_at else None},
                )
            )
        return alerts

    def _derive_system_state(self, alerts: Sequence[RiskAlert], correlated) -> tuple[RiskStatus, str, str, str]:
        if self.is_panic_lock_active():
            return (
                RiskStatus.MANUAL_LOCK,
                "Panic lock manual activado",
                "Bloqueo manual",
                "No abras nuevas órdenes hasta la expiración del lock.",
            )
        if any(alert.code == AlertCode.MAX_DD_LIMIT for alert in alerts):
            return (
                RiskStatus.PROTECTION_MODE,
                "Max drawdown consumido",
                "Stop total de cuenta",
                "Corta operativa y reevalúa capital y política.",
            )
        if any(alert.code == AlertCode.DAILY_DD_LIMIT for alert in alerts):
            return (
                RiskStatus.PROTECTION_MODE,
                "DD diario consumido al 100%",
                "Stop total del día",
                "Cierra operativa y espera reset de sesión.",
            )
        if any(alert.code == AlertCode.LOSS_STREAK_PROTECTION for alert in alerts):
            return (
                RiskStatus.PROTECTION_MODE,
                f"Racha de {self.state.loss_streak} pérdidas",
                "Protección por racha",
                "Reduce agresividad y corta frecuencia hasta estabilizar ejecución.",
            )
        if correlated.alert or any(alert.code == AlertCode.TOTAL_OPEN_RISK for alert in alerts):
            return (
                RiskStatus.ACTIVE_MONITORING,
                "Presión de exposición abierta",
                "Clúster o riesgo total elevado",
                "Recorta riesgo antes de ampliar exposición.",
            )
        return (
            RiskStatus.WITHIN_LIMITS,
            "Riesgo bajo control",
            "Sin bloqueo operativo",
            "Operativa permitida dentro de política.",
        )

    def _daily_drawdown_breached(self) -> bool:
        if self.state.daily_start_equity <= 0:
            return False
        dd_amount = max(self.state.daily_start_equity - self.state.current_equity, 0.0)
        dd_decimal = dd_amount / self.state.daily_start_equity
        return dd_decimal >= self.policy.daily_dd_limit

    def _max_drawdown_breached(self) -> bool:
        if self.state.equity_peak <= 0:
            return False
        dd_amount = max(self.state.equity_peak - self.state.current_equity, 0.0)
        dd_decimal = dd_amount / self.state.equity_peak
        return dd_decimal >= self.policy.max_dd_limit

    def _remaining_daily_margin_pct(self) -> float:
        if self.state.daily_start_equity <= 0:
            return 0.0
        daily_limit_pct = self.policy.daily_dd_limit * 100
        current_dd_pct = max(self.state.daily_start_equity - self.state.current_equity, 0.0) / self.state.daily_start_equity * 100
        return max(daily_limit_pct - current_dd_pct, 0.0)
