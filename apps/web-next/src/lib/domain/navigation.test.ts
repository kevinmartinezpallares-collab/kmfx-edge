import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  getMobileNavigationPlan,
  getRouteAccessLevel,
  isNavigationHrefActive,
  mobileRoutePriorities,
  navigationGroups,
  routeDecisionQuestions,
  routeAccessLevels,
  resolveRouteTitle,
  routeTitles,
} from "@/lib/domain/navigation";
import { upcomingRouteList } from "@/lib/domain/upcoming-routes";

function collectNavigationHrefs() {
  return navigationGroups.flatMap((group) =>
    group.items.flatMap((item) => [
      item.href,
      ...(item.children?.map((child) => child.href) ?? []),
    ]),
  ).filter((href): href is string => Boolean(href));
}

function collectDisabledNavigationHrefs() {
  return navigationGroups.flatMap((group) =>
    group.items.flatMap((item) => [
      !item.enabled ? item.href : null,
      ...(item.children?.map((child) => (!child.enabled ? child.href : null)) ?? []),
    ]),
  ).filter((href): href is string => Boolean(href));
}

function collectSmokeRoutes(arrayName: "v1Routes" | "upcomingRoutes" | "adminBlockedRoutes") {
  const source = fs.readFileSync(
    path.join(process.cwd(), "scripts/smoke-workspace-routes.mjs"),
    "utf8",
  );
  const arrayMatch = source.match(new RegExp(`const ${arrayName} = \\[([\\s\\S]*?)\\];`));

  if (!arrayMatch) return [];

  return Array.from(arrayMatch[1].matchAll(/"([^"]+)"/g)).map((match) => match[1]);
}

function routePagePath(href: string) {
  const routePath = href === "/" ? "page.tsx" : `${href.slice(1)}/page.tsx`;

  return path.join(process.cwd(), "src/app/(workspace)", routePath);
}

function collectWorkspacePageRoutes(directory = path.join(process.cwd(), "src/app/(workspace)")): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) return collectWorkspacePageRoutes(absolutePath);
    if (!entry.isFile() || entry.name !== "page.tsx") return [];

    const relativeDirectory = path.relative(path.join(process.cwd(), "src/app/(workspace)"), directory);
    return relativeDirectory ? [`/${relativeDirectory}`] : ["/"];
  });
}

describe("navigation route coverage", () => {
  it("keeps every sidebar link backed by an App Router page", () => {
    const missing = Array.from(new Set(collectNavigationHrefs())).filter(
      (href) => !fs.existsSync(routePagePath(href)),
    );

    expect(missing).toEqual([]);
  });

  it("keeps route titles aligned with existing workspace routes", () => {
    const missing = Object.keys(routeTitles).filter(
      (href) => !fs.existsSync(routePagePath(href)),
    );

    expect(missing).toEqual([]);
  });

  it("keeps every workspace page backed by a visible route title", () => {
    const missing = collectWorkspacePageRoutes().filter((href) => !routeTitles[href]);

    expect(missing).toEqual([]);
  });

  it("renders every disabled product route through the upcoming section", () => {
    const disabledHrefs = Array.from(new Set(collectDisabledNavigationHrefs())).sort();
    const upcomingHrefs = upcomingRouteList.map((route) => route.href).sort();
    const routesWithoutUpcomingPage = disabledHrefs.filter((href) => {
      const source = fs.readFileSync(routePagePath(href), "utf8");
      return !source.includes("UpcomingSection") || !source.includes("upcomingRoutes");
    });

    expect(upcomingHrefs).toEqual(disabledHrefs);
    expect(routesWithoutUpcomingPage).toEqual([]);
  });

  it("keeps smoke route coverage aligned with V1 and upcoming navigation", () => {
    const disabledHrefs = new Set(collectDisabledNavigationHrefs());
    const adminHrefs = Object.entries(routeAccessLevels)
      .filter(([, access]) => access === "admin")
      .map(([href]) => href)
      .sort();
    const expectedV1SmokeRoutes = Object.keys(routeTitles)
      .filter((href) => getRouteAccessLevel(href) === "user")
      .filter((href) => !disabledHrefs.has(href))
      .sort();
    const expectedUpcomingSmokeRoutes = Array.from(disabledHrefs).sort();

    expect(collectSmokeRoutes("v1Routes").sort()).toEqual(expectedV1SmokeRoutes);
    expect(collectSmokeRoutes("upcomingRoutes").sort()).toEqual(expectedUpcomingSmokeRoutes);
    expect(collectSmokeRoutes("adminBlockedRoutes").sort()).toEqual(adminHrefs);
  });
});

