import unittest

from backtest_real_engine import build_backtest_vs_real_report


class BacktestVsRealEngineTests(unittest.TestCase):
    def test_detects_edge_degradation_by_strategy_and_dimension(self) -> None:
        backtests = [
            {
                "strategy": "London",
                "metrics": {
                    "trade_count": 240,
                    "profit_factor": 2.0,
                    "expectancy_amount": 120,
                    "expectancy_r": 0.45,
                    "win_rate_pct": 60,
                    "max_drawdown_pct": 4.0,
                    "sharpe_ratio": 1.4,
                    "average_slippage": 0.2,
                    "average_spread": 0.9,
                    "commission_per_trade": -5,
                },
                "breakdowns": {
                    "symbol": {
                        "EURUSD": {"trade_count": 120, "profit_factor": 2.2, "expectancy_amount": 140, "win_rate_pct": 62, "max_drawdown_pct": 3.0},
                        "NAS100": {"trade_count": 80, "profit_factor": 1.8, "expectancy_amount": 100, "win_rate_pct": 58, "max_drawdown_pct": 4.5},
                    },
                    "session": {
                        "London": {"trade_count": 200, "profit_factor": 2.0, "expectancy_amount": 120, "win_rate_pct": 60, "max_drawdown_pct": 4.0},
                    },
                    "direction": {
                        "BUY": {"trade_count": 140, "profit_factor": 2.1, "expectancy_amount": 130, "win_rate_pct": 61, "max_drawdown_pct": 4.0},
                        "SELL": {"trade_count": 100, "profit_factor": 1.9, "expectancy_amount": 100, "win_rate_pct": 58, "max_drawdown_pct": 4.0},
                    },
                },
            }
        ]
        real_trades = [
            {"time": "2026-05-01T08:00:00+00:00", "symbol": "EURUSD", "setup": "London", "session": "London", "type": "BUY", "profit": 80, "risk_amount": 100, "slippage": 0.5, "spread": 1.2, "commission": -7},
            {"time": "2026-05-01T09:00:00+00:00", "symbol": "EURUSD", "setup": "London", "session": "London", "type": "BUY", "profit": -120, "risk_amount": 100, "slippage": 0.4, "spread": 1.1, "commission": -7},
            {"time": "2026-05-02T08:00:00+00:00", "symbol": "NAS100", "setup": "London", "session": "London", "type": "SELL", "profit": -450, "risk_amount": 150, "slippage": 0.8, "spread": 1.8, "commission": -9},
            {"time": "2026-05-02T09:00:00+00:00", "symbol": "NAS100", "setup": "London", "session": "London", "type": "SELL", "profit": 90, "risk_amount": 150, "slippage": 0.7, "spread": 1.7, "commission": -9},
            {"time": "2026-05-03T08:00:00+00:00", "symbol": "NAS100", "setup": "London", "session": "London", "type": "SELL", "profit": -360, "risk_amount": 150, "slippage": 0.9, "spread": 1.9, "commission": -9},
            {"time": "2026-05-03T09:00:00+00:00", "symbol": "EURUSD", "setup": "London", "session": "London", "type": "BUY", "profit": 70, "risk_amount": 100, "slippage": 0.5, "spread": 1.2, "commission": -7},
        ]

        report = build_backtest_vs_real_report(
            backtests=backtests,
            real_trades=real_trades,
            starting_equity=100_000,
            min_real_trades=5,
            min_backtest_trades=100,
        )

        strategy = report["strategies"][0]
        self.assertEqual(report["report_type"], "backtest_vs_real")
        self.assertEqual(strategy["strategy"], "London")
        self.assertEqual(strategy["status"], "edge_degraded")
        self.assertGreaterEqual(report["diagnostic_counts"]["edge_degraded"], 1)
        self.assertTrue(any(item["metric"] == "profit_factor" and item["state"] == "degraded" for item in strategy["metric_comparisons"]))
        self.assertEqual(strategy["dimension_breakdown"]["symbol"][0]["key"], "NAS100")
        self.assertEqual(strategy["dimension_breakdown"]["symbol"][0]["state"], "degraded")
        self.assertTrue(strategy["cost_comparison"]["has_extra_cost"])
        self.assertTrue(any("Reducir sizing" in action for action in strategy["actions"]))

    def test_marks_real_sample_insufficient_before_degrading(self) -> None:
        report = build_backtest_vs_real_report(
            backtests=[
                {
                    "strategy": "NY",
                    "metrics": {
                        "trade_count": 180,
                        "profit_factor": 1.8,
                        "expectancy_amount": 90,
                        "win_rate_pct": 58,
                        "max_drawdown_pct": 5.0,
                    },
                }
            ],
            real_trades=[
                {"time": "2026-05-01T14:00:00+00:00", "symbol": "XAUUSD", "setup": "NY", "profit": -200},
                {"time": "2026-05-02T14:00:00+00:00", "symbol": "XAUUSD", "setup": "NY", "profit": 120},
            ],
            min_real_trades=10,
        )

        self.assertEqual(report["strategies"][0]["status"], "sample_insufficient")
        self.assertTrue(any("ampliar muestra" in action for action in report["strategies"][0]["actions"]))

    def test_flags_backtest_not_reliable_and_real_without_backtest(self) -> None:
        report = build_backtest_vs_real_report(
            backtests=[
                {
                    "strategy": "Asia",
                    "metrics": {
                        "trade_count": 12,
                        "profit_factor": 4.0,
                        "expectancy_amount": 200,
                        "win_rate_pct": 70,
                        "max_drawdown_pct": 1.0,
                    },
                }
            ],
            real_trades=[
                {"time": "2026-05-01T01:00:00+00:00", "symbol": "USDJPY", "setup": "Asia", "profit": 80},
                {"time": "2026-05-01T09:00:00+00:00", "symbol": "EURUSD", "setup": "London", "profit": 100},
            ],
            min_real_trades=1,
            min_backtest_trades=30,
        )

        self.assertEqual(report["strategies"][0]["status"], "backtest_not_reliable")
        self.assertEqual(report["real_strategy_without_backtest_count"], 1)
        self.assertEqual(report["real_strategies_without_backtest"], ["London"])


if __name__ == "__main__":
    unittest.main()
