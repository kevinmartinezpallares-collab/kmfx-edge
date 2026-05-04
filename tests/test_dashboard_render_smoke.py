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

    def run_degraded_connections_smoke(self) -> dict:
        script = r"""
          import { renderConnections } from "./js/modules/connections.js";

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
          };
          globalThis.localStorage = window.localStorage;
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

          const managedAccounts = [
            {
              account_id: "mt5-pending-contract",
              user_id: "user-live-contract",
              display_name: "Cuenta pendiente",
              alias: "Cuenta pendiente",
              platform: "mt5",
              broker: "Pendiente Broker",
              login: "pendiente",
              server: "Pendiente-Live",
              status: "pending_link",
              connection_mode: "launcher",
              last_sync_at: "",
              currency: "USD",
              balance: null,
              equity: null,
            },
            {
              account_id: "mt5-stale-contract",
              user_id: "user-live-contract",
              display_name: "Cuenta sin actualizar",
              alias: "Cuenta sin actualizar",
              platform: "mt5",
              broker: "Stale Broker",
              login: "stale-400",
              server: "Stale-Live",
              status: "stale",
              connection_mode: "launcher",
              last_sync_at: "2026-05-01T09:00:00Z",
              currency: "USD",
              balance: 10000,
              equity: 9995,
              open_pnl: -5,
            },
            {
              account_id: "mt5-revoked-contract",
              user_id: "user-live-contract",
              display_name: "Cuenta revocada",
              alias: "Cuenta revocada",
              platform: "mt5",
              broker: "Revoked Broker",
              login: "revoked-401",
              server: "Revoked-Live",
              status: "revoked",
              connection_mode: "launcher",
              last_sync_at: "2026-05-02T09:00:00Z",
              currency: "USD",
              balance: 10000,
              equity: 10000,
            },
            {
              account_id: "mt5-plan-limited-contract",
              user_id: "user-live-contract",
              display_name: "Cuenta limitada por plan",
              alias: "Cuenta limitada por plan",
              platform: "mt5",
              broker: "Plan Broker",
              login: "plan-402",
              server: "Plan-Live",
              status: "plan_limited",
              connection_mode: "launcher",
              last_sync_at: "",
              currency: "USD",
              balance: null,
              equity: null,
            },
            {
              account_id: "mt5-error-contract",
              user_id: "user-live-contract",
              display_name: "Cuenta con error",
              alias: "Cuenta con error",
              platform: "mt5",
              broker: "Error Broker",
              login: "error-500",
              server: "Error-Live",
              status: "error",
              connection_mode: "launcher",
              last_sync_at: "2026-05-02T09:00:00Z",
              currency: "USD",
              balance: 10000,
              equity: 10000,
            },
          ];
          const state = {
            managedAccounts,
            accountDirectory: {},
            accounts: {},
            liveAccountIds: [],
            activeAccountId: "",
            activeLiveAccountId: "",
            auth: {
              status: "authenticated",
              user: {
                id: "user-live-contract",
                email: "contract@kmfxedge.test",
                role: "user",
                is_admin: false,
              },
            },
            ui: { activePage: "accounts" },
            workspace: {},
          };
          const root = new SmokeRoot();
          renderConnections(root, state);
          const html = String(root.innerHTML || "");
          const required = [
            "Pendiente",
            "Instala el EA y espera primer sync",
            "Sin actualizar",
            "Última actividad",
            "Key revocada",
            "Crea una nueva conexión",
            "Bloqueada por plan",
            "Actualiza el plan o libera una conexión",
            "Error de conexión",
            "Revisa la conexión en Launcher",
          ];
          const forbidden = [
            "payloadSource=mock",
            "workspace local",
            "snapshot MT5 del backend",
          ];
          console.log(JSON.stringify({
            htmlLength: html.length,
            requiredHits: required.filter((needle) => html.includes(needle)),
            forbiddenHits: forbidden.filter((needle) => html.toLowerCase().includes(needle.toLowerCase())),
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
            self.fail(f"node degraded connections smoke failed\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}")
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

    def test_connections_render_pending_stale_revoked_and_plan_limited_states(self) -> None:
        result = self.run_degraded_connections_smoke()

        self.assertGreater(result["htmlLength"], 500)
        self.assertEqual([], result["forbiddenHits"])
        self.assertEqual(
            {
                "Pendiente",
                "Instala el EA y espera primer sync",
                "Sin actualizar",
                "Última actividad",
                "Key revocada",
                "Crea una nueva conexión",
                "Bloqueada por plan",
                "Actualiza el plan o libera una conexión",
                "Error de conexión",
                "Revisa la conexión en Launcher",
            },
            set(result["requiredHits"]),
        )


if __name__ == "__main__":
    unittest.main()
