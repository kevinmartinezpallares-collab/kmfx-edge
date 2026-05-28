import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function snippetAround(source: string, needle: string, radius = 360) {
  const index = source.indexOf(needle);
  if (index === -1) return "";

  return source.slice(Math.max(0, index - radius), index + needle.length + radius);
}

describe("V1 action safety contract", () => {
  it("keeps account destructive and launcher actions visually present but inert", () => {
    const source = readSource("src/components/uitripled/account-cards-slider-shadcnui.tsx");
    const deleteAccount = snippetAround(source, "Eliminar cuenta");
    const launcher = snippetAround(source, "Abrir launcher");

    expect(deleteAccount).toContain("disabled");
    expect(deleteAccount).toContain('variant="destructive"');
    expect(deleteAccount).toContain("Pendiente");
    expect(deleteAccount).not.toMatch(/onClick|onSelect|href=|fetch\(|window\.location|router\./);

    expect(launcher).toContain("disabled");
    expect(launcher).toContain("Pendiente");
    expect(launcher).not.toMatch(/onClick|onSelect|href=|fetch\(|window\.location|router\./);
  });

  it("keeps logout as a destructive visual affordance without activating auth flow in V1", () => {
    const sources = [
      readSource("src/components/trading/workspace-shell.tsx"),
      readSource("src/components/nav-user.tsx"),
    ];

    for (const source of sources) {
      const logout = snippetAround(source, "Cerrar sesión", 260);

      expect(logout).toMatch(/text-red|destructive/);
      expect(logout).not.toMatch(/href=|signOut|fetch\(|window\.location|router\./i);
    }
  });

  it("keeps sensitive write-flow handlers out of prepared V1 account actions", () => {
    const source = readSource("src/components/uitripled/account-cards-slider-shadcnui.tsx");
    const preparedActions = [
      snippetAround(source, "Eliminar cuenta"),
      snippetAround(source, "Abrir launcher"),
      snippetAround(source, "Editar cuenta"),
    ].join("\n");

    expect(preparedActions).not.toMatch(
      /deleteAccount|removeAccount|disconnectAccount|launchMT5|openLauncher|fetch\(|window\.location|router\./i,
    );
  });

  it("keeps live beta behind a server-side preview gate when configured", () => {
    const source = readSource("src/proxy.ts");

    expect(source).toContain("KMFX_BETA_GATE_PASSWORD");
    expect(source).toContain("WWW-Authenticate");
    expect(source).toContain("Basic realm");
    expect(source).toContain("authorization");
    expect(source).toContain("Cache-Control");
    expect(source).not.toContain("NEXT_PUBLIC_KMFX_BETA_GATE_PASSWORD");
  });
});
