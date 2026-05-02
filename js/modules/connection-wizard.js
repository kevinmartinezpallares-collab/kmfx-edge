import { closeModal, openModal } from "./modal-system.js?v=build-20260406-213500";

const LAUNCHER_DOWNLOAD_URL = "https://github.com/kevinmartinezpallares-collab/kmfx-edge/releases/latest";
const LAUNCHER_OPEN_URL = "kmfx-launcher://open";

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function openLauncher() {
  try {
    window.location.href = LAUNCHER_OPEN_URL;
    window.setTimeout(() => {
      window.open(LAUNCHER_DOWNLOAD_URL, "_blank", "noopener");
    }, 900);
  } catch {
    window.open(LAUNCHER_DOWNLOAD_URL, "_blank", "noopener");
  }
}

function downloadLauncher() {
  window.open(LAUNCHER_DOWNLOAD_URL, "_blank", "noopener");
}

function renderStepFrame(title, subtitle, content) {
  return `
    <section class="connection-wizard__section">
      <div class="connection-wizard__section-head">
        <h3 class="connection-wizard__title">${title}</h3>
        <p class="connection-wizard__subtitle">${subtitle}</p>
      </div>
      <article class="connection-wizard__card">
        ${content}
      </article>
    </section>
  `;
}

function renderWizardMarkup(state) {
  return `
    <div class="connection-wizard connection-wizard--launcher">
      ${renderStepFrame(
        "Conecta tu cuenta MT5",
        "KMFX no pide tu contraseña de MT5 ni ejecuta operaciones. Solo recibe datos enviados desde tu terminal mediante el conector.",
        `
          <div class="connection-wizard__checklist connection-wizard__checklist--numbered">
            <div class="connection-wizard__checklist-item">1. Descarga o abre KMFX Launcher.</div>
            <div class="connection-wizard__checklist-item">2. Inicia sesión con la misma cuenta de KMFX.</div>
            <div class="connection-wizard__checklist-item">3. Pulsa "Instalar conector" en tu MetaTrader 5 detectado.</div>
            <div class="connection-wizard__checklist-item">4. Abre MT5, activa Algo Trading y permite WebRequest si MT5 lo solicita.</div>
            <div class="connection-wizard__checklist-item">5. Cuando llegue el primer sync, la cuenta aparecerá en Cuentas y Dashboard.</div>
          </div>
          <div class="connection-wizard__inline-actions">
            <button class="btn-primary" type="button" data-wizard-open-launcher="true">Abrir Launcher</button>
            <button class="btn-secondary" type="button" data-wizard-download-launcher="true">Descargar Launcher</button>
          </div>
          ${state.error ? `<div class="connection-wizard__inline-error">${escapeHtml(state.error)}</div>` : ""}
        `
      )}
      <div class="connection-wizard__actions">
        <button class="btn-secondary" type="button" data-modal-dismiss="true">Cerrar</button>
      </div>
    </div>
  `;
}

function mountWizard(card, state, options = {}) {
  const body = card?.querySelector(".modal-body");
  if (!body) return;

  body.innerHTML = renderWizardMarkup(state);

  body.querySelector("[data-wizard-open-launcher='true']")?.addEventListener("click", openLauncher);
  body.querySelector("[data-wizard-download-launcher='true']")?.addEventListener("click", downloadLauncher);

  body.querySelectorAll("[data-modal-dismiss='true']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      closeModal();
    });
  });
}

export function openConnectionWizard(options = {}) {
  const state = {
    error: "",
  };

  openModal({
    title: "Conectar MT5",
    subtitle: "Instala el conector desde KMFX Launcher.",
    maxWidth: 760,
    content: `<div class="connection-wizard-shell"></div>`,
    onMount(card) {
      card?.classList.add("connection-wizard-modal");
      card?.querySelector(".modal-body")?.classList.add("connection-wizard-modal__body");
      mountWizard(card, state, options);
    },
  });
}

export function initConnectionWizard() {
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-open-connection-wizard]");
    if (!trigger) return;
    event.preventDefault();
    openConnectionWizard({
      platform: trigger.dataset.connectionPlatform || "",
      method: trigger.dataset.connectionMethod || "",
      source: trigger.dataset.connectionSource || "",
    });
  });

  window.addEventListener("kmfx:open-connection-wizard", (event) => {
    openConnectionWizard(event.detail || {});
  });

  window.KMFXConnectionWizard = {
    open: openConnectionWizard,
    close: closeModal,
  };
}
