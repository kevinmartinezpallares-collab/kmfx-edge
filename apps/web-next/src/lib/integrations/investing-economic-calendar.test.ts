import { describe, expect, it } from "vitest";

import { parseInvestingCalendarResponse } from "@/lib/integrations/investing-economic-calendar";

describe("parseInvestingCalendarResponse", () => {
  it("extracts CPI releases from Investing economic calendar payloads", () => {
    const releases = parseInvestingCalendarResponse(
      {
        events: [
          {
            currency: "EUR",
            event_id: 68,
            long_name: "Eurozone Consumer Price Index (CPI) YoY",
            source_url: "https://ec.europa.eu/eurostat",
          },
          {
            currency: "EUR",
            event_id: 317,
            long_name: "Eurozone Core Consumer Price Index (CPI) YoY",
            source_url: "https://ec.europa.eu/eurostat",
          },
        ],
        occurrences: [
          {
            actual: 3.2,
            event_id: 68,
            forecast: 3.2,
            occurrence_time: "2026-06-02T09:00:00Z",
            precision: 1,
            previous: 3,
            unit: "%",
          },
          {
            actual: 2.5,
            event_id: 317,
            forecast: 2.4,
            occurrence_time: "2026-06-02T09:00:00Z",
            precision: 1,
            previous: 2.2,
            unit: "%",
          },
        ],
      },
      "https://endpoints.investing.com/pd-instruments/v1/calendars/economic/events/occurrences",
    );

    expect(releases.get(68)).toMatchObject({
      actual: "3.2%",
      forecast: "3.2%",
      previous: "3.0%",
      releasedAt: "2026-06-02T09:00:00.000Z",
      sourceUrl: "https://ec.europa.eu/eurostat",
    });
    expect(releases.get(317)).toMatchObject({
      actual: "2.5%",
      forecast: "2.4%",
      previous: "2.2%",
    });
  });

  it("extracts US employment situation releases", () => {
    const releases = parseInvestingCalendarResponse(
      {
        events: [
          {
            currency: "USD",
            event_id: 8,
            long_name: "U.S. Average Hourly Earnings MoM",
            source_url: "https://www.bls.gov/news.release/empsit.toc.htm",
          },
          {
            currency: "USD",
            event_id: 227,
            long_name: "U.S. Nonfarm Payrolls",
            source_url: "https://www.bls.gov/news.release/empsit.nr0.htm",
          },
          {
            currency: "USD",
            event_id: 300,
            long_name: "U.S. Unemployment Rate",
            source_url: "https://www.bls.gov/news.release/empsit.nr0.htm",
          },
        ],
        occurrences: [
          {
            actual: 0.4,
            event_id: 8,
            forecast: 0.3,
            occurrence_time: "2026-06-05T12:30:00Z",
            precision: 1,
            previous: 0.2,
            unit: "%",
          },
          {
            actual: 92,
            event_id: 227,
            forecast: 85,
            occurrence_time: "2026-06-05T12:30:00Z",
            precision: 0,
            previous: 115,
            unit: "K",
          },
          {
            actual: 4.3,
            event_id: 300,
            forecast: 4.3,
            occurrence_time: "2026-06-05T12:30:00Z",
            precision: 1,
            previous: 4.3,
            unit: "%",
          },
        ],
      },
      "https://endpoints.investing.com/pd-instruments/v1/calendars/economic/events/occurrences",
    );

    expect(releases.get(8)).toMatchObject({
      actual: "0.4%",
      forecast: "0.3%",
      previous: "0.2%",
    });
    expect(releases.get(227)).toMatchObject({
      actual: "92K",
      forecast: "85K",
      previous: "115K",
    });
    expect(releases.get(300)).toMatchObject({
      actual: "4.3%",
      forecast: "4.3%",
      previous: "4.3%",
      releasedAt: "2026-06-05T12:30:00.000Z",
    });
  });
});
