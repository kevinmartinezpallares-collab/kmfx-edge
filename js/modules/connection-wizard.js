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
  { id: "confirmation", label: "Finalizar" },
];
let activeWizardStore = null;
const LOCAL_CONNECTION_KEYS_STORAGE_KEY = "kmfx.connectionKeys.v1";

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

function readLocalConnectionKeys() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_CONNECTION_KEYS_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function persistLocalConnectionKey({ accountId = "", connectionKey = "", label = "", store = activeWizardStore } = {}) {
  const normalizedAccountId = String(accountId || "").trim();
  const normalizedKey = String(connectionKey || "").trim();
  if (!normalizedAccountId || !normalizedKey) return;
  try {
    const state = store?.getState?.() || {};
    const cache = readLocalConnectionKeys();
    cache[normalizedAccountId] = {
      accountId: normalizedAccountId,
      connectionKey: normalizedKey,
      label: String(label || "").trim(),
      userId: state?.auth?.user?.id || "",
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(LOCAL_CONNECTION_KEYS_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Browser storage is optional; the modal still shows the generated key.
  }
}

function accountLooksConnected(account = {}) {
  const status = String(account.status || account.lifecycle_status || "").trim().toLowerCase();
  if (["active", "connected", "synced", "live"].includes(status)) return true;
  return Boolean(
    account.last_sync_at ||
    account.lastSyncAt ||
    account.first_sync_at ||
    account.firstSyncAt ||
    account.login ||
    account.mt5_login
  );
}

function findWizardAccount(accounts = [], state = {}) {
  const ea = state.ea || {};
  const accountId = String(ea.accountId || "").trim();
  const label = String(ea.label || "").trim().toLowerCase();
  if (accountId) {
    const byId = accounts.find((account) => String(account.account_id || account.accountId || "") === accountId);
    if (byId) return byId;
  }
  if (!label) return null;
  return accounts.find((account) => {
    const candidates = [
      account.alias,
      account.display_name,
      account.nickname,
      account.label,
    ].map((value) => String(value || "").trim().toLowerCase());
    return candidates.includes(label);
  }) || null;
}

async function fetchWizardAccounts(store = activeWizardStore) {
  const response = await fetch(buildApiUrl("/accounts"), {
    headers: buildAuthHeaders(store),
  });
  const payload = await response.json();
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.reason || "accounts_refresh_failed");
  }
  return Array.isArray(payload?.accounts) ? payload.accounts : [];
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
      "Prepara MetaTrader 5",
      "Primero deja el conector instalado. Después crea la KMFXKey y pégala en el EA.",
      `
        <label class="form-stack">
          <span>Nombre de la conexión</span>
          <input type="text" name="eaLabel" value="${escapeHtml(ea.label || "Cuenta MT5 EA")}" placeholder="Orion Challenge 5k">
        </label>
        <div class="connection-wizard__setup-grid">
          <div class="connection-wizard__setup-card connection-wizard__setup-card--accent">
            <div class="connection-wizard__setup-eyebrow">Recomendado</div>
            <div class="connection-wizard__setup-title">Launcher + conector automático</div>
            <p>Abre KMFX Launcher, elige tu instalación de MT5 y pulsa instalar conector. No necesitas introducir contraseña de trading.</p>
            <div class="connection-wizard__inline-actions">
              <button class="btn-secondary" type="button" data-wizard-open-launcher="true">Abrir Launcher</button>
              <button class="btn-primary" type="button" data-wizard-download-launcher="mac">Descargar macOS</button>
              <button class="btn-primary" type="button" data-wizard-download-launcher="windows" ${windowsLauncherAvailable() ? "" : "disabled"}>${windowsLauncherAvailable() ? "Descargar Windows" : "Windows pendiente"}</button>
            </div>
          </div>
          <div class="connection-wizard__setup-card">
            <div class="connection-wizard__setup-eyebrow">Manual</div>
            <div class="connection-wizard__setup-title">EA instalado por ti</div>
            <p>Descarga KMFXConnector.ex5, cópialo en MQL5/Experts, reinicia MT5 y arrástralo a cualquier gráfico activo.</p>
            <div class="connection-wizard__inline-actions">
              <button class="btn-secondary" type="button" data-wizard-download-ea="true">Descargar EA</button>
            </div>
          </div>
        </div>
        <div class="connection-wizard__setup-flow">
          <div class="connection-wizard__setup-step">
            <span>1</span>
            <div><strong>Activa Algo Trading</strong><small>MT5 debe permitir que el EA lea y envíe datos.</small></div>
          </div>
          <div class="connection-wizard__setup-step">
            <span>2</span>
            <div><strong>Crea la KMFXKey</strong><small>Cada cuenta MT5 tiene su propia key. Para otra instancia de la misma cuenta, reutiliza esa key.</small></div>
          </div>
          <div class="connection-wizard__setup-step">
            <span>3</span>
            <div><strong>Pega la key y espera sync</strong><small>Cuando MT5 conecte, el último paso te dejará finalizar el proceso.</small></div>
          </div>
        </div>
        <div class="connection-wizard__utility-row connection-wizard__utility-row--warning">
          <div>
            <div class="connection-wizard__utility-label">Permitir WebRequest en el terminal</div>
            <p class="connection-wizard__warning">En MT5 abre Tools > Options > Expert Advisors, activa Allow WebRequest y añade esta URL.</p>
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
      <button class="btn-primary" type="button" data-wizard-create-ea-key="true" ${state.loading ? "disabled" : ""}>${state.loading ? "Creando..." : "Crear KMFXKey"}</button>
    </div>
  `;
}

