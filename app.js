import { createStore } from "./js/modules/store.js?v=build-20260514-013000";
import { initNavigation } from "./js/modules/navigation.js?v=build-20260514-013000";
import { renderDashboard } from "./js/modules/dashboard.js?v=build-20260514-013000";
import { renderAnalytics } from "./js/modules/analytics.js?v=build-20260514-013000";
import { loadPostTradeTags, openPostTradeModal, renderDiscipline } from "./js/modules/discipline.js?v=build-20260514-013000";
import { renderRisk } from "./js/modules/risk.js?v=build-20260514-013000";
import { renderTrades } from "./js/modules/trades.js?v=build-20260514-013000";
import { renderCalendar } from "./js/modules/calendar.js?v=build-20260514-013000";
import { initAccountsUI } from "./js/modules/accounts-ui.js?v=build-20260514-013000";
import { initAccountsLiveSnapshot } from "./js/modules/accounts-live-snapshot.js?v=build-20260514-013000";
import { initConnections, renderConnections } from "./js/modules/connections.js?v=build-20260514-013000";
import { initCalculator, renderCalculator } from "./js/modules/calculator.js?v=build-20260514-013000";
import { initJournal, renderJournal } from "./js/modules/journal.js?v=build-20260514-013000";
import { initStrategies, renderStrategies } from "./js/modules/strategies.js?v=build-20260514-013000";
import { initFunded, renderFunded } from "./js/modules/funded.js?v=build-20260514-013000";
import { renderMarket } from "./js/modules/market.js?v=build-20260514-013000";
import { renderPortfolio } from "./js/modules/portfolio.js?v=build-20260514-013000";
import { renderGlossary } from "./js/modules/glossary.js?v=build-20260514-013000";
import { renderDebug } from "./js/modules/debug.js?v=build-20260514-013000";
import { initPullToRefresh } from "./js/modules/pull-to-refresh.js?v=build-20260514-013000";
import { closeModal, openModal } from "./js/modules/modal-system.js?v=build-20260514-013000";
import { initAccountRuntime } from "./js/modules/account-runtime.js?v=build-20260514-013000";
import { initTopbarStatus } from "./js/modules/topbar-status.js?v=build-20260514-013000";
import { initSidebarUI } from "./js/modules/sidebar-ui.js?v=build-20260514-013000";
import { initSidebarVNext } from "./js/modules/sidebar-vnext.js?v=build-20260514-013000";
import { initConnectionWizard } from "./js/modules/connection-wizard.js?v=build-20260514-013000";
import { PAUSED_SUBSCRIPTION_COPY, PAUSED_SUBSCRIPTION_CTA, hasBillingEntitlement, initBillingStatus, isBillingPaused, isEffectiveBillingAdmin, refreshBillingStatus, selectBillingStatus } from "./js/modules/billing-status.js?v=build-20260514-013000";
import { isAdminMode } from "./js/modules/admin-mode.js?v=build-20260514-013000";
import { initAuthUI } from "./js/modules/auth-ui.js?v=build-20260514-013000";
import { analyticsTabForPage, pageFromLocation, parentPageForPage } from "./js/modules/route-map.js?v=build-20260514-013000";
import {
  DEFAULT_AUTH_PROFILE,
  DEFAULT_AUTH_USER,
  initAuthSession,
  mergeAuthProfile,
  persistAuthState,
  selectVisibleUserProfile
} from "./js/modules/auth-session.js?v=build-20260514-013000";
import { applyAvatarContent } from "./js/modules/avatar-utils.js?v=build-20260514-013000";
import {
  DEFAULT_SETTINGS_PREFERENCES,
  fetchSupabaseUserConfig,
  mergeRemoteConfigIntoAuth,
  mergeRemoteConfigIntoPreferences,
  persistLocalPreferences,
  readLocalPreferences,
  saveSupabaseUserConfig
} from "./js/modules/supabase-user-config.js?v=build-20260514-013000";
import { resolveActiveAccountId, selectCurrentAccount, selectCurrentModel } from "./js/modules/utils.js?v=build-20260514-013000";
import {
  resolveAccountsRegistryUrl,
  resolveAccountsSnapshotUrl,
  resolveApiBaseUrl,
  resolveBillingCheckoutUrl,
  resolveBillingPortalUrl,
  resolveBillingStatusUrl
} from "./js/modules/api-config.js?v=build-20260514-013000";

const BUILD_TAG = "build-20260514-013000";
window.__KMFX_BUILD__ = BUILD_TAG;

