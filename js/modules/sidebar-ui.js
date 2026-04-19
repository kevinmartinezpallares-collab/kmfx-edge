import { formatCurrency, selectActiveAccount, selectActiveAccountId, selectLiveAccountIds, selectVisibleUserProfile } from "./utils.js?v=build-20260406-213500";
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
  return account?.server
    || account?.broker
    || account?.meta?.nickname
    || account?.dashboardPayload?.nickname
    || account?.name
    || "Cuenta";
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
  if (platform === "mt4") return "4";
  return "5";
}

export function initSidebarUI(store) {
  const shell = document.querySelector(".app-shell");
  const settingsShortcut = document.getElementById("sidebarSettingsShortcut");
  const accountRoot = document.getElementById("sidebarAccountSlot");
  const profileRoot = document.getElementById("sidebarProfile");

  if (!shell) return;
  shell.classList.remove("sidebar-collapsed");

  const syncMenuState = () => {
    const menu = profileRoot?.querySelector(".sidebar-profile-menu");
    const toggle = profileRoot?.querySelector("[data-sidebar-menu-toggle]");
    const isOpen = Boolean(profileRoot?.__menuOpen);
    if (menu) {
      menu.hidden = !isOpen;
      menu.classList.toggle("is-open", isOpen);
    }
    if (toggle) {
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }
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
    const activeAccountIcon = activeAccount ? resolveAccountIcon(activeAccount) : "+";
    const showAccountSelect = accounts.length > 1;
    const accountBlock = !accounts.length
      ? `
        <button class="sidebar-account-switcher sidebar-account-switcher--empty" type="button" data-open-connection-wizard="true" data-connection-source="sidebar">
          <span class="sidebar-account-switcher__icon" aria-hidden="true">+</span>
          <span class="sidebar-account-switcher__copy">
            <span class="sidebar-account-switcher__title">Añadir cuenta</span>
          </span>
        </button>
      `
      : showAccountSelect
        ? `
          <div class="sidebar-account-switcher">
            <div class="sidebar-account-switcher__icon" aria-hidden="true">${escapeHtml(activeAccountIcon)}</div>
            <div class="sidebar-account-switcher__copy">
              <select class="sidebar-account-switcher__select" data-sidebar-account-select aria-label="Seleccionar cuenta activa">
              ${accounts.map((account) => `<option value="${escapeHtml(account.id)}" ${account.id === activeAccountId ? "selected" : ""}>${escapeHtml(resolveAccountOptionLabel(account))}</option>`).join("")}
              </select>
              <div class="sidebar-account-switcher__balance">${escapeHtml(activeAccountBalance)}</div>
            </div>
          </div>
        `
        : `
          <div class="sidebar-account-switcher">
            <div class="sidebar-account-switcher__icon" aria-hidden="true">${escapeHtml(activeAccountIcon)}</div>
            <div class="sidebar-account-switcher__copy">
              <div class="sidebar-account-switcher__title" title="${escapeHtml(activeAccountName)}">${escapeHtml(activeAccountName)}</div>
              <div class="sidebar-account-switcher__balance">${escapeHtml(activeAccountBalance)}</div>
            </div>
          </div>
        `;

    if (accountRoot) {
      accountRoot.innerHTML = accountBlock;
    }

    profileRoot.innerHTML = `
      <div class="sidebar-profile-main">
        <div class="sidebar-profile-avatar" data-user-avatar></div>
        <div class="sidebar-profile-copy">
          <div class="sidebar-profile-name">${traderName}</div>
          <div class="sidebar-profile-sub" title="${email}">${email}</div>
        </div>
      </div>
      <button class="sidebar-profile-menu-btn" type="button" aria-label="Abrir acciones de usuario" aria-expanded="${isMenuOpen ? "true" : "false"}" data-sidebar-menu-toggle>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="12" cy="19" r="1.8"></circle></svg>
      </button>
      <div class="sidebar-profile-menu ${isMenuOpen ? "is-open" : ""}" ${isMenuOpen ? "" : "hidden"}>
        <button class="sidebar-profile-menu-item" type="button" data-sidebar-action="settings">Ajustes</button>
        ${isAuthenticated ? `<button class="sidebar-profile-menu-item danger" type="button" data-sidebar-action="logout">Cerrar sesión</button>` : ""}
      </div>
    `;

    applyAvatarContent(profileRoot.querySelector("[data-user-avatar]"), {
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
  };

  renderProfile(store.getState());
  store.subscribe(renderProfile);
}
