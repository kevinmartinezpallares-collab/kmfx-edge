"""
Serialización JSON-friendly para dashboard y backend APIs.
"""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from enum import Enum
from typing import Any


_SAFE_DEFAULTS = {
    "panic_lock_expires_at": "",
    "strategy_tag": "",
    "current_price": 0.0,
    "opened_at": "",
    "last_equity_update_at": "",
    "last_volatility_change_at": "",
    "details": {},
    "cluster_breakdown": [],
    "active_alerts": [],
    "symbols": [],
    "position_ids": [],
    "mt5_limit_states": {},
}


def _default_for_field(field_name: str) -> Any:
    return _SAFE_DEFAULTS.get(field_name, "")


def serialize_for_dashboard(value: Any, field_name: str = "") -> Any:
    if value is None:
        return _default_for_field(field_name)
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "__dataclass_fields__"):
        serialized = {}
        for key, raw in asdict(value).items():
            serialized[key] = serialize_for_dashboard(raw, key)
        return serialized
    if isinstance(value, dict):
        return {str(key): serialize_for_dashboard(raw, str(key)) for key, raw in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [serialize_for_dashboard(item, field_name) for item in value]
    return value