const store = createStore();
const POST_TRADE_PORTAL_ID = "kmfx-posttrade-portal";
const postTradeAutoPromptState = {
  seededAccounts: new Set(),
  seenTradeIdsByAccount: new Map()
};

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function ensureLightCardFlattening() {
  const styleId = "light-card-flatten-runtime";
  let style = document.getElementById(styleId);
  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    document.head.appendChild(style);
  }
  style.textContent = `
    html:not([data-theme="dark"]) .tl-section-card:has(.account-hero-card),
    html:not([data-theme="dark"]) .tl-section-card:has(.portfolio-account-card),
    html:not([data-theme="dark"]) .tl-section-card:has(.calendar-grid),
    html:not([data-theme="dark"]) .tl-section-card:has(.calendar-week-summary) {
      background: #ffffff !important;
      background-image: none !important;
      box-shadow: none !important;
      filter: none !important;
    }

    html:not([data-theme="dark"]) .account-hero-card,
    html:not([data-theme="dark"]) .account-hero-card:hover,
    html:not([data-theme="dark"]) .account-hero-card.active,
    html:not([data-theme="dark"]) .portfolio-account-card,
    html:not([data-theme="dark"]) .portfolio-account-card:hover,
    html:not([data-theme="dark"]) .portfolio-account-card.active {
      transform: none !important;
      box-shadow: none !important;
      filter: none !important;
    }

    html:not([data-theme="dark"]) .calendar-cell:not(.win):not(.loss),
    html:not([data-theme="dark"]) .calendar-week-summary,
    html:not([data-theme="dark"]) .calendar-cell:hover,
    html:not([data-theme="dark"]) .calendar-cell:hover:not(:disabled),
    html:not([data-theme="dark"]) .calendar-week-summary:hover {
      transform: none !important;
      background: #ffffff !important;
      background-image: none !important;
      box-shadow: none !important;
      filter: none !important;
    }

    html:not([data-theme="dark"]) .calendar-cell.win,
    html:not([data-theme="dark"]) .calendar-cell.win:hover,
    html:not([data-theme="dark"]) .calendar-cell.win:hover:not(:disabled) {
      transform: none !important;
      background: var(--green-bg) !important;
      border-color: var(--green-border) !important;
      box-shadow: none !important;
      filter: none !important;
    }

    html:not([data-theme="dark"]) .calendar-cell.loss,
    html:not([data-theme="dark"]) .calendar-cell.loss:hover,
    html:not([data-theme="dark"]) .calendar-cell.loss:hover:not(:disabled) {
      transform: none !important;
      background: var(--red-bg) !important;
      border-color: var(--red-border) !important;
      box-shadow: none !important;
      filter: none !important;
    }
  `;
}
const pageRenderers = {
  dashboard: (state) => renderDashboard(document.getElementById("dashboardRoot"), state),
  analytics: (state) => renderAnalytics(document.getElementById("analyticsRoot"), state),
  discipline: (state) => renderDiscipline(document.getElementById("disciplineRoot"), state),
  risk: (state) => renderRisk(document.getElementById("riskRoot"), state),
  trades: (state) => renderTrades(document.getElementById("tradesRoot"), state),
  calendar: (state) => renderCalendar(document.getElementById("calendarRoot"), state),
  connections: (state) => renderConnections(document.getElementById("connectionsRoot"), state),
  calculator: (state) => renderCalculator(document.getElementById("calculatorRoot"), state),
  journal: (state) => renderJournal(document.getElementById("journalRoot"), state),
  strategies: (state) => renderStrategies(document.getElementById("strategiesRoot"), state),
  funded: (state) => renderFunded(document.getElementById("fundedRoot"), state),
  market: (state) => renderMarket(document.getElementById("marketRoot"), state),
  portfolio: (state) => renderPortfolio(document.getElementById("portfolioRoot"), state),
  glossary: (state) => renderGlossary(document.getElementById("glossaryRoot"), state),
  debug: (state) => renderDebug(document.getElementById("debugRoot"), state),
  settings: () => {}
};

function resolveKnownAccountId(candidateId, state) {
  const liveIds = Array.isArray(state?.liveAccountIds) ? state.liveAccountIds : [];
  const currentAccount = state?.currentAccount;
  const activeLiveAccountId = state?.activeLiveAccountId;

  if (liveIds.length > 0) {
    if (candidateId && liveIds.includes(candidateId) && state?.accounts?.[candidateId]) return candidateId;
    if (currentAccount && liveIds.includes(currentAccount) && state?.accounts?.[currentAccount]) return currentAccount;
    if (activeLiveAccountId && liveIds.includes(activeLiveAccountId) && state?.accounts?.[activeLiveAccountId]) return activeLiveAccountId;
    return liveIds[0] || null;
  }

  if (candidateId && state?.accounts?.[candidateId]) {
    return candidateId;
  }
  return resolveActiveAccountId(state);
}

function logBootState(label, state = store.getState(), extra = {}) {
  console.info("[KMFX][BOOT]", {
    label,
    build: BUILD_TAG,
    mode: state.mode || (Array.isArray(state.liveAccountIds) && state.liveAccountIds.length > 0 ? "live" : "mock"),
    currentAccount: state.currentAccount,
    activeLiveAccountId: state.activeLiveAccountId || null,
    activeAccountId: state.activeAccountId || null,
    liveAccountIds: state.liveAccountIds || [],
    bootResolved: Boolean(state.bootResolved),
    ...extra,
  });
}

function canUseDebugPage(state) {
  return isAdminMode(state) || hasBillingEntitlement(state, "rawBridgeDebug", { allowLimited: false });
}

function renderActivePage() {
  const state = store.getState();
  const activePanelPage = parentPageForPage(state.ui.activePage);
  if (activePanelPage === "debug" && !canUseDebugPage(state)) {
    store.setState((current) => ({
      ...current,
      ui: {
        ...current.ui,
        activePage: "dashboard"
      }
    }));
    return;
  }
  const renderer = pageRenderers[state.ui.activePage] || pageRenderers[activePanelPage];
  renderer?.(state);
}

function applyInitialRouteState() {
  const routedPage = pageFromLocation(window.location);
  if (!routedPage || routedPage === store.getState().ui.activePage) return;
  const routedAnalyticsTab = analyticsTabForPage(routedPage);
  store.setState((state) => ({
    ...state,
    ui: {
      ...state.ui,
      activePage: routedPage,
      ...(routedAnalyticsTab ? { analyticsTab: routedAnalyticsTab } : {})
    }
  }));
}

function openPostTradeTagFromIntent(trade) {
  if (!trade) return;
  const currentState = store.getState();
  const account = selectCurrentAccount(currentState);
  const model = selectCurrentModel(currentState);
  const target = ensurePostTradePortal();
  if (!target || !model) return;

  requestAnimationFrame(() => {
    openPostTradeModal(trade, {
      target,
      model,
      accountLogin: account?.login || "",
      accountId: account?.id || account?.account_id || currentState.activeAccountId || "",
      state: currentState,
      modalOnly: true
    });
  });
}

function initPostTradeTagBridge() {
  window.addEventListener("kmfx:open-post-trade-tag", (event) => {
    openPostTradeTagFromIntent(event.detail?.trade);
  });
}

function ensurePostTradePortal() {
  if (typeof document === "undefined") return null;
  let portal = document.getElementById(POST_TRADE_PORTAL_ID);
  if (!portal) {
    portal = document.createElement("div");
    portal.id = POST_TRADE_PORTAL_ID;
    portal.setAttribute("aria-live", "polite");
    document.body.appendChild(portal);
  }
  return portal;
}

function stablePostTradeKey(trade = {}) {
  const explicit = trade.id || trade.ticket || trade.ticketId || trade.dealId || trade.orderId || trade.positionId || trade.position_id;
  if (explicit) return String(explicit);
  return [
    trade.symbol || trade.pair || "trade",
    trade.direction || trade.side || trade.type || "",
    trade.closeTime || trade.close_time || trade.time || trade.date || trade.timestamp || "",
    trade.openTime || trade.open_time || "",
    trade.pnl ?? trade.profit ?? trade.net ?? "",
    trade.volume ?? ""
  ].join(":");
}

