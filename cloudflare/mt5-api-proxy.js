const ORIGIN = "https://kmfx-edge-api.onrender.com";
const PROXY_NAME = "kmfx-mt5-api-proxy";

const ALLOWED_HEADERS = [
  "Authorization",
  "Content-Type",
  "X-KMFX-Connection-Key",
  "X-KMFX-User-Email",
  "X-KMFX-User-Id",
];

function corsHeaders(request) {
  return {
    "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": ALLOWED_HEADERS.join(", "),
    "Access-Control-Max-Age": "86400",
  };
}

async function handleRequest(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, ORIGIN);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("X-Forwarded-Host", incomingUrl.host);
  headers.set("X-KMFX-Proxy", PROXY_NAME);

  const response = await fetch(targetUrl.toString(), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("X-KMFX-Proxy", PROXY_NAME);
  Object.entries(corsHeaders(request)).forEach(([key, value]) => responseHeaders.set(key, value));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});