function renderDirectConfigStep(state) {
  const direct = state.direct || {};
  return `
    ${renderStepFrame(
      "Conexión directa",
      "Introduce login, servidor e investor password para registrar esta cuenta en modo directo.",
      `
        <div class="connection-wizard__utility-row connection-wizard__utility-row--accent">
          <div>
            <div class="connection-wizard__success-title">Modo lectura</div>
            <p class="connection-wizard__warning" style="margin-top:8px !important;">Usa investor password siempre que sea posible. KMFX no ejecuta operaciones desde esta conexión.</p>
          </div>
        </div>
        <div class="connection-wizard__form-grid">
          <label class="form-stack">
            <span>Account Number</span>
            <input type="text" name="directLogin" inputmode="numeric" autocomplete="off" value="${escapeHtml(direct.login || "")}" placeholder="80571774">
          </label>
          <label class="form-stack">
            <span>Investor password</span>
            <input type="password" name="directPassword" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true" value="${escapeHtml(direct.password || "")}" placeholder="Investor o master password">
          </label>
          <label class="form-stack">
            <span>Servidor</span>
            <input type="text" name="directServer" autocomplete="off" value="${escapeHtml(direct.server || "")}" placeholder="Selecciona o escribe el servidor del broker">
          </label>
        </div>
      `
    )}
    <div class="connection-wizard__actions">
      <button class="btn-secondary" type="button" data-wizard-step="method">Atrás</button>
      <button class="btn-secondary" type="button" data-wizard-select-method="ea">Usar EA recomendado</button>
      <button class="btn-primary" type="button" data-wizard-direct-submit="true" ${state.loading ? "disabled" : ""}>${state.loading ? "Conectando..." : "Conectar cuenta"}</button>
    </div>
  `;
}

