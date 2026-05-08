from __future__ import annotations

import unittest
from pathlib import Path

import kmfx_connector_api as connector_api
from risk_metrics_engine import build_risk_metrics
from risk_policy_engine import build_policy_snapshot, evaluate_risk_policy


ROOT = Path(__file__).resolve().parents[1]


class MetricsContractTests(unittest.TestCase):
    def test_sanitize_preserves_large_mt5_ids_as_strings(self) -> None:
        large_id = "9007199254740993123"
        trades, _ = connector_api.sanitize_trades(
            [
                {
                    "ticket": large_id,
                    "deal_id": large_id,
                    "order_id": "9007199254740993555",
                    "position_id": "9007199254740993444",
                    "symbol": "XAUUSD",
                    "type": "SELL",
                    "profit": 10,
                    "commission": -1,
                    "swap": 0,
                    "time": "2026-05-07T08:00:00Z",
                }
            ]
        )

        self.assertEqual(large_id, trades[0]["ticket"])
        self.assertEqual(large_id, trades[0]["deal_id"])
        self.assertEqual("9007199254740993555", trades[0]["order_id"])
        self.assertEqual("9007199254740993444", trades[0]["position_id"])

    def test_position_without_stop_loss_is_not_reported_as_zero_risk(self) -> None:
        positions, _ = connector_api.sanitize_positions(
            [
                {
                    "position_id": "9007199254740993123",
                    "ticket": "9007199254740993123",
                    "symbol": "AUDUSD",
                    "type": "BUY",
                    "volume": 1.0,
                    "price_open": 0.65001,
                    "price_current": 0.65031,
                    "sl": 0,
                    "profit": 30,
                    "swap": -2,
                    "risk_amount": None,
                    "risk_pct": None,
                }
            ]
        )

        snapshot = build_risk_metrics(
            account={"balance": 10000, "equity": 10028, "timestamp": "2026-05-07T08:00:00Z"},
            positions=positions,
            trades=[],
            policy_snapshot={},
        )

        self.assertEqual("missing_stop_loss", positions[0]["risk_state"])
        self.assertFalse(positions[0]["risk_calculable"])
        self.assertIsNone(positions[0]["risk_amount"])
        self.assertIsNone(positions[0]["risk_pct"])
        self.assertEqual(1, snapshot["summary"]["unbounded_positions_count"])
        self.assertEqual(0.0, snapshot["summary"]["total_open_risk_amount"])
        self.assertIsNone(snapshot["open_trade_risks"][0]["risk_amount"])
        self.assertEqual("missing_stop_loss", snapshot["open_trade_risks"][0]["risk_state"])
        self.assertIn("sin SL", " ".join(snapshot["metadata"]["warnings"]))

    def test_legacy_zero_risk_without_stop_loss_is_promoted_to_missing_stop_loss(self) -> None:
        positions, _ = connector_api.sanitize_positions(
            [
                {
                    "position_id": "legacy-pos-1",
                    "symbol": "EURUSD",
                    "type": "BUY",
                    "volume": 1.0,
                    "sl": 0,
                    "profit": 12,
                    "swap": 0,
                    "risk_amount": 0,
                    "risk_pct": 0,
                }
            ]
        )

        self.assertEqual("missing_stop_loss", positions[0]["risk_state"])
        self.assertFalse(positions[0]["risk_calculable"])
        self.assertIsNone(positions[0]["risk_amount"])
        self.assertIsNone(positions[0]["risk_pct"])

    def test_symbol_exposure_uses_floating_pnl_including_swap(self) -> None:
        positions, _ = connector_api.sanitize_positions(
            [
                {
                    "position_id": "pos-1",
                    "symbol": "XAUUSD",
                    "type": "SELL",
                    "volume": 0.2,
                    "sl": 2050,
                    "profit": 50,
                    "swap": -7,
                    "floating_pnl": 43,
                    "risk_amount": 120,
                    "risk_pct": 1.2,
                }
            ]
        )

        snapshot = build_risk_metrics(
            account={"balance": 10000, "equity": 10043, "timestamp": "2026-05-07T08:00:00Z"},
            positions=positions,
            trades=[],
            policy_snapshot={},
        )

        self.assertEqual(43.0, snapshot["symbol_exposure"][0]["open_pnl"])
        self.assertEqual(120.0, snapshot["symbol_exposure"][0]["risk_amount"])

    def test_entry_only_commission_and_swap_are_included_when_entry_is_out_of_range(self) -> None:
        trades, _ = connector_api.sanitize_trades(
            [
                {
                    "ticket": "entry-out-of-range-close-1",
                    "position_id": "entry-out-of-range-position",
                    "symbol": "XAUUSD",
                    "type": "SELL",
                    "volume": 0.3,
                    "price": 2330.0,
                    "profit": 120.0,
                    "commission": 0,
                    "entry_commission": -4.0,
                    "close_commission": -1.0,
                    "swap": 0,
                    "entry_swap": -2.0,
                    "close_swap": 0.0,
                    "time": "2026-05-07T10:30:00Z",
                }
            ]
        )

        self.assertEqual("", trades[0]["open_time"])
        self.assertAlmostEqual(-5.0, trades[0]["commission"])
        self.assertAlmostEqual(-2.0, trades[0]["swap"])
        self.assertAlmostEqual(113.0, trades[0]["net"])

        metrics = connector_api.build_report_metrics(
            {"balance": 10000, "equity": 10113},
            trades,
            [],
        )

        self.assertAlmostEqual(113.0, metrics["netProfit"])
        self.assertAlmostEqual(-5.0, metrics["commissions"])
        self.assertAlmostEqual(-2.0, metrics["swaps"])
        self.assertEqual(1, metrics["totalTrades"])
        self.assertEqual(1, metrics["winTrades"])

    def test_default_reference_policy_does_not_generate_breach(self) -> None:
        raw_policy = connector_api.build_policy("4000082126")
        policy, _ = build_policy_snapshot(raw_policy)
        risk_snapshot = {
            "summary": {
                "peak_to_equity_drawdown_pct": 12.0,
                "daily_drawdown_pct": 4.0,
                "total_open_risk_pct": 5.0,
                "max_open_trade_risk_pct": 2.0,
            }
        }

        evaluation = evaluate_risk_policy(risk_snapshot, policy)

        self.assertEqual([], evaluation["breaches"])
        self.assertEqual([], evaluation["warnings"])
        self.assertEqual("reference", evaluation["limits_status"]["risk_per_trade"]["state"])
        self.assertFalse(evaluation["limits_status"]["risk_per_trade"]["is_configured"])
        self.assertEqual("reference_default", evaluation["limits_status"]["risk_per_trade"]["source"])

    def test_configured_policy_still_generates_breach(self) -> None:
        policy, _ = build_policy_snapshot(
            {
                "max_risk_per_trade_pct": 0.5,
                "max_risk_per_trade_pct_source": "user",
                "daily_dd_hard_stop": 2.0,
                "daily_dd_hard_stop_source": "user",
                "total_dd_hard_stop": 8.0,
                "total_dd_hard_stop_source": "user",
                "portfolio_heat_limit_pct": 3.0,
                "portfolio_heat_limit_pct_source": "user",
            }
        )
        risk_snapshot = {
            "summary": {
                "peak_to_equity_drawdown_pct": 1.0,
                "daily_drawdown_pct": 1.0,
                "total_open_risk_pct": 1.0,
                "max_open_trade_risk_pct": 0.8,
            }
        }

        evaluation = evaluate_risk_policy(risk_snapshot, policy)

        self.assertEqual("breach", evaluation["limits_status"]["risk_per_trade"]["state"])
        self.assertEqual("user", evaluation["limits_status"]["risk_per_trade"]["source"])
        self.assertTrue(evaluation["limits_status"]["risk_per_trade"]["is_configured"])
        self.assertEqual("RISK_PER_TRADE_BREACH", evaluation["breaches"][0]["code"])

    def test_report_metrics_exposes_net_and_gross_profit_factor(self) -> None:
        metrics = connector_api.build_report_metrics(
            {"balance": 10000, "equity": 10020},
            [
                {"profit": 100, "commission": -110, "swap": 0, "time": "2026-05-07T08:00:00Z"},
                {"profit": -50, "commission": 0, "swap": 0, "time": "2026-05-07T09:00:00Z"},
                {"profit": 80, "commission": 0, "swap": 0, "time": "2026-05-07T10:00:00Z"},
            ],
            [],
        )

        self.assertAlmostEqual(3.6, metrics["grossProfitFactor"])
        self.assertAlmostEqual(80 / 60, metrics["netProfitFactor"])
        self.assertAlmostEqual(metrics["netProfitFactor"], metrics["profitFactor"])
        self.assertEqual("net", metrics["profitFactorBasis"])

    def test_mql_connector_serializes_metric_contract_safely(self) -> None:
        source = (ROOT / "KMFXConnector.mq5").read_text(encoding="utf-8")

        self.assertNotIn("IntegerToString((int)ticket)", source)
        self.assertNotIn("KMFXDoubleJson(entry_price,_Digits)", source)
        self.assertNotIn("\"position_id\":"+ "position_id", source)
        self.assertIn("KMFXULongString(ticket)", source)
        self.assertIn("risk_state", source)
        self.assertIn("risk_calculable", source)
        self.assertIn("profitFactorBasis", source)


if __name__ == "__main__":
    unittest.main()
