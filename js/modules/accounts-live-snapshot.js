import { adaptMt5Account } from "../data/adapters/mt5-account-adapter.js?v=build-20260401-203500";
import { evaluateCompliance } from "./account-runtime.js?v=build-20260401-203500";

const DEFAULT_BRIDGE_URL = "ws://localhost:8765";

function normalizeBridgeUrl(rawUrl = "") {
  const value = String(rawUrl || "").trim();
  if (!value || value === "ws://localhost:8080/bridge") return DEFAULT_BRIDGE_URL;
  if (value.startsWith("http://")) return value.replace("http://", "ws://");
  if (value.startsWith("https://")) return value.replace("https://", "wss://");
  return value;
}

function getPreferredBridgeUrl() {
  try {
    const raw = window.localStorage.getItem("kmfx.settings.preferences");
    if (!raw) return DEFAULT_BRIDGE_URL;
    const parsed = JSON.parse(raw);
    return normalizeBridgeUrl(parsed?.bridgeUrl || DEFAULT_BRIDGE_URL);
  } catch {
    return DEFAULT_BRIDGE_URL;
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

  const activeAccountId = snapshot?.active_account_id || normalizedAccounts.find((account) => account.isDefault)?.accountId || liveAccountIds[0] || state.currentAccount;
  const resolvedCurrentAccount = nextAccounts[activeAccountId]
    ? activeAccountId
    : nextAccounts[state.currentAccount]
      ? state.currentAccount
      : Object.keys(nextAccounts)[0] || null;

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
    currentAccount: resolvedCurrentAccount,
  }));
}

export function initAccountsLiveSnapshot(store) {
  let socket = null;
  let reconnectTimer = null;

  const connect = () => {
    const bridgeUrl = getPreferredBridgeUrl();
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

  connect();
}
