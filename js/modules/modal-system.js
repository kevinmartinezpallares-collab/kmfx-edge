let modalRoot = null;
let activeEscapeHandler = null;

function ensureRoot() {
  if (modalRoot) return modalRoot;
  modalRoot = document.getElementById("modalRoot");
  return modalRoot;
}

function enhanceModalSelects(scope) {
  scope.querySelectorAll(".modal-body select").forEach((select) => {
    if (select.parentElement?.classList.contains("modal-select-wrap")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "modal-select-wrap";
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);

    const chevron = document.createElement("span");
    chevron.className = "modal-select-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M6 9l6 6 6-6" stroke="#636366" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    `;
    wrapper.appendChild(chevron);
  });
}

export function closeModal() {
  const root = ensureRoot();
  if (!root) return;
  root.innerHTML = "";
  document.body.classList.remove("modal-open");
  if (activeEscapeHandler) {
    document.removeEventListener("keydown", activeEscapeHandler);
    activeEscapeHandler = null;
  }
}

function resolveModalWidth(maxWidth) {
  return typeof maxWidth === "number" ? `${maxWidth}px` : (maxWidth || "560px");
}

function mountModal({ maxWidth = 560, overlayClass = "", cardClass = "", content = "", onMount } = {}) {
  const root = ensureRoot();
  if (!root) return;

  root.innerHTML = `
    <div class="modal-overlay ${overlayClass}" data-modal-dismiss="true">
      <div class="modal-card ${cardClass}" style="max-width:${resolveModalWidth(maxWidth)}" role="dialog" aria-modal="true">
        ${content}
      </div>
    </div>
  `;

  document.body.classList.add("modal-open");
  enhanceModalSelects(root);

  const overlay = root.querySelector(".modal-overlay");
  const card = root.querySelector(".modal-card");
  const dismissButtons = root.querySelectorAll(".modal-close, [data-modal-dismiss='true']");

  requestAnimationFrame(() => {
    overlay?.classList.add("open");
  });

  overlay?.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeModal();
    }
  });

  card?.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  dismissButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeModal();
    });
  });

  activeEscapeHandler = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
    }
  };
  document.addEventListener("keydown", activeEscapeHandler);

  if (typeof onMount === "function") onMount(card);
}

export function openModal({ title, subtitle = "", maxWidth = 560, content = "", onMount } = {}) {
  mountModal({
    maxWidth,
    content: `
      <div class="modal-head">
        <div>
          <div class="modal-title">${title || "KMFX Edge"}</div>
          ${subtitle ? `<div class="modal-subtitle">${subtitle}</div>` : ""}
        </div>
        <button class="modal-close" type="button" aria-label="Cerrar">✕</button>
      </div>
      <div class="modal-body">${content}</div>
    `,
    onMount
  });
}

export function openFocusPanel({
  title,
  status = "",
  statusTone = "neutral",
  meta = "",
  pnl = "",
  pnlClass = "",
  metrics = [],
  metricStyle = "grid",
  content = "",
  maxWidth = "82vw",
  onMount
} = {}) {
  const metricMarkup = metrics.map((metric) => `
    <article class="focus-panel-metric">
      <div class="focus-panel-metric__label">${metric.label}</div>
      <div class="focus-panel-metric__value ${metric.valueClass || ""}">${metric.value}</div>
    </article>
  `).join("");

  mountModal({
    maxWidth,
    overlayClass: "modal-overlay--focus-panel",
    cardClass: "modal-card--focus-panel",
    content: `
      <div class="modal-body modal-body--focus-panel">
        <button class="modal-close focus-panel-close" type="button" aria-label="Cerrar">✕</button>
        <div class="focus-panel">
          <header class="focus-panel__header">
            <div class="focus-panel__identity">
              <div class="focus-panel__title-row">
                <h2 class="focus-panel__title">${title || "Detalle"}</h2>
                ${status ? `<span class="focus-panel__status focus-panel__status--${statusTone}">${status}</span>` : ""}
              </div>
              ${meta ? `<div class="focus-panel__meta">${meta}</div>` : ""}
            </div>
            ${pnl ? `<div class="focus-panel__pnl ${pnlClass}">${pnl}</div>` : ""}
          </header>
          ${metricMarkup ? `<section class="focus-panel__metrics focus-panel__metrics--${metricStyle}">${metricMarkup}</section>` : ""}
          <div class="focus-panel__content">${content}</div>
        </div>
      </div>
    `,
    onMount
  });
}
