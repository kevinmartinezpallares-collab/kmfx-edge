const pageTitle = {
  dashboard: "Panel",
  analytics: "Análisis",
  discipline: "Disciplina",
  risk: "Riesgo",
  trades: "Operaciones",
  calendar: "Calendario",
  connections: "Conexiones",
  calculator: "Calculadora",
  journal: "Diario",
  strategies: "Estrategias",
  funded: "Funded",
  market: "Mercado",
  portfolio: "Portfolio",
  glossary: "Glosario",
  debug: "Debug",
  settings: "Ajustes"
};

const pageContext = {
  dashboard: "Visión general de rendimiento, cuentas y métricas clave",
  analytics: "Análisis de rendimiento, timing y riesgo",
  discipline: "Comportamiento del trader, consistencia y control de ejecución",
  risk: "Gobernanza de riesgo y control operativo",
  trades: "Histórico de ejecución y revisión de operaciones",
  calendar: "Calendario mensual y desempeño diario",
  connections: "Preparación de integraciones y vínculo de cuentas",
  calculator: "Utilidad de sizing, riesgo y ejecución",
  journal: "Diario operativo y notas de revisión",
  strategies: "Catálogo de setups y validación",
  funded: "Seguimiento de cuenta fondeada y progreso de fases",
  market: "Watchlist, régimen y catalizadores",
  portfolio: "Asignación entre cuentas y mandatos",
  glossary: "Glosario de métricas y definiciones",
  debug: "Diagnóstico local y contexto de restauración",
  settings: "Preferencias locales del frontend"
};

export function initNavigation(store) {
  const navButtons = document.querySelectorAll(".nav-item");
  const pages = document.querySelectorAll(".page");
  const topbarTitle = document.getElementById("topbarTitle");
  const topbarContext = document.getElementById("topbarContext");
  const analyticsTabs = document.getElementById("analyticsTabs");
  let previousActivePage = store.getState().ui.activePage;
  let pageTransitionTimeout = null;

  const resetPageTransitionClasses = () => {
    pages.forEach((panel) => panel.classList.remove("page-enter", "page-exit"));
  };

  const syncNavigation = (state) => {
    const { activePage, analyticsTab } = state.ui;
    navButtons.forEach((item) => item.classList.toggle("active", item.dataset.page === activePage));

    const nextPanel = document.getElementById(`page-${activePage}`);
    const previousPanel = document.getElementById(`page-${previousActivePage}`);
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
      pages.forEach((panel) => panel.classList.toggle("active", panel.id === `page-${activePage}`));
    }

    if (topbarTitle) topbarTitle.textContent = pageTitle[activePage] || "Panel";
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

    previousActivePage = activePage;
  };

  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const page = button.dataset.page;
      store.setState((state) => ({
        ...state,
        ui: {
          ...state.ui,
          activePage: page
        }
      }));
      console.log("[KMFX][NAV] page", page);
    });
  });

  analyticsTabs?.querySelectorAll(".tl-tab").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      store.setState((state) => ({
        ...state,
        ui: {
          ...state.ui,
          analyticsTab: tab
        }
      }));
      console.log("[KMFX][ANALYTICS] tab", tab);
    });
  });

  syncNavigation(store.getState());
  store.subscribe(syncNavigation);
}
