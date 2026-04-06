import { selectVisibleUserProfile } from "./utils.js?v=build-20260406-203500";
import { applyAvatarContent } from "./avatar-utils.js?v=build-20260406-203500";

export function initTopbarStatus(store) {
  const root = document.getElementById("topbarQuickInfo");
  if (!root) return;

  root.innerHTML = `
    <div class="topbar-user-shell">
      <div class="topbar-user-card">
        <div class="topbar-user-avatar" data-user-avatar></div>
        <div class="topbar-user-copy">
          <div class="topbar-user-name" data-topbar-user-name>Usuario local</div>
          <div class="topbar-user-context" data-topbar-user-email>Sin sesión</div>
        </div>
      </div>
      <div class="topbar-time-stack">
        <div class="meta-date" id="currentDate">--</div>
        <div class="meta-clock" id="clock">--:--:--</div>
      </div>
    </div>
  `;

  const avatarRoot = root.querySelector("[data-user-avatar]");
  const nameEl = root.querySelector("[data-topbar-user-name]");
  const emailEl = root.querySelector("[data-topbar-user-email]");

  const render = (state) => {
    const profile = selectVisibleUserProfile(state);
    const traderName = profile.name || "Usuario local";
    const email = profile.email || "Sin sesión";
    const initials = profile.initials || "KM";

    if (nameEl) nameEl.textContent = traderName;
    if (emailEl) emailEl.textContent = email;

    applyAvatarContent(avatarRoot, {
      avatarUrl: profile.avatar,
      initials,
      name: traderName
    });
  };

  render(store.getState());
  store.subscribe(render);
}
