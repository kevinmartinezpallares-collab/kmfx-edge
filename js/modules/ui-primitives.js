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

function isSafeAttributeName(name) {
  const attrName = String(name || "").trim();
  return /^[a-zA-Z_:][a-zA-Z0-9:._-]*$/.test(attrName) && !/^on/i.test(attrName);
}

function attributesToHtml(attributes = {}) {
  return Object.entries(attributes)
    .filter(([key, value]) => isSafeAttributeName(key) && value !== false && value != null)
    .map(([key, value]) => (value === true ? escapeHtml(key) : `${escapeHtml(key)}="${escapeHtml(value)}"`))
    .join(" ");
}

const attrsToString = attributesToHtml;

function normalizePnlTone(tone) {
  return ["profit", "loss", "breakeven", "neutral"].includes(tone) ? tone : "neutral";
}

function normalizeBadgeTone(tone) {
  return ["neutral", "profit", "loss", "warning", "risk", "info", "funded"].includes(tone) ? tone : "neutral";
}

function normalizeKpiTone(tone) {
  return ["neutral", "profit", "loss", "warning", "risk", "info"].includes(tone) ? tone : "neutral";
}

function normalizeTrendTone(tone) {
  if (tone === "positive") return "profit";
  if (tone === "negative") return "loss";
  return ["profit", "loss", "neutral"].includes(tone) ? tone : "neutral";
}

