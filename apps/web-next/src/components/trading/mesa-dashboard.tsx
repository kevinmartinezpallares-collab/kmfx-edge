"use client";

import * as React from "react";
import Link from "next/link";
import { Liveline, type LivelinePoint, type ThemeMode } from "liveline";
import { curveBasis } from "@visx/curve";
import { ChevronRight, X } from "lucide-react";
import {
  Bar as RechartsBar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  LabelList,
  XAxis as RechartsXAxis,
  YAxis as RechartsYAxis,
} from "recharts";
import { toast } from "sonner";

import { PieChart } from "@/components/charts/pie-chart";
import { PieSlice } from "@/components/charts/pie-slice";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip as ShadcnChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  BarYAxis,
  ChartTooltip,
  Grid,
  Line,
  LineChart,
  ProfitLossLegend,
  ProfitLossLegendHoverProvider,
  ProfitLossLine,
  profitLossColor,
  XAxis,
  resolveProfitLossTooltipLabel,
} from "@/components/ui/charts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TradingAccount } from "@/lib/contracts/account";
import type {
  EconomicCalendarEvent,
} from "@/lib/contracts/economic-calendar";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { macroCalendarConfig } from "@/lib/config/macro-calendar";
import {
  buildDashboardPerformance,
  buildDashboardSessionRows,
  buildDashboardSymbolRows,
  sessionLabel,
} from "@/lib/domain/dashboard-selectors";
import { buildStrategyRows } from "@/lib/domain/strategies-selectors";
import { countClosedTradeExecutions } from "@/lib/domain/trades-selectors";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/formatters/numbers";
import {
  signedTextClass,
} from "@/lib/domain/semantic-colors";
import {
  livelineWindowForData,
  prepareHistoricalLivelineCurve,
} from "@/lib/charts/liveline-points";
import {
  formatResponsiveLivelineCurrency,
  livelinePadding,
} from "@/lib/charts/liveline-layout";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const CHART_ACCENT_BY_THEME = {
  light: "#171717",
  dark: "#f5f5f5",
} satisfies Record<ThemeMode, string>;
const CHART_ACCENT_SOFT = "var(--chart-line-secondary)";
const PANEL_CARD_CLASS = "h-full border-border/70 bg-card/70 shadow-none";
const PANEL_MICRO_CHART_CARD_CLASS = "min-h-[332px] gap-2 py-3";
const PANEL_MICRO_CHART_CONTENT_CLASS = "flex flex-1 flex-col gap-1.5";
const PANEL_MICRO_CHART_SURFACE_CLASS = "min-h-[188px] flex-1";
const PANEL_LOWER_CHART_CONTENT_CLASS = "flex flex-1 flex-col gap-4";
const PANEL_DIAGNOSTIC_CARD_CLASS = "min-h-[360px] gap-2 py-3";
const PANEL_DIAGNOSTIC_CONTENT_CLASS = "flex flex-1 flex-col gap-3";
const LIVELINE_BADGE_WINDOW_BUFFER = 0.05;
const PANEL_EQUITY_WINDOWS = [
  { key: "7D", label: "7D", secs: 604_800 },
  { key: "30D", label: "30D", secs: 2_592_000 },
  { key: "90D", label: "90D", secs: 7_776_000 },
  { key: "YTD", label: "YTD", secs: null },
] as const;
const MINI_PROFIT_LOSS_CHART_MARGIN = { bottom: 34, left: 12, right: 14, top: 10 };
const PNL_DISTRIBUTION_SIDE_BUCKETS = 6;
const PNL_DISTRIBUTION_CHART_CONFIG = {
  result: {
    label: "Operaciones",
    color: "var(--foreground)",
  },
} satisfies ChartConfig;
const OUTLIER_DEPENDENCY_BANDS = [
  { label: "Baja", range: "0-10%", width: 10 },
  { label: "Controlada", range: "10-25%", width: 15 },
  { label: "Alta", range: "25-40%", width: 15 },
  { label: "Muy alta", range: "40%+", width: 60 },
] as const;
type PanelEquityWindowKey = (typeof PANEL_EQUITY_WINDOWS)[number]["key"];
const CALENDAR_REFRESH_MS = 30_000;
const RELEASE_ALERT_LOOKBACK_MS = 3 * 60 * 60_000;
const UPCOMING_RELEASE_ALERT_WINDOW_MS = 5 * 60_000;
const EVENT_DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Madrid",
  weekday: "short",
});
const LOWER_IS_BETTER_RELEASE_PATTERNS = [
  /unemployment|desempleo|paro|jobless|claims|subsidio/i,
  /inventories|stockpiles|inventarios/i,
];
type EquityChartPoint = {
  label: string;
  equity: number;
  balance: number;
  time: number;
};
type MetricDelta = {
  value: number;
  suffix?: string;
  label: string;
  tone?: "positive" | "negative" | "neutral";
};
type CalendarSourceState = {
  events: EconomicCalendarEvent[];
  fetchedAt?: string;
  provider?: string;
  reason?: string;
  sourceUrl?: string;
  status: "loading" | "ready" | "error";
};

type EconomicCalendarApiResponse = {
  events?: EconomicCalendarEvent[];
  fetchedAt?: string;
  ok?: boolean;
  provider?: string;
  reason?: string;
  sourceUrl?: string;
};

const disabledCalendarSource: CalendarSourceState = {
  events: [],
  provider: "Forex Factory",
  reason: "macro_calendar_disabled",
  sourceUrl: macroCalendarConfig.forexFactoryCalendarUrl,
  status: "ready",
};
const loadingCalendarSource: CalendarSourceState = {
  events: [],
  status: "loading",
};
const calendarSourceListeners = new Set<() => void>();
let calendarSourceSnapshot: CalendarSourceState = macroCalendarConfig.enabled
  ? loadingCalendarSource
  : disabledCalendarSource;
let calendarSourceController: AbortController | null = null;
let calendarSourceInterval: number | null = null;

function notifyCalendarSourceListeners() {
  for (const listener of calendarSourceListeners) listener();
}

function updateCalendarSourceSnapshot(snapshot: CalendarSourceState) {
  calendarSourceSnapshot = snapshot;
  notifyCalendarSourceListeners();
}

async function loadEconomicCalendarSource() {
  if (!macroCalendarConfig.enabled) return;

  calendarSourceController?.abort();
  const controller = new AbortController();
  calendarSourceController = controller;

  try {
    const response = await fetch("/api/kmfx/economic-calendar", {
      signal: controller.signal,
    });
    const payload = (await response.json()) as EconomicCalendarApiResponse;

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.reason ?? "calendar_source_error");
    }

    updateCalendarSourceSnapshot({
      events: Array.isArray(payload.events) ? payload.events : [],
      fetchedAt: payload.fetchedAt,
      provider: payload.provider ?? "Forex Factory",
      sourceUrl: payload.sourceUrl,
      status: "ready",
    });
  } catch (error) {
    if (controller.signal.aborted) return;

    updateCalendarSourceSnapshot({
      events: [],
      provider: "Forex Factory",
      reason: error instanceof Error ? error.message : "calendar_source_error",
      sourceUrl: macroCalendarConfig.forexFactoryCalendarUrl,
      status: "error",
    });
  }
}

function subscribeEconomicCalendarSource(onStoreChange: () => void) {
  calendarSourceListeners.add(onStoreChange);

  if (macroCalendarConfig.enabled && calendarSourceListeners.size === 1) {
    void loadEconomicCalendarSource();
    calendarSourceInterval = window.setInterval(() => {
      void loadEconomicCalendarSource();
    }, CALENDAR_REFRESH_MS);
  }

  return () => {
    calendarSourceListeners.delete(onStoreChange);

    if (calendarSourceListeners.size === 0) {
      if (calendarSourceInterval) window.clearInterval(calendarSourceInterval);
      calendarSourceInterval = null;
      calendarSourceController?.abort();
      calendarSourceController = null;
    }
  };
}

function getEconomicCalendarSourceSnapshot() {
  return calendarSourceSnapshot;
}

function getEconomicCalendarServerSnapshot() {
  return macroCalendarConfig.enabled ? loadingCalendarSource : disabledCalendarSource;
}

function subscribeThemeClass(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributeFilter: ["class"],
    attributes: true,
  });
  window.addEventListener("storage", onStoreChange);

  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onStoreChange);
  };
}

function getThemeClassSnapshot() {
  if (typeof document === "undefined") return false;
  return !document.documentElement.classList.contains("dark");
}

function usePanelChartTheme() {
  const isLight = React.useSyncExternalStore(
    subscribeThemeClass,
    getThemeClassSnapshot,
    () => false,
  );
  const donutNeutrals = isLight
    ? {
        win: "oklch(0.92 0 0)",
        loss: "oklch(0.5 0 0)",
        breakeven: "oklch(0.56 0 0)",
      }
    : {
        win: "oklch(0.92 0 0)",
        loss: "oklch(0.42 0 0)",
        breakeven: "oklch(0.52 0 0)",
      };

  return {
    theme: (isLight ? "light" : "dark") as ThemeMode,
    isLight,
    accent: CHART_ACCENT_BY_THEME[isLight ? "light" : "dark"],
    softAccent: CHART_ACCENT_SOFT,
    win: donutNeutrals.win,
    loss: donutNeutrals.loss,
    breakeven: donutNeutrals.breakeven,
  };
}

function useEconomicCalendarSource(): CalendarSourceState {
  return React.useSyncExternalStore(
    subscribeEconomicCalendarSource,
    getEconomicCalendarSourceSnapshot,
    getEconomicCalendarServerSnapshot,
  );
}

function calendarValueFingerprint(value: EconomicCalendarEvent["actual"]) {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();

  return text.length > 0 ? text : null;
}

function formatCalendarReleaseValue(value: EconomicCalendarEvent["actual"]) {
  return calendarValueFingerprint(value) ?? "Sin dato";
}

function normalizeCalendarNumberText(value: string) {
  const trimmed = value.trim().replace(/\s/g, "");
  const withoutSymbols = trimmed
    .replace(/[<>]/g, "")
    .replace(/[%$€£¥]/g, "")
    .replace(/[KMBT]$/i, "");

  if (withoutSymbols.includes(".") && withoutSymbols.includes(",")) {
    return withoutSymbols.replace(/,/g, "");
  }

  const commaIndex = withoutSymbols.lastIndexOf(",");

  if (
    commaIndex >= 0 &&
    !withoutSymbols.includes(".") &&
    withoutSymbols.length - commaIndex - 1 === 3
  ) {
    return withoutSymbols.replace(/,/g, "");
  }

  return withoutSymbols.replace(",", ".");
}

function parseCalendarReleaseNumber(value: EconomicCalendarEvent["actual"]) {
  const fingerprint = calendarValueFingerprint(value);
  if (!fingerprint) return null;

  const suffix = fingerprint.match(/[KMBT]$/i)?.[0]?.toUpperCase();
  const multiplier =
    suffix === "K"
      ? 1_000
      : suffix === "M"
        ? 1_000_000
        : suffix === "B"
          ? 1_000_000_000
          : suffix === "T"
            ? 1_000_000_000_000
            : 1;
  const numericText = normalizeCalendarNumberText(fingerprint).replace(/[^\d.-]/g, "");
  const parsed = Number(numericText);

  return Number.isFinite(parsed) ? parsed * multiplier : null;
}

