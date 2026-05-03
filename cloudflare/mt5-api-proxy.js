const ORIGIN = "https://kmfx-edge-api.onrender.com";
const PROXY_NAME = "kmfx-mt5-api-proxy";

const PRODUCTION_ALLOWED_ORIGINS = new Set([
  "https://kmfxedge.com",
  "https://www.kmfxedge.com",
  "https://dashboard.kmfxedge.com",
]);

const DEVELOPMENT_ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
]);

const ALLOWED_HEADERS = [
  "Authorization",
  "Content-Type",
  "X-KMFX-Connection-Key",
];

const ALLOWED_METHODS = new Set(["GET", "POST", "HEAD", "OPTIONS"]);

const SENSITIVE_QUERY_PARAMS = new Set([
  "api_key",
  "connection_key",
  "kmfxapikey",
  "kmfx_api_key",
]);

const SPOOFABLE_IDENTITY_HEADERS = [
  "X-KMFX-User-Email",
  "X-KMFX-User-Id",
];

const UPSTREAM_CORS_HEADERS = [
  "Access-Control-Allow-Origin",
  "Access-Control-Allow-Methods",
  "Access-Control-Allow-Headers",
  "Access-Control-Allow-Credentials",
  "Access-Control-Max-Age",
];

function normalizeOrigin(origin) {
  if (!origin) return "";
  try {
    return new URL(origin).origin;
  } catch (_error) {
    return "";
  }
}

function isDevelopmentProxyHost(request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".workers.dev");
}

function resolveAllowedOrigin(request) {
  const origin = normalizeOrigin(request.headers.get("Origin"));
  if (PRODUCTION_ALLOWED_ORIGINS.has(origin)) return origin;
  if (isDevelopmentProxyHost(request) && DEVELOPMENT_ALLOWED_ORIGINS.has(origin)) return origin;
  return "";
}

function appendVaryOrigin(headers) {
  const current = headers.get("Vary");
  if (!current) {
    headers.set("Vary", "Origin");
    return;
  }
  const parts = current.split(",").map((part) => part.trim().toLowerCase());
  if (!parts.includes("origin")) {
    headers.set("Vary", `${current}, Origin`);
  }
}

function corsHeaders(request) {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": ALLOWED_HEADERS.join(", "),
    "Access-Control-Max-Age": "86400",
  });
  const allowedOrigin = resolveAllowedOrigin(request);
  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
  }
  appendVaryOrigin(headers);
  return headers;
}

function stripUpstreamCorsHeaders(headers) {
  UPSTREAM_CORS_HEADERS.forEach((header) => headers.delete(header));
}

function stripSensitiveQueryParams(url) {
  [...url.searchParams.keys()].forEach((key) => {
    if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  });
}

function stripSpoofableIdentityHeaders(headers) {
  SPOOFABLE_IDENTITY_HEADERS.forEach((header) => headers.delete(header));
}

async function handleRequest(request) {
  if (!ALLOWED_METHODS.has(request.method)) {
    return new Response(JSON.stringify({ ok: false, reason: "method_not_allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Allow": "GET, POST, HEAD, OPTIONS",
        ...Object.fromEntries(corsHeaders(request)),
      },
    });
  }

  if (request.method === "OPTIONS") {
    const headers = corsHeaders(request);
    if (request.headers.get("Origin") && !headers.has("Access-Control-Allow-Origin")) {
      return new Response(null, { status: 403, headers });
    }
    return new Response(null, { status: 204, headers });
  }

  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, ORIGIN);
  stripSensitiveQueryParams(targetUrl);
  const headers = new Headers(request.headers);
  headers.delete("host");
  stripSpoofableIdentityHeaders(headers);
  headers.set("X-Forwarded-Host", incomingUrl.host);
  headers.set("X-KMFX-Proxy", PROXY_NAME);

  const response = await fetch(targetUrl.toString(), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });

  const responseHeaders = new Headers(response.headers);
  stripUpstreamCorsHeaders(responseHeaders);
  responseHeaders.set("X-KMFX-Proxy", PROXY_NAME);
  corsHeaders(request).forEach((value, key) => responseHeaders.set(key, value));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});
