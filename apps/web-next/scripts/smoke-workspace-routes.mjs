import { chromium } from "playwright";

const baseUrl = process.env.KMFX_SMOKE_BASE_URL ?? "http://localhost:3043";

const v1Routes = [
  "/dashboard",
  "/accounts",
  "/analytics",
  "/analytics/daily",
  "/analytics/hourly",
  "/analytics/risk",
  "/trades",
  "/calendar",
  "/capital",
  "/tools/calculator",
  "/study",
  "/settings",
  "/subscription",
  "/settings/subscription",
];

const upcomingRoutes = [
  "/risk",
  "/journal",
  "/journal/review-queue",
  "/journal/entries",
  "/journal/ai-review",
  "/strategies",
  "/strategies/backtest-vs-real",
  "/strategies/portfolio",
  "/funding",
  "/funding/journeys",
  "/funding/accounts",
  "/funding/rules",
  "/funding/payouts",
  "/market",
  "/market/economic-calendar",
  "/execution",
];

const adminBlockedRoutes = [
  "/debug",
];

async function assertServerReady() {
  try {
    const response = await fetch(`${baseUrl}/dashboard`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    throw new Error(
      `Smoke test necesita el servidor dev activo en ${baseUrl}. Detalle: ${error.message}`,
    );
  }
}

await assertServerReady();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
});

const failures = [];

async function gotoWithRetry(route) {
  const url = `${baseUrl}${route}`;
  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "commit", timeout: 60000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(600);
    }
  }

  throw lastError;
}

async function assertRouteHealth(route) {
  try {
    await gotoWithRetry(route);
    await page.waitForLoadState("domcontentloaded", { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(350);

    const runtimeErrors = await page
      .locator("text=/Runtime Error|Cannot find module|This page couldn|Application error/i")
      .count();
    const headings = await page.locator("h1").count();

    if (runtimeErrors > 0) {
      failures.push(`${route}: runtime error visible`);
    }

    if (headings === 0) {
      failures.push(`${route}: no hay H1 visible`);
    }

    return true;
  } catch (error) {
    failures.push(`${route}: ${error.message}`);
    return false;
  }
}

for (const route of v1Routes) {
  await assertRouteHealth(route);
}

for (const route of upcomingRoutes) {
  const routeLoaded = await assertRouteHealth(route);
  if (!routeLoaded) continue;

  const upcomingText = await page.locator("text=Próximamente").count();
  if (upcomingText === 0) {
    failures.push(`${route}: no muestra estado Próximamente`);
  }
}

for (const route of adminBlockedRoutes) {
  const response = await fetch(`${baseUrl}${route}`);

  if (response.status !== 404) {
    failures.push(`${route}: ruta admin debe devolver 404 por defecto, recibio HTTP ${response.status}`);
  }
}

await browser.close();

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `Smoke OK: ${v1Routes.length} rutas V1, ${upcomingRoutes.length} rutas avanzadas y ${adminBlockedRoutes.length} ruta admin validada.`,
);