function normalizeDecisionTone(tone) {
  return ["neutral", "info", "warning", "success", "danger"].includes(tone) ? tone : "neutral";
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

export function sectionCardMarkup({
  eyebrow,
  title,
  description,
  contentHtml = "",
  footerHtml = "",
  className = "",
  headerClassName = "",
  contentClassName = "",
  attrs = {},
} = {}) {
  const rootClasses = classNames("kmfx-ui-card", className);
  const headerClasses = classNames("kmfx-ui-card__header", headerClassName);
  const contentClasses = classNames("kmfx-ui-card__content", contentClassName);
  const extraAttrs = attrsToString(attrs);
  const hasHeader = eyebrow || title || description;

  return `
    <section class="${escapeHtml(rootClasses)}"${extraAttrs ? ` ${extraAttrs}` : ""}>
      ${hasHeader ? `
        <header class="${escapeHtml(headerClasses)}">
          ${eyebrow ? `<p class="kmfx-ui-card__eyebrow">${escapeHtml(eyebrow)}</p>` : ""}
          ${title ? `<h2 class="kmfx-ui-card__title">${escapeHtml(title)}</h2>` : ""}
          ${description ? `<p class="kmfx-ui-card__description">${escapeHtml(description)}</p>` : ""}
        </header>
      ` : ""}
      ${contentHtml ? `<div class="${escapeHtml(contentClasses)}">${contentHtml}</div>` : ""}
      ${footerHtml ? `<footer class="kmfx-ui-card__footer">${footerHtml}</footer>` : ""}
    </section>
  `;
}

export function kpiCardMarkup({
  label,
  value,
  valueHtml = "",
  iconHtml = "",
  badgeHtml = "",
  headerHtml = "",
  mediaHtml = "",
  meta,
  tone = "neutral",
  trend = "",
  trendTone = "",
  trendHtml = "",
  className = "",
  attrs = {},
} = {}) {
  const resolvedTone = normalizeKpiTone(tone);
  const resolvedTrendTone = normalizeTrendTone(trendTone || tone);
  const rootClasses = classNames("kmfx-ui-card", "kmfx-ui-kpi", className);
  const extraAttrs = attrsToString(attrs);
  const displayValue = valueHtml || escapeHtml(value == null ? "" : value);
  const badgeContent = badgeHtml || trendHtml || (trend ? escapeHtml(trend) : "");
  const hasTop = iconHtml || badgeContent || headerHtml;

  return `
    <article class="${escapeHtml(rootClasses)}" data-tone="${escapeHtml(resolvedTone)}"${extraAttrs ? ` ${extraAttrs}` : ""}>
      ${hasTop ? `
        <div class="kmfx-ui-kpi__top">
          ${iconHtml ? `<div class="kmfx-ui-kpi__icon">${iconHtml}</div>` : ""}
          ${headerHtml || ""}
          ${badgeContent ? `<div class="kmfx-ui-kpi__badge"><span class="kmfx-ui-trend-badge kmfx-ui-kpi__trend" data-tone="${escapeHtml(resolvedTrendTone)}">${badgeContent}</span></div>` : ""}
        </div>
      ` : ""}
      ${mediaHtml ? `<div class="kmfx-ui-kpi__media">${mediaHtml}</div>` : ""}
      <div class="kmfx-ui-kpi__body">
        ${label ? `<p class="kmfx-ui-kpi__label">${escapeHtml(label)}</p>` : ""}
        <div class="kmfx-ui-kpi__value">${displayValue}</div>
        ${meta ? `<p class="kmfx-ui-kpi__meta">${escapeHtml(meta)}</p>` : ""}
      </div>
    </article>
  `;
}

export function decisionLayerMarkup({
  eyebrow,
  title,
  description,
  cards = [],
  className = "",
  attrs = {},
} = {}) {
  const rootClasses = classNames("kmfx-ui-decision-layer", className);
  const extraAttrs = attrsToString(attrs);

  return `
    <section class="${escapeHtml(rootClasses)}"${extraAttrs ? ` ${extraAttrs}` : ""}>
      <header class="kmfx-ui-decision-layer__header">
        <div>
          ${eyebrow ? `<p class="kmfx-ui-decision-layer__eyebrow">${escapeHtml(eyebrow)}</p>` : ""}
          ${title ? `<h2 class="kmfx-ui-decision-layer__title">${escapeHtml(title)}</h2>` : ""}
          ${description ? `<p class="kmfx-ui-decision-layer__description">${escapeHtml(description)}</p>` : ""}
        </div>
      </header>
      <div class="kmfx-ui-decision-layer__grid">
        ${cards.map((card = {}) => {
          const tone = normalizeDecisionTone(card.tone);
          return `
            <article class="kmfx-ui-decision-card" data-tone="${escapeHtml(tone)}">
              ${card.label ? `<span class="kmfx-ui-decision-card__label">${escapeHtml(card.label)}</span>` : ""}
              ${card.title ? `<h3 class="kmfx-ui-decision-card__title">${escapeHtml(card.title)}</h3>` : ""}
              ${card.description ? `<p class="kmfx-ui-decision-card__description">${escapeHtml(card.description)}</p>` : ""}
              ${card.metaHtml || ""}
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

export function kmfxBadgeMarkup({
  text,
  tone = "neutral",
  className = "",
  attrs = {},
} = {}) {
  const resolvedTone = normalizeBadgeTone(tone);
  const classes = classNames("kmfx-ui-badge", className);
  const extraAttrs = attrsToString(attrs);

  return `<span class="${escapeHtml(classes)}" data-tone="${escapeHtml(resolvedTone)}"${extraAttrs ? ` ${extraAttrs}` : ""}>${escapeHtml(text ?? "")}</span>`;
}

export function emptyStateMarkup({
  title,
  description,
  actionHtml = "",
  className = "",
  attrs = {},
} = {}) {
  const classes = classNames("kmfx-ui-empty-state", className);
  const extraAttrs = attrsToString(attrs);

  return `
    <div class="${escapeHtml(classes)}"${extraAttrs ? ` ${extraAttrs}` : ""}>
      ${title ? `<h3 class="kmfx-ui-empty-state__title">${escapeHtml(title)}</h3>` : ""}
      ${description ? `<p class="kmfx-ui-empty-state__description">${escapeHtml(description)}</p>` : ""}
      ${actionHtml || ""}
    </div>
  `;
}

export function chartCardMarkup({
  eyebrow,
  title,
  description,
  contentHtml = "",
  legendHtml = "",
  className = "",
  attrs = {},
} = {}) {
  const classes = classNames("kmfx-ui-chart-card", className);
  const extraAttrs = attrsToString(attrs);
  const hasHeader = eyebrow || title || description;

  return `
    <section class="${escapeHtml(classes)}"${extraAttrs ? ` ${extraAttrs}` : ""}>
      ${hasHeader ? `
        <header class="kmfx-ui-chart-card__header">
          <div>
            ${eyebrow ? `<p class="kmfx-ui-chart-card__eyebrow">${escapeHtml(eyebrow)}</p>` : ""}
            ${title ? `<h2 class="kmfx-ui-chart-card__title">${escapeHtml(title)}</h2>` : ""}
            ${description ? `<p class="kmfx-ui-chart-card__description">${escapeHtml(description)}</p>` : ""}
          </div>
        </header>
      ` : ""}
      ${contentHtml ? `<div class="kmfx-ui-chart-card__content">${contentHtml}</div>` : ""}
      ${legendHtml ? `<div class="kmfx-ui-chart-card__legend">${legendHtml}</div>` : ""}
    </section>
  `;
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
