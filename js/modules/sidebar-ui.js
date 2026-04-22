import { formatCurrency, selectActiveAccount, selectActiveAccountId, selectLiveAccountIds, selectVisibleUserProfile } from "./utils.js?v=build-20260406-213500";
import { closeModal, openModal } from "./modal-system.js?v=build-20260406-213500";
import { applyAvatarContent } from "./avatar-utils.js?v=build-20260406-213500";

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function resolveSidebarAccounts(state) {
  const liveIds = selectLiveAccountIds(state);
  return liveIds
    .map((accountId) => state.accounts?.[accountId])
    .filter((account) => account && typeof account === "object");
}

function resolveAccountOptionLabel(account) {
  return resolveAccountDisplayName(account);
}

function resolveAccountDisplayName(account) {
  return account?.login
    || account?.server
    || account?.broker
    || account?.meta?.nickname
    || account?.dashboardPayload?.nickname
    || account?.name
    || "Cuenta";
}

function resolveAccountContextLabel(account) {
  return "";
}

function buildSidebarMenuIcon(kind) {
  if (kind === "settings") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z"></path>
      </svg>
    `;
  }

  if (kind === "logout") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M10 6H6.8A1.8 1.8 0 0 0 5 7.8v8.4A1.8 1.8 0 0 0 6.8 18H10"></path>
        <path d="M14 8l4 4-4 4"></path>
        <path d="M18 12H9"></path>
      </svg>
    `;
  }

  return "";
}

function resolveAccountBalance(account) {
  const modelBalance = Number(account?.model?.account?.balance);
  if (Number.isFinite(modelBalance)) return formatCurrency(modelBalance, account?.model?.account?.currency);
  const payloadBalance = Number(account?.dashboardPayload?.balance);
  if (Number.isFinite(payloadBalance)) return formatCurrency(payloadBalance, account?.dashboardPayload?.currency);
  return formatCurrency(0);
}

function resolveAccountIcon(account) {
  const platform = String(account?.platform || account?.sourceType || "mt5").toLowerCase();
  if (platform === "mt4") return { kind: "chevron", value: "▾" };
  if (platform === "mt5") return { kind: "image", value: "./assets/logos/mt5-logo.png", alt: "MT5" };
  return { kind: "chevron", value: "▾" };
}

function dispatchOpenConnectionWizard(source = "sidebar") {
  window.dispatchEvent(new CustomEvent("kmfx:open-connection-wizard", {
    detail: {
      source
    }
  }));
}

function openSidebarAccountPicker(store, state) {
  const accounts = resolveSidebarAccounts(state);
  const activeAccountId = selectActiveAccountId(state);

  openModal({
    title: "Cuentas de trading",
    subtitle: "Selecciona la cuenta con la que quieres trabajar.",
    maxWidth: 760,
    content: `
      <div class="sidebar-account-picker">
        <div class="sidebar-account-picker__list">
          ${accounts.map((account) => {
            const accountIcon = resolveAccountIcon(account);
            const iconMarkup = typeof accountIcon === "object" && accountIcon.kind === "image"
              ? `<img class="sidebar-account-switcher__icon-image" src="${escapeHtml(accountIcon.value)}" alt="${escapeHtml(accountIcon.alt || "")}">`
              : `<span class="sidebar-account-switcher__icon-glyph" aria-hidden="true">${escapeHtml(typeof accountIcon === "object" ? accountIcon.value : accountIcon)}</span>`;
            const isActive = account.id === activeAccountId;
            return `
              <button class="sidebar-account-picker__item ${isActive ? "is-active" : ""}" type="button" data-sidebar-account-option="${escapeHtml(account.id)}">
                <span class="sidebar-account-picker__item-icon" aria-hidden="true">${iconMarkup}</span>
                <span class="sidebar-account-picker__item-copy">
                  <span class="sidebar-account-picker__item-title">${escapeHtml(resolveAccountDisplayName(account))}</span>
                  <span class="sidebar-account-picker__item-balance">${escapeHtml(resolveAccountBalance(account))}</span>
                </span>
                ${isActive ? `<span class="sidebar-account-picker__item-check" aria-hidden="true">✓</span>` : ""}
              </button>
            `;
          }).join("")}
        </div>
        <div class="sidebar-account-picker__footer">
          <button class="sidebar-account-picker__add" type="button" data-sidebar-account-add="true">
            <span class="sidebar-account-picker__add-icon" aria-hidden="true">+</span>
            <span class="sidebar-account-picker__add-copy">
              <span class="sidebar-account-picker__add-title">Añadir cuenta de trading</span>
              <span class="sidebar-account-picker__add-subtitle">Conecta una nueva cuenta</span>
            </span>
          </button>
        </div>
      </div>
    `,
    onMount(card) {
      card?.querySelectorAll("[data-sidebar-account-option]").forEach((button) => {
        button.addEventListener("click", () => {
          const accountId = button.getAttribute("data-sidebar-account-option");
          const currentState = store.getState();
          const account = currentState.accounts?.[accountId];
          if (!accountId || !account) return;
          store.setState((current) => ({
            ...current,
            currentAccount: accountId,
            activeLiveAccountId: accountId,
            activeAccountId: accountId,
            mode: Array.isArray(current.liveAccountIds) && current.liveAccountIds.length > 0 ? "live" : current.mode,
          }));
          closeModal();
        });
      });

      card?.querySelector("[data-sidebar-account-add]")?.addEventListener("click", () => {
        closeModal();
        dispatchOpenConnectionWizard("sidebar-account-picker");
      });
    }
  });
}

