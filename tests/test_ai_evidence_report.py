import json
import unittest

from ai_evidence_report import build_ai_evidence_pack, build_ai_evidence_report, render_ai_evidence_markdown
from kmfx_connector_api import build_ai_evidence_report_for_account_entry, find_scoped_account_entry
from risk_metrics_engine import build_risk_metrics


class AiEvidenceReportTests(unittest.TestCase):
    def test_ai_evidence_report_builds_json_and_markdown_for_external_ai(self) -> None:
        account = {
            "name": "KMFX Funded",
            "broker": "IC Markets",
            "server": "Demo",
            "login": "123456789",
            "connection_key": "secret-should-not-export",
            "currency": "USD",
            "balance": 100_000,
            "equity": 100_350,
            "timestamp": "2026-05-02T10:00:00+00:00",
        }
        trades = [
            {"time": "2026-05-01T08:00:00+00:00", "symbol": "EURUSD", "profit": 500, "setup": "London", "type": "BUY", "comment": "Clean continuation"},
            {"time": "2026-05-01T10:00:00+00:00", "symbol": "NAS100", "profit": -450, "setup": "NY", "type": "SELL", "comment": "Late entry"},
            {"time": "2026-05-02T08:00:00+00:00", "symbol": "EURUSD", "profit": 250, "setup": "London", "type": "BUY"},
            {"time": "2026-05-02T10:00:00+00:00", "symbol": "NAS100", "profit": -300, "setup": "NY", "type": "SELL"},
            {"time": "2026-05-02T11:00:00+00:00", "symbol": "XAUUSD", "profit": 100, "type": "BUY"},
        ]
        risk_snapshot = build_risk_metrics(
            account=account,
            positions=[
                {"position_id": "1", "symbol": "EURUSD", "risk_pct": 0.4, "risk_amount": 400},
            ],
            trades=trades,
            policy_snapshot={
                "risk_per_trade_pct": 0.5,
                "daily_dd_limit_pct": 1.2,
                "max_dd_limit_pct": 8.0,
                "portfolio_heat_limit_pct": 2.0,
                "profit_target_pct": 8.0,
                "profit_target_remaining_pct": 4.0,
                "consistency_max_day_share_pct": 60.0,
                "minimum_trading_days": 4,
                "pass_probability_simulations": 100,
                "pass_probability_horizon_trades": 12,
            },
        )
        report = build_ai_evidence_report(
            account=account,
            trades=trades,
            risk_snapshot=risk_snapshot,
            journal_entries=[
                {
                    "date": "2026-05-02",
                    "symbol": "NAS100",
                    "setup": "NY",
                    "pnl": -300,
                    "compliance": "Parcial",
                    "mistake": "Entrada tardia",
                    "emotion": "Impaciencia",
                    "lesson": "Esperar cierre de vela.",
                }
            ],
            generated_at="2026-05-02T12:00:00+00:00",
        )

        pack = report["pack"]
        parsed = json.loads(report["json"])

        self.assertEqual(report["report_type"], "external_ai_evidence_pack")
        self.assertEqual(parsed["schema_version"], pack["schema_version"])
        self.assertTrue(pack["privacy"]["external_ai_ready"])
        self.assertFalse(pack["privacy"]["contains_connection_keys"])
        self.assertEqual(pack["account"]["login_masked"], "***6789")
        self.assertNotIn("secret-should-not-export", report["json"])
        self.assertIn("No des senales de compra o venta", pack["external_ai_prompt"])
        self.assertEqual(pack["patterns"]["worst_by_symbol"][0]["key"], "NAS100")
        self.assertTrue(any(item["type"] == "missing_strategy" for item in pack["review_queue"]))
        self.assertTrue(any(item["type"] == "journal_compliance" for item in pack["review_queue"]))
        self.assertIn("prop_firm", pack)
        self.assertEqual(pack["prop_firm"]["pass_probability"]["simulations"], 100)
        self.assertIn("discipline_coverage_pct", pack["strategies"]["groups"][0])
        self.assertIn("# KMFX Edge AI Evidence Pack", report["markdown"])
        self.assertIn("Disciplina", report["markdown"])
        self.assertIn("## Prompt sugerido", report["markdown"])

    def test_ai_evidence_pack_handles_empty_inputs(self) -> None:
        pack = build_ai_evidence_pack(
            account={"name": "Empty", "login": "42"},
            trades=[],
            risk_snapshot={},
            journal_entries=[],
            generated_at="2026-05-02T12:00:00+00:00",
        )
        markdown = render_ai_evidence_markdown(pack)

        self.assertEqual(pack["sources"]["trades_count"], 0)
        self.assertEqual(pack["period"]["label"], "sin periodo")
        self.assertEqual(pack["account"]["login_masked"], "**")
        self.assertIn("Sin alertas de review generadas", markdown)
        self.assertIn("No generar senales", markdown)

    def test_connector_account_entry_builds_copy_ready_report_without_secrets(self) -> None:
        account = {
            "name": "Scoped Account",
            "broker": "IC Markets",
            "server": "Demo",
            "login": "55554444",
            "currency": "EUR",
            "balance": 50_000,
            "equity": 50_250,
            "timestamp": "2026-05-02T10:00:00+00:00",
        }
        trades = [
            {"time": "2026-05-01T08:00:00+00:00", "symbol": "EURUSD", "profit": 300, "setup": "London"},
            {"time": "2026-05-01T10:00:00+00:00", "symbol": "EURUSD", "profit": -120, "setup": "London"},
        ]
        risk_snapshot = build_risk_metrics(
            account=account,
            positions=[],
            trades=trades,
            policy_snapshot={
                "risk_per_trade_pct": 0.5,
                "daily_dd_limit_pct": 1.2,
                "max_dd_limit_pct": 8.0,
            },
        )
        entry = {
            "account_id": "acc-1",
            "connection_key": "very-secret-key",
            "api_key": "another-secret",
            "display_name": "Scoped Account",
            "dashboard_payload": {
                **account,
                "trades": trades,
                "riskSnapshot": risk_snapshot,
                "journalEntries": [
                    {
                        "date": "2026-05-01",
                        "symbol": "EURUSD",
                        "compliance": "Cumplida",
                        "lesson": "Good patience.",
                    }
                ],
            },
        }

        report = build_ai_evidence_report_for_account_entry(
            entry,
            generated_at="2026-05-02T12:00:00+00:00",
        )

        self.assertTrue(report["ok"])
        self.assertEqual(report["account_id"], "acc-1")
        self.assertEqual(report["pack"]["account"]["login_masked"], "***4444")
        self.assertIn("KMFX Edge AI Evidence Pack", report["markdown"])
        self.assertNotIn("very-secret-key", report["json"])
        self.assertNotIn("another-secret", report["json"])

    def test_scoped_account_entry_lookup_rejects_out_of_scope_account(self) -> None:
        snapshot = {
            "accounts": [
                {"account_id": "owned", "dashboard_payload": {}},
            ]
        }

        self.assertEqual({"account_id": "owned", "dashboard_payload": {}}, find_scoped_account_entry(snapshot, "owned"))
        self.assertIsNone(find_scoped_account_entry(snapshot, "other"))


if __name__ == "__main__":
    unittest.main()
