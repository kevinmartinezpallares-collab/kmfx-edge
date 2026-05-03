import {
  analyticsPageForTab,
  analyticsTabForPage,
  hasAuthUrlState,
  isKnownRoutedPage,
  navigationParentForPage,
  pageFromLocation,
  parentPageForPage,
  routeForPage
} from "./route-map.js?v=build-20260406-213500";

const pageTitle = {
  dashboard: "Panel",
  analytics: "Análisis",
  "analytics-daily": "Análisis diario",
  "analytics-hourly": "Análisis horario",
  "analytics-risk": "Análisis de riesgo",
  discipline: "Ejecución",
  risk: "Risk Engine",
  "risk-ruin-var": "Ruin / VaR",
  "risk-monte-carlo": "Monte Carlo",
  "risk-exposure": "Exposición",
  trades: "Operaciones",
  calendar: "Calendario",
  connections: "Cuentas",
  calculator: "Herramientas",
  journal: "Diario",
  "journal-review": "Review Queue",
  "journal-entries": "Entradas",
  "journal-ai-review": "AI Review",
  strategies: "Estrategias",
  "strategies-backtest": "Backtest vs Real",
  "strategies-portfolio": "Portafolios",
  funded: "Funded",
  "funded-rules": "Reglas de funding",
  "funded-payouts": "Payouts",
  market: "Mercado",
  portfolio: "Capital",
  glossary: "Glosario",
  debug: "Debug",
  settings: "Ajustes"
};

const pageContext = {
  dashboard: "Visión general de rendimiento, cuentas y métricas clave",
  analytics: "Análisis de rendimiento, timing y riesgo",
  "analytics-daily": "Lectura diaria de rendimiento y consistencia",
  "analytics-hourly": "Timing operativo por hora y sesión",
  "analytics-risk": "Vista analítica del riesgo observado",
  discipline: "Calidad de entrada, gestión y cumplimiento",
  risk: "Protección, límites y política activa",
  "risk-ruin-var": "Probabilidad de ruina, VaR, CVaR y supuestos",
  "risk-monte-carlo": "Simulación de trayectorias, drawdown y supervivencia",
  "risk-exposure": "Exposición abierta, heat y límites operativos",
  trades: "Histórico de ejecución y revisión de operaciones",
  calendar: "Calendario mensual y desempeño diario",
  connections: "Gestión de cuentas conectadas y sincronización con MT5",
  calculator: "Utilidades para planificar riesgo, lotaje y escenarios antes de operar",
  journal: "Diario operativo y notas de revisión",
  "journal-review": "Cola de revisión y prioridades post-trade",
  "journal-entries": "Entradas manuales, lecciones y evidencia",
  "journal-ai-review": "Reportes para IA externa y respuestas pegadas manualmente",
  strategies: "Catálogo de setups y validación",
  "strategies-backtest": "Comparativa entre backtest importado y ejecución real",
  "strategies-portfolio": "Lectura de capital, correlación y asignación",
  funded: "Seguimiento de cuenta fondeada y progreso de fases",
  "funded-rules": "Reglas, buffers y límites de cuenta fondeada",
  "funded-payouts": "Ledger económico, retiros y fees",
  market: "Watchlist, régimen y catalizadores",
  portfolio: "Gestión económica de capital y evolución por cuenta",
  glossary: "Glosario de métricas y definiciones",
  debug: "Diagnóstico local y contexto de restauración",
  settings: "Perfil, workspace e integraciones"
};

