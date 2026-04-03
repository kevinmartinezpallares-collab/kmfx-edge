"""
Persistencia de estado para el motor de riesgo.

Diseño:
    - interfaz simple compatible con backend local hoy
    - fácilmente sustituible por Redis / DB más adelante
"""

from __future__ import annotations

import json
import os
import tempfile
from abc import ABC, abstractmethod
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, Mapping, Optional

from risk_models import Position, RiskEngineState, Side, SyncState


def _serialize_datetime(value: Optional[datetime]) -> str:
    return value.isoformat() if value is not None else ""


def _serialize_date(value: Optional[date]) -> str:
    return value.isoformat() if value is not None else ""


def _parse_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    parsed = datetime.fromisoformat(str(value))
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)


def _parse_date(value: Any) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def _position_to_dict(position: Position) -> Dict[str, Any]:
    return {
        "position_id": position.position_id,
        "symbol": position.symbol,
        "side": position.side.value,
        "risk_pct": float(position.risk_pct),
        "risk_amount": float(position.risk_amount),
        "size": float(position.size),
        "entry_price": float(position.entry_price),
        "stop_loss": float(position.stop_loss),
        "opened_at": _serialize_datetime(position.opened_at),
        "strategy_tag": position.strategy_tag or "",
        "current_price": float(position.current_price) if position.current_price is not None else 0.0,
    }


def _position_from_dict(payload: Mapping[str, Any]) -> Position:
    opened_at = _parse_datetime(payload.get("opened_at")) or datetime.now(timezone.utc)
    return Position(
        position_id=str(payload["position_id"]),
        symbol=str(payload["symbol"]),
        side=Side(str(payload["side"])),
        risk_pct=float(payload["risk_pct"]),
        risk_amount=float(payload["risk_amount"]),
        size=float(payload["size"]),
        entry_price=float(payload["entry_price"]),
        stop_loss=float(payload["stop_loss"]),
        opened_at=opened_at,
        strategy_tag=str(payload.get("strategy_tag") or "") or None,
        current_price=float(payload.get("current_price", 0.0)),
    )


def state_to_dict(state: RiskEngineState) -> Dict[str, Any]:
    return {
        "equity_peak": float(state.equity_peak),
        "current_equity": float(state.current_equity),
        "daily_start_equity": float(state.daily_start_equity),
        "daily_peak_equity": float(state.daily_peak_equity),
        "current_level": str(state.current_level),
        "recommended_level": str(state.recommended_level),
        "volatility_override_active": bool(state.volatility_override_active),
        "volatility_confirmation_count": int(state.volatility_confirmation_count),
        "volatility_normalization_count": int(state.volatility_normalization_count),
        "loss_streak": int(state.loss_streak),
        "panic_lock_started_at": _serialize_datetime(state.panic_lock_started_at),
        "panic_lock_expires_at": _serialize_datetime(state.panic_lock_expires_at),
        "last_equity_update_at": _serialize_datetime(state.last_equity_update_at),
        "last_volatility_change_at": _serialize_datetime(state.last_volatility_change_at),
        "last_operating_date": _serialize_date(state.last_operating_date),
        "mt5_limit_states": {key: value.value for key, value in state.mt5_limit_states.items()},
        "open_positions": {
            position_id: _position_to_dict(position)
            for position_id, position in state.open_positions.items()
        },
    }


def state_from_dict(payload: Mapping[str, Any]) -> RiskEngineState:
    mt5_limit_states = {
        key: SyncState(str(value))
        for key, value in dict(payload.get("mt5_limit_states", {})).items()
    }
    return RiskEngineState(
        equity_peak=float(payload["equity_peak"]),
        current_equity=float(payload["current_equity"]),
        daily_start_equity=float(payload["daily_start_equity"]),
        daily_peak_equity=float(payload["daily_peak_equity"]),
        current_level=str(payload["current_level"]),
        recommended_level=str(payload["recommended_level"]),
        volatility_override_active=bool(payload.get("volatility_override_active", False)),
        volatility_confirmation_count=int(payload.get("volatility_confirmation_count", 0)),
        volatility_normalization_count=int(payload.get("volatility_normalization_count", 0)),
        last_volatility_change_at=_parse_datetime(payload.get("last_volatility_change_at")),
        open_positions={
            position_id: _position_from_dict(position_payload)
            for position_id, position_payload in dict(payload.get("open_positions", {})).items()
        },
        active_alerts=[],
        loss_streak=int(payload.get("loss_streak", 0)),
        panic_lock_started_at=_parse_datetime(payload.get("panic_lock_started_at")),
        panic_lock_expires_at=_parse_datetime(payload.get("panic_lock_expires_at")),
        last_equity_update_at=_parse_datetime(payload.get("last_equity_update_at")),
        last_operating_date=_parse_date(payload.get("last_operating_date")),
        mt5_limit_states=mt5_limit_states or {
            "risk_per_trade": SyncState.ACTIVE,
            "daily_dd_limit": SyncState.ACTIVE,
            "max_dd_limit": SyncState.ACTIVE,
        },
    )


class RiskStateStore(ABC):
    @abstractmethod
    def save_state(self, state: RiskEngineState) -> None:
        raise NotImplementedError

    @abstractmethod
    def load_state(self) -> Optional[RiskEngineState]:
        raise NotImplementedError


class JsonFileRiskStateStore(RiskStateStore):
    """
    Persistencia local con escritura atómica.
    """

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def save_state(self, state: RiskEngineState) -> None:
        payload = state_to_dict(state)
        self.path.parent.mkdir(parents=True, exist_ok=True)

        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=str(self.path.parent),
            delete=False,
        ) as tmp_file:
            json.dump(payload, tmp_file, indent=2, ensure_ascii=True, sort_keys=True)
            tmp_file.flush()
            os.fsync(tmp_file.fileno())
            temp_name = tmp_file.name

        os.replace(temp_name, self.path)

    def load_state(self) -> Optional[RiskEngineState]:
        if not self.path.exists():
            return None
        try:
            with self.path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
            if not isinstance(payload, dict):
                return None
            return state_from_dict(payload)
        except (json.JSONDecodeError, OSError, KeyError, TypeError, ValueError):
            return None
