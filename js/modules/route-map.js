export const DEFAULT_PAGE = "dashboard";

export const PAGE_ROUTES = Object.freeze({
  dashboard: "/dashboard",
  analytics: "/insights",
  discipline: "/ejecucion",
  risk: "/risk-engine",
  trades: "/operaciones",
  calendar: "/calendario",
  connections: "/cuentas",
  calculator: "/herramientas",
  journal: "/journal",
  strategies: "/estrategias",
  funded: "/funding",
  market: "/market",
  portfolio: "/capital",
  glossary: "/glossary",
  debug: "/debug",
  settings: "/ajustes"
});

const ROUTE_ALIASES = Object.freeze({
  "/": DEFAULT_PAGE,
  "/dashboard": "dashboard",
  "/analisis": "analytics",
  "/analytics": "analytics",
  "/insights": "analytics",
  "/ejecucion": "discipline",
  "/execution": "discipline",
  "/discipline": "discipline",
  "/risk-engine": "risk",
  "/risk": "risk",
  "/operaciones": "trades",
  "/trades": "trades",
  "/calendario": "calendar",
  "/calendar": "calendar",
  "/cuentas": "connections",
  "/accounts": "connections",
  "/connections": "connections",
  "/herramientas": "calculator",
  "/tools": "calculator",
  "/calculator": "calculator",
  "/journal": "journal",
  "/estrategias": "strategies",
  "/strategies": "strategies",
  "/funding": "funded",
  "/funded": "funded",
  "/market": "market",
  "/capital": "portfolio",
  "/portfolio": "portfolio",
  "/glossary": "glossary",
  "/debug": "debug",
  "/ajustes": "settings",
  "/configuracion": "settings",
  "/settings": "settings"
});

export function normalizePathname(pathname = "/") {
  let path = String(pathname || "/").trim();
  if (!path.startsWith("/")) path = `/${path}`;
  try {
    path = decodeURI(path);
  } catch {
    // Keep the raw path if the browser provided an invalid escape sequence.
  }
  return (path.replace(/\/+$/g, "") || "/").toLowerCase();
}

export function pageFromPathname(pathname = "/") {
  return ROUTE_ALIASES[normalizePathname(pathname)] || null;
}

export function pageFromLocation(location = window.location) {
  return pageFromPathname(location?.pathname || "/");
}

export function routeForPage(page = DEFAULT_PAGE) {
  return PAGE_ROUTES[page] || PAGE_ROUTES[DEFAULT_PAGE];
}

export function isKnownRoutedPage(page = "") {
  return Object.prototype.hasOwnProperty.call(PAGE_ROUTES, page);
}

export function hasAuthUrlState(location = window.location) {
  const searchParams = new URLSearchParams(location?.search || "");
  const authSearchKeys = ["access_token", "auth", "code", "error", "error_code", "refresh_token", "state", "type"];
  if (authSearchKeys.some((key) => searchParams.has(key))) return true;
  const hash = String(location?.hash || "");
  return /(?:access_token|auth=|code=|error=|error_code=|refresh_token|type=)/i.test(hash);
}
