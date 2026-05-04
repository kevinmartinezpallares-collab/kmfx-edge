from __future__ import annotations

import json
import unittest
from pathlib import Path

import kmfx_connector_api as connector_api


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_PATH = ROOT / "tests" / "fixtures" / "live_accounts_snapshot_two_mt5.json"


REQUIRED_ACCOUNT_FIELDS = {
    "account_id",
    "user_id",
    "broker",
    "platform",
    "login",
    "server",
    "connection_mode",
    "status",
    "last_sync_at",
    "dashboard_payload",
}

REQUIRED_PAYLOAD_FIELDS = {
    "payloadSource",
    "balance",
    "equity",
    "floatingPnl",
    "openPnl",
    "closedPnl",
    "totalPnl",
    "openPositionsCount",
    "positions",
    "trades",
    "history",
    "reportMetrics",
    "riskSnapshot",
    "symbolSpecs",
}

REQUIRED_REPORT_METRICS = {
    "balance",
    "equity",
    "netProfit",
    "grossProfit",
    "grossLoss",
    "winRate",
    "totalTrades",
    "profitFactor",
    "drawdownPct",
    "commissions",
    "swaps",
    "bestTrade",
    "worstTrade",
}

REQUIRED_RISK_SUMMARY = {
    "floating_drawdown_pct",
    "peak_to_equity_drawdown_pct",
    "max_drawdown_limit_pct",
    "distance_to_max_dd_limit_pct",
    "daily_drawdown_pct",
    "distance_to_daily_dd_limit_pct",
    "total_open_risk_amount",
    "total_open_risk_pct",
    "max_risk_per_trade_pct",
    "open_positions_count",
    "portfolio_heat_limit_pct",
    "distance_to_heat_limit_pct",
}


def load_fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def assert_number(testcase: unittest.TestCase, value, field_name: str) -> None:
    testcase.assertIsInstance(value, (int, float), field_name)


