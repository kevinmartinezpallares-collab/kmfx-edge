import { adaptMockAccounts, createMockWorkspaceState, rawMockAccounts } from "../data/index.js?v=build-20260406-203500";
import { evaluateCompliance } from "./account-runtime.js?v=build-20260406-203500";
import { readPersistedAuthState } from "./auth-session.js?v=build-20260406-203500";

const STORAGE_KEY = "kmfx_frontend_state";
const validPages = new Set(["dashboard", "analytics", "risk", "trades", "calendar", "connections", "calculator", "journal", "strategies", "funded", "market", "portfolio", "glossary", "debug", "settings"]);
const validAnalyticsTabs = new Set(["summary", "daily", "hourly", "risk"]);

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn("[KMFX][STORE] localStorage get failed", error);
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn("[KMFX][STORE] localStorage set failed", error);
  }
}

function hydratePreferences() {
  const raw = safeStorageGet(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) || {};
  } catch (error) {
    console.warn("[KMFX][STORE] persisted state parse failed", error);
    return {};
  }
}

function persistPreferences(state) {
  safeStorageSet(STORAGE_KEY, JSON.stringify({
    currentAccount: state.currentAccount,
    ui: {
      activePage: state.ui.activePage,
      analyticsTab: state.ui.analyticsTab,
      theme: state.ui.theme
    },
    accountRuntime: Object.fromEntries(
      Object.values(state.accounts).map((account) => [account.id, {
        connection: account.connection,
        compliance: account.compliance
      }])
    ),
    workspace: state.workspace
  }));
}

function sanitizeUi(ui = {}) {
  return {
    activePage: validPages.has(ui.activePage) ? ui.activePage : "dashboard",
    analyticsTab: validAnalyticsTabs.has(ui.analyticsTab) ? ui.analyticsTab : "summary",
    theme: ui.theme === "dark" ? "dark" : "light"
  };
}

function sanitizeWorkspace(workspace = {}) {
  const base = createMockWorkspaceState();
  return {
    ...base,
    ...workspace,
    connections: Array.isArray(workspace.connections) ? workspace.connections : base.connections,
    calculator: {
      ...base.calculator,
      ...(workspace.calculator || {})
    },
    journal: {
      entries: Array.isArray(workspace.journal?.entries) ? workspace.journal.entries : base.journal.entries,
      form: {
        ...base.journal.form,
        ...(workspace.journal?.form || {})
      },
      editingId: workspace.journal?.editingId || null
    },
    strategies: {
      items: Array.isArray(workspace.strategies?.items) ? workspace.strategies.items : base.strategies.items,
      form: {
        ...base.strategies.form,
        ...(workspace.strategies?.form || {})
      },
      editingId: workspace.strategies?.editingId || null
    },
    fundedAccounts: Array.isArray(workspace.fundedAccounts) ? workspace.fundedAccounts : base.fundedAccounts,
    market: {
      watchlist: Array.isArray(workspace.market?.watchlist) ? workspace.market.watchlist : base.market.watchlist,
      events: Array.isArray(workspace.market?.events) ? workspace.market.events : base.market.events
    },
    talent: {
      scorecards: Array.isArray(workspace.talent?.scorecards) ? workspace.talent.scorecards : base.talent.scorecards,
      focusAreas: Array.isArray(workspace.talent?.focusAreas) ? workspace.talent.focusAreas : base.talent.focusAreas
    },
    portfolio: {
      allocations: Array.isArray(workspace.portfolio?.allocations) ? workspace.portfolio.allocations : base.portfolio.allocations,
      mandates: Array.isArray(workspace.portfolio?.mandates) ? workspace.portfolio.mandates : base.portfolio.mandates
    },
    glossary: {
      terms: Array.isArray(workspace.glossary?.terms) ? workspace.glossary.terms : base.glossary.terms
    },
    debug: {
      panels: Array.isArray(workspace.debug?.panels) ? workspace.debug.panels : base.debug.panels,
      checkpoints: Array.isArray(workspace.debug?.checkpoints) ? workspace.debug.checkpoints : base.debug.checkpoints
    }
  };
}

function sanitizeConnection(connection = {}, sourceType = "mock") {
  return {
    state: ["disconnected", "connecting", "connected", "error"].includes(connection.state) ? connection.state : "disconnected",
    connected: Boolean(connection.connected || connection.state === "connected"),
    source: connection.source || (sourceType === "mt5" ? "mt5-ready" : "mock"),
    lastSync: connection.lastSync || null,
    lastError: connection.lastError || null,
    reconnectCount: Number.isFinite(connection.reconnectCount) ? connection.reconnectCount : 0,
    isSyncing: Boolean(connection.isSyncing),
    syncTick: Number.isFinite(connection.syncTick) ? connection.syncTick : 0,
    isAutoReconnectPending: Boolean(connection.isAutoReconnectPending)
  };
}

function sanitizeCompliance(compliance = {}) {
  return {
    riskStatus: ["ok", "warning", "violation"].includes(compliance.riskStatus) ? compliance.riskStatus : "ok",
    fundedStatus: ["ok", "warning", "violation"].includes(compliance.fundedStatus) ? compliance.fundedStatus : "ok",
    messages: Array.isArray(compliance.messages) ? compliance.messages : []
  };
}

function mergeAccountRuntime(accounts, runtime = {}) {
  return Object.fromEntries(
    Object.entries(accounts).map(([id, account]) => {
      const saved = runtime[id] || {};
      return [id, {
        ...account,
        connection: sanitizeConnection(saved.connection, account.sourceType),
        compliance: sanitizeCompliance(saved.compliance)
      }];
    })
  );
}

function applyCompliance(accounts, workspace) {
  return Object.fromEntries(
    Object.entries(accounts).map(([id, account]) => [
      id,
      {
        ...account,
        compliance: evaluateCompliance(account, workspace.fundedAccounts)
      }
    ])
  );
}

function createInitialState() {
  const persisted = hydratePreferences();
  const workspace = sanitizeWorkspace(persisted.workspace);
  const accounts = applyCompliance(
    mergeAccountRuntime(adaptMockAccounts(rawMockAccounts), persisted.accountRuntime),
    workspace
  );
  const accountIds = Object.keys(accounts);
  const currentAccount = accountIds.includes(persisted.currentAccount) ? persisted.currentAccount : accountIds[0];

  return {
    accounts,
    accountDirectory: {},
    managedAccounts: [],
    liveAccountIds: [],
    activeLiveAccountId: null,
    activeAccountId: null,
    mode: "mock",
    bootResolved: false,
    currentAccount,
    ui: sanitizeUi(persisted.ui),
    workspace,
    auth: readPersistedAuthState()
  };
}

export function createStore(initialState = createInitialState()) {
  let state = initialState;
  const listeners = new Set();

  function getState() {
    return state;
  }

  function setState(updater) {
    const nextState = typeof updater === "function" ? updater(state) : { ...state, ...updater };
    state = nextState;
    persistPreferences(state);
    listeners.forEach((listener) => listener(state));
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { getState, setState, subscribe };
}
