import { describe, expect, it } from "vitest";

import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/formatters/numbers";

describe("number formatters", () => {
  it("formats account currency with Spanish separators", () => {
    expect(formatCurrency(25218.75, "USD")).toBe("25.219 US$");
    expect(formatCurrency(25218.75, "EUR")).toBe("25.219 €");
  });

  it("keeps signed currency explicit for PnL values", () => {
    expect(formatSignedCurrency(98.25, "USD")).toBe("+98 US$");
    expect(formatSignedCurrency(-98.25, "USD")).toBe("-98 US$");
    expect(formatSignedCurrency(0, "USD")).toBe("0 US$");
  });

  it("does not add positive signs to percent labels by default", () => {
    expect(formatPercent(4)).toBe("4.00%");
    expect(formatPercent(4, 1)).toBe("4.0%");
  });
});
