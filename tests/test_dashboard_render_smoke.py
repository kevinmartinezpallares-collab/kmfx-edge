from __future__ import annotations

import json
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class DashboardRenderSmokeTests(unittest.TestCase):
    def run_node_smoke(self) -> list[dict]:
        script = r"""
          import fs from "node:fs";
          import { adaptMt5Account } from "./js/data/adapters/mt5-account-adapter.js";
          import { renderDashboard } from "./js/modules/dashboard.js";
          import { renderConnections } from "./js/modules/connections.js";
          import { renderTrades } from "./js/modules/trades.js";
          import { renderCalendar } from "./js/modules/calendar.js";
          import { renderAnalytics } from "./js/modules/analytics.js";
          import { renderPortfolio } from "./js/modules/portfolio.js";
          import { renderRisk } from "./js/modules/risk.js";
          import { renderCalculator } from "./js/modules/calculator.js";

          const storage = new Map();
          globalThis.window = {
            Chart: null,
            innerWidth: 1440,
            location: { pathname: "/dashboard", search: "", hash: "" },
            localStorage: {
              getItem: (key) => storage.get(key) ?? null,
              setItem: (key, value) => storage.set(key, String(value)),
              removeItem: (key) => storage.delete(key),
            },
            addEventListener() {},
            removeEventListener() {},
            setTimeout: globalThis.setTimeout,
            clearTimeout: globalThis.clearTimeout,
            requestAnimationFrame: (callback) => callback(),
            matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
          };
          globalThis.localStorage = window.localStorage;
          Object.defineProperty(globalThis, "navigator", {
            value: { userAgent: "node-render-smoke" },
            configurable: true,
          });
          globalThis.requestAnimationFrame = (callback) => callback();
          globalThis.cancelAnimationFrame = () => {};
          globalThis.getComputedStyle = () => ({
            getPropertyValue() {
              return "";
            },
          });
          globalThis.ResizeObserver = class { observe() {} disconnect() {} };
          globalThis.MutationObserver = class { observe() {} disconnect() {} };
          globalThis.CustomEvent = class {
            constructor(type, init = {}) {
              this.type = type;
              this.detail = init.detail;
            }
          };

          function makeElement() {
            return {
              dataset: {},
              style: {},
              innerHTML: "",
              textContent: "",
              value: "",
              checked: false,
              isConnected: true,
              classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
              addEventListener() {},
              removeEventListener() {},
              appendChild() {},
              setAttribute() {},
              getAttribute() { return null; },
              querySelector() { return null; },
              querySelectorAll() { return []; },
              getBoundingClientRect() { return { width: 1280, height: 720, top: 0, left: 0 }; },
              focus() {},
              matches() { return false; },
            };
          }

          globalThis.document = {
            documentElement: { dataset: { theme: "dark" }, matches: () => true, classList: makeElement().classList },
            body: { dataset: { theme: "dark" }, matches: () => true, classList: makeElement().classList },
            visibilityState: "visible",
            fonts: { ready: Promise.resolve() },
            createElement: makeElement,
            getElementById() { return null; },
            addEventListener() {},
            removeEventListener() {},
            querySelector() { return null; },
            querySelectorAll() { return []; },
            dispatchEvent() {},
          };

          class SmokeRoot {
            constructor(page) {
              this.page = page;
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
            getBoundingClientRect() { return { width: 1280, height: 720, top: 0, left: 0 }; }
          }

          const snapshot = JSON.parse(fs.readFileSync("./tests/fixtures/live_accounts_snapshot_two_mt5.json", "utf8"));
          const liveAccounts = snapshot.accounts.map((account) => adaptMt5Account(account));
          const accounts = Object.fromEntries(liveAccounts.map((account) => [account.id, account]));
          const liveAccountIds = liveAccounts.map((account) => account.id);
          const baseState = {
            accounts,
            accountDirectory: accounts,
            managedAccounts: {},
            liveAccountIds,
            activeLiveAccountId: snapshot.active_account_id,
            activeAccountId: snapshot.active_account_id,
            currentAccount: snapshot.active_account_id,
            mode: "live",
            auth: {
              status: "authenticated",
              user: {
                id: snapshot.scope_user_id,
                email: "contract@kmfxedge.test",
                name: "Contract User",
                initials: "CU",
                role: "user",
                is_admin: false,
              },
            },
            ui: { activePage: "dashboard" },
            workspace: {
              baseCurrency: "USD",
              journal: { entries: [], form: {}, editingId: null },
              strategies: { items: [], backtests: [] },
              fundedAccounts: [],
              fundingJourneys: [],
              fundingTransactions: [],
              market: { watchlist: [], events: [], rates: {} },
              portfolio: { allocations: [], mandates: [] },
              glossary: { terms: [] },
            },
            settings: {},
          };

          const pages = [
            ["dashboard", renderDashboard],
            ["connections", renderConnections],
            ["trades", renderTrades],
            ["calendar", renderCalendar],
            ["analytics", renderAnalytics],
            ["portfolio", renderPortfolio],
            ["risk", renderRisk],
            ["calculator", renderCalculator],
          ];

          const forbidden = [
            "Sandbox",
            "Demo",
            "mock",
            "payloadSource=mock",
            "workspace local",
            "snapshot MT5 del backend",
          ];
          const requiredByPage = {
            dashboard: ["Orion Challenge 5k", "5061", "AUDUSD"],
            connections: ["Cuentas conectadas", "Conectar MT5"],
            trades: ["EURUSD", "GBPUSD"],
            calendar: ["Calendario"],
            analytics: ["Patrones detectados", "Dónde se concentra el resultado"],
            portfolio: ["110", "Capital"],
            risk: ["Risk"],
            calculator: ["Calculadora"],
          };

          const results = pages.map(([page, render]) => {
            const root = new SmokeRoot(page);
            const state = {
              ...baseState,
              ui: { ...baseState.ui, activePage: page === "connections" ? "accounts" : page },
            };
            render(root, state);
            const html = String(root.innerHTML || "");
            return {
              page,
              htmlLength: html.length,
              forbiddenHits: forbidden.filter((needle) => html.toLowerCase().includes(needle.toLowerCase())),
              requiredHits: (requiredByPage[page] || []).filter((needle) => html.includes(needle)),
            };
          });

          console.log(JSON.stringify(results));
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
            self.fail(f"node render smoke failed\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}")
        return json.loads(proc.stdout.splitlines()[-1])

    def test_live_fixture_renders_primary_dashboard_pages_without_mock_fallback(self) -> None:
        results = self.run_node_smoke()
        by_page = {row["page"]: row for row in results}

        self.assertEqual(
            {"dashboard", "connections", "trades", "calendar", "analytics", "portfolio", "risk", "calculator"},
            set(by_page),
        )
        for page, row in by_page.items():
            self.assertGreater(row["htmlLength"], 500, page)
            self.assertEqual([], row["forbiddenHits"], page)
            self.assertGreater(len(row["requiredHits"]), 0, page)


if __name__ == "__main__":
    unittest.main()