describe("navigation product contract", () => {
  it("marks the agreed V1 sections as available and advanced modules as upcoming", () => {
    const topLevelItems = navigationGroups.flatMap((group) => group.items);
    const enabledTitles = topLevelItems
      .filter((item) => item.enabled)
      .map((item) => item.title);
    const upcomingTitles = topLevelItems
      .filter((item) => !item.enabled)
      .map((item) => item.title);

    expect(enabledTitles).toEqual([
      "Panel",
      "Cuentas",
      "Portfolio",
      "Insights",
      "Trades",
      "Calendario",
      "Calculadora",
      "Biblioteca",
      "Ajustes",
      "Suscripción",
    ]);
    expect(upcomingTitles).toEqual([
      "RiskGuard",
      "Review",
      "Playbooks",
      "Prop Firms",
      "Mercado",
      "Ejecución",
    ]);
  });

  it("keeps children of upcoming modules disabled", () => {
    const invalidChildren = navigationGroups.flatMap((group) =>
      group.items.flatMap((item) => {
        if (item.enabled) return [];

        return (item.children ?? [])
          .filter((child) => child.enabled)
          .map((child) => `${item.title} / ${child.title}`);
      }),
    );

    expect(invalidChildren).toEqual([]);
  });

  it("keeps the sidebar grouped around the agreed trader workflow", () => {
    expect(navigationGroups.map((group) => group.label)).toEqual([
      "Operativa",
      "Decisión",
      "Próximamente",
      "Sistema",
    ]);

    expect(navigationGroups[0].items.map((item) => item.title)).toEqual([
      "Panel",
      "Cuentas",
      "Portfolio",
    ]);

    expect(navigationGroups[1].items.map((item) => item.title)).toEqual([
      "Insights",
      "Trades",
      "Calendario",
    ]);

    expect(navigationGroups[2].items.map((item) => item.title)).toEqual([
      "RiskGuard",
      "Review",
      "Playbooks",
      "Prop Firms",
      "Mercado",
      "Ejecución",
    ]);

    expect(navigationGroups[3].items.map((item) => item.title)).toEqual([
      "Calculadora",
      "Biblioteca",
      "Ajustes",
      "Suscripción",
    ]);
  });

  it("keeps every active V1 route tied to a clear trader question", () => {
    const disabledHrefs = new Set(collectDisabledNavigationHrefs());
    const activeUserRoutes = Object.keys(routeTitles)
      .filter((href) => getRouteAccessLevel(href) === "user")
      .filter((href) => !disabledHrefs.has(href));

    const missingQuestions = activeUserRoutes.filter((href) => {
      const question = routeDecisionQuestions[href];

      return !question || !question.startsWith("¿") || !question.endsWith("?");
    });
    const questionsOutsideV1 = Object.keys(routeDecisionQuestions).filter(
      (href) => !activeUserRoutes.includes(href),
    );

    expect(missingQuestions).toEqual([]);
    expect(questionsOutsideV1).toEqual([]);
  });

  it("keeps primary route titles aligned with user-facing naming", () => {
    expect(routeTitles).toMatchObject({
      "/dashboard": "Panel",
      "/accounts": "Cuentas",
      "/risk": "RiskGuard",
      "/analytics": "Insights",
      "/capital": "Portfolio",
      "/market/economic-calendar": "Mercado / Noticias",
      "/tools/calculator": "Calculadora / Lotaje",
    });
  });

  it("does not leak legacy roadmap labels into visible navigation", () => {
    const visibleLabels = navigationGroups.flatMap((group) => [
      group.label,
      ...group.items.flatMap((item) => [
        item.title,
        ...(item.children?.map((child) => child.title) ?? []),
      ]),
    ]);

    expect(visibleLabels).not.toContain("Desk");
    expect(visibleLabels).not.toContain("Edge");
    expect(visibleLabels).not.toContain("Decision");
    expect(visibleLabels).not.toContain("Ejecucion");
    expect(visibleLabels).not.toContain("Mockup");
    expect(visibleLabels).not.toContain("Scaffold");
  });

  it("resolves active state and titles from URL pathnames", () => {
    expect(isNavigationHrefActive("/journal/review-queue", "/journal")).toBe(true);
    expect(isNavigationHrefActive("/journalish", "/journal")).toBe(false);
    expect(isNavigationHrefActive("/analytics/daily?range=30d", "/analytics")).toBe(true);
    expect(resolveRouteTitle("/analytics/daily?range=30d")).toBe("Insights / Día");
    expect(resolveRouteTitle("/funding/journeys/abc")).toBe("Prop Firms / Procesos");
    expect(resolveRouteTitle("/unknown")).toBe("Panel");
  });

  it("defines mobile priorities without exposing admin routes as primary", () => {
    const mobilePlan = getMobileNavigationPlan();
    const topLevelHrefs = navigationGroups
      .flatMap((group) => group.items)
      .map((item) => item.href)
      .filter((href): href is string => Boolean(href));

    expect(topLevelHrefs.filter((href) => !mobileRoutePriorities[href])).toEqual([]);

    expect(mobilePlan.primary.map((item) => item.href)).toEqual([
      "/dashboard",
      "/accounts",
    ]);
    expect(mobilePlan.secondary.map((item) => item.href)).toEqual([
      "/analytics",
      "/trades",
      "/calendar",
      "/capital",
    ]);
    expect(mobilePlan.lower.map((item) => item.href)).toContain("/settings");
    expect(mobilePlan.primary.map((item) => item.href)).not.toContain("/debug");
  });

  it("keeps admin-only route metadata explicit", () => {
    const visibleHrefs = collectNavigationHrefs();
    const adminRoutes = Object.entries(routeAccessLevels)
      .filter(([, access]) => access === "admin")
      .map(([href]) => href);

    expect(getRouteAccessLevel("/debug")).toBe("admin");
    expect(getRouteAccessLevel("/debug/snapshot")).toBe("admin");
    expect(getRouteAccessLevel("/dashboard")).toBe("user");
    expect(adminRoutes.filter((href) => visibleHrefs.includes(href))).toEqual([]);
  });
});