function isLowerBetterRelease(event: EconomicCalendarEvent) {
  return LOWER_IS_BETTER_RELEASE_PATTERNS.some((pattern) =>
    pattern.test(event.title),
  );
}

function assessCalendarRelease(event: EconomicCalendarEvent) {
  const actual = parseCalendarReleaseNumber(event.actual);
  const forecast = parseCalendarReleaseNumber(event.forecast);

  if (actual === null || forecast === null) {
    return {
      detail: "No hay comparación numérica suficiente.",
      label: "Sin lectura automática",
      tone: "neutral" as const,
    };
  }

  if (actual === forecast) {
    return {
      detail: "Actual en línea con la previsión.",
      label: "En línea",
      tone: "neutral" as const,
    };
  }

  const lowerBetter = isLowerBetterRelease(event);
  const isPositive = lowerBetter ? actual < forecast : actual > forecast;

  return {
    detail: `${actual > forecast ? "Actual por encima" : "Actual por debajo"} de la previsión.`,
    label: isPositive ? "Positivo" : "Negativo",
    tone: isPositive ? ("positive" as const) : ("negative" as const),
  };
}

function shouldAlertCalendarRelease(event: EconomicCalendarEvent) {
  const scheduledTime = Date.parse(event.scheduledAt);
  const now = Date.now();
  const isTrustedSource =
    (event.source.provider === "Forex Factory" ||
      event.source.provider === "Forex Factory + Investing") &&
    event.source.status === "connected";

  if (Number.isNaN(scheduledTime)) return false;
  if (!isTrustedSource) return false;
  if (scheduledTime > now + 5 * 60_000) return false;

  return now - scheduledTime <= RELEASE_ALERT_LOOKBACK_MS;
}

function shouldAlertUpcomingCalendarEvent(event: EconomicCalendarEvent) {
  const scheduledTime = Date.parse(event.scheduledAt);
  const now = Date.now();
  const isTrustedSource =
    (event.source.provider === "Forex Factory" ||
      event.source.provider === "Forex Factory + Investing") &&
    event.source.status === "connected";

  if (event.impact !== "alto") return false;
  if (Number.isNaN(scheduledTime)) return false;
  if (!isTrustedSource) return false;
  if (scheduledTime < now) return false;

  return scheduledTime - now <= UPCOMING_RELEASE_ALERT_WINDOW_MS;
}

function minutesUntilCalendarEvent(event: EconomicCalendarEvent) {
  const scheduledTime = Date.parse(event.scheduledAt);

  if (Number.isNaN(scheduledTime)) return null;

  return Math.max(1, Math.ceil((scheduledTime - Date.now()) / 60_000));
}

function CalendarUpcomingToast({
  event,
}: {
  event: EconomicCalendarEvent;
}) {
  const minutesUntil = minutesUntilCalendarEvent(event);
  const exposedSymbols =
    event.affectedSymbols.length > 0
      ? event.affectedSymbols.slice(0, 4).join(" / ")
      : "Símbolos vinculados";
  const releaseValues = [
    { label: "Previsión", value: formatCalendarReleaseValue(event.forecast) },
    { label: "Anterior", value: formatCalendarReleaseValue(event.previous) },
    { label: "Ventana", value: event.protectionWindowLabel },
  ];

  return (
    <div className="w-[min(92vw,24rem)] rounded-xl border border-loss/30 bg-card p-4 text-card-foreground shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-loss">Noticia fuerte cercana</p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">{event.title}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {eventCountryLabel(event)} / {event.currency} / {formatEventDate(event)} / {event.timeLabel}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-loss/30 bg-loss/10 px-2 py-1 text-xs font-semibold text-loss">
          {minutesUntil ? `${minutesUntil} min` : "Ahora"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/60 pt-3">
        {releaseValues.map((item) => (
          <div key={item.label}>
            <p className="text-[11px] text-muted-foreground">{item.label}</p>
            <p className="mt-1 font-mono text-xs font-semibold text-foreground">{item.value}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Revisar exposición antes del dato. Afecta: {exposedSymbols}.
      </p>
    </div>
  );
}

function CalendarReleaseToast({
  event,
}: {
  event: EconomicCalendarEvent;
}) {
  const assessment = assessCalendarRelease(event);
  const toneClass =
    assessment.tone === "positive"
      ? "border-profit/30 bg-profit/10 text-profit"
      : assessment.tone === "negative"
        ? "border-loss/30 bg-loss/10 text-loss"
        : "border-border bg-muted text-muted-foreground";
  const releaseValues = [
    { label: "Actual", value: formatCalendarReleaseValue(event.actual) },
    { label: "Previsión", value: formatCalendarReleaseValue(event.forecast) },
    { label: "Anterior", value: formatCalendarReleaseValue(event.previous) },
  ];

  return (
    <div className="w-[min(92vw,24rem)] rounded-xl border border-border bg-card p-4 text-card-foreground shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Dato publicado</p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">{event.title}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {eventCountryLabel(event)} / {event.currency} / {formatEventDate(event)} / {event.timeLabel}
          </p>
        </div>
        <span className={cn("shrink-0 rounded-full border px-2 py-1 text-xs font-semibold", toneClass)}>
          {assessment.label}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/60 pt-3">
        {releaseValues.map((item) => (
          <div key={item.label}>
            <p className="text-[11px] text-muted-foreground">{item.label}</p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">{item.value}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{assessment.detail}</p>
    </div>
  );
}

function useCalendarReleaseAlerts(calendarSource: CalendarSourceState) {
  const initializedRef = React.useRef(false);
  const upcomingAlertedRef = React.useRef<Set<string> | null>(null);
  const releasedValuesRef = React.useRef<Map<string, string> | null>(null);

  React.useEffect(() => {
    if (calendarSource.status !== "ready") return;

    if (upcomingAlertedRef.current === null) upcomingAlertedRef.current = new Set<string>();
    if (releasedValuesRef.current === null) releasedValuesRef.current = new Map<string, string>();
    const upcomingAlerted = upcomingAlertedRef.current;
    const releasedValues = releasedValuesRef.current;

    for (const event of calendarSource.events) {
      if (
        shouldAlertUpcomingCalendarEvent(event) &&
        !upcomingAlerted.has(event.id)
      ) {
        upcomingAlerted.add(event.id);

        toast.custom((toastId) => (
          <div className="relative">
            <CalendarUpcomingToast event={event} />
            <button
              aria-label="Cerrar aviso de noticia"
              className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => toast.dismiss(toastId)}
              type="button"
            >
              <X className="size-4" />
            </button>
          </div>
        ), {
          duration: 20_000,
          id: `calendar-upcoming-${event.id}`,
        });
      }
    }

    if (!initializedRef.current) {
      releasedValues.clear();
      for (const event of calendarSource.events) {
        const actual = calendarValueFingerprint(event.actual);
        if (actual) releasedValues.set(event.id, actual);
      }
      initializedRef.current = true;
      return;
    }

    for (const event of calendarSource.events) {
      const actual = calendarValueFingerprint(event.actual);
      const previousActual = releasedValues.get(event.id);

      if (!actual) {
        releasedValues.delete(event.id);
        continue;
      }

      releasedValues.set(event.id, actual);

      if (
        actual !== previousActual &&
        shouldAlertCalendarRelease(event) &&
        event.impact !== "bajo"
      ) {
        toast.custom((toastId) => (
          <div className="relative">
            <CalendarReleaseToast event={event} />
            <button
              aria-label="Cerrar alerta de noticia"
              className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => toast.dismiss(toastId)}
              type="button"
            >
              <X className="size-4" />
            </button>
          </div>
        ), {
          duration: 15_000,
          id: `calendar-release-${event.id}-${actual}`,
        });
      }
    }
  }, [calendarSource.events, calendarSource.status]);
}

function makeInitialSeries(base: number, seed: number, count = 120) {
  const now = Math.floor(Date.now() / 1000);
  let value = base;

  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin((index + seed) / 7) * base * 0.0007;
    const pulse = Math.cos((index + seed) / 13) * base * 0.00045;
    value = Math.max(base * 0.2, value + wave + pulse);

    return {
      time: now - (count - index) * 2,
      value,
    };
  });
}

function useLivelineFeed(base: number, seed: number, volatility = 0.001) {
  const [data, setData] = React.useState<LivelinePoint[]>(() =>
    makeInitialSeries(base, seed),
  );

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      setData((current) => {
        const last = current.at(-1)?.value ?? base;
        const noise = (Math.random() - 0.48) * base * volatility;
        const wave = Math.sin(Date.now() / (3100 + seed * 120)) * base * volatility;
        const next = Math.max(base * 0.2, last + noise + wave);

        return [
          ...current.slice(-180),
          { time: Math.floor(Date.now() / 1000), value: next },
        ];
      });
    }, 950 + seed * 70);

    return () => window.clearInterval(interval);
  }, [base, seed, volatility]);

  return {
    data,
    value: data.at(-1)?.value ?? base,
  };
}

function formatCompactCurrency(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: value > 100 ? 0 : 4,
    minimumFractionDigits: value > 100 ? 0 : 4,
  });
}

function formatMetricValue({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const safeValue = Number.isFinite(value) ? value : 0;

  return `${prefix}${safeValue.toLocaleString("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${suffix}`;
}

function easeOutCubic(progress: number) {
  return 1 - Math.pow(1 - progress, 3);
}

function useAnimatedMetricNumber(value: number, durationMs = 850, enabled = false) {
  const target = Number.isFinite(value) ? value : 0;
  const [displayValue, setDisplayValue] = React.useState(target);
  const latestValueRef = React.useRef(target);

  React.useEffect(() => {
    if (!enabled) {
      latestValueRef.current = target;
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion || durationMs <= 0) {
      latestValueRef.current = target;
      const frame = window.requestAnimationFrame(() => {
        setDisplayValue((current) => (Object.is(current, target) ? current : target));
      });

      return () => window.cancelAnimationFrame(frame);
    }

    const startValue = latestValueRef.current;
    const delta = target - startValue;
    const startedAt = performance.now();
    let frame = 0;

    function tick(now: number) {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const nextValue = startValue + delta * easeOutCubic(progress);

      setDisplayValue(nextValue);

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
        return;
      }

      latestValueRef.current = target;
      setDisplayValue(target);
    }

    frame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frame);
  }, [durationMs, enabled, target]);

  return displayValue;
}