class DashboardLiveContractTests(unittest.TestCase):
    def test_live_snapshot_fixture_has_two_owned_mt5_accounts(self) -> None:
        snapshot = load_fixture()

        self.assertEqual("user-live-contract", snapshot["scope_user_id"])
        self.assertEqual("mt5-orion-80571774", snapshot["active_account_id"])
        self.assertEqual(2, len(snapshot["accounts"]))

        for account in snapshot["accounts"]:
            self.assertEqual("user-live-contract", account["user_id"])
            self.assertEqual("mt5", account["platform"])
            self.assertEqual("active", account["status"])
            self.assertTrue(REQUIRED_ACCOUNT_FIELDS.issubset(account.keys()))
            self.assertEqual("mt5_sync_live", account["dashboard_payload"]["payloadSource"])

    def test_dashboard_payload_contract_supports_live_sections(self) -> None:
        snapshot = load_fixture()

        for account in snapshot["accounts"]:
            payload = account["dashboard_payload"]
            self.assertTrue(REQUIRED_PAYLOAD_FIELDS.issubset(payload.keys()), account["account_id"])
            self.assertGreater(len(payload["trades"]), 0, account["account_id"])
            self.assertGreater(len(payload["history"]), 1, account["account_id"])
            self.assertGreaterEqual(len(payload["positions"]), 1, account["account_id"])
            self.assertGreater(len(payload["symbolSpecs"]), 0, account["account_id"])

            for field in ("balance", "equity", "openPnl", "closedPnl", "totalPnl"):
                assert_number(self, payload[field], f"{account['account_id']}:{field}")

            metrics = payload["reportMetrics"]
            self.assertTrue(REQUIRED_REPORT_METRICS.issubset(metrics.keys()), account["account_id"])
            self.assertEqual(payload["balance"], metrics["balance"])
            self.assertEqual(payload["equity"], metrics["equity"])
            self.assertEqual(payload["closedPnl"], metrics["netProfit"])
            self.assertEqual(len(payload["trades"]), metrics["totalTrades"])

            risk_snapshot = payload["riskSnapshot"]
            self.assertTrue(REQUIRED_RISK_SUMMARY.issubset(risk_snapshot["summary"].keys()), account["account_id"])
            self.assertIn(risk_snapshot["status"]["risk_status"], {"ok", "warning", "blocked"})
            self.assertIn("limits_status", risk_snapshot["policy_evaluation"])
            self.assertIsInstance(risk_snapshot["symbol_exposure"], list)
            self.assertIsInstance(risk_snapshot["open_trade_risks"], list)

    def test_visible_kpis_resolve_from_live_contract_without_mock(self) -> None:
        snapshot = load_fixture()
        accounts = snapshot["accounts"]

        total_equity = sum(account["dashboard_payload"]["reportMetrics"]["equity"] for account in accounts)
        total_balance = sum(account["dashboard_payload"]["reportMetrics"]["balance"] for account in accounts)
        total_closed_pnl = sum(account["dashboard_payload"]["reportMetrics"]["netProfit"] for account in accounts)
        total_open_pnl = sum(account["dashboard_payload"]["openPnl"] for account in accounts)
        total_open_risk = sum(account["dashboard_payload"]["riskSnapshot"]["summary"]["total_open_risk_amount"] for account in accounts)

        self.assertAlmostEqual(110711.4, total_equity)
        self.assertAlmostEqual(110611.25, total_balance)
        self.assertAlmostEqual(611.25, total_closed_pnl)
        self.assertAlmostEqual(100.15, total_open_pnl)
        self.assertAlmostEqual(300.0, total_open_risk)

        active = next(account for account in accounts if account["account_id"] == snapshot["active_account_id"])
        self.assertEqual("Orion Challenge 5k", active["display_name"])
        self.assertEqual("AUDUSD", active["dashboard_payload"]["positions"][0]["symbol"])
        self.assertIn("AUDUSD", active["dashboard_payload"]["symbolSpecs"])

    def test_backend_payload_builder_produces_dashboard_contract(self) -> None:
        account = {
            "login": "contract-123",
            "broker": "Contract Broker",
            "server": "Contract-Live",
            "currency": "USD",
            "balance": 100000.0,
            "equity": 100125.0,
            "profit": 125.0,
        }
        positions = [
            {
                "position_id": "pos-contract-1",
                "symbol": "EURUSD",
                "type": "BUY",
                "volume": 1.0,
                "open_price": 1.1000,
                "current_price": 1.10125,
                "profit": 125.0,
            }
        ]
        trades = [
            {
                "ticket": "trade-contract-1",
                "position_id": "position-contract-closed-1",
                "symbol": "EURUSD",
                "type": "BUY",
                "volume": 1.0,
                "open_time": "2026-05-03T09:00:00Z",
                "close_time": "2026-05-03T10:00:00Z",
                "entry_price": 1.09,
                "exit_price": 1.095,
                "profit": 500.0,
                "commission": -5.0,
                "swap": 0.0,
            }
        ]
        raw_payload = {
            "timestamp": "2026-05-04T09:30:00Z",
            "history": [
                {"timestamp": "2026-05-03T00:00:00Z", "value": 99505.0},
                {"timestamp": "2026-05-04T09:30:00Z", "value": 100125.0},
            ],
            "symbolSpecs": {
                "EURUSD": {
                    "symbol": "EURUSD",
                    "digits": 5,
                    "point": 0.00001,
                    "tickSize": 0.00001,
                    "tickValue": 1.0,
                    "contractSize": 100000,
                    "tradeCalcMode": "FOREX",
                }
            },
        }

        payload = connector_api.build_dashboard_account_payload(account, positions, trades, raw_payload, None)

        self.assertEqual("mt5_sync_live", payload["payloadSource"])
        self.assertTrue(REQUIRED_PAYLOAD_FIELDS.issubset(payload.keys()))
        self.assertEqual(100000.0, payload["reportMetrics"]["balance"])
        self.assertEqual(100125.0, payload["reportMetrics"]["equity"])
        self.assertEqual(495.0, payload["reportMetrics"]["netProfit"])
        self.assertEqual(1, payload["reportMetrics"]["totalTrades"])
        self.assertEqual(1, payload["openPositionsCount"])
        self.assertIn("EURUSD", payload["symbolSpecs"])
        self.assertTrue(REQUIRED_RISK_SUMMARY.issubset(payload["riskSnapshot"]["summary"].keys()))


if __name__ == "__main__":
    unittest.main()
