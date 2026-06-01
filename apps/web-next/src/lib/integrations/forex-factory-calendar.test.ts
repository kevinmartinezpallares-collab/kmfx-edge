import { describe, expect, it } from "vitest";

import { parseForexFactoryCalendarEvents } from "@/lib/integrations/forex-factory-calendar";

describe("parseForexFactoryCalendarEvents", () => {
  it("normalizes Forex Factory weekly export rows into economic calendar events", () => {
    const events = parseForexFactoryCalendarEvents(
      [
        {
          title: "ISM Manufacturing PMI",
          country: "USD",
          date: "2026-06-01T10:00:00-04:00",
          impact: "High",
          forecast: "53.3",
          previous: "52.7",
        },
        {
          title: "Bank Holiday",
          country: "NZD",
          date: "2026-06-01T16:00:00-04:00",
          impact: "Holiday",
          forecast: "",
          previous: "",
        },
      ],
      "2026-06-01T06:00:00.000Z",
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      country: "Estados Unidos",
      currency: "USD",
      impact: "alto",
      source: {
        provider: "Forex Factory",
        status: "connected",
      },
      title: "ISM Manufacturing PMI",
    });
    expect(events[0]?.affectedSymbols).toContain("XAUUSD");
    expect(events[0]?.forecast).toBe("53.3");
  });
});
