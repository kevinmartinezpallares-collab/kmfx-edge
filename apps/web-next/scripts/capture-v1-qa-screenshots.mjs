import fs from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const baseUrl = process.env.KMFX_QA_BASE_URL ?? "http://localhost:3043";
const outputDir =
  process.env.KMFX_QA_OUTPUT_DIR ??
  path.join(process.cwd(), "..", "..", "output", "playwright", "v1-qa");

const routes = [
  { path: "/dashboard", name: "panel" },
  { path: "/accounts", name: "cuentas" },
  { path: "/capital", name: "portfolio" },
  { path: "/analytics", name: "insights" },
  { path: "/analytics/daily", name: "insights-diario" },
  { path: "/analytics/hourly", name: "insights-horario" },
  { path: "/analytics/risk", name: "insights-riesgo" },
  { path: "/trades", name: "trades" },
  { path: "/calendar", name: "calendario" },
  { path: "/tools/calculator", name: "calculadora" },
  { path: "/study", name: "biblioteca" },
  { path: "/settings", name: "ajustes" },
  { path: "/subscription", name: "suscripcion" },
  { path: "/settings/subscription", name: "ajustes-suscripcion" },
];

const viewports = [
  { name: "desktop", width: 1440, height: 1100 },
  { name: "mobile", width: 390, height: 1000, isMobile: true },
];

const themes = ["dark", "light"];

async function assertServerReady() {
  try {
    const response = await fetch(`${baseUrl}/dashboard`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(
      `QA screenshots necesita el servidor dev activo en ${baseUrl}. Detalle: ${error.message}`,
    );
  }
}

function safeFilename(...parts) {
  return parts.join("__").replace(/[^a-z0-9_.-]+/gi, "-").toLowerCase();
}

async function applyTheme(page, theme) {
  await page.addInitScript((selectedTheme) => {
    window.localStorage.setItem("theme", selectedTheme);
    document.documentElement.classList.toggle("dark", selectedTheme === "dark");
  }, theme);
}

async function captureRoute({ browser, route, viewport, theme }) {
  const context = await browser.newContext({
    colorScheme: theme,
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: Boolean(viewport.isMobile),
  });
  const page = await context.newPage();

  await applyTheme(page, theme);
  await page.goto(`${baseUrl}${route.path}`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.waitForTimeout(500);

  const runtimeErrors = await page
    .locator("text=/Runtime Error|Cannot find module|This page couldn|Application error/i")
    .count();
  const headings = await page.locator("h1").count();

  if (runtimeErrors > 0) {
    throw new Error(`${route.path}: runtime error visible`);
  }

  if (headings === 0) {
    throw new Error(`${route.path}: no hay H1 visible`);
  }

  const filename = `${safeFilename(route.name, viewport.name, theme)}.png`;
  const screenshotPath = path.join(outputDir, filename);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await context.close();

  return screenshotPath;
}

await assertServerReady();
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const captures = [];
const failures = [];

for (const route of routes) {
  for (const viewport of viewports) {
    for (const theme of themes) {
      try {
        const screenshotPath = await captureRoute({
          browser,
          route,
          viewport,
          theme,
        });
        captures.push(screenshotPath);
      } catch (error) {
        failures.push(`${route.path} ${viewport.name} ${theme}: ${error.message}`);
      }
    }
  }
}

await browser.close();

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `QA screenshots OK: ${captures.length} capturas V1 generadas en ${outputDir}`,
);
