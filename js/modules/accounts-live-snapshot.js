import { adaptMt5Account } from "../data/adapters/mt5-account-adapter.js?v=build-20260504-074512";
import { evaluateCompliance } from "./account-runtime.js?v=build-20260504-074512";
import { resolveAccountsSnapshotUrl } from "./api-config.js?v=build-20260504-074512";
import { isAdminUserId } from "./auth-session.js?v=build-20260504-074512";

function isLocalRuntime() {
  const hostname = window.location.hostname || "";
  return window.location.protocol === "file:" || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function toFiniteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIsoTimestamp(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function payloadTimestamp(payload = {}) {
  return toIsoTimestamp(payload.timestamp || payload.updated_at || payload.updatedAt || payload.last_sync_at || payload.lastSyncAt || payload.account?.timestamp || "");
}

function payloadQualityScore(payload = {}) {
  if (!payload || typeof payload !== "object") return 0;
  let score = 0;
  if (String(payload.payloadSource || "") === "mt5_sync_live") score += 20;
  if (Number.isFinite(Number(payload.balance))) score += 8;
  if (Number.isFinite(Number(payload.equity))) score += 8;
  if (Number.isFinite(Number(payload.openPnl ?? payload.floatingPnl))) score += 4;
  if (Number.isFinite(Number(payload.closedPnl))) score += 4;
  if (Number.isFinite(Number(payload.totalPnl ?? payload.pnl))) score += 4;
  if (Array.isArray(payload.trades)) score += Math.min(payload.trades.length, 50);
  if (Array.isArray(payload.history)) score += Math.min(payload.history.length, 50);
  if (Array.isArray(payload.positions)) score += Math.min(payload.positions.length, 20);
  if (payload.riskSnapshot && typeof payload.riskSnapshot === "object") score += 12;
  return score;
}

function payloadSignature(payload = {}) {
  const history = Array.isArray(payload.history) ? payload.history : [];
  const trades = Array.isArray(payload.trades) ? payload.trades : [];
  const positions = Array.isArray(payload.positions) ? payload.positions : [];
  const lastHistoryPoint = history.at(-1) || {};
  const riskSummary = payload.riskSnapshot?.summary || {};
  return JSON.stringify({
    payloadSource: payload.payloadSource || "",
    balance: toFiniteNumber(payload.balance),
    equity: toFiniteNumber(payload.equity),
    openPnl: toFiniteNumber(payload.floatingPnl ?? payload.openPnl),
    closedPnl: toFiniteNumber(payload.closedPnl),
    totalPnl: toFiniteNumber(payload.totalPnl ?? payload.pnl),
    openPositionsCount: toFiniteNumber(payload.openPositionsCount, positions.length),
    tradesCount: trades.length,
    historyCount: history.length,
    positionsCount: positions.length,
    lastHistoryValue: toFiniteNumber(lastHistoryPoint.value ?? lastHistoryPoint.equity ?? lastHistoryPoint.balance),
    riskStatus: payload.riskSnapshot?.status?.risk_status || "",
    dailyDd: toFiniteNumber(riskSummary.daily_drawdown_pct),
    peakDd: toFiniteNumber(riskSummary.peak_to_equity_drawdown_pct),
  });
}

function chooseMostReliablePayload(...candidates) {
  const validCandidates = candidates
    .filter((candidate) => candidate && typeof candidate === "object")
    .map((candidate) => ({
      payload: candidate,
      score: payloadQualityScore(candidate),
      timestamp: payloadTimestamp(candidate),
    }));
  if (!validCandidates.length) return {};
  validCandidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return String(right.timestamp).localeCompare(String(left.timestamp));
  });
  return validCandidates[0]?.payload || {};
}

function buildAuthHeaders(state) {
  const headers = { Accept: "application/json" };
  if (state?.auth?.status !== "authenticated") return headers;
  const token = state?.auth?.session?.accessToken;
  const email = state?.auth?.user?.email;
  const userId = state?.auth?.user?.id;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (email) headers["X-KMFX-User-Email"] = email;
  if (userId) headers["X-KMFX-User-Id"] = userId;
  return headers;
}

function authContext(state = {}) {
  const auth = state.auth || {};
  const userId = String(auth.user?.id || "").trim().toLowerCase();
  return {
    isAuthenticated: auth.status === "authenticated",
    userId,
    email: String(auth.user?.email || "").trim().toLowerCase(),
    isAdmin: isAdminUserId(userId),
    hasToken: Boolean(auth.session?.accessToken),
  };
}

