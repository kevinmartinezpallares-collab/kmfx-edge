import { closeModal, openModal } from "./modal-system.js?v=build-20260504-080918";
import { buildApiUrl } from "./api-config.js?v=build-20260504-080918";
import { showToast } from "./toast.js?v=build-20260504-080918";

const DEFAULT_MAC_LAUNCHER_DOWNLOAD_URL = "./downloads/KMFX-Launcher-mac.dmg";
const DEFAULT_WINDOWS_LAUNCHER_DOWNLOAD_URL = "./downloads/KMFX-Launcher-Windows.zip";
const EA_DOWNLOAD_URL = "./KMFXConnector.ex5";
const LAUNCHER_OPEN_URL = "kmfx-launcher://open";
const MT5_WEBREQUEST_URL = "https://mt5-api.kmfxedge.com";
const WIZARD_STEPS = [
  { id: "platform", label: "Plataforma" },
  { id: "method", label: "Método" },
  { id: "configuration", label: "Configuración" },
  { id: "confirmation", label: "Confirmación" },
];
let activeWizardStore = null;

function launcherDownloadUrl(platform = "auto") {
  const macUrl = window.__KMFX_MAC_LAUNCHER_DOWNLOAD_URL__ || window.__KMFX_LAUNCHER_DOWNLOAD_URL__ || DEFAULT_MAC_LAUNCHER_DOWNLOAD_URL;
  const windowsUrl = window.__KMFX_WINDOWS_LAUNCHER_DOWNLOAD_URL__ || DEFAULT_WINDOWS_LAUNCHER_DOWNLOAD_URL;
  if (platform === "windows") return windowsUrl;
  if (platform === "mac") return macUrl;
  const userAgent = navigator.userAgent || "";
  return /Windows/i.test(userAgent) && windowsUrl ? windowsUrl : macUrl;
}

function windowsLauncherAvailable() {
  return Boolean(launcherDownloadUrl("windows"));
}

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
    showToast("Abriendo KMFX Launcher. Si no se abre, usa el botón de descarga.", "info");
    window.location.href = LAUNCHER_OPEN_URL;
  } catch {
    showToast("No se pudo abrir el Launcher. Descárgalo desde esta pantalla.", "warning");
  }
}

function downloadLauncher(platform = "auto") {
  const url = launcherDownloadUrl(platform);
  if (!url) {
    showToast("Launcher Windows pendiente de publicar", "warning");
    return;
  }
  window.open(url, "_blank", "noopener");
}

function downloadEa() {
  window.open(EA_DOWNLOAD_URL, "_blank", "noopener");
}

function buildAuthHeaders(store, extra = {}) {
  const headers = {
    Accept: "application/json",
    ...extra,
  };
  const state = store?.getState?.() || {};
  if (state?.auth?.status !== "authenticated") return headers;
  const token = state?.auth?.session?.accessToken;
  const email = state?.auth?.user?.email;
  const userId = state?.auth?.user?.id;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (email) headers["X-KMFX-User-Email"] = email;
  if (userId) headers["X-KMFX-User-Id"] = userId;
  return headers;
}

