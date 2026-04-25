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
