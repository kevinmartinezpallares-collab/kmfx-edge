import { createStore } from "./js/modules/store.js";
import { initNavigation } from "./js/modules/navigation.js";
import { renderDashboard } from "./js/modules/dashboard.js";
import { renderAnalytics } from "./js/modules/analytics.js";
import { renderDiscipline } from "./js/modules/discipline.js";
import { renderRisk } from "./js/modules/risk.js?v=risk-admin-1";
import { renderTrades } from "./js/modules/trades.js";
import { renderCalendar } from "./js/modules/calendar.js";
import { initAccountsUI } from "./js/modules/accounts-ui.js";
import { initConnections, renderConnections } from "./js/modules/connections.js?v=connections-admin-1";
import { initCalculator, renderCalculator } from "./js/modules/calculator.js";
import { initJournal, renderJournal } from "./js/modules/journal.js";
import { initStrategies, renderStrategies } from "./js/modules/strategies.js";
import { initFunded, renderFunded } from "./js/modules/funded.js?v=funded-admin-1";
import { renderMarket } from "./js/modules/market.js";
import { renderPortfolio } from "./js/modules/portfolio.js";
import { renderGlossary } from "./js/modules/glossary.js";
import { renderDebug } from "./js/modules/debug.js?v=debug-admin-1";
import { initMobileNav } from "./js/modules/mobile-nav.js?v=mobile-nav-admin-1";
import { initPullToRefresh } from "./js/modules/pull-to-refresh.js";
import "./js/modules/modal-system.js?v=modal-redesign-2";
import { initAccountRuntime } from "./js/modules/account-runtime.js";
import { initTopbarStatus } from "./js/modules/topbar-status.js";
import { initSidebarUI } from "./js/modules/sidebar-ui.js";
import { initAuthUI } from "./js/modules/auth-ui.js";
import {
  DEFAULT_AUTH_PROFILE,
  DEFAULT_AUTH_USER,
  initAuthSession,
  isAdminUser,
  mergeAuthProfile,
  persistAuthState,
  selectVisibleUserProfile
} from "./js/modules/auth-session.js?v=auth-role-2";
import { applyAvatarContent } from "./js/modules/avatar-utils.js";
import {
  DEFAULT_SETTINGS_PREFERENCES,
  fetchSupabaseUserConfig,
  mergeRemoteConfigIntoAuth,
  mergeRemoteConfigIntoPreferences,
  persistLocalPreferences,
  readLocalPreferences,
  saveSupabaseUserConfig
} from "./js/modules/supabase-user-config.js";

