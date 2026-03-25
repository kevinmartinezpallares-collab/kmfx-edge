const primaryItems = [
  { page: "dashboard", label: "Panel", icon: '<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect>' },
  { page: "analytics", label: "Análisis", icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>' },
  { page: "trades", label: "Operac.", icon: '<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>' },
  { page: "calendar", label: "Calend.", icon: '<rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>' }
];

const secondarySections = [
  {
    label: "General",
    items: [
      { page: "discipline", label: "Disciplina", icon: '<path d="M12 3v6"></path><path d="M6.5 7.5 12 12l5.5-4.5"></path><path d="M5 21h14"></path><path d="M7 17h10"></path>' }
    ]
  },
  {
    label: "Gestión",
    items: [
      { page: "portfolio", label: "Portfolio", icon: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M8 9h8"></path><path d="M8 13h5"></path>' },
      { page: "funded", label: "Funded", icon: '<circle cx="12" cy="12" r="8"></circle><path d="M12 8v8"></path><path d="M9 11.5c0-1.2 1.3-2.2 3-2.2s3 1 3 2.2-1.3 2.2-3 2.2-3 1-3 2.3 1.3 2.2 3 2.2 3-1 3-2.2"></path>' },
      { page: "risk", label: "Riesgo", icon: '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z"></path><path d="M12 9v4"></path><path d="M12 16h.01"></path>' },
      { page: "calculator", label: "Calculadora", icon: '<rect x="5" y="2" width="14" height="20" rx="2"></rect><line x1="8" y1="6" x2="16" y2="6"></line><line x1="8" y1="11" x2="8" y2="11"></line><line x1="12" y1="11" x2="12" y2="11"></line><line x1="16" y1="11" x2="16" y2="11"></line><line x1="8" y1="15" x2="8" y2="15"></line><line x1="12" y1="15" x2="12" y2="15"></line><line x1="16" y1="15" x2="16" y2="15"></line>' }
    ]
  },
  {
    label: "Progreso",
    items: [
      { page: "strategies", label: "Estrategias", icon: '<path d="M4 7h16"></path><path d="M7 12h10"></path><path d="M10 17h4"></path>' }
    ]
  },
  {
    label: "Sistema",
    items: [
      { page: "connections", label: "Conexiones", icon: '<path d="M9 12a3 3 0 0 1 3-3h3"></path><path d="M15 12a3 3 0 0 1-3 3H9"></path><path d="M7 9H5a3 3 0 0 0 0 6h2"></path><path d="M17 9h2a3 3 0 1 1 0 6h-2"></path>' },
      { page: "debug", label: "Debug", icon: '<path d="M9 3h6"></path><path d="M10 6h4"></path><rect x="7" y="8" width="10" height="10" rx="2"></rect><path d="M4 11h3"></path><path d="M17 11h3"></path><path d="M10 12h4"></path><path d="M10 15h4"></path>' },
      { page: "settings", label: "Ajustes", icon: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z"></path>' }
    ]
  }
];

const secondaryPages = new Set(secondarySections.flatMap((section) => section.items.map((item) => item.page)));

export function initMobileNav(store) {
  const root = document.getElementById("mobileNavRoot");
  if (!root) return;

  root.__mobileNavState = root.__mobileNavState || {
    moreOpen: false
  };

  const setMobileNavState = (patch = {}) => {
    root.__mobileNavState = {
      ...root.__mobileNavState,
      ...patch
    };
    render(store.getState());
  };

  const render = (state) => {
    const activePage = state.ui.activePage;
    const moreActive = secondaryPages.has(activePage);
    const moreOpen = Boolean(root.__mobileNavState.moreOpen);

    root.innerHTML = `
      <div class="bnav-more-overlay ${moreOpen ? "open" : ""}" data-bnav-close-overlay></div>
      <section class="bnav-more-menu ${moreOpen ? "open" : ""}" aria-hidden="${moreOpen ? "false" : "true"}">
        <div class="bnav-more-handle"></div>
        <div class="bnav-more-title">Más secciones</div>
        <div class="bnav-more-sections">
          ${secondarySections.map((section) => `
            <div class="bnav-more-section">
              <div class="bnav-more-section-label">${section.label}</div>
              <div class="bnav-more-grid">
                ${section.items.map((item) => `
                  <button class="bnav-more-item ${activePage === item.page ? "active" : ""}" type="button" data-bnav-page="${item.page}">
                    ${item.label}
                  </button>
                `).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      </section>

      <nav class="bottom-nav" aria-label="Navegación móvil principal">
        ${primaryItems.map((item) => `
          <button class="bnav-item ${activePage === item.page ? "active" : ""}" type="button" data-bnav-page="${item.page}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">${item.icon}</svg>
            <span>${item.label}</span>
          </button>
        `).join("")}
        <button class="bnav-item ${moreActive || moreOpen ? "active" : ""}" type="button" data-bnav-more>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="5" cy="12" r="1.7"></circle><circle cx="12" cy="12" r="1.7"></circle><circle cx="19" cy="12" r="1.7"></circle></svg>
          <span>Más</span>
        </button>
      </nav>
    `;
  };

  root.addEventListener("click", (event) => {
    const closeOverlay = event.target.closest("[data-bnav-close-overlay]");
    const moreButton = event.target.closest("[data-bnav-more]");
    const pageButton = event.target.closest("[data-bnav-page]");

    if (closeOverlay) {
      setMobileNavState({ moreOpen: false });
      return;
    }

    if (moreButton) {
      setMobileNavState({ moreOpen: !root.__mobileNavState.moreOpen });
      return;
    }

    if (pageButton) {
      setMobileNavState({ moreOpen: false });
      store.setState((state) => ({
        ...state,
        ui: {
          ...state.ui,
          activePage: pageButton.dataset.bnavPage
        }
      }));
    }
  });

  render(store.getState());
  store.subscribe(render);
}
