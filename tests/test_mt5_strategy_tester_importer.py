import unittest

from kmfx_connector_api import build_backtest_vs_real_for_account_entry
from mt5_strategy_tester_importer import (
    parse_mt5_strategy_tester_report,
    parse_mt5_strategy_tester_reports,
)


class Mt5StrategyTesterImporterTests(unittest.TestCase):
    def test_parses_mt5_html_summary_and_deal_rows(self) -> None:
        html = """
        <html><body>
          <table>
            <tr><td>Expert</td><td>Asia range break</td><td>Total Net Profit</td><td>1 240.00</td></tr>
            <tr><td>Profit Factor</td><td>1.82</td><td>Expected Payoff</td><td>84.00</td></tr>
            <tr><td>Total Trades</td><td>186</td><td>Profit Trades (% of total)</td><td>107 (57.53%)</td></tr>
            <tr><td>Balance Drawdown Maximal</td><td>540.00 (5.40%)</td><td>Sharpe Ratio</td><td>1.16</td></tr>
          </table>
          <table>
            <tr><th>Time</th><th>Deal</th><th>Symbol</th><th>Type</th><th>Volume</th><th>Price</th><th>Profit</th><th>Commission</th><th>Swap</th></tr>
            <tr><td>2026-05-01T01:00:00+00:00</td><td>1</td><td>EURUSD</td><td>buy</td><td>0.10</td><td>1.0820</td><td>120</td><td>-4</td><td>0</td></tr>
            <tr><td>2026-05-01T02:00:00+00:00</td><td>2</td><td>EURUSD</td><td>sell</td><td>0.10</td><td>1.0830</td><td>-80</td><td>-4</td><td>0</td></tr>
          </table>
        </body></html>
        """

        report = parse_mt5_strategy_tester_report(
            html,
            filename="Asia_range_break.htm",
            imported_at="2026-05-02T12:00:00+00:00",
        )

        self.assertEqual(report["source"]["format"], "html")
        self.assertEqual(report["strategy"], "Asia range break")
        self.assertEqual(report["metrics"]["trade_count"], 186)
        self.assertEqual(report["metrics"]["profit_factor"], 1.82)
        self.assertAlmostEqual(report["metrics"]["win_rate_pct"], 57.53)
        self.assertEqual(report["metrics"]["max_drawdown_pct"], 5.4)
        self.assertEqual(len(report["trades"]), 2)
        self.assertIn("EURUSD", report["breakdowns"]["symbol"])

    def test_parses_csv_trade_rows_into_metrics_and_breakdowns(self) -> None:
        csv_report = "\n".join(
            [
                "Time,Symbol,Type,Profit,Commission,Swap,Spread,Slippage",
                "2026-05-01T13:00:00+00:00,NAS100,SELL,250,-7,0,1.4,0.3",
                "2026-05-01T14:00:00+00:00,NAS100,SELL,-110,-7,0,1.5,0.4",
                "2026-05-01T15:00:00+00:00,NAS100,BUY,180,-7,0,1.3,0.3",
            ]
        )

        report = parse_mt5_strategy_tester_report(
            csv_report,
            filename="Funded_continuation.csv",
            strategy_name="Funded continuation",
            imported_at="2026-05-02T12:00:00+00:00",
        )

        self.assertEqual(report["source"]["format"], "csv")
        self.assertEqual(report["metrics"]["trade_count"], 3)
        self.assertGreater(report["metrics"]["profit_factor"], 3)
        self.assertEqual(report["breakdowns"]["direction"]["SELL"]["trade_count"], 2)
        self.assertEqual(report["breakdowns"]["session"]["New York"]["trade_count"], 3)

    def test_parses_xml_summary_and_connector_helper_compares_account(self) -> None:
        xml_report = """
        <Report>
          <Expert>London Continuation</Expert>
          <TotalTrades>120</TotalTrades>
          <ProfitFactor>2.10</ProfitFactor>
          <ExpectedPayoff>95</ExpectedPayoff>
          <WinRatePct>61.5</WinRatePct>
          <MaxDrawdownPct>4.8</MaxDrawdownPct>
          <SharpeRatio>1.32</SharpeRatio>
        </Report>
        """
        backtests = parse_mt5_strategy_tester_reports(
            [{"content": xml_report, "filename": "London.xml"}],
            imported_at="2026-05-02T12:00:00+00:00",
        )
        account_entry = {
            "account_id": "acc-1",
            "dashboard_payload": {
                "balance": 100_000,
                "trades": [
                    {"time": "2026-05-01T08:00:00+00:00", "symbol": "EURUSD", "setup": "London Continuation", "profit": 180},
                    {"time": "2026-05-01T09:00:00+00:00", "symbol": "EURUSD", "setup": "London Continuation", "profit": -90},
                ],
            },
        }

        comparison = build_backtest_vs_real_for_account_entry(
            account_entry,
            backtests,
            min_real_trades=1,
            min_backtest_trades=30,
        )

        self.assertTrue(comparison["ok"])
        self.assertEqual(comparison["report"]["strategy_count"], 1)
        self.assertEqual(comparison["report"]["strategies"][0]["strategy"], "London Continuation")
        self.assertIn(comparison["report"]["strategies"][0]["status"], {"within_expected_variance", "edge_degraded", "sample_insufficient"})


if __name__ == "__main__":
    unittest.main()
