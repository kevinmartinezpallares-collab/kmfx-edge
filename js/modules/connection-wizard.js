import { closeModal, openModal } from "./modal-system.js?v=build-20260406-213500";
import { buildApiUrl } from "./api-config.js?v=build-20260406-213500";
import { showToast } from "./toast.js?v=build-20260406-213500";

const DEFAULT_MAC_LAUNCHER_DOWNLOAD_URL = "./downloads/KMFX-Launcher-mac.dmg";
const DEFAULT_WINDOWS_LAUNCHER_DOWNLOAD_URL = "";
const EA_DOWNLOAD_URL = "./KMFXConnector.ex5";
const LAUNCHER_OPEN_URL = "kmfx-launcher://open";
const MT5_WEBREQUEST_URL = "https://mt5-api.kmfxedge.com";
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
  const fallbackUrl = launcherDownloadUrl();
  try {
    window.location.href = LAUNCHER_OPEN_URL;
    window.setTimeout(() => {
      window.open(fallbackUrl, "_blank", "noopener");
    }, 900);
  } catch {
    window.open(fallbackUrl, "_blank", "noopener");
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
  const direct = state.direct || {};
  const hasDirectKey = Boolean(direct.connectionKey);
  return `
    <div class="connection-wizard connection-wizard--launcher">
      ${renderStepFrame(
        "Conecta tu cuenta MT5",
        "KMFX no pide tu contraseña de MT5 ni ejecuta operaciones. También funciona si entras en MetaTrader con investor password porque el conector solo lee datos.",
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
            <button class="btn-secondary" type="button" data-wizard-download-launcher="mac">Descargar macOS</button>
            <button class="btn-secondary" type="button" data-wizard-download-launcher="windows" ${windowsLauncherAvailable() ? "" : "disabled"}>${windowsLauncherAvailable() ? "Descargar Windows" : "Windows pendiente"}</button>
          </div>
        `
      )}
      ${renderStepFrame(
        "Conexión directa",
        "Alternativa sin launcher: descarga el EA, crea una key y apunta WebRequest a la API de KMFX.",
        `
          <div class="connection-wizard__form-grid">
            <label class="form-stack">
              <span>Nombre de la conexión</span>
              <input type="text" name="directLabel" value="${escapeHtml(direct.label || "Cuenta MT5 directa")}" placeholder="Orion Challenge 5k">
            </label>
            <div class="connection-wizard__utility-row">
              <div>
                <div class="connection-wizard__utility-label">URL permitida en WebRequest</div>
                <code class="connection-wizard__utility-value">${escapeHtml(MT5_WEBREQUEST_URL)}</code>
              </div>
              <div class="connection-wizard__utility-actions">
                <button class="btn-secondary" type="button" data-wizard-copy-webrequest="true">Copiar URL</button>
              </div>
            </div>
          </div>
          <div class="connection-wizard__checklist connection-wizard__checklist--numbered">
            <div class="connection-wizard__checklist-item">1. Descarga KMFXConnector.ex5 y cópialo en MQL5/Experts.</div>
            <div class="connection-wizard__checklist-item">2. En MT5 permite WebRequest para ${escapeHtml(MT5_WEBREQUEST_URL)}.</div>
            <div class="connection-wizard__checklist-item">3. Arrastra KMFXConnector a un gráfico y pega la key en KMFXKey.</div>
            <div class="connection-wizard__checklist-item">4. Puedes iniciar sesión con master password o investor password.</div>
            <div class="connection-wizard__checklist-item">5. Al primer sync la cuenta aparecerá en Cuentas y Dashboard.</div>
          </div>
          ${hasDirectKey ? `
            <div class="connection-wizard__secret-row">
              <div>
                <div class="connection-wizard__utility-label">Key para pegar en el EA</div>
                <code class="connection-wizard__secret-value">${escapeHtml(direct.connectionKey)}</code>
              </div>
              <div class="connection-wizard__secret-actions">
                <button class="btn-primary" type="button" data-wizard-copy-direct-key="true">Copiar key</button>
              </div>
            </div>
          ` : ""}
          <div class="connection-wizard__inline-actions">
            <button class="btn-secondary" type="button" data-wizard-download-ea="true">Descargar EA</button>
            <button class="btn-primary" type="button" data-wizard-create-direct="true" ${state.loading ? "disabled" : ""}>${state.loading ? "Creando..." : hasDirectKey ? "Regenerar key directa" : "Crear key directa"}</button>
          </div>
        `
      )}
      ${state.error ? `<div class="connection-wizard__inline-error">${escapeHtml(state.error)}</div>` : ""}
      <div class="connection-wizard__actions">
        <button class="btn-secondary" type="button" data-modal-dismiss="true">Cerrar</button>
      </div>
    </div>
  `;
}

async function createDirectConnection(card, state, options = {}, store = activeWizardStore) {
  const body = card?.querySelector(".modal-body");
  const label = String(body?.querySelector("[name='directLabel']")?.value || "Cuenta MT5 directa").trim() || "Cuenta MT5 directa";
  state.loading = true;
  state.error = "";
  state.direct = { ...(state.direct || {}), label };
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
      }),
    });
    const payload = await response.json();
    if (!response.ok || payload?.ok === false || !payload?.connection_key) {
      throw new Error(payload?.reason || "No se pudo crear la key directa.");
    }
    state.direct = {
      label,
      accountId: payload.account_id || "",
      connectionKey: payload.connection_key,
    };
    showToast("Key directa creada", "success");
    window.dispatchEvent(new CustomEvent("kmfx:accounts-refresh"));
  } catch (error) {
    state.error = error?.message || "No se pudo crear la conexión directa.";
  } finally {
    state.loading = false;
    mountWizard(card, state, options, store);
  }
}

function mountWizard(card, state, options = {}, store = activeWizardStore) {
  const body = card?.querySelector(".modal-body");
  if (!body) return;

  body.innerHTML = renderWizardMarkup(state);

  body.querySelector("[data-wizard-open-launcher='true']")?.addEventListener("click", openLauncher);
  body.querySelectorAll("[data-wizard-download-launcher]").forEach((button) => {
    button.addEventListener("click", () => downloadLauncher(button.dataset.wizardDownloadLauncher || "auto"));
  });
  body.querySelector("[data-wizard-download-ea='true']")?.addEventListener("click", downloadEa);
  body.querySelector("[data-wizard-copy-webrequest='true']")?.addEventListener("click", () => copyText(MT5_WEBREQUEST_URL, "URL copiada"));
  body.querySelector("[data-wizard-copy-direct-key='true']")?.addEventListener("click", () => copyText(state.direct?.connectionKey || "", "Key copiada"));
  body.querySelector("[data-wizard-create-direct='true']")?.addEventListener("click", () => createDirectConnection(card, state, options, store));

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
    loading: false,
    direct: {
      label: "",
      accountId: "",
      connectionKey: "",
    },
  };

  openModal({
    title: "Conectar MT5",
    subtitle: "Instala el conector desde KMFX Launcher.",
    maxWidth: 760,
    content: `<div class="connection-wizard-shell"></div>`,
    onMount(card) {
      card?.classList.add("connection-wizard-modal");
      card?.querySelector(".modal-body")?.classList.add("connection-wizard-modal__body");
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
