import { adaptMt5Account } from "../data/adapters/mt5-account-adapter.js?v=build-20260406-104500";
import { evaluateCompliance } from "./account-runtime.js?v=build-20260406-104500";
import { resolveAccountsSnapshotUrl } from "./api-config.js?v=build-20260406-104500";

function normalizeBridgeUrl(rawUrl = "") {
  const value = String(rawUrl || "").trim();
  if (!value || value === "ws://localhost:8080/bridge") return "";
  if (value.startsWith("http://")) return value.replace("http://", "ws://");
  if (value.startsWith("https://")) return value.replace("https://", "wss://");
  return value;
}

function getPreferredBridgeUrl() {
  try {
    const raw = window.localStorage.getItem("kmfx.settings.preferences");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return normalizeBridgeUrl(parsed?.bridgeUrl || "");
  } catch {
    return "";
  }
}

function normalizeAccountEntry(entry = {}) {
  const safe = entry && typeof entry === "object" ? entry : {};
  return {
    accountId: String(safe.account_id || safe.id || ""),
    broker: String(safe.broker || "MT5"),
    platform: String(safe.platform || "mt5"),
    login: String(safe.login || ""),
    server: String(safe.server || ""),
    connectionMode: String(safe.connection_mode || "bridge"),
    status: String(safe.status || "disconnected"),
    apiKey: String(safe.api_key || ""),
    lastSyncAt: String(safe.last_sync_at || ""),
    isDefault: Boolean(safe.is_default),
    nickname: String(safe.nickname || ""),
    displayName: String(safe.display_name || safe.nickname || `${safe.broker || "MT5"} · ${safe.login || "Cuenta"}`),
    dashboardPayload: safe.dashboard_payload && typeof safe.dashboard_payload === "object" ? safe.dashboard_payload : {},
  };
}

function mergeLiveAccounts(store, snapshot) {
  const state = store.getState();
  const normalizedAccounts = Array.isArray(snapshot?.accounts) ? snapshot.accounts.map(normalizeAccountEntry) : [];
  console.log("[KMFX][ACCOUNTS] merge snapshot", {
    count: normalizedAccounts.length,
    activeAccountId: snapshot?.active_account_id || "",
    accounts: normalizedAccounts.map((account) => ({
      accountId: account.accountId,
      login: account.login,
      status: account.status,
      trades: Array.isArray(account.dashboardPayload?.trades) ? account.dashboardPayload.trades.length : 0,
      history: Array.isArray(account.dashboardPayload?.history) ? account.dashboardPayload.history.length : 0,
      positions: Array.isArray(account.dashboardPayload?.positions) ? account.dashboardPayload.positions.length : 0,
    })),
  });
  const liveAccountIds = normalizedAccounts.map((account) => account.accountId).filter(Boolean);
  const nextAccounts = { ...state.accounts };

  Object.entries(nextAccounts).forEach(([accountId, account]) => {
    if (account?.sourceType === "mt5" && !liveAccountIds.includes(accountId)) {
      delete nextAccounts[accountId];
    }
  });

  normalizedAccounts.forEach((accountEntry) => {
    const liveRecord = adaptMt5Account(accountEntry);
    const nextAccount = {
      ...liveRecord,
      compliance: evaluateCompliance(liveRecord, state.workspace.fundedAccounts),
    };
    nextAccounts[nextAccount.id] = nextAccount;
  });

  const previousCurrentAccount = state.currentAccount;
  const activeAccountId = snapshot?.active_account_id || normalizedAccounts.find((account) => account.isDefault)?.accountId || liveAccountIds[0] || state.currentAccount;
  const selectedAccount = normalizedAccounts.find((account) => account.accountId === activeAccountId) || normalizedAccounts[0] || null;
  const currentAccountIsLive = liveAccountIds.includes(previousCurrentAccount);
  let resolvedCurrentAccount = previousCurrentAccount;

  if (liveAccountIds.length > 0) {
    if (previousCurrentAccount === "sandbox") {
      resolvedCurrentAccount = activeAccountId || liveAccountIds[0] || previousCurrentAccount;
    } else if (!currentAccountIsLive) {
      resolvedCurrentAccount = activeAccountId || liveAccountIds[0] || previousCurrentAccount;
    } else if (!nextAccounts[previousCurrentAccount]) {
      resolvedCurrentAccount = activeAccountId || liveAccountIds[0] || Object.keys(nextAccounts)[0] || null;
    }
  } else if (!nextAccounts[previousCurrentAccount]) {
    resolvedCurrentAccount = Object.keys(nextAccounts)[0] || null;
  }

  console.log("[KMFX][ACCOUNTS] currentAccount resolution", {
    previousCurrentAccount,
    liveAccountIds,
    activeAccountId,
    resolvedCurrentAccount,
  });
  console.info("[KMFX][ACCOUNT_SELECTION_RESOLVED]", {
    selectedAccountId: selectedAccount?.accountId || resolvedCurrentAccount || "",
    selectedLogin: selectedAccount?.login || "",
    broker: selectedAccount?.broker || "",
    sourceType: "mt5",
  });

  const sameLiveIds = liveAccountIds.length === (state.liveAccountIds || []).length
    && liveAccountIds.every((accountId, index) => accountId === state.liveAccountIds[index]);
  const sameActive = (activeAccountId || null) === (state.activeLiveAccountId || null);
  const sameCurrent = (resolvedCurrentAccount || null) === (state.currentAccount || null);
  const sameDirectory = normalizedAccounts.every((account) => {
    const previous = state.accountDirectory?.[account.accountId];
    return previous
      && previous.lastSyncAt === account.lastSyncAt
      && previous.status === account.status
      && previous.displayName === account.displayName;
  }) && Object.keys(state.accountDirectory || {}).length === normalizedAccounts.length;

  if (sameLiveIds && sameActive && sameCurrent && sameDirectory) {
    console.log("[KMFX][ACCOUNTS] snapshot skipped", {
      reason: "no_material_changes",
      liveAccountIds,
      activeAccountId,
    });
    return;
  }

  store.setState((prev) => ({
    ...prev,
    accounts: nextAccounts,
    accountDirectory: Object.fromEntries(
      normalizedAccounts.map((account) => [
        account.accountId,
        {
          ...account,
          id: account.accountId,
        }
      ])
    ),
    liveAccountIds,
    activeLiveAccountId: activeAccountId || null,
    activeAccountId: activeAccountId || null,
    mode: liveAccountIds.length > 0 ? "live" : "mock",
    bootResolved: true,
    currentAccount: resolvedCurrentAccount,
  }));
  console.log("[KMFX][ACCOUNTS] store updated", {
    liveAccountIds,
    currentAccount: resolvedCurrentAccount,
  });
  if (liveAccountIds.length > 0 && selectedAccount) {
    console.info("[KMFX][BOOT][LIVE-DETECTED]", {
      accountsCount: liveAccountIds.length,
      selectedAccountId: selectedAccount.accountId,
      login: selectedAccount.login || "",
    });
  }
}