function copyText(value, label = "Copiado") {
  if (!value) return;
  const complete = () => showToast(label, "success");
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

function resolveInitialStep(options = {}) {
  const method = String(options.method || "").toLowerCase();
  if (method === "ea" || method === "expert" || method === "manual") return "eaConfig";
  if (method === "direct" || method === "credentials") return "directConfig";
  return "platform";
}

function wizardStage(step) {
  if (step === "method") return 1;
  if (step === "eaConfig" || step === "directConfig") return 2;
  if (step === "confirm") return 3;
  return 0;
}

function renderStepper(state) {
  const active = wizardStage(state.step);
  return `
    <div class="connection-wizard__steps" aria-label="Progreso de conexión">
      ${WIZARD_STEPS.map((step, index) => `
        <div class="connection-wizard__step-wrap">
          <div class="connection-wizard__step ${index === active ? "is-current" : ""} ${index < active ? "is-complete" : ""}">
            <span class="connection-wizard__step-marker">${index < active ? "✓" : index + 1}</span>
            <span class="connection-wizard__step-label">${escapeHtml(step.label)}</span>
          </div>
          ${index < WIZARD_STEPS.length - 1 ? `<span class="connection-wizard__step-separator" aria-hidden="true"></span>` : ""}
        </div>
      `).join("")}
    </div>
  `;
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

function renderPlatformStep() {
  return `
    ${renderStepFrame(
      "Selecciona una plataforma",
      "Conecta tu plataforma de trading para sincronizar tus operaciones.",
      `
        <div class="connection-wizard__option-grid connection-wizard__option-grid--stacked">
          <button class="connection-wizard__option is-selected" type="button" data-wizard-select-platform="mt5">
            <span class="connection-wizard__option-check">✓</span>
            <span class="connection-wizard__option-copy">
              <span class="connection-wizard__option-title">MetaTrader 5</span>
              <span class="connection-wizard__option-subtitle">Disponible ahora.</span>
            </span>
          </button>
          <button class="connection-wizard__option connection-wizard__option--muted" type="button" disabled>
            <span class="connection-wizard__option-copy">
              <span class="connection-wizard__option-title">MetaTrader 4</span>
              <span class="connection-wizard__option-subtitle">Próximamente.</span>
            </span>
          </button>
        </div>
      `
    )}
    <div class="connection-wizard__actions">
      <button class="btn-secondary" type="button" data-modal-dismiss="true">Cancelar</button>
      <button class="btn-primary" type="button" data-wizard-step="method">Continuar</button>
    </div>
  `;
}

function renderMethodStep() {
  return `
    ${renderStepFrame(
      "Conectar MetaTrader 5",
      "Selecciona tu método de conexión preferido.",
      `
        <div class="connection-wizard__option-grid connection-wizard__option-grid--methods">
          <button class="connection-wizard__option" type="button" data-wizard-select-method="direct">
            <span class="connection-wizard__option-copy">
              <span class="connection-wizard__option-title">Conexión directa</span>
              <span class="connection-wizard__option-subtitle">Introduce login, servidor e investor password. Mejor para capital propio.</span>
              <span class="connection-wizard__option-note">Requiere backend seguro antes de producción.</span>
            </span>
          </button>
          <button class="connection-wizard__option is-selected" type="button" data-wizard-select-method="ea">
            <span class="connection-wizard__option-check">✓</span>
            <span class="connection-wizard__option-copy">
              <span class="connection-wizard__option-title">Expert Advisor (EA)</span>
              <span class="connection-wizard__option-subtitle">Recomendado. No compartes credenciales de MT5 y funciona con investor password.</span>
              <span class="connection-wizard__option-note">Usa KMFX Connector en tu terminal local.</span>
            </span>
          </button>
        </div>
      `
    )}
    <div class="connection-wizard__actions">
      <button class="btn-secondary" type="button" data-wizard-step="platform">Atrás</button>
      <button class="btn-primary" type="button" data-wizard-select-method="ea">Continuar</button>
    </div>
  `;
}

function renderEaConfigStep(state) {
  const ea = state.ea || {};
  return `
    ${renderStepFrame(
      "Conecta MetaTrader 5 (Expert Advisor)",
      "Sigue los pasos para conectar tu cuenta con KMFX Connector.",
      `
        <label class="form-stack">
          <span>Nombre de la conexión</span>
          <input type="text" name="eaLabel" value="${escapeHtml(ea.label || "Cuenta MT5 EA")}" placeholder="Orion Challenge 5k">
        </label>
        <div class="connection-wizard__utility-row" style="border-color:color-mix(in srgb, var(--accent) 34%, var(--border-subtle));background:color-mix(in srgb, var(--accent) 8%, transparent);">
          <div class="connection-wizard__checklist connection-wizard__checklist--numbered">
            <div class="connection-wizard__checklist-item">1. Descarga o abre KMFX Launcher. Detecta tus instalaciones de MetaTrader y puede instalar el EA por ti.</div>
            <div class="connection-wizard__checklist-item">2. Si lo haces manualmente, descarga KMFXConnector.ex5 y cópialo en MQL5/Experts.</div>
            <div class="connection-wizard__checklist-item">3. Cierra y vuelve a abrir MetaTrader 5 después de instalar el conector.</div>
            <div class="connection-wizard__checklist-item">4. Activa Algo Trading en MT5.</div>
            <div class="connection-wizard__checklist-item">5. Arrastra KMFXConnector a cualquier gráfico activo.</div>
            <div class="connection-wizard__checklist-item">6. Cada cuenta MT5 usa su propia clave. Para otra instancia de la misma cuenta puedes reutilizar la misma clave.</div>
            <div class="connection-wizard__checklist-item">7. En el siguiente paso recibirás la clave para pegarla en el campo KMFXKey del EA.</div>
          </div>
          <div class="connection-wizard__inline-actions">
            <button class="btn-secondary" type="button" data-wizard-open-launcher="true">Abrir Launcher</button>
            <button class="btn-primary" type="button" data-wizard-download-launcher="mac">Descargar macOS</button>
            <button class="btn-primary" type="button" data-wizard-download-launcher="windows" ${windowsLauncherAvailable() ? "" : "disabled"}>${windowsLauncherAvailable() ? "Descargar Windows" : "Windows pendiente"}</button>
            <button class="btn-secondary" type="button" data-wizard-download-ea="true">Descargar EA</button>
          </div>
        </div>
        <div class="connection-wizard__utility-row" style="border-color:color-mix(in srgb, var(--warning) 48%, var(--border-subtle));background:color-mix(in srgb, var(--warning) 10%, transparent);">
          <div>
            <div class="connection-wizard__utility-label">Permitir WebRequest en el terminal</div>
            <div class="connection-wizard__checklist connection-wizard__checklist--numbered" style="margin-top:10px;">
              <div class="connection-wizard__checklist-item">1. En MetaTrader 5 ve a Tools > Options.</div>
              <div class="connection-wizard__checklist-item">2. Entra en la pestaña Expert Advisors.</div>
              <div class="connection-wizard__checklist-item">3. Activa Allow WebRequest for listed URL.</div>
              <div class="connection-wizard__checklist-item">4. Añade esta URL:</div>
            </div>
            <code class="connection-wizard__utility-value" style="display:block;margin-top:8px;word-break:break-all;">${escapeHtml(MT5_WEBREQUEST_URL)}</code>
          </div>
          <div class="connection-wizard__utility-actions">
            <button class="btn-secondary" type="button" data-wizard-copy-webrequest="true">Copiar URL</button>
          </div>
        </div>
      `
    )}
    <div class="connection-wizard__actions">
      <button class="btn-secondary" type="button" data-wizard-step="method">Atrás</button>
      <button class="btn-primary" type="button" data-wizard-create-ea-key="true" ${state.loading ? "disabled" : ""}>${state.loading ? "Generando..." : "Generar clave de conexión"}</button>
    </div>
  `;
}

function renderDirectConfigStep(state) {
  const direct = state.direct || {};
  return `
    ${renderStepFrame(
      "Conexión directa",
      "Introduce tus datos de MetaTrader 5 para una conexión directa.",
      `
        <div class="connection-wizard__utility-row" style="border-color:color-mix(in srgb, var(--negative) 42%, var(--border-subtle));background:color-mix(in srgb, var(--negative) 10%, transparent);">
          <div>
            <div class="connection-wizard__success-title">Aviso de seguridad</div>
            <p class="connection-wizard__warning" style="margin-top:8px !important;">Este método registra una conexión desde infraestructura externa hacia tu broker. Algunas prop firms pueden detectarlo como conexión de terceros. Para cuentas fondeadas, KMFX recomienda el método Expert Advisor.</p>
          </div>
        </div>
        <div class="connection-wizard__form-grid">
          <label class="form-stack">
            <span>Account Number</span>
            <input type="text" name="directLogin" inputmode="numeric" autocomplete="off" value="${escapeHtml(direct.login || "")}" placeholder="80571774">
          </label>
          <label class="form-stack">
            <span>Password</span>
            <input type="password" name="directPassword" autocomplete="off" value="${escapeHtml(direct.password || "")}" placeholder="Investor o master password">
          </label>
          <label class="form-stack">
            <span>Server</span>
            <input type="text" name="directServer" autocomplete="off" value="${escapeHtml(direct.server || "")}" placeholder="Selecciona o escribe el servidor del broker">
          </label>
        </div>
        <p class="connection-wizard__warning">La pantalla queda recuperada para el flujo de producto, pero el envío de credenciales queda bloqueado hasta activar vault seguro, revocación, rate limit y permisos por plan.</p>
      `
    )}
    <div class="connection-wizard__actions">
      <button class="btn-secondary" type="button" data-wizard-step="method">Atrás</button>
      <button class="btn-secondary" type="button" data-wizard-select-method="ea">Usar EA recomendado</button>
      <button class="btn-primary" type="button" data-wizard-direct-submit="true">Conectar cuenta</button>
    </div>
  `;
}

function renderConfirmationStep(state) {
  const ea = state.ea || {};
  const key = ea.connectionKey || "";
  const visibleKey = state.showKey ? key : "••••••••••••••••••••";
  return `
    ${renderStepFrame(
      "Clave de conexión generada",
      "Usa esta clave en el EA de KMFX para vincular automaticamente tu cuenta.",
      `
        <div class="connection-wizard__success">
          <span class="connection-wizard__success-icon">✓</span>
          <div class="connection-wizard__success-copy">
            <div class="connection-wizard__success-title">Tu clave está lista</div>
            <div class="connection-wizard__success-subtitle">Pégala en el campo KMFXKey del Expert Advisor. Nunca compartas esta clave.</div>
          </div>
        </div>
        <div class="connection-wizard__secret-row">
          <div class="connection-wizard__secret-copy">
            <div class="connection-wizard__utility-label">Tu clave de conexión</div>
            <code class="connection-wizard__secret-value" style="word-break:break-all;">${escapeHtml(visibleKey)}</code>
          </div>
          <div class="connection-wizard__secret-actions">
            <button class="btn-secondary" type="button" data-wizard-toggle-key="true">${state.showKey ? "Ocultar" : "Mostrar"}</button>
            <button class="btn-primary" type="button" data-wizard-copy-ea-key="true">Copiar clave</button>
          </div>
        </div>
        <div class="connection-wizard__checklist">
          <div class="connection-wizard__checklist-item">Guarda esta clave si vas a preparar la misma cuenta en otra instancia de MT5.</div>
          <div class="connection-wizard__checklist-item">Después de pegarla, abre MT5 con la cuenta correcta y espera el primer sync.</div>
          <div class="connection-wizard__checklist-item">Cuando Experts muestre conectado a KMFX, la cuenta aparecerá en Cuentas y Dashboard.</div>
        </div>
      `
    )}
    <div class="connection-wizard__actions">
      <button class="btn-secondary" type="button" data-wizard-step="eaConfig">Volver</button>
      <button class="btn-primary" type="button" data-modal-dismiss="true">Cerrar</button>
    </div>
  `;
}

function renderCurrentStep(state) {
  if (state.step === "method") return renderMethodStep(state);
  if (state.step === "eaConfig") return renderEaConfigStep(state);
  if (state.step === "directConfig") return renderDirectConfigStep(state);
  if (state.step === "confirm") return renderConfirmationStep(state);
  return renderPlatformStep(state);
}

function renderWizardMarkup(state) {
  return `
    <div class="connection-wizard connection-wizard--mt5-flow">
      ${renderStepper(state)}
      ${state.error ? renderWizardAlert(state.error) : ""}
      ${renderCurrentStep(state)}
    </div>
  `;
}

function normalizeWizardError(error) {
  if (error && typeof error === "object") {
    return {
      kind: String(error.kind || error.wizardKind || "warning"),
      title: String(error.title || error.wizardTitle || "No se pudo completar la acción"),
      message: String(error.message || error.wizardMessage || "Inténtalo de nuevo."),
      hint: String(error.hint || error.wizardHint || ""),
    };
  }
  return {
    kind: "warning",
    title: "No se pudo completar la acción",
    message: String(error || "Inténtalo de nuevo."),
    hint: "",
  };
}

function renderWizardAlert(error) {
  const normalized = normalizeWizardError(error);
  const kind = normalized.kind === "danger" ? "danger" : "warning";
  return `
    <article class="connection-wizard__alert connection-wizard__alert--${kind}" role="alert">
      <span class="connection-wizard__alert-icon" aria-hidden="true">!</span>
      <div class="connection-wizard__alert-copy">
        <strong>${escapeHtml(normalized.title)}</strong>
        <p>${escapeHtml(normalized.message)}</p>
        ${normalized.hint ? `<small>${escapeHtml(normalized.hint)}</small>` : ""}
      </div>
    </article>
  `;
}

function formatConnectionError(payload, fallback = "No se pudo generar la clave de conexión.") {
  const reason = String(payload?.reason || payload?.error || "").trim();
  const details = payload?.details && typeof payload.details === "object" ? payload.details : {};
  if (reason === "connection_limit_exceeded") {
    const limit = Number(details.connection_limit);
    const current = Number(details.current_connections);
    const message = Number.isFinite(limit) && Number.isFinite(current)
      ? `Tu plan permite ${limit} cuenta MT5 y ya tienes ${current}.`
      : "Has alcanzado el máximo de cuentas MT5 disponibles en tu plan.";
    return {
      kind: "warning",
      title: "Límite de conexiones alcanzado",
      message,
      hint: "Elimina una conexión que no uses o amplía tu plan antes de crear otra key.",
    };
  }
  if (reason === "connection_keys_not_allowed") {
    return {
      kind: "warning",
      title: "Conexiones MT5 no disponibles",
      message: "Tu cuenta no tiene conexiones MT5 activas.",
      hint: "Revisa el acceso del plan antes de crear una key.",
    };
  }
  if (reason === "auth_required") {
    return {
      kind: "warning",
      title: "Sesión expirada",
      message: "Inicia sesión de nuevo para crear la key.",
      hint: "",
    };
  }
  if (reason === "connection_key_already_linked") {
    return {
      kind: "warning",
      title: "Key ya vinculada",
      message: "Esta clave ya está vinculada a otra cuenta.",
      hint: "",
    };
  }
  return {
    kind: "warning",
    title: "No se pudo generar la clave",
    message: reason ? reason.replaceAll("_", " ") : fallback,
    hint: "",
  };
}

function throwConnectionError(payload) {
  const formatted = formatConnectionError(payload);
  const error = new Error(formatted.message);
  error.wizardKind = formatted.kind;
  error.wizardTitle = formatted.title;
  error.wizardHint = formatted.hint;
  throw error;
}

async function createEaConnection(card, state, options = {}, store = activeWizardStore) {
  const body = card?.querySelector(".modal-body");
  const label = String(body?.querySelector("[name='eaLabel']")?.value || "Cuenta MT5 EA").trim() || "Cuenta MT5 EA";
  state.loading = true;
  state.error = "";
  state.ea = { ...(state.ea || {}), label };
  mountWizard(card, state, options, store);
  try {
    const response = await fetch(buildApiUrl("/api/accounts/link"), {
      method: "POST",
      headers: buildAuthHeaders(store, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        label,
        alias: label,
        platform: "mt5",
        connection_mode: "ea_direct",
      }),
    });
    const payload = await response.json();
    if (!response.ok || payload?.ok === false || !payload?.connection_key) {
      throwConnectionError(payload);
    }
    state.ea = {
      label,
      accountId: payload.account_id || "",
      connectionKey: payload.connection_key,
    };
    state.step = "confirm";
    state.showKey = false;
    showToast("Clave de conexión generada", "success");
    window.dispatchEvent(new CustomEvent("kmfx:accounts-refresh"));
  } catch (error) {
    state.error = normalizeWizardError(error?.message ? error : {
      title: "No se pudo generar la clave",
      message: "No se pudo generar la clave de conexión.",
    });
  } finally {
    state.loading = false;
    mountWizard(card, state, options, store);
  }
}

function setWizardStep(card, state, step, options, store) {
  state.step = step;
  state.error = "";
  mountWizard(card, state, options, store);
}

function captureDirectFields(body, state) {
  state.direct = {
    login: String(body?.querySelector("[name='directLogin']")?.value || ""),
    password: String(body?.querySelector("[name='directPassword']")?.value || ""),
    server: String(body?.querySelector("[name='directServer']")?.value || ""),
  };
}

function mountWizard(card, state, options = {}, store = activeWizardStore) {
  const body = card?.querySelector(".modal-body");
  if (!body) return;

  body.innerHTML = renderWizardMarkup(state);

  body.querySelectorAll("[data-wizard-step]").forEach((button) => {
    button.addEventListener("click", () => setWizardStep(card, state, button.dataset.wizardStep || "platform", options, store));
  });
  body.querySelector("[data-wizard-select-platform='mt5']")?.addEventListener("click", () => setWizardStep(card, state, "method", options, store));
  body.querySelectorAll("[data-wizard-select-method]").forEach((button) => {
    button.addEventListener("click", () => {
      const method = button.dataset.wizardSelectMethod;
      state.method = method;
      setWizardStep(card, state, method === "direct" ? "directConfig" : "eaConfig", options, store);
    });
  });
  body.querySelector("[data-wizard-open-launcher='true']")?.addEventListener("click", openLauncher);
  body.querySelectorAll("[data-wizard-download-launcher]").forEach((button) => {
    button.addEventListener("click", () => downloadLauncher(button.dataset.wizardDownloadLauncher || "auto"));
  });
  body.querySelector("[data-wizard-download-ea='true']")?.addEventListener("click", downloadEa);
  body.querySelector("[data-wizard-copy-webrequest='true']")?.addEventListener("click", () => copyText(MT5_WEBREQUEST_URL, "URL copiada"));
  body.querySelector("[data-wizard-create-ea-key='true']")?.addEventListener("click", () => createEaConnection(card, state, options, store));
  body.querySelector("[data-wizard-copy-ea-key='true']")?.addEventListener("click", () => copyText(state.ea?.connectionKey || "", "Clave copiada"));
  body.querySelector("[data-wizard-direct-submit='true']")?.addEventListener("click", () => {
    captureDirectFields(body, state);
    showToast("La conexión directa queda pendiente del backend seguro. Usa EA para conectar ahora.", "warning");
  });
  body.querySelector("[data-wizard-toggle-key='true']")?.addEventListener("click", () => {
    state.showKey = !state.showKey;
    mountWizard(card, state, options, store);
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
    step: resolveInitialStep(options),
    platform: options.platform || "mt5",
    method: options.method || "",
    error: "",
    loading: false,
    showKey: false,
    ea: {
      label: "",
      accountId: "",
      connectionKey: "",
    },
  };

  openModal({
    title: "Añadir cuenta",
    subtitle: "Configura la conexión de esta cuenta.",
    maxWidth: 980,
    content: `<div class="connection-wizard-shell"></div>`,
    onMount(card) {
      card?.classList.add("connection-wizard-modal");
      card?.style.setProperty("max-width", "980px", "important");
      card?.style.setProperty("max-height", "min(92vh, 960px)", "important");
      card?.style.setProperty("display", "flex", "important");
      card?.style.setProperty("flex-direction", "column", "important");
      card?.style.setProperty("overflow", "hidden", "important");
      const body = card?.querySelector(".modal-body");
      body?.classList.add("connection-wizard-modal__body");
      body?.style.setProperty("overflow-y", "auto", "important");
      body?.style.setProperty("overflow-x", "hidden", "important");
      body?.style.setProperty("min-height", "0", "important");
      body?.style.setProperty("flex", "1 1 auto", "important");
      body?.style.setProperty("-webkit-overflow-scrolling", "touch", "important");
      mountWizard(card, state, options, options.store || activeWizardStore);
    },
  });
}

export function initConnectionWizard(store = null) {
  activeWizardStore = store;
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-open-connection-wizard]");
    if (!trigger) return;
    event.preventDefault();
    openConnectionWizard({
      platform: trigger.dataset.connectionPlatform || "",
      method: trigger.dataset.connectionMethod || "",
      source: trigger.dataset.connectionSource || "",
      store,
    });
  });

  window.addEventListener("kmfx:open-connection-wizard", (event) => {
    openConnectionWizard({ ...(event.detail || {}), store });
  });

  window.KMFXConnectionWizard = {
    open: openConnectionWizard,
    close: closeModal,
  };
}
