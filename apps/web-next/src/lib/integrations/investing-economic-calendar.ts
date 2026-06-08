import type { EconomicCalendarEvent } from "@/lib/contracts/economic-calendar";

type InvestingReleaseSource = {
  currency: string;
  eventId: number;
  eventTitle: string;
};

type InvestingCalendarEvent = {
  currency?: unknown;
  event_id?: unknown;
  long_name?: unknown;
  source?: unknown;
  source_url?: unknown;
};

type InvestingCalendarOccurrence = {
  actual?: unknown;
  event_id?: unknown;
  forecast?: unknown;
  occurrence_time?: unknown;
  precision?: unknown;
  previous?: unknown;
  unit?: unknown;
};

type InvestingCalendarResponse = {
  events?: unknown;
  occurrences?: unknown;
};

type InvestingRelease = {
  actual: string;
  forecast: string | null;
  previous: string | null;
  releasedAt: string;
  sourceUrl: string;
};

const INVESTING_RELEASE_SOURCES: InvestingReleaseSource[] = [
  {
    currency: "USD",
    eventId: 8,
    eventTitle: "Average Hourly Earnings m/m",
  },
  {
    currency: "USD",
    eventId: 227,
    eventTitle: "Non-Farm Employment Change",
  },
  {
    currency: "USD",
    eventId: 300,
    eventTitle: "Unemployment Rate",
  },
  {
    currency: "EUR",
    eventId: 317,
    eventTitle: "Core CPI Flash Estimate y/y",
  },
  {
    currency: "EUR",
    eventId: 68,
    eventTitle: "CPI Flash Estimate y/y",
  },
];

function releaseSourceForEvent(event: EconomicCalendarEvent) {
  return INVESTING_RELEASE_SOURCES.find(
    (source) =>
      source.currency === event.currency &&
      source.eventTitle.toLowerCase() === event.title.toLowerCase(),
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function toText(value: unknown) {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();

  return text.length > 0 ? text : null;
}

function formatInvestingValue(
  value: unknown,
  unit: unknown,
  precision: unknown,
) {
  const numberValue = toFiniteNumber(value);
  const unitText = toText(unit) ?? "";
  const precisionValue = toFiniteNumber(precision);
  const decimals =
    precisionValue !== null ? Math.min(Math.max(precisionValue, 0), 4) : 1;

  if (numberValue === null) return toText(value);

  return `${numberValue.toLocaleString("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  })}${unitText}`;
}

function dayRangeForEvent(event: EconomicCalendarEvent) {
  const scheduledTime = Date.parse(event.scheduledAt);
  if (Number.isNaN(scheduledTime)) return null;

  const startDate = new Date(scheduledTime);
  startDate.setUTCHours(0, 0, 0, 0);

  const endDate = new Date(scheduledTime);
  endDate.setUTCHours(23, 59, 59, 999);

  return {
    endDate: endDate.toISOString(),
    key: startDate.toISOString().slice(0, 10),
    startDate: startDate.toISOString(),
  };
}

export function parseInvestingCalendarResponse(
  payload: InvestingCalendarResponse,
  sourceUrl: string,
) {
  const rawEvents = Array.isArray(payload.events) ? payload.events : [];
  const rawOccurrences = Array.isArray(payload.occurrences)
    ? payload.occurrences
    : [];
  const eventById = new Map<number, InvestingCalendarEvent>();
  const releases = new Map<number, InvestingRelease>();

  for (const rawEvent of rawEvents) {
    if (!isObject(rawEvent)) continue;

    const eventId = toFiniteNumber(rawEvent.event_id);
    if (eventId === null) continue;

    eventById.set(eventId, rawEvent);
  }

  for (const rawOccurrence of rawOccurrences) {
    if (!isObject(rawOccurrence)) continue;

    const occurrence = rawOccurrence as InvestingCalendarOccurrence;
    const eventId = toFiniteNumber(occurrence.event_id);
    const releasedAt = toText(occurrence.occurrence_time);
    const actual = formatInvestingValue(
      occurrence.actual,
      occurrence.unit,
      occurrence.precision,
    );

    if (eventId === null || !releasedAt || !actual) continue;

    const sourceEvent = eventById.get(eventId);
    const eventSourceUrl = isObject(sourceEvent)
      ? toText(sourceEvent.source_url)
      : null;

    releases.set(eventId, {
      actual,
      forecast: formatInvestingValue(
        occurrence.forecast,
        occurrence.unit,
        occurrence.precision,
      ),
      previous: formatInvestingValue(
        occurrence.previous,
        occurrence.unit,
        occurrence.precision,
      ),
      releasedAt: new Date(releasedAt).toISOString(),
      sourceUrl: eventSourceUrl ?? sourceUrl,
    });
  }

  return releases;
}

async function fetchInvestingReleasesForDay(startDate: string, endDate: string) {
  const params = new URLSearchParams({
    end_date: endDate,
    limit: "200",
    start_date: startDate,
  });
  const sourceUrl = `https://endpoints.investing.com/pd-instruments/v1/calendars/economic/events/occurrences?${params.toString()}`;
  const response = await fetch(sourceUrl, {
    headers: {
      accept: "application/json",
      referer: "https://www.investing.com/economic-calendar/",
      "user-agent": "KMFX Edge economic-calendar/1.0",
    },
    next: {
      revalidate: 30,
    },
  });

  if (!response.ok) return new Map<number, InvestingRelease>();

  return parseInvestingCalendarResponse(
    (await response.json()) as InvestingCalendarResponse,
    sourceUrl,
  );
}

function releaseMatchesEventDate(
  event: EconomicCalendarEvent,
  release: InvestingRelease,
) {
  const eventTime = Date.parse(event.scheduledAt);
  const releaseTime = Date.parse(release.releasedAt);

  if (Number.isNaN(eventTime) || Number.isNaN(releaseTime)) return false;

  return Math.abs(eventTime - releaseTime) <= 10 * 60_000;
}

export async function enrichEventsWithInvestingReleases(
  events: EconomicCalendarEvent[],
  fetchedAt: string,
) {
  const dayRanges = new Map<string, { startDate: string; endDate: string }>();

  for (const event of events) {
    if (event.actual) continue;
    if (!releaseSourceForEvent(event)) continue;

    const range = dayRangeForEvent(event);
    if (range) dayRanges.set(range.key, range);
  }

  if (dayRanges.size === 0) return events;

  const releasesByDay = new Map<string, Map<number, InvestingRelease>>();

  await Promise.all(
    Array.from(dayRanges.entries()).map(async ([key, range]) => {
      try {
        releasesByDay.set(
          key,
          await fetchInvestingReleasesForDay(range.startDate, range.endDate),
        );
      } catch {
        releasesByDay.set(key, new Map());
      }
    }),
  );

  return events.map((event) => {
    if (event.actual) return event;

    const source = releaseSourceForEvent(event);
    const range = dayRangeForEvent(event);
    const release =
      source && range ? releasesByDay.get(range.key)?.get(source.eventId) : null;

    if (!source || !release || !releaseMatchesEventDate(event, release)) {
      return event;
    }

    return {
      ...event,
      actual: release.actual,
      forecast: event.forecast ?? release.forecast,
      previous: event.previous ?? release.previous,
      source: {
        ...event.source,
        fetchedAt,
        provider: "Forex Factory + Investing",
        provenanceUrl: release.sourceUrl,
        status: "connected" as const,
      },
    };
  });
}
