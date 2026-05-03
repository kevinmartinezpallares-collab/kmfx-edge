export const DEFAULT_PAGE = "dashboard";

export const PAGE_ROUTES = Object.freeze({
  dashboard: "/dashboard",
  analytics: "/insights",
  "analytics-daily": "/insights/diario",
  "analytics-hourly": "/insights/horario",
  "analytics-risk": "/insights/riesgo",
  discipline: "/ejecucion",
  risk: "/risk-engine",
  "risk-ruin-var": "/risk-engine/ruin-var",
  "risk-monte-carlo": "/risk-engine/monte-carlo",
  "risk-exposure": "/risk-engine/exposicion",
  trades: "/operaciones",
  calendar: "/calendario",
  connections: "/cuentas",
  calculator: "/herramientas",
  journal: "/journal",
  "journal-review": "/journal/review-queue",
  "journal-entries": "/journal/entradas",
  "journal-ai-review": "/journal/ai-review",
  strategies: "/estrategias",
  "strategies-backtest": "/estrategias/backtest-vs-real",
  "strategies-portfolio": "/estrategias/portafolios",
  funded: "/funding",
  "funded-rules": "/funding/reglas",
  "funded-payouts": "/funding/payouts",
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
  "/insights/resumen": "analytics",
  "/insights/diario": "analytics-daily",
  "/insights/daily": "analytics-daily",
  "/insights/horario": "analytics-hourly",
  "/insights/hourly": "analytics-hourly",
  "/insights/riesgo": "analytics-risk",
  "/insights/risk": "analytics-risk",
  "/ejecucion": "discipline",
  "/execution": "discipline",
  "/discipline": "discipline",
  "/risk-engine": "risk",
  "/risk-engine/cockpit": "risk",
  "/risk-engine/ruin-var": "risk-ruin-var",
  "/risk-engine/ruin": "risk-ruin-var",
  "/risk-engine/var": "risk-ruin-var",
  "/risk-engine/monte-carlo": "risk-monte-carlo",
  "/risk-engine/exposicion": "risk-exposure",
  "/risk-engine/exposure": "risk-exposure",
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
  "/journal/cockpit": "journal",
  "/journal/review-queue": "journal-review",
  "/journal/reviews": "journal-review",
  "/journal/entradas": "journal-entries",
  "/journal/entries": "journal-entries",
  "/journal/ai-review": "journal-ai-review",
  "/journal/ai": "journal-ai-review",
  "/estrategias": "strategies",
  "/estrategias/lab": "strategies",
  "/estrategias/strategy-lab": "strategies",
  "/estrategias/backtest-vs-real": "strategies-backtest",
  "/estrategias/backtest": "strategies-backtest",
  "/estrategias/portafolios": "strategies-portfolio",
  "/estrategias/portfolio": "strategies-portfolio",
  "/strategies": "strategies",
  "/funding": "funded",
  "/funding/challenges": "funded",
  "/funding/reglas": "funded-rules",
  "/funding/rules": "funded-rules",
  "/funding/payouts": "funded-payouts",
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

const PAGE_PARENT = Object.freeze({
  "analytics-daily": "analytics",
  "analytics-hourly": "analytics",
  "analytics-risk": "analytics",
  "risk-ruin-var": "risk",
  "risk-monte-carlo": "risk",
  "risk-exposure": "risk",
  "journal-review": "journal",
  "journal-entries": "journal",
  "journal-ai-review": "journal",
  "strategies-backtest": "strategies",
  "strategies-portfolio": "portfolio",
  "funded-rules": "funded",
  "funded-payouts": "funded"
});

const NAV_PARENT = Object.freeze({
  "analytics-daily": "analytics",
  "analytics-hourly": "analytics",
  "analytics-risk": "analytics",
  "risk-ruin-var": "risk",
  "risk-monte-carlo": "risk",
  "risk-exposure": "risk",
  "journal-review": "journal",
  "journal-entries": "journal",
  "journal-ai-review": "journal",
  "strategies-backtest": "strategies",
  "strategies-portfolio": "strategies",
  "funded-rules": "funded",
  "funded-payouts": "funded"
});

const ANALYTICS_TAB_BY_PAGE = Object.freeze({
  analytics: "summary",
  "analytics-daily": "daily",
  "analytics-hourly": "hourly",
  "analytics-risk": "risk"
});

const ANALYTICS_PAGE_BY_TAB = Object.freeze({
  summary: "analytics",
  daily: "analytics-daily",
  hourly: "analytics-hourly",
  risk: "analytics-risk"
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

export function parentPageForPage(page = DEFAULT_PAGE) {
  return PAGE_PARENT[page] || page || DEFAULT_PAGE;
}

export function navigationParentForPage(page = DEFAULT_PAGE) {
  return NAV_PARENT[page] || page || DEFAULT_PAGE;
}

export function analyticsTabForPage(page = DEFAULT_PAGE) {
  return ANALYTICS_TAB_BY_PAGE[page] || null;
}

export function analyticsPageForTab(tab = "summary") {
  return ANALYTICS_PAGE_BY_TAB[tab] || "analytics";
}

export function hasAuthUrlState(location = window.location) {
  const searchParams = new URLSearchParams(location?.search || "");
  const authSearchKeys = ["access_token", "auth", "code", "error", "error_code", "refresh_token", "state", "type"];
  if (authSearchKeys.some((key) => searchParams.has(key))) return true;
  const hash = String(location?.hash || "");
  return /(?:access_token|auth=|code=|error=|error_code=|refresh_token|type=)/i.test(hash);
}