export function MetricCard({
  title,
  value,
  prefix,
  suffix,
  decimals = 0,
  caption,
  tone = "neutral",
  delta,
  animateValue = false,
}: {
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  caption: string;
  tone?: "neutral" | "positive" | "negative";
  delta?: MetricDelta;
  animateValue?: boolean;
}) {
  const deltaTone =
    delta?.tone ?? (delta && delta.value > 0 ? "positive" : delta && delta.value < 0 ? "negative" : "neutral");
  const deltaArrow = delta && delta.value > 0 ? "↑" : delta && delta.value < 0 ? "↓" : "→";
  const deltaToneClass =
    deltaTone === "positive"
      ? "text-profit"
      : deltaTone === "negative"
        ? "text-loss"
        : "text-muted-foreground";
  const deltaDotClass =
    deltaTone === "positive"
      ? "bg-profit text-background"
      : deltaTone === "negative"
        ? "bg-loss text-background"
        : "bg-muted text-muted-foreground";
  const animatedValue = useAnimatedMetricNumber(value, 850, animateValue);
  const displayValue = animateValue ? animatedValue : value;

  return (
    <Card className="overflow-hidden border-border/70 bg-card/70 shadow-none">
      <CardContent className="grid min-h-[128px] content-center p-5">
        <div className="grid min-w-0 gap-3">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <div className="grid gap-2">
            <p
              className={cn(
                "whitespace-nowrap text-2xl font-bold tabular-nums text-foreground",
                tone === "positive" && "text-profit",
                tone === "negative" && "text-loss",
              )}
            >
              {formatMetricValue({ value: displayValue, prefix, suffix, decimals })}
            </p>
            {delta ? (
              <div className="flex min-w-0 items-center gap-1.5 text-xs leading-none">
                <span className={cn("grid size-4 shrink-0 place-items-center rounded-full text-[11px] font-semibold", deltaDotClass)}>
                  {deltaArrow}
                </span>
                <span className={cn("whitespace-nowrap font-mono font-semibold", deltaToneClass)}>
                  {Math.abs(delta.value).toLocaleString("es-ES", { maximumFractionDigits: 2 })}
                  {" "}
                  {delta.suffix ?? "%"}
                </span>
                <span className="truncate text-muted-foreground">{delta.label}</span>
              </div>
            ) : null}
            <p className="max-w-[18rem] text-xs leading-snug text-muted-foreground">
              {caption}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function LiveMarketChart({
  symbol,
  base,
  compact = false,
  volatility = 0.001,
  showValue = false,
}: {
  symbol: string;
  base: number;
  compact?: boolean;
  volatility?: number;
  showValue?: boolean;
}) {
  const [windowSecs, setWindowSecs] = React.useState(compact ? 45 : 180);
  const feed = useLivelineFeed(base, symbol.length + Math.floor(base) % 9, volatility);
  const chartTheme = usePanelChartTheme();

  return (
    <div data-kmfx-liveline className={cn("w-full", compact ? "h-24" : "h-[360px]")}>
      <Liveline
        data={feed.data}
        value={feed.value}
        theme={chartTheme.theme}
        color={compact ? chartTheme.softAccent : chartTheme.accent}
        window={windowSecs}
        windows={
          compact
            ? undefined
            : [
                { label: "1m", secs: 60 },
                { label: "3m", secs: 180 },
                { label: "5m", secs: 300 },
                { label: "15m", secs: 900 },
              ]
        }
        onWindowChange={setWindowSecs}
        windowStyle="rounded"
        grid={!compact}
        badge={!compact}
        badgeVariant="minimal"
        fill
        pulse={!compact}
        scrub={!compact}
        showValue={showValue}
        valueMomentumColor={false}
        referenceLine={compact ? undefined : { value: base, label: "VWAP" }}
        formatValue={(current) => `${symbol} ${formatCompactCurrency(current)}`}
        lineWidth={compact ? 1.5 : 2}
      />
    </div>
  );
}

function buildEquityChartData(
  workspace: WorkspaceState,
  activeAccount: TradingAccount | undefined,
): EquityChartPoint[] {
  const balance = activeAccount?.balance ?? activeAccount?.equity ?? 0;
  const source = workspace.dashboard.equitySeries;
  const now = Math.floor(Date.now() / 1000);

  if (source.length >= 2) {
    const dated = source.map((point) => {
      const parsed = point.timestamp ? Date.parse(point.timestamp) : NaN;
      return {
        ...point,
        time: Number.isNaN(parsed) ? null : Math.floor(parsed / 1000),
      };
    });
    const hasDatedHistory = dated.every((point) => point.time !== null);

    if (hasDatedHistory) {
      const latestSourceTime = dated.at(-1)?.time ?? now;
      return dated
        .slice()
        .toSorted((left, right) => (left.time ?? now) - (right.time ?? now))
        .map((point) => ({
          label: point.label || shortPanelTimeLabel(point.time ?? now),
          equity: point.value,
          balance,
          time: now - (latestSourceTime - (point.time ?? latestSourceTime)),
        }));
    }

    const targetCount =
      workspace.meta.sourceMode === "live" ? source.length : Math.max(7, source.length);
    const missing = Math.max(0, targetCount - source.length);
    const firstDelta = source[1].value - source[0].value;
    const padded = [
      ...Array.from({ length: missing }, (_, index) => ({
        label: "",
        value: Math.max(
          balance * 0.85,
          source[0].value - firstDelta * 0.65 * (missing - index),
        ),
      })),
      ...source,
    ];

    return padded.map((point, index) => ({
      label: point.label || shortPanelTimeLabel(now - (padded.length - 1 - index) * 86_400),
      equity: point.value,
      balance,
      time: now - (padded.length - 1 - index) * 86_400,
    }));
  }

  const daily = workspace.analytics.daily;
  if (daily.length >= 2) {
    let running = activeAccount?.equity ?? balance;
    const reversed = daily
      .slice()
      .reverse()
      .map((bucket, index) => {
        const point = {
          label: bucket.label,
          equity: running,
          balance,
          time: now - (daily.length - 1 - index) * 86_400,
        };
        running -= bucket.pnl;
        return point;
      });

    return reversed.reverse();
  }

  return [
    { label: "Inicio", equity: balance, balance, time: now - 86_400 },
    { label: "Actual", equity: activeAccount?.equity ?? balance, balance, time: now },
  ];
}

const SHORT_PANEL_TIME_LABEL_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
});

function shortPanelTimeLabel(time: number) {
  return SHORT_PANEL_TIME_LABEL_FORMATTER.format(new Date(time * 1000));
}