const store = createStore();
const LIGHT_SURFACE_OVERRIDE_ID = "kmfx-light-surface-override";
const LIGHT_SURFACE_OVERRIDE_CSS = `
html[data-theme="light"],
body[data-theme="light"] {
  --bg-app: #ffffff !important;
  --bg-shell: #ffffff !important;
  --bg-sidebar: #ffffff !important;
  --bg-topbar: #ffffff !important;
  --bg-panel: #ffffff !important;
  --bg-card: #ffffff !important;
  --bg-card-alt: #ffffff !important;
  --bg3: #ffffff !important;
  --surface: #ffffff !important;
  --surface2: #ffffff !important;
  --card-surface: #ffffff !important;
  --shell-surface: #ffffff !important;
}
html[data-theme="light"] body,
html[data-theme="light"] .app-shell,
html[data-theme="light"] .sidebar,
html[data-theme="light"] .topbar,
html[data-theme="light"] .main-panel,
html[data-theme="light"] .content,
body[data-theme="light"] .app-shell,
body[data-theme="light"] .sidebar,
body[data-theme="light"] .topbar,
body[data-theme="light"] .main-panel,
body[data-theme="light"] .content {
  background: #ffffff !important;
  box-shadow: none !important;
}
html[data-theme="light"] .tl-kpi-card,
html[data-theme="light"] .rm4-card,
html[data-theme="light"] .tl-section-card,
html[data-theme="light"] .chart-card,
html[data-theme="light"] .pnlcal-card,
html[data-theme="light"] .widget-card,
html[data-theme="light"] .account-switcher,
html[data-theme="light"] .account-banner,
html[data-theme="light"] .account-banner--premium,
html[data-theme="light"] .table-wrap,
html[data-theme="light"] .widget-table-wrap,
html[data-theme="light"] .chart-shell,
html[data-theme="light"] .kmfx-chart-shell,
html[data-theme="light"] .weekly-chart-shell,
body[data-theme="light"] .tl-kpi-card,
body[data-theme="light"] .rm4-card,
body[data-theme="light"] .tl-section-card,
body[data-theme="light"] .chart-card,
body[data-theme="light"] .pnlcal-card,
body[data-theme="light"] .widget-card,
body[data-theme="light"] .account-switcher,
body[data-theme="light"] .account-banner,
body[data-theme="light"] .account-banner--premium,
body[data-theme="light"] .table-wrap,
body[data-theme="light"] .widget-table-wrap,
body[data-theme="light"] .chart-shell,
body[data-theme="light"] .kmfx-chart-shell,
body[data-theme="light"] .weekly-chart-shell {
  background: #ffffff !important;
  background-image: none !important;
  border-color: rgba(15, 23, 42, 0.08) !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
html[data-theme="light"] .tl-kpi-card::before,
html[data-theme="light"] .rm4-card::before,
html[data-theme="light"] .tl-section-card::before,
html[data-theme="light"] .chart-card::before,
html[data-theme="light"] .pnlcal-card::before,
html[data-theme="light"] .widget-card::before,
html[data-theme="light"] .account-switcher::before,
html[data-theme="light"] .account-banner--premium::before,
body[data-theme="light"] .tl-kpi-card::before,
body[data-theme="light"] .rm4-card::before,
body[data-theme="light"] .tl-section-card::before,
body[data-theme="light"] .chart-card::before,
body[data-theme="light"] .pnlcal-card::before,
body[data-theme="light"] .widget-card::before,
body[data-theme="light"] .account-switcher::before,
body[data-theme="light"] .account-banner--premium::before {
  content: none !important;
  background: none !important;
  opacity: 0 !important;
}
html[data-theme="light"] .topbar-user-card,
html[data-theme="light"] .topbar-time-stack,
html[data-theme="light"] .sidebar-search,
html[data-theme="light"] .sidebar-profile,
html[data-theme="light"] .theme-toggle-badge,
html[data-theme="light"] .theme-badge-option,
html[data-theme="light"] .sidebar-profile-menu-btn,
html[data-theme="light"] .sidebar-profile-menu,
html[data-theme="light"] .ui-badge,
html[data-theme="light"] .widget-segmented,
html[data-theme="light"] .row-chip,
html[data-theme="light"] .pill,
html[data-theme="light"] .calc-chip,
html[data-theme="light"] .calc-pill,
html[data-theme="light"] .widget-pill,
html[data-theme="light"] .footer-chip,
html[data-theme="light"] .tl-tab-bar,
body[data-theme="light"] .topbar-user-card,
body[data-theme="light"] .topbar-time-stack,
body[data-theme="light"] .sidebar-search,
body[data-theme="light"] .sidebar-profile,
body[data-theme="light"] .theme-toggle-badge,
body[data-theme="light"] .theme-badge-option,
body[data-theme="light"] .sidebar-profile-menu-btn,
body[data-theme="light"] .sidebar-profile-menu,
body[data-theme="light"] .ui-badge,
body[data-theme="light"] .widget-segmented,
body[data-theme="light"] .row-chip,
body[data-theme="light"] .pill,
body[data-theme="light"] .calc-chip,
body[data-theme="light"] .calc-pill,
body[data-theme="light"] .widget-pill,
body[data-theme="light"] .footer-chip,
body[data-theme="light"] .tl-tab-bar {
  background: #ffffff !important;
  background-image: none !important;
  border-color: rgba(15, 23, 42, 0.08) !important;
  box-shadow: none !important;
}
html[data-theme="light"] .funded-hero-config,
body[data-theme="light"] .funded-hero-config {
  background: rgba(255, 255, 255, 0.82) !important;
  border-color: rgba(15, 23, 42, 0.08) !important;
  box-shadow: none !important;
}
html[data-theme="light"] .funded-hero-config .funded-select-wrap select,
html[data-theme="light"] .funded-hero-config .funded-size-wrap .funded-size-input,
body[data-theme="light"] .funded-hero-config .funded-select-wrap select,
body[data-theme="light"] .funded-hero-config .funded-size-wrap .funded-size-input {
  background: rgba(255, 255, 255, 0.94) !important;
  border-color: rgba(15, 23, 42, 0.08) !important;
  box-shadow: none !important;
  color: #182133 !important;
}
html[data-theme="light"] .funded-account-pill,
html[data-theme="light"] .funded-account-pill.is-active,
body[data-theme="light"] .funded-account-pill,
body[data-theme="light"] .funded-account-pill.is-active,
html[data-theme="light"] .account-hero-card,
html[data-theme="light"] .account-hero-card:hover,
html[data-theme="light"] .account-hero-card.active,
body[data-theme="light"] .account-hero-card,
body[data-theme="light"] .account-hero-card:hover,
body[data-theme="light"] .account-hero-card.active {
  background: #ffffff !important;
  background-image: none !important;
  border-color: rgba(15, 23, 42, 0.08) !important;
  box-shadow: none !important;
  color: #182133 !important;
}
html[data-theme="light"] .account-hero-card::before,
html[data-theme="light"] .account-hero-card::after,
body[data-theme="light"] .account-hero-card::before,
body[data-theme="light"] .account-hero-card::after {
  content: none !important;
  background: none !important;
  opacity: 0 !important;
}
html[data-theme="light"] .account-hero-card .account-hero-card__name,
html[data-theme="light"] .account-hero-card .account-hero-card__value,
html[data-theme="light"] .account-hero-card .account-hero-card__meta,
html[data-theme="light"] .account-hero-card .metric-label,
html[data-theme="light"] .account-hero-card .tl-kpi-label,
html[data-theme="light"] .account-hero-card .ui-badge,
html[data-theme="light"] .account-hero-card .ui-badge--compact,
body[data-theme="light"] .account-hero-card .account-hero-card__name,
body[data-theme="light"] .account-hero-card .account-hero-card__value,
body[data-theme="light"] .account-hero-card .account-hero-card__meta,
body[data-theme="light"] .account-hero-card .metric-label,
body[data-theme="light"] .account-hero-card .tl-kpi-label,
body[data-theme="light"] .account-hero-card .ui-badge,
body[data-theme="light"] .account-hero-card .ui-badge--compact {
  color: #182133 !important;
}
`;

