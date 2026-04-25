function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function classNames(...values) {
  return values
    .flat()
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function attributesToHtml(attributes = {}) {
  return Object.entries(attributes)
    .filter(([, value]) => value !== false && value != null)
    .map(([key, value]) => (value === true ? escapeHtml(key) : `${escapeHtml(key)}="${escapeHtml(value)}"`))
    .join(" ");
}

function normalizePnlTone(tone) {
  return ["profit", "loss", "breakeven", "neutral"].includes(tone) ? tone : "neutral";
}

export function pageHeaderMarkup({
  eyebrow,
  title,
  description,
  actionsHtml = "",
  className = "",
  contentClassName = "",
  eyebrowClassName = "",
  titleClassName = "",
  descriptionClassName = "",
  actionsClassName = "",
  descriptionAttributes = {},
  extraContentHtml = "",
  titleTag = "h1",
} = {}) {
  const headerClasses = classNames("kmfx-ui-page-header", className);
  const contentClasses = classNames(contentClassName);
  const eyebrowClasses = classNames("kmfx-ui-page-header__eyebrow", eyebrowClassName);
  const titleClasses = classNames("kmfx-ui-page-header__title", titleClassName);
  const descriptionClasses = classNames("kmfx-ui-page-header__description", descriptionClassName);
  const actionsClasses = classNames("kmfx-ui-page-header__actions", actionsClassName);
  const descriptionAttrs = attributesToHtml(descriptionAttributes);
  const safeTitleTag = ["h1", "h2", "h3"].includes(titleTag) ? titleTag : "h1";

  return `
    <header class="${escapeHtml(headerClasses)}">
      <div${contentClasses ? ` class="${escapeHtml(contentClasses)}"` : ""}>
        ${eyebrow ? `<p class="${escapeHtml(eyebrowClasses)}">${escapeHtml(eyebrow)}</p>` : ""}
        ${title ? `<${safeTitleTag} class="${escapeHtml(titleClasses)}">${escapeHtml(title)}</${safeTitleTag}>` : ""}
        ${description == null ? "" : `<p class="${escapeHtml(descriptionClasses)}"${descriptionAttrs ? ` ${descriptionAttrs}` : ""}>${escapeHtml(description)}</p>`}
        ${extraContentHtml || ""}
      </div>
      ${actionsHtml ? `<div class="${escapeHtml(actionsClasses)}">${actionsHtml}</div>` : ""}
    </header>
  `;
}

export function pnlTone(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "neutral";
  if (numericValue > 0) return "profit";
  if (numericValue < 0) return "loss";
  return "breakeven";
}

export function pnlTextMarkup({
  value,
  text,
  tone,
  className = "",
  attrs = {},
} = {}) {
  const resolvedTone = normalizePnlTone(tone || pnlTone(value));
  const classes = classNames("kmfx-ui-pnl", className);
  const extraAttrs = attributesToHtml(attrs);
  const displayText = text == null ? String(value ?? "") : String(text);

  return `<span class="${escapeHtml(classes)}" data-tone="${escapeHtml(resolvedTone)}"${extraAttrs ? ` ${extraAttrs}` : ""}>${escapeHtml(displayText)}</span>`;
}

export function pnlBadgeMarkup({
  value,
  text,
  tone,
  className = "",
  attrs = {},
} = {}) {
  const resolvedTone = normalizePnlTone(tone || pnlTone(value));
  const classes = classNames("kmfx-ui-pnl-badge", className);
  const extraAttrs = attributesToHtml(attrs);
  const displayText = text == null ? String(value ?? "") : String(text);

  return `<span class="${escapeHtml(classes)}" data-tone="${escapeHtml(resolvedTone)}"${extraAttrs ? ` ${extraAttrs}` : ""}>${escapeHtml(displayText)}</span>`;
}
