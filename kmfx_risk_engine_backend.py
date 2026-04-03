"""
Wrapper de compatibilidad para el motor de riesgo modular.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from risk_engine import RiskEngine
from risk_models import Position, Side
from risk_serializers import serialize_for_dashboard


def example_usage() -> Dict[str, Any]:
    engine = RiskEngine()
    now = datetime(2026, 4, 3, 8, 0, tzinfo=timezone.utc)
    engine.on_position_opened(
        Position(
            position_id="eu-1",
            symbol="EURUSD",
            side=Side.LONG,
            risk_pct=0.70,
            risk_amount=700.0,
            size=1.0,
            entry_price=1.0820,
            stop_loss=1.0780,
            opened_at=now,
            current_price=1.0820,
        ),
        now=now,
    )
    engine.on_position_opened(
        Position(
            position_id="gb-1",
            symbol="GBPUSD",
            side=Side.LONG,
            risk_pct=0.70,
            risk_amount=700.0,
            size=1.0,
            entry_price=1.2710,
            stop_loss=1.2640,
            opened_at=now,
            current_price=1.2710,
        ),
        now=now,
    )
    snapshot = engine.on_equity_update(
        equity=98_800.00,
        current_atr=180.0,
        atr_history=[120.0, 130.0, 140.0, 135.0, 138.0],
        now=now,
    )
    return {"snapshot": serialize_for_dashboard(snapshot)}


if __name__ == "__main__":
    print(example_usage())