function postTradeTimestamp(trade = {}) {
  const raw = trade.when || trade.closeTime || trade.close_time || trade.time || trade.date || trade.timestamp;
  const parsed = raw instanceof Date ? raw : new Date(raw || 0);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
}

function isClosedTradeForPostReview(trade = {}) {
  if (!trade || typeof trade !== "object") return false;
  if (trade.isOpen === true || trade.status === "open") return false;
  return Boolean(trade.closeTime || trade.close_time || trade.time || trade.date || trade.when || trade.timestamp);
}

function seedSeenPostTrades(accountKey, trades = []) {
  const seen = postTradeAutoPromptState.seenTradeIdsByAccount.get(accountKey) || new Set();
  trades.filter(isClosedTradeForPostReview).forEach((trade) => {
    seen.add(stablePostTradeKey(trade));
  });
  postTradeAutoPromptState.seenTradeIdsByAccount.set(accountKey, seen);
  postTradeAutoPromptState.seededAccounts.add(accountKey);
}

function initPostTradeAutoPrompt() {
  store.subscribe((state) => {
    const account = selectCurrentAccount(state);
    const model = selectCurrentModel(state);
    const trades = Array.isArray(model?.trades) ? model.trades : [];
    const accountKey = String(account?.id || account?.login || state.activeAccountId || state.currentAccount || "active");
    if (!trades.length) return;
    if (!postTradeAutoPromptState.seededAccounts.has(accountKey)) {
      seedSeenPostTrades(accountKey, trades);
      return;
    }
    if (document.getElementById("kmfx-posttrade-modal")) return;

    const seen = postTradeAutoPromptState.seenTradeIdsByAccount.get(accountKey) || new Set();
    const tagMap = loadPostTradeTags();
    const reviewedIds = new Set(Object.keys(tagMap || {}));
    const newClosedTrades = trades
      .filter(isClosedTradeForPostReview)
      .filter((trade) => {
        const key = stablePostTradeKey(trade);
        if (seen.has(key) || reviewedIds.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => postTradeTimestamp(b) - postTradeTimestamp(a));

    postTradeAutoPromptState.seenTradeIdsByAccount.set(accountKey, seen);
    if (!newClosedTrades.length) return;
    openPostTradeTagFromIntent(newClosedTrades[0]);
  });
}

function startClock() {
  const tick = () => {
    const timeEl = document.getElementById("clock");
    const dateEl = document.getElementById("currentDate");
    const now = new Date();
    if (timeEl) {
      timeEl.textContent = now.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
    }
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString("es-ES", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
    }
  };
  tick();
  setInterval(tick, 1000);
}

function initSettings(authSession = null) {
  const defaultProfile = {
    name: DEFAULT_AUTH_USER.name,
    email: DEFAULT_AUTH_USER.email,
    discord: DEFAULT_AUTH_PROFILE.discord,
    initials: DEFAULT_AUTH_USER.initials,
    avatar: DEFAULT_AUTH_USER.avatar,
    defaultAccount: DEFAULT_AUTH_PROFILE.defaultAccount
  };
  const defaultPreferences = {
    ...DEFAULT_SETTINGS_PREFERENCES,
    theme: store.getState().ui.theme
  };
  const landingPages = [
    ["dashboard", "Panel"],
    ["calendar", "Calendario"],
    ["trades", "Operaciones"],
    ["strategies", "Estrategias"],
    ["analytics", "Análisis"],
    ["discipline", "Disciplina"],
    ["portfolio", "Portfolio"],
    ["funded", "Funded"],
    ["risk", "Riesgo"],
    ["calculator", "Calculadora"],
    ["connections", "Cuentas"],
    ["settings", "Ajustes"]
  ];
  const root = document.documentElement;
  const themeBadge = document.getElementById("themeBadge");
  const settingsStatus = document.querySelector("[data-settings-status]");
  const displayName = document.querySelector("[data-settings-display-name]");
  const avatar = document.querySelector("[data-settings-avatar]");
  const displayEmail = document.querySelector("[data-settings-display-email]");
  const displayAccount = document.querySelector("[data-settings-display-account]");
  const allSettingsFields = [...document.querySelectorAll("[data-settings-field]")];
  const profileKeys = new Set(Object.keys(defaultProfile));
  const accountSelects = [...document.querySelectorAll('[data-settings-field="defaultAccount"], [data-settings-field="dashboardAccount"]')];
  const landingPageSelect = document.querySelector('[data-settings-field="landingPage"]');
  const connectionStatus = document.querySelector("[data-settings-connection-status]");
  const connectionSource = document.querySelector("[data-settings-connection-source]");
  const connectionLastSync = document.querySelector("[data-settings-last-sync]");
  const connectionLastAccount = document.querySelector("[data-settings-last-account]");
  const sessionState = document.querySelector("[data-settings-session-state]");
  const sessionEmail = document.querySelector("[data-settings-session-email]");
  const signOutButton = document.querySelector("[data-settings-signout]");
  const billingBadge = document.querySelector("[data-settings-billing-badge]");
  const billingPlan = document.querySelector("[data-settings-billing-plan]");
  const billingStatus = document.querySelector("[data-settings-billing-status]");
  const billingPortalButton = document.querySelector("[data-billing-portal]");
  const billingCheckoutButtons = [...document.querySelectorAll("[data-billing-checkout]")];
  const settingsTabButtons = [...document.querySelectorAll("[data-settings-tab]")];
  const settingsPanels = [...document.querySelectorAll("[data-settings-panel]")];
  const themeSelect = document.querySelector('[data-settings-field="theme"]');
  const densitySelect = document.querySelector('[data-settings-field="density"]');

  const syncAdminUI = (state = store.getState()) => {
    const isAdmin = isAdminMode(state);
    document.documentElement.dataset.adminMode = isAdmin ? "true" : "false";
    const adminNodes = [...document.querySelectorAll("[data-admin-only]")];
    adminNodes.forEach((node) => {
      node.hidden = !isAdmin;
      node.setAttribute("aria-hidden", isAdmin ? "false" : "true");
    });
  };

  const readStoredProfile = () => {
    const visibleProfile = selectVisibleUserProfile(store.getState());
    return {
      ...defaultProfile,
      ...visibleProfile
    };
  };

  const readStoredPreferences = () => {
    return {
      ...defaultPreferences,
      ...readLocalPreferences()
    };
  };

  const populateSelect = (select, options, selectedValue) => {
    if (!select) return;
    select.innerHTML = options.map(([value, label]) => (
      `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(label)}</option>`
    )).join("");
  };

  const buildAccountOptions = () => {
    const state = store.getState();
    const liveIds = Array.isArray(state.liveAccountIds) ? state.liveAccountIds : [];
    const sourceAccounts = liveIds.length
      ? liveIds.map((id) => state.accounts[id]).filter(Boolean)
      : Object.values(state.accounts);
    return sourceAccounts.map((account) => [account.id, account.name]);
  };

  const renderProfilePreview = (profile) => {
    if (displayName) displayName.textContent = profile.name || defaultProfile.name;
    if (displayEmail) displayEmail.textContent = profile.email || defaultProfile.email;
    if (avatar) {
      const fallbackInitials = (profile.name || defaultProfile.name)
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("");
      applyAvatarContent(avatar, {
        avatarUrl: profile.avatar,
        initials: (profile.initials || fallbackInitials || "KM").slice(0, 3).toUpperCase(),
        name: profile.name || defaultProfile.name
      });
    }
    const selectedAccount = store.getState().accounts[profile.defaultAccount];
    if (displayAccount) {
      displayAccount.textContent = selectedAccount?.name || "Sin cuenta por defecto";
    }
  };

  const applyProfile = (profile) => {
    allSettingsFields.forEach((field) => {
      const key = field.dataset.settingsField;
      if (!key || !profileKeys.has(key)) return;
      if (field.type === "checkbox") {
        field.checked = Boolean(profile[key]);
      } else {
        field.value = profile[key] ?? "";
      }
    });
    renderProfilePreview(profile);
  };

  const applyPreferences = (preferences) => {
    allSettingsFields.forEach((field) => {
      const key = field.dataset.settingsField;
      if (!key || profileKeys.has(key)) return;
      if (!(key in defaultPreferences)) return;
      if (field.type === "checkbox") {
        field.checked = Boolean(preferences[key]);
      } else {
        field.value = preferences[key] ?? "";
      }
    });
    root.dataset.density = preferences.density || "comfortable";
    if (themeBadge) {
      themeBadge.textContent = preferences.theme === "dark" ? "Tema oscuro" : "Tema claro";
    }
  };

  const collectSettings = () => {
    const profile = { ...readStoredProfile() };
    const preferences = { ...readStoredPreferences() };
    allSettingsFields.forEach((field) => {
      const key = field.dataset.settingsField;
      if (!key) return;
      const value = field.type === "checkbox" ? field.checked : field.value;
      if (profileKeys.has(key)) profile[key] = value;
      if (key in defaultPreferences) preferences[key] = value;
    });
    preferences.dashboardAccount = profile.defaultAccount;
    return { profile, preferences };
  };

  const applyTheme = (theme) => {
    root.setAttribute("data-theme", theme);
    document.body?.setAttribute("data-theme", theme);
    ensureLightCardFlattening();
    if (themeBadge) {
      themeBadge.textContent = theme === "dark" ? "Tema oscuro" : "Tema claro";
    }
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      const buttonTheme = button.dataset.themeValue;
      const isActive = buttonTheme === theme;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-label", buttonTheme === "dark" ? "Cambiar a tema oscuro" : "Cambiar a tema claro");
      button.setAttribute("title", buttonTheme === "dark" ? "Cambiar a tema oscuro" : "Cambiar a tema claro");
    });
    if (themeSelect) themeSelect.value = theme;
  };

  const syncConnectionReadout = (state, accountIdOverride = null) => {
    const profile = readStoredProfile();
    const accountId = accountIdOverride || profile.defaultAccount || state.currentAccount;
    const account = state.accounts[accountId] || state.accounts[state.currentAccount];
    if (!account) return;
    const friendlyStatus = account.connection.isSyncing || account.connection.state === "connecting"
      ? "Sincronizando..."
      : account.connection.state === "connected"
        ? "Conectado"
        : account.connection.state === "error"
          ? "Error de conexión"
          : "Sin conexión";
    if (connectionStatus) connectionStatus.textContent = friendlyStatus;
    if (connectionSource) {
      connectionSource.textContent = isAdminMode(state)
        ? (account.connection.source || "Conexión avanzada")
        : "Estado general de sincronización";
    }
    if (connectionLastSync) {
      connectionLastSync.textContent = account.connection.lastSync
        ? new Date(account.connection.lastSync).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        : "—";
    }
    if (connectionLastAccount) connectionLastAccount.textContent = account.name || "Sin cuenta seleccionada";
  };

  const syncSessionReadout = (state = store.getState()) => {
    const auth = state.auth || {};
    const isAuthenticated = auth.status === "authenticated";
    if (sessionState) {
      sessionState.textContent = isAuthenticated ? "Sesión activa" : "Sin sesión activa";
    }
    if (sessionEmail) {
      sessionEmail.textContent = isAuthenticated
        ? (auth.user?.email || "Usuario autenticado")
        : "Sin usuario autenticado";
    }
    if (signOutButton) {
      signOutButton.disabled = !isAuthenticated;
      signOutButton.setAttribute("aria-disabled", isAuthenticated ? "false" : "true");
    }
  };

  const billingRequestHeaders = () => {
    const state = store.getState();
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    const token = state.auth?.session?.accessToken;
    const email = state.auth?.user?.email;
    const userId = state.auth?.user?.id;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (email) headers["X-KMFX-User-Email"] = email;
    if (userId) headers["X-KMFX-User-ID"] = userId;
    return headers;
  };

  const syncBillingReadout = (state = store.getState()) => {
    const billing = state.billing?.billing || {};
    const authReady = state.auth?.status === "authenticated";
    const displayName = billing.displayName || "Free / Demo";
    const status = String(billing.status || "").toLowerCase();
    const access = String(billing.access || "").toLowerCase();
    const statusCopy = !authReady
      ? "Inicia sesión para activar una suscripción."
      : access === "active"
        ? "Suscripción activa."
        : access === "billing_attention"
          ? "Pago pendiente de revisar."
          : access === "restricted"
            ? status === "paused"
              ? `${PAUSED_SUBSCRIPTION_CTA}. ${PAUSED_SUBSCRIPTION_COPY}`
              : "Acceso premium pausado."
            : status === "trialing"
              ? "Trial activo."
              : "Demo activo. Elige un plan para conectar MT5 live.";
    if (billingBadge) billingBadge.textContent = state.billing?.loading ? "Comprobando" : displayName;
    if (billingPlan) billingPlan.textContent = displayName;
    if (billingStatus) billingStatus.textContent = statusCopy;
    const disabled = !authReady || state.billing?.loading === true;
    billingCheckoutButtons.forEach((button) => {
      button.disabled = disabled;
      button.setAttribute("aria-disabled", disabled ? "true" : "false");
    });
    if (billingPortalButton) {
      const canOpenPortal = authReady && access !== "anonymous" && !state.billing?.loading;
      billingPortalButton.disabled = !canOpenPortal;
      billingPortalButton.setAttribute("aria-disabled", canOpenPortal ? "false" : "true");
    }
  };

  const activateSettingsTab = (tab) => {
    const nextTab = tab === "subscription" || tab === "referrals" ? tab : "general";
    settingsTabButtons.forEach((button) => {
      const active = button.dataset.settingsTab === nextTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    settingsPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.settingsPanel === nextTab);
    });
  };

  const billingReturnUrl = () => {
    const url = new URL(window.location.href);
    url.pathname = "/ajustes";
    url.search = "";
    url.searchParams.set("tab", "subscription");
    url.searchParams.set("billing", "portal-return");
    return url.toString();
  };

  const refreshBillingAfterReturn = async (reason = "checkout") => {
    const delays = [0, 1500, 4000, 8000];
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      const delay = delays[attempt];
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      const result = await refreshBillingStatus(store, { silent: attempt > 0 });
      syncBillingReadout(store.getState());
      const billing = result?.billing?.billing || store.getState().billing?.billing || {};
      const access = String(billing.access || "").toLowerCase();
      if (access === "active") {
        if (settingsStatus) settingsStatus.textContent = "Plan actualizado correctamente.";
        return;
      }
    }
    if (settingsStatus) {
      settingsStatus.textContent = reason === "portal"
        ? "Portal cerrado. Si acabas de cambiar el plan, KMFX lo actualizará en cuanto Stripe confirme el estado."
        : "Checkout completado. KMFX actualizará tu plan cuando Stripe confirme el webhook.";
    }
  };

  const syncCheckoutReturnState = () => {
    const params = new URLSearchParams(window.location.search || "");
    const checkoutState = String(params.get("checkout") || "").toLowerCase();
    const billingReturn = String(params.get("billing") || "").toLowerCase();
    const tab = String(params.get("tab") || "").toLowerCase();
    const path = String(window.location.pathname || "").toLowerCase();
    const wantsSubscription = tab === "subscription" || Boolean(checkoutState) || Boolean(billingReturn) || path.includes("/billing") || path.includes("/suscripcion");
    if (wantsSubscription) activateSettingsTab("subscription");
    if (billingReturn === "portal-return") {
      if (settingsStatus) settingsStatus.textContent = "Actualizando estado de suscripción...";
      void refreshBillingAfterReturn("portal");
      return;
    }
    if (!settingsStatus || !checkoutState) return;
    if (checkoutState === "success") {
      settingsStatus.textContent = "Checkout completado. KMFX actualizará tu plan cuando Stripe confirme el webhook.";
      void refreshBillingAfterReturn("checkout");
    } else if (checkoutState === "cancelled" || checkoutState === "canceled" || checkoutState === "cancel") {
      settingsStatus.textContent = "Checkout cancelado. Tu plan no se ha modificado.";
    }
  };

  const syncAccountSelectors = (selectedId) => {
    accountSelects.forEach((select) => {
      if (select) select.value = selectedId;
    });
  };

  const syncSettingsUI = () => {
    const profile = readStoredProfile();
    const preferences = readStoredPreferences();
    const accountOptions = buildAccountOptions();
    accountSelects.forEach((select) => populateSelect(select, accountOptions, profile.defaultAccount));
    populateSelect(landingPageSelect, landingPages, preferences.landingPage);
    applyTheme(store.getState().ui.theme);
    applyProfile(profile);
    applyPreferences({ ...preferences, dashboardAccount: profile.defaultAccount, theme: store.getState().ui.theme });
    syncAccountSelectors(profile.defaultAccount);
    syncConnectionReadout(store.getState());
    syncSessionReadout(store.getState());
    syncBillingReadout(store.getState());
    syncAdminUI(store.getState());
  };

  syncSettingsUI();
  syncCheckoutReturnState();
  let lastAuthSignature = JSON.stringify(store.getState().auth || {});
  let hydratedUserId = null;
  let hydrateInFlight = null;

  const hydrateRemoteSettings = async (authState = store.getState().auth, { force = false } = {}) => {
    const userId = authState?.user?.id;
    const isAuthenticated = authState?.status === "authenticated";
    if (!isAuthenticated || !userId) {
      hydratedUserId = null;
      return;
    }
    if (!force && hydratedUserId === userId) return;
    if (hydrateInFlight && !force) return hydrateInFlight;

    if (settingsStatus) settingsStatus.textContent = "Sincronizando configuración...";
    hydrateInFlight = fetchSupabaseUserConfig(authState)
      .then((result) => {
        if (!result.ok) {
          if (settingsStatus) settingsStatus.textContent = "No se pudo cargar tu configuración de Supabase.";
          return;
        }
        const mergedAuth = mergeRemoteConfigIntoAuth(store.getState().auth, result.data);
        const mergedPreferences = mergeRemoteConfigIntoPreferences(readStoredPreferences(), result.data, mergedAuth);
        persistAuthState(mergedAuth);
        persistLocalPreferences(mergedPreferences);
        hydratedUserId = userId;
        store.setState((state) => ({
          ...state,
          auth: mergedAuth,
          currentAccount: resolveKnownAccountId(mergedAuth.profile.defaultAccount, state),
          ui: {
            ...state.ui,
            theme: mergedPreferences.theme === "dark" ? "dark" : "light"
          }
        }));
        logBootState("remote-settings-hydrated", store.getState(), {
          preferredAccount: mergedAuth.profile.defaultAccount || "",
        });
        syncSettingsUI();
        if (settingsStatus) settingsStatus.textContent = result.warnings?.length
          ? "Configuración principal sincronizada. Algunas extensiones aún no están disponibles."
          : "Configuración sincronizada.";
      })
      .finally(() => {
        hydrateInFlight = null;
      });

    return hydrateInFlight;
  };

  const setTheme = (next) => {
    store.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        theme: next
      }
    }));
  };

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.themeValue || (store.getState().ui.theme === "dark" ? "light" : "dark");
      if (next === store.getState().ui.theme) return;
      setTheme(next);
    });
  });

  document.getElementById("resetView")?.addEventListener("click", () => {
    const preferences = readStoredPreferences();
    store.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        activePage: preferences.landingPage || "dashboard",
        analyticsTab: "summary"
      },
      currentAccount: resolveKnownAccountId(preferences.dashboardAccount, state)
    }));
    logBootState("reset-view", store.getState(), {
      preferredAccount: preferences.dashboardAccount || "",
    });
  });

  const saveSettings = async () => {
    const { profile, preferences } = collectSettings();
    preferences.dashboardAccount = profile.defaultAccount;
    const nextAuth = mergeAuthProfile(store.getState().auth, {
      user: {
        name: profile.name,
        email: profile.email,
        avatar: profile.avatar ?? store.getState().auth?.user?.avatar ?? DEFAULT_AUTH_USER.avatar,
        initials: profile.initials
      },
      profile: {
        discord: profile.discord,
        defaultAccount: profile.defaultAccount
      }
    });
    if (settingsStatus) settingsStatus.textContent = "Guardando cambios...";
    if (store.getState().auth?.status === "authenticated") {
      const remoteSave = await saveSupabaseUserConfig({
        auth: nextAuth,
        profile,
        preferences
      });
      if (!remoteSave.ok) {
        console.error("[KMFX][SETTINGS] Supabase save failed", remoteSave);
        if (settingsStatus) settingsStatus.textContent = `No se pudo guardar en Supabase: ${remoteSave.error?.message || "error desconocido"}`;
        return;
      }
      if (settingsStatus && remoteSave.warnings?.length) {
        settingsStatus.textContent = "Perfil guardado. Algunas preferencias avanzadas aún no se sincronizaron.";
      }
    }
    persistLocalPreferences(preferences);
    persistAuthState(nextAuth);
    applyProfile(profile);
    applyPreferences(preferences);
    store.setState((state) => ({
      ...state,
      auth: nextAuth,
      currentAccount: resolveKnownAccountId(profile.defaultAccount, state),
      ui: {
        ...state.ui,
        theme: preferences.theme === "dark" ? "dark" : "light"
      }
    }));
    logBootState("settings-saved", store.getState(), {
      preferredAccount: profile.defaultAccount || "",
    });
    syncAccountSelectors(profile.defaultAccount);
    syncConnectionReadout(store.getState(), profile.defaultAccount);
    if (settingsStatus && !settingsStatus.textContent?.includes("Algunas preferencias")) {
      settingsStatus.textContent = "Cambios guardados correctamente.";
    }
  };

  const resetSettings = async () => {
    const profile = { ...defaultProfile };
    const preferences = { ...defaultPreferences, theme: store.getState().ui.theme };
    const resetAuth = mergeAuthProfile(store.getState().auth, {
      user: {
        name: defaultProfile.name,
        email: defaultProfile.email,
        avatar: defaultProfile.avatar,
        initials: defaultProfile.initials
      },
      profile: {
        discord: defaultProfile.discord,
        defaultAccount: defaultProfile.defaultAccount
      }
    });
    if (settingsStatus) settingsStatus.textContent = "Restaurando valores...";
    if (store.getState().auth?.status === "authenticated") {
      const remoteSave = await saveSupabaseUserConfig({
        auth: resetAuth,
        profile,
        preferences
      });
      if (!remoteSave.ok) {
        console.error("[KMFX][SETTINGS] Supabase reset failed", remoteSave);
        if (settingsStatus) settingsStatus.textContent = `No se pudo restaurar en Supabase: ${remoteSave.error?.message || "error desconocido"}`;
        return;
      }
      if (settingsStatus && remoteSave.warnings?.length) {
        settingsStatus.textContent = "Valores base restaurados. Algunas extensiones aún no se sincronizaron.";
      }
    }
    persistLocalPreferences(preferences);
    persistAuthState(resetAuth);
    applyProfile(profile);
    applyPreferences(preferences);
    store.setState((state) => ({
      ...state,
      auth: resetAuth,
      currentAccount: resolveKnownAccountId(profile.defaultAccount, state),
      ui: {
        ...state.ui,
        theme: preferences.theme === "dark" ? "dark" : "light"
      }
    }));
    logBootState("settings-reset", store.getState(), {
      preferredAccount: profile.defaultAccount || "",
    });
    syncAccountSelectors(profile.defaultAccount);
    syncConnectionReadout(store.getState(), profile.defaultAccount);
    if (settingsStatus && !settingsStatus.textContent?.includes("Algunas extensiones")) {
      settingsStatus.textContent = "Valores restaurados correctamente.";
    }
  };

  document.querySelector("[data-settings-save]")?.addEventListener("click", saveSettings);
  document.querySelector("[data-settings-reset]")?.addEventListener("click", resetSettings);
  signOutButton?.addEventListener("click", async () => {
    if (!authSession?.signOut || store.getState().auth?.status !== "authenticated") return;
    signOutButton.disabled = true;
    if (settingsStatus) settingsStatus.textContent = "Cerrando sesión...";
    const result = await authSession.signOut();
    if (!result.ok) {
      signOutButton.disabled = false;
      if (settingsStatus) settingsStatus.textContent = result.reason || "No se pudo cerrar sesión.";
      return;
    }
    syncSessionReadout(store.getState());
    if (settingsStatus) settingsStatus.textContent = "Sesión cerrada.";
  });

  const startBillingCheckout = async (plan, interval) => {
    if (store.getState().auth?.status !== "authenticated") {
      if (settingsStatus) settingsStatus.textContent = "Inicia sesión para activar un plan.";
      return;
    }
    const url = resolveBillingCheckoutUrl();
    if (!url) {
      if (settingsStatus) settingsStatus.textContent = "No se pudo preparar Checkout.";
      return;
    }
    if (settingsStatus) settingsStatus.textContent = "Preparando Checkout seguro...";
    billingCheckoutButtons.forEach((button) => { button.disabled = true; });
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: billingRequestHeaders(),
        body: JSON.stringify({ plan, interval }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) {
        if (settingsStatus) settingsStatus.textContent = payload?.reason || "No se pudo abrir Checkout.";
        return;
      }
      window.location.assign(payload.url);
    } catch (error) {
      console.warn("[KMFX][BILLING] checkout failed", error);
      if (settingsStatus) settingsStatus.textContent = "No se pudo conectar con Checkout.";
    } finally {
      syncBillingReadout(store.getState());
    }
  };

  const openBillingPortal = async () => {
    if (store.getState().auth?.status !== "authenticated") {
      if (settingsStatus) settingsStatus.textContent = "Inicia sesión para gestionar tu suscripción.";
      return;
    }
    const url = resolveBillingPortalUrl();
    if (!url) {
      if (settingsStatus) settingsStatus.textContent = "No se pudo abrir el portal.";
      return;
    }
    if (settingsStatus) settingsStatus.textContent = "Abriendo portal de suscripción...";
    if (billingPortalButton) billingPortalButton.disabled = true;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: billingRequestHeaders(),
        body: JSON.stringify({ return_url: billingReturnUrl() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) {
        if (settingsStatus) settingsStatus.textContent = payload?.reason || "No se pudo abrir el portal.";
        return;
      }
      window.location.assign(payload.url);
    } catch (error) {
      console.warn("[KMFX][BILLING] portal failed", error);
      if (settingsStatus) settingsStatus.textContent = "No se pudo conectar con el portal.";
    } finally {
      syncBillingReadout(store.getState());
    }
  };

  const openSubscriptionSettings = () => {
    closeModal();
    window.history.pushState({}, "", "/ajustes?tab=subscription");
    store.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        activePage: "settings"
      }
    }));
    activateSettingsTab("subscription");
  };

  const shouldOpenSubscriptionPrompt = (state = store.getState(), { force = false } = {}) => {
    if (state.auth?.status !== "authenticated") return false;
    const billingState = selectBillingStatus(state);
    if (billingState.loading || !billingState.loadedAt || billingState.error) return false;
    if (isEffectiveBillingAdmin(state)) return false;
    const access = String(billingState.billing?.access || "").toLowerCase();
    if (access === "active") return false;
    if (!["free", "restricted", "billing_attention"].includes(access)) return false;
    const activePage = parentPageForPage(state.ui?.activePage || "dashboard");
    if (!force && activePage === "settings") return false;
    if (!force && document.body.classList.contains("modal-open")) return false;
    return true;
  };

  let lastSubscriptionPromptKey = "";
  const maybeOpenSubscriptionPrompt = (state = store.getState(), { force = false } = {}) => {
    if (!shouldOpenSubscriptionPrompt(state, { force })) return;
    const billingState = selectBillingStatus(state);
    const access = String(billingState.billing?.access || "").toLowerCase();
    const status = String(billingState.billing?.status || "").toLowerCase();
    const email = state.auth?.user?.email || "user";
    const promptKey = `kmfx:subscription-prompt:${email}:${access}:${status}`;
    if (!force && (lastSubscriptionPromptKey === promptKey || sessionStorage.getItem(promptKey) === "dismissed")) return;
    lastSubscriptionPromptKey = promptKey;

    const isPaused = isBillingPaused(state);
    const title = isPaused ? "Reanuda KMFX Edge" : "Activa KMFX Edge";
    const subtitle = isPaused
      ? PAUSED_SUBSCRIPTION_COPY
      : "Conecta MT5 live, conserva tus métricas y desbloquea el seguimiento completo.";
    const primaryCopy = isPaused
      ? PAUSED_SUBSCRIPTION_CTA
      : "Elige el plan que encaja con tu operativa. Puedes empezar con Basic y ampliar cuando tengas más cuentas.";

    openModal({
      title,
      subtitle,
      maxWidth: 980,
      content: `
        <section style="display:grid;gap:18px">
          <div class="tl-section-card" style="padding:18px;border-radius:18px">
            <strong style="display:block;color:var(--text-0);font-size:18px;line-height:1.2">${escapeHtml(primaryCopy)}</strong>
            <p style="margin:8px 0 0;color:var(--text-2);font-size:14px;line-height:1.45">Sin un plan activo puedes explorar la demo, pero las conexiones MT5 reales y las nuevas cuentas quedan bloqueadas para proteger datos y límites de uso.</p>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
            <article class="settings-billing-plan settings-billing-plan--basic">
              <div class="settings-plan-topline"><span>Edge Basic</span><em>Base operativa</em></div>
              <div class="settings-plan-price"><strong>15 €<small>/mes</small></strong><p>150 €/año</p></div>
              <p class="settings-plan-description">Para medir una operativa principal con datos live y calendario.</p>
              <ul class="settings-plan-features">
                <li>Hasta 2 cuentas MT5</li>
                <li>Dashboard y métricas core</li>
                <li>Journal limitado</li>
              </ul>
              <div class="settings-billing-plan__actions">
                <button class="btn-primary btn-inline" type="button" data-paywall-checkout data-plan="core" data-interval="monthly">Mensual</button>
                <button class="btn-secondary btn-inline" type="button" data-paywall-checkout data-plan="core" data-interval="yearly">150 €/año</button>
              </div>
            </article>
            <article class="settings-billing-plan settings-billing-plan--pro">
              <div class="settings-plan-topline"><span>Edge Pro</span><em class="settings-plan-badge--popular"><span aria-hidden="true">★</span> Más elegido</em></div>
              <div class="settings-plan-price"><strong>25 €<small>/mes</small></strong><p>250 €/año</p></div>
              <p class="settings-plan-description">Para comparar cuentas, fondeo y estrategias con más profundidad.</p>
              <ul class="settings-plan-features">
                <li>Hasta 5 cuentas MT5</li>
                <li>Funding y analítica avanzada</li>
                <li>Exports y journal completo</li>
              </ul>
              <div class="settings-billing-plan__actions">
                <button class="btn-primary btn-inline" type="button" data-paywall-checkout data-plan="pro" data-interval="monthly">Mensual</button>
                <button class="btn-secondary btn-inline" type="button" data-paywall-checkout data-plan="pro" data-interval="yearly">250 €/año</button>
              </div>
            </article>
            <article class="settings-billing-plan settings-billing-plan--featured">
              <div class="settings-plan-topline"><span>Edge Unlimited</span><em>Acceso total</em></div>
              <div class="settings-plan-price"><strong>39 €<small>/mes</small></strong><p>390 €/año</p></div>
              <p class="settings-plan-description">Para multi-cuenta, mentores o equipos sin límite operativo.</p>
              <ul class="settings-plan-features">
                <li>Cuentas MT5 ilimitadas</li>
                <li>Acceso completo</li>
                <li>Soporte prioritario</li>
              </ul>
              <div class="settings-billing-plan__actions">
                <button class="btn-primary btn-inline" type="button" data-paywall-checkout data-plan="unlimited" data-interval="monthly">Mensual</button>
                <button class="btn-secondary btn-inline" type="button" data-paywall-checkout data-plan="unlimited" data-interval="yearly">390 €/año</button>
              </div>
            </article>
          </div>
          <div class="modal-actions">
            <button class="btn-secondary btn-inline" type="button" data-paywall-dismiss>Ahora no</button>
            <button class="btn-secondary btn-inline" type="button" data-paywall-settings>Ver suscripción en ajustes</button>
          </div>
        </section>
      `,
      onMount: (card) => {
        card.querySelectorAll("[data-paywall-checkout]").forEach((button) => {
          button.addEventListener("click", () => {
            closeModal();
            startBillingCheckout(button.dataset.plan || "pro", button.dataset.interval || "monthly");
          });
        });
        card.querySelector("[data-paywall-settings]")?.addEventListener("click", openSubscriptionSettings);
        card.querySelector("[data-paywall-dismiss]")?.addEventListener("click", () => {
          sessionStorage.setItem(promptKey, "dismissed");
          closeModal();
        });
      }
    });
  };

  billingCheckoutButtons.forEach((button) => {
    button.addEventListener("click", () => startBillingCheckout(button.dataset.plan || "pro", button.dataset.interval || "monthly"));
  });
  billingPortalButton?.addEventListener("click", openBillingPortal);
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-open-subscription-prompt]");
    if (!trigger) return;
    event.preventDefault();
    maybeOpenSubscriptionPrompt(store.getState(), { force: true });
  });
  window.addEventListener("kmfx:open-subscription-prompt", () => {
    maybeOpenSubscriptionPrompt(store.getState(), { force: true });
  });
  settingsTabButtons.forEach((button) => {
    button.addEventListener("click", () => activateSettingsTab(button.dataset.settingsTab));
  });

  const handleSettingsFieldEdit = (field) => {
    if (!field) return;
      const { profile, preferences } = collectSettings();
      preferences.dashboardAccount = profile.defaultAccount;
      if (field.dataset.settingsField === "theme") {
        applyTheme(field.value === "dark" ? "dark" : "light");
      }
      if (field.dataset.settingsField === "density" && densitySelect) {
        root.dataset.density = densitySelect.value || "comfortable";
      }
      if (field.dataset.settingsField === "defaultAccount" || field.dataset.settingsField === "dashboardAccount") {
        profile.defaultAccount = field.value;
        preferences.dashboardAccount = field.value;
        syncAccountSelectors(field.value);
      }
      renderProfilePreview({ ...defaultProfile, ...profile });
      syncConnectionReadout(store.getState(), profile.defaultAccount);
      if (settingsStatus) settingsStatus.textContent = "Cambios pendientes de guardar.";
  };

  allSettingsFields.forEach((field) => {
    field.addEventListener("input", () => handleSettingsFieldEdit(field));
    field.addEventListener("change", () => handleSettingsFieldEdit(field));
  });

  store.subscribe((state) => {
    applyTheme(state.ui.theme);
    syncConnectionReadout(state);
    syncSessionReadout(state);
    syncBillingReadout(state);
    syncAdminUI(state);
    requestAnimationFrame(() => maybeOpenSubscriptionPrompt(state));
    const nextAuthSignature = JSON.stringify(state.auth || {});
    if (nextAuthSignature !== lastAuthSignature) {
      lastAuthSignature = nextAuthSignature;
      const profile = readStoredProfile();
      applyProfile(profile);
      syncAccountSelectors(profile.defaultAccount);
      if (state.auth?.status === "authenticated" && state.auth?.user?.id && hydratedUserId !== state.auth.user.id) {
        hydrateRemoteSettings(state.auth);
      }
      if (state.auth?.status !== "authenticated") {
        hydratedUserId = null;
      }
    }
  });

  if (store.getState().auth?.status === "authenticated" && store.getState().auth?.user?.id) {
    hydrateRemoteSettings(store.getState().auth, { force: true });
  }
}

