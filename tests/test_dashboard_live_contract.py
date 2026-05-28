from __future__ import annotations

import json
import subprocess
import textwrap
import unittest
from pathlib import Path

import kmfx_connector_api as connector_api


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_PATH = ROOT / "tests" / "fixtures" / "live_accounts_snapshot_two_mt5.json"
ANONYMIZED_FIXTURE_PATH = ROOT / "tests" / "fixtures" / "live_accounts_snapshot_anonymized_metrics.json"


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


def load_anonymized_fixture() -> dict:
    return json.loads(ANONYMIZED_FIXTURE_PATH.read_text(encoding="utf-8"))


def assert_number(testcase: unittest.TestCase, value, field_name: str) -> None:
    testcase.assertIsInstance(value, (int, float), field_name)


class DashboardLiveContractTests(unittest.TestCase):
    def test_anonymized_metrics_fixture_has_no_live_identifiers(self) -> None:
        raw_text = ANONYMIZED_FIXTURE_PATH.read_text(encoding="utf-8")
        forbidden_identifiers = (
            "80571774",
            "4000082126",
            "Orion",
            "Darwinex",
            "OGM",
            "OGMInternational",
            "Tradeslide",
            "Kevin",
            "kevin",
        )
        for identifier in forbidden_identifiers:
            self.assertNotIn(identifier, raw_text)

        snapshot = load_anonymized_fixture()
        self.assertEqual("user-anon-metrics-contract", snapshot["scope_user_id"])
        self.assertEqual("mt5-alpha-10000001", snapshot["active_account_id"])
        self.assertEqual(2, len(snapshot["accounts"]))

        for account in snapshot["accounts"]:
            self.assertEqual("user-anon-metrics-contract", account["user_id"])
            self.assertEqual("mt5", account["platform"])
            self.assertEqual("active", account["status"])
            self.assertTrue(REQUIRED_ACCOUNT_FIELDS.issubset(account.keys()), account["account_id"])
            self.assertEqual("mt5_sync_live", account["dashboard_payload"]["payloadSource"])

    def test_anonymized_metrics_fixture_supports_dashboard_sections(self) -> None:
        snapshot = load_anonymized_fixture()

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
            self.assertIn("professional_metrics", risk_snapshot)

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

    def test_backend_payload_preserves_previous_positive_equity_on_partial_zero_sync(self) -> None:
        account = {
            "login": "contract-zero-sync",
            "broker": "Darwinex",
            "server": "Darwinex-Live",
            "currency": "USD",
            "balance": 0.0,
            "equity": 0.0,
            "profit": 0.0,
        }
        previous_payload = {
            "balance": 103379.11,
            "equity": 103379.11,
            "account": {
                "balance": 103379.11,
                "equity": 103379.11,
            },
        }
        raw_payload = {"timestamp": "2026-05-28T07:38:25Z"}

        payload = connector_api.build_dashboard_account_payload(account, [], [], raw_payload, previous_payload)

        self.assertEqual(103379.11, payload["balance"])
        self.assertEqual(103379.11, payload["equity"])
        self.assertEqual("partial_account_metrics", payload["data_status"])
        self.assertIn("syncIssues", payload)
        self.assertIn("balance_preserved_from_previous_snapshot", payload["riskSnapshot"]["metadata"]["warnings"])
        self.assertIn("equity_preserved_from_previous_snapshot", payload["riskSnapshot"]["metadata"]["warnings"])

    def test_backend_payload_feeds_dashboard_professional_kpis_contract(self) -> None:
        account = {
            "login": "contract-456",
            "broker": "Contract Broker",
            "server": "Contract-Live",
            "currency": "USD",
            "balance": 100000.0,
            "equity": 101200.0,
            "profit": 0.0,
        }
        trades = [
            {"ticket": "t-1", "position_id": "p-1", "symbol": "EURUSD", "type": "BUY", "time": "2026-05-01T09:00:00Z", "profit": 850.0, "commission": -5.0, "swap": 0.0},
            {"ticket": "t-2", "position_id": "p-2", "symbol": "EURUSD", "type": "SELL", "time": "2026-05-01T11:00:00Z", "profit": -420.0, "commission": -5.0, "swap": 0.0},
            {"ticket": "t-3", "position_id": "p-3", "symbol": "GBPUSD", "type": "BUY", "time": "2026-05-02T10:00:00Z", "profit": 640.0, "commission": -5.0, "swap": 0.0},
            {"ticket": "t-4", "position_id": "p-4", "symbol": "XAUUSD", "type": "SELL", "time": "2026-05-03T12:00:00Z", "profit": -980.0, "commission": -8.0, "swap": -2.0},
            {"ticket": "t-5", "position_id": "p-5", "symbol": "AUDUSD", "type": "BUY", "time": "2026-05-04T13:00:00Z", "profit": 320.0, "commission": -4.0, "swap": 0.0},
            {"ticket": "t-6", "position_id": "p-6", "symbol": "USDJPY", "type": "SELL", "time": "2026-05-05T14:00:00Z", "profit": -260.0, "commission": -4.0, "swap": 0.0},
        ]
        positions = [
            {"position_id": "open-1", "symbol": "EURUSD", "type": "BUY", "volume": 0.5, "risk_pct": 0.35, "risk_amount": 350.0, "profit": 45.0, "swap": 0.0},
        ]
        raw_payload = {
            "timestamp": "2026-05-05T14:05:00Z",
            "history": [
                {"timestamp": "2026-05-01T00:00:00Z", "value": 100000.0},
                {"timestamp": "2026-05-02T00:00:00Z", "value": 100420.0},
                {"timestamp": "2026-05-03T00:00:00Z", "value": 100060.0},
                {"timestamp": "2026-05-04T00:00:00Z", "value": 100380.0},
                {"timestamp": "2026-05-05T14:05:00Z", "value": 101200.0},
            ],
        }

        payload = connector_api.build_dashboard_account_payload(account, positions, trades, raw_payload, None)
        professional = payload["riskSnapshot"]["professional_metrics"]
        backend_var95 = professional["tail_risk"]["var_95"]
        backend_var99 = professional["tail_risk"]["var_99"]

        script = f"""
          import {{ selectDashboardProfessionalKpis }} from "./js/modules/dashboard-professional-kpis.js";

          const payload = {json.dumps(payload)};
          const contract = selectDashboardProfessionalKpis({{
            model: {{
              account: {{ equity: payload.equity, balance: payload.balance }},
              trades: payload.trades,
              positions: payload.positions,
              dayStats: [],
              dailyReturns: [],
              drawdownCurve: [],
              totals: {{
                pnl: payload.reportMetrics.netProfit,
                drawdown: {{ maxPct: payload.reportMetrics.drawdownPct }},
                ratios: {{}},
              }},
            }},
            account: {{ dashboardPayload: payload }},
            riskSnapshot: payload.riskSnapshot,
          }});
          const byId = Object.fromEntries(contract.kpis.map((kpi) => [kpi.id, kpi]));
          console.log(JSON.stringify({{
            version: contract.version,
            var95: byId.var_95,
            var99: byId.var_99,
          }}));
        """
        result = subprocess.run(
            ["node", "--input-type=module", "-e", textwrap.dedent(script)],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if result.returncode != 0:
            self.fail(f"dashboard professional KPI contract failed\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}")
        dashboard_contract = json.loads(result.stdout)

        self.assertEqual("dashboard_professional_kpis_v1", dashboard_contract["version"])
        self.assertEqual("professional_metrics.tail_risk", dashboard_contract["var95"]["source"])
        self.assertEqual("professional_metrics.tail_risk", dashboard_contract["var99"]["source"])
        self.assertAlmostEqual(backend_var95["var_amount"], dashboard_contract["var95"]["value"])
        self.assertAlmostEqual(round(backend_var95["cvar_amount"], 2), dashboard_contract["var95"]["meta"]["cvarAmount"])
        self.assertAlmostEqual(backend_var99["var_amount"], dashboard_contract["var99"]["value"])
        self.assertEqual(backend_var95["sample_size"], dashboard_contract["var95"]["meta"]["sampleSize"])
        self.assertEqual(backend_var95["sample_quality_label"], dashboard_contract["var95"]["meta"]["sampleQualityLabel"])
        self.assertIn("Módulo de riesgo KMFX", dashboard_contract["var95"]["explain"]["source"])


if __name__ == "__main__":
    unittest.main()
