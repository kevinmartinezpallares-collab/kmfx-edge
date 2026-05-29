import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import { getSettingsOverview } from "@/lib/domain/settings-selectors";

describe("getSettingsOverview", () => {
  it("summarises the safe settings surface without enabling sensitive flows", () => {
    const overview = getSettingsOverview(wave1Workspace);

    expect(overview.status).toBe("attention");
    expect(overview.accountCount).toBe(3);
    expect(overview.connectedCount).toBe(1);
    expect(overview.limitedCount).toBe(1);
    expect(overview.accountRows.map((card) => card.label)).toEqual([
      "Cuenta activa",
      "Plan actual",
      "Cuentas MT5",
    ]);
    expect(overview.profile).toMatchObject({
      displayName: "Usuario KMFX",
      role: "Propietario",
      activeAccountLabel: "KMFX Alpha",
    });
  });

  it("keeps billing behind authenticated safe routes", () => {
    const overview = getSettingsOverview(wave1Workspace);

    expect(overview.safetyRows).toContainEqual({
      label: "Pagos",
      value: "Portal seguro",
      note: "Checkout y portal requieren sesión Supabase activa",
      tone: "ready",
    });
    expect(overview.plan.managementReady).toBe(true);
    expect(overview.plan.managementNote).toBe(
      "Checkout y portal se abren desde sesión segura.",
    );
  });

  it("handles an empty workspace without division copy breaking", () => {
    const overview = getSettingsOverview({
      ...wave1Workspace,
      accounts: [],
    });

    expect(overview.status).toBe("empty");
    expect(overview.accountRows[0]?.value).toBe("Sin cuenta");
    expect(overview.plan.usedAccountsLabel).toBe("0");
  });

  it("marks settings ready when every visible account is connected and active", () => {
    const overview = getSettingsOverview({
      ...wave1Workspace,
      accounts: wave1Workspace.accounts.map((account) => ({
        ...account,
        connectionTone: "connected" as const,
        connectionState: "connected" as const,
        planAccess: "active" as const,
      })),
    });

    expect(overview.status).toBe("ready");
    expect(overview.limitedCount).toBe(0);
    expect(overview.plan.statusLabel).toBe("Activo");
    expect(overview.plan.accountNote).toBe("Cuentas dentro del plan.");
  });

  it("keeps V1 preferences visible and locally actionable", () => {
    const overview = getSettingsOverview(wave1Workspace);

    expect(overview.preferences.map((preference) => preference.label)).toEqual([
      "Idioma",
      "Tema",
      "Formato monetario",
      "Zona horaria",
      "Avisos visuales",
    ]);
    expect(overview.preferences.every((preference) => preference.enabled)).toBe(true);
    expect(overview.preferences.find((preference) => preference.label === "Idioma")?.options).toEqual([
      "Español",
      "English",
    ]);
    expect(overview.preferences.find((preference) => preference.label === "Tema")?.options).toEqual([
      "Oscuro",
      "Claro",
      "Sistema",
    ]);
    expect(
      overview.preferences.find((preference) => preference.label === "Formato monetario")?.options,
    ).toEqual(["USD", "EUR", "GBP"]);
  });

  it("keeps help and legal links aligned with the public KMFX Edge pages", () => {
    const overview = getSettingsOverview(wave1Workspace);

    expect(overview.helpLinks.map((link) => link.label)).toEqual([
      "Soporte",
      "Términos",
      "Privacidad",
      "Reembolsos",
    ]);
    expect(overview.helpLinks.map((link) => link.href)).toEqual([
      "https://kmfxedge.com/support",
      "https://kmfxedge.com/terms",
      "https://kmfxedge.com/privacy",
      "https://kmfxedge.com/refunds",
    ]);
  });
});
