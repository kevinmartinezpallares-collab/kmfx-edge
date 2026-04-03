import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from mt5_risk_adapter import (
    mt5_account_info_to_equity_update,
    mt5_order_request_to_order_request,
    mt5_position_to_position,
)
from risk_orchestrator import RiskOrchestrator
from risk_engine import RiskEngine
from risk_models import Position, Side
from risk_state_store import JsonFileRiskStateStore


class RiskPersistenceTests(unittest.TestCase):
    def test_json_state_roundtrip_preserves_operational_context(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "risk-state.json"
            store = JsonFileRiskStateStore(path)
            engine = RiskEngine()
            now = datetime(2026, 4, 3, 9, 0, tzinfo=timezone.utc)
            engine.on_tick(now)

            engine.state.current_level = "+1"
            engine.state.recommended_level = "BASE"
            engine.state.loss_streak = 2
            engine.state.daily_start_equity = 99_500.0
            engine.state.daily_peak_equity = 100_100.0
            engine.activate_panic_lock(now)
            engine.on_position_opened(
                Position(
                    position_id="p-1",
                    symbol="EURUSD",
                    side=Side.LONG,
                    risk_pct=0.5,
                    risk_amount=500.0,
                    size=1.0,
                    entry_price=1.1000,
                    stop_loss=1.0950,
                    opened_at=now,
                    current_price=1.1010,
                ),
                now=now,
            )

            store.save_state(engine.state)
            restored_state = store.load_state()
            self.assertIsNotNone(restored_state)

            restored_engine = RiskEngine(state=restored_state)
            self.assertEqual(restored_engine.state.current_level, "+1")
            self.assertEqual(restored_engine.state.recommended_level, "BASE")
            self.assertEqual(restored_engine.state.loss_streak, 2)
            self.assertEqual(restored_engine.state.daily_start_equity, 99_500.0)
            self.assertTrue(restored_engine.is_panic_lock_active(now + timedelta(hours=1)))
            self.assertIn("p-1", restored_engine.state.open_positions)

    def test_mt5_position_adapter(self) -> None:
        mt5_position = {
            "ticket": 12345,
            "symbol": "EURUSD",
            "type": "BUY",
            "volume": 1.25,
            "price_open": 1.1015,
            "sl": 1.0970,
            "price_current": 1.1030,
            "time": 1775206800,
            "comment": "london-open",
        }
        position = mt5_position_to_position(mt5_position, risk_pct=0.45, risk_amount=578.0)
        self.assertEqual(position.position_id, "12345")
        self.assertEqual(position.side, Side.LONG)
        self.assertEqual(position.strategy_tag, "london-open")

    def test_mt5_order_request_adapter(self) -> None:
        mt5_request = {
            "request_id": "req-1",
            "symbol": "XAUUSD",
            "type": "SELL",
            "volume": 0.5,
            "price": 2310.0,
            "sl": 2324.0,
            "comment": "reversal",
        }
        order_request = mt5_order_request_to_order_request(mt5_request, risk_pct=0.25, risk_amount=250.0)
        self.assertEqual(order_request.position_id, "req-1")
        self.assertEqual(order_request.side, Side.SHORT)

    def test_mt5_account_adapter(self) -> None:
        account_info = {
            "equity": 99_250.0,
            "balance": 100_000.0,
            "margin": 1_200.0,
            "margin_free": 98_050.0,
            "time": 1775206800,
        }
        update = mt5_account_info_to_equity_update(account_info)
        self.assertEqual(update.equity, 99_250.0)
        self.assertEqual(update.free_margin, 98_050.0)

    def test_corrupt_state_json_returns_none(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "risk-state.json"
            path.write_text("{not-valid-json", encoding="utf-8")
            store = JsonFileRiskStateStore(path)
            self.assertIsNone(store.load_state())

    def test_invalid_mt5_payload_type_raises(self) -> None:
        with self.assertRaises(ValueError):
            mt5_position_to_position(
                {"ticket": 1, "symbol": "EURUSD", "type": "INVALID", "volume": 1.0, "price_open": 1.1, "sl": 1.09},
                risk_pct=0.25,
                risk_amount=250.0,
            )

    def test_invalid_mt5_payload_missing_field_raises(self) -> None:
        with self.assertRaises(ValueError):
            mt5_order_request_to_order_request(
                {"request_id": "r1", "type": "BUY", "volume": 1.0, "price": 1.1, "sl": 1.09},
                risk_pct=0.25,
                risk_amount=250.0,
            )

    def test_orchestrator_persists_and_returns_dashboard_payload(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = JsonFileRiskStateStore(Path(tmp_dir) / "risk-state.json")
            orchestrator = RiskOrchestrator(state_store=store)
            payload = orchestrator.handle_account_update(
                {
                    "equity": 99_500.0,
                    "balance": 100_000.0,
                    "margin": 800.0,
                    "margin_free": 98_700.0,
                    "time": 1775206800,
                }
            )
            self.assertIn("risk_status", payload)
            restored = store.load_state()
            self.assertIsNotNone(restored)
            self.assertEqual(restored.current_equity, 99_500.0)
            for key in (
                "trigger",
                "blocking_rule",
                "action_required",
                "remaining_daily_margin_pct",
                "remaining_total_margin_pct",
                "daily_drawdown_pct",
                "max_drawdown_pct",
                "total_open_risk_pct",
                "effective_correlated_risk",
                "active_rules",
                "limits_and_pressure",
                "policy_snapshot",
                "ladder_snapshot",
                "exposure_snapshot",
                "policy_applied_at",
                "policy_source",
                "policy_dirty",
                "mt5_limit_states",
            ):
                self.assertIn(key, payload)

    def test_orchestrator_order_request_payload(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = JsonFileRiskStateStore(Path(tmp_dir) / "risk-state.json")
            orchestrator = RiskOrchestrator(state_store=store)
            decision = orchestrator.handle_order_request(
                {
                    "request_id": "req-1",
                    "symbol": "EURUSD",
                    "type": "BUY",
                    "volume": 1.0,
                    "price": 1.1000,
                    "sl": 1.0950,
                },
                risk_pct=0.20,
                risk_amount=200.0,
            )
            self.assertIn("allowed", decision)
            self.assertIn("state_snapshot", decision)

    def test_orchestrator_sync_mt5_snapshot_tracks_open_positions(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = JsonFileRiskStateStore(Path(tmp_dir) / "risk-state.json")
            orchestrator = RiskOrchestrator(state_store=store)
            payload = orchestrator.sync_mt5_snapshot(
                {
                    "equity": 100_250.0,
                    "balance": 100_000.0,
                    "margin": 500.0,
                    "free_margin": 99_500.0,
                    "timestamp": "2026-04-03T09:00:00+00:00",
                },
                [
                    {
                        "ticket": 111,
                        "symbol": "EURUSD",
                        "type": "BUY",
                        "volume": 1.0,
                        "price_open": 1.10,
                        "sl": 1.095,
                        "time": "2026-04-03T08:55:00+00:00",
                        "risk_pct": 0.45,
                        "risk_amount": 450.0,
                    }
                ],
            )
            self.assertEqual(payload["total_open_risk_pct"], 0.45)
            self.assertTrue(any(rule["title"] for rule in payload["active_rules"]))
            self.assertEqual(payload["exposure_snapshot"]["open_positions"], 1)
            self.assertTrue(payload["ladder_snapshot"]["levels"])
            self.assertEqual(len(orchestrator.engine.state.open_positions), 1)


if __name__ == "__main__":
    unittest.main()
