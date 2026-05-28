import { afterEach, describe, expect, it, vi } from "vitest";

async function loadConfig() {
  vi.resetModules();
  return import("@/lib/config/macro-calendar");
}

describe("macro calendar config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to the free TradingView widget and enabled state", async () => {
    vi.stubEnv("NEXT_PUBLIC_MACRO_CALENDAR_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_MACRO_CALENDAR_PROVIDER", "");

    const { macroCalendarConfig } = await loadConfig();

    expect(macroCalendarConfig.enabled).toBe(true);
    expect(macroCalendarConfig.provider).toBe("tradingview");
    expect(macroCalendarConfig.tradingViewScriptSrc).toContain("tradingview.com");
  });

  it("allows disabling the widget without changing the route", async () => {
    vi.stubEnv("NEXT_PUBLIC_MACRO_CALENDAR_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_MACRO_CALENDAR_PROVIDER", "tradingview");

    const { macroCalendarConfig } = await loadConfig();

    expect(macroCalendarConfig.enabled).toBe(false);
    expect(macroCalendarConfig.provider).toBe("tradingview");
  });

  it("falls back to TradingView when a provider is unsupported", async () => {
    vi.stubEnv("NEXT_PUBLIC_MACRO_CALENDAR_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_MACRO_CALENDAR_PROVIDER", "fxstreet");

    const { macroCalendarConfig } = await loadConfig();

    expect(macroCalendarConfig.provider).toBe("tradingview");
  });
});
