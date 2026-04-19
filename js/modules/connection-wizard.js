import { closeModal, openModal } from "./modal-system.js?v=build-20260406-213500";
import { resolveApiBaseUrl } from "./api-config.js?v=build-20260406-213500";
import { showToast } from "./toast.js?v=build-20260406-213500";

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

function createMockConnectionKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return "kmfx-" + Math.random().toString(16).slice(2, 10) + "-" + Date.now().toString(16).slice(-8);
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

function copyText(value, successLabel = "Copiado") {
  if (!value) return;
  const complete = () => showToast(successLabel, "success");

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).then(complete).catch(() => {
      const input = document.createElement("textarea");
      input.value = value;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      complete();
    });
    return;
  }

  const input = document.createElement("textarea");
  input.value = value;
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
  complete();
}

function renderStepDots(currentStep) {
  const labels = ["Plataforma", "Método", "Configuración", "Confirmación"];
  return `
    <div class="connection-wizard__steps" aria-label="Progreso de conexión">
      ${labels.map((label, index) => {
        const step = index + 1;
        const active = currentStep === step;
        const complete = currentStep > step;
        return `
          <div class="connection-wizard__step ${active ? "is-active" : ""} ${complete ? "is-complete" : ""}">
            <span class="connection-wizard__step-dot">${complete ? "✓" : step}</span>
            <span class="connection-wizard__step-label">${label}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderPlatformStep(state) {
  const selectedPlatform = state.platform;
  return `
    <section class="connection-wizard__section">
      <div class="connection-wizard__section-head">
        <h3 class="connection-wizard__title">Elige la plataforma</h3>
        <p class="connection-wizard__subtitle">Selecciona el entorno.</p>
      </div>
      <div class="connection-wizard__option-grid">
        <button class="connection-wizard__option widget-card ${selectedPlatform === "mt5" ? "is-selected" : ""}" type="button" data-wizard-platform="mt5">
          <span class="connection-wizard__option-badge">Principal</span>
          <div class="connection-wizard__option-icon">MT5</div>
          <div class="connection-wizard__option-copy">
            <div class="connection-wizard__option-title">MetaTrader 5</div>
            <div class="connection-wizard__option-subtitle">Listo para continuar ahora.</div>
          </div>
        </button>
        <button class="connection-wizard__option connection-wizard__option--muted widget-card" type="button" disabled aria-disabled="true">
          <span class="connection-wizard__option-badge connection-wizard__option-badge--neutral">Próximamente</span>
          <div class="connection-wizard__option-icon">MT4</div>
          <div class="connection-wizard__option-copy">
            <div class="connection-wizard__option-title">MetaTrader 4</div>
            <div class="connection-wizard__option-subtitle">Disponible más adelante.</div>
          </div>
        </button>
      </div>
    </section>
  `;
}

function renderMethodStep(state) {
  const selectedMethod = state.method;
  return `
    <section class="connection-wizard__section">
      <div class="connection-wizard__section-head">
        <h3 class="connection-wizard__title">Elige el método</h3>
        <p class="connection-wizard__subtitle">Selecciona cómo quieres conectar la cuenta.</p>
      </div>
      <div class="connection-wizard__option-grid">
        <button class="connection-wizard__option widget-card ${selectedMethod === "direct" ? "is-selected" : ""}" type="button" data-wizard-method="direct">
          <div class="connection-wizard__option-copy">
            <div class="connection-wizard__option-title">Conexión directa</div>
            <div class="connection-wizard__option-subtitle">Cuenta, password y servidor.</div>
          </div>
        </button>
        <button class="connection-wizard__option widget-card ${selectedMethod === "ea" ? "is-selected" : ""}" type="button" data-wizard-method="ea">
          <span class="connection-wizard__option-badge">Recomendado</span>
          <div class="connection-wizard__option-copy">
            <div class="connection-wizard__option-title">Expert Advisor (EA)</div>
            <div class="connection-wizard__option-subtitle">Más seguro para cuentas fondeadas.</div>
          </div>
        </button>
      </div>
    </section>
  `;
}

function renderDirectStep(state) {
  return `
    <section class="connection-wizard__section">
      <div class="connection-wizard__section-head">
        <h3 class="connection-wizard__title">Conexión directa</h3>
        <p class="connection-wizard__subtitle">Introduce los datos de acceso.</p>
      </div>
      <div class="connection-wizard__form-grid">
        <label class="form-stack">
          <span>Account Number</span>
          <input type="text" data-wizard-field="accountNumber" value="${escapeHtml(state.form.accountNumber)}" placeholder="12345678">
        </label>
        <label class="form-stack">
          <span>Server</span>
          <input type="text" data-wizard-field="server" value="${escapeHtml(state.form.server)}" placeholder="Darwinex-Live">
        </label>
        <label class="form-stack connection-wizard__form-grid--full">
          <span>Password</span>
          <input type="password" data-wizard-field="password" value="${escapeHtml(state.form.password)}" placeholder="••••••••">
        </label>
      </div>
      <div class="connection-wizard__warning">Puede no cumplir reglas de fondeo. Usa EA si operas prop firms.</div>
      ${state.error ? `<div class="connection-wizard__inline-error">${escapeHtml(state.error)}</div>` : ""}
    </section>
  `;
}

function renderEaStep(state) {
  const webRequestUrl = resolveApiBaseUrl();
  return `
    <section class="connection-wizard__section">
      <div class="connection-wizard__section-head">
        <h3 class="connection-wizard__title">Expert Advisor</h3>
        <p class="connection-wizard__subtitle">Deja el launcher listo y genera la clave.</p>
      </div>
      <div class="connection-wizard__checklist">
        <div class="connection-wizard__checklist-item">Cerrar MT5</div>
        <div class="connection-wizard__checklist-item">Iniciar sesión en Launcher</div>
        <div class="connection-wizard__checklist-item">Instalar connector</div>
        <div class="connection-wizard__checklist-item">Permitir WebRequest</div>
      </div>
      <div class="connection-wizard__utility-card">
        <div>
          <div class="connection-wizard__utility-label">WebRequest URL</div>
          <div class="connection-wizard__utility-value">${escapeHtml(webRequestUrl)}</div>
        </div>
        <button class="btn-secondary" type="button" data-wizard-copy-webrequest="true">Copiar</button>
      </div>
      ${state.error ? `<div class="connection-wizard__inline-error">${escapeHtml(state.error)}</div>` : ""}
    </section>
  `;
}

function renderConfirmationStep(state) {
  if (state.method === "direct") {
    return `
      <section class="connection-wizard__section connection-wizard__section--success">
        <div class="connection-wizard__success-icon">✓</div>
        <h3 class="connection-wizard__title">Cuenta conectada</h3>
        <p class="connection-wizard__subtitle">La conexión directa queda lista para integrarse con backend.</p>
      </section>
    `;
  }

  return `
    <section class="connection-wizard__section connection-wizard__section--success">
      <div class="connection-wizard__success-icon">✓</div>
      <h3 class="connection-wizard__title">Cuenta conectada</h3>
      <p class="connection-wizard__subtitle">Usa esta clave en el flujo del launcher.</p>
      <div class="connection-wizard__secret-card">
        <div class="connection-wizard__utility-label">Connection Key</div>
        <div class="connection-wizard__secret-value">${state.showSecret ? escapeHtml(state.generatedKey) : "••••••••-••••-••••-••••-••••••••••••"}</div>
        <div class="connection-wizard__secret-actions">
          <button class="btn-secondary" type="button" data-wizard-toggle-secret="true">${state.showSecret ? "Ocultar" : "Mostrar"}</button>
          <button class="btn-primary" type="button" data-wizard-copy-secret="true">Copiar</button>
        </div>
      </div>
    </section>
  `;
}

function renderActions(state) {
  if (state.step === 1) {
    return `
      <button class="btn-secondary" type="button" data-modal-dismiss="true">Cancelar</button>
      <button class="btn-primary" type="button" data-wizard-next="true" ${state.platform !== "mt5" ? "disabled" : ""}>Continuar</button>
    `;
  }

  if (state.step === 2) {
    return `
      <button class="btn-secondary" type="button" data-wizard-back="true">Volver</button>
      <button class="btn-primary" type="button" data-wizard-next="true" ${!state.method ? "disabled" : ""}>Continuar</button>
    `;
  }

  if (state.step === 3 && state.method === "direct") {
    return `
      <button class="btn-secondary" type="button" data-wizard-back="true">Volver</button>
      <button class="btn-primary" type="button" data-wizard-submit-direct="true">Conectar cuenta</button>
    `;
  }

  if (state.step === 3 && state.method === "ea") {
    return `
      <button class="btn-secondary" type="button" data-wizard-download-launcher="true">Descargar instalador</button>
      <button class="btn-secondary" type="button" data-wizard-open-launcher="true">Abrir launcher</button>
      <button class="btn-primary" type="button" data-wizard-generate-key="true">Generar clave de conexión</button>
    `;
  }

  return `
    <button class="btn-secondary" type="button" data-wizard-restart="true">Nueva conexión</button>
    <button class="btn-primary" type="button" data-modal-dismiss="true">Cerrar</button>
  `;
}

function renderWizardMarkup(state) {
  const body = state.step === 1
    ? renderPlatformStep(state)
    : state.step === 2
      ? renderMethodStep(state)
      : state.step === 3 && state.method === "direct"
        ? renderDirectStep(state)
        : state.step === 3
          ? renderEaStep(state)
          : renderConfirmationStep(state);

  return `
    <div class="connection-wizard">
      ${renderStepDots(state.step)}
      ${body}
      <div class="connection-wizard__actions">
        ${renderActions(state)}
      </div>
    </div>
  `;
}

function mountWizard(card, state, options = {}) {
  const body = card?.querySelector(".modal-body");
  if (!body) return;

  body.innerHTML = renderWizardMarkup(state);

  body.querySelectorAll("[data-wizard-platform]").forEach((button) => {
    button.addEventListener("click", () => {
      state.platform = button.dataset.wizardPlatform || "";
      state.error = "";
      mountWizard(card, state, options);
    });
  });

  body.querySelectorAll("[data-wizard-method]").forEach((button) => {
    button.addEventListener("click", () => {
      state.method = button.dataset.wizardMethod || "";
      state.error = "";
      mountWizard(card, state, options);
    });
  });

  body.querySelectorAll("[data-wizard-field]").forEach((input) => {
    input.addEventListener("input", () => {
      state.form[input.dataset.wizardField] = input.value;
    });
  });

  body.querySelector("[data-wizard-next='true']")?.addEventListener("click", () => {
    if (state.step === 1 && state.platform !== "mt5") return;
    if (state.step === 2 && !state.method) return;
    state.step += 1;
    mountWizard(card, state, options);
  });

  body.querySelector("[data-wizard-back='true']")?.addEventListener("click", () => {
    state.step = Math.max(1, state.step - 1);
    state.error = "";
    mountWizard(card, state, options);
  });

  body.querySelector("[data-wizard-submit-direct='true']")?.addEventListener("click", () => {
    if (!state.form.accountNumber || !state.form.password || !state.form.server) {
      state.error = "Completa número de cuenta, contraseña y servidor.";
      mountWizard(card, state, options);
      return;
    }
    state.error = "";
    state.step = 4;
    mountWizard(card, state, options);
  });

  body.querySelector("[data-wizard-open-launcher='true']")?.addEventListener("click", openLauncher);
  body.querySelector("[data-wizard-download-launcher='true']")?.addEventListener("click", downloadLauncher);
  body.querySelector("[data-wizard-copy-webrequest='true']")?.addEventListener("click", () => copyText(resolveApiBaseUrl(), "URL copiada"));

  body.querySelector("[data-wizard-generate-key='true']")?.addEventListener("click", () => {
    state.generatedKey = createMockConnectionKey();
    state.showSecret = true;
    state.error = "";
    state.step = 4;
    mountWizard(card, state, options);
  });

  body.querySelector("[data-wizard-toggle-secret='true']")?.addEventListener("click", () => {
    state.showSecret = !state.showSecret;
    mountWizard(card, state, options);
  });

  body.querySelector("[data-wizard-copy-secret='true']")?.addEventListener("click", () => copyText(state.generatedKey, "Clave copiada"));

  body.querySelector("[data-wizard-restart='true']")?.addEventListener("click", () => {
    state.step = 1;
    state.platform = "mt5";
    state.method = "";
    state.generatedKey = "";
    state.showSecret = true;
    state.form = { accountNumber: "", password: "", server: "" };
    state.error = "";
    mountWizard(card, state, options);
  });

  body.querySelectorAll("[data-modal-dismiss='true']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      closeModal();
    });
  });
}

export function openConnectionWizard(options = {}) {
  const state = {
    step: options.method ? 3 : options.platform ? 2 : 1,
    platform: options.platform || "mt5",
    method: options.method || "",
    generatedKey: "",
    showSecret: true,
    error: "",
    form: {
      accountNumber: "",
      password: "",
      server: "",
    },
  };

  openModal({
    title: "Añadir cuenta",
    subtitle: "Configura la conexión de esta cuenta.",
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
