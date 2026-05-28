import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sourceRoot = path.join(process.cwd(), "src");
const workspaceLayoutPath = path.join(
  process.cwd(),
  "src/app/(workspace)/layout.tsx",
);

function collectTsFiles(directory = sourceRoot): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) return collectTsFiles(absolutePath);
    if (!entry.isFile()) return [];
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    if (entry.name.includes(".test.")) return [];

    return [absolutePath];
  });
}

describe("workspace shell contract", () => {
  it("keeps the active workspace layout on the consolidated trading shell", () => {
    const layoutSource = fs.readFileSync(workspaceLayoutPath, "utf8");

    expect(layoutSource).toContain(
      'import { WorkspaceShell } from "@/components/trading/workspace-shell"',
    );
    expect(layoutSource).not.toContain("@/components/app/app-shell");
    expect(layoutSource).not.toContain("@/components/app-shell");
  });

  it("does not import legacy scaffold shells into runtime routes", () => {
    const legacyShellImports = collectTsFiles().flatMap((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      const relativePath = path.relative(process.cwd(), filePath);

      if (
        relativePath === "src/components/app/app-shell.tsx" ||
        relativePath === "src/components/app-shell.tsx"
      ) {
        return [];
      }

      return [
        "@/components/app/app-shell",
        "@/components/app-shell",
        "@/components/app/workspace-sidebar",
        "@/components/app/workspace-topbar",
        "@/components/app/workspace-status-strip",
      ]
        .filter((importPath) => source.includes(importPath))
        .map((importPath) => `${relativePath}: ${importPath}`);
    });

    expect(legacyShellImports).toEqual([]);
  });

  it("keeps upcoming sidebar entries semantically inert", () => {
    const shellSource = fs.readFileSync(
      path.join(process.cwd(), "src/components/trading/workspace-shell.tsx"),
      "utf8",
    );

    expect(shellSource).toContain("aria-disabled={!item.enabled || undefined}");
    expect(shellSource).toContain("disabled={!item.enabled}");
    expect(shellSource).toContain("tabIndex={!item.enabled ? -1 : undefined}");
    expect(shellSource).toContain("aria-disabled={!child.enabled || undefined}");
    expect(shellSource).toContain("tabIndex={!child.enabled ? -1 : undefined}");
  });
});
