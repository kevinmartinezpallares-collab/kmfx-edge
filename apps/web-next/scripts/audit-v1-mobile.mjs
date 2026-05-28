import { chromium } from "playwright";

const baseUrl = process.env.KMFX_QA_BASE_URL ?? "http://localhost:3043";

const routes = [
  "/dashboard",
  "/accounts",
  "/capital",
  "/analytics",
  "/analytics/daily",
  "/analytics/hourly",
  "/analytics/risk",
  "/trades",
  "/calendar",
  "/tools/calculator",
  "/study",
  "/settings",
  "/subscription",
  "/settings/subscription",
];

const themes = ["dark", "light"];

async function assertServerReady() {
  try {
    const response = await fetch(`${baseUrl}/dashboard`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(
      `QA mobile necesita el servidor dev activo en ${baseUrl}. Detalle: ${error.message}`,
    );
  }
}

async function applyTheme(page, theme) {
  await page.addInitScript((selectedTheme) => {
    window.localStorage.setItem("theme", selectedTheme);
    document.documentElement.classList.toggle("dark", selectedTheme === "dark");
  }, theme);
}

async function collectSmallTouchTargets(page) {
  return page.evaluate(() => {
    const candidates = Array.from(
      document.querySelectorAll(
        'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="menuitem"]',
      ),
    );

    return candidates
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const label =
          element.getAttribute("aria-label") ||
          element.textContent?.replace(/\s+/g, " ").trim() ||
          element.getAttribute("href") ||
          element.getAttribute("role") ||
          element.tagName.toLowerCase();

        return {
          label: label?.slice(0, 80) ?? element.tagName.toLowerCase(),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          hidden:
            rect.width <= 1 ||
            rect.height <= 1 ||
            style.visibility === "hidden" ||
            style.display === "none" ||
            Number(style.opacity) === 0,
        };
      })
      .filter((target) => !target.hidden)
      .filter((target) => target.width < 40 || target.height < 40)
      .slice(0, 12);
  });
}

await assertServerReady();

const browser = await chromium.launch({ headless: true });
const failures = [];
const warnings = [];

for (const route of routes) {
  for (const theme of themes) {
    const context = await browser.newContext({
      colorScheme: theme,
      viewport: { width: 390, height: 1000 },
      isMobile: true,
    });
    const page = await context.newPage();
    await applyTheme(page, theme);

    try {
      await page.goto(`${baseUrl}${route}`, {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      await page.waitForTimeout(350);

      const runtimeErrors = await page
        .locator("text=/Runtime Error|Cannot find module|This page couldn|Application error/i")
        .count();
      const headings = await page.locator("h1").count();
      const layout = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      const smallTargets = await collectSmallTouchTargets(page);

      if (runtimeErrors > 0) {
        failures.push(`${route} ${theme}: runtime error visible`);
      }

      if (headings === 0) {
        failures.push(`${route} ${theme}: no hay H1 visible`);
      }

      if (layout.scrollWidth > layout.clientWidth + 2) {
        failures.push(
          `${route} ${theme}: scroll horizontal de pagina (${layout.scrollWidth}px > ${layout.clientWidth}px)`,
        );
      }

      if (smallTargets.length > 0) {
        warnings.push(
          `${route} ${theme}: ${smallTargets.length} controles compactos (${smallTargets
            .map((target) => `${target.label} ${target.width}x${target.height}`)
            .join("; ")})`,
        );
      }
    } catch (error) {
      failures.push(`${route} ${theme}: ${error.message}`);
    } finally {
      await context.close();
    }
  }
}

await browser.close();

if (warnings.length > 0) {
  console.warn(`QA mobile avisos tactiles:\n${warnings.join("\n")}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`QA mobile OK: ${routes.length} rutas V1 validadas en dark/light.`);
