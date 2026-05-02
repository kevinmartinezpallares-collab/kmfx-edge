const SIDEBAR_STORAGE_KEY = "kmfx_sidebar_state";
const COLLAPSED_VALUE = "collapsed";
const EXPANDED_VALUE = "expanded";

function readStoredSidebarState() {
  try {
    return window.localStorage?.getItem(SIDEBAR_STORAGE_KEY) || EXPANDED_VALUE;
  } catch (error) {
    return EXPANDED_VALUE;
  }
}

function persistSidebarState(isCollapsed) {
  try {
    window.localStorage?.setItem(SIDEBAR_STORAGE_KEY, isCollapsed ? COLLAPSED_VALUE : EXPANDED_VALUE);
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
  shell.classList.toggle("sidebar-vnext-collapsed", isCollapsed);
  shell.dataset.sidebarState = isCollapsed ? COLLAPSED_VALUE : EXPANDED_VALUE;
  shell.dataset.collapsible = isCollapsed ? "icon" : "";
  sidebar?.setAttribute("data-state", isCollapsed ? COLLAPSED_VALUE : EXPANDED_VALUE);
  sidebar?.setAttribute("data-collapsible", isCollapsed ? "icon" : "");
  toggle?.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
  toggle?.setAttribute("aria-label", isCollapsed ? "Expandir sidebar" : "Colapsar sidebar");
  toggle?.setAttribute("title", isCollapsed ? "Expandir sidebar" : "Colapsar sidebar");

  if (shouldPersist) {
    persistSidebarState(isCollapsed);
  }
  emitLayoutChange(isCollapsed);
}

export function initSidebarVNext() {
  const shell = document.querySelector(".app-shell");
  const toggle = document.querySelector("[data-sidebar-vnext-toggle]");
  if (!shell) return;

  shell.classList.add("sidebar-vnext");

  const storedState = readStoredSidebarState();
  applySidebarState(shell, toggle, storedState === COLLAPSED_VALUE, false);

  toggle?.addEventListener("click", () => {
    const isCollapsed = !shell.classList.contains("sidebar-vnext-collapsed");
    applySidebarState(shell, toggle, isCollapsed);
  });

  document.addEventListener("keydown", (event) => {
    const isEditableTarget = event.target instanceof HTMLElement
      && Boolean(event.target.closest("input, textarea, select, [contenteditable='true']"));
    if (isEditableTarget || event.key.toLowerCase() !== "b" || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    const isCollapsed = !shell.classList.contains("sidebar-vnext-collapsed");
    applySidebarState(shell, toggle, isCollapsed);
  });
}
