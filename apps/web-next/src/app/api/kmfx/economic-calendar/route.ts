import { NextResponse } from "next/server";

import { macroCalendarConfig } from "@/lib/config/macro-calendar";
import { fetchForexFactoryCalendarEvents } from "@/lib/integrations/forex-factory-calendar";

export async function GET() {
  if (!macroCalendarConfig.enabled) {
    return NextResponse.json(
      {
        ok: true,
        events: [],
        provider: "Forex Factory",
        reason: "macro_calendar_disabled",
        sourceUrl: macroCalendarConfig.forexFactoryCalendarUrl,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    );
  }

  try {
    const result = await fetchForexFactoryCalendarEvents();

    return NextResponse.json(
      {
        ok: true,
        events: result.events,
        fetchedAt: result.fetchedAt,
        provider: result.provider,
        sourceUrl: result.sourceUrl,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : "calendar_source_error";

    return NextResponse.json(
      {
        ok: false,
        events: [],
        provider: "Forex Factory",
        reason,
      },
      { status: 502 },
    );
  }
}