export function initNavigation(store) {
  const navButtons = document.querySelectorAll(".nav-item");
  const pages = document.querySelectorAll(".page");
  const navGroups = document.querySelectorAll(".nav-group");
  const navGroupTriggers = document.querySelectorAll("[data-nav-group-trigger]");
  const topbarTitle = document.getElementById("topbarTitle");
  const topbarContext = document.getElementById("topbarContext");
  const analyticsTabs = document.getElementById("analyticsTabs");
  let previousActivePage = store.getState().ui.activePage;
  let pageTransitionTimeout = null;
  let isApplyingBrowserRoute = false;

  const syncBrowserRoute = (activePage, { replace = false } = {}) => {
    if (typeof window === "undefined") return;
    if (isApplyingBrowserRoute || !isKnownRoutedPage(activePage) || hasAuthUrlState(window.location)) return;

    const nextPath = routeForPage(activePage);
    const currentPath = window.location.pathname.replace(/\/+$/g, "") || "/";
    if (currentPath === nextPath && !window.location.search && !window.location.hash) return;

    const routeState = { page: activePage };
    const method = replace || currentPath === "/" ? "replaceState" : "pushState";
    window.history[method](routeState, document.title, nextPath);
  };

  const applyBrowserRoute = () => {
    if (typeof window === "undefined") return;
    const routedPage = pageFromLocation(window.location);
    if (!routedPage || routedPage === store.getState().ui.activePage) return;
    const routedAnalyticsTab = analyticsTabForPage(routedPage);
    isApplyingBrowserRoute = true;
    store.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        activePage: routedPage,
        ...(routedAnalyticsTab ? { analyticsTab: routedAnalyticsTab } : {})
      }
    }));
    isApplyingBrowserRoute = false;
  };

  const resetPageTransitionClasses = () => {
    pages.forEach((panel) => panel.classList.remove("page-enter", "page-exit"));
  };

  const syncNavigation = (state) => {
    const { activePage, analyticsTab } = state.ui;
    const activeNavPage = navigationParentForPage(activePage);
    navButtons.forEach((item) => {
      const targetPage = item.dataset.page;
      const isSubitem = item.classList.contains("nav-subitem");
      const isActive = isSubitem
        ? targetPage === activePage
        : targetPage === activePage || targetPage === activeNavPage;
      item.classList.toggle("active", isActive);
      if (isActive) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });
    navGroups.forEach((group) => {
      const hasActiveChild = Boolean(group.querySelector(".nav-item.active"));
      if (hasActiveChild) {
        group.classList.add("is-open");
        group.classList.remove("is-collapsed");
        const trigger = group.querySelector("[data-nav-group-trigger]");
        if (trigger) trigger.setAttribute("aria-expanded", "true");
      }
    });

    const activePanelPage = parentPageForPage(activePage);
    const previousPanelPage = parentPageForPage(previousActivePage);
    const nextPanel = document.getElementById(`page-${activePanelPage}`);
    const previousPanel = document.getElementById(`page-${previousPanelPage}`);
    const pageChanged = previousActivePage !== activePage;

    if (pageTransitionTimeout) {
      clearTimeout(pageTransitionTimeout);
      pageTransitionTimeout = null;
    }

    if (pageChanged && previousPanel && nextPanel && previousPanel !== nextPanel) {
      resetPageTransitionClasses();
      pages.forEach((panel) => panel.classList.remove("active"));
      previousPanel.classList.add("active", "page-exit");
      nextPanel.classList.add("active", "page-enter");

      pageTransitionTimeout = setTimeout(() => {
        previousPanel.classList.remove("active", "page-exit");
        nextPanel.classList.remove("page-enter");
        nextPanel.classList.add("active");
        pageTransitionTimeout = null;
      }, 220);
    } else {
      resetPageTransitionClasses();
      pages.forEach((panel) => panel.classList.toggle("active", panel.id === `page-${activePanelPage}`));
    }

    if (topbarTitle) topbarTitle.textContent = "";
    if (topbarContext) topbarContext.textContent = pageContext[activePage] || "";

    analyticsTabs?.querySelectorAll(".tl-tab").forEach((item) => {
      item.classList.toggle("active", item.dataset.tab === analyticsTab);
    });
    document.querySelectorAll(".analytics-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.tab === analyticsTab);
    });
    window.dispatchEvent(new CustomEvent("kmfx:layout-change", {
      detail: { activePage, analyticsTab }
    }));

    syncBrowserRoute(activePage, { replace: !pageChanged });
    previousActivePage = activePage;
  };

  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const page = button.dataset.page;
      const analyticsTab = button.dataset.tab || analyticsTabForPage(page);
      store.setState((state) => ({
        ...state,
        ui: {
          ...state.ui,
          activePage: page,
          ...(analyticsTab ? { analyticsTab } : {})
        }
      }));
      console.log("[KMFX][NAV] page", page);
    });
  });

  analyticsTabs?.querySelectorAll(".tl-tab").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      const page = analyticsPageForTab(tab);
      store.setState((state) => ({
        ...state,
        ui: {
          ...state.ui,
          activePage: page,
          analyticsTab: tab
        }
      }));
      console.log("[KMFX][ANALYTICS] tab", tab);
    });
  });

  navGroupTriggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const group = trigger.closest(".nav-group");
      if (!group || document.querySelector(".app-shell.sidebar-vnext.sidebar-vnext-collapsed")) return;
      const shouldOpen = trigger.getAttribute("aria-expanded") !== "true";
      trigger.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
      group.classList.toggle("is-open", shouldOpen);
      group.classList.toggle("is-collapsed", !shouldOpen);
    });
  });

  navGroups.forEach((group) => {
    const hasActiveChild = Boolean(group.querySelector(".nav-item.active"));
    const trigger = group.querySelector("[data-nav-group-trigger]");
    const isOpen = hasActiveChild || trigger?.getAttribute("aria-expanded") !== "false";
    group.classList.toggle("is-open", isOpen);
    group.classList.toggle("is-collapsed", !isOpen);
    if (trigger) trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  window.addEventListener("popstate", applyBrowserRoute);
  syncNavigation(store.getState());
  store.subscribe(syncNavigation);
}
