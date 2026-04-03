"""
Orquestador de runtime para integrar:
MT5 adapter + RiskEngine + persistencia + serializer.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional, Sequence

from mt5_risk_adapter import (
    mt5_account_info_to_equity_update,
    mt5_order_request_to_order_request,
    mt5_position_to_position,
)
from risk_engine import RiskEngine
from risk_models import AlertCode, Position, RiskEngineSnapshot
from risk_policy import RiskPolicy, default_risk_policy
from risk_serializers import serialize_for_dashboard
from risk_state_store import RiskStateStore


class RiskOrchestrator:
    def __init__(
        self,
        *,
        state_store: RiskStateStore,
        policy: Optional[RiskPolicy] = None,
        max_loss_streak: int = 3,
    ) -> None:
        self.state_store = state_store
        self.policy = policy or default_risk_policy()
        restored_state = self.state_store.load_state()
        self.engine = RiskEngine(
            policy=self.policy,
            state=restored_state,
            max_loss_streak=max_loss_streak,
        )

    def _persist(self) -> None:
        self.state_store.save_state(self.engine.state)

    @staticmethod
    def _pct(value: float) -> float:
        return round(float(value), 2)

    def _daily_drawdown_pct(self) -> float:
        start_equity = float(self.engine.state.daily_start_equity or 0.0)
        current_equity = float(self.engine.state.current_equity or 0.0)
        if start_equity <= 0:
            return 0.0
        dd_amount = max(start_equity - current_equity, 0.0)
        return self._pct(dd_amount / start_equity * 100.0)

    def _remaining_total_margin_pct(self, snapshot: RiskEngineSnapshot) -> float:
        max_dd_limit_pct = float(self.policy.max_dd_limit) * 100.0
        return self._pct(max(max_dd_limit_pct - snapshot.recovery_metrics.drawdown_pct, 0.0))

    def _active_rule_payload(self, *, title: str, condition: str, state: str, impact: str, dominant: bool, tone: str) -> dict[str, Any]:
        return {
            "title": title,
            "condition": condition,
            "state": state,
            "impact": impact,
            "is_dominant": dominant,
            "tone": tone,
        }

    def _build_active_rules(self, snapshot: RiskEngineSnapshot) -> list[dict[str, Any]]:
        alerts_by_code = {alert.code: alert for alert in snapshot.active_alerts}
        policy_daily_dd_pct = self.policy.daily_dd_limit * 100.0
        policy_max_dd_pct = self.policy.max_dd_limit * 100.0
        daily_drawdown_pct = self._daily_drawdown_pct()

        candidates = [
            (
                AlertCode.PANIC_LOCK,
                self._active_rule_payload(
                    title="Panic lock manual",
                    condition=f"Bloqueo manual activo durante {self.policy.panic_lock_hours}h",
                    state="Activa ahora" if snapshot.panic_lock_active else "Inactiva",
                    impact="Bloquea toda nueva operativa",
                    dominant=snapshot.panic_lock_active,
                    tone="danger" if snapshot.panic_lock_active else "neutral",
                ),
            ),
            (
                AlertCode.DAILY_DD_LIMIT,
                self._active_rule_payload(
                    title="Stop total del día",
                    condition=f"DD diario >= {policy_daily_dd_pct:.2f}%",
                    state="Activa ahora" if daily_drawdown_pct >= policy_daily_dd_pct else "En vigilancia",
                    impact="Bloquea nueva operativa",
                    dominant=False,
                    tone="danger" if daily_drawdown_pct >= policy_daily_dd_pct else "warn",
                ),
            ),
            (
                AlertCode.MAX_DD_LIMIT,
                self._active_rule_payload(
                    title="Stop total de cuenta",
                    condition=f"DD total >= {policy_max_dd_pct:.2f}%",
                    state="Activa ahora" if snapshot.recovery_metrics.drawdown_pct >= policy_max_dd_pct else "En vigilancia",
                    impact="Bloquea toda la cuenta",
                    dominant=False,
                    tone="danger" if snapshot.recovery_metrics.drawdown_pct >= policy_max_dd_pct else "warn",
                ),
            ),
            (
                AlertCode.LOSS_STREAK_PROTECTION,
                self._active_rule_payload(
                    title="Protección por racha",
                    condition=f"Racha >= {self.engine.max_loss_streak} pérdidas",
                    state="Activa ahora" if self.engine.state.loss_streak >= self.engine.max_loss_streak else "En vigilancia",
                    impact="Reduce agresividad y frecuencia",
                    dominant=False,
                    tone="danger" if self.engine.state.loss_streak >= self.engine.max_loss_streak else "warn",
                ),
            ),
            (
                AlertCode.TOTAL_OPEN_RISK,
                self._active_rule_payload(
                    title="Riesgo abierto total",
                    condition=f"Riesgo abierto >= {self.policy.max_total_open_risk_pct:.2f}%",
                    state="Activa ahora" if snapshot.total_open_risk_pct >= self.policy.max_total_open_risk_pct else "Controlado",
                    impact="Frena nuevas entradas hasta recortar exposición",
                    dominant=False,
                    tone="warn" if snapshot.total_open_risk_pct >= self.policy.max_total_open_risk_pct else "neutral",
                ),
            ),
            (
                AlertCode.EXPOSURE_DUPLICATED,
                self._active_rule_payload(
                    title="Exposición correlacionada",
                    condition=f"Riesgo correlacionado >= {self.policy.max_correlated_risk_pct:.2f}%",
                    state="Activa ahora" if snapshot.effective_correlated_risk >= self.policy.max_correlated_risk_pct else "Controlado",
                    impact="Evita duplicar riesgo en el mismo clúster",
                    dominant=False,
                    tone="warn" if snapshot.effective_correlated_risk >= self.policy.max_correlated_risk_pct else "neutral",
                ),
            ),
            (
                AlertCode.VOLATILITY_STEP_DOWN,
                self._active_rule_payload(
                    title="Override de volatilidad",
                    condition=f"ATR >= {self.policy.atr_vol_multiplier_threshold:.2f}x la media de {self.policy.atr_lookback_days} días",
                    state="Activa ahora" if snapshot.volatility_override_active else "Inactiva",
                    impact=f"Reduce el riesgo recomendado a {snapshot.recommended_level}",
                    dominant=False,
                    tone="warn" if snapshot.volatility_override_active else "neutral",
                ),
            ),
        ]

        active_codes = [alert.code for alert in snapshot.active_alerts]
        dominant_code = active_codes[0] if active_codes else None
        ranked: list[dict[str, Any]] = []
        for code, rule_payload in candidates:
            alert = alerts_by_code.get(code)
            payload = dict(rule_payload)
            if alert is not None:
                payload["impact"] = alert.message or payload["impact"]
                payload["tone"] = "danger" if alert.severity == "critical" else "warn"
            payload["is_dominant"] = code == dominant_code
            ranked.append(payload)

        ranked.sort(
            key=lambda item: (
                0 if item["is_dominant"] else 1,
                0 if item["tone"] == "danger" else 1 if item["tone"] == "warn" else 2,
                item["title"],
            )
        )
        return ranked[:4]

    def _build_limits_and_pressure(self, snapshot: RiskEngineSnapshot) -> list[dict[str, Any]]:
        daily_drawdown_pct = self._daily_drawdown_pct()
        max_drawdown_pct = self._pct(snapshot.recovery_metrics.drawdown_pct)
        remaining_total_margin_pct = self._remaining_total_margin_pct(snapshot)
        effective_trade_risk_limit = self.engine._effective_trade_risk_limit()

        return [
            {
                "key": "daily_drawdown",
                "label": "Drawdown diario",
                "value": daily_drawdown_pct,
                "display": f"{daily_drawdown_pct:.2f}%",
                "note_value": f"{snapshot.remaining_daily_margin_pct:.2f}%",
                "note_label": "de margen diario restante",
                "tone": "negative" if snapshot.remaining_daily_margin_pct <= 0 else "warning" if daily_drawdown_pct > 0 else "neutral",
            },
            {
                "key": "max_drawdown",
                "label": "Drawdown máximo",
                "value": max_drawdown_pct,
                "display": f"{max_drawdown_pct:.2f}%",
                "note_value": f"{remaining_total_margin_pct:.2f}%",
                "note_label": "de margen total restante",
                "tone": "negative" if remaining_total_margin_pct <= 0 else "warning" if max_drawdown_pct > 0 else "neutral",
            },
            {
                "key": "open_risk",
                "label": "Riesgo abierto total",
                "value": self._pct(snapshot.total_open_risk_pct),
                "display": f"{snapshot.total_open_risk_pct:.2f}%",
                "note_value": f"{effective_trade_risk_limit:.2f}%",
                "note_label": "riesgo máximo por trade ahora",
                "tone": "warning" if snapshot.total_open_risk_pct > 0 else "neutral",
            },
            {
                "key": "correlated_risk",
                "label": "Riesgo correlacionado",
                "value": self._pct(snapshot.effective_correlated_risk),
                "display": f"{snapshot.effective_correlated_risk:.2f}%",
                "note_value": f"{self.policy.max_correlated_risk_pct:.2f}%",
                "note_label": "límite del clúster",
                "tone": "negative" if snapshot.effective_correlated_risk >= self.policy.max_correlated_risk_pct else "neutral",
            },
        ]

    def _build_policy_snapshot(self) -> dict[str, Any]:
        return {
            "risk_per_trade_pct": self._pct(self.policy.max_risk_per_trade_pct),
            "daily_dd_limit_pct": self._pct(self.policy.daily_dd_limit * 100.0),
            "max_dd_limit_pct": self._pct(self.policy.max_dd_limit * 100.0),
            "max_total_open_risk_pct": self._pct(self.policy.max_total_open_risk_pct),
            "max_correlated_risk_pct": self._pct(self.policy.max_correlated_risk_pct),
            "current_level": self.engine.state.current_level,
            "recommended_level": self.engine.state.recommended_level,
            "volatility_override_active": bool(self.engine.state.volatility_override_active),
        }

    def _build_dashboard_contract(
        self,
        snapshot: RiskEngineSnapshot,
        *,
        generated_at: Optional[datetime] = None,
    ) -> dict[str, Any]:
        generated = generated_at or datetime.now(timezone.utc)
        return {
            "risk_status": snapshot.risk_status.value,
            "trigger": snapshot.dominant_risk_trigger,
            "blocking_rule": snapshot.blocking_rule,
            "action_required": snapshot.action_required,
            "remaining_daily_margin_pct": self._pct(snapshot.remaining_daily_margin_pct),
            "remaining_total_margin_pct": self._remaining_total_margin_pct(snapshot),
            "daily_drawdown_pct": self._daily_drawdown_pct(),
            "max_drawdown_pct": self._pct(snapshot.recovery_metrics.drawdown_pct),
            "total_open_risk_pct": self._pct(snapshot.total_open_risk_pct),
            "effective_correlated_risk": self._pct(snapshot.effective_correlated_risk),
            "volatility_override_active": bool(snapshot.volatility_override_active),
            "recommended_level": snapshot.recommended_level,
            "current_level": self.engine.state.current_level,
            "panic_lock_active": bool(snapshot.panic_lock_active),
            "panic_lock_expires_at": serialize_for_dashboard(snapshot.panic_lock_expires_at, "panic_lock_expires_at"),
            "active_rules": self._build_active_rules(snapshot),
            "mt5_limit_states": dict(snapshot.mt5_limit_states or {}),
            "limits_and_pressure": self._build_limits_and_pressure(snapshot),
            "policy_snapshot": self._build_policy_snapshot(),
            "last_snapshot_at": serialize_for_dashboard(generated, "last_snapshot_at"),
            "snapshot_stale_after_seconds": 15,
        }

    @staticmethod
    def _payload_number(source: Any, key: str) -> float:
        if isinstance(source, dict):
            raw = source.get(key, 0.0)
        else:
            raw = getattr(source, key, 0.0)
        try:
            return float(raw or 0.0)
        except (TypeError, ValueError):
            return 0.0

    def sync_mt5_snapshot(
        self,
        mt5_account_info: Any,
        mt5_positions: Sequence[Any] | None,
        *,
        current_atr: Optional[float] = None,
        atr_history: Optional[Sequence[float]] = None,
    ) -> dict[str, Any]:
        update = mt5_account_info_to_equity_update(mt5_account_info)
        next_positions: dict[str, Position] = {}
        for raw_position in mt5_positions or []:
            position = mt5_position_to_position(
                raw_position,
                risk_pct=self._payload_number(raw_position, "risk_pct"),
                risk_amount=self._payload_number(raw_position, "risk_amount"),
                strategy_tag=(getattr(raw_position, "strategy_tag", None) if not isinstance(raw_position, dict) else raw_position.get("strategy_tag")) or None,
            )
            next_positions[position.position_id] = position

        self.engine.state.open_positions = next_positions
        snapshot = self.engine.on_equity_update(
            equity=update.equity,
            now=update.timestamp,
            current_atr=current_atr,
            atr_history=atr_history,
        )
        self._persist()
        return self._build_dashboard_contract(snapshot, generated_at=update.timestamp)

    def handle_account_update(
        self,
        mt5_account_info: Any,
        *,
        current_atr: Optional[float] = None,
        atr_history: Optional[Sequence[float]] = None,
    ) -> dict[str, Any]:
        update = mt5_account_info_to_equity_update(mt5_account_info)
        snapshot = self.engine.on_equity_update(
            equity=update.equity,
            now=update.timestamp,
            current_atr=current_atr,
            atr_history=atr_history,
        )
        self._persist()
        return self._build_dashboard_contract(snapshot, generated_at=update.timestamp)

    def handle_position_opened(
        self,
        mt5_position: Any,
        risk_pct: float,
        risk_amount: float,
        strategy_tag: str | None = None,
    ) -> dict[str, Any]:
        position = mt5_position_to_position(
            mt5_position,
            risk_pct=risk_pct,
            risk_amount=risk_amount,
            strategy_tag=strategy_tag,
        )
        snapshot = self.engine.on_position_opened(position, now=position.opened_at)
        self._persist()
        return self._build_dashboard_contract(snapshot, generated_at=position.opened_at)

    def handle_position_closed(
        self,
        position_id: str,
        realized_pnl: float,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        snapshot = self.engine.on_position_closed(position_id=position_id, realized_pnl=realized_pnl, now=now)
        self._persist()
        return self._build_dashboard_contract(snapshot, generated_at=now)

    def handle_order_request(
        self,
        mt5_order_payload: Any,
        risk_pct: float,
        risk_amount: float,
        strategy_tag: str | None = None,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        order_request = mt5_order_request_to_order_request(
            mt5_order_payload,
            risk_pct=risk_pct,
            risk_amount=risk_amount,
            strategy_tag=strategy_tag,
        )
        decision = self.engine.on_order_request(order_request, now=now)
        self._persist()
        return serialize_for_dashboard(decision)

    def activate_panic_lock(self, now: datetime | None = None) -> dict[str, Any]:
        self.engine.activate_panic_lock(now)
        self._persist()
        return self.get_dashboard_payload(now=now)

    def get_dashboard_payload(
        self,
        now: datetime | None = None,
        *,
        current_atr: Optional[float] = None,
        atr_history: Optional[Sequence[float]] = None,
    ) -> dict[str, Any]:
        snapshot = self.engine.on_tick(now=now)
        # on_tick no muta persistencia crítica salvo reset diario, así que persistimos igual
        self._persist()
        if current_atr is not None or atr_history is not None:
            snapshot = self.engine.on_equity_update(
                equity=self.engine.state.current_equity,
                now=now,
                current_atr=current_atr,
                atr_history=atr_history,
            )
            self._persist()
        return self._build_dashboard_contract(snapshot, generated_at=now)
