import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const visibleCopyDirectories = [
  "src/app/(workspace)",
  "src/app/login",
  "src/components/app",
  "src/components/auth",
  "src/components/trading",
];

const additionalVisibleCopyFiles = [
  "src/app/layout.tsx",
  "src/components/nav-user.tsx",
  "src/components/latest-change.tsx",
  "src/lib/data/wave1-mock.ts",
  "src/lib/data/live-snapshot-adapter.ts",
  "src/lib/domain/dashboard-selectors.ts",
  "src/lib/domain/analytics-selectors.ts",
  "src/lib/domain/calendar-selectors.ts",
  "src/lib/domain/review-selectors.ts",
  "src/lib/domain/strategies-selectors.ts",
  "src/lib/domain/portfolio-selectors.ts",
  "src/lib/domain/journal-selectors.ts",
  "src/lib/domain/execution-selectors.ts",
  "src/lib/domain/study-selectors.ts",
  "src/lib/domain/settings-selectors.ts",
  "src/lib/domain/upcoming-routes.ts",
];

function collectSourceFiles(relativeDirectory: string): string[] {
  const absoluteDirectory = path.join(process.cwd(), relativeDirectory);

  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);

    if (entry.isDirectory()) return collectSourceFiles(relativePath);
    if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) return [relativePath];

    return [];
  });
}

function visibleCopyFiles() {
  return [
    ...visibleCopyDirectories.flatMap(collectSourceFiles),
    ...additionalVisibleCopyFiles,
  ];
}

const forbiddenVisibleCopy = [
  "Pocos trades",
  "Muestra",
  "muestra ",
  "Sin tag",
  "News Guard",
  "Fixture",
  "Mockup",
  "Wave",
  "muestra insuficiente",
  "Muestra insuficiente",
  "drena",
  "Drena",
  "fugas",
  "Fugas",
  "mayor budget",
  "cobertura de tags",
  "Workspace owner",
  "Acceso al workspace",
  "mismo workspace",
  "Trading workspace",
  "Ajustes del workspace",
  "Workspace preparado",
  "del workspace",
  "KMFX Edge Lab",
  "Sincronizar",
  "Sincronización",
  "Latencia",
  "Snapshot MT5",
  "Live account",
  "Datos en vivo",
  "real-time",
  "tiempo real",
  "bloquea nueva operativa",
  "bloquea MT5",
  "bloquea técnicamente",
  "Manual / sin clasificar",
  "Sig. trade",
  "Faltan trades",
  "trades reales",
  "trades suficientes",
  " trades /",
  " lots",
  " · ",
  "Freshness",
  "Sin sync",
  "Sync pendiente",
  "Workspace en revisión",
  "Workspace operativo",
  "Acceso operativo",
  "Centro operativo",
  "Log out",
  "Plan & Billing",
  "Upgrade to Pro",
];

describe("visible copy contract", () => {
  it("keeps agreed trader-facing vocabulary out of main UI surfaces", () => {
    const leaks = visibleCopyFiles().flatMap((relativePath) => {
      const absolutePath = path.join(process.cwd(), relativePath);
      const source = fs.readFileSync(absolutePath, "utf8");

      return forbiddenVisibleCopy
        .filter((term) => source.includes(term))
        .map((term) => `${relativePath}: ${term}`);
    });

    expect(leaks).toEqual([]);
  });
});
