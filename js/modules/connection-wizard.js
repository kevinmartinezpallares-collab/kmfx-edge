import { closeModal, openModal } from "./modal-system.js?v=build-20260514-233900";
import { buildApiUrl } from "./api-config.js?v=build-20260514-233900";
import { showToast } from "./toast.js?v=build-20260514-233900";
import { downloadArtifactSummary, downloadChecksumText, KMFX_DOWNLOAD_ARTIFACTS } from "./download-artifacts.js?v=build-20260514-233900";
import { billingEntitlementState, PAUSED_SUBSCRIPTION_COPY, PAUSED_SUBSCRIPTION_CTA, PAUSED_SUBSCRIPTION_TITLE } from "./billing-status.js?v=build-20260514-233900";
import { isAdminMode } from "./admin-mode.js?v=build-20260514-233900";

const DEFAULT_MAC_LAUNCHER_DOWNLOAD_URL = "./downloads/KMFX-Launcher-macOS.zip";
const DEFAULT_WINDOWS_LAUNCHER_DOWNLOAD_URL = "./downloads/KMFX-Launcher-Windows.exe";
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
const FALLBACK_DIRECT_MT5_SERVERS = [
  { broker: "Darwinex", server: "Darwinex-Live", label: "Darwinex-Live" },
  { broker: "Darwinex", server: "Darwinex-Demo", label: "Darwinex-Demo" },
  { broker: "FTMO", server: "FTMO-Server", label: "FTMO-Server" },
  { broker: "FTMO", server: "FTMO-Demo", label: "FTMO-Demo" },
  { broker: "IC Markets Raw Trading Ltd", server: "ICMarketsSC-Demo", label: "ICMarketsSC-Demo" },
  { broker: "IC Markets Raw Trading Ltd", server: "ICMarketsSC-MT5", label: "ICMarketsSC-MT5" },
  { broker: "FundingPips", server: "FundingPips-SIM", label: "FundingPips-SIM" },
  { broker: "FundedNext", server: "FundedNext-Server", label: "FundedNext-Server" },
];
const ACCOUNT_PROFILE_OPTIONS = ["Demo", "Real", "Funding", "Challenge"];

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

function normalizeAccountProfile(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "demo") return "Demo";
  if (normalized === "funding" || normalized === "funded") return "Funding";
  if (normalized === "challenge" || normalized === "eval" || normalized === "evaluation") return "Challenge";
  return "Real";
}

function accountProfileHints(profile = "Real") {
  const normalized = normalizeAccountProfile(profile);
  if (normalized === "Demo") {
    return {
      defaultLabel: "Cuenta Demo MT5",
      note: "Útil para separar pruebas, validaciones internas o entornos demo.",
    };
  }
  if (normalized === "Funding") {
    return {
      defaultLabel: "Cuenta Funding MT5",
      note: "Marca la cuenta como funding para reconocerla mejor en Cuentas y seguimiento.",
    };
  }
  if (normalized === "Challenge") {
    return {
      defaultLabel: "Cuenta Challenge MT5",
      note: "Ideal para fases de evaluación o challenge con reglas concretas de firma.",
    };
  }
  return {
    defaultLabel: "Cuenta Real MT5",
    note: "Usa Real para cuentas live personales o no ligadas a un challenge.",
  };
}

