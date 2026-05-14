import { adaptMt5Account } from "../data/adapters/mt5-account-adapter.js?v=build-20260514-093300";
import { evaluateCompliance } from "./account-runtime.js?v=build-20260514-093300";
import { resolveAccountsSnapshotUrl } from "./api-config.js?v=build-20260514-093300";
import { isAdminMode } from "./admin-mode.js?v=build-20260514-093300";

const EMPTY_SNAPSHOT_GRACE_MS = 90000;
const PRODUCTION_FULL_SNAPSHOT_REFRESH_MS_ACTIVE = 15 * 60 * 1000;
const PRODUCTION_FULL_SNAPSHOT_REFRESH_MS_IDLE = 60 * 60 * 1000;
const PRODUCTION_FULL_SNAPSHOT_REFRESH_MS_HIDDEN = 2 * 60 * 60 * 1000;
const LOCAL_FULL_SNAPSHOT_REFRESH_MS = 60 * 1000;

function isLocalRuntime() {
  const hostname = window.location.hostname || "";
  return window.location.protocol === "file:" || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isDocumentHidden() {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function resolveAccountsHttpPollIntervalMs({ isLocal = false, hasOpenPositions = false, isHidden = false } = {}) {
  if (isHidden) return isLocal ? 15000 : 5 * 60 * 1000;
  if (isLocal) return hasOpenPositions ? 1000 : 5000;
  return hasOpenPositions ? 20000 : 120000;
}

function resolveAccountsFullSnapshotRefreshMs({ isLocal = false, hasOpenPositions = false, isHidden = false } = {}) {
  if (isLocal) return LOCAL_FULL_SNAPSHOT_REFRESH_MS;
  if (isHidden) return PRODUCTION_FULL_SNAPSHOT_REFRESH_MS_HIDDEN;
  return hasOpenPositions ? PRODUCTION_FULL_SNAPSHOT_REFRESH_MS_ACTIVE : PRODUCTION_FULL_SNAPSHOT_REFRESH_MS_IDLE;
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

function mergeSummaryPayloadWithPrevious(summaryPayload = {}, previousPayload = {}) {
  const summary = summaryPayload && typeof summaryPayload === "object" ? summaryPayload : {};
  const previous = previousPayload && typeof previousPayload === "object" ? previousPayload : {};
  const merged = {
    ...previous,
    ...summary,
    payloadShape: "full-with-summary-refresh",
  };
  if (previous.account || summary.account) {
    merged.account = {
      ...(previous.account && typeof previous.account === "object" ? previous.account : {}),
      ...(summary.account && typeof summary.account === "object" ? summary.account : {}),
    };
  }
  if (previous.riskSnapshot || summary.riskSnapshot) {
    const previousRisk = previous.riskSnapshot && typeof previous.riskSnapshot === "object" ? previous.riskSnapshot : {};
    const summaryRisk = summary.riskSnapshot && typeof summary.riskSnapshot === "object" ? summary.riskSnapshot : {};
    merged.riskSnapshot = {
      ...previousRisk,
      ...summaryRisk,
      summary: {
        ...(previousRisk.summary && typeof previousRisk.summary === "object" ? previousRisk.summary : {}),
        ...(summaryRisk.summary && typeof summaryRisk.summary === "object" ? summaryRisk.summary : {}),
      },
      status: {
        ...(previousRisk.status && typeof previousRisk.status === "object" ? previousRisk.status : {}),
        ...(summaryRisk.status && typeof summaryRisk.status === "object" ? summaryRisk.status : {}),
      },
    };
  }
  ["trades", "history", "journalEntries", "symbolSpecs", "executions"].forEach((key) => {
    if (!Array.isArray(summary[key]) && Array.isArray(previous[key])) {
      merged[key] = previous[key];
    }
  });
  if (!Array.isArray(summary.positions) && Array.isArray(previous.positions)) {
    merged.positions = previous.positions;
  }
  return merged;
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
    isAdmin: isAdminMode(state),
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
  if (!(auth.isAuthenticated && Boolean(auth.email) && (auth.hasToken || isLocalRuntime()))) {
    return false;
  }
  if (auth.isAdmin) return true;
  const billing = state.billing && typeof state.billing === "object" ? state.billing : null;
  const billingLoaded = Boolean(billing?.loadedAt || (billing?.source && billing.source !== "initial"));
  if (!billingLoaded || billing?.loading) return false;
  const access = String(billing?.billing?.access || "").toLowerCase();
  if (access === "restricted" || access === "billing_attention") return false;
  return billing?.entitlements?.launcherConnection === true;
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

function keepLiveAccountsDuringTransientSnapshotFailure(store, reason = "http_error") {
  const state = store.getState();
  if (!Array.isArray(state.liveAccountIds) || !state.liveAccountIds.length) return false;
  store.setState((current) => ({
    ...current,
    bootResolved: true,
    lastLiveAccountIsolationReason: reason,
  }));
  return true;
}

function applyAdminAccess(store, isAdmin) {
  if (typeof isAdmin !== "boolean") return;
  store.setState((state) => {
    const effectiveAdmin = isAdmin === true && isAdminMode(state);
    if (state.auth?.user?.is_admin === effectiveAdmin && state.auth?.user?.role === (effectiveAdmin ? "admin" : "user")) {
      return state;
    }
    return {
      ...state,
      auth: {
        ...(state.auth || {}),
        user: {
          ...(state.auth?.user || {}),
          is_admin: effectiveAdmin,
          role: effectiveAdmin ? "admin" : "user",
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
    snapshotPayloadShape: String(safe.snapshot_payload_shape || safe.snapshotPayloadShape || snapshotModeFromPayload(dashboardPayload)),
  };
}

function snapshotModeFromPayload(payload = {}) {
  const shape = String(payload?.payloadShape || payload?.snapshot_payload_shape || "").toLowerCase();
  return shape === "summary" ? "summary" : "full";
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
    const resolvedPayload = accountEntry.snapshotPayloadShape === "summary"
      ? mergeSummaryPayloadWithPrevious(accountEntry.dashboardPayload, previousPayload)
      : chooseMostReliablePayload(accountEntry.dashboardPayload, previousPayload);
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
  let lastNonEmptyHttpSnapshotAt = 0;
  let lastFullHttpSnapshotAt = 0;

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
    return resolveAccountsHttpPollIntervalMs({
      isLocal: isLocalRuntime(),
      hasOpenPositions,
      isHidden: isDocumentHidden(),
    });
  };

  const getFullSnapshotRefreshMs = () =>
    resolveAccountsFullSnapshotRefreshMs({
      isLocal: isLocalRuntime(),
      hasOpenPositions: getActiveOpenPositionsCount() > 0,
      isHidden: isDocumentHidden(),
    });

  const shouldUseFullSnapshot = () => {
    if (!lastFullHttpSnapshotAt) return true;
    return Date.now() - lastFullHttpSnapshotAt >= getFullSnapshotRefreshMs();
  };

  const scheduleNextHttpPoll = () => {
    clearHttpPollTimer();
    const intervalMs = getHttpPollIntervalMs();
    console.info("[KMFX][ACCOUNTS]", {
      label: "http-poll-config",
      intervalMs,
      mode: isLocalRuntime() ? "local" : "production",
      hasOpenPositions: getActiveOpenPositionsCount() > 0,
      isHidden: isDocumentHidden(),
    });
    httpPollTimer = window.setTimeout(async () => {
      await pollHttpSnapshot({ view: shouldUseFullSnapshot() ? "full" : "summary" });
      scheduleNextHttpPoll();
    }, intervalMs);
  };

  const pollHttpSnapshot = async ({ view = "full" } = {}) => {
    const normalizedView = String(view || "full").toLowerCase() === "summary" ? "summary" : "full";
    const url = resolveAccountsSnapshotUrl({ view: normalizedView });
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
        if (![401, 403].includes(response.status) && keepLiveAccountsDuringTransientSnapshotFailure(store, `http_${response.status}`)) {
          return { ok: false, count: (store.getState().liveAccountIds || []).length, status: response.status, retained: true };
        }
        clearLiveAccounts(store, `http_${response.status}`);
        return { ok: false, count: 0, status: response.status };
      }
      const payload = await response.json();
      if (normalizedView === "full") {
        lastFullHttpSnapshotAt = Date.now();
      }
      applyAdminAccess(store, payload?.is_admin);
      console.log("[KMFX][ACCOUNTS] http snapshot received", {
        count: Array.isArray(payload?.accounts) ? payload.accounts.length : 0,
        activeAccountId: payload?.active_account_id || "",
        view: payload?.snapshot_mode || normalizedView,
      });
      if (!payload || !Array.isArray(payload.accounts)) {
        clearLiveAccounts(store, "invalid_snapshot");
        return { ok: false, count: 0 };
      }
      if (!payload.accounts.length) {
        const hasCurrentLiveAccounts = Array.isArray(store.getState().liveAccountIds) && store.getState().liveAccountIds.length > 0;
        const withinEmptyGrace = lastNonEmptyHttpSnapshotAt > 0 && Date.now() - lastNonEmptyHttpSnapshotAt <= EMPTY_SNAPSHOT_GRACE_MS;
        if (hasCurrentLiveAccounts && withinEmptyGrace && keepLiveAccountsDuringTransientSnapshotFailure(store, "empty_snapshot_grace")) {
          return { ok: false, count: (store.getState().liveAccountIds || []).length, selectedAccountId: store.getState().currentAccount || "", retained: true, reason: "empty_snapshot_grace" };
        }
        clearLiveAccounts(store, "empty_snapshot");
        return { ok: true, count: 0, selectedAccountId: "" };
      }
      lastNonEmptyHttpSnapshotAt = Date.now();
      mergeLiveAccounts(store, payload);
      const nextState = store.getState();
      return {
        ok: true,
        count: Array.isArray(nextState.liveAccountIds) ? nextState.liveAccountIds.length : 0,
        selectedAccountId: nextState.currentAccount || "",
      };
    } catch (error) {
      console.warn("[KMFX][ACCOUNTS] http snapshot error", error);
      if (keepLiveAccountsDuringTransientSnapshotFailure(store, "http_error")) {
        return { ok: false, count: (store.getState().liveAccountIds || []).length, error: true, retained: true };
      }
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
    const result = await pollHttpSnapshot({ view: "full" });
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
