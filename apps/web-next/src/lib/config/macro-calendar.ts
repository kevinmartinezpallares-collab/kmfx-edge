export const macroCalendarProviders = [
  "forexfactory",
  "tradingview",
  "investing",
  "tradays",
] as const;

export type MacroCalendarProvider = (typeof macroCalendarProviders)[number];

function parseEnabled(value: string | undefined) {
  if (!value) return true;
  return !["0", "false", "off", "no"].includes(value.toLowerCase());
}

function parseProvider(value: string | undefined): MacroCalendarProvider {
  if (
    value === "forexfactory" ||
    value === "tradingview" ||
    value === "investing" ||
    value === "tradays"
  ) {
    return value;
  }

  return "forexfactory";
}

export const macroCalendarConfig = {
  enabled: parseEnabled(process.env.NEXT_PUBLIC_MACRO_CALENDAR_ENABLED),
  provider: parseProvider(process.env.NEXT_PUBLIC_MACRO_CALENDAR_PROVIDER),
  forexFactoryCalendarUrl: "https://www.forexfactory.com/calendar",
  forexFactoryWeeklyJsonUrl:
    "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
  tradingViewScriptSrc:
    "https://s3.tradingview.com/external-embedding/embed-widget-events.js",
  tradingViewAttributionUrl:
    "https://www.tradingview.com/markets/currencies/economic-calendar/",
};
