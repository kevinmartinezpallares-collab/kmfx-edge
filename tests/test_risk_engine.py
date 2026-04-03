import unittest
from datetime import datetime, timedelta, timezone

from risk_engine import RiskEngine
from risk_math import calculate_recovery_metrics, detect_correlated_exposure, evaluate_volatility_signal
from risk_models import DecisionCode, OrderRequest, Position, Side
from risk_policy import RiskPolicy
from risk_serializers import serialize_for_dashboard


def make_position(
    position_id: str,
    symbol: str,
    side: Side,
    risk_pct: float,
    risk_amount: float,
) -> Position:
    return Position(
        position_id=position_id,
        symbol=symbol,
        side=side,
        risk_pct=risk_pct,
        risk_amount=risk_amount,
        size=1.0,
        entry_price=1.1000,
        stop_loss=1.0950,
        opened_at=datetime(2026, 4, 3, 8, 0, tzinfo=timezone.utc),
        current_price=1.1000,
    )


class RiskEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.policy = RiskPolicy()
        self.engine = RiskEngine(policy=self.policy)

    def test_multi_position_same_symbol(self) -> None:
        pos_a = make_position("p1", "EURUSD", Side.LONG, 0.40, 400)
        pos_b = make_position("p2", "EURUSD", Side.LONG, 0.35, 350)
        self.engine.on_position_opened(pos_a)
        self.engine.on_position_opened(pos_b)
        snapshot = self.engine.on_tick()
        self.assertEqual(len(self.engine.state.open_positions), 2)
        self.assertAlmostEqual(snapshot.total_open_risk_pct, 0.75)

    def test_correlated_cluster_breach(self) -> None:
        positions = [
            make_position("p1", "EURUSD", Side.LONG, 0.70, 700),
            make_position("p2", "GBPUSD", Side.LONG, 0.70, 700),
        ]
        result = detect_correlated_exposure(positions, self.policy)
        self.assertTrue(result.alert)
        self.assertGreater(result.effective_risk_pct, self.policy.max_correlated_risk_pct)

    def test_correlated_cluster_partial_offset(self) -> None:
        positions = [
            make_position("p1", "EURUSD", Side.LONG, 0.70, 700),
            make_position("p2", "GBPUSD", Side.SHORT, 0.70, 700),
        ]
        result = detect_correlated_exposure(positions, self.policy)
        self.assertFalse(result.alert)
        self.assertLess(result.effective_risk_pct, result.gross_risk_pct)

    def test_total_open_risk_breach(self) -> None:
        self.engine.on_position_opened(make_position("p1", "EURUSD", Side.LONG, 2.40, 2400))
        decision = self.engine.on_order_request(
            OrderRequest(
                position_id="p2",
                symbol="NAS100",
                side=Side.LONG,
                risk_pct=0.20,
                risk_amount=200,
                size=1.0,
                entry_price=2300,
                stop_loss=2280,
            )
        )
        self.assertFalse(decision.allowed)
        self.assertEqual(decision.reason_code, DecisionCode.TOTAL_OPEN_RISK_BREACH)

    def test_daily_reset(self) -> None:
        t1 = datetime(2026, 4, 3, 21, 0, tzinfo=timezone.utc)
        t2 = datetime(2026, 4, 4, 2, 0, tzinfo=timezone.utc)
        self.engine.on_equity_update(99_000, now=t1)
        first_daily_start = self.engine.state.daily_start_equity
        self.engine.on_equity_update(98_500, now=t2)
        self.assertEqual(self.engine.state.daily_start_equity, 99_000)
        self.assertNotEqual(self.engine.state.last_operating_date, None)
        self.assertEqual(first_daily_start, 100000.0)

    def test_volatility_hysteresis(self) -> None:
        now = datetime(2026, 4, 3, 10, 0, tzinfo=timezone.utc)
        signal_1 = evaluate_volatility_signal(
            current_atr=150,
            atr_history=[100, 100, 100, 100, 100],
            current_level="BASE",
            current_recommended_level="BASE",
            override_active=False,
            last_volatility_change_at=None,
            confirmation_count=0,
            normalization_count=0,
            now=now,
            policy=self.policy,
        )[0]
        self.assertFalse(signal_1.override_active)
        signal_2 = evaluate_volatility_signal(
            current_atr=150,
            atr_history=[100, 100, 100, 100, 100],
            current_level="BASE",
            current_recommended_level="BASE",
            override_active=False,
            last_volatility_change_at=None,
            confirmation_count=1,
            normalization_count=0,
            now=now + timedelta(minutes=1),
            policy=self.policy,
        )[0]
        self.assertTrue(signal_2.override_active)

    def test_atr_uses_latest_values(self) -> None:
        signal = evaluate_volatility_signal(
            current_atr=150,
            atr_history=[50, 50, 50, 100, 100, 100, 100, 100],
            current_level="BASE",
            current_recommended_level="BASE",
            override_active=False,
            last_volatility_change_at=None,
            confirmation_count=1,
            normalization_count=0,
            now=datetime(2026, 4, 3, 10, 5, tzinfo=timezone.utc),
            policy=self.policy,
        )[0]
        self.assertTrue(signal.override_active)

    def test_panic_lock(self) -> None:
        now = datetime(2026, 4, 3, 9, 0, tzinfo=timezone.utc)
        self.engine.activate_panic_lock(now)
        self.assertTrue(self.engine.is_panic_lock_active(now + timedelta(hours=1)))
        self.assertFalse(self.engine.is_panic_lock_active(now + timedelta(hours=25)))

    def test_order_blocking_reason_trade_risk(self) -> None:
        decision = self.engine.on_order_request(
            OrderRequest(
                position_id="p1",
                symbol="EURUSD",
                side=Side.LONG,
                risk_pct=0.90,
                risk_amount=900,
                size=1.0,
                entry_price=1.1,
                stop_loss=1.095,
            )
        )
        self.assertFalse(decision.allowed)
        self.assertEqual(decision.reason_code, DecisionCode.TRADE_RISK_ABOVE_LEVEL)

    def test_recovery_metrics(self) -> None:
        metrics = calculate_recovery_metrics(90_000, 100_000)
        self.assertAlmostEqual(metrics.drawdown_pct, 10.0)
        self.assertAlmostEqual(metrics.recovery_pct, 11.1111, places=3)

    def test_serializer_avoids_none(self) -> None:
        snapshot = self.engine.on_tick(datetime(2026, 4, 3, 9, 0, tzinfo=timezone.utc))
        payload = serialize_for_dashboard(snapshot)
        self.assertIn("panic_lock_expires_at", payload)
        self.assertNotEqual(payload["panic_lock_expires_at"], None)


if __name__ == "__main__":
    unittest.main()