export function initAccountsLiveSnapshot(store) {
  let socket = null;
  let reconnectTimer = null;
  let httpPollTimer = null;

  const pollHttpSnapshot = async () => {
    const url = resolveAccountsSnapshotUrl();
    if (!url) {
      console.info("[KMFX][API]", {
        label: "snapshot-fetch-disabled",
        reason: "missing_api_base_url",
      });
      store.setState((state) => ({
        ...state,
        bootResolved: true,
        mode: Array.isArray(state.liveAccountIds) && state.liveAccountIds.length > 0 ? "live" : "mock",
      }));
      return { ok: false, count: 0 };
    }
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        console.warn("[KMFX][ACCOUNTS] http snapshot failed", response.status, url);
        store.setState((state) => ({
          ...state,
          bootResolved: true,
          mode: Array.isArray(state.liveAccountIds) && state.liveAccountIds.length > 0 ? "live" : "mock",
        }));
        return { ok: false, count: 0, status: response.status };
      }
      const payload = await response.json();
      console.log("[KMFX][ACCOUNTS] http snapshot received", {
        count: Array.isArray(payload?.accounts) ? payload.accounts.length : 0,
        activeAccountId: payload?.active_account_id || "",
      });
      if (!payload || !Array.isArray(payload.accounts)) {
        store.setState((state) => ({
          ...state,
          bootResolved: true,
          mode: Array.isArray(state.liveAccountIds) && state.liveAccountIds.length > 0 ? "live" : "mock",
        }));
        return { ok: false, count: 0 };
      }
      mergeLiveAccounts(store, payload);
      if (!payload.accounts.length) {
        store.setState((state) => ({
          ...state,
          bootResolved: true,
          mode: "mock",
        }));
      }
      return {
        ok: true,
        count: payload.accounts.length,
        selectedAccountId: payload.accounts[0]?.account_id || "",
      };
    } catch (error) {
      console.warn("[KMFX][ACCOUNTS] http snapshot error", error);
      store.setState((state) => ({
        ...state,
        bootResolved: true,
        mode: Array.isArray(state.liveAccountIds) && state.liveAccountIds.length > 0 ? "live" : "mock",
      }));
      return { ok: false, count: 0, error: true };
    }
  };

  const startHttpPolling = () => {
    clearInterval(httpPollTimer);
    httpPollTimer = window.setInterval(pollHttpSnapshot, 5000);
  };

  const connect = () => {
    const bridgeUrl = getPreferredBridgeUrl();
    if (!bridgeUrl) {
      console.info("[KMFX][BOOT]", {
        label: "accounts-ws-disabled",
        mode: "http-only",
      });
      return;
    }
    try {
      socket = new WebSocket(bridgeUrl);
    } catch (error) {
      reconnectTimer = window.setTimeout(connect, 3000);
      return;
    }

    socket.addEventListener("open", () => {
      socket?.send(JSON.stringify({ cmd: "get_snapshot" }));
    });

    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data || "{}");
        if (!payload || (payload.type !== "snapshot" && payload.type !== "update")) return;
        if (!payload.accounts_snapshot) return;
        console.log("[KMFX][ACCOUNTS] websocket snapshot received", {
          count: Array.isArray(payload.accounts_snapshot?.accounts) ? payload.accounts_snapshot.accounts.length : 0,
          activeAccountId: payload.accounts_snapshot?.active_account_id || "",
        });
        mergeLiveAccounts(store, payload.accounts_snapshot);
      } catch (error) {
        console.warn("[KMFX][ACCOUNTS] snapshot parse failed", error);
      }
    });

    socket.addEventListener("close", () => {
      socket = null;
      clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(connect, 3000);
    });

    socket.addEventListener("error", () => {
      try {
        socket?.close();
      } catch {
        // noop
      }
    });
  };

  const initialSnapshotPromise = pollHttpSnapshot();
  startHttpPolling();
  connect();
  return initialSnapshotPromise;
}
