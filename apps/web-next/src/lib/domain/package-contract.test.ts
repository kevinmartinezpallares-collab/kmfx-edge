import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function readPackageJson() {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
  ) as PackageJson;
}

describe("package contract", () => {
  it("keeps the migration on stable Next 16 and compatible React packages", () => {
    const pkg = readPackageJson();
    const dependencies = pkg.dependencies ?? {};
    const devDependencies = pkg.devDependencies ?? {};

    expect(dependencies.next).toMatch(/^16\./);
    expect(dependencies.next).not.toMatch(/canary|alpha|beta|rc/i);
    expect(dependencies.react).toMatch(/^19\./);
    expect(dependencies["react-dom"]).toBe(dependencies.react);
    expect(devDependencies["eslint-config-next"]).toBe(dependencies.next);
    expect(devDependencies["@types/react"]).toMatch(/^19\./);
    expect(devDependencies["@types/react-dom"]).toMatch(/^19\./);
  });

  it("keeps Tailwind 4.3 and the safe validation scripts available", () => {
    const pkg = readPackageJson();
    const scripts = pkg.scripts ?? {};
    const devDependencies = pkg.devDependencies ?? {};

    expect(devDependencies.tailwindcss).toMatch(/^4\.3\./);
    expect(scripts.test).toBe("vitest run");
    expect(scripts.typecheck).toBe("tsc --noEmit --pretty false");
    expect(scripts.lint).toBe("eslint");
    expect(scripts.validate).toBe("npm run test && npm run typecheck && npm run lint");
    expect(scripts["qa:mobile:v1"]).toBe("node scripts/audit-v1-mobile.mjs");
    expect(scripts["qa:screenshots:v1"]).toBe("node scripts/capture-v1-qa-screenshots.mjs");
    expect(scripts["qa:live:snapshot"]).toBe("node scripts/audit-live-snapshot.mjs");
    expect(scripts["validate:cascade"]).toContain("migration-scope");
    expect(scripts["validate:cascade"]).toContain("workspace-source-contract");
    expect(scripts["validate:cascade"]).toContain("kmfx-api-config");
    expect(scripts["validate:cascade"]).toContain("shell-contract");
    expect(scripts["validate:cascade"]).toContain("action-safety");
    expect(scripts["validate:cascade"]).toContain("v1-readiness-contract");
    expect(scripts["validate:cascade"]).toContain("live-snapshot-adapter");
    expect(scripts["validate:cascade"]).toContain("live-snapshot-readiness");
    expect(scripts["validate:cascade"]).toContain("navigation");
    expect(scripts["validate:cascade"]).toContain("visible-copy");
    expect(scripts["validate:cascade"]).toContain("theme-contract");
    expect(scripts["validate:cascade"]).toContain("typecheck");
    expect(scripts["validate:cascade"]).toContain("lint");
  });

  it("keeps the default preview path on webpack to avoid Turbopack memory regressions", () => {
    const pkg = readPackageJson();
    const scripts = pkg.scripts ?? {};

    expect(scripts.predev).toBe("rm -rf .next/dev");
    expect(scripts.dev).toBe("next dev --webpack");
    expect(scripts.dev).not.toMatch(/turbo/i);
    expect(scripts["dev:turbo"]).toBe("next dev --turbopack");
  });
});
