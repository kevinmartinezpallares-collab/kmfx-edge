from __future__ import annotations

import json
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class RiskContractFrontendTests(unittest.TestCase):
    def run_node_contract(self) -> dict:
        script = r"""
          import { renderRisk } from "./js/modules/risk.js";
          import { normalizeRiskSnapshot } from "./js/modules/risk-live-snapshot.js";

          const storage = new Map();
          globalThis.window = {
            innerWidth: 1440,
            localStorage: {
              getItem: (key) => storage.get(key) ?? null,
              setItem: (key, value) => storage.set(key, String(value)),
              removeItem: (key) => storage.delete(key),
            },
            addEventListener() {},
            removeEventListener() {},
            requestAnimationFrame: (callback) => callback(),
            matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
          };
          globalThis.localStorage = window.localStorage;
          globalThis.requestAnimationFrame = (callback) => callback();
          globalThis.document = {
            documentElement: { dataset: { theme: "dark" }, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
            body: { dataset: { theme: "dark" }, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
            createElement() {
              return {
                dataset: {},
                style: {},
                classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
                addEventListener() {},
                removeEventListener() {},
                querySelector() { return null; },
                querySelectorAll() { return []; },
              };
            },
            addEventListener() {},
            removeEventListener() {},
            querySelector() { return null; },
            querySelectorAll() { return []; },
          };

          class SmokeRoot {
            constructor() {
              this.dataset = {};
              this.style = {};
              this.innerHTML = "";
              this.isConnected = true;
              this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
            }
            querySelector() { return null; }
            querySelectorAll() { return []; }
            addEventListener() {}
            removeEventListener() {}
          }

          const flatRiskSnapshot = {
            risk_status: "active_monitoring",
            trigger: "Presión <script>alert(1)</script>",
            blocking_rule: "Clúster o riesgo total elevado",
            action_required: "Recortar exposición",
            remaining_daily_margin_pct: 0.85,
            remaining_total_margin_pct: 4.25,
            daily_drawdown_pct: 0.35,
            max_drawdown_pct: 1.75,
            total_open_risk_pct: 1.1,
            effective_correlated_risk: 1.42,
            mt5_limit_states: {
              risk_per_trade: "activo_mt5",
              daily_dd_limit: "pendiente",
              max_dd_limit: "desactivado",
            },
            active_rules: [{
              title: "Regla <script>alert(1)</script>",
              condition: "Riesgo > 1.25%",
              state: "En vigilancia",
              impact: "No ampliar <b>riesgo</b>",
              tone: "warn",
              is_dominant: true,
            }],
            policy_snapshot: {
              risk_per_trade_pct: 0.5,
              daily_dd_limit_pct: 1.2,
              max_dd_limit_pct: 6,
              max_total_open_risk_pct: 2.5,
              allowed_sessions: ["London", "New York"],
              allowed_symbols: ["EURUSD", "GBPUSD"],
              max_volume: 1.5,
              auto_block_enabled: true,
              current_level: "BASE",
              recommended_level: "PROTECT",
            },
            ladder_snapshot: {
              current_level: "BASE",
              recommended_level: "PROTECT",
              levels: [
                { level: "PROTECT", risk_pct: 0.25, entry_condition: "Protección", rise_condition: "BASE", fall_condition: "Sin inferior", trades_to_100k: 400 },
                { level: "BASE", risk_pct: 0.5, is_current: true, entry_condition: "Base", rise_condition: "+1", fall_condition: "PROTECT", trades_to_100k: 200 },
              ],
            },
            exposure_snapshot: {
              open_positions: 2,
              total_open_risk_pct: 1.1,
              correlated_risk_pct: 1.42,
              pressure_label: "active_monitoring",
              pressure_tone: "warn",
            },
          };

          const normalized = normalizeRiskSnapshot(flatRiskSnapshot);
          const root = new SmokeRoot();
          renderRisk(root, {
            accounts: {
              live: {
                id: "live",
                login: "5061",
                broker: "Contract Broker",
                sourceType: "mt5",
                dashboardPayload: {
                  riskSnapshot: flatRiskSnapshot,
                  timestamp: new Date().toISOString(),
                },
                connection: {
                  connected: true,
                  lastSync: new Date().toISOString(),
                },
              },
            },
            activeLiveAccountId: "live",
            activeAccountId: "live",
            currentAccount: "live",
            mode: "live",
            auth: {
              status: "authenticated",
              user: { id: "user-live-contract", email: "contract@kmfxedge.test", role: "user", is_admin: false },
            },
            billing: {
              loading: false,
              billing: { plan: "pro", effectivePlan: "pro", status: "active", access: "active" },
              entitlements: { riskPolicyEditor: true, localAutoBlock: true },
              limits: {},
            },
            ui: { activePage: "risk" },
            workspace: {},
          });
          const html = String(root.innerHTML || "");
          console.log(JSON.stringify({
            normalizedCorrelatedRisk: normalized.effectiveCorrelatedRisk,
            normalizedLadderCount: normalized.ladderSnapshot.levels.length,
            hasCorrelatedRisk: html.includes("1.42%"),
            hasLadder: html.includes("PROTECT") && html.includes("BASE"),
            hasMt5Received: html.includes("MT5 recibido"),
            hasMt5Pending: html.includes("MT5 pendiente"),
            hasManualState: html.includes("Estado manual"),
            hasPolicyControls: [
              "Riesgo por trade",
              "Límite daily DD",
              "Límite max DD",
              "Control de volumen",
              "Horarios permitidos",
              "Símbolos permitidos",
              "Bloqueo automático",
            ].every((needle) => html.includes(needle)),
            escapedRule: html.includes("Regla &lt;script&gt;alert(1)&lt;/script&gt;") && !html.includes("<script>alert(1)</script>"),
          }));
        """
        proc = subprocess.run(
            [
                "node",
                "--experimental-loader",
                "./tests/node-esm-loader.mjs",
                "--input-type=module",
                "-e",
                textwrap.dedent(script),
            ],
            cwd=ROOT,
            text=True,
            capture_output=True,
        )
        if proc.returncode != 0:
            self.fail(f"node risk contract failed\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}")
        return json.loads(proc.stdout.splitlines()[-1])

    def test_flat_orchestrator_snapshot_renders_risk_contract(self) -> None:
        result = self.run_node_contract()
        self.assertEqual(result["normalizedCorrelatedRisk"], 1.42)
        self.assertEqual(result["normalizedLadderCount"], 2)
        self.assertTrue(result["hasCorrelatedRisk"])
        self.assertTrue(result["hasLadder"])
        self.assertTrue(result["hasMt5Received"])
        self.assertTrue(result["hasMt5Pending"])
        self.assertTrue(result["hasManualState"])
        self.assertTrue(result["hasPolicyControls"])
        self.assertTrue(result["escapedRule"])


if __name__ == "__main__":
    unittest.main()
