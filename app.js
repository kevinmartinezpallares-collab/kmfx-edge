import { createStore } from "./js/modules/store.js?v=build-20260406-213500";
import { initNavigation } from "./js/modules/navigation.js?v=build-20260406-213500";
import { renderDashboard } from "./js/modules/dashboard.js?v=build-20260406-213500";
import { renderAnalytics } from "./js/modules/analytics.js?v=build-20260406-213500";
import { renderDiscipline } from "./js/modules/discipline.js?v=build-20260406-213500";
import { renderRisk } from "./js/modules/risk.js?v=build-20260406-213500";
import { renderTrades } from "./js/modules/trades.js?v=build-20260406-213500";
import { renderCalendar } from "./js/modules/calendar.js?v=build-20260406-213500";
import { initAccountsUI } from "./js/modules/accounts-ui.js?v=build-20260406-213500";
import { initAccountsLiveSnapshot } from "./js/modules/accounts-live-snapshot.js?v=build-20260406-213500";
import { initConnections, renderConnections } from "./js/modules/connections.js?v=build-20260406-213500";
import { initCalculator, renderCalculator } from "./js/modules/calculator.js?v=build-20260406-213500";
import { initJournal, renderJournal } from "./js/modules/journal.js?v=build-20260406-213500";
import { initStrategies, renderStrategies } from "./js/modules/strategies.js?v=build-20260406-213500";
import { initFunded, renderFunded } from "./js/modules/funded.js?v=build-20260406-213500";
import { renderMarket } from "./js/modules/market.js?v=build-20260406-213500";
import { renderPortfolio } from "./js/modules/portfolio.js?v=build-20260406-213500";
import { renderGlossary } from "./js/modules/glossary.js?v=build-20260406-213500";
import { renderDebug } from "./js/modules/debug.js?v=build-20260406-213500";
import { initMobileNav } from "./js/modules/mobile-nav.js?v=build-20260406-213500";
import { initPullToRefresh } from "./js/modules/pull-to-refresh.js?v=build-20260406-213500";
import "./js/modules/modal-system.js?v=build-20260406-213500";
import { initAccountRuntime } from "./js/modules/account-runtime.js?v=build-20260406-213500";
import { initTopbarStatus } from "./js/modules/topbar-status.js?v=build-20260406-213500";
import { initSidebarUI } from "./js/modules/sidebar-ui.js?v=build-20260406-213500";
import { initSidebarVNext } from "./js/modules/sidebar-vnext.js?v=build-20260406-213500";
import { initConnectionWizard } from "./js/modules/connection-wizard.js?v=build-20260406-213500";
import { initAuthUI } from "./js/modules/auth-ui.js?v=build-20260406-213500";
import {
  DEFAULT_AUTH_PROFILE,
  DEFAULT_AUTH_USER,
  initAuthSession,
  isAdminUser,
  mergeAuthProfile,
  persistAuthState,
  selectVisibleUserProfile
} from "./js/modules/auth-session.js?v=build-20260406-213500";
import { applyAvatarContent } from "./js/modules/avatar-utils.js?v=build-20260406-213500";
import {
  DEFAULT_SETTINGS_PREFERENCES,
  fetchSupabaseUserConfig,
  mergeRemoteConfigIntoAuth,
  mergeRemoteConfigIntoPreferences,
  persistLocalPreferences,
  readLocalPreferences,
  saveSupabaseUserConfig
} from "./js/modules/supabase-user-config.js?v=build-20260406-213500";
import { resolveActiveAccountId } from "./js/modules/utils.js?v=build-20260406-213500";
import { resolveAccountsRegistryUrl, resolveAccountsSnapshotUrl, resolveApiBaseUrl } from "./js/modules/api-config.js?v=build-20260406-213500";

const BUILD_TAG = "build-20260406-213500";
window.__KMFX_BUILD__ = BUILD_TAG;

const store = createStore();

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

function renderActivePage() {
  const state = store.getState();
  if (state.ui.activePage === "debug" && !isAdminUser(state)) {
    store.setState((current) => ({
      ...current,
      ui: {
        ...current.ui,
        activePage: "dashboard"
      }
    }));
    return;
  }
  const renderer = pageRenderers[state.ui.activePage];
  renderer?.(state);
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

function initSettings() {
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
  const adminOnlyNodes = [...document.querySelectorAll("[data-admin-only]")];
  const themeSelect = document.querySelector('[data-settings-field="theme"]');
  const densitySelect = document.querySelector('[data-settings-field="density"]');

  const syncAdminUI = (state = store.getState()) => {
    const isAdmin = isAdminUser(state);
    document.documentElement.dataset.adminMode = isAdmin ? "true" : "false";
    adminOnlyNodes.forEach((node) => {
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
    select.innerHTML = options.map(([value, label]) => `<option value="${value}" ${value === selectedValue ? "selected" : ""}>${label}</option>`).join("");
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
      displayAccount.textContent = selectedAccount?.name || "Cuenta por defecto";
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
    const profile = { ...defaultProfile };
    const preferences = { ...defaultPreferences };
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
      connectionSource.textContent = isAdminUser(state)
        ? (account.connection.source || "Bridge local")
        : "Estado general de sincronización";
    }
    if (connectionLastSync) {
      connectionLastSync.textContent = account.connection.lastSync
        ? new Date(account.connection.lastSync).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        : "—";
    }
    if (connectionLastAccount) connectionLastAccount.textContent = account.name || "Sin cuenta seleccionada";
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
    syncAdminUI(store.getState());
  };

  syncSettingsUI();
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
    syncAdminUI(state);
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
  });
  logBootState("startup-before-init");

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

  renderActivePage();
  initNavigation(store);
  initAccountsUI(store);
  initConnections(store);
  initCalculator(store);
  initJournal(store);
  initStrategies(store);
  initFunded(store);
  initMobileNav(store);
  initPullToRefresh(() => {
    return window.kmfxBridge?.refresh?.();
  });
  initAccountRuntime(store);
  initAuthSession(store);
  initAuthUI(store);
  initTopbarStatus(store);
  initSidebarUI(store);
  initSidebarVNext();
  initConnectionWizard(store);
  initSettings();
  startClock();
  store.subscribe(() => renderActivePage());
  store.subscribe((state) => {
    logBootState("state-updated", state);
  });

  window.kmfxStore = store;
  console.log("[KMFX] clean frontend baseline ready", BUILD_TAG);
}

bootstrapApp();
