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
          import { renderGlossary } from "./js/modules/glossary.js";

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
            billing: {
              loading: false,
              loadedAt: "2026-05-05T07:40:00Z",
              error: "",
              authRequired: false,
              billing: {
                plan: "pro",
                effectivePlan: "pro",
                displayName: "Edge Pro",
                status: "active",
                access: "active",
              },
              entitlements: {
                liveMt5Accounts: 3,
                launcherConnection: true,
                rawBridgeDebug: true,
              },
              limits: {
                liveMt5Accounts: 3,
                connectionKeyLimit: 3,
              },
              isAdmin: false,
              source: "app_metadata",
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
            ["risk-ruin-var", renderRisk],
            ["calculator", renderCalculator],
            ["glossary", renderGlossary],
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
            dashboard: [
              "Orion Challenge 5k",
              "5061",
              "AUDUSD",
              "Net Return",
              "VaR 95",
              "Edge Score",
              "dashboard-professional-kpi__risk-score",
              "dashboard-professional-kpi__exposure",
              "dashboard-professional-kpi__delta",
              "dashboard-kpi-card__tooltip",
            ],
            connections: ["Cuentas conectadas", "Conectar cuenta", "Edge Pro", "Activo"],
            trades: ["EURUSD", "GBPUSD"],
            calendar: ["Calendario"],
            analytics: ["Patrones detectados", "Dónde se concentra el resultado"],
            portfolio: ["110", "Capital"],
            risk: ["Risk"],
            "risk-ruin-var": ["Ruin / VaR", "risk-professional-card__visual", "VaR 95", "CVaR", "Muestra"],
            calculator: ["Calculadora"],
            glossary: ["Estudio de métricas", "study-metric-slider", "Métricas críticas del dashboard", "Confianza"],
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

    def run_risk_funding_degraded_smoke(self) -> dict:
        script = r"""
          import fs from "node:fs";
          import { adaptMt5Account } from "./js/data/adapters/mt5-account-adapter.js";
          import { renderRisk } from "./js/modules/risk.js";
          import { renderFunded } from "./js/modules/funded.js";

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
            matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
          };
          globalThis.localStorage = window.localStorage;
          globalThis.getComputedStyle = () => ({ getPropertyValue() { return ""; } });
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

          function baseState(account) {
            return {
              accounts: { [account.id]: account },
              accountDirectory: { [account.id]: account },
              managedAccounts: {},
              liveAccountIds: [account.id],
              activeLiveAccountId: account.id,
              activeAccountId: account.id,
              currentAccount: account.id,
              mode: "live",
              auth: {
                status: "authenticated",
                user: {
                  id: "user-live-contract",
                  email: "contract@kmfxedge.test",
                  role: "user",
                  is_admin: false,
                },
              },
              billing: {
                loading: false,
                loadedAt: "2026-05-05T09:40:00Z",
                error: "",
                authRequired: false,
                billing: {
                  plan: "pro",
                  effectivePlan: "pro",
                  displayName: "Edge Pro",
                  status: "active",
                  access: "active",
                },
                entitlements: {
                  liveMt5Accounts: 3,
                  launcherConnection: true,
                  riskCore: true,
                  riskPolicyEditor: true,
                  localAutoBlock: true,
                  fundedChallenges: true,
                  strategies: true,
                  exports: true,
                },
                limits: {
                  liveMt5Accounts: 3,
                  connectionKeyLimit: 3,
                },
                isAdmin: false,
                source: "app_metadata",
              },
              ui: { activePage: "risk" },
              workspace: {
                fundedAccounts: [],
                fundingJourneys: [],
                fundingPhases: [],
                fundingTransactions: [],
              },
            };
          }

          const snapshot = JSON.parse(fs.readFileSync("./tests/fixtures/live_accounts_snapshot_two_mt5.json", "utf8"));
          const staleAccount = adaptMt5Account(snapshot.accounts[0]);
          const pendingRiskAccount = {
            ...staleAccount,
            dashboardPayload: {
              ...staleAccount.dashboardPayload,
              riskSnapshot: null,
              timestamp: "",
            },
            riskSnapshot: null,
            connection: {
              ...(staleAccount.connection || {}),
              connected: false,
              state: "connecting",
              lastSync: "",
            },
          };

          const emptyRiskRoot = new SmokeRoot();
          renderRisk(emptyRiskRoot, baseState(pendingRiskAccount));
          const staleRiskRoot = new SmokeRoot();
          renderRisk(staleRiskRoot, baseState(staleAccount));
          const fundingRoot = new SmokeRoot();
          renderFunded(fundingRoot, {
            ...baseState(staleAccount),
            ui: { activePage: "funded" },
          });

          const riskEmptyHtml = String(emptyRiskRoot.innerHTML || "");
          const riskStaleHtml = String(staleRiskRoot.innerHTML || "");
          const fundingHtml = String(fundingRoot.innerHTML || "");
          const forbidden = [
            "payloadSource=mock",
            "workspace local",
            "snapshot MT5 del backend",
          ];
          console.log(JSON.stringify({
            riskEmpty: {
              htmlLength: riskEmptyHtml.length,
              requiredHits: [
                "Esperando sincronización",
                "Aún no hay datos suficientes para calcular límites",
                "Ir a Cuentas",
              ].filter((needle) => riskEmptyHtml.includes(needle)),
              forbiddenHits: forbidden.filter((needle) => riskEmptyHtml.toLowerCase().includes(needle.toLowerCase())),
            },
            riskStale: {
              htmlLength: riskStaleHtml.length,
              requiredHits: [
                "Mostrando último estado conocido",
                "La cuenta no ha enviado una actualización reciente",
                "Última sincronización",
              ].filter((needle) => riskStaleHtml.includes(needle)),
              forbiddenHits: forbidden.filter((needle) => riskStaleHtml.toLowerCase().includes(needle.toLowerCase())),
            },
            fundingEmpty: {
              htmlLength: fundingHtml.length,
              requiredHits: [
                "Sin cuenta funding vinculada",
                "Marca una cuenta MT5 como Funding o Challenge",
                "Ir a Cuentas",
              ].filter((needle) => fundingHtml.includes(needle)),
              forbiddenHits: forbidden.filter((needle) => fundingHtml.toLowerCase().includes(needle.toLowerCase())),
            },
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
            self.fail(f"node risk/funding degraded smoke failed\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}")
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
            billing: {
              loading: false,
              error: "",
              authRequired: false,
              billing: {
                plan: "pro",
                effectivePlan: "free",
                displayName: "Edge Pro",
                status: "unpaid",
                access: "restricted",
              },
              entitlements: {
                liveMt5Accounts: 0,
                launcherConnection: false,
              },
              limits: {
                liveMt5Accounts: 0,
                connectionKeyLimit: 0,
              },
              isAdmin: false,
              source: "app_metadata",
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
            "Plan con acceso restringido",
            "Acceso restringido",
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

    def run_entitlement_blocked_smoke(self) -> dict:
        script = r"""
          import fs from "node:fs";
          import { adaptMt5Account } from "./js/data/adapters/mt5-account-adapter.js";
          import { renderConnections } from "./js/modules/connections.js";
          import { renderRisk } from "./js/modules/risk.js";
          import { renderFunded } from "./js/modules/funded.js";
          import { renderStrategies } from "./js/modules/strategies.js";
          import { renderJournal } from "./js/modules/journal.js";

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
            matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
          };
          globalThis.localStorage = window.localStorage;
          globalThis.getComputedStyle = () => ({ getPropertyValue() { return ""; } });
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

          const snapshot = JSON.parse(fs.readFileSync("./tests/fixtures/live_accounts_snapshot_two_mt5.json", "utf8"));
          const account = adaptMt5Account(snapshot.accounts[0]);
          const freeBilling = {
            loading: false,
            loadedAt: "2026-05-05T09:55:00Z",
            error: "",
            authRequired: false,
            billing: {
              plan: "free",
              effectivePlan: "free",
              displayName: "Free / Demo",
              status: "active",
              access: "free",
            },
            entitlements: {
              liveMt5Accounts: 0,
              launcherConnection: false,
              riskCore: "partial",
              riskPolicyEditor: false,
              localAutoBlock: false,
              journal: "limited",
              strategies: false,
              fundedChallenges: false,
              exports: false,
            },
            limits: {
              liveMt5Accounts: 0,
              connectionKeyLimit: 0,
            },
            isAdmin: false,
            source: "app_metadata",
          };
          function baseState(activePage) {
            return {
              accounts: { [account.id]: account },
              accountDirectory: { [account.id]: account },
              managedAccounts: [],
              liveAccountIds: [account.id],
              activeLiveAccountId: account.id,
              activeAccountId: account.id,
              currentAccount: account.id,
              mode: "live",
              auth: {
                status: "authenticated",
                user: {
                  id: "user-live-contract",
                  email: "contract@kmfxedge.test",
                  role: "user",
                  is_admin: false,
                },
              },
              billing: freeBilling,
              ui: { activePage },
              workspace: {
                journal: { entries: [], form: {}, editingId: null },
                strategies: { items: [], backtests: [] },
                fundedAccounts: [],
                fundingJourneys: [],
                fundingPhases: [],
                fundingTransactions: [],
                market: { watchlist: [], events: [], rates: {} },
                portfolio: { allocations: [], mandates: [] },
              },
            };
          }

          const roots = {
            connections: new SmokeRoot(),
            risk: new SmokeRoot(),
            funded: new SmokeRoot(),
            strategies: new SmokeRoot(),
            journalAi: new SmokeRoot(),
          };
          renderConnections(roots.connections, {
            ...baseState("accounts"),
            accounts: {},
            accountDirectory: {},
            liveAccountIds: [],
            activeLiveAccountId: "",
            activeAccountId: "",
            currentAccount: "",
          });
          renderRisk(roots.risk, baseState("risk"));
          renderFunded(roots.funded, baseState("funded"));
          renderStrategies(roots.strategies, baseState("strategies"));
          renderJournal(roots.journalAi, baseState("journal-ai-review"));

          const required = {
            connections: ["Conexión MT5 no está disponible en Free / Demo", "Conectar cuenta"],
            risk: ["Editor de política de riesgo no está disponible en Free / Demo", "Modo lectura"],
            funded: ["Funding no está disponible en Free / Demo"],
            strategies: ["Strategy Lab no está disponible en Free / Demo"],
            journalAi: ["Export de evidencia no está disponible en Free / Demo"],
          };
          const forbidden = [
            "entitlement",
            "riskPolicyEditor",
            "localAutoBlock",
            "workspace local",
            "snapshot MT5 del backend",
          ];
          const result = Object.fromEntries(Object.entries(roots).map(([key, root]) => {
            const html = String(root.innerHTML || "");
            return [key, {
              htmlLength: html.length,
              requiredHits: required[key].filter((needle) => html.includes(needle)),
              forbiddenHits: forbidden.filter((needle) => html.toLowerCase().includes(needle.toLowerCase())),
            }];
          }));
          console.log(JSON.stringify(result));
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
            self.fail(f"node entitlement blocked smoke failed\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}")
        return json.loads(proc.stdout.splitlines()[-1])

    def test_live_fixture_renders_primary_dashboard_pages_without_mock_fallback(self) -> None:
        results = self.run_node_smoke()
        by_page = {row["page"]: row for row in results}

        self.assertEqual(
            {"dashboard", "connections", "trades", "calendar", "analytics", "portfolio", "risk", "risk-ruin-var", "calculator", "glossary"},
            set(by_page),
        )
        for page, row in by_page.items():
            self.assertGreater(row["htmlLength"], 500, page)
            self.assertEqual([], row["forbiddenHits"], page)
            self.assertGreater(len(row["requiredHits"]), 0, page)
        self.assertTrue(
            {
                "Net Return",
                "VaR 95",
                "Edge Score",
                "dashboard-professional-kpi__risk-score",
                "dashboard-professional-kpi__exposure",
                "dashboard-professional-kpi__delta",
            }.issubset(set(by_page["dashboard"]["requiredHits"])),
            by_page["dashboard"],
        )

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
                "Plan con acceso restringido",
                "Acceso restringido",
            },
            set(result["requiredHits"]),
        )

    def test_risk_and_funding_render_degraded_states_without_internal_copy(self) -> None:
        result = self.run_risk_funding_degraded_smoke()

        for key, row in result.items():
            self.assertGreater(row["htmlLength"], 500, key)
            self.assertEqual([], row["forbiddenHits"], key)
            self.assertGreaterEqual(len(row["requiredHits"]), 3, key)

    def test_product_entitlement_blocks_render_as_production_states(self) -> None:
        result = self.run_entitlement_blocked_smoke()

        for key, row in result.items():
            self.assertGreater(row["htmlLength"], 500, key)
            self.assertEqual([], row["forbiddenHits"], key)
            self.assertEqual(set(row["requiredHits"]), set({
                "connections": ["Conexión MT5 no está disponible en Free / Demo", "Conectar cuenta"],
                "risk": ["Editor de política de riesgo no está disponible en Free / Demo", "Modo lectura"],
                "funded": ["Funding no está disponible en Free / Demo"],
                "strategies": ["Strategy Lab no está disponible en Free / Demo"],
                "journalAi": ["Export de evidencia no está disponible en Free / Demo"],
            }[key]), key)


if __name__ == "__main__":
    unittest.main()
