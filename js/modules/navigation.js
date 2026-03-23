const pageContext = {
  dashboard: "",
  analytics: "Análisis de rendimiento, timing y riesgo",
  risk: "Gobernanza de riesgo y control operativo",
  trades: "Histórico de ejecución y revisión de operaciones",
  calendar: "Calendario mensual y desempeño diario",
  connections: "Preparación de integraciones y vínculo de cuentas",
  calculator: "Utilidad de sizing, riesgo y ejecución",
  journal: "Diario operativo y notas de revisión",
  strategies: "Catálogo de setups y validación",
  funded: "Seguimiento de cuenta fondeada y progreso de fases",
  market: "Watchlist, régimen y catalizadores",
  talent: "Desarrollo del trader y scorecards",
  portfolio: "Asignación entre cuentas y mandatos",
  glossary: "Glosario de métricas y definiciones",
  debug: "Diagnóstico local y contexto de restauración",
  settings: "Preferencias locales del frontend"
};

export function initNavigation(store) {
  const navButtons = document.querySelectorAll(".nav-item");
  const pages = document.querySelectorAll(".page");
  const topbarContext = document.getElementById("topbarContext");
  const analyticsTabs = document.getElementById("analyticsTabs");
  const syncNavigation = (state) => {
    const { activePage, analyticsTab } = state.ui;
    navButtons.forEach((item) => item.classList.toggle("active", item.dataset.page === activePage));
    pages.forEach((panel) => panel.classList.toggle("active", panel.id === `page-${activePage}`));
    if (topbarContext) topbarContext.textContent = pageContext[activePage] || "KMFX Edge";

    analyticsTabs?.querySelectorAll(".tl-tab").forEach((item) => {
      item.classList.toggle("active", item.dataset.tab === analyticsTab);
    });
    document.querySelectorAll(".analytics-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.tab === analyticsTab);
    });
    window.dispatchEvent(new CustomEvent("kmfx:layout-change", {
      detail: { activePage, analyticsTab }
    }));
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