function buildWizardAccountLabel(rawLabel = "", profile = "Real") {
  const normalizedProfile = normalizeAccountProfile(profile);
  const trimmed = String(rawLabel || "").trim();
  const hints = accountProfileHints(normalizedProfile);
  if (!trimmed) return hints.defaultLabel;
  const lowered = trimmed.toLowerCase();
  const alreadyTagged = ["demo", "real", "funding", "funded", "challenge", "eval", "evaluation"].some((token) => lowered.includes(token));
  if (alreadyTagged || normalizedProfile === "Real") return trimmed;
  return `${trimmed} · ${normalizedProfile}`;
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

function normalizeDirectServers(servers = []) {
  const seen = new Set();
  return (Array.isArray(servers) ? servers : [])
    .map((server) => ({
      broker: String(server?.broker || "").trim(),
      server: String(server?.server || server?.label || "").trim(),
      label: String(server?.label || server?.server || "").trim(),
    }))
    .filter((server) => {
      if (!server.server || seen.has(server.server)) return false;
      seen.add(server.server);
      return true;
    });
}

function renderDirectServerOptions(servers = []) {
  return normalizeDirectServers(servers).map((server) => (
    `<option value="${escapeHtml(server.server)}" label="${escapeHtml(server.broker ? `${server.broker} · ${server.server}` : server.server)}"></option>`
  )).join("");
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

async function recordWizardAccountAuditEvent({ accountId = "", event = "", store = activeWizardStore, source = "connection_wizard" } = {}) {
  const normalizedAccountId = String(accountId || "").trim();
  const normalizedEvent = String(event || "").trim();
  if (!normalizedAccountId || !normalizedEvent) return;
  try {
    await fetch(buildApiUrl(`/api/accounts/${encodeURIComponent(normalizedAccountId)}/audit-event`), {
      method: "POST",
      headers: buildAuthHeaders(store, { "Content-Type": "application/json" }),
      body: JSON.stringify({ event: normalizedEvent, source }),
      keepalive: true,
    });
  } catch {
    // Audit telemetry must never block the connection wizard.
  }
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

function maskConnectionKeyForDisplay(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (normalized.length <= 12) return "••••••••";
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function normalizeLinkedAccount(payload = {}, fallback = {}) {
  const account = payload.account && typeof payload.account === "object" ? payload.account : {};
  const accountId = String(account.account_id || payload.account_id || fallback.accountId || "").trim();
  if (!accountId) return null;
  const connectionKey = String(payload.connection_key || account.connection_key || "").trim();
  const label = String(
    account.alias ||
    account.display_name ||
    fallback.label ||
    (fallback.login ? `MT5 ${fallback.login}` : "Cuenta MT5")
  ).trim();
  return {
    ...account,
    account_id: accountId,
    alias: label,
    display_name: account.display_name || label,
    account_type: account.account_type || fallback.accountType || "",
    label: account.label || fallback.accountType || "",
    platform: account.platform || fallback.platform || "mt5",
    connection_mode: account.connection_mode || payload.connection_mode || fallback.connectionMode || "ea_direct",
    status: account.status || account.lifecycle_status || fallback.status || "pending_link",
    lifecycle_status: account.lifecycle_status || account.status || fallback.status || "pending_link",
    login: account.login || fallback.login || "",
    mt5_login: account.mt5_login || account.login || fallback.login || "",
    server: account.server || fallback.server || "",
    broker: account.broker || fallback.broker || "",
    connection_key: connectionKey,
    connection_key_preview: account.connection_key_preview || maskConnectionKeyForDisplay(connectionKey),
    has_connection_key: account.has_connection_key ?? Boolean(connectionKey || account.connection_key_preview),
  };
}

function upsertManagedAccountFromLink(store, payload = {}, fallback = {}) {
  const linkedAccount = normalizeLinkedAccount(payload, fallback);
  if (!linkedAccount || !store?.setState) return;
  store.setState((state) => {
    const managedAccounts = Array.isArray(state.managedAccounts) ? state.managedAccounts : [];
    const index = managedAccounts.findIndex((account) => account?.account_id === linkedAccount.account_id);
    const nextManagedAccounts = index >= 0
      ? managedAccounts.map((account, accountIndex) => (
          accountIndex === index
            ? { ...account, ...linkedAccount }
            : account
        ))
      : [linkedAccount, ...managedAccounts];
    return {
      ...state,
      managedAccounts: nextManagedAccounts,
    };
  });
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
              <span class="connection-wizard__option-subtitle">Introduce login, servidor e investor password. La cuenta se añade a Cuentas al finalizar.</span>
              <span class="connection-wizard__option-note">Usa investor password siempre que puedas. Para cuentas de fondeo, prioriza EA si quieres separar lectura y credenciales.</span>
            </span>
          </button>
          <button class="connection-wizard__option is-selected" type="button" data-wizard-select-method="ea">
            <span class="connection-wizard__option-check">✓</span>
            <span class="connection-wizard__option-copy">
              <span class="connection-wizard__option-title">Expert Advisor (EA)</span>
              <span class="connection-wizard__option-subtitle">Recomendado. No compartes credenciales de MT5 y funciona con investor password.</span>
              <span class="connection-wizard__option-note">Solo lectura: no abre, cierra ni modifica operaciones. Usa KMFX Connector en tu terminal MT5.</span>
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

function renderAdminReleaseChecksums(state) {
  let showReleaseChecksums = false;
  try {
    showReleaseChecksums = window.localStorage?.getItem("kmfx:showReleaseChecksums") === "1";
  } catch {
    showReleaseChecksums = false;
  }
  const liveState = activeWizardStore?.getState?.() || {};
  if (!isAdminMode(liveState) || !showReleaseChecksums) return "";
  return `
    <div class="connection-wizard__utility-row connection-wizard__utility-row--release">
      <div>
        <div class="connection-wizard__utility-label">Versiones y checksums publicados</div>
        <div class="connection-wizard__release-list">
          ${downloadArtifactSummary().map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
        </div>
      </div>
      <div class="connection-wizard__utility-actions">
        <button class="btn-secondary" type="button" data-wizard-copy-download-checksums="true">Copiar checksums</button>
      </div>
    </div>
  `;
}

function renderEaConfigStep(state) {
  const ea = state.ea || {};
  const accountProfile = normalizeAccountProfile(ea.accountProfile || "Real");
  const profileHints = accountProfileHints(accountProfile);
  return `
    ${renderStepFrame(
      "Prepara MetaTrader 5",
      "El Launcher solo instala y configura. La sincronización la hace MT5 con el EA activo.",
      `
        <label class="form-stack">
          <span>Nombre visible de la cuenta</span>
          <input type="text" name="eaLabel" value="${escapeHtml(ea.label || "")}" placeholder="Orion Challenge 5k">
          <small>${escapeHtml(profileHints.note)}</small>
        </label>
        <label class="form-stack">
          <span>Tipo de cuenta</span>
          <select name="eaAccountProfile">
            ${ACCOUNT_PROFILE_OPTIONS.map((option) => `
              <option value="${option}" ${accountProfile === option ? "selected" : ""}>${option}</option>
            `).join("")}
          </select>
        </label>
        <div class="connection-wizard__setup-grid">
          <div class="connection-wizard__setup-card connection-wizard__setup-card--accent">
            <div class="connection-wizard__setup-eyebrow">Recomendado</div>
            <div class="connection-wizard__setup-title">Launcher + conector automático</div>
            <p>Abre KMFX Launcher, elige tu instalación de MT5 y pulsa instalar conector. Después puedes cerrar el Launcher cuando MT5 ya sincronice.</p>
            <div class="connection-wizard__release-note">Launcher v${escapeHtml(KMFX_DOWNLOAD_ARTIFACTS.launcher.version)} · Conector v${escapeHtml(KMFX_DOWNLOAD_ARTIFACTS.connector.version)}</div>
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
            <div class="connection-wizard__release-note">KMFXConnector.ex5 · v${escapeHtml(KMFX_DOWNLOAD_ARTIFACTS.connector.version)}</div>
            <div class="connection-wizard__inline-actions">
              <button class="btn-secondary" type="button" data-wizard-download-ea="true">Descargar EA</button>
            </div>
          </div>
        </div>
        <div class="connection-wizard__utility-row connection-wizard__utility-row--accent">
          <div>
            <div class="connection-wizard__utility-label">Solo lectura para cuentas de fondeo</div>
            <p class="connection-wizard__warning" style="margin-top:8px !important;">KMFX Connector solo lee y sincroniza datos. No abre, cierra ni modifica operaciones en MetaTrader 5, y el Launcher solo instala el conector.</p>
          </div>
        </div>
        ${renderAdminReleaseChecksums(state)}
        <div class="connection-wizard__setup-flow">
          <div class="connection-wizard__setup-step">
            <span>1</span>
            <div><strong>Activa Algo Trading</strong><small>MT5 debe permitir que el EA lea y envíe datos.</small></div>
          </div>
          <div class="connection-wizard__setup-step">
            <span>2</span>
            <div><strong>Obtén la KMFXKey</strong><small>Cada cuenta MT5 tiene una key estable. Si reinstalas el EA, reutiliza la misma desde Cuentas > Ver detalles.</small></div>
          </div>
          <div class="connection-wizard__setup-step">
            <span>3</span>
            <div><strong>Pega la key y espera la sincronización</strong><small>Cuando MT5 conecte, el último paso te dejará finalizar el proceso.</small></div>
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
      <button class="btn-primary" type="button" data-wizard-create-ea-key="true" ${state.loading ? "disabled" : ""}>${state.loading ? "Creando..." : "Crear KMFXKey para esta cuenta"}</button>
    </div>
  `;
}

function renderDirectConfigStep(state) {
  const direct = state.direct || {};
  const servers = normalizeDirectServers(state.directServers?.length ? state.directServers : FALLBACK_DIRECT_MT5_SERVERS);
  const providerConfigured = state.directProvider?.configured === true;
  const accountProfile = normalizeAccountProfile(direct.accountProfile || "Real");
  const profileHints = accountProfileHints(accountProfile);
  return `
    ${renderStepFrame(
      "Conexión directa",
      providerConfigured ? "Introduce login, servidor e investor password para validar y sincronizar la cuenta." : "Introduce login, servidor e investor password. La cuenta quedará registrada hasta activar la conexión directa real.",
      `
        <div class="connection-wizard__utility-row connection-wizard__utility-row--accent">
          <div>
            <div class="connection-wizard__success-title">Modo lectura</div>
            <p class="connection-wizard__warning" style="margin-top:8px !important;">Usa investor password siempre que sea posible. La conexión directa puede registrar una IP externa en el historial del broker.</p>
          </div>
        </div>
        <div class="connection-wizard__form-grid">
          <label class="form-stack">
            <span>Nombre visible de la cuenta</span>
            <input type="text" name="directLabel" autocomplete="off" value="${escapeHtml(direct.label || "")}" placeholder="Darwinex Swing · Funding">
            <small>${escapeHtml(profileHints.note)}</small>
          </label>
          <label class="form-stack">
            <span>Tipo de cuenta</span>
            <select name="directAccountProfile">
              ${ACCOUNT_PROFILE_OPTIONS.map((option) => `
                <option value="${option}" ${accountProfile === option ? "selected" : ""}>${option}</option>
              `).join("")}
            </select>
          </label>
          <label class="form-stack">
            <span>Número de cuenta</span>
            <input type="text" name="directLogin" inputmode="numeric" autocomplete="off" value="${escapeHtml(direct.login || "")}" placeholder="80571774">
          </label>
          <label class="form-stack">
            <span>Contraseña investor</span>
            <input type="password" name="directPassword" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true" value="${escapeHtml(direct.password || "")}" placeholder="Investor o contraseña maestra">
          </label>
          <label class="form-stack">
            <span>Servidor</span>
            <input type="text" name="directServer" list="directMt5ServerOptions" autocomplete="off" value="${escapeHtml(direct.server || "")}" placeholder="${state.directServersLoading ? "Cargando servidores..." : "Busca o escribe el servidor"}">
            <datalist id="directMt5ServerOptions">${renderDirectServerOptions(servers)}</datalist>
            <small>${state.directServersLoaded ? `${servers.length} servidores disponibles` : "Puedes escribirlo manualmente si no aparece."}</small>
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
  const isDirectPendingSync = isDirect && state.directSyncAvailable !== true;
  const key = ea.connectionKey || "";
  const visibleKey = state.showKey ? key : "••••••••••••••••••••";
  const syncStatus = state.syncStatus || {};
  const isConnected = syncStatus.status === "connected" && !isDirectPendingSync;
  const isWaiting = syncStatus.status === "waiting";
  const isError = syncStatus.status === "error";
  return `
    ${renderStepFrame(
      isDirect ? "Cuenta directa registrada" : isConnected ? "Conexión finalizada" : "Finaliza la conexión en MT5",
      isDirectPendingSync ? "La cuenta ya está añadida, pero la sincronización directa en tiempo real aún no está disponible. Usa EA para sincronizar ahora." : isDirect ? "La cuenta ya está añadida a Cuentas. Puedes cerrar este asistente." : isConnected ? "MT5 ya ha sincronizado con KMFX. Puedes cerrar este asistente." : "Copia la KMFXKey, pégala en el EA y comprueba la primera sincronización. Si reinstalas, usa esta misma key desde Cuentas > Ver detalles.",
      `
        <div class="connection-wizard__success ${isConnected ? "connection-wizard__success--complete" : "connection-wizard__success--pending"}">
          <span class="connection-wizard__success-icon">${isConnected ? "✓" : "3"}</span>
          <div class="connection-wizard__success-copy">
            <div class="connection-wizard__success-title">${isDirectPendingSync ? "Registro preparado" : isDirect ? "Cuenta directa añadida" : isConnected ? "Cuenta MT5 conectada" : "KMFXKey lista"}</div>
            <div class="connection-wizard__success-subtitle">${isDirectPendingSync ? "Aparecerá en Cuentas como pendiente de sincronización. Para datos reales, instala el EA." : isDirect ? "La verás en Cuentas con el login y servidor registrados." : isConnected ? "La cuenta aparecerá en Cuentas y Dashboard tras el refresco." : "Pégala en el campo KMFXKey del Expert Advisor. Guárdala en Cuentas > Ver detalles y nunca la compartas."}</div>
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
            <div><strong>${isDirect ? "Datos recibidos" : "Copiar KMFXKey"}</strong><small>${isDirect ? "Login, servidor y método directo preparados." : "Usa esta misma key si reinstalas el EA en esta cuenta."}</small></div>
          </div>
          <div class="connection-wizard__finish-step ${isConnected ? "is-complete" : "is-current"}">
            <span>2</span>
            <div><strong>${isDirect ? "Cuenta registrada" : "Pegar en MT5"}</strong><small>${isDirect ? "La cuenta queda visible en Cuentas tras el refresco." : "Campo KMFXKey del EA, con Algo Trading y WebRequest activos."}</small></div>
          </div>
          <div class="connection-wizard__finish-step ${isConnected ? "is-complete" : ""}">
            <span>3</span>
            <div><strong>${isDirect ? "Sincronización" : "Primera sincronización"}</strong><small>${isDirectPendingSync ? "Pendiente de conexión directa real. Usa EA si quieres datos ahora." : isDirect ? "Ya puedes cerrar el asistente." : isConnected ? "Recibido. El proceso queda finalizado." : "Pulsa comprobar cuando Experts muestre conectado a KMFX."}</small></div>
          </div>
        </div>
        ${isWaiting || isError || isDirectPendingSync ? `
          <div class="connection-wizard__inline-status connection-wizard__inline-status--${isError ? "danger" : "warning"}">
            <strong>${escapeHtml(syncStatus.title || (isError ? "No pude comprobar la conexión" : "Aún no veo la sincronización"))}</strong>
            <span>${escapeHtml(syncStatus.message || (isDirectPendingSync ? "La conexión directa queda registrada, pero necesitas el EA para ver datos reales ahora." : "Deja MT5 abierto con el EA activo y vuelve a comprobar."))}</span>
          </div>
        ` : ""}
      `
    )}
    <div class="connection-wizard__actions">
      <button class="btn-secondary" type="button" data-wizard-step="${isDirect ? "directConfig" : "eaConfig"}">Volver</button>
      ${isConnected || isDirectPendingSync ? `
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
  const normalizedReason = reason.toLowerCase();
  const details = payload?.details && typeof payload.details === "object" ? payload.details : {};
  if (reason === "connection_limit_exceeded" || reason === "plan_limit_reached") {
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
  if (reason === "connection_keys_not_allowed" || reason === "entitlement_required") {
    return {
      kind: "warning",
      title: "Conexiones MT5 no disponibles",
      message: "Tu plan no permite crear conexiones MT5.",
      hint: "Revisa tu plan o contacta con soporte si deberías tener acceso.",
    };
  }
  if (reason === "billing_required") {
    const billingStatus = String(details.billing_status || details.status || "").toLowerCase();
    if (billingStatus === "paused") {
      return {
        kind: "warning",
        title: PAUSED_SUBSCRIPTION_TITLE,
        message: PAUSED_SUBSCRIPTION_COPY,
        hint: PAUSED_SUBSCRIPTION_CTA,
      };
    }
    return {
      kind: "warning",
      title: "Suscripción necesaria",
      message: "Activa tu suscripción para crear conexiones MT5.",
      hint: "La conexión se desbloqueará cuando el acceso esté activo.",
    };
  }
  if (reason === "billing_past_due") {
    return {
      kind: "warning",
      title: "Pago pendiente",
      message: "Actualiza el pago de tu suscripción para crear conexiones MT5.",
      hint: "Después de regularizar el pago, vuelve a generar la key.",
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
  if (reason === "invalid_direct_mt5_credentials" || reason === "direct_mt5_auth_failed") {
    return {
      kind: "warning",
      title: "Credenciales rechazadas",
      message: "MT5 no ha aceptado login, password o servidor.",
      hint: "Comprueba el server exacto y usa investor password si solo quieres lectura.",
    };
  }
  if (reason === "direct_mt5_provider_unreachable" || reason === "direct_mt5_provider_error") {
    return {
      kind: "warning",
      title: "Conexión directa no disponible",
      message: "No se pudo contactar con el servicio de conexión directa.",
      hint: "Puedes usar EA ahora y reintentar conexión directa más tarde.",
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
  if (normalizedReason.includes("missing_connection_key")) {
    return {
      kind: "warning",
      title: "Falta la KMFXKey",
      message: "Pega la KMFXKey de esta cuenta en el EA o reinstala el conector desde el Launcher.",
      hint: "No crees otra cuenta si solo necesitas reinstalar el conector.",
    };
  }
  if (normalizedReason.includes("unknown_connection_key") || normalizedReason.includes("invalid_connection_key")) {
    return {
      kind: "warning",
      title: "KMFX no reconoce esta key",
      message: "Comprueba que la KMFXKey pegada en el EA pertenece a esta cuenta.",
      hint: "Copia la KMFXKey desde Detalles de cuenta, pégala de nuevo en MT5 y vuelve a comprobar.",
    };
  }
  if (normalizedReason.includes("revoked_connection_key") || normalizedReason.includes("connection_revoked")) {
    return {
      kind: "warning",
      title: "KMFXKey no activa",
      message: "Esta KMFXKey ya no está activa.",
      hint: "Abre Cuentas > Ver detalles y copia la KMFXKey actual. Crea otra cuenta solo si realmente vas a conectar otro MT5.",
    };
  }
  if (normalizedReason.includes("query_connection_key_not_allowed")) {
    return {
      kind: "warning",
      title: "Conector desactualizado",
      message: "Actualiza KMFX Connector o reinstálalo desde el Launcher.",
      hint: "Por seguridad, KMFX ya no acepta keys dentro de la URL.",
    };
  }
  if (normalizedReason.includes("webrequest") || normalizedReason.includes("web_request")) {
    return {
      kind: "warning",
      title: "MT5 no puede enviar datos",
      message: `Añade ${MT5_WEBREQUEST_URL} en Tools > Options > Expert Advisors > WebRequest.`,
      hint: "Después deja Algo Trading activo y vuelve a comprobar la conexión.",
    };
  }
  if (normalizedReason.includes("rate_limited") || normalizedReason.includes("too_many_requests")) {
    return {
      kind: "warning",
      title: "Demasiados intentos seguidos",
      message: "KMFX ha pausado temporalmente esta conexión para proteger tu cuenta.",
      hint: "Espera un minuto, deja MT5 abierto y vuelve a comprobar.",
    };
  }
  if (
    normalizedReason.includes("backend_unavailable")
    || normalizedReason.includes("service_unavailable")
    || normalizedReason.includes("temporarily_unavailable")
    || normalizedReason.includes("timeout")
    || normalizedReason.includes("http_502")
    || normalizedReason.includes("http_503")
    || normalizedReason.includes("http_504")
  ) {
    return {
      kind: "warning",
      title: "KMFX no respondió a tiempo",
      message: "El servidor de KMFX no aceptó temporalmente la sincronización.",
      hint: "No cambies la key. Deja MT5 abierto y el EA reintentará automáticamente.",
    };
  }
  return {
    kind: "warning",
    title: "No se pudo generar la clave",
    message: reason ? "KMFX no pudo completar la acción con esta cuenta." : fallback,
    hint: reason ? "Revisa la conexión y vuelve a intentarlo. Si se repite, contacta con soporte indicando el estado de la cuenta." : "",
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
  const accountProfile = normalizeAccountProfile(body?.querySelector("[name='eaAccountProfile']")?.value || state.ea?.accountProfile || "Real");
  const label = buildWizardAccountLabel(body?.querySelector("[name='eaLabel']")?.value || state.ea?.label || "", accountProfile);
  state.loading = true;
  state.error = "";
  state.ea = { ...(state.ea || {}), label, accountProfile };
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
      accountProfile,
    };
    persistLocalConnectionKey({
      accountId: payload.account_id || "",
      connectionKey: payload.connection_key,
      label,
      store,
    });
    upsertManagedAccountFromLink(store, payload, {
      label,
      connectionMode: "ea_direct",
      status: "pending_link",
      accountType: accountProfile,
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
      message: "Completa número de cuenta, contraseña y servidor para conectar la cuenta directa.",
      hint: "Usa investor password si solo quieres lectura.",
    };
    mountWizard(card, state, options, store);
    return;
  }

  const accountProfile = normalizeAccountProfile(direct.accountProfile || "Real");
  const label = buildWizardAccountLabel(direct.label || `MT5 ${login}`, accountProfile);
  state.loading = true;
  state.error = "";
  mountWizard(card, state, options, store);
  try {
    const response = await fetch(buildApiUrl("/api/direct-mt5/link"), {
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
      accountProfile,
    };
    state.direct = {
      label,
      accountProfile,
      login,
      server,
      password: "",
    };
    state.directSyncAvailable = payload.direct_sync_available === true;
    if (payload.connection_key) {
      persistLocalConnectionKey({
        accountId: payload.account_id || "",
        connectionKey: payload.connection_key,
        label,
        store,
      });
    }
    upsertManagedAccountFromLink(store, payload, {
      label,
      login,
      server,
      connectionMode: "direct",
      status: "linked",
      accountType: accountProfile,
    });
    state.step = "confirm";
    state.showKey = false;
    state.syncStatus = {
      status: payload.direct_sync_available ? "connected" : "waiting",
      title: payload.direct_sync_available ? "Cuenta directa conectada" : "Cuenta directa registrada",
      message: payload.direct_sync_available
        ? "La cuenta ya aparece en Cuentas y se ha recibido el primer dato de MT5."
        : "La cuenta aparecerá en Cuentas como pendiente. Para sincronizar datos en tiempo real ahora, instala el EA en MT5.",
    };
    showToast(payload.direct_sync_available ? "Cuenta directa conectada" : "Cuenta directa registrada; esperando primera sincronización", payload.direct_sync_available ? "success" : "warning");
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
      showToast("Todavía no hay sincronización de MT5", "warning");
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

async function loadDirectMt5Servers(card, state, options = {}, store = activeWizardStore) {
  state.directServersLoading = true;
  mountWizard(card, state, options, store);
  try {
    const response = await fetch(buildApiUrl("/api/direct-mt5/brokers"), {
      headers: buildAuthHeaders(store),
    });
    const payload = await response.json();
    if (!response.ok || payload?.ok === false) throw new Error(payload?.reason || "direct_servers_unavailable");
    state.directServers = normalizeDirectServers(payload.servers);
    state.directProvider = payload.provider || {};
    state.directServersLoaded = true;
  } catch {
    state.directServers = FALLBACK_DIRECT_MT5_SERVERS;
    state.directProvider = { configured: false, mode: "fallback" };
    state.directServersLoaded = true;
  } finally {
    state.directServersLoading = false;
    mountWizard(card, state, options, store);
  }
}

function captureDirectFields(body, state) {
  state.direct = {
    label: String(body?.querySelector("[name='directLabel']")?.value || ""),
    accountProfile: normalizeAccountProfile(body?.querySelector("[name='directAccountProfile']")?.value || state.direct?.accountProfile || "Real"),
    login: String(body?.querySelector("[name='directLogin']")?.value || ""),
    password: String(body?.querySelector("[name='directPassword']")?.value || ""),
    server: String(body?.querySelector("[name='directServer']")?.value || ""),
  };
}

function mountWizard(card, state, options = {}, store = activeWizardStore) {
  const body = card?.querySelector(".modal-body");
  if (!body) return;

  body.innerHTML = renderWizardMarkup(state);

  if (state.step === "directConfig" && !state.directServersLoaded && !state.directServersLoading) {
    loadDirectMt5Servers(card, state, options, store);
    return;
  }

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
  body.querySelector("[data-wizard-open-launcher='true']")?.addEventListener("click", () => {
    openLauncher();
    void recordWizardAccountAuditEvent({ accountId: state.ea?.accountId || "", event: "open_launcher", store });
  });
  body.querySelectorAll("[data-wizard-download-launcher]").forEach((button) => {
    button.addEventListener("click", () => downloadLauncher(button.dataset.wizardDownloadLauncher || "auto"));
  });
  body.querySelector("[data-wizard-download-ea='true']")?.addEventListener("click", downloadEa);
  body.querySelector("[data-wizard-copy-webrequest='true']")?.addEventListener("click", () => copyText(MT5_WEBREQUEST_URL, "URL copiada"));
  body.querySelector("[data-wizard-copy-download-checksums='true']")?.addEventListener("click", () => copyText(downloadChecksumText(), "Checksums copiados"));
  body.querySelector("[name='eaAccountProfile']")?.addEventListener("change", (event) => {
    state.ea = {
      ...(state.ea || {}),
      accountProfile: normalizeAccountProfile(event.target?.value || "Real"),
    };
    mountWizard(card, state, options, store);
  });
  body.querySelector("[name='directAccountProfile']")?.addEventListener("change", (event) => {
    state.direct = {
      ...(state.direct || {}),
      accountProfile: normalizeAccountProfile(event.target?.value || "Real"),
    };
    mountWizard(card, state, options, store);
  });
  body.querySelector("[data-wizard-create-ea-key='true']")?.addEventListener("click", () => createEaConnection(card, state, options, store));
  body.querySelector("[data-wizard-copy-ea-key='true']")?.addEventListener("click", () => {
    copyText(state.ea?.connectionKey || "", "Clave copiada");
    void recordWizardAccountAuditEvent({ accountId: state.ea?.accountId || "", event: "copy_key", store });
  });
  body.querySelector("[data-wizard-direct-submit='true']")?.addEventListener("click", () => createDirectConnection(card, state, options, store));
  body.querySelector("[data-wizard-check-ea-sync='true']")?.addEventListener("click", () => checkEaSync(card, state, options, store));
  body.querySelector("[data-wizard-finish-connection='true']")?.addEventListener("click", finishConnection);
  body.querySelector("[data-wizard-toggle-key='true']")?.addEventListener("click", () => {
    state.showKey = !state.showKey;
    if (state.showKey) {
      void recordWizardAccountAuditEvent({ accountId: state.ea?.accountId || "", event: "show_key", store });
    }
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
  const initialStoreState = options.store?.getState?.() || {};
  const connectionAccess = billingEntitlementState(initialStoreState, "launcherConnection", {
    allowLimited: false,
    allowPending: false,
  });
  if (!connectionAccess.allowed) {
    const requiresAuth = connectionAccess.reason === "auth_required";
    openModal({
      title: requiresAuth ? "Inicia sesión para conectar MT5" : "Activa KMFX Edge",
      subtitle: connectionAccess.title || "Conexión MT5 no disponible",
      maxWidth: 720,
      content: `
        <div class="connection-wizard__paywall">
          <p>${escapeHtml(
            requiresAuth
              ? "Necesitas una sesión activa y la verificación anti-bots completada antes de crear o vincular una cuenta MT5."
              : (connectionAccess.description || "El plan actual no permite añadir cuentas MT5 live.")
          )}</p>
          <div class="connection-wizard__inline-actions">
            ${requiresAuth
              ? '<button class="btn-primary" type="button" data-auth-required="signin">Iniciar sesión</button>'
              : '<a class="btn-primary" href="/ajustes?tab=subscription">Ver planes</a>'}
            <button class="btn-secondary" type="button" data-modal-dismiss="true">Cerrar</button>
          </div>
        </div>
      `,
      onMount(card) {
        card?.querySelector("[data-auth-required='signin']")?.addEventListener("click", () => {
          closeModal();
          window.dispatchEvent(new CustomEvent("kmfx:open-auth", {
            detail: {
              mode: "signin",
              notice: "Inicia sesión para conectar tu cuenta MT5.",
            }
          }));
        });
      }
    });
    return;
  }
  const state = {
    step: resolveInitialStep(options),
    platform: options.platform || "mt5",
    method: options.method || "",
    error: "",
    loading: false,
    checking: false,
    showKey: false,
    isAdmin: isAdminMode(initialStoreState),
    syncStatus: { status: "", title: "", message: "" },
    ea: {
      label: "",
      accountId: "",
      connectionKey: "",
      accountProfile: "Real",
    },
    direct: {
      label: "",
      accountProfile: "Real",
      login: "",
      password: "",
      server: "",
    },
    directServers: [],
    directServersLoaded: false,
    directServersLoading: false,
    directProvider: {},
  };

  openModal({
    title: "Añadir cuenta",
    subtitle: "Configura la conexión de esta cuenta.",
    maxWidth: 1180,
    content: `<div class="connection-wizard-shell"></div>`,
    onMount(card) {
      card?.classList.add("connection-wizard-modal");
      card?.style.setProperty("max-width", "1180px", "important");
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
