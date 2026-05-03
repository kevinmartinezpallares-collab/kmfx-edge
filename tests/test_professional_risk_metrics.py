import unittest

from risk_math import (
    calculate_analytical_risk_of_ruin,
    calculate_drawdown_path_metrics,
    calculate_monte_carlo_var_metrics,
    calculate_monte_carlo_risk_summary,
    calculate_parametric_tail_risk_metrics,
    calculate_prop_firm_intelligence_metrics,
    calculate_prop_firm_pass_probability_metrics,
    calculate_prop_firm_payout_ledger_metrics,
    calculate_risk_adjusted_metrics,
    calculate_sizing_survival_metrics,
    calculate_strategy_allocation_summary,
    calculate_strategy_correlation_metrics,
    calculate_strategy_discipline_metrics,
    calculate_strategy_portfolio_heat_metrics,
    calculate_strategy_score_metrics,
    calculate_tail_risk_metrics,
    calculate_trade_performance_metrics,
)
from risk_metrics_engine import aggregate_portfolio_risk, build_risk_metrics


class ProfessionalRiskMetricsTests(unittest.TestCase):
    def test_tail_risk_returns_positive_var_and_cvar(self) -> None:
        metrics = calculate_tail_risk_metrics([120, -50, -200, 75, -25, 30], confidence=0.95)

        self.assertEqual(metrics.sample_size, 6)
        self.assertGreater(metrics.var_amount, 0)
        self.assertGreaterEqual(metrics.cvar_amount, metrics.var_amount)
        self.assertEqual(metrics.method, "historical")

    def test_tail_risk_handles_empty_sample(self) -> None:
        metrics = calculate_tail_risk_metrics([], confidence=0.99)

        self.assertEqual(metrics.sample_size, 0)
        self.assertEqual(metrics.var_amount, 0.0)
        self.assertEqual(metrics.cvar_amount, 0.0)

    def test_parametric_tail_risk_requires_sample_then_returns_var(self) -> None:
        insufficient = calculate_parametric_tail_risk_metrics([100, -50], confidence=0.95)
        self.assertEqual(insufficient.sample_size, 2)
        self.assertEqual(insufficient.var_amount, 0.0)
        self.assertEqual(insufficient.method, "parametric_normal")

        metrics = calculate_parametric_tail_risk_metrics([120, -80, 60, -40, 90, -70] * 5, confidence=0.95)
        self.assertEqual(metrics.sample_size, 30)
        self.assertGreater(metrics.var_amount, 0.0)
        self.assertGreaterEqual(metrics.cvar_amount, metrics.var_amount)

    def test_monte_carlo_var_is_deterministic_with_seed(self) -> None:
        first = calculate_monte_carlo_var_metrics(
            [100, -50, 75, -25],
            confidence=0.95,
            simulations=200,
            horizon_trades=5,
            seed=11,
        )
        second = calculate_monte_carlo_var_metrics(
            [100, -50, 75, -25],
            confidence=0.95,
            simulations=200,
            horizon_trades=5,
            seed=11,
        )

        self.assertEqual(first, second)
        self.assertEqual(first.sample_size, 4)
        self.assertEqual(first.method, "monte_carlo_bootstrap")
        self.assertGreaterEqual(first.var_amount, 0.0)

    def test_drawdown_path_tracks_amount_percentage_and_recovery(self) -> None:
        metrics = calculate_drawdown_path_metrics([100_000, 105_000, 98_000, 99_000, 110_000])

        self.assertEqual(metrics.max_drawdown_amount, 7_000)
        self.assertAlmostEqual(metrics.max_drawdown_pct, 6.6667, places=3)
        self.assertEqual(metrics.average_drawdown_amount, 6_500)
        self.assertAlmostEqual(metrics.average_drawdown_pct, 6.1905, places=3)
        self.assertEqual(metrics.max_drawdown_duration_periods, 1)
        self.assertEqual(metrics.longest_underwater_periods, 3)
        self.assertEqual(metrics.time_to_recovery_periods, 2)
        self.assertAlmostEqual(metrics.ulcer_index, 3.9268, places=3)
        self.assertEqual(metrics.equity_high_water_mark, 110_000)
        self.assertGreater(metrics.recovery_factor or 0.0, 0.0)

    def test_drawdown_path_marks_unrecovered_drawdown(self) -> None:
        metrics = calculate_drawdown_path_metrics([100_000, 120_000, 80_000, 90_000])

        self.assertEqual(metrics.max_drawdown_amount, 40_000)
        self.assertAlmostEqual(metrics.max_drawdown_pct, 33.3333, places=3)
        self.assertIsNone(metrics.time_to_recovery_periods)
        self.assertEqual(metrics.longest_underwater_periods, 2)
        self.assertEqual(metrics.equity_high_water_mark, 120_000)
        self.assertGreater(metrics.ulcer_index, 0.0)

    def test_monte_carlo_is_deterministic_with_seed(self) -> None:
        first = calculate_monte_carlo_risk_summary(
            [1.0, -0.5, 0.75, -0.25],
            simulations=200,
            horizon_trades=20,
            ruin_threshold_pct=10,
            seed=7,
        )
        second = calculate_monte_carlo_risk_summary(
            [1.0, -0.5, 0.75, -0.25],
            simulations=200,
            horizon_trades=20,
            ruin_threshold_pct=10,
            seed=7,
        )

        self.assertEqual(first, second)
        self.assertEqual(first.sample_size, 4)
        self.assertGreaterEqual(first.ruin_probability_pct, 0.0)
        self.assertLessEqual(first.ruin_probability_pct, 100.0)

    def test_analytical_risk_of_ruin_uses_edge_risk_and_threshold(self) -> None:
        metrics = calculate_analytical_risk_of_ruin(
            sample_size=120,
            win_rate_pct=55,
            payoff_ratio=1.5,
            risk_per_trade_pct=1.0,
            ruin_threshold_pct=20,
        )

        self.assertEqual(metrics.method, "analytical_brownian")
        self.assertEqual(metrics.confidence_level, "high")
        self.assertAlmostEqual(metrics.expectancy_r or 0.0, 0.375, places=3)
        self.assertEqual(metrics.risk_units_to_ruin, 20.0)
        self.assertIsNotNone(metrics.analytic_ruin_probability_pct)
        self.assertGreater(metrics.analytic_ruin_probability_pct or 0.0, 0.0)
        self.assertLess(metrics.analytic_ruin_probability_pct or 100.0, 1.0)

    def test_analytical_risk_of_ruin_marks_non_positive_edge_as_full_ruin(self) -> None:
        metrics = calculate_analytical_risk_of_ruin(
            sample_size=42,
            win_rate_pct=45,
            payoff_ratio=1.0,
            risk_per_trade_pct=1.0,
            ruin_threshold_pct=10,
        )

        self.assertEqual(metrics.confidence_level, "medium")
        self.assertLess(metrics.expectancy_r or 0.0, 0.0)
        self.assertEqual(metrics.analytic_ruin_probability_pct, 100.0)

    def test_analytical_risk_of_ruin_handles_missing_inputs(self) -> None:
        metrics = calculate_analytical_risk_of_ruin(
            sample_size=0,
            win_rate_pct=0,
            payoff_ratio=None,
            risk_per_trade_pct=0,
            ruin_threshold_pct=0,
        )

        self.assertEqual(metrics.confidence_level, "unavailable")
        self.assertIsNone(metrics.analytic_ruin_probability_pct)
        self.assertIsNone(metrics.risk_units_to_ruin)

    def test_strategy_score_rates_profitable_stable_strategy(self) -> None:
        pnls = [300, -100, 250, -80, 220, -70] * 6
        r_values = [3, -1, 2.5, -0.8, 2.2, -0.7] * 6
        performance = calculate_trade_performance_metrics(pnls, r_values)
        drawdown_path = calculate_drawdown_path_metrics(
            [100_000, 100_300, 100_200, 100_450, 100_370, 100_590, 100_520] * 6
        )
        tail_risk = calculate_tail_risk_metrics(pnls, confidence=0.95)
        ruin = calculate_analytical_risk_of_ruin(
            sample_size=performance.sample_size,
            win_rate_pct=performance.win_rate_pct,
            payoff_ratio=performance.payoff_ratio,
            risk_per_trade_pct=0.75,
            ruin_threshold_pct=10.0,
        )

        score = calculate_strategy_score_metrics(performance, drawdown_path, tail_risk, ruin)

        self.assertGreaterEqual(score.score, 70.0)
        self.assertIn(score.grade, ("A", "B"))
        self.assertEqual(score.status, "active")
        self.assertFalse(score.overoptimization_alert)
        self.assertGreater(score.profitability_score, 80.0)
        self.assertGreater(score.risk_score, 80.0)

    def test_strategy_score_flags_too_clean_small_sample(self) -> None:
        pnls = [100, 110, 120, 90, 95]
        performance = calculate_trade_performance_metrics(pnls)
        drawdown_path = calculate_drawdown_path_metrics([100_000, 100_100, 100_210, 100_330, 100_420, 100_515])
        tail_risk = calculate_tail_risk_metrics(pnls, confidence=0.95)
        ruin = calculate_analytical_risk_of_ruin(
            sample_size=performance.sample_size,
            win_rate_pct=performance.win_rate_pct,
            payoff_ratio=performance.payoff_ratio,
            risk_per_trade_pct=1.0,
            ruin_threshold_pct=10.0,
        )

        score = calculate_strategy_score_metrics(performance, drawdown_path, tail_risk, ruin)

        self.assertEqual(score.status, "testing")
        self.assertTrue(score.overoptimization_alert)
        self.assertIn("sobreoptimizacion", score.dashboard_text)

    def test_strategy_discipline_scores_real_execution_tags(self) -> None:
        discipline = calculate_strategy_discipline_metrics([
            {
                "compliance": "Cumplida",
                "mistake": "",
                "emotion": "Calma",
                "londonConfirmation": True,
                "validSetup": True,
            },
            {
                "compliance": "Parcial",
                "mistake": "Salida temprana",
                "emotion": "Duda",
                "validSetup": True,
                "beActivated": False,
            },
            {
                "compliance": "Rota",
                "mistake": "Impulso",
                "emotion": "Ansiedad",
                "validSetup": False,
            },
            {"profit": 120},
        ])

        self.assertEqual(discipline.sample_size, 4)
        self.assertEqual(discipline.tagged_sample_size, 3)
        self.assertEqual(discipline.coverage_pct, 75.0)
        self.assertLess(discipline.discipline_score or 100.0, 80.0)
        self.assertGreater(discipline.mistake_rate_pct, 0.0)
        self.assertGreater(discipline.emotional_risk_rate_pct or 0.0, 0.0)
        self.assertEqual(discipline.confidence_level, "low")

    def test_strategy_score_includes_real_discipline_when_available(self) -> None:
        pnls = [300, -100, 260, -90, 280, -80] * 6
        performance = calculate_trade_performance_metrics(pnls)
        drawdown_path = calculate_drawdown_path_metrics([100_000, 100_300, 100_200, 100_460, 100_370, 100_650, 100_570] * 6)
        tail_risk = calculate_tail_risk_metrics(pnls, confidence=0.95)
        ruin = calculate_analytical_risk_of_ruin(
            sample_size=performance.sample_size,
            win_rate_pct=performance.win_rate_pct,
            payoff_ratio=performance.payoff_ratio,
            risk_per_trade_pct=0.5,
            ruin_threshold_pct=10.0,
        )
        poor_discipline = calculate_strategy_discipline_metrics([
            {"compliance": "Rota", "mistake": "Impulso", "emotion": "Ansiedad"}
            for _index in range(30)
        ])

        score = calculate_strategy_score_metrics(performance, drawdown_path, tail_risk, ruin, poor_discipline)

        self.assertLess(score.discipline_score or 100.0, 55.0)
        self.assertEqual(score.discipline_coverage_pct, 100.0)
        self.assertEqual(score.discipline_sample_size, 30)
        self.assertEqual(score.discipline_confidence, "high")
        self.assertEqual(score.status, "paused")
        self.assertIn("Disciplina real", score.dashboard_text)

    def test_strategy_correlation_and_portfolio_heat_rank_co_loss_pairs(self) -> None:
        correlation = calculate_strategy_correlation_metrics({
            "London": [300, -120, 250, -90, 220],
            "NY": [180, -80, 140, -70, 160],
            "Asia": [-50, 60, -40, 45, -30],
        })

        self.assertEqual(correlation.strategy_count, 3)
        self.assertEqual(correlation.bucket_count, 5)
        self.assertEqual(correlation.pair_count, 3)
        top_pair = correlation.pairs[0]
        self.assertEqual({top_pair.strategy_a, top_pair.strategy_b}, {"London", "NY"})
        self.assertGreater(top_pair.correlation or 0.0, 0.9)
        self.assertEqual(top_pair.co_loss_periods, 2)

        heat = calculate_strategy_portfolio_heat_metrics(correlation)
        self.assertGreater(heat.portfolio_heat_score, 0.0)
        self.assertEqual(heat.highest_heat_pair, "London / NY")
        self.assertGreaterEqual(heat.high_heat_pair_count, 1)

    def test_strategy_allocation_uses_risk_quality_and_caps_testing(self) -> None:
        allocation = calculate_strategy_allocation_summary(
            [
                {
                    "strategy": "London",
                    "strategy_score": {
                        "score": 82,
                        "status": "active",
                        "risk_score": 90,
                        "stability_score": 84,
                        "sample_score": 88,
                    },
                },
                {
                    "strategy": "NY",
                    "strategy_score": {
                        "score": 62,
                        "status": "testing",
                        "risk_score": 72,
                        "stability_score": 70,
                        "sample_score": 22,
                    },
                },
                {
                    "strategy": "Asia",
                    "strategy_score": {
                        "score": 32,
                        "status": "discarded",
                        "risk_score": 40,
                        "stability_score": 45,
                        "sample_score": 50,
                    },
                },
            ],
            total_risk_budget_pct=2.0,
        )

        allocations = {item.strategy: item for item in allocation.allocations}
        self.assertGreater(allocations["London"].allocation_pct, allocations["NY"].allocation_pct)
        self.assertLessEqual(allocations["NY"].allocation_pct, 10.0)
        self.assertEqual(allocations["Asia"].allocation_pct, 0.0)
        self.assertIsNotNone(allocations["London"].risk_budget_pct)
        self.assertEqual(allocation.risk_budget_basis, "portfolio_heat_limit_pct")

    def test_trade_performance_metrics_cover_edge_and_outliers(self) -> None:
        metrics = calculate_trade_performance_metrics(
            [100, -50, 200, -100, 0, 50],
            [1, -0.5, 2, -1, 0, 0.5],
        )

        self.assertEqual(metrics.sample_size, 6)
        self.assertEqual(metrics.wins_count, 3)
        self.assertEqual(metrics.losses_count, 2)
        self.assertEqual(metrics.breakeven_count, 1)
        self.assertEqual(metrics.win_rate_pct, 50.0)
        self.assertAlmostEqual(metrics.loss_rate_pct, 33.3333, places=3)
        self.assertEqual(metrics.gross_profit, 350)
        self.assertEqual(metrics.gross_loss, 150)
        self.assertEqual(metrics.net_pnl, 200)
        self.assertAlmostEqual(metrics.profit_factor or 0.0, 2.3333, places=3)
        self.assertAlmostEqual(metrics.payoff_ratio or 0.0, 1.5556, places=3)
        self.assertEqual(metrics.best_trade, 200)
        self.assertEqual(metrics.worst_trade, -100)
        self.assertEqual(metrics.max_consecutive_wins, 1)
        self.assertEqual(metrics.max_consecutive_losses, 1)
        self.assertAlmostEqual(metrics.expectancy_r or 0.0, 0.3333, places=3)
        self.assertEqual(metrics.sample_quality.level, "insuficiente")
        self.assertEqual(metrics.outlier_dependency.top_1_pnl, 200)
        self.assertEqual(metrics.outlier_dependency.top_1_share_pct, 100.0)
        self.assertEqual(metrics.outlier_dependency.top_3_share_pct, 175.0)

    def test_trade_performance_marks_acceptable_sample(self) -> None:
        metrics = calculate_trade_performance_metrics([20, -10] * 15)

        self.assertEqual(metrics.sample_size, 30)
        self.assertEqual(metrics.sample_quality.level, "aceptable")
        self.assertEqual(metrics.max_consecutive_wins, 1)
        self.assertEqual(metrics.max_consecutive_losses, 1)

    def test_risk_adjusted_metrics_cover_per_trade_ratios(self) -> None:
        metrics = calculate_risk_adjusted_metrics(
            [1.0, -0.5, 0.75, -0.25],
            max_drawdown_pct=3.0,
        )

        self.assertEqual(metrics.sample_size, 4)
        self.assertEqual(metrics.return_basis, "per_trade_pct")
        self.assertAlmostEqual(metrics.mean_return_pct, 0.25, places=6)
        self.assertAlmostEqual(metrics.sharpe_ratio or 0.0, 0.3922, places=3)
        self.assertAlmostEqual(metrics.sortino_ratio or 0.0, 0.8944, places=3)
        self.assertAlmostEqual(metrics.gain_to_pain_ratio or 0.0, 2.3333, places=3)
        self.assertGreater(metrics.tail_ratio or 0.0, 2.0)
        self.assertIsNotNone(metrics.skewness)
        self.assertIsNotNone(metrics.kurtosis)
        self.assertIsNotNone(metrics.excess_kurtosis)

    def test_risk_adjusted_metrics_handles_empty_returns(self) -> None:
        metrics = calculate_risk_adjusted_metrics([], max_drawdown_pct=4.0)

        self.assertEqual(metrics.sample_size, 0)
        self.assertIsNone(metrics.sharpe_ratio)
        self.assertIsNone(metrics.sortino_ratio)
        self.assertEqual(metrics.max_drawdown_pct, 4.0)

    def test_sizing_survival_metrics_cover_kelly_budgets_and_ruin(self) -> None:
        metrics = calculate_sizing_survival_metrics(
            sample_size=42,
            win_rate_pct=50,
            payoff_ratio=2.0,
            equity=100_000,
            total_open_risk_pct=1.0,
            max_trade_risk_pct=0.75,
            max_trade_risk_policy_pct=0.5,
            daily_drawdown_pct=0.4,
            daily_dd_limit_pct=1.2,
            max_drawdown_pct=2.0,
            max_dd_limit_pct=8.0,
            open_heat_limit_pct=2.0,
            target_profit_remaining_pct=4.0,
        )

        self.assertEqual(metrics.sample_size, 42)
        self.assertEqual(metrics.kelly_fraction_pct, 25.0)
        self.assertEqual(metrics.half_kelly_pct, 12.5)
        self.assertEqual(metrics.quarter_kelly_pct, 6.25)
        self.assertEqual(metrics.recommended_fractional_kelly_pct, 1.0)
        self.assertEqual(metrics.kelly_state, "capped_aggressive")
        self.assertEqual(metrics.daily_risk_budget_remaining_pct, 0.8)
        self.assertEqual(metrics.daily_risk_budget_after_open_risk_pct, 0.0)
        self.assertEqual(metrics.weekly_risk_budget_remaining_pct, 6.0)
        self.assertEqual(metrics.weekly_risk_budget_after_open_risk_pct, 5.0)
        self.assertEqual(metrics.open_heat_amount, 1_000)
        self.assertEqual(metrics.open_heat_usage_ratio_pct, 50.0)
        self.assertEqual(metrics.max_trade_risk_usage_ratio_pct, 150.0)
        self.assertEqual(metrics.risk_to_target_ratio_pct, 25.0)
        self.assertAlmostEqual(metrics.risk_to_ruin_ratio_pct or 0.0, 16.6667, places=3)

    def test_sizing_survival_metrics_handles_missing_policy(self) -> None:
        metrics = calculate_sizing_survival_metrics(
            sample_size=0,
            win_rate_pct=0,
            payoff_ratio=None,
            equity=50_000,
            total_open_risk_pct=0.5,
        )

        self.assertIsNone(metrics.kelly_fraction_pct)
        self.assertEqual(metrics.kelly_state, "unavailable")
        self.assertIsNone(metrics.daily_risk_budget_remaining_pct)
        self.assertEqual(metrics.open_heat_amount, 250)
        self.assertEqual(metrics.risk_to_target_basis, "not_configured")
        self.assertEqual(metrics.risk_to_ruin_basis, "not_configured")

    def test_prop_firm_intelligence_calculates_buffers_and_allowed_risk(self) -> None:
        metrics = calculate_prop_firm_intelligence_metrics(
            equity=100_000,
            daily_drawdown_pct=0.4,
            max_drawdown_pct=2.0,
            total_open_risk_pct=0.5,
            daily_dd_limit_pct=1.2,
            max_dd_limit_pct=8.0,
            profit_target_pct=8.0,
            profit_target_remaining_pct=3.0,
            daily_pnls=[400, -100, 250, 150],
            returns_pct=[0.4, -0.1, 0.25, 0.15],
            consistency_max_day_share_pct=45.0,
            minimum_trading_days=5,
            payout_ledger_entries=[
                {"type": "fee", "amount": 99},
                {"type": "refund", "amount": 99},
                {"type": "payout", "amount": 1_200},
                {"type": "gain", "amount": 1_500},
            ],
            pass_probability_simulations=100,
            pass_probability_horizon_trades=20,
        )

        self.assertEqual(metrics.daily_dd_buffer_pct, 0.8)
        self.assertEqual(metrics.daily_dd_buffer_amount, 800)
        self.assertEqual(metrics.max_dd_buffer_pct, 6.0)
        self.assertEqual(metrics.profit_target_progress_pct, 62.5)
        self.assertEqual(metrics.consistency_rule_limit_pct, 45.0)
        self.assertFalse(metrics.consistency_rule_pass)
        self.assertEqual(metrics.active_trading_days_count, 4)
        self.assertEqual(metrics.minimum_days_remaining, 1)
        self.assertFalse(metrics.minimum_days_pass)
        self.assertEqual(metrics.risk_allowed_before_open_risk_pct, 0.8)
        self.assertEqual(metrics.risk_allowed_after_open_risk_pct, 0.3)
        self.assertEqual(metrics.risk_allowed_after_open_risk_amount, 300)
        self.assertIsNotNone(metrics.pass_probability.pass_probability_pct)
        self.assertEqual(metrics.payout_ledger.withdrawals_amount, 1_200)
        self.assertEqual(metrics.payout_ledger.net_cashflow_amount, 1_200)
        self.assertTrue(metrics.breach_alert)
        self.assertEqual(metrics.alert_level, "breach_or_block")

    def test_prop_firm_intelligence_alerts_when_open_risk_exceeds_buffer(self) -> None:
        metrics = calculate_prop_firm_intelligence_metrics(
            equity=50_000,
            daily_drawdown_pct=0.9,
            max_drawdown_pct=4.0,
            total_open_risk_pct=0.5,
            daily_dd_limit_pct=1.0,
            max_dd_limit_pct=10.0,
        )

        self.assertEqual(metrics.daily_dd_buffer_pct, 0.1)
        self.assertEqual(metrics.risk_allowed_after_open_risk_pct, 0.0)
        self.assertTrue(metrics.breach_alert)
        self.assertEqual(metrics.alert_level, "breach_or_block")

    def test_prop_firm_pass_probability_is_deterministic(self) -> None:
        first = calculate_prop_firm_pass_probability_metrics(
            [0.6, -0.2, 0.4, -0.1],
            target_remaining_pct=2.0,
            max_dd_buffer_pct=4.0,
            simulations=200,
            horizon_trades=20,
            seed=12,
        )
        second = calculate_prop_firm_pass_probability_metrics(
            [0.6, -0.2, 0.4, -0.1],
            target_remaining_pct=2.0,
            max_dd_buffer_pct=4.0,
            simulations=200,
            horizon_trades=20,
            seed=12,
        )

        self.assertEqual(first, second)
        self.assertEqual(first.basis, "bootstrap_trade_returns_pct")
        self.assertGreaterEqual(first.pass_probability_pct or 0.0, 0.0)
        self.assertLessEqual(first.pass_probability_pct or 100.0, 100.0)

    def test_prop_firm_payout_ledger_summarizes_cashflow(self) -> None:
        ledger = calculate_prop_firm_payout_ledger_metrics([
            {"type": "gain", "amount": 2_000},
            {"type": "payout", "amount": 1_600},
            {"type": "challenge_fee", "amount": 120},
            {"type": "refund", "amount": 120},
            {"type": "adjustment", "amount": -20},
        ])

        self.assertEqual(ledger.entry_count, 5)
        self.assertEqual(ledger.gross_gains_amount, 2_000)
        self.assertEqual(ledger.withdrawals_amount, 1_600)
        self.assertEqual(ledger.fees_amount, 120)
        self.assertEqual(ledger.refunds_amount, 120)
        self.assertEqual(ledger.adjustments_amount, -20)
        self.assertEqual(ledger.net_cashflow_amount, 1_580)

    def test_risk_metrics_snapshot_exposes_professional_metrics(self) -> None:
        snapshot = build_risk_metrics(
            account={
                "balance": 100_000,
                "equity": 100_750,
                "timestamp": "2026-05-02T10:00:00+00:00",
            },
            positions=[
                {"position_id": "1", "symbol": "EURUSD", "risk_pct": 0.42, "risk_amount": 420},
            ],
            trades=[
                {"time": "2026-05-01T08:00:00+00:00", "profit": 800, "commission": -5, "swap": 0},
                {"time": "2026-05-01T09:00:00+00:00", "profit": -450, "commission": -5, "swap": 0},
                {"time": "2026-05-01T10:00:00+00:00", "profit": 600, "commission": -5, "swap": 0},
                {"time": "2026-05-01T11:00:00+00:00", "profit": -200, "commission": -5, "swap": 0},
            ],
            policy_snapshot={
                "risk_per_trade_pct": 0.5,
                "daily_dd_limit_pct": 1.2,
                "max_dd_limit_pct": 8.0,
                "portfolio_heat_limit_pct": 2.0,
                "profit_target_pct": 8.0,
                "profit_target_remaining_pct": 4.0,
                "consistency_max_day_share_pct": 60.0,
                "minimum_trading_days": 3,
                "payout_ledger": [
                    {"type": "fee", "amount": 99},
                    {"type": "refund", "amount": 99},
                    {"type": "payout", "amount": 500},
                ],
                "pass_probability_simulations": 100,
                "pass_probability_horizon_trades": 12,
            },
        )

        professional = snapshot["professional_metrics"]
        self.assertEqual(professional["inputs"]["closed_trades_count"], 4)
        self.assertEqual(professional["inputs"]["r_multiples_count"], 0)
        self.assertEqual(professional["inputs"]["win_rate_pct"], 50.0)
        self.assertGreater(professional["inputs"]["payoff_ratio"], 1.0)
        self.assertEqual(professional["inputs"]["risk_per_trade_pct"], 0.5)
        self.assertEqual(professional["inputs"]["risk_per_trade_basis"], "policy_max_risk_per_trade_pct")
        self.assertEqual(professional["inputs"]["capital_amount"], 100_750)
        self.assertEqual(professional["inputs"]["ruin_limit_pct"], 8.0)
        self.assertIn("performance", professional)
        self.assertEqual(professional["performance"]["wins_count"], 2)
        self.assertEqual(professional["performance"]["losses_count"], 2)
        self.assertGreater(professional["performance"]["profit_factor"], 1.0)
        self.assertEqual(professional["performance"]["sample_quality"]["level"], "insuficiente")
        self.assertIn("top_1_share_pct", professional["performance"]["outlier_dependency"])
        self.assertIn("risk_adjusted", professional)
        self.assertEqual(professional["risk_adjusted"]["return_basis"], "per_trade_pct")
        self.assertGreater(professional["risk_adjusted"]["sample_size"], 0)
        self.assertIn("gain_to_pain_ratio", professional["risk_adjusted"])
        self.assertIn("sizing", professional)
        self.assertEqual(professional["sizing"]["open_heat_pct"], 0.42)
        self.assertEqual(professional["sizing"]["max_trade_risk_policy_pct"], 0.5)
        self.assertGreater(professional["sizing"]["weekly_risk_budget_remaining_pct"], 0)
        self.assertEqual(professional["sizing"]["risk_to_target_basis"], "profit_target_remaining_pct")
        self.assertIn("prop_firm", professional)
        self.assertEqual(professional["prop_firm"]["daily_dd_limit_pct"], 1.2)
        self.assertEqual(professional["prop_firm"]["open_risk_pct"], 0.42)
        self.assertGreater(professional["prop_firm"]["risk_allowed_after_open_risk_pct"], 0.0)
        self.assertEqual(professional["prop_firm"]["profit_target_progress_pct"], 50.0)
        self.assertEqual(professional["prop_firm"]["minimum_days_remaining"], 2)
        self.assertFalse(professional["prop_firm"]["minimum_days_pass"])
        self.assertEqual(professional["prop_firm"]["payout_ledger"]["net_cashflow_amount"], 500)
        self.assertEqual(professional["prop_firm"]["pass_probability"]["simulations"], 100)
        self.assertIn("var_95", professional["tail_risk"])
        self.assertIn("var_99", professional["tail_risk"])
        self.assertIn("parametric_var_95", professional["tail_risk"])
        self.assertIn("monte_carlo_var_95", professional["tail_risk"])
        self.assertIn("risk_of_ruin", professional)
        self.assertEqual(professional["risk_of_ruin"]["risk_per_trade_pct"], 0.5)
        self.assertEqual(professional["risk_of_ruin"]["ruin_threshold_pct"], 8.0)
        self.assertEqual(professional["risk_of_ruin"]["risk_per_trade_basis"], "policy_max_risk_per_trade_pct")
        self.assertIn("monte_carlo", professional)
        self.assertIn("drawdown_path", professional)
        self.assertEqual(professional["tail_risk"]["var_95"]["sample_size"], 4)
        self.assertIn("strategy_breakdown", professional)
        self.assertEqual(professional["strategy_breakdown"]["group_count"], 1)
        self.assertTrue(any("Muestra menor a 30 trades" in warning for warning in snapshot["metadata"]["warnings"]))

    def test_risk_metrics_exposes_tail_risk_by_horizon(self) -> None:
        snapshot = build_risk_metrics(
            account={
                "balance": 100_000,
                "equity": 99_650,
                "timestamp": "2026-01-10T10:00:00+00:00",
            },
            positions=[],
            trades=[
                {"time": "2026-01-01T08:00:00+00:00", "profit": 100},
                {"time": "2026-01-01T09:00:00+00:00", "profit": -50},
                {"time": "2026-01-02T10:00:00+00:00", "profit": -300},
                {"time": "2026-01-08T08:00:00+00:00", "profit": -200},
                {"time": "2026-01-09T08:00:00+00:00", "profit": 50},
            ],
            policy_snapshot={
                "risk_per_trade_pct": 1.0,
                "max_dd_limit_pct": 10.0,
            },
            trading_timezone="UTC",
        )

        horizons = snapshot["professional_metrics"]["tail_risk"]["horizons"]
        self.assertEqual(horizons["one_trade"]["sample_size"], 5)
        self.assertEqual(horizons["one_day"]["sample_size"], 4)
        self.assertEqual(horizons["one_week"]["sample_size"], 2)
        self.assertEqual(horizons["one_day"]["sample_basis"], "daily_realized_pnl")
        self.assertEqual(horizons["one_week"]["sample_basis"], "weekly_realized_pnl")
        self.assertGreater(horizons["one_day"]["var_95"]["var_amount"], 0)
        self.assertGreater(horizons["one_week"]["var_95"]["var_amount"], 0)
        self.assertEqual(snapshot["professional_metrics"]["inputs"]["tail_risk_daily_samples"], 4)
        self.assertEqual(snapshot["professional_metrics"]["inputs"]["tail_risk_weekly_samples"], 2)

    def test_risk_metrics_exposes_strategy_breakdown_with_var_and_ruin(self) -> None:
        snapshot = build_risk_metrics(
            account={
                "balance": 100_000,
                "equity": 100_200,
                "timestamp": "2026-01-10T10:00:00+00:00",
            },
            positions=[],
            trades=[
                {"time": "2026-01-01T08:00:00+00:00", "profit": 300, "setup": "London", "compliance": "Cumplida", "emotion": "Calma"},
                {"time": "2026-01-02T08:00:00+00:00", "profit": -100, "setup": "London", "compliance": "Parcial", "mistake": "Salida temprana", "emotion": "Duda"},
                {"time": "2026-01-03T08:00:00+00:00", "profit": 200, "setup": "London", "compliance": "Cumplida", "emotion": "Confianza"},
                {"time": "2026-01-04T08:00:00+00:00", "profit": -250, "setup": "NY", "compliance": "Rota", "mistake": "Impulso", "emotion": "Ansiedad"},
                {"time": "2026-01-05T08:00:00+00:00", "profit": 50, "setup": "NY", "compliance": "Parcial", "emotion": "Neutral"},
            ],
            policy_snapshot={
                "risk_per_trade_pct": 0.5,
                "max_dd_limit_pct": 10.0,
            },
        )

        breakdown = snapshot["professional_metrics"]["strategy_breakdown"]
        self.assertEqual(breakdown["group_count"], 2)
        self.assertIn("correlation", breakdown)
        self.assertIn("portfolio_heat", breakdown)
        self.assertIn("risk_allocation", breakdown)
        self.assertEqual(breakdown["daily_bucket_count"], 5)
        self.assertEqual(breakdown["correlation"]["pair_count"], 1)
        self.assertGreaterEqual(breakdown["portfolio_heat"]["portfolio_heat_score"], 0.0)
        self.assertGreaterEqual(breakdown["risk_allocation"]["allocated_count"], 0)
        strategies = {row["strategy"]: row for row in breakdown["groups"]}
        self.assertIn("London", strategies)
        self.assertIn("NY", strategies)
        self.assertEqual(strategies["London"]["sample_size"], 3)
        self.assertIn("strategy_score", strategies["London"])
        self.assertIn("strategy_discipline", strategies["London"])
        self.assertIn("drawdown_path", strategies["London"])
        self.assertEqual(strategies["London"]["strategy_score"]["status"], "testing")
        self.assertGreater(strategies["London"]["strategy_discipline"]["discipline_score"], 70.0)
        self.assertEqual(strategies["London"]["strategy_score"]["discipline_sample_size"], 3)
        self.assertGreaterEqual(strategies["London"]["strategy_score"]["score"], 0.0)
        self.assertIn("var_95", strategies["London"]["tail_risk"])
        self.assertIn("risk_of_ruin", strategies["London"])
        self.assertEqual(strategies["London"]["risk_of_ruin"]["ruin_threshold_pct"], 10.0)
        self.assertEqual(snapshot["professional_metrics"]["inputs"]["strategy_group_count"], 2)

    def test_portfolio_risk_aggregates_account_var_conservatively(self) -> None:
        first = build_risk_metrics(
            account={"balance": 100_000, "equity": 99_500, "timestamp": "2026-01-10T10:00:00+00:00"},
            positions=[{"symbol": "EURUSD", "risk_pct": 0.5, "risk_amount": 500}],
            trades=[
                {"time": "2026-01-01T08:00:00+00:00", "profit": 500},
                {"time": "2026-01-02T08:00:00+00:00", "profit": -350},
                {"time": "2026-01-03T08:00:00+00:00", "profit": 250},
                {"time": "2026-01-04T08:00:00+00:00", "profit": -600},
            ],
            policy_snapshot={"risk_per_trade_pct": 0.5, "max_dd_limit_pct": 8.0},
        )
        second = build_risk_metrics(
            account={"balance": 50_000, "equity": 49_800, "timestamp": "2026-01-10T10:00:00+00:00"},
            positions=[{"symbol": "GBPUSD", "risk_pct": 0.7, "risk_amount": 350}],
            trades=[
                {"time": "2026-01-01T08:00:00+00:00", "profit": 180},
                {"time": "2026-01-02T08:00:00+00:00", "profit": -220},
                {"time": "2026-01-03T08:00:00+00:00", "profit": 140},
                {"time": "2026-01-04T08:00:00+00:00", "profit": -420},
            ],
            policy_snapshot={"risk_per_trade_pct": 0.7, "max_dd_limit_pct": 10.0},
        )

        portfolio = aggregate_portfolio_risk([
            {"dashboard_payload": {"equity": 99_500, "riskSnapshot": first}},
            {"dashboard_payload": {"equity": 49_800, "riskSnapshot": second}},
        ])

        self.assertEqual(portfolio["accounts_count"], 2)
        self.assertEqual(portfolio["accounts_with_var_count"], 2)
        self.assertEqual(portfolio["closed_trades_count"], 8)
        self.assertEqual(portfolio["method"], "conservative_sum_of_account_var")
        self.assertGreater(portfolio["combined_open_risk_pct"], 0)
        self.assertGreater(portfolio["var_95_amount"], 0)
        self.assertGreaterEqual(portfolio["cvar_95_amount"], portfolio["var_95_amount"])
        self.assertGreater(portfolio["var_95_equity_pct"], 0)
        self.assertIn("No aplica matriz de correlacion", " ".join(portfolio["assumptions"]))


if __name__ == "__main__":
    unittest.main()
