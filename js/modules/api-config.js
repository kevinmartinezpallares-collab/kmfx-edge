const PRODUCTION_API_BASE_URL = "https://kmfx-edge-api.onrender.com";

function isLocalHostname(hostname = "") {
  const normalized = String(hostname || "").trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function inferLocalRuntimeForDefaultBaseUrl() {
  const hostname = window.location.hostname || "";
  return window.location.protocol === "file:" || isLocalHostname(hostname);
}

function normalizeBaseUrl(value = "") {
  return String(value || "").trim().replace(/\/+$/, "");
}

function readMetaBaseUrl() {
  const meta = document.querySelector('meta[name="kmfx-api-base-url"]');
  return normalizeBaseUrl(meta?.getAttribute("content") || "");
}

function readWindowBaseUrl() {
  return normalizeBaseUrl(window.__KMFX_API_BASE_URL__ || "");
}

let cachedBaseUrl = null;

export function isLocalApiBaseUrl(baseUrl = "") {
  try {
    const parsed = baseUrl ? new URL(baseUrl) : null;
    return isLocalHostname(parsed?.hostname || "");
  } catch {
    return false;
  }
}

export function resolveApiBaseUrl() {
  if (cachedBaseUrl !== null) return cachedBaseUrl;

  const explicitBaseUrl = readWindowBaseUrl() || readMetaBaseUrl();
  if (explicitBaseUrl) {
    cachedBaseUrl = explicitBaseUrl;
  } else if (inferLocalRuntimeForDefaultBaseUrl()) {
    cachedBaseUrl = "http://127.0.0.1:8000";
  } else {
    cachedBaseUrl = PRODUCTION_API_BASE_URL;
  }

  const resolvedMode = isLocalApiBaseUrl(cachedBaseUrl) ? "local" : "production";
  console.info("[KMFX][API]", {
    label: "base url resolved",
    baseURL: cachedBaseUrl || "(unset)",
    mode: resolvedMode,
  });
  return cachedBaseUrl;
}

export function buildApiUrl(pathname = "") {
  const baseUrl = resolveApiBaseUrl();
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const resolved = baseUrl ? `${baseUrl}${normalizedPath}` : "";
  console.info("[KMFX][API]", {
    label: "resolve-url",
    baseURL: baseUrl || "(unset)",
    path: normalizedPath,
    url: resolved || "(disabled)",
  });
  return resolved;
}

export function resolveAccountsSnapshotUrl({ view = "full" } = {}) {
  const normalizedView = String(view || "full").toLowerCase() === "summary" ? "summary" : "full";
  const query = normalizedView === "summary" ? "?view=summary" : "";
  return buildApiUrl(`/api/accounts/snapshot${query}`);
}

export function resolveBillingStatusUrl() {
  return buildApiUrl("/api/billing/status");
}

export function resolveBillingCheckoutUrl() {
  return buildApiUrl("/api/billing/checkout");
}

export function resolveBillingPortalUrl() {
  return buildApiUrl("/api/billing/portal");
}

export function resolveBillingSubscriptionUrl() {
  return buildApiUrl("/api/billing/subscription");
}

export function resolveAccountsRegistryUrl() {
  return buildApiUrl("/accounts");
}
