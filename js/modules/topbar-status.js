import { selectVisibleUserProfile } from "./utils.js";
import { applyAvatarContent } from "./avatar-utils.js";

export function initTopbarStatus(store) {
  const root = document.getElementById("topbarQuickInfo");
  if (!root) return;

  const render = (state) => {
    const profile = selectVisibleUserProfile(state);
    const traderName = profile.name || "Usuario local";
    const email = profile.email || "Sin sesión";
    const initials = profile.initials || "KM";

    root.innerHTML = `
      <div class="topbar-user-shell">
        <div class="topbar-user-card">
          <div class="topbar-user-avatar" data-user-avatar></div>
          <div class="topbar-user-copy">
            <div class="topbar-user-name">${traderName}</div>
            <div class="topbar-user-context">${email}</div>
          </div>
        </div>
        <div class="topbar-time-stack">
          <div class="meta-date" id="currentDate">--</div>
          <div class="meta-clock" id="clock">--:--:--</div>
        </div>
      </div>
    `;

    applyAvatarContent(root.querySelector("[data-user-avatar]"), {
      avatarUrl: profile.avatar,
      initials,
      name: traderName
    });
  };

  render(store.getState());
  store.subscribe(render);
}