function liveAccessSignature(state = {}) {
  const auth = authContext(state);
  return JSON.stringify({
    isAuthenticated: auth.isAuthenticated,
    userId: auth.userId,
    email: auth.email,
    isAdmin: auth.isAdmin,
    hasToken: auth.hasToken,
  });
}

function hasLiveAccountAccess(state = {}) {
  const auth = authContext(state);
  return auth.isAuthenticated && Boolean(auth.email) && (auth.hasToken || isLocalRuntime());
}

function isAccountOwnedByAuth(account = {}, state = {}, snapshot = {}) {
  const auth = authContext(state);
  if (!auth.isAuthenticated || !auth.email) return false;
  const accountUserId = String(account.userId || account.user_id || "").trim().toLowerCase();
  const snapshotUserId = String(snapshot.user_id || snapshot.scope_user_id || "").trim().toLowerCase();
  const isAdminSnapshot = Boolean(snapshot.is_admin) || auth.isAdmin;

  if (accountUserId && (accountUserId === auth.userId || accountUserId === auth.email)) return true;
  if (!accountUserId && snapshotUserId && (snapshotUserId === auth.userId || snapshotUserId === auth.email)) return true;

  // Temporary bridge: legacy launcher/live accounts stored under "local" remain admin-only
  // until the launcher can attach explicit per-user account ownership metadata.
  if ((accountUserId === "local" || snapshotUserId === "local") && isAdminSnapshot) return true;
  return false;
}

function resolveSafeCurrentAccount(accounts = {}, preferred = "") {
  if (preferred && accounts[preferred] && accounts[preferred]?.sourceType !== "mt5") return preferred;
  if (accounts.sandbox) return "sandbox";
  return Object.keys(accounts).find((accountId) => accounts[accountId]?.sourceType !== "mt5") || Object.keys(accounts)[0] || null;
}

function clearLiveAccounts(store, reason = "unauthorized") {
  store.setState((state) => {
    const nextAccounts = Object.fromEntries(
      Object.entries(state.accounts || {}).filter(([, account]) => account?.sourceType !== "mt5")
    );
    const nextCurrentAccount = resolveSafeCurrentAccount(nextAccounts, state.currentAccount);
    return {
      ...state,
      accounts: nextAccounts,
      accountDirectory: {},
      managedAccounts: [],
      liveAccountIds: [],
      activeLiveAccountId: null,
      activeAccountId: null,
      mode: "mock",
      bootResolved: true,
      currentAccount: nextCurrentAccount,
      lastLiveAccountIsolationReason: reason,
    };
  });
}

function applyAdminAccess(store, isAdmin) {
  if (typeof isAdmin !== "boolean") return;
  store.setState((state) => {
    if (state.auth?.user?.is_admin === isAdmin && state.auth?.user?.role === (isAdmin ? "admin" : "user")) {
      return state;
    }
    return {
      ...state,
      auth: {
        ...(state.auth || {}),
        user: {
          ...(state.auth?.user || {}),
          is_admin: isAdmin,
          role: isAdmin ? "admin" : "user",
        },
      },
    };
  });
}

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
  const dashboardPayload = chooseMostReliablePayload(
    safe.dashboard_payload,
    safe.dashboardPayload,
    safe.latest_payload,
    safe.payload
  );
  return {
    accountId: String(safe.account_id || safe.id || ""),
    userId: String(safe.user_id || safe.owner_user_id || ""),
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
    dashboardPayload,
    payloadSignature: payloadSignature(dashboardPayload),
  };
}

