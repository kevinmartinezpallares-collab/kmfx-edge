const SIDEBAR_STORAGE_KEY = "kmfx_sidebar_state";
const MOBILE_SIDEBAR_STORAGE_KEY = "kmfx_mobile_sidebar_state";
const COLLAPSED_VALUE = "collapsed";
const EXPANDED_VALUE = "expanded";
const MOBILE_MEDIA_QUERY = "(max-width: 920px)";

function isMobileSidebarViewport() {
  return window.matchMedia?.(MOBILE_MEDIA_QUERY).matches === true;
}

function readStoredSidebarState(isMobile = isMobileSidebarViewport()) {
  try {
    const key = isMobile ? MOBILE_SIDEBAR_STORAGE_KEY : SIDEBAR_STORAGE_KEY;
    const fallback = isMobile ? COLLAPSED_VALUE : EXPANDED_VALUE;
    return window.localStorage?.getItem(key) || fallback;
  } catch (error) {
    return isMobile ? COLLAPSED_VALUE : EXPANDED_VALUE;
  }
}

function persistSidebarState(isCollapsed, isMobile = isMobileSidebarViewport()) {
  try {
    const key = isMobile ? MOBILE_SIDEBAR_STORAGE_KEY : SIDEBAR_STORAGE_KEY;
    window.localStorage?.setItem(key, isCollapsed ? COLLAPSED_VALUE : EXPANDED_VALUE);
  } catch (error) {
    // localStorage can be unavailable in restricted contexts; layout still works.
  }
}

function emitLayoutChange(isCollapsed) {
  window.dispatchEvent(new CustomEvent("kmfx:layout-change", {
    detail: {
      sidebar: isCollapsed ? COLLAPSED_VALUE : EXPANDED_VALUE,
      collapsed: isCollapsed
    }
  }));
}

function applySidebarState(shell, toggle, isCollapsed, shouldPersist = true) {
  const sidebar = shell.querySelector(".sidebar");
  const toggles = document.querySelectorAll("[data-sidebar-vnext-toggle], [data-sidebar-mobile-toggle]");
  const mobileToggle = document.querySelector("[data-sidebar-mobile-toggle]");
  const mobileBackdrop = document.querySelector("[data-mobile-sidebar-backdrop]");
  const isMobile = isMobileSidebarViewport();
  shell.classList.toggle("sidebar-vnext-collapsed", isCollapsed);
  shell.classList.toggle("sidebar-mobile-open", isMobile && !isCollapsed);
  shell.dataset.sidebarViewport = isMobile ? "mobile" : "desktop";
  shell.dataset.sidebarState = isCollapsed ? COLLAPSED_VALUE : EXPANDED_VALUE;
  shell.dataset.collapsible = isCollapsed ? "icon" : "";
  sidebar?.setAttribute("data-state", isCollapsed ? COLLAPSED_VALUE : EXPANDED_VALUE);
  sidebar?.setAttribute("data-collapsible", isCollapsed ? "icon" : "");
  toggles.forEach((control) => {
    control.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
  });
  toggle?.setAttribute("aria-label", isCollapsed ? "Expandir sidebar" : "Colapsar sidebar");
  toggle?.setAttribute("title", isCollapsed ? "Expandir sidebar" : "Colapsar sidebar");
  mobileToggle?.setAttribute("aria-label", isCollapsed ? "Abrir sidebar" : "Cerrar sidebar");
  mobileToggle?.setAttribute("title", isCollapsed ? "Abrir sidebar" : "Cerrar sidebar");
  if (mobileBackdrop) {
    mobileBackdrop.hidden = !isMobile || isCollapsed;
    mobileBackdrop.setAttribute("aria-hidden", (!isMobile || isCollapsed) ? "true" : "false");
  }
  document.body.classList.toggle("sidebar-mobile-open", isMobile && !isCollapsed);

  if (shouldPersist) {
    persistSidebarState(isCollapsed, isMobile);
  }
  emitLayoutChange(isCollapsed);
}

export function initSidebarVNext() {
  const shell = document.querySelector(".app-shell");
  const toggle = document.querySelector("[data-sidebar-vnext-toggle]");
  const controls = document.querySelectorAll("[data-sidebar-vnext-toggle], [data-sidebar-mobile-toggle], [data-mobile-sidebar-backdrop]");
  if (!shell) return;

  shell.classList.add("sidebar-vnext");

  const storedState = readStoredSidebarState();
  applySidebarState(shell, toggle, storedState === COLLAPSED_VALUE, false);

  controls.forEach((control) => {
    control.addEventListener("click", () => {
      const isBackdrop = control.hasAttribute("data-mobile-sidebar-backdrop");
      const isCollapsed = isBackdrop ? true : !shell.classList.contains("sidebar-vnext-collapsed");
      applySidebarState(shell, toggle, isCollapsed);
    });
  });

  document.addEventListener("keydown", (event) => {
    const isEditableTarget = event.target instanceof HTMLElement
      && Boolean(event.target.closest("input, textarea, select, [contenteditable='true']"));
    if (event.key === "Escape" && isMobileSidebarViewport() && !shell.classList.contains("sidebar-vnext-collapsed")) {
      applySidebarState(shell, toggle, true);
      return;
    }
    if (isEditableTarget || event.key.toLowerCase() !== "b" || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    const isCollapsed = !shell.classList.contains("sidebar-vnext-collapsed");
    applySidebarState(shell, toggle, isCollapsed);
  });

  document.addEventListener("click", (event) => {
    const navButton = event.target instanceof HTMLElement
      ? event.target.closest(".sidebar .nav-item[data-page]")
      : null;
    if (!navButton || !isMobileSidebarViewport()) return;
    if (event.target.closest(".sidebar-menu-action")) return;
    window.requestAnimationFrame(() => {
      applySidebarState(shell, toggle, true);
    });
  });

  window.addEventListener("kmfx:sidebar-close", () => {
    applySidebarState(shell, toggle, true);
  });

  const mobileQuery = window.matchMedia?.(MOBILE_MEDIA_QUERY);
  mobileQuery?.addEventListener?.("change", () => {
    const nextStoredState = readStoredSidebarState();
    applySidebarState(shell, toggle, nextStoredState === COLLAPSED_VALUE, false);
  });
}