function PanelChartWindowControls({
  availableWindowSecs,
  value,
  onChange,
}: {
  availableWindowSecs: number;
  value: PanelEquityWindowKey;
  onChange: (value: PanelEquityWindowKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {PANEL_EQUITY_WINDOWS.map((option) => {
          const isActive = option.key === value;
          const isAvailable =
            option.secs === null ||
            option.key === "7D" ||
            option.secs <= availableWindowSecs;

          return (
            <button
              aria-disabled={!isAvailable}
              aria-pressed={isActive}
              className={cn(
                "h-11 min-w-11 rounded-md border px-3 text-xs font-medium transition-colors sm:h-8 sm:min-w-0",
                "border-border bg-background text-foreground hover:bg-muted/70",
                isActive && "bg-muted text-foreground shadow-sm",
                !isAvailable &&
                  "cursor-not-allowed opacity-40 hover:bg-background",
              )}
              key={option.label}
              onClick={() => {
                if (isAvailable) onChange(option.key);
              }}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {availableWindowSecs < PANEL_EQUITY_WINDOWS[1].secs ? (
        <span className="text-xs text-muted-foreground">
          Histórico disponible limitado al primer sync.
        </span>
      ) : null}
    </div>
  );
}

function buildDrawdownRows(points: EquityChartPoint[]) {
  let peak = 0;

  return points.map((point) => {
    peak = Math.max(peak, point.equity);
    const drawdownPct = peak > 0 ? Math.max(0, ((peak - point.equity) / peak) * 100) : 0;

    return {
      drawdownPct,
      displayLabel: point.label,
      label: point.label,
      time: point.time,
    };
  });
}

function buildSmoothedDrawdownLivelineRows(
  rows: ReturnType<typeof buildDrawdownRows>,
) {
  if (rows.length < 5) {
    return rows.map((row) => ({
      time: row.time,
      value: -row.drawdownPct,
    }));
  }

  return rows.map((row, index) => {
    const previous = rows[index - 1];
    const next = rows[index + 1];

    if (!previous || !next || index === rows.length - 1) {
      return {
        time: row.time,
        value: -row.drawdownPct,
      };
    }

    const neighborAverage = (previous.drawdownPct + next.drawdownPct) / 2;
    const isMeaningfulRiskSpike =
      row.drawdownPct >= previous.drawdownPct &&
      row.drawdownPct >= next.drawdownPct &&
      row.drawdownPct - neighborAverage >= 1.25;

    if (isMeaningfulRiskSpike) {
      return {
        time: row.time,
        value: -row.drawdownPct,
      };
    }

    const smoothedDrawdown =
      previous.drawdownPct * 0.22 +
      row.drawdownPct * 0.56 +
      next.drawdownPct * 0.22;

    return {
      time: row.time,
      value: -smoothedDrawdown,
    };
  });
}

function buildLiveAwareEquityChartData(
  workspace: WorkspaceState,
  activeAccount: TradingAccount | undefined,
) {
  const rows = buildEquityChartData(workspace, activeAccount);
  const liveEquity = activeAccount?.equity;

  if (!Number.isFinite(liveEquity) || rows.length < 1) return rows;

  const latest = rows.at(-1);
  if (!latest) return rows;

  const now = Math.floor(Date.now() / 1000);
  const shouldReflectLiveEquity =
    workspace.meta.sourceMode === "live" || (activeAccount?.openPositionsCount ?? 0) > 0;

  if (!shouldReflectLiveEquity) return rows;

  return [
    ...rows.slice(0, -1),
    {
      ...latest,
      equity: liveEquity ?? latest.equity,
      label: "Actual",
      time: Math.max(latest.time, now),
    },
  ];
}

function interpolatePanelLivelineValue(points: LivelinePoint[], time: number) {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return 0;
  if (time <= first.time) return first.value;
  if (time >= last.time) return last.value;

  let low = 0;
  let high = points.length - 1;

  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);

    if ((points[middle]?.time ?? 0) <= time) {
      low = middle;
    } else {
      high = middle;
    }
  }

  const left = points[low];
  const right = points[high];
  if (!left || !right || right.time <= left.time) return last.value;

  const ratio = (time - left.time) / (right.time - left.time);

  return left.value + (right.value - left.value) * ratio;
}

function fitLivelineToRequestedWindow(
  points: LivelinePoint[],
  windowSecs: number,
  now: number,
): LivelinePoint[] {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || points.length < 2 || windowSecs <= 0) return points;

  const windowStart = now - windowSecs;
  if (windowStart <= first.time) return points;

  const visible = points.filter((point) => point.time > windowStart);
  const edgePoint = {
    time: windowStart,
    value: interpolatePanelLivelineValue(points, windowStart),
  };

  return [edgePoint, ...visible];
}

function resamplePanelLivelinePoints(
  points: LivelinePoint[],
  targetCount: number,
): LivelinePoint[] {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || points.length < 2 || last.time <= first.time) return points;
  if (points.length >= targetCount) return points;

  const step = (last.time - first.time) / (targetCount - 1);

  return Array.from({ length: targetCount }, (_, index) => {
    if (index === 0) return first;
    if (index === targetCount - 1) return last;

    const time = Math.round(first.time + step * index);

    return {
      time,
      value: interpolatePanelLivelineValue(points, time),
    };
  });
}

function EquityCurveCard({
  workspace,
  activeAccount,
}: {
  workspace: WorkspaceState;
  activeAccount: TradingAccount | undefined;
}) {
  const [windowKey, setWindowKey] = React.useState<PanelEquityWindowKey>("7D");
  const chartTheme = usePanelChartTheme();
  const isMobile = useIsMobile();
  const chartData = buildEquityChartData(workspace, activeAccount);
  const livelineNow = chartData.at(-1)?.time ?? 0;
  const latestValue = chartData.at(-1)?.equity ?? activeAccount?.equity ?? 0;
  const balance = activeAccount?.balance ?? latestValue;
  const hasHistory = chartData.length >= 2;
  const dataSpanSecs =
    chartData.length >= 2
      ? Math.max(0, (chartData.at(-1)?.time ?? 0) - (chartData[0]?.time ?? 0))
      : 0;
  const availableWindowSecs =
    dataSpanSecs >= (PANEL_EQUITY_WINDOWS[1].secs ?? 0)
      ? PANEL_EQUITY_WINDOWS[2].secs ?? dataSpanSecs
      : dataSpanSecs >= (PANEL_EQUITY_WINDOWS[0].secs ?? 0)
        ? PANEL_EQUITY_WINDOWS[1].secs ?? dataSpanSecs
        : PANEL_EQUITY_WINDOWS[0].secs ?? dataSpanSecs;
  const requestedWindow = PANEL_EQUITY_WINDOWS.find(
    (option) => option.key === windowKey,
  );
  const selectedWindowKey =
    requestedWindow?.secs !== null &&
    requestedWindow?.secs !== undefined &&
    requestedWindow.secs > availableWindowSecs
      ? "7D"
      : windowKey;
  const selectedWindowSecs =
    selectedWindowKey === "YTD"
      ? Math.max(dataSpanSecs, 86_400)
      : PANEL_EQUITY_WINDOWS.find((option) => option.key === selectedWindowKey)
          ?.secs ?? PANEL_EQUITY_WINDOWS[0].secs;
  const historicalLivelineData = prepareHistoricalLivelineCurve(
    chartData.map((point) => ({
      time: point.time,
      value: point.equity,
    })),
    {
      maxPoints: 64,
      minPoints: 28,
      minStepSecs: 300,
    },
  );
  const isSevenDayWindow = selectedWindowKey === "7D";
  const sevenDayVisibleSecs =
    selectedWindowSecs * (1 - LIVELINE_BADGE_WINDOW_BUFFER);
  const sevenDayLivelineData = fitLivelineToRequestedWindow(
    historicalLivelineData,
    sevenDayVisibleSecs,
    livelineNow,
  );
  const livelineData = isSevenDayWindow
    ? resamplePanelLivelinePoints(sevenDayLivelineData, 96)
    : historicalLivelineData;
  const effectiveWindowSecs = selectedWindowSecs;
  const labelByTime = new Map(chartData.map((point) => [point.time, point.label]));

  return (
    <Card className={cn("overflow-hidden", PANEL_CARD_CLASS)}>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Curva de equity y balance</CardTitle>
            <CardDescription>
              Evolución de la cuenta activa frente al balance de referencia.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-5 sm:px-6">
        {hasHistory ? (
          <div className="grid gap-3">
            <PanelChartWindowControls
              availableWindowSecs={availableWindowSecs}
              value={selectedWindowKey}
              onChange={setWindowKey}
            />
            <div
              data-kmfx-liveline
              className="h-[300px] w-full sm:h-[320px] xl:h-[340px]"
              style={chartTheme.isLight ? { filter: "contrast(1.18)" } : undefined}
            >
              <Liveline
                data={livelineData}
                value={latestValue}
                theme={chartTheme.theme}
                color={chartTheme.accent}
                window={effectiveWindowSecs}
                grid
                badge
                badgeVariant="minimal"
                badgeTail={!isMobile}
                fill
                pulse
                scrub
                momentum={false}
                referenceLine={{ value: balance, label: "Balance" }}
                formatValue={(value) =>
                  formatResponsiveLivelineCurrency(
                    Number(value),
                    activeAccount?.baseCurrency ?? "USD",
                    isMobile,
                  )
                }
                formatTime={(time) => labelByTime.get(time) ?? shortPanelTimeLabel(time)}
                padding={livelinePadding(isMobile, {
                  top: 18,
                  right: 132,
                  bottom: 34,
                  left: 24,
                })}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-background/35 text-center xl:h-[340px]">
            <p className="text-sm font-medium text-foreground">Historial insuficiente</p>
            <p className="mt-2 max-w-sm text-xs text-muted-foreground">
              Conecta historial de equity o espera cierres reales para activar la curva.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DrawdownRecentCard({
  activeAccount,
  workspace,
  className,
}: {
  activeAccount: TradingAccount | undefined;
  workspace: WorkspaceState;
  className?: string;
}) {
  const chartTheme = usePanelChartTheme();
  const isMobile = useIsMobile();
  const chartData = buildLiveAwareEquityChartData(workspace, activeAccount);
  const rows = buildDrawdownRows(chartData).slice(-77);
  const maxDrawdown = rows.reduce((max, row) => Math.max(max, row.drawdownPct), 0);
  const currentDrawdown = rows.at(-1)?.drawdownPct ?? 0;
  const labelByTime = new Map(rows.map((row) => [row.time, row.displayLabel || shortPanelTimeLabel(row.time)]));
  const drawdownLineColor = chartTheme.isLight ? "#404040" : chartTheme.accent;
  const livelineRows = prepareHistoricalLivelineCurve(
    buildSmoothedDrawdownLivelineRows(rows),
    {
      maxPoints: 42,
      minPoints: 20,
      minStepSecs: 900,
    },
  );
  const dataSpanSecs =
    livelineRows.length >= 2
      ? Math.max(86_400, (livelineRows.at(-1)?.time ?? 0) - (livelineRows[0]?.time ?? 0))
      : 604_800;
  const effectiveWindowSecs = livelineWindowForData(livelineRows, dataSpanSecs, {
    minSecs: Math.min(dataSpanSecs, 86_400),
    padRatio: 0.04,
    maxPadSecs: 43_200,
  });

  return (
    <Card className={cn(PANEL_CARD_CLASS, PANEL_MICRO_CHART_CARD_CLASS, className)}>
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle>Drawdown reciente</CardTitle>
            <CardDescription>Curva acumulada del retroceso de equity.</CardDescription>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-sm font-semibold text-foreground">
              Máx. {formatPercent(maxDrawdown, 2)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeAccount?.openPositionsCount ? "Incluye equity live" : "Curva acumulada"}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className={PANEL_MICRO_CHART_CONTENT_CLASS}>
        <p className="font-mono text-2xl font-semibold text-foreground">
          {formatPercent(currentDrawdown, 2)}
        </p>
        {rows.length > 1 ? (
          <div
            data-kmfx-liveline
            className={cn(PANEL_MICRO_CHART_SURFACE_CLASS, "w-full")}
            style={chartTheme.isLight ? { filter: "contrast(1.04)" } : undefined}
          >
            <Liveline
              badge
              badgeTail={!isMobile}
              badgeVariant="minimal"
              color={drawdownLineColor}
              data={livelineRows}
              fill
              formatTime={(time) => labelByTime.get(time) ?? shortPanelTimeLabel(time)}
              formatValue={(value) => formatPercent(Math.abs(Number(value)), 2)}
              grid
              lerpSpeed={0.06}
              lineWidth={1.2}
              momentum={false}
              padding={livelinePadding(isMobile, {
                bottom: 32,
                left: 16,
                right: 60,
                top: 12,
              })}
              pulse
              scrub
              theme={chartTheme.theme}
              value={-currentDrawdown}
              window={effectiveWindowSecs}
            />
          </div>
        ) : (
          <EmptyChartState label="Sin historial suficiente para drawdown." />
        )}
      </CardContent>
    </Card>
  );
}

function formatEventDate(event: EconomicCalendarEvent) {
  const scheduledTime = Date.parse(event.scheduledAt);

  if (Number.isNaN(scheduledTime)) return "Fecha pendiente";

  return EVENT_DATE_FORMATTER.format(new Date(scheduledTime)).replace(",", "");
}

function eventCountryLabel(event: EconomicCalendarEvent) {
  return event.country ?? event.currency;
}

export function RecentTradesCard({
  workspace,
  className,
}: {
  workspace: WorkspaceState;
  className?: string;
}) {
  const trades = workspace.trades.slice(0, 5);

  return (
    <Card className={cn(PANEL_CARD_CLASS, className)}>
      <CardHeader>
        <CardTitle>Operaciones recientes</CardTitle>
        <CardDescription>Operaciones que explican el último movimiento de la cuenta.</CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operación</TableHead>
                <TableHead className="hidden md:table-cell">Setup</TableHead>
                <TableHead className="hidden lg:table-cell">Sesión</TableHead>
                <TableHead className="hidden lg:table-cell">Parciales</TableHead>
                <TableHead className="text-right">PnL neto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.map((trade) => (
                <TableRow key={trade.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{trade.symbol}</span>
                      <span className="text-xs text-muted-foreground">
                        {trade.side.toUpperCase()} / {trade.tradingDayKey}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {trade.setup ?? "Sin etiqueta"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">{trade.session}</TableCell>
                  <TableCell className="hidden lg:table-cell">{trade.executions.length}</TableCell>
                  <TableCell className={cn("text-right font-mono font-semibold", signedTextClass(trade.netPnl))}>
                    {formatSignedCurrency(trade.netPnl)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Button
          render={<Link href="/trades" />}
          nativeButton={false}
          variant="ghost"
          className="mt-3 w-full justify-between"
        >
          Ver operaciones
          <ChevronRight data-icon="inline-end" />
        </Button>
      </CardContent>
    </Card>
  );
}

function WinLossDonut({
  winRatePct,
  winCount,
  lossCount,
  breakevenCount,
}: {
  winRatePct: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
}) {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
  const chartTheme = usePanelChartTheme();
  const totalResolvedTrades = winCount + lossCount + breakevenCount;
  const visualBreakevenCount =
    breakevenCount > 0 ? breakevenCount : Math.max(0.45, totalResolvedTrades * 0.08);
  const data = [
    {
      label: "Ganadoras",
      value: winCount,
      actualValue: winCount,
      color: chartTheme.win,
      fill: chartTheme.win,
    },
    {
      label: "Perdedoras",
      value: lossCount,
      actualValue: lossCount,
      color: chartTheme.loss,
      fill: chartTheme.loss,
    },
    {
      label: "Break-even",
      value: visualBreakevenCount,
      actualValue: breakevenCount,
      color: chartTheme.breakeven,
      fill: chartTheme.breakeven,
    },
  ];
  const hoveredSegment = hoveredIndex === null ? null : data[hoveredIndex];
  const centerValue = hoveredSegment
    ? String(hoveredSegment.actualValue)
    : formatPercent(winRatePct, 0);
  const centerLabel = hoveredSegment ? hoveredSegment.label : "acierto";

  return (
    <div className="grid justify-items-center gap-3">
      <div className="relative size-[158px]">
        <PieChart
          data={data}
          size={158}
          innerRadius={48}
          hoveredIndex={hoveredIndex}
          onHoverChange={setHoveredIndex}
          padAngle={0.16}
          cornerRadius={10}
          hoverOffset={6}
        >
          <PieSlice index={0} showGlow={false} hoverEffect="grow" />
          <PieSlice index={1} showGlow={false} hoverEffect="grow" />
          <PieSlice index={2} showGlow={false} hoverEffect="grow" />
        </PieChart>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div className="max-w-[76px]">
            <p className="font-mono text-2xl font-semibold leading-none text-foreground">
              {centerValue}
            </p>
            <p className="mt-2 truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {centerLabel}
            </p>
          </div>
        </div>
      </div>
      <div className="grid w-full grid-cols-3 gap-2 text-center text-[11px]">
        {data.map((item) => (
          <div key={item.label} className="min-w-0">
            <div className="mx-auto mb-1 size-1.5 rounded-full" style={{ backgroundColor: item.color }} />
            <p className="truncate text-muted-foreground">{item.label}</p>
            <p className="font-mono font-semibold text-foreground">{item.actualValue}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PanelInsightsCompact({
  workspace,
  className,
}: {
  workspace: WorkspaceState;
  className?: string;
}) {
  const performance = buildDashboardPerformance(workspace, { preferActiveTrades: true });
  const symbolRows = buildDashboardSymbolRows(workspace.trades);
  const sessionRows = buildDashboardSessionRows(workspace.trades);
  const topSymbol = [...symbolRows].toSorted((a, b) => b.pnl - a.pnl)[0];
  const topSession = [...sessionRows].toSorted((a, b) => b.pnl - a.pnl)[0];
  const reviewSession = [...sessionRows].toSorted((a, b) => a.pnl - b.pnl)[0];
  const tradeOutcome = workspace.trades.reduce(
    (counts, trade) => {
      const netPnls = trade.executions.length
        ? trade.executions.map((execution) => execution.netPnl)
        : [trade.netPnl];
      netPnls.forEach((netPnl) => {
        if (netPnl > 0) counts.winCount += 1;
        if (netPnl < 0) counts.lossCount += 1;
        if (netPnl === 0) counts.breakevenCount += 1;
      });
      return counts;
    },
    { winCount: 0, lossCount: 0, breakevenCount: 0 },
  );
  const hasTradeOutcome = countClosedTradeExecutions(workspace.trades) > 0;
  const donutWinCount = hasTradeOutcome ? tradeOutcome.winCount : performance.winCount;
  const donutLossCount = hasTradeOutcome ? tradeOutcome.lossCount : performance.lossCount;
  const donutBreakevenCount = hasTradeOutcome
    ? tradeOutcome.breakevenCount
    : Math.max(0, performance.totalTrades - performance.winCount - performance.lossCount);
  const donutTotal = donutWinCount + donutLossCount + donutBreakevenCount;
  const donutWinRatePct =
    donutTotal > 0 ? (donutWinCount / donutTotal) * 100 : performance.winRatePct;

  return (
    <Card className={cn(PANEL_CARD_CLASS, className)}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Win / loss</CardTitle>
            <CardDescription>Distribución de operaciones ganadoras, perdedoras y break-even.</CardDescription>
          </div>
          <Button
            render={<Link href="/analytics" />}
            nativeButton={false}
            variant="ghost"
            size="sm"
            className="h-11 px-3 sm:h-8 sm:px-2"
          >
            Ver detalle
            <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid flex-1 content-start gap-5">
        <WinLossDonut
          winRatePct={donutWinRatePct}
          winCount={donutWinCount}
          lossCount={donutLossCount}
          breakevenCount={donutBreakevenCount}
        />

        <div className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-border/60 pt-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Mejor símbolo</p>
            <p className="mt-1 truncate font-medium text-foreground">
              {topSymbol?.symbol ?? "Sin datos"}
            </p>
            <p className={cn("mt-1 font-mono text-sm font-semibold", signedTextClass(topSymbol?.pnl ?? 0))}>
              {topSymbol ? formatSignedCurrency(topSymbol.pnl) : "-"}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Mejor sesión</p>
            <p className="mt-1 truncate font-medium text-foreground">
              {topSession ? sessionLabel(topSession.session) : "Sin sesión"}
            </p>
            <p className={cn("mt-1 font-mono text-sm font-semibold", signedTextClass(topSession?.pnl ?? 0))}>
              {topSession ? formatSignedCurrency(topSession.pnl) : "-"}
            </p>
          </div>
          <div className="col-span-2 border-t border-border/60 pt-4">
            <p className="text-xs text-muted-foreground">Menor sesión</p>
            <p className="mt-1 font-medium text-foreground">
              {reviewSession ? sessionLabel(reviewSession.session) : "Sin sesión"}
            </p>
            <p className={cn("mt-1 font-mono text-sm font-semibold", signedTextClass(reviewSession?.pnl ?? 0))}>
              {reviewSession ? formatSignedCurrency(reviewSession.pnl) : "-"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyChartState({ label }: { label: string }) {
  return (
    <div className="grid min-h-48 place-items-center rounded-lg border border-dashed border-border/70 bg-background/35 px-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

function MiniProfitLossLineChart({
  currency,
  rows,
}: {
  currency: string;
  rows: Array<{ date: Date; label: string; pnl: number; trades: number }>;
}) {
  const [legendHoveredIndex, setLegendHoveredIndex] = React.useState<number | null>(null);
  const showProfitLossLegend = false;

  return (
    <div className={cn(PANEL_MICRO_CHART_SURFACE_CLASS, "flex flex-col gap-2")}>
      <LineChart
        animationDuration={1100}
        animationEasing="cubic-bezier(0.85, 0, 0.15, 1)"
        className="h-full"
        data={rows}
        margin={MINI_PROFIT_LOSS_CHART_MARGIN}
      >
        <Grid
          highlightRowStroke="var(--chart-grid)"
          highlightRowStrokeDasharray="4,4"
          highlightRowStrokeWidth={1}
          highlightRowValues={[0]}
          horizontal
          numTicksRows={5}
        />
        <Line
          curve={curveBasis}
          dataKey="pnl"
          fadeEdges
          showHighlight={false}
          stroke="transparent"
          strokeWidth={0}
        />
        <ProfitLossLegendHoverProvider hoveredIndex={legendHoveredIndex}>
          <ProfitLossLine
            curve={curveBasis}
            dataKey="pnl"
            fadeEdges
            strokeWidth={2.15}
          />
        </ProfitLossLegendHoverProvider>
        <XAxis numTicks={4} />
        <ChartTooltip
          indicatorColor={(point) =>
            profitLossColor((point.pnl as number) ?? 0)}
          rows={(point) => {
            const value = Number(point.pnl) || 0;
            return [
              {
                color: profitLossColor(value),
                label: resolveProfitLossTooltipLabel("Profit/Loss"),
                value: formatSignedCurrency(value, currency),
              },
              {
                color: "var(--chart-label)",
                label: "Operaciones",
                value: Number(point.trades) || 0,
              },
            ];
          }}
          showCrosshair
          showDatePill
          showDots
        />
      </LineChart>
      {showProfitLossLegend ? (
        <ProfitLossLegend
          align="center"
          hoveredIndex={legendHoveredIndex}
          onHoverChange={setLegendHoveredIndex}
        />
      ) : null}
    </div>
  );
}

function buildExpectancyChartRows(
  rows: Array<{ date: Date; label: string; pnl: number; trades: number }>,
) {
  const operatedRows = rows.filter((row) => row.trades > 0);
  const sourceRows = operatedRows.length > 0 ? operatedRows : rows;
  const maxPoints = 10;
  const bucketSize = Math.max(1, Math.ceil(sourceRows.length / maxPoints));

  return Array.from(
    { length: Math.ceil(sourceRows.length / bucketSize) },
    (_, bucketIndex) => {
      const bucket = sourceRows.slice(bucketIndex * bucketSize, (bucketIndex + 1) * bucketSize);
      const representative = bucket.at(-1) ?? sourceRows.at(-1);
      const trades = bucket.reduce((sum, row) => sum + Math.max(1, row.trades), 0);
      const pnl = trades > 0
        ? bucket.reduce((sum, row) => sum + row.pnl * Math.max(1, row.trades), 0) / trades
        : representative?.pnl ?? 0;

      return {
        date: representative?.date ?? new Date(),
        label: representative?.label ?? "",
        pnl,
        trades,
      };
    },
  ).toSorted((a, b) => a.date.getTime() - b.date.getTime());
}

function smoothExpectancyChartRows(
  rows: Array<{ date: Date; label: string; pnl: number; trades: number }>,
) {
  if (rows.length < 3) return rows;

  return rows.map((row, index) => {
    const windowRows = rows.slice(
      Math.max(0, index - 1),
      Math.min(rows.length, index + 2),
    );
    const weightedTrades = windowRows.reduce(
      (sum, item) => sum + Math.max(1, item.trades),
      0,
    );
    const smoothedPnl =
      weightedTrades > 0
        ? windowRows.reduce(
            (sum, item) => sum + item.pnl * Math.max(1, item.trades),
            0,
          ) / weightedTrades
        : row.pnl;

    return {
      ...row,
      pnl: smoothedPnl,
    };
  });
}

export function AverageWinLossCard({
  avgLoss,
  avgWin,
  currency,
  className,
}: {
  avgLoss: number;
  avgWin: number;
  currency: string;
  className?: string;
}) {
  const avgWinAbs = Math.abs(avgWin);
  const avgLossAbs = Math.abs(avgLoss);
  const ratio = avgLossAbs > 0 ? avgWinAbs / avgLossAbs : 0;
  const totalAverageMove = avgWinAbs + avgLossAbs;
  const winSharePct = totalAverageMove > 0 ? (avgWinAbs / totalAverageMove) * 100 : 0;
  const halfDonutData = totalAverageMove > 0
    ? [
        {
          color: "color-mix(in oklab, var(--muted-foreground) 62%, transparent)",
          label: "Pérdida media",
          value: avgLossAbs,
        },
        {
          color: "var(--foreground)",
          label: "Ganancia media",
          value: avgWinAbs,
        },
      ]
    : [
        {
          color: "color-mix(in oklab, var(--muted) 70%, transparent)",
          label: "Sin datos",
          value: 1,
        },
      ];

  return (
    <Card className={cn(PANEL_CARD_CLASS, PANEL_MICRO_CHART_CARD_CLASS, className)}>
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Avg win / loss</CardTitle>
            <CardDescription>Relación media entre ganadora y perdedora.</CardDescription>
          </div>
          <p className="shrink-0 font-mono text-xs text-muted-foreground">ratio</p>
        </div>
      </CardHeader>
      <CardContent className={PANEL_MICRO_CHART_CONTENT_CLASS}>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Ratio medio</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-foreground">
              {ratio.toLocaleString("es-ES", { maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Peso ganador</p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">
              {winSharePct.toLocaleString("es-ES", { maximumFractionDigits: 0 })}%
            </p>
          </div>
        </div>

        <div className={cn(PANEL_MICRO_CHART_SURFACE_CLASS, "grid grid-rows-[1fr_auto] overflow-hidden pb-4")}>
          <div className="relative mx-auto h-32 w-full max-w-64 overflow-hidden">
            <PieChart
              className="absolute left-1/2 top-2 -translate-x-1/2"
              cornerRadius={12}
              data={halfDonutData}
              endAngle={Math.PI / 2}
              enterStaggerScale={0.35}
              hoverOffset={2}
              innerRadius={74}
              padAngle={0.035}
              size={228}
              startAngle={-Math.PI / 2}
            >
              <PieSlice
                hoverEffect="none"
                index={0}
                showGlow={false}
              />
              {totalAverageMove > 0 ? (
                <PieSlice
                  hoverEffect="none"
                  index={1}
                  showGlow={false}
                />
              ) : null}
            </PieChart>
            <div className="absolute inset-x-0 top-[72px] text-center">
              <p className="font-mono text-sm font-semibold text-foreground">
                {ratio.toLocaleString("es-ES", { maximumFractionDigits: 2 })}x
              </p>
              <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">
                ganancia / pérdida
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-border/60 pt-3 text-xs">
            <div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-1.5 w-5 rounded-full bg-muted-foreground/55" />
                <span>Pérdida media</span>
              </div>
              <p className="mt-1 font-mono font-semibold text-foreground">
                {formatCurrency(-avgLossAbs, currency)}
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5 text-muted-foreground">
                <span>Ganancia media</span>
                <span className="h-1.5 w-5 rounded-full bg-foreground/85" />
              </div>
              <p className="mt-1 font-mono font-semibold text-foreground">
                {formatCurrency(avgWinAbs, currency)}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ExpectancyTrendCard({
  currency,
  workspace,
  className,
}: {
  currency: string;
  workspace: WorkspaceState;
  className?: string;
}) {
  const rows = workspace.analytics.daily
    .slice(-77)
    .map((day) => {
      const expectancy = day.trades > 0 ? day.pnl / day.trades : 0;
      const parsedTime = Date.parse(`${day.tradingDayKey}T00:00:00Z`);
      return {
        date: Number.isNaN(parsedTime) ? new Date() : new Date(parsedTime),
        label: day.label,
        pnl: expectancy,
        trades: day.trades,
      };
    });
  const operatedRows = rows.filter((row) => row.trades > 0);
  const values = (operatedRows.length > 0 ? operatedRows : rows).map((row) => row.pnl);
  const latest = values.at(-1) ?? 0;
  const chartRows = smoothExpectancyChartRows(buildExpectancyChartRows(rows));

  return (
    <Card className={cn(PANEL_CARD_CLASS, PANEL_MICRO_CHART_CARD_CLASS, className)}>
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Expectancy por día</CardTitle>
            <CardDescription>Resultado medio por operación en los últimos días.</CardDescription>
          </div>
          <p className="shrink-0 font-mono text-xs text-muted-foreground">
            {operatedRows.length > 0 ? `${operatedRows.length} días` : `Últimos ${rows.length}`}
          </p>
        </div>
      </CardHeader>
      <CardContent className={PANEL_MICRO_CHART_CONTENT_CLASS}>
        <p className="font-mono text-2xl font-semibold text-foreground">
          {formatSignedCurrency(latest, currency)}
        </p>

        {chartRows.length > 0 ? (
          <MiniProfitLossLineChart currency={currency} rows={chartRows} />
        ) : (
          <EmptyChartState label="Sin días operados para graficar." />
        )}
      </CardContent>
    </Card>
  );
}

const CALENDAR_WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

export function TopSetupsCard({
  currency,
  workspace,
  className,
}: {
  currency: string;
  workspace: WorkspaceState;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const rows = buildStrategyRows(workspace)
    .toSorted((a, b) => Math.abs(b.netPnl) - Math.abs(a.netPnl))
    .slice(0, 6)
    .map((setup) => ({
      expectancy: setup.expectancy,
      label: setup.name.length > 18 ? `${setup.name.slice(0, 17)}...` : setup.name,
      netPnl: setup.netPnl,
      pnlAbs: Math.abs(setup.netPnl),
      trades: setup.trades,
      winRatePct: setup.winRatePct,
    }));

  return (
    <Card className={cn(PANEL_CARD_CLASS, className)}>
      <CardHeader className="pb-3">
        <CardTitle>Setups por impacto</CardTitle>
        <CardDescription>PnL absoluto, expectativa y operaciones por setup.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <div className="h-[300px] [--chart-1:oklch(0.82_0_0)]">
            <BarChart
              animationDuration={1000}
              aspectRatio={isMobile ? "1 / 1.1" : "4 / 2.2"}
              barGap={0.18}
              className="h-full"
              data={rows}
              margin={{ bottom: 12, left: 88, right: 18, top: 14 }}
              orientation="horizontal"
              xDataKey="label"
            >
              <Grid vertical />
              <Bar dataKey="pnlAbs" fill="var(--chart-1)" lineCap={5} />
              <BarYAxis maxLabels={6} />
              <ChartTooltip
                rows={(point) => [
                  {
                    color: Number(point.netPnl) >= 0 ? "var(--foreground)" : "var(--muted-foreground)",
                    label: "PnL",
                    value: formatSignedCurrency(Number(point.netPnl), currency),
                  },
                  {
                    color: "var(--chart-label)",
                    label: "Expectancy",
                    value: formatSignedCurrency(Number(point.expectancy), currency),
                  },
                  {
                    color: "var(--chart-label)",
                    label: "WR / Trades",
                    value: `${formatPercent(Number(point.winRatePct), 1)} / ${Number(point.trades)}`,
                  },
                ]}
                showCrosshair={false}
              />
            </BarChart>
          </div>
        ) : (
          <EmptyChartState label="Sin setups etiquetados." />
        )}
      </CardContent>
    </Card>
  );
}

type PnlDistributionChartRow = {
  axisLabel: string;
  fill: string;
  label: string;
  netPnl: number;
  plotValue: number;
  side: "loss" | "win";
  start: number;
  end: number;
  trades: number;
};

function buildPnlDistributionRows(
  tradePnls: number[],
  currency: string,
): PnlDistributionChartRow[] {
  const losses = tradePnls.filter((pnl) => pnl < 0);
  const wins = tradePnls.filter((pnl) => pnl >= 0);
  const rows: PnlDistributionChartRow[] = [];

  if (losses.length > 0) {
    const minLoss = Math.min(...losses);
    const bucketSize = Math.max(Math.abs(minLoss) / PNL_DISTRIBUTION_SIDE_BUCKETS, 1);

    for (let index = 0; index < PNL_DISTRIBUTION_SIDE_BUCKETS; index += 1) {
      const start = minLoss + bucketSize * index;
      const end = index === PNL_DISTRIBUTION_SIDE_BUCKETS - 1 ? 0 : start + bucketSize;
      const bucketTrades = losses.filter((pnl) =>
        index === PNL_DISTRIBUTION_SIDE_BUCKETS - 1
          ? pnl >= start && pnl < 0
          : pnl >= start && pnl < end,
      );

      rows.push({
        axisLabel: formatPnlRangeAxis(start, end),
        end,
        fill: "var(--muted-foreground)",
        label: formatPnlRange(start, end, currency),
        netPnl: bucketTrades.reduce((sum, pnl) => sum + pnl, 0),
        plotValue: bucketTrades.length,
        side: "loss",
        start,
        trades: bucketTrades.length,
      });
    }
  }

  if (wins.length > 0) {
    const maxWin = Math.max(...wins, 0);
    const bucketSize = Math.max(maxWin / PNL_DISTRIBUTION_SIDE_BUCKETS, 1);

    for (let index = 0; index < PNL_DISTRIBUTION_SIDE_BUCKETS; index += 1) {
      const start = bucketSize * index;
      const end = index === PNL_DISTRIBUTION_SIDE_BUCKETS - 1 ? maxWin : start + bucketSize;
      const bucketTrades = wins.filter((pnl) =>
        index === PNL_DISTRIBUTION_SIDE_BUCKETS - 1
          ? pnl >= start && pnl <= end
          : pnl >= start && pnl < end,
      );

      rows.push({
        axisLabel: formatPnlRangeAxis(start, end),
        end,
        fill: "var(--foreground)",
        label: formatPnlRange(start, end, currency),
        netPnl: bucketTrades.reduce((sum, pnl) => sum + pnl, 0),
        plotValue: bucketTrades.length,
        side: "win",
        start,
        trades: bucketTrades.length,
      });
    }
  }

  return rows;
}

function PnlDistributionTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ payload?: PnlDistributionChartRow }>;
  currency: string;
}) {
  const row = payload?.[0]?.payload;

  if (!active || !row) return null;

  return (
    <div className="min-w-40 rounded-lg border border-border/70 bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl">
      <p className="font-mono font-semibold text-foreground">{row.label}</p>
      <div className="mt-2 grid gap-1 text-muted-foreground">
        <div className="flex items-center justify-between gap-4">
          <span>{row.side === "loss" ? "Pérdidas" : "Ganancias"}</span>
          <span className="font-mono text-foreground">{row.trades} ops</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>PnL neto</span>
          <span className="font-mono text-foreground">
            {formatSignedCurrency(row.netPnl, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function PnlDistributionCard({
  currency,
  workspace,
  className,
}: {
  currency: string;
  workspace: WorkspaceState;
  className?: string;
}) {
  const tradePnls = workspace.trades.reduce<number[]>((values, trade) => {
    if (Number.isFinite(trade.netPnl)) values.push(trade.netPnl);
    return values;
  }, []);
  const rows = buildPnlDistributionRows(tradePnls, currency);
  const dominantRow = rows.toSorted((left, right) => right.trades - left.trades)[0];
  const winningTrades = tradePnls.filter((pnl) => pnl >= 0).length;
  const losingTrades = tradePnls.length - winningTrades;
  const maxTrades = Math.max(1, ...rows.map((row) => row.trades));
  const maxLoss = Math.min(...tradePnls, 0);
  const maxWin = Math.max(...tradePnls, 0);

  return (
    <Card className={cn(PANEL_CARD_CLASS, PANEL_DIAGNOSTIC_CARD_CLASS, className)}>
      <CardHeader className="pb-0">
        <CardTitle>Distribución por resultado</CardTitle>
        <CardDescription>
          Trades por rango: pérdidas a la izquierda, ganancias a la derecha.
        </CardDescription>
      </CardHeader>
      <CardContent className={PANEL_DIAGNOSTIC_CONTENT_CLASS}>
        {tradePnls.length > 0 ? (
          <div className="grid flex-1 gap-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-y border-border/60 py-3">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">Rango con más trades</p>
                <p className="mt-1 truncate font-mono text-xs font-semibold text-foreground">
                  {dominantRow ? formatPnlRangeCompact(dominantRow.start, dominantRow.end, currency) : "-"}
                </p>
              </div>
              <div className="min-w-fit text-right">
                <p className="text-[11px] text-muted-foreground">Ganadas / perdidas</p>
                <p className="mt-1 font-mono text-xs font-semibold text-foreground">
                  {winningTrades} / {losingTrades}
                </p>
              </div>
              <div className="min-w-fit text-right">
                <p className="text-[11px] text-muted-foreground">Extremos</p>
                <p className="mt-1 whitespace-nowrap font-mono text-[11px] font-semibold text-foreground">
                  {formatPnlRangeCompact(maxLoss, maxWin, currency)}
                </p>
              </div>
            </div>

            <div className="relative">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-8 left-1/2 top-3 z-10 w-px bg-border/75"
              />
              <ChartContainer
                className="h-[264px] w-full [--chart-loss:var(--muted-foreground)] [--chart-win:var(--foreground)]"
                config={PNL_DISTRIBUTION_CHART_CONFIG}
              >
                <RechartsBarChart
                  accessibilityLayer
                  barCategoryGap="18%"
                  data={rows}
                  margin={{ bottom: 8, left: 4, right: 4, top: 22 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <RechartsXAxis
                    axisLine={false}
                    dataKey="axisLabel"
                    interval={0}
                    tick={false}
                    tickLine={false}
                    type="category"
                  />
                  <RechartsYAxis
                    axisLine={false}
                    domain={[0, Math.ceil(maxTrades * 1.18)]}
                    tick={false}
                    tickLine={false}
                    width={0}
                  />
                  <ShadcnChartTooltip
                    content={<PnlDistributionTooltip currency={currency} />}
                    cursor={{ fill: "var(--muted)" }}
                  />
                  <RechartsBar
                    dataKey="plotValue"
                    maxBarSize={44}
                    radius={[6, 6, 2, 2]}
                  >
                    {rows.map((row) => (
                      <Cell fill={row.fill} key={row.label} />
                    ))}
                    <LabelList
                      className="fill-foreground font-mono text-[10px] font-semibold"
                      dataKey="trades"
                      formatter={(value: unknown) => {
                        const count = Number(value);
                        return count > 0 ? count : "";
                      }}
                      position="top"
                    />
                  </RechartsBar>
                </RechartsBarChart>
              </ChartContainer>
              <div className="pointer-events-none -mt-3 grid grid-cols-3 font-mono text-[11px] text-muted-foreground">
                <span>{formatPnlAxisValue(maxLoss)}</span>
                <span className="text-center text-foreground">0</span>
                <span className="text-right">{formatPnlAxisValue(maxWin)}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-4 rounded-full bg-muted-foreground/70" />
                  Pérdidas
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-4 rounded-full bg-foreground/88" />
                  Ganancias
                </span>
              </div>
              <span className="font-mono">Altura = trades por rango</span>
            </div>
          </div>
        ) : (
          <EmptyChartState label="Sin operaciones cerradas." />
        )}
      </CardContent>
    </Card>
  );
}

const HEATMAP_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const PNL_RANGE_FORMATTER = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 0,
});

function formatHeatmapCellPnl(value: number, currency: string) {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : "";

  return `${sign}${rounded.toLocaleString("es-ES")} ${currency}`;
}

function formatPnlRange(start: number, end: number, currency: string) {
  return `${PNL_RANGE_FORMATTER.format(Math.round(start))} a ${PNL_RANGE_FORMATTER.format(Math.round(end))} ${currency}`;
}

function formatPnlAxisValue(value: number) {
  const rounded = Math.round(value);
  const absValue = Math.abs(rounded);
  const sign = rounded < 0 ? "-" : "";

  if (absValue >= 1000) {
    const compact = (absValue / 1000).toLocaleString("es-ES", {
      maximumFractionDigits: 1,
    });

    return `${sign}${compact.replace(",0", "")}k`;
  }

  return `${sign}${absValue.toLocaleString("es-ES")}`;
}

function formatPnlRangeCompact(start: number, end: number, currency: string) {
  return `${formatPnlAxisValue(start)} a ${formatPnlAxisValue(end)} ${currency}`;
}

function formatPnlRangeAxis(start: number, end: number) {
  return `${formatPnlAxisValue(start)}/${formatPnlAxisValue(end)}`;
}

function buildTimeHeatmap(workspace: WorkspaceState) {
  const rows = CALENDAR_WEEKDAYS.map((day) =>
    HEATMAP_HOURS.map((hour) => ({ day, hour, pnl: 0, trades: 0 })),
  );

  workspace.trades.forEach((trade) => {
    const closedAt = new Date(trade.closedAt);
    if (Number.isNaN(closedAt.getTime())) return;

    const dayIndex = (closedAt.getDay() + 6) % 7;
    const hour = closedAt.getHours();
    const hourIndex = HEATMAP_HOURS.indexOf(hour);
    if (dayIndex < 0 || hourIndex < 0) return;

    rows[dayIndex][hourIndex].pnl += trade.netPnl;
    rows[dayIndex][hourIndex].trades += Math.max(1, trade.executions.length);
  });

  const flat = rows.flat();
  const maxAbsPnl = Math.max(1, ...flat.map((cell) => Math.abs(cell.pnl)));

  return { maxAbsPnl, rows };
}

export function TimeHeatmapCard({
  currency,
  workspace,
  className,
}: {
  currency: string;
  workspace: WorkspaceState;
  className?: string;
}) {
  const { maxAbsPnl, rows } = buildTimeHeatmap(workspace);

  return (
    <Card className={cn(PANEL_CARD_CLASS, PANEL_DIAGNOSTIC_CARD_CLASS, className)}>
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Heatmap día / hora</CardTitle>
            <CardDescription>Color por PnL agregado y operaciones por franja.</CardDescription>
          </div>
          <p className="shrink-0 font-mono text-xs text-muted-foreground">
            PnL / ops
          </p>
        </div>
      </CardHeader>
      <CardContent className={PANEL_LOWER_CHART_CONTENT_CLASS}>
        <div
          className="grid gap-1.5 overflow-x-auto pb-1"
          style={{ gridTemplateColumns: `1.75rem repeat(${HEATMAP_HOURS.length}, minmax(3.8rem, 1fr))` }}
        >
          <div />
          {HEATMAP_HOURS.map((hour) => (
            <div key={hour} className="text-center font-mono text-[10px] text-muted-foreground">
              {hour}
            </div>
          ))}
          {rows.map((row, rowIndex) => (
            <React.Fragment key={CALENDAR_WEEKDAYS[rowIndex]}>
              <div className="grid h-9 place-items-center text-xs text-muted-foreground">
                {CALENDAR_WEEKDAYS[rowIndex]}
              </div>
              {row.map((cell) => {
                const intensity = Math.max(0.08, Math.min(0.74, Math.abs(cell.pnl) / maxAbsPnl));
                const hasTrades = cell.trades > 0;
                const background = hasTrades
                  ? `color-mix(in oklab, var(--foreground) ${Math.round(intensity * 42)}%, transparent)`
                  : "color-mix(in oklab, var(--muted) 28%, transparent)";

                return (
                  <div
                    className={cn(
                      "grid h-11 content-center rounded-md border border-border/60 px-1.5 text-center font-mono text-[10px]",
                      hasTrades ? "text-foreground" : "text-muted-foreground/40",
                    )}
                    key={`${cell.day}-${cell.hour}`}
                    style={{ background }}
                    title={`${cell.day} ${cell.hour}:00 / ${formatSignedCurrency(cell.pnl, currency)} / ${cell.trades} trades`}
                  >
                    {hasTrades ? (
                      <>
                        <span className="truncate font-semibold text-foreground">
                          {formatHeatmapCellPnl(cell.pnl, currency)}
                        </span>
                        <span className="mt-0.5 text-[9px] text-muted-foreground">
                          {cell.trades} op
                        </span>
                      </>
                    ) : (
                      <span aria-label="Sin operaciones">-</span>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function OutlierDependencyCard({
  currency,
  workspace,
  className,
}: {
  currency: string;
  workspace: WorkspaceState;
  className?: string;
}) {
  const netProfit = workspace.analytics.performance.netProfit;
  const bestTrade = workspace.analytics.performance.bestTrade ?? 0;
  const dependencyPct =
    netProfit > 0 && bestTrade > 0 ? Math.abs(bestTrade / netProfit) * 100 : 0;
  const dependencyScalePct = Math.max(0, Math.min(100, dependencyPct));
  const resiliencePnl = netProfit - Math.max(0, bestTrade);
  const restPct = Math.max(0, 100 - dependencyScalePct);
  const markerPct = dependencyScalePct;
  const isOverConcentrated = dependencyPct > 100;
  const dependencyLevel =
    dependencyPct >= 40
      ? "Muy alta"
      : dependencyPct >= 25
        ? "Alta"
        : dependencyPct >= 10
          ? "Controlada"
          : "Baja";
  const markerTransform =
    markerPct >= 96
      ? "translateX(-100%)"
      : markerPct <= 4
        ? "translateX(0)"
        : "translateX(-50%)";
  const markerAlignClass =
    markerPct >= 96 ? "items-end" : markerPct <= 4 ? "items-start" : "items-center";

  return (
    <Card className={cn(PANEL_CARD_CLASS, PANEL_DIAGNOSTIC_CARD_CLASS, className)}>
      <CardHeader className="pb-0">
        <CardTitle>Dependencia del mejor trade</CardTitle>
        <CardDescription>Cuánto depende el PnL de una sola operación.</CardDescription>
      </CardHeader>
      <CardContent className={cn(PANEL_DIAGNOSTIC_CONTENT_CLASS, "gap-4")}>
        <div className="grid gap-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-4xl font-semibold text-foreground">
                {formatPercent(dependencyPct, 1)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isOverConcentrated
                  ? "Sin ese trade, el PnL neto quedaría negativo."
                  : "Del PnL neto explicado por el mejor trade."}
              </p>
            </div>
            <span className="rounded-full border border-border/70 px-2 py-1 font-mono text-xs text-muted-foreground">
              {dependencyLevel}
            </span>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Escala de concentración</span>
              <span>{dependencyPct >= 40 ? "revisar concentración" : "resultado distribuido"}</span>
            </div>
            <div className="relative pb-6 pt-3">
              <div className="flex h-4 overflow-hidden rounded-full border border-border/70 bg-muted/35">
                {OUTLIER_DEPENDENCY_BANDS.map((band) => (
                  <div
                    aria-hidden="true"
                    className={cn(
                      "h-full border-r border-background/70 last:border-r-0",
                      dependencyLevel === band.label
                        ? "bg-foreground/80"
                        : "bg-muted-foreground/18",
                    )}
                    key={band.label}
                    style={{ width: `${band.width}%` }}
                  />
                ))}
              </div>
              <div
                className={cn("absolute top-0 flex flex-col gap-1", markerAlignClass)}
                style={{ left: `${markerPct}%`, transform: markerTransform }}
              >
                <span className="size-2 rounded-full bg-foreground shadow-[0_0_0_4px_var(--background)]" />
                <span className="rounded-md bg-foreground px-1.5 py-0.5 font-mono text-[10px] font-semibold text-background">
                  {isOverConcentrated ? "100%+" : formatPercent(dependencyScalePct, 1)}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5 text-[10px] text-muted-foreground">
                {OUTLIER_DEPENDENCY_BANDS.map((band) => (
                  <div
                    className={cn(
                      dependencyLevel === band.label && "text-foreground",
                    )}
                    key={band.label}
                  >
                    <p className="font-medium">{band.label}</p>
                    <p className="font-mono">{band.range}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Composición del PnL neto</span>
              <span>{formatCurrency(netProfit, currency)}</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-muted/50">
              {dependencyScalePct > 0 ? (
                <div
                  className="h-full bg-foreground/85"
                  style={{ width: `${Math.max(2, dependencyScalePct)}%` }}
                />
              ) : null}
              <div
                className="h-full bg-muted-foreground/25"
                style={{ width: `${restPct}%` }}
              />
            </div>
            <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>Mejor trade</span>
              <span>Resto del PnL</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 border-y border-border/60 py-3 text-xs">
          <div>
            <p className="text-muted-foreground">PnL neto</p>
            <p className="mt-1 font-mono font-semibold text-foreground">
              {formatCurrency(netProfit, currency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Mejor trade</p>
            <p className="mt-1 font-mono font-semibold text-foreground">
              {formatCurrency(bestTrade, currency)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground">Sin mejor trade</p>
            <p className="mt-1 font-mono font-semibold text-foreground">
              {formatCurrency(resiliencePnl, currency)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const PANEL_COMPARISON_DAYS = 30;
const DAY_SECONDS = 86_400;

function deltaTone(value: number): MetricDelta["tone"] {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

function pctChange(current: number, previous: number) {
  if (!Number.isFinite(previous) || previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function tradePerformance(trades: WorkspaceState["trades"]) {
  const executionNetPnls = trades.flatMap((trade) =>
    trade.executions.length
      ? trade.executions.map((execution) => execution.netPnl)
      : [trade.netPnl],
  );
  const netProfit = trades.reduce((sum, trade) => sum + trade.netPnl, 0);
  const wins = executionNetPnls.filter((netPnl) => netPnl > 0).length;
  const grossProfit = trades
    .filter((trade) => trade.netPnl > 0)
    .reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = Math.abs(
    trades
      .filter((trade) => trade.netPnl < 0)
      .reduce((sum, trade) => sum + trade.netPnl, 0),
  );

  return {
    netProfit,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? grossProfit : 0,
    winRatePct: executionNetPnls.length > 0 ? (wins / executionNetPnls.length) * 100 : 0,
  };
}

function tradesInRange(
  trades: WorkspaceState["trades"],
  startMs: number,
  endMs: number,
) {
  return trades.filter((trade) => {
    const closedAt = new Date(trade.closedAt).getTime();

    return Number.isFinite(closedAt) && closedAt >= startMs && closedAt < endMs;
  });
}

function nearestPointAtOrBefore(points: EquityChartPoint[], targetTime: number) {
  return [...points].reverse().find((point) => point.time <= targetTime);
}

function maxDrawdownPct(points: EquityChartPoint[]) {
  let peak = 0;
  let maxDrawdown = 0;

  points.forEach((point) => {
    peak = Math.max(peak, point.equity);
    if (peak > 0) {
      maxDrawdown = Math.max(maxDrawdown, ((peak - point.equity) / peak) * 100);
    }
  });

  return maxDrawdown;
}

function buildPanelMetricDeltas(
  workspace: WorkspaceState,
  activeAccount: TradingAccount | undefined,
): Record<"equity" | "pnl" | "profitFactor" | "winRate" | "drawdown", MetricDelta> {
  const equitySeries = buildEquityChartData(workspace, activeAccount);
  const latestEquityPoint = equitySeries.at(-1);
  const sevenDaysAgo = latestEquityPoint
    ? nearestPointAtOrBefore(equitySeries, latestEquityPoint.time - 7 * DAY_SECONDS)
    : undefined;
  const equityDelta = latestEquityPoint && sevenDaysAgo
    ? pctChange(latestEquityPoint.equity, sevenDaysAgo.equity)
    : 0;

  const tradeTimes = workspace.trades.reduce<number[]>((times, trade) => {
    const value = new Date(trade.closedAt).getTime();
    if (Number.isFinite(value)) times.push(value);
    return times;
  }, []);
  const latestTradeMs = tradeTimes.length > 0 ? Math.max(...tradeTimes) : Date.now();
  const currentStartMs = latestTradeMs - PANEL_COMPARISON_DAYS * DAY_SECONDS * 1000;
  const previousStartMs = latestTradeMs - PANEL_COMPARISON_DAYS * 2 * DAY_SECONDS * 1000;
  const currentPerformance = tradePerformance(
    tradesInRange(workspace.trades, currentStartMs, latestTradeMs + 1),
  );
  const previousPerformance = tradePerformance(
    tradesInRange(workspace.trades, previousStartMs, currentStartMs),
  );
  const pnlDelta = pctChange(currentPerformance.netProfit, previousPerformance.netProfit);
  const profitFactorDelta = currentPerformance.profitFactor - previousPerformance.profitFactor;
  const winRateDelta = currentPerformance.winRatePct - previousPerformance.winRatePct;
  const previousDrawdown = latestEquityPoint
    ? maxDrawdownPct(
        equitySeries.filter(
          (point) =>
            point.time >= latestEquityPoint.time - PANEL_COMPARISON_DAYS * 2 * DAY_SECONDS &&
            point.time < latestEquityPoint.time - PANEL_COMPARISON_DAYS * DAY_SECONDS,
        ),
      )
    : 0;
  const drawdownDelta =
    previousDrawdown > 0 ? workspace.risk.maxDrawdownPct - previousDrawdown : 0;

  return {
    equity: { value: equityDelta, label: "vs 7D", tone: deltaTone(equityDelta) },
    pnl: { value: pnlDelta, label: "vs periodo anterior", tone: deltaTone(pnlDelta) },
    profitFactor: {
      value: profitFactorDelta,
      suffix: "",
      label: "vs periodo anterior",
      tone: deltaTone(profitFactorDelta),
    },
    winRate: {
      value: winRateDelta,
      suffix: "",
      label: "vs periodo anterior",
      tone: deltaTone(winRateDelta),
    },
    drawdown: {
      value: drawdownDelta,
      suffix: "",
      label: "vs periodo anterior",
      tone: deltaTone(drawdownDelta),
    },
  };
}

function OverviewSection({ workspace }: { workspace: WorkspaceState }) {
  const activeAccount =
    workspace.accounts.find((account) => account.id === workspace.activeAccountId) ??
    workspace.accounts[0];
  const performance = buildDashboardPerformance(workspace, { preferActiveTrades: true });
  const analyticsPerformance = workspace.analytics.performance;
  const currency = activeAccount?.baseCurrency ?? "USD";
  const metricDeltas = buildPanelMetricDeltas(workspace, activeAccount);
  const avgLossAbs = Math.abs(analyticsPerformance.avgLoss);
  const avgWinLossRatio = avgLossAbs > 0 ? Math.abs(analyticsPerformance.avgWin) / avgLossAbs : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Capital activo"
          value={activeAccount?.equity ?? 0}
          suffix={` ${currency}`}
          caption="Equity de la cuenta activa"
          tone="neutral"
          delta={metricDeltas.equity}
          animateValue
        />
        <MetricCard
          title="PnL"
          value={performance.netProfit}
          suffix={` ${currency}`}
          caption="Resultado neto cerrado"
          tone={performance.netProfit > 0 ? "positive" : performance.netProfit < 0 ? "negative" : "neutral"}
          delta={metricDeltas.pnl}
        />
        <MetricCard
          title="Operaciones"
          value={performance.totalTrades}
          caption="Cerradas en la cuenta activa"
          tone="neutral"
        />
        <MetricCard
          title="PF"
          value={performance.profitFactor}
          decimals={2}
          caption="Ratio ganancia / pérdida"
          tone={
            performance.profitFactor >= 1
              ? "neutral"
              : performance.profitFactor < 1
                ? "negative"
                : "neutral"
          }
          delta={metricDeltas.profitFactor}
        />
        <MetricCard
          title="Win rate"
          value={performance.winRatePct}
          suffix="%"
          decimals={1}
          caption={`${performance.winCount} ganadoras / ${performance.lossCount} perdedoras`}
          tone={performance.winRatePct >= 50 ? "neutral" : "negative"}
          delta={metricDeltas.winRate}
        />
        <MetricCard
          title="DD"
          value={workspace.risk.maxDrawdownPct}
          suffix="%"
          decimals={2}
          caption={`Límite ${formatPercent(workspace.risk.maxLimitPct, 2)}`}
          tone={
            workspace.risk.maxLimitPct > 0 &&
            workspace.risk.maxDrawdownPct >= workspace.risk.maxLimitPct * 0.8
              ? "negative"
              : "neutral"
          }
          delta={metricDeltas.drawdown}
        />
        <MetricCard
          title="Expectancy / operación"
          value={analyticsPerformance.expectancy}
          suffix={` ${currency}`}
          caption="Resultado medio por trade"
          tone={analyticsPerformance.expectancy > 0 ? "positive" : analyticsPerformance.expectancy < 0 ? "negative" : "neutral"}
        />
        <MetricCard
          title="Avg W/L"
          value={avgWinLossRatio}
          decimals={2}
          caption={`${formatCurrency(analyticsPerformance.avgWin, currency)} / ${formatCurrency(analyticsPerformance.avgLoss, currency)}`}
          tone={avgWinLossRatio >= 1 ? "neutral" : "negative"}
        />
      </div>

      <div className="grid gap-4">
        <EquityCurveCard workspace={workspace} activeAccount={activeAccount} />
        <div className="grid gap-4 lg:grid-cols-3">
          <DrawdownRecentCard
            activeAccount={activeAccount}
            workspace={workspace}
          />
          <ExpectancyTrendCard
            currency={currency}
            workspace={workspace}
          />
          <AverageWinLossCard
            avgLoss={analyticsPerformance.avgLoss}
            avgWin={analyticsPerformance.avgWin}
            currency={currency}
          />
        </div>
        <TimeHeatmapCard
          currency={currency}
          workspace={workspace}
        />
        <div className="grid gap-4 xl:grid-cols-2">
          <PnlDistributionCard
            currency={currency}
            workspace={workspace}
          />
          <OutlierDependencyCard
            currency={currency}
            workspace={workspace}
          />
        </div>
      </div>
    </div>
  );
}

export function MesaDashboard({ workspace }: { workspace: WorkspaceState }) {
  const calendarSource = useEconomicCalendarSource();
  useCalendarReleaseAlerts(calendarSource);

  return (
    <OverviewSection workspace={workspace} />
  );
}
