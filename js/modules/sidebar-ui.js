import { selectVisibleUserProfile } from "./utils.js?v=build-20260406-203500";
import { applyAvatarContent } from "./avatar-utils.js?v=build-20260406-203500";

export function initSidebarUI(store) {
  const shell = document.querySelector(".app-shell");
  const settingsShortcut = document.getElementById("sidebarSettingsShortcut");
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

  const renderProfile = (state) => {
    if (!profileRoot) return;
    const profile = selectVisibleUserProfile(state);
    const traderName = profile.name || "Usuario";
    const email = profile.email || "Sin sesión";
    const initials = profile.initials || "KM";
    const isAuthenticated = state.auth?.status === "authenticated";
    const isMenuOpen = Boolean(profileRoot.__menuOpen);

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