function mergeLiveAccounts(store, snapshot) {
  const state = store.getState();
  if (!hasLiveAccountAccess(state)) {
    console.warn("[KMFX][ACCOUNTS] live snapshot blocked", {
      reason: "missing_authenticated_user",
      status: state.auth?.status || "unknown",
    });
    clearLiveAccounts(store, "missing_authenticated_user");
    return;
  }

  const normalizedAccounts = Array.isArray(snapshot?.accounts)
    ? snapshot.accounts
      .map(normalizeAccountEntry)
      .filter((account) => isAccountOwnedByAuth(account, state, snapshot))
    : [];
  const blockedCount = Array.isArray(snapshot?.accounts) ? snapshot.accounts.length - normalizedAccounts.length : 0;
  if (blockedCount > 0) {
    console.warn("[KMFX][ACCOUNTS] snapshot accounts blocked by ownership guard", {
      blockedCount,
      allowedCount: normalizedAccounts.length,
    });
  }
  if (!normalizedAccounts.length) {
    clearLiveAccounts(store, blockedCount > 0 ? "ownership_mismatch" : "empty_snapshot");
    return;
  }
  console.log("[KMFX][ACCOUNTS] merge snapshot", {
    count: normalizedAccounts.length,
    activeAccountId: snapshot?.active_account_id || "",
    accounts: normalizedAccounts.map((account) => ({
      accountId: account.accountId,
      login: account.login ? "[redacted]" : "",
      broker: account.broker,
      userId: account.userId,
      status: account.status,
      payloadSource: account.dashboardPayload?.payloadSource || "",
      balance: account.dashboardPayload?.balance ?? null,
      equity: account.dashboardPayload?.equity ?? null,
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
    const previousAccount = nextAccounts[accountEntry.accountId];
    const previousPayload = previousAccount?.dashboardPayload && typeof previousAccount.dashboardPayload === "object"
      ? previousAccount.dashboardPayload
      : {};
    const resolvedPayload = chooseMostReliablePayload(accountEntry.dashboardPayload, previousPayload);
    const liveRecord = adaptMt5Account({
      ...accountEntry,
      account_id: accountEntry.accountId,
      dashboard_payload: resolvedPayload,
      latest_payload: resolvedPayload,
    });
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
    selectedLogin: selectedAccount?.login ? "[redacted]" : "",
    broker: selectedAccount?.broker || "",
    sourceType: "mt5",
  });
  console.info("[KMFX][ACCOUNT_CANONICAL]", {
    account_id: selectedAccount?.accountId || resolvedCurrentAccount || "",
    login: selectedAccount?.login ? "[redacted]" : "",
    broker: selectedAccount?.broker || "",
    payloadSource: selectedAccount?.dashboardPayload?.payloadSource || "",
  });

  const sameLiveIds = liveAccountIds.length === (state.liveAccountIds || []).length
    && liveAccountIds.every((accountId, index) => accountId === state.liveAccountIds[index]);
  const sameActive = (activeAccountId || null) === (state.activeLiveAccountId || null);
  const sameCurrent = (resolvedCurrentAccount || null) === (state.currentAccount || null);
  const sameDirectory = normalizedAccounts.every((account) => {
    const previous = state.accountDirectory?.[account.accountId];
    return previous
      && previous.status === account.status
      && previous.displayName === account.displayName;
  }) && Object.keys(state.accountDirectory || {}).length === normalizedAccounts.length;
  const samePayloads = normalizedAccounts.every((account) => {
    const previous = state.accountDirectory?.[account.accountId];
    return previous && previous.payloadSignature === account.payloadSignature;
  });

  if (sameLiveIds && sameActive && sameCurrent && sameDirectory && samePayloads) {
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
      login: selectedAccount.login ? "[redacted]" : "",
    });
    console.info("[KMFX][LIVE_ACCOUNT_SELECTED]", {
      account_id: selectedAccount.accountId,
      login: selectedAccount.login ? "[redacted]" : "",
      broker: selectedAccount.broker || "",
      payloadSource: selectedAccount.dashboardPayload?.payloadSource || "",
    });
  }
}

export function initAccountsLiveSnapshot(store) {
  let socket = null;
  let reconnectTimer = null;
  let httpPollTimer = null;

  const clearHttpPollTimer = () => {
    clearTimeout(httpPollTimer);
    httpPollTimer = null;
  };

  const getActiveOpenPositionsCount = () => {
    const state = store.getState();
    const currentAccountId = state?.currentAccount || state?.activeLiveAccountId || state?.activeAccountId || "";
    const currentAccount = currentAccountId ? state?.accounts?.[currentAccountId] : null;
    const explicitCount = Number(currentAccount?.account?.openPositionsCount);
    if (Number.isFinite(explicitCount)) return explicitCount;
    const payloadCount = Number(currentAccount?.dashboardPayload?.openPositionsCount);
    if (Number.isFinite(payloadCount)) return payloadCount;
    if (Array.isArray(currentAccount?.positions)) return currentAccount.positions.length;
    if (Array.isArray(currentAccount?.dashboardPayload?.positions)) return currentAccount.dashboardPayload.positions.length;
    return 0;
  };

  const getHttpPollIntervalMs = () => {
    const hasOpenPositions = getActiveOpenPositionsCount() > 0;
    if (isLocalRuntime()) return hasOpenPositions ? 1000 : 5000;
    return hasOpenPositions ? 3000 : 15000;
  };

  const scheduleNextHttpPoll = () => {
    clearHttpPollTimer();
    const intervalMs = getHttpPollIntervalMs();
    console.info("[KMFX][ACCOUNTS]", {
      label: "http-poll-config",
      intervalMs,
      mode: isLocalRuntime() ? "local" : "production",
      hasOpenPositions: getActiveOpenPositionsCount() > 0,
    });
    httpPollTimer = window.setTimeout(async () => {
      await pollHttpSnapshot();
      scheduleNextHttpPoll();
    }, intervalMs);
  };

  const pollHttpSnapshot = async () => {
    const url = resolveAccountsSnapshotUrl();
    if (!hasLiveAccountAccess(store.getState())) {
      clearLiveAccounts(store, "missing_authenticated_user");
      return { ok: false, count: 0, reason: "missing_authenticated_user" };
    }
    if (!url) {
      console.info("[KMFX][API]", {
        label: "snapshot-fetch-disabled",
        reason: "missing_api_base_url",
      });
      clearLiveAccounts(store, "missing_api_base_url");
      return { ok: false, count: 0 };
    }
    try {
      const response = await fetch(url, { headers: buildAuthHeaders(store.getState()) });
      if (!response.ok) {
        console.warn("[KMFX][ACCOUNTS] http snapshot failed", response.status, url);
        clearLiveAccounts(store, `http_${response.status}`);
        return { ok: false, count: 0, status: response.status };
      }
      const payload = await response.json();
      applyAdminAccess(store, payload?.is_admin);
      console.log("[KMFX][ACCOUNTS] http snapshot received", {
        count: Array.isArray(payload?.accounts) ? payload.accounts.length : 0,
        activeAccountId: payload?.active_account_id || "",
      });
      if (!payload || !Array.isArray(payload.accounts)) {
        clearLiveAccounts(store, "invalid_snapshot");
        return { ok: false, count: 0 };
      }
      if (!payload.accounts.length) {
        clearLiveAccounts(store, "empty_snapshot");
        return { ok: true, count: 0, selectedAccountId: "" };
      }
      mergeLiveAccounts(store, payload);
      const nextState = store.getState();
      return {
        ok: true,
        count: Array.isArray(nextState.liveAccountIds) ? nextState.liveAccountIds.length : 0,
        selectedAccountId: nextState.currentAccount || "",
      };
    } catch (error) {
      console.warn("[KMFX][ACCOUNTS] http snapshot error", error);
      clearLiveAccounts(store, "http_error");
      return { ok: false, count: 0, error: true };
    }
  };

  const startHttpPolling = () => {
    scheduleNextHttpPoll();
  };

  const closeSocket = () => {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    const currentSocket = socket;
    socket = null;
    if (!currentSocket) return;
    try {
      currentSocket.close();
    } catch {
      // noop
    }
  };

  const connect = () => {
    if (!hasLiveAccountAccess(store.getState())) {
      console.info("[KMFX][BOOT]", {
        label: "accounts-ws-blocked",
        reason: "missing_authenticated_user",
      });
      return;
    }
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (socket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(socket.readyState)) return;
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
      if (hasLiveAccountAccess(store.getState())) {
        reconnectTimer = window.setTimeout(connect, 3000);
      }
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
      if (hasLiveAccountAccess(store.getState())) {
        reconnectTimer = window.setTimeout(connect, 3000);
      }
    });

    socket.addEventListener("error", () => {
      try {
        socket?.close();
      } catch {
        // noop
      }
    });
  };

  const refreshLiveAccounts = async (reason = "manual") => {
    console.info("[KMFX][ACCOUNTS]", {
      label: "live-refresh",
      reason,
    });
    const result = await pollHttpSnapshot();
    if (hasLiveAccountAccess(store.getState())) {
      connect();
    } else {
      closeSocket();
    }
    return result;
  };

  const initialSnapshotPromise = refreshLiveAccounts("initial");
  startHttpPolling();
  let lastAccessSignature = liveAccessSignature(store.getState());
  store.subscribe((state) => {
    const nextAccessSignature = liveAccessSignature(state);
    if (nextAccessSignature === lastAccessSignature) return;
    lastAccessSignature = nextAccessSignature;
    if (hasLiveAccountAccess(state)) {
      refreshLiveAccounts("auth_context_changed");
      return;
    }
    closeSocket();
    clearLiveAccounts(store, "missing_authenticated_user");
  });
  return initialSnapshotPromise;
}