ensureLightCardFlattening();
async function bootstrapApp() {
  console.info("[KMFX][API]", {
    label: "boot-config",
    baseURL: resolveApiBaseUrl() || "(unset)",
    snapshotURL: resolveAccountsSnapshotUrl() || "(disabled)",
    accountsURL: resolveAccountsRegistryUrl() || "(disabled)",
    billingURL: resolveBillingStatusUrl() || "(disabled)",
  });
  logBootState("startup-before-init");

  const authSession = initAuthSession(store);
  initBillingStatus(store);
  const snapshotBootstrap = await initAccountsLiveSnapshot(store);
  if (snapshotBootstrap?.ok && snapshotBootstrap.count > 0) {
    const state = store.getState();
    store.setState((current) => ({
      ...current,
      mode: "live",
      bootResolved: true,
      currentAccount: snapshotBootstrap.selectedAccountId || state.currentAccount,
      activeLiveAccountId: snapshotBootstrap.selectedAccountId || state.activeLiveAccountId || null,
      activeAccountId: snapshotBootstrap.selectedAccountId || state.activeAccountId || null,
    }));
  } else {
    store.setState((state) => ({
      ...state,
      bootResolved: true,
      mode: Array.isArray(state.liveAccountIds) && state.liveAccountIds.length > 0 ? "live" : "mock",
    }));
  }

  applyInitialRouteState();
  renderActivePage();
  initNavigation(store);
  initAccountsUI(store);
  initConnections(store);
  initCalculator(store);
  initJournal(store);
  initStrategies(store);
  initFunded(store);
  initPullToRefresh(() => {
    return window.kmfxBridge?.refresh?.();
  });
  initAccountRuntime(store);
  initAuthUI(store);
  initTopbarStatus(store);
  initSidebarUI(store);
  initSidebarVNext();
  initConnectionWizard(store);
  initPostTradeTagBridge();
  initPostTradeAutoPrompt();
  initSettings(authSession);
  startClock();
  store.subscribe(() => renderActivePage());
  store.subscribe((state) => {
    logBootState("state-updated", state);
  });

  window.kmfxStore = store;
  console.log("[KMFX] clean frontend baseline ready", BUILD_TAG);
}

bootstrapApp();
