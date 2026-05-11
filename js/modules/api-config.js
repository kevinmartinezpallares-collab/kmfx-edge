const PRODUCTION_API_BASE_URL = "https://kmfx-edge-api.onrender.com";

function isLocalRuntime() {
  const hostname = window.location.hostname || "";
  return window.location.protocol === "file:" || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
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

export function resolveApiBaseUrl() {
  if (cachedBaseUrl !== null) return cachedBaseUrl;

  const explicitBaseUrl = readWindowBaseUrl() || readMetaBaseUrl();
  if (explicitBaseUrl) {
    cachedBaseUrl = explicitBaseUrl;
  } else if (isLocalRuntime()) {
    cachedBaseUrl = "http://127.0.0.1:8000";
  } else {
    cachedBaseUrl = PRODUCTION_API_BASE_URL;
  }

  console.info("[KMFX][API]", {
    label: "base url resolved",
    baseURL: cachedBaseUrl || "(unset)",
    mode: isLocalRuntime() ? "local" : "production",
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

export function resolveAccountsRegistryUrl() {
  return buildApiUrl("/accounts");
}
