import json
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CalculatorFxPipTests(unittest.TestCase):
    def run_node(self, script):
        source_loader = """
            import fs from "node:fs";

            let source = fs.readFileSync("./js/modules/calculator.js", "utf8");
            source = source
              .replace(/^import .*$/gm, "")
              .replace(/export function /g, "function ")
              .replace(/export const __calculatorTestHooks/g, "const __calculatorTestHooks");
            eval(`${source}\\nglobalThis.__calculatorHooks = __calculatorTestHooks;`);
            const hooks = globalThis.__calculatorHooks;
        """
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", textwrap.dedent(source_loader + script)],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        return json.loads(proc.stdout)

    def test_forex_live_specs_use_pips_not_points(self):
        result = self.run_node(
            """
            const eurusd = hooks.normalizeLiveSymbolSpec({
              symbol: "EURUSD.a",
              digits: 5,
              point: 0.00001,
              pointSize: 0.00001,
              tickSize: 0.00001,
              tickValue: 1,
              contractSize: 100000,
              volumeStep: 0.01
            });
            const audusd = hooks.normalizeLiveSymbolSpec({
              symbol: "AUDUSDm",
              digits: 5,
              point: 0.00001,
              pointSize: 0.00001,
              tickSize: 0.00001,
              tickValue: 1,
              contractSize: 100000,
              volumeStep: 0.01
            });
            const eurRisk = hooks.resolveRiskPerLot(10, eurusd, { pointValue: 1 }).riskPerLot;
            const audRisk = hooks.resolveRiskPerLot(10, audusd, { pointValue: 1 }).riskPerLot;
            const audLots = (105575 * 0.005) / audRisk;

            console.log(JSON.stringify({
              eurRisk,
              eurLots: 1000 / eurRisk,
              audRisk,
              audLots,
              audWarning: audusd.unitNormalizationWarning,
              audLabel: hooks.slDistanceLabelForSpec(audusd)
            }));
            """
        )

        self.assertAlmostEqual(result["eurRisk"], 100, places=6)
        self.assertAlmostEqual(result["eurLots"], 10, places=6)
        self.assertAlmostEqual(result["audRisk"], 100, places=6)
        self.assertAlmostEqual(result["audLots"], 5.27875, places=5)
        self.assertIn("puntos en lugar de pips", result["audWarning"])
        self.assertEqual(result["audLabel"], "Distancia SL (pips)")

    def test_jpy_forex_uses_jpy_pip_size(self):
        result = self.run_node(
            """
            const usdjpy = hooks.normalizeLiveSymbolSpec({
              symbol: "USDJPY.pro",
              digits: 3,
              point: 0.001,
              pointSize: 0.001,
              tickSize: 0.001,
              tickValue: 0.91,
              contractSize: 100000,
              volumeStep: 0.01
            });
            const risk = hooks.resolveRiskPerLot(10, usdjpy, { pointValue: 1 }).riskPerLot;
            console.log(JSON.stringify({
              pipSize: hooks.getForexPipSize("USDJPY.pro"),
              risk,
              label: hooks.slDistanceLabelForSpec(usdjpy)
            }));
            """
        )

        self.assertEqual(result["pipSize"], 0.01)
        self.assertAlmostEqual(result["risk"], 91, places=6)
        self.assertEqual(result["label"], "Distancia SL (pips)")

    def test_metals_keep_point_based_distance(self):
        result = self.run_node(
            """
            const xauusd = hooks.normalizeLiveSymbolSpec({
              symbol: "XAUUSD",
              digits: 2,
              point: 0.01,
              pointSize: 0.01,
              tickSize: 0.01,
              tickValue: 1,
              contractSize: 100,
              volumeStep: 0.01
            });
            const risk = hooks.resolveRiskPerLot(10, xauusd, { pointValue: 1 }).riskPerLot;
            console.log(JSON.stringify({
              risk,
              unitLabel: xauusd.unitLabel,
              warning: xauusd.unitNormalizationWarning,
              label: hooks.slDistanceLabelForSpec(xauusd)
            }));
            """
        )

        self.assertAlmostEqual(result["risk"], 10, places=6)
        self.assertEqual(result["unitLabel"], "puntos")
        self.assertEqual(result["warning"], "")
        self.assertEqual(result["label"], "Distancia SL (puntos)")


if __name__ == "__main__":
    unittest.main()