function renderConfirmationStep(state) {
  const ea = state.ea || {};
  const isDirect = state.method === "direct";
  const key = ea.connectionKey || "";
  const visibleKey = state.showKey ? key : "••••••••••••••••••••";
  const syncStatus = state.syncStatus || {};
  const isConnected = syncStatus.status === "connected" || isDirect;
  const isWaiting = syncStatus.status === "waiting";
  const isError = syncStatus.status === "error";
  return `
    ${renderStepFrame(
      isDirect ? "Cuenta directa registrada" : isConnected ? "Conexión finalizada" : "Finaliza la conexión en MT5",
      isDirect ? "La cuenta se ha registrado en modo directo. Puedes cerrar este asistente." : isConnected ? "MT5 ya ha sincronizado con KMFX. Puedes cerrar este asistente." : "Copia la KMFXKey, pégala en el EA y comprueba la primera sincronización.",
      `
        <div class="connection-wizard__success ${isConnected ? "connection-wizard__success--complete" : "connection-wizard__success--pending"}">
          <span class="connection-wizard__success-icon">${isConnected ? "✓" : "3"}</span>
          <div class="connection-wizard__success-copy">
            <div class="connection-wizard__success-title">${isDirect ? "Solicitud directa enviada" : isConnected ? "Cuenta MT5 conectada" : "KMFXKey lista"}</div>
            <div class="connection-wizard__success-subtitle">${isDirect ? "La sección Cuentas se refrescará con el login y servidor registrados." : isConnected ? "La cuenta aparecerá en Cuentas y Dashboard tras el refresco." : "Pégala en el campo KMFXKey del Expert Advisor. Nunca compartas esta clave."}</div>
          </div>
        </div>
        ${key ? `<div class="connection-wizard__secret-row">
          <div class="connection-wizard__secret-copy">
            <div class="connection-wizard__utility-label">${isDirect ? "Key técnica de la cuenta" : "Tu KMFXKey"}</div>
            <code class="connection-wizard__secret-value" style="word-break:break-all;">${escapeHtml(visibleKey)}</code>
          </div>
          <div class="connection-wizard__secret-actions">
            <button class="btn-secondary" type="button" data-wizard-toggle-key="true">${state.showKey ? "Ocultar" : "Mostrar"}</button>
            <button class="btn-primary" type="button" data-wizard-copy-ea-key="true">Copiar clave</button>
          </div>
        </div>` : ""}
        <div class="connection-wizard__finish-grid">
          <div class="connection-wizard__finish-step is-complete">
            <span>1</span>
            <div><strong>${isDirect ? "Datos recibidos" : "Copiar KMFXKey"}</strong><small>${isDirect ? "Login, servidor y método directo preparados." : "Usa esta misma key para otra instancia de la misma cuenta."}</small></div>
          </div>
          <div class="connection-wizard__finish-step ${isConnected ? "is-complete" : "is-current"}">
            <span>2</span>
            <div><strong>${isDirect ? "Cuenta registrada" : "Pegar en MT5"}</strong><small>${isDirect ? "La cuenta queda visible en Cuentas tras el refresco." : "Campo KMFXKey del EA, con Algo Trading y WebRequest activos."}</small></div>
          </div>
          <div class="connection-wizard__finish-step ${isConnected ? "is-complete" : ""}">
            <span>3</span>
            <div><strong>${isDirect ? "Proceso finalizado" : "Primer sync"}</strong><small>${isDirect ? "Ya puedes cerrar el asistente." : isConnected ? "Recibido. El proceso queda finalizado." : "Pulsa comprobar cuando Experts muestre conectado a KMFX."}</small></div>
          </div>
        </div>
        ${isWaiting || isError ? `
          <div class="connection-wizard__inline-status connection-wizard__inline-status--${isError ? "danger" : "warning"}">
            <strong>${escapeHtml(syncStatus.title || (isError ? "No pude comprobar la conexión" : "Aún no veo la sincronización"))}</strong>
            <span>${escapeHtml(syncStatus.message || "Deja MT5 abierto con el EA activo y vuelve a comprobar.")}</span>
          </div>
        ` : ""}
      `
    )}
    <div class="connection-wizard__actions">
      <button class="btn-secondary" type="button" data-wizard-step="${isDirect ? "directConfig" : "eaConfig"}">Volver</button>
      ${isConnected ? `
        <button class="btn-primary" type="button" data-wizard-finish-connection="true">Finalizar</button>
      ` : `
        <button class="btn-secondary" type="button" data-modal-dismiss="true">Cerrar por ahora</button>
        <button class="btn-primary" type="button" data-wizard-check-ea-sync="true" ${state.checking ? "disabled" : ""}>${state.checking ? "Comprobando..." : "Comprobar conexión"}</button>
      `}
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
    persistLocalConnectionKey({
      accountId: payload.account_id || "",
      connectionKey: payload.connection_key,
      label,
      store,
    });
    state.step = "confirm";
    state.showKey = false;
    state.syncStatus = { status: "", title: "", message: "" };
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

async function createDirectConnection(card, state, options = {}, store = activeWizardStore) {
  const body = card?.querySelector(".modal-body");
  captureDirectFields(body, state);
  const direct = state.direct || {};
  const login = String(direct.login || "").trim();
  const server = String(direct.server || "").trim();
  const password = String(direct.password || "").trim();
  if (!login || !server || !password) {
    state.error = {
      kind: "warning",
      title: "Faltan datos de conexión",
      message: "Completa login, password y server para conectar la cuenta directa.",
      hint: "Usa investor password si solo quieres lectura.",
    };
    mountWizard(card, state, options, store);
    return;
  }

  const label = String(direct.label || `MT5 ${login}`).trim();
  state.loading = true;
  state.error = "";
  mountWizard(card, state, options, store);
  try {
    const response = await fetch(buildApiUrl("/api/accounts/link"), {
      method: "POST",
      headers: buildAuthHeaders(store, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        label,
        alias: label,
        platform: "mt5",
        connection_mode: "direct",
        login,
        server,
        password,
        investor_password: password,
      }),
    });
    const payload = await response.json();
    if (!response.ok || payload?.ok === false) {
      throwConnectionError(payload);
    }
    state.method = "direct";
    state.ea = {
      label,
      accountId: payload.account_id || "",
      connectionKey: payload.connection_key || "",
    };
    state.direct = {
      login,
      server,
      password: "",
    };
    if (payload.connection_key) {
      persistLocalConnectionKey({
        accountId: payload.account_id || "",
        connectionKey: payload.connection_key,
        label,
        store,
      });
    }
    state.step = "confirm";
    state.showKey = false;
    state.syncStatus = {
      status: "connected",
      title: "Cuenta directa registrada",
      message: "La cuenta se ha creado y Cuentas se refrescará automáticamente.",
    };
    showToast("Cuenta directa registrada", "success");
    window.dispatchEvent(new CustomEvent("kmfx:accounts-refresh"));
  } catch (error) {
    state.error = normalizeWizardError(error?.message ? error : {
      title: "No se pudo conectar la cuenta directa",
      message: "Revisa los datos y vuelve a intentarlo.",
    });
  } finally {
    state.loading = false;
    mountWizard(card, state, options, store);
  }
}

async function checkEaSync(card, state, options = {}, store = activeWizardStore) {
  state.checking = true;
  state.error = "";
  mountWizard(card, state, options, store);
  try {
    const accounts = await fetchWizardAccounts(store);
    const account = findWizardAccount(accounts, state);
    if (account && accountLooksConnected(account)) {
      state.syncStatus = {
        status: "connected",
        title: "Cuenta conectada",
        message: "KMFX ya recibió la primera sincronización de MT5.",
      };
      showToast("Conexión MT5 finalizada", "success");
      window.dispatchEvent(new CustomEvent("kmfx:accounts-refresh"));
    } else {
      state.syncStatus = {
        status: "waiting",
        title: "Aún no veo la sincronización",
        message: "Deja MT5 abierto con el EA activo, confirma WebRequest y vuelve a comprobar.",
      };
      showToast("Todavía no hay sync de MT5", "warning");
    }
  } catch {
    state.syncStatus = {
      status: "error",
      title: "No pude comprobar la conexión",
      message: "No pude consultar Cuentas ahora mismo. Vuelve a intentarlo en unos segundos.",
    };
  } finally {
    state.checking = false;
    mountWizard(card, state, options, store);
  }
}

function finishConnection() {
  window.dispatchEvent(new CustomEvent("kmfx:accounts-refresh"));
  closeModal();
  showToast("Proceso de conexión finalizado", "success");
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
  body.querySelector("[data-wizard-direct-submit='true']")?.addEventListener("click", () => createDirectConnection(card, state, options, store));
  body.querySelector("[data-wizard-check-ea-sync='true']")?.addEventListener("click", () => checkEaSync(card, state, options, store));
  body.querySelector("[data-wizard-finish-connection='true']")?.addEventListener("click", finishConnection);
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
    checking: false,
    showKey: false,
    syncStatus: { status: "", title: "", message: "" },
    ea: {
      label: "",
      accountId: "",
      connectionKey: "",
    },
    direct: {
      login: "",
      password: "",
      server: "",
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
