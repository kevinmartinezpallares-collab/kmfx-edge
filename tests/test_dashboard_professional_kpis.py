from __future__ import annotations

import json
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class DashboardProfessionalKpiTests(unittest.TestCase):
    def run_node(self, script: str) -> dict:
        result = subprocess.run(
            ["node", "--input-type=module", "-e", textwrap.dedent(script)],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
        return json.loads(result.stdout)

    def test_professional_kpi_contract_maps_dashboard_and_risk_inputs(self) -> None:
        payload = self.run_node(
            """
            import { selectDashboardProfessionalKpis } from "./js/modules/dashboard-professional-kpis.js";

            const model = {
              account: { equity: 100000, balance: 100000 },
              cumulative: { totalPct: 3.4 },
              totals: {
                pnl: 3400,
                drawdown: { maxPct: 4.2 },
                ratios: { sortino: 1.2 },
              },
              dayStats: [
                { key: "2026-01-01", pnl: 120 },
                { key: "2026-01-02", pnl: -60 },
                { key: "2026-01-03", pnl: 240 },
                { key: "2026-01-04", pnl: 180 },
                { key: "2026-01-05", pnl: -100 },
                { key: "2026-01-06", pnl: 220 },
                { key: "2026-01-07", pnl: 300 },
              ],
              dailyReturns: [
                { returnPct: 0.12 },
                { returnPct: -0.06 },
                { returnPct: 0.24 },
                { returnPct: 0.18 },
                { returnPct: -0.10 },
                { returnPct: 0.22 },
                { returnPct: 0.30 },
              ],
              drawdownCurve: [
                { label: "01/01", value: 0 },
                { label: "02/01", value: 1.2 },
                { label: "03/01", value: 4.2 },
              ],
              positions: [
                { side: "BUY", risk_pct: 0.4 },
                { side: "SELL", risk_pct: 0.2 },
              ],
              trades: new Array(45).fill(null).map((_, index) => ({ id: index })),
            };

            const riskSnapshot = {
              summary: {
                total_open_risk_pct: 0.6,
                portfolio_heat_limit_pct: 3,
              },
              professional_metrics: {
                inputs: {
                  equity: 100000,
                  closed_trades_count: 45,
                },
                tail_risk: {
                  var_95: { var_amount: 950, cvar_amount: 1300, sample_size: 45, sample_quality_level: "aceptable", sample_quality_label: "Muestra aceptable" },
                  var_99: { var_amount: 1800, cvar_amount: 2200, sample_size: 45, sample_quality_level: "aceptable", sample_quality_label: "Muestra aceptable" },
                },
                risk_adjusted: {
                  sortino_ratio: 1.75,
                  sample_size: 45,
                },
                d_score: 72,
              },
            };

            const contract = selectDashboardProfessionalKpis({ model, account: {}, riskSnapshot });
            console.log(JSON.stringify(contract));
            """
        )

        self.assertEqual(payload["version"], "dashboard_professional_kpis_v1")
        self.assertEqual(
            payload["order"],
            ["net_return", "max_drawdown", "var_95", "var_99", "exposure", "vol_ann", "sortino", "dscore"],
        )
        kpis = {item["id"]: item for item in payload["kpis"]}

        self.assertEqual(kpis["net_return"]["value"], 3.4)
        self.assertEqual(kpis["net_return"]["delta"]["direction"], "up")
        self.assertEqual(kpis["net_return"]["microVisual"]["type"], "sparkline")
        self.assertEqual(len(kpis["net_return"]["microVisual"]["series"]), 7)
        for kpi in kpis.values():
            self.assertIn("explain", kpi)
            self.assertTrue(kpi["explain"]["summary"])
            self.assertTrue(kpi["explain"]["formula"])
            self.assertTrue(kpi["explain"]["source"])
            self.assertTrue(kpi["explain"]["confidence"])

        self.assertEqual(kpis["max_drawdown"]["value"], 4.2)
        self.assertEqual(kpis["max_drawdown"]["status"], "warn")
        self.assertEqual(kpis["max_drawdown"]["microVisual"]["highlight"]["value"], 4.2)

        self.assertEqual(kpis["var_95"]["value"], 950)
        self.assertEqual(kpis["var_95"]["status"], "good")
        self.assertEqual(kpis["var_95"]["microVisual"]["type"], "gauge")
        self.assertEqual(kpis["var_95"]["meta"]["cvarAmount"], 1300)
        self.assertEqual(kpis["var_95"]["meta"]["sampleQualityLabel"], "Muestra aceptable")
        self.assertIn("Percentil 95", kpis["var_95"]["explain"]["formula"])
        self.assertIn("Muestra aceptable", kpis["var_95"]["explain"]["confidence"])
        self.assertIn("Fórmula:", kpis["var_95"]["tooltip"])

        self.assertEqual(kpis["var_99"]["value"], 1800)
        self.assertEqual(kpis["var_99"]["status"], "warn")
        self.assertEqual(kpis["exposure"]["microVisual"]["type"], "stacked_bar")
        self.assertEqual(kpis["exposure"]["meta"]["grossPct"], 0.6)
        self.assertEqual(kpis["exposure"]["meta"]["netPct"], 0.2)

        self.assertGreater(kpis["vol_ann"]["value"], 0)
        self.assertEqual(kpis["sortino"]["value"], 1.75)
        self.assertEqual(kpis["sortino"]["status"], "good")
        self.assertEqual(kpis["dscore"]["value"], 72)
        self.assertEqual(kpis["dscore"]["status"], "good")

    def test_professional_kpi_contract_keeps_missing_metrics_explicit(self) -> None:
        payload = self.run_node(
            """
            import { selectDashboardProfessionalKpis } from "./js/modules/dashboard-professional-kpis.js";

            const contract = selectDashboardProfessionalKpis({
              model: {
                account: { balance: 50000, equity: 50000 },
                dayStats: [],
                dailyReturns: [],
                drawdownCurve: [],
                totals: { pnl: 0, drawdown: { maxPct: 0 }, ratios: {} },
                trades: [],
              },
              account: {},
              riskSnapshot: {},
            });

            console.log(JSON.stringify(contract));
            """
        )

        kpis = {item["id"]: item for item in payload["kpis"]}
        self.assertEqual(kpis["var_95"]["display"], "-")
        self.assertEqual(kpis["var_95"]["status"], "insufficient")
        self.assertEqual(kpis["vol_ann"]["display"], "-")
        self.assertEqual(kpis["vol_ann"]["emptyReason"], "histórico insuficiente")
        self.assertEqual(kpis["dscore"]["source"], "missing_quality_score")
        self.assertEqual(kpis["dscore"]["emptyReason"], "score pendiente")
        self.assertIn("formula", {key.lower() for key in kpis["dscore"]["explain"].keys()})
        self.assertFalse(payload["generatedFrom"]["hasRiskSnapshot"])

    def test_var_kpi_uses_backend_sample_quality_label(self) -> None:
        payload = self.run_node(
            """
            import { selectDashboardProfessionalKpis } from "./js/modules/dashboard-professional-kpis.js";

            const contract = selectDashboardProfessionalKpis({
              model: {
                account: { balance: 100000, equity: 100000 },
                trades: new Array(4).fill(null).map((_, index) => ({ id: index })),
              },
              account: {},
              riskSnapshot: {
                professional_metrics: {
                  inputs: { equity: 100000, closed_trades_count: 4 },
                  tail_risk: {
                    var_95: {
                      var_amount: 750,
                      cvar_amount: 900,
                      sample_size: 4,
                      sample_quality_level: "insuficiente",
                      sample_quality_label: "Muestra insuficiente",
                    },
                  },
                },
              },
            });

            console.log(JSON.stringify(contract));
            """
        )

        kpis = {item["id"]: item for item in payload["kpis"]}
        self.assertEqual(kpis["var_95"]["status"], "insufficient")
        self.assertEqual(kpis["var_95"]["statusLabel"], "Muestra insuficiente")
        self.assertEqual(kpis["var_95"]["meta"]["sampleQualityLevel"], "insuficiente")
        self.assertEqual(kpis["var_95"]["meta"]["sampleQualityLabel"], "Muestra insuficiente")


if __name__ == "__main__":
    unittest.main()