function syncForcedLightSurface(theme) {
  let styleEl = document.getElementById(LIGHT_SURFACE_OVERRIDE_ID);
  if (theme === "light") {
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = LIGHT_SURFACE_OVERRIDE_ID;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = LIGHT_SURFACE_OVERRIDE_CSS;
    return;
  }
  styleEl?.remove();
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
    ["connections", "Conexiones"],
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
    adminOnlyNodes.forEach((node) => {
      node.hidden = !isAdmin;
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

  const buildAccountOptions = () => Object.values(store.getState().accounts).map((account) => [account.id, account.name]);

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
    syncForcedLightSurface(theme);
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
          currentAccount: mergedAuth.profile.defaultAccount || state.currentAccount,
          ui: {
            ...state.ui,
            theme: mergedPreferences.theme === "dark" ? "dark" : "light"
          }
        }));
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
      currentAccount: preferences.dashboardAccount || state.currentAccount
    }));
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
      currentAccount: profile.defaultAccount || state.currentAccount,
      ui: {
        ...state.ui,
        theme: preferences.theme === "dark" ? "dark" : "light"
      }
    }));
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
      currentAccount: profile.defaultAccount || state.currentAccount,
      ui: {
        ...state.ui,
        theme: preferences.theme === "dark" ? "dark" : "light"
      }
    }));
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
initSettings();
startClock();
store.subscribe(() => renderActivePage());

window.kmfxStore = store;

console.log("[KMFX] clean frontend baseline ready");
