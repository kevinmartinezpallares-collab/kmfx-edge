import { analyticsTabForPage, navigationParentForPage } from "./route-map.js?v=build-20260504-070424";

const primaryItems = [
  { page: "dashboard", label: "Dashboard", icon: '<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect>' },
  { page: "calendar", label: "Calend.", icon: '<rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>' },
  { page: "trades", label: "Operac.", icon: '<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>' },
  { page: "analytics", label: "Insights", icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>' }
];

const morePrimaryActions = [
  { page: "strategies", label: "Estrategias", icon: '<path d="M4 7h16"></path><path d="M7 12h10"></path><path d="M10 17h4"></path>' },
  { page: "journal", label: "Journal", icon: '<path d="M4 19.5V5a2 2 0 0 1 2-2h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-1.5Z"></path><path d="M8 7h7"></path><path d="M8 11h7"></path><path d="M8 15h4"></path>' },
  { page: "risk", label: "Risk Engine", icon: '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z"></path><path d="M12 9v4"></path><path d="M12 16h.01"></path>' }
];

const moreListSections = [
  {
    label: "Insights",
    items: [
      { page: "analytics", label: "Resumen", icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>' },
      { page: "analytics-daily", label: "Diario", icon: '<rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="8" y1="2" x2="8" y2="6"></line><line x1="16" y1="2" x2="16" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>' },
      { page: "analytics-hourly", label: "Horario", icon: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>' },
      { page: "analytics-risk", label: "Riesgo", icon: '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z"></path>' }
    ]
  },
  {
    label: "Estrategias",
    items: [
      { page: "strategies", label: "Strategy Lab", icon: '<path d="M4 7h16"></path><path d="M7 12h10"></path><path d="M10 17h4"></path>' },
      { page: "strategies-backtest", label: "Backtest vs Real", icon: '<path d="M4 17V7"></path><path d="M4 17h16"></path><path d="m8 13 3-3 3 2 4-5"></path>' },
      { page: "strategies-portfolio", label: "Portafolios", icon: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M8 9h8"></path><path d="M8 13h5"></path>' }
    ]
  },
  {
    label: "Gestión",
    items: [
      { page: "connections", label: "Cuentas", icon: '<path d="M9 12a3 3 0 0 1 3-3h3"></path><path d="M15 12a3 3 0 0 1-3 3H9"></path><path d="M7 9H5a3 3 0 0 0 0 6h2"></path><path d="M17 9h2a3 3 0 1 1 0 6h-2"></path>' },
      { page: "portfolio", label: "Capital", icon: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M8 9h8"></path><path d="M8 13h5"></path>' },
      { page: "funded", label: "Funding", icon: '<circle cx="12" cy="12" r="8"></circle><path d="M12 8v8"></path><path d="M9 11.5c0-1.2 1.3-2.2 3-2.2s3 1 3 2.2-1.3 2.2-3 2.2-3 1-3 2.3 1.3 2.2 3 2.2 3-1 3-2.2"></path>' },
      { page: "funded-rules", label: "Reglas", icon: '<path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>' },
      { page: "funded-payouts", label: "Payouts", icon: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M16 12h.01"></path><path d="M7 9h6"></path><path d="M7 15h4"></path>' }
    ]
  },
  {
    label: "Control",
    items: [
      { page: "discipline", label: "Ejecución", icon: '<path d="M12 3v6"></path><path d="M6.5 7.5 12 12l5.5-4.5"></path><path d="M5 21h14"></path><path d="M7 17h10"></path>' },
      { page: "risk", label: "Risk Cockpit", icon: '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z"></path><path d="M12 9v4"></path><path d="M12 16h.01"></path>' },
      { page: "risk-ruin-var", label: "Ruin / VaR", icon: '<path d="M3 3v18h18"></path><path d="m7 15 3-4 3 2 5-7"></path>' },
      { page: "risk-monte-carlo", label: "Monte Carlo", icon: '<path d="M4 19c5-9 11-9 16 0"></path><path d="M4 14c5-7 11-7 16 0"></path><path d="M4 9c5-5 11-5 16 0"></path>' },
      { page: "risk-exposure", label: "Exposición", icon: '<path d="M4 12h16"></path><path d="M12 4v16"></path><circle cx="12" cy="12" r="3"></circle>' }
    ]
  },
  {
    label: "Journal",
    items: [
      { page: "journal", label: "Cockpit", icon: '<path d="M4 19.5V5a2 2 0 0 1 2-2h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-1.5Z"></path><path d="M8 7h7"></path><path d="M8 11h7"></path><path d="M8 15h4"></path>' },
      { page: "journal-review", label: "Review Queue", icon: '<path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>' },
      { page: "journal-entries", label: "Entradas", icon: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>' },
      { page: "journal-ai-review", label: "AI Review", icon: '<path d="M12 3v4"></path><path d="M12 17v4"></path><path d="M3 12h4"></path><path d="M17 12h4"></path><circle cx="12" cy="12" r="4"></circle>' }
    ]
  },
  {
    label: "Sistema",
    items: [
      { page: "calculator", label: "Herramientas", icon: '<rect x="5" y="2" width="14" height="20" rx="2"></rect><line x1="8" y1="6" x2="16" y2="6"></line><line x1="8" y1="11" x2="8" y2="11"></line><line x1="12" y1="11" x2="12" y2="11"></line><line x1="16" y1="11" x2="16" y2="11"></line><line x1="8" y1="15" x2="8" y2="15"></line><line x1="12" y1="15" x2="12" y2="15"></line><line x1="16" y1="15" x2="16" y2="15"></line>' },
      { page: "settings", label: "Ajustes", icon: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z"></path>' },
    ]
  },
  {
    label: "Soporte / Admin",
    items: [
      { page: "debug", label: "Debug / Inspector", adminOnly: true, icon: '<path d="M9 3h6"></path><path d="M10 6h4"></path><rect x="7" y="8" width="10" height="10" rx="2"></rect><path d="M4 11h3"></path><path d="M17 11h3"></path><path d="M10 12h4"></path><path d="M10 15h4"></path>' },
      { page: "connections", label: "Cuentas Admin", adminOnly: true, icon: '<path d="M9 12a3 3 0 0 1 3-3h3"></path><path d="M15 12a3 3 0 0 1-3 3H9"></path><path d="M7 9H5a3 3 0 0 0 0 6h2"></path><path d="M17 9h2a3 3 0 1 1 0 6h-2"></path>' },
      { page: "settings", label: "Sistema Admin", adminOnly: true, icon: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z"></path>' }
    ]
  }
];

function visibleSectionsFor(sections, isAdmin) {
  return sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => isAdmin || !item.adminOnly)
  })).filter((section) => section.items.length);
}

function isPageActive(activePage, page) {
  return activePage === page || navigationParentForPage(activePage) === page;
}

export function initMobileNav(store) {
  const root = document.getElementById("mobileNavRoot");
  if (!root) return;

  root.__mobileNavState = root.__mobileNavState || {
    moreOpen: false
  };

  function haptic(style = "light") {
    if (navigator.vibrate) {
      const patterns = { light: 8, medium: 15, heavy: 25 };
      navigator.vibrate(patterns[style] || 8);
    }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.00001, ctx.currentTime);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.01);
    } catch (e) {}
  }

  const setMobileNavState = (patch = {}) => {
    root.__mobileNavState = {
      ...root.__mobileNavState,
      ...patch
    };
    render(store.getState());
  };

  const render = (state) => {
    const activePage = state.ui.activePage;
    const isAdmin = state.auth?.user?.is_admin === true || state.auth?.user?.role === "admin";
    const visibleMoreListSections = visibleSectionsFor(moreListSections, isAdmin);
    const hasPrimaryMatch = primaryItems.some((item) => isPageActive(activePage, item.page));
    const moreOpen = Boolean(root.__mobileNavState.moreOpen);
    const moreActive = !hasPrimaryMatch || moreOpen;
    const isAuthenticated = state.auth?.status === "authenticated";

    root.innerHTML = `
      <div class="bnav-more-overlay ${moreOpen ? "open" : ""}" data-bnav-close-overlay></div>
      <section class="bnav-more-menu ${moreOpen ? "open" : ""}" aria-hidden="${moreOpen ? "false" : "true"}">
        <div class="bnav-more-title">Más secciones</div>
        <div class="bnav-more-top-actions">
          ${morePrimaryActions.map((item) => `
            <button class="bnav-more-top-item ${isPageActive(activePage, item.page) ? "active" : ""}" type="button" data-bnav-page="${item.page}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">${item.icon}</svg>
              <span>${item.label}</span>
            </button>
          `).join("")}
        </div>
        <div class="bnav-more-sections">
          ${visibleMoreListSections.map((section) => `
            <div class="bnav-more-section">
              <div class="bnav-more-section-label">${section.label}</div>
              <div class="bnav-more-list">
                ${section.items.map((item) => `
                  <button class="bnav-more-item ${activePage === item.page ? "active" : ""} ${item.danger ? "bnav-more-item--danger" : ""}" type="button" data-bnav-page="${item.page}">
                    <span class="bnav-more-item-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">${item.icon}</svg>
                    </span>
                    <span class="bnav-more-item-label">${item.label}</span>
                  </button>
                `).join("")}
              </div>
            </div>
          `).join("")}
        </div>
        ${isAuthenticated ? `
          <div class="bnav-more-actions">
            <button class="bnav-more-item bnav-more-item--action bnav-more-item--danger" type="button" data-bnav-action="logout">
              Cerrar sesión
            </button>
          </div>
        ` : ""}
      </section>

      <nav class="bottom-nav" aria-label="Navegación móvil principal">
        ${primaryItems.map((item) => `
          <button class="bnav-item ${isPageActive(activePage, item.page) ? "active" : ""}" type="button" data-bnav-page="${item.page}">
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
    const actionButton = event.target.closest("[data-bnav-action]");

    if (closeOverlay) {
      haptic();
      setMobileNavState({ moreOpen: false });
      return;
    }

    if (moreButton) {
      haptic();
      setMobileNavState({ moreOpen: !root.__mobileNavState.moreOpen });
      return;
    }

    if (pageButton) {
      const page = pageButton.dataset.bnavPage;
      const analyticsTab = analyticsTabForPage(page);
      haptic();
      setMobileNavState({ moreOpen: false });
      store.setState((state) => ({
        ...state,
        ui: {
          ...state.ui,
          activePage: page,
          ...(analyticsTab ? { analyticsTab } : {})
        }
      }));
      return;
    }

    if (actionButton?.dataset.bnavAction === "logout") {
      setMobileNavState({ moreOpen: false });
      window.kmfxAuth?.signOut?.();
    }
  });

  render(store.getState());
  store.subscribe(render);
}
