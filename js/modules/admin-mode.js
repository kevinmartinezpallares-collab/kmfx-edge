export function isAdminMode(state) {
  const user = state?.auth?.user || {};
  return user.is_admin === true || user.role === "admin";
}

function escapeAdminText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAdminValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—";
  if (Array.isArray(value)) return `${value.length} items`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function renderAdminTracePanel(state, { title = "Admin trace", subtitle = "", items = [] } = {}) {
  if (!isAdminMode(state)) return "";
  const safeItems = items.filter((item) => item && item.label);
  if (!safeItems.length) return "";

  return `
    <article class="tl-section-card kmfx-admin-trace-card" data-admin-only="admin-trace">
      <div class="kmfx-admin-trace-card__head">
        <div>
          <div class="kmfx-admin-trace-card__eyebrow">Admin mode</div>
          <div class="kmfx-admin-trace-card__title">${escapeAdminText(title)}</div>
          ${subtitle ? `<div class="kmfx-admin-trace-card__sub">${escapeAdminText(subtitle)}</div>` : ""}
        </div>
        <span class="kmfx-admin-trace-card__badge">visible solo admin</span>
      </div>
      <div class="kmfx-admin-trace-card__grid">
        ${safeItems.map((item) => `
          <div class="kmfx-admin-trace-card__item">
            <span>${escapeAdminText(item.label)}</span>
            <strong>${escapeAdminText(formatAdminValue(item.value))}</strong>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}
