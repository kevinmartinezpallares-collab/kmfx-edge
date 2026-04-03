"""
Adaptadores MT5 -> motor de riesgo.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping, Optional

from risk_math import ensure_aware
from risk_models import OrderRequest, Position, Side


def _get(source: Any, key: str, default: Any = None) -> Any:
    if isinstance(source, Mapping):
        return source.get(key, default)
    return getattr(source, key, default)


def _normalize_side(raw_type: Any) -> Side:
    raw = str(raw_type).upper()
    if raw in {"BUY", "LONG", "0"}:
        return Side.LONG
    if raw in {"SELL", "SHORT", "1"}:
        return Side.SHORT
    raise ValueError(f"Tipo de lado MT5 no reconocido: {raw_type}")


def _require(source: Any, key: str) -> Any:
    value = _get(source, key, None)
    if value is None or value == "":
        raise ValueError(f"Campo MT5 requerido ausente: {key}")
    return value


def _parse_mt5_time(raw_time: Any) -> datetime:
    if isinstance(raw_time, datetime):
        return ensure_aware(raw_time)
    if raw_time is None:
        return datetime.now(timezone.utc)
    if isinstance(raw_time, (int, float)):
        return datetime.fromtimestamp(float(raw_time), tz=timezone.utc)
    return ensure_aware(datetime.fromisoformat(str(raw_time)))


@dataclass(frozen=True)
class EquityUpdate:
    equity: float
    balance: float
    margin: float
    free_margin: float
    timestamp: datetime


def mt5_position_to_position(
    mt5_position: Any,
    *,
    risk_pct: float,
    risk_amount: float,
    strategy_tag: Optional[str] = None,
) -> Position:
    return Position(
        position_id=str(_get(mt5_position, "ticket") or _get(mt5_position, "position_id") or _require(mt5_position, "ticket")),
        symbol=str(_require(mt5_position, "symbol")),
        side=_normalize_side(_require(mt5_position, "type")),
        risk_pct=float(risk_pct),
        risk_amount=float(risk_amount),
        size=float(_get(mt5_position, "volume", _get(mt5_position, "volume_current", _require(mt5_position, "volume")))),
        entry_price=float(_get(mt5_position, "price_open", _get(mt5_position, "open_price", _require(mt5_position, "price_open")))),
        stop_loss=float(_get(mt5_position, "sl", _get(mt5_position, "stop_loss", _require(mt5_position, "sl")))),
        opened_at=_parse_mt5_time(_get(mt5_position, "time", _get(mt5_position, "opened_at"))),
        strategy_tag=strategy_tag or _get(mt5_position, "comment"),
        current_price=float(_get(mt5_position, "price_current", _get(mt5_position, "current_price", 0.0))),
    )


def mt5_order_request_to_order_request(
    order_payload: Any,
    *,
    risk_pct: float,
    risk_amount: float,
    strategy_tag: Optional[str] = None,
) -> OrderRequest:
    return OrderRequest(
        position_id=str(_get(order_payload, "ticket") or _get(order_payload, "request_id") or _get(order_payload, "position_id") or _require(order_payload, "request_id")),
        symbol=str(_require(order_payload, "symbol")),
        side=_normalize_side(_require(order_payload, "type")),
        risk_pct=float(risk_pct),
        risk_amount=float(risk_amount),
        size=float(_get(order_payload, "volume", _get(order_payload, "size", _require(order_payload, "volume")))),
        entry_price=float(_get(order_payload, "price", _get(order_payload, "entry_price", _require(order_payload, "price")))),
        stop_loss=float(_get(order_payload, "sl", _get(order_payload, "stop_loss", _require(order_payload, "sl")))),
        strategy_tag=strategy_tag or _get(order_payload, "comment"),
    )


def mt5_account_info_to_equity_update(account_info: Any) -> EquityUpdate:
    return EquityUpdate(
        equity=float(_get(account_info, "equity", 0.0)),
        balance=float(_get(account_info, "balance", 0.0)),
        margin=float(_get(account_info, "margin", 0.0)),
        free_margin=float(_get(account_info, "margin_free", _get(account_info, "free_margin", 0.0))),
        timestamp=_parse_mt5_time(_get(account_info, "time", _get(account_info, "timestamp", None))),
    )
