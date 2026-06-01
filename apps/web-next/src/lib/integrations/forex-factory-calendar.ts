import { macroCalendarConfig } from "@/lib/config/macro-calendar";
import type {
  EconomicCalendarEvent,
  EconomicImpact,
} from "@/lib/contracts/economic-calendar";

type ForexFactoryImpact = "High" | "Medium" | "Low" | "Holiday";

type ForexFactoryEvent = {
  title?: unknown;
  country?: unknown;
  date?: unknown;
  impact?: unknown;
  forecast?: unknown;
  previous?: unknown;
  actual?: unknown;
};

const TIME_ZONE = "Europe/Madrid";

const CURRENCY_SYMBOL_HINTS: Record<string, string[]> = {
  AUD: ["AUDUSD"],
  CAD: ["USDCAD"],
  CHF: ["USDCHF"],
  EUR: ["EURUSD"],
  GBP: ["GBPUSD"],
  JPY: ["USDJPY", "JP225"],
  NZD: ["NZDUSD"],
  USD: ["EURUSD", "GBPUSD", "USDJPY", "USDCAD", "XAUUSD", "NAS100", "US30"],
};

const CURRENCY_COUNTRY_LABELS: Record<string, string> = {
  AUD: "Australia",
  CAD: "Canadá",
  CHF: "Suiza",
  CNY: "China",
  EUR: "Eurozona",
  GBP: "Reino Unido",
  JPY: "Japón",
  NZD: "Nueva Zelanda",
  USD: "Estados Unidos",
};

const timeFormatter = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

function isForexFactoryEvent(value: unknown): value is ForexFactoryEvent {
  return typeof value === "object" && value !== null;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeImpact(value: unknown): EconomicImpact | null {
  const impact = normalizeText(value) as ForexFactoryImpact;

  if (impact === "High") return "alto";
  if (impact === "Medium") return "medio";
  if (impact === "Low") return "bajo";

  return null;
}

function eventId(title: string, currency: string, scheduledAt: string) {
  return `ff-${currency}-${scheduledAt}-${title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function protectionWindowLabel(impact: EconomicImpact) {
  if (impact === "alto") return "30 min antes / 15 min después";
  if (impact === "medio") return "15 min antes / 10 min después";

  return "Solo seguimiento";
}

function suggestedAction(impact: EconomicImpact) {
  if (impact === "alto") return "Revisar antes de abrir o aumentar riesgo";
  if (impact === "medio") return "Vigilar si afecta a símbolos abiertos";

  return "Mantener en radar";
}

function nullableValue(value: unknown) {
  const text = normalizeText(value);

  return text.length > 0 ? text : null;
}

export function parseForexFactoryCalendarEvents(
  payload: unknown,
  fetchedAt: string,
): EconomicCalendarEvent[] {
  if (!Array.isArray(payload)) return [];

  return payload.flatMap((item): EconomicCalendarEvent[] => {
    if (!isForexFactoryEvent(item)) return [];

    const title = normalizeText(item.title);
    const currency = normalizeText(item.country).toUpperCase();
    const scheduledAt = normalizeText(item.date);
    const impact = normalizeImpact(item.impact);
    const scheduledTime = Date.parse(scheduledAt);

    if (!title || !currency || !impact || Number.isNaN(scheduledTime)) return [];

    return [
      {
        id: eventId(title, currency, scheduledAt),
        scheduledAt,
        timeLabel: timeFormatter.format(new Date(scheduledTime)),
        currency,
        country: CURRENCY_COUNTRY_LABELS[currency] ?? currency,
        title,
        impact,
        affectedSymbols: CURRENCY_SYMBOL_HINTS[currency] ?? [currency],
        protectionWindowLabel: protectionWindowLabel(impact),
        suggestedAction: suggestedAction(impact),
        source: {
          provider: "Forex Factory",
          status: "connected",
          provenanceUrl: macroCalendarConfig.forexFactoryCalendarUrl,
          fetchedAt,
        },
        actual: nullableValue(item.actual),
        forecast: nullableValue(item.forecast),
        previous: nullableValue(item.previous),
      },
    ];
  });
}

export async function fetchForexFactoryCalendarEvents() {
  const fetchedAt = new Date().toISOString();
  const response = await fetch(macroCalendarConfig.forexFactoryWeeklyJsonUrl, {
    headers: {
      accept: "application/json",
    },
    next: {
      revalidate: 60,
    },
  });

  if (!response.ok) {
    throw new Error(`forex_factory_${response.status}`);
  }

  const payload: unknown = await response.json();
  const events = parseForexFactoryCalendarEvents(payload, fetchedAt);

  return {
    events,
    fetchedAt,
    provider: "Forex Factory",
    sourceUrl: macroCalendarConfig.forexFactoryCalendarUrl,
  };
}
