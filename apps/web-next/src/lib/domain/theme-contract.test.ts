import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const requiredThemeTokens = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--primary",
  "--primary-foreground",
  "--border",
  "--ring",
  "--sidebar",
  "--sidebar-foreground",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--profit",
  "--profit-muted",
  "--loss",
  "--loss-muted",
  "--risk",
  "--risk-muted",
  "--breakeven",
  "--info",
  "--info-muted",
  "--chart-background",
  "--chart-label",
  "--chart-foreground",
  "--chart-foreground-muted",
  "--chart-line-primary",
  "--chart-line-secondary",
  "--chart-crosshair",
  "--chart-grid",
  "--chart-tooltip-background",
  "--chart-tooltip-foreground",
  "--chart-tooltip-muted",
  "--chart-marker-background",
  "--chart-marker-border",
  "--chart-marker-foreground",
  "--chart-ring-background",
];

function readGlobalsCss() {
  return fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
}

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function extractBlock(source: string, selector: string) {
  const match = source.match(new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? "";
}

describe("theme contract", () => {
  it("keeps shadcn/Tailwind imports and dark variant available", () => {
    const source = readGlobalsCss();

    expect(source).toContain('@import "tailwindcss";');
    expect(source).toContain('@import "shadcn/tailwind.css";');
    expect(source).toContain("@custom-variant dark");
    expect(source).toContain("@theme inline");
  });

  it("keeps auth backgrounds compatible with OKLCH tokens", () => {
    const source = readSource("src/components/auth/auth-page.tsx");

    expect(source).toContain("color-mix(in oklch");
    expect(source).not.toContain("hsl(var(--");
  });

  it("keeps auth bot verification from shifting the login layout", () => {
    const source = readSource("src/components/auth/auth-page.tsx");

    expect(source).toContain('className="min-h-[65px] overflow-hidden rounded-xl"');
    expect(source).toContain('data-turnstile-container=""');
    expect(source).toContain("overflow-hidden bg-background text-foreground");
    expect(source).toContain("7 días gratis");
    expect(source).not.toContain("inviteOnlySignup");
    expect(source).not.toContain("inviteCode");
    expect(source).not.toContain("/api/kmfx/invite/validate");
  });

  it("pre-hydrates the selected theme before app paint", () => {
    const layoutSource = readSource("src/app/layout.tsx");
    const providerSource = readSource("src/components/app/theme-provider.tsx");

    expect(layoutSource).toContain("themeBootScript");
    expect(layoutSource).toContain('data-theme="dark"');
    expect(layoutSource).toContain('pathname === "/login"');
    expect(layoutSource).toContain('pathname.startsWith("/auth/")');
    expect(providerSource).toContain("function shouldForceDarkTheme");
    expect(providerSource).toContain("usePathname()");
    expect(providerSource).toContain("root.dataset.theme = resolvedTheme;");
  });

  it("keeps required tokens defined for light and dark structure", () => {
    const source = readGlobalsCss();
    const rootBlock = extractBlock(source, ":root");
    const darkBlock = extractBlock(source, ".dark");

    const missingRootTokens = requiredThemeTokens.filter(
      (token) => !rootBlock.includes(`${token}:`),
    );
    const missingDarkTokens = requiredThemeTokens.filter(
      (token) => !darkBlock.includes(`${token}:`),
    );

    expect(missingRootTokens).toEqual([]);
    expect(missingDarkTokens).toEqual([]);
  });

  it("keeps dashboard Liveline charts bound to theme-aware tokens", () => {
    const source = readSource("src/components/trading/mesa-dashboard.tsx");

    expect(source).toContain("function usePanelChartTheme()");
    expect(source).toContain("const CHART_ACCENT_BY_THEME = {");
    expect(source).toContain('light: "#171717"');
    expect(source).toContain('dark: "#f5f5f5"');
    expect(source).toContain('const CHART_ACCENT_SOFT = "var(--chart-line-secondary)"');
    expect(source).toMatch(/theme=\{chartTheme\.theme\}/);
    expect(source).toMatch(/color=\{chartTheme\.accent\}/);
    expect(source).toMatch(/color=\{compact \? chartTheme\.softAccent : chartTheme\.accent\}/);
    expect(source).not.toContain("smoothLivelinePoints");
  });

  it("keeps calendar and portfolio Liveline charts bound to theme-aware tokens", () => {
    const referenceSectionsSource = readSource("src/components/trading/capital/reference-section.tsx");
    const calendarSource = readSource("src/components/trading/calendar/reference-section.tsx");
    const source = `${referenceSectionsSource}\n${calendarSource}`;

    expect(source).toContain("function useReferenceLivelineTheme()");
    expect(source).toContain("const LIVELINE_ACCENT_BY_THEME = {");
    expect(source).toContain('dark: "#f5f5f5"');
    expect(source).toContain('light: "#171717"');
    expect(source).toMatch(/theme=\{portfolioChartTheme\.theme\}/);
    expect(source).toMatch(/theme=\{capitalChartTheme\.theme\}/);
    expect(source).toMatch(/color=\{portfolioChartTheme\.accent\}/);
    expect(source).toMatch(/color=\{capitalChartTheme\.accent\}/);
    expect(source).toMatch(/color=\{calendarChartTheme\.accent\}/);
    expect(calendarSource).toContain("<Liveline");
    expect(referenceSectionsSource).toContain("<Liveline");
    expect(source).not.toContain("EquityBalanceChart");
  });

  it("keeps Settings from forcing dark mode when the route mounts", () => {
    const source = readSource("src/components/trading/settings/reference-sections.tsx");

    expect(source).toContain("function themeToPreferenceLabel");
    expect(source).toContain("function preferenceLabelToTheme");
    expect(source).toContain("initialValues.Tema = themeToPreferenceLabel(theme);");
    expect(source).toContain('if (label === "Tema")');
    expect(source).not.toContain("const selectedTheme = settingsValues.Tema");
    expect(source).not.toContain("}, [selectedTheme, setTheme]);");
  });
});
