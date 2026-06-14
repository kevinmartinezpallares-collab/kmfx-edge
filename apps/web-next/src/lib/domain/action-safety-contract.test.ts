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
  it("keeps launcher visually present but inert and destructive account actions explicit", () => {
    const source = readSource("src/components/uitripled/account-cards-slider-shadcnui.tsx");
    const deleteAccount = snippetAround(source, "Eliminar cuenta");
    const launcher = snippetAround(source, "Abrir launcher");

    expect(deleteAccount).toContain('variant="destructive"');
    expect(deleteAccount).toContain("onDeleteAccount");
    expect(source).toContain("async function deleteAccount");
    expect(source).toContain("deleteAccountConfirmation");

    expect(launcher).toContain("disabled");
    expect(launcher).toContain("Pendiente");
    expect(launcher).not.toMatch(/onClick|onSelect|href=|fetch\(|window\.location|router\./);
  });

  it("keeps logout destructive and routes through the safe signout endpoint", () => {
    const sources = [
      readSource("src/components/trading/workspace-shell.tsx"),
      readSource("src/components/nav-user.tsx"),
    ];

    for (const source of sources) {
      const logout = snippetAround(source, "Cerrar sesión", 260);

      expect(logout).toMatch(/text-red|destructive/);
      expect(logout).not.toMatch(/href=/i);

      if (source.includes("handleSignOut")) {
        const handler = snippetAround(source, "handleSignOut", 520);

        expect(handler).toContain('fetch("/auth/signout"');
        expect(handler).toContain('method: "POST"');
        expect(handler).toContain('router.replace("/login")');
      }
      expect(logout).not.toMatch(/\bsignOut\b|window\.location/);
    }
  });

  it("keeps launcher write-flow handlers out of prepared V1 account actions", () => {
    const source = readSource("src/components/uitripled/account-cards-slider-shadcnui.tsx");
    const preparedActions = [
      snippetAround(source, "Abrir launcher"),
    ].join("\n");

    expect(preparedActions).not.toMatch(
      /launchMT5|openLauncher|fetch\(|window\.location|router\./i,
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

  it("keeps marketing preview explicit and owner-scoped without billing interception", () => {
    const proxySource = readSource("src/proxy.ts");
    const workspaceSource = readSource("src/lib/data/workspace-source.ts");
    const accessSource = readSource("src/lib/auth/marketing-preview-access.ts");

    expect(proxySource).toContain("isMarketingPreviewDemoValue");
    expect(proxySource).toContain("isMarketingPreviewEmail(session.userEmail)");
    expect(proxySource).toContain("hasAllowedMarketingPreview");
    expect(proxySource).not.toContain('marketingUrl.searchParams.set("demo", "marketing")');
    expect(workspaceSource).toContain('previewMode === "marketing"');
    expect(workspaceSource).toContain("isMarketingPreviewEmail(userEmail)");
    expect(accessSource).toContain("KMFX_MARKETING_PREVIEW_EMAILS");
    expect(accessSource).toContain("kevinmartinezpallares@gmail.com");
  });
});