export function initSidebarUI(store) {
  const shell = document.querySelector(".app-shell");
  const settingsShortcut = document.getElementById("sidebarSettingsShortcut");
  const accountRoot = document.getElementById("sidebarAccountSlot");
  const profileRoot = document.getElementById("sidebarProfile");

  if (!shell) return;
  shell.classList.remove("sidebar-collapsed");

  const positionProfileMenu = () => {
    const menu = profileRoot?.querySelector(".sidebar-profile-menu");
    const trigger = profileRoot?.querySelector("[data-sidebar-menu-toggle]");
    if (!menu || !trigger || !profileRoot?.__menuOpen) return;

    const viewportPadding = 16;
    const sideOffset = 8;
    const isCollapsed = shell.classList.contains("sidebar-vnext-collapsed");
    const triggerRect = trigger.getBoundingClientRect();

    menu.style.left = "0px";
    menu.style.top = "0px";
    menu.style.right = "auto";
    menu.style.bottom = "auto";

    const menuWidth = menu.offsetWidth || 272;
    const menuHeight = menu.offsetHeight || 220;

    let left = triggerRect.right - menuWidth;
    let top = triggerRect.top - menuHeight - sideOffset;
    let side = "top";

    if (isCollapsed) {
      left = triggerRect.right + 12;
      top = triggerRect.bottom - menuHeight;
      side = "right";
    }

    if (!isCollapsed && top < viewportPadding) {
      top = triggerRect.bottom + sideOffset;
      side = "bottom";
    }

    if (isCollapsed && top < viewportPadding) {
      top = viewportPadding;
    }

    if (top + menuHeight > window.innerHeight - viewportPadding) {
      top = Math.max(viewportPadding, window.innerHeight - menuHeight - viewportPadding);
    }

    if (left + menuWidth > window.innerWidth - viewportPadding) {
      left = window.innerWidth - menuWidth - viewportPadding;
    }

    if (left < viewportPadding) {
      left = viewportPadding;
    }

    menu.dataset.side = side;
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  };

  const syncMenuState = () => {
    const menu = profileRoot?.querySelector(".sidebar-profile-menu");
    const isOpen = Boolean(profileRoot?.__menuOpen);
    const toggles = profileRoot?.querySelectorAll("[data-sidebar-menu-toggle]") || [];
    if (!menu) {
      toggles.forEach((toggle) => {
        toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      });
      return;
    }

    clearTimeout(profileRoot.__menuCloseTimer);
    if (menu) {
      if (isOpen) {
        menu.hidden = false;
        requestAnimationFrame(() => {
          positionProfileMenu();
          menu.classList.add("is-open");
        });
      } else {
        menu.classList.remove("is-open");
        profileRoot.__menuCloseTimer = window.setTimeout(() => {
          if (!profileRoot?.__menuOpen) {
            menu.hidden = true;
          }
        }, 140);
      }
    }
    toggles.forEach((toggle) => {
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  };

  settingsShortcut?.addEventListener("click", () => {
    store.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        activePage: "settings"
      }
    }));
  });

  document.addEventListener("pointerdown", (event) => {
    if (!profileRoot?.contains(event.target)) {
      profileRoot.__menuOpen = false;
      syncMenuState();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && profileRoot?.__menuOpen) {
      profileRoot.__menuOpen = false;
      syncMenuState();
    }
  });

  window.addEventListener("resize", () => {
    positionProfileMenu();
  });

  window.addEventListener("scroll", () => {
    positionProfileMenu();
  }, true);

  accountRoot?.addEventListener("change", (event) => {
    const select = event.target.closest("[data-sidebar-account-select]");
    if (!select) return;
    const accountId = select.value;
    const state = store.getState();
    const account = state.accounts?.[accountId];
    if (!accountId || !account || accountId === state.currentAccount) return;

    store.setState((current) => ({
      ...current,
      currentAccount: accountId,
      activeLiveAccountId: accountId,
      activeAccountId: accountId,
      mode: Array.isArray(current.liveAccountIds) && current.liveAccountIds.length > 0 ? "live" : current.mode,
    }));
  });

  accountRoot?.addEventListener("click", (event) => {
    const pickerTrigger = event.target.closest("[data-sidebar-account-picker]");
    if (!pickerTrigger) return;
    event.preventDefault();
    openSidebarAccountPicker(store, store.getState());
  });

  accountRoot?.addEventListener("keydown", (event) => {
    const pickerTrigger = event.target.closest("[data-sidebar-account-picker]");
    if (!pickerTrigger) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openSidebarAccountPicker(store, store.getState());
  });

  const renderProfile = (state) => {
    if (!profileRoot) return;
    const profile = selectVisibleUserProfile(state);
    const traderName = profile.name || "Usuario";
    const email = profile.email || "Sin sesión";
    const initials = profile.initials || "KM";
    const isAuthenticated = state.auth?.status === "authenticated";
    const isMenuOpen = Boolean(profileRoot.__menuOpen);
    const accounts = resolveSidebarAccounts(state);
    const activeAccountId = selectActiveAccountId(state);
    const activeAccount = selectActiveAccount(state) || accounts[0] || null;
    const activeAccountName = activeAccount ? resolveAccountDisplayName(activeAccount) : "";
    const activeAccountBalance = activeAccount ? resolveAccountBalance(activeAccount) : "";
    const activeAccountContext = activeAccount ? resolveAccountContextLabel(activeAccount) : "";
    const activeAccountIcon = activeAccount ? resolveAccountIcon(activeAccount) : "+";
    const accountIconMarkup = typeof activeAccountIcon === "object" && activeAccountIcon.kind === "image"
      ? `<img class="sidebar-account-switcher__icon-image" src="${escapeHtml(activeAccountIcon.value)}" alt="${escapeHtml(activeAccountIcon.alt || "")}">`
      : `<span class="sidebar-account-switcher__icon-glyph" aria-hidden="true">${escapeHtml(typeof activeAccountIcon === "object" ? activeAccountIcon.value : activeAccountIcon)}</span>`;
    const accountBlock = !accounts.length
      ? `
        <button class="sidebar-account-switcher sidebar-account-switcher--empty" type="button" data-open-connection-wizard="true" data-connection-source="sidebar">
          <span class="sidebar-account-switcher__icon" aria-hidden="true">
            <span class="sidebar-account-switcher__icon-glyph" aria-hidden="true">+</span>
          </span>
          <span class="sidebar-account-switcher__copy">
            <span class="sidebar-account-switcher__title">Añadir cuenta</span>
          </span>
        </button>
      `
      : `
          <button class="sidebar-account-switcher sidebar-account-switcher--button" type="button" data-sidebar-account-picker="true" aria-label="Abrir selector de cuentas">
            <div class="sidebar-account-switcher__icon" aria-hidden="true">${accountIconMarkup}</div>
            <div class="sidebar-account-switcher__copy">
              <div class="sidebar-account-switcher__title" title="${escapeHtml(activeAccountName)}">${escapeHtml(activeAccountName)}</div>
              ${activeAccountContext ? `<div class="sidebar-account-switcher__meta">${escapeHtml(activeAccountContext)}</div>` : ""}
              <div class="sidebar-account-switcher__balance">${escapeHtml(activeAccountBalance)}</div>
            </div>
          </button>
        `;

    if (accountRoot) {
      accountRoot.innerHTML = accountBlock;
    }

    profileRoot.innerHTML = `
      <button class="sidebar-profile-trigger" type="button" aria-label="Abrir acciones de usuario" aria-expanded="${isMenuOpen ? "true" : "false"}" data-sidebar-menu-toggle>
        <div class="sidebar-profile-main">
          <div class="sidebar-profile-avatar" data-user-avatar></div>
          <div class="sidebar-profile-copy">
            <div class="sidebar-profile-name">${traderName}</div>
            <div class="sidebar-profile-sub" title="${email}">${email}</div>
          </div>
        </div>
        <span class="sidebar-profile-menu-btn" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="12" cy="19" r="1.8"></circle></svg>
        </span>
      </button>
      <div class="sidebar-profile-menu ${isMenuOpen ? "is-open" : ""}" ${isMenuOpen ? "" : "hidden"}>
        <div class="sidebar-profile-menu__identity">
          <div class="sidebar-profile-menu__avatar" data-user-menu-avatar></div>
          <div class="sidebar-profile-menu__identity-copy">
            <div class="sidebar-profile-menu__identity-name">${traderName}</div>
            <div class="sidebar-profile-menu__identity-email" title="${email}">${email}</div>
          </div>
        </div>
        <div class="sidebar-profile-menu__divider" role="presentation"></div>
        <div class="sidebar-profile-menu__section" aria-label="Acciones de cuenta">
          <button class="sidebar-profile-menu-item" type="button" data-sidebar-action="settings">
            <span class="sidebar-profile-menu-item__icon" aria-hidden="true">${buildSidebarMenuIcon("settings")}</span>
            <span class="sidebar-profile-menu-item__label">Configuración</span>
          </button>
        </div>
        ${isAuthenticated ? `
          <div class="sidebar-profile-menu__divider" role="presentation"></div>
          <div class="sidebar-profile-menu__section sidebar-profile-menu__section--danger" aria-label="Sesión">
            <button class="sidebar-profile-menu-item danger" type="button" data-sidebar-action="logout">
              <span class="sidebar-profile-menu-item__icon" aria-hidden="true">${buildSidebarMenuIcon("logout")}</span>
              <span class="sidebar-profile-menu-item__label">Cerrar sesión</span>
            </button>
          </div>
        ` : ""}
      </div>
    `;

    applyAvatarContent(profileRoot.querySelector("[data-user-avatar]"), {
      avatarUrl: profile.avatar,
      initials,
      name: traderName
    });

    applyAvatarContent(profileRoot.querySelector("[data-user-menu-avatar]"), {
      avatarUrl: profile.avatar,
      initials,
      name: traderName
    });

    profileRoot.querySelector("[data-sidebar-menu-toggle]")?.addEventListener("click", (event) => {
      event.stopPropagation();
      profileRoot.__menuOpen = !profileRoot.__menuOpen;
      syncMenuState();
    });

    profileRoot.querySelector('[data-sidebar-action="settings"]')?.addEventListener("click", (event) => {
      event.stopPropagation();
      profileRoot.__menuOpen = false;
      syncMenuState();
      store.setState((prev) => ({
        ...prev,
        ui: {
          ...prev.ui,
          activePage: "settings"
        }
      }));
    });

    profileRoot.querySelector('[data-sidebar-action="logout"]')?.addEventListener("click", async (event) => {
      event.stopPropagation();
      profileRoot.__menuOpen = false;
      syncMenuState();
      await window.kmfxAuth?.signOut?.();
    });

    syncMenuState();

  };

  renderProfile(store.getState());
  store.subscribe(renderProfile);
}
