"use client";

import * as React from "react";
import Link from "next/link";
import { Liveline, type LivelinePoint, type ThemeMode } from "liveline";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import {
  calendarMonthLongLabel,
  getCalendarPeriodOverview,
  monthKeyFromTradingDayKey,
  monthKeyFromYearMonth,
  shiftMonthKey,
  tradingDayKeyToUtcDate,
} from "@/lib/domain/calendar-selectors";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/formatters/numbers";
import {
  livelineWindowForData,
  normalizeLivelinePoints,
  prepareHistoricalLivelineCurve,
} from "@/lib/charts/liveline-points";
import {
  formatResponsiveLivelinePercent,
  formatResponsiveLivelineSignedCurrency,
  livelinePadding,
} from "@/lib/charts/liveline-layout";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const LIVELINE_ACCENT_BY_THEME = {
  dark: "#f5f5f5",
  light: "#171717",
} satisfies Record<ThemeMode, string>;

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

function useReferenceLivelineTheme() {
  const isLight = React.useSyncExternalStore(
    subscribeThemeClass,
    getThemeClassSnapshot,
    () => false,
  );
  const theme = (isLight ? "light" : "dark") as ThemeMode;

  return {
    theme,
    accent: LIVELINE_ACCENT_BY_THEME[theme],
  };
}


function toStaticLivelineTimeline<T extends { time: number; value: number }>(
  data: T[],
  {
    endOffsetSecs = 120,
    minSpanSecs = 0,
    minStepSecs = 60,
  }: {
    endOffsetSecs?: number;
    minSpanSecs?: number;
    minStepSecs?: number;
  } = {},
): LivelinePoint[] {
  if (data.length < 2) {
    return data.map((point) => ({ time: point.time, value: point.value }));
  }

  const firstTime = data[0].time;
  const lastTime = data.at(-1)?.time ?? firstTime;
  const sourceSpan = Math.max(1, lastTime - firstTime);
  const targetSpan = Math.max(
    sourceSpan,
    minSpanSecs,
    (data.length - 1) * minStepSecs,
  );
  const targetEnd = Math.floor(Date.now() / 1000) - endOffsetSecs;
  const targetStart = targetEnd - targetSpan;

  return normalizeLivelinePoints(data.map((point, index) => {
    const ratio =
      lastTime > firstTime
        ? (point.time - firstTime) / sourceSpan
        : index / Math.max(1, data.length - 1);

    return {
      time: Math.round(targetStart + targetSpan * ratio),
      value: point.value,
    };
  }), minStepSecs);
}


type PageMotionProps = {
  children: React.ReactNode;
};

function PageMotion({ children }: PageMotionProps) {
  return <div>{children}</div>;
}

const SHORT_DAY_LABEL_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
});
const OPEN_DAY_TIME_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function shortDayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return SHORT_DAY_LABEL_FORMATTER.format(date);
}

function calendarMonthShortLabel(index: number) {
  return ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][
    index
  ] ?? "mes";
}

function formatCalendarValue(
  value: number,
  mode: "currency" | "percent",
  baseCapital: number,
) {
  if (mode === "percent") {
    return baseCapital > 0 ? formatPercent((value / baseCapital) * 100, 2) : "—";
  }

  return formatSignedCurrency(value);
}

function formatExecutionTotal(count: number) {
  return `${count} ${count === 1 ? "ejecución" : "ejecuciones"}`;
}

type CalendarViewMode = "month" | "year";
type CalendarValueMode = "currency" | "percent";

type CalendarUiState = {
  openDayKey: string | null;
  selectedDayKey: string;
  selectedMonthKey: string;
  valueMode: CalendarValueMode;
  viewMode: CalendarViewMode;
};

type CalendarUiAction =
  | { type: "closeDay" }
  | { type: "selectDay"; dayKey: string; open: boolean }
  | { type: "selectMonth"; dayKey: string; monthKey: string }
  | { type: "setValueMode"; valueMode: CalendarValueMode }
  | { type: "setViewMode"; viewMode: CalendarViewMode };

function createInitialCalendarUiState({
  selectedDayKey,
  selectedMonthKey,
}: {
  selectedDayKey: string;
  selectedMonthKey: string;
}): CalendarUiState {
  return {
    openDayKey: null,
    selectedDayKey,
    selectedMonthKey,
    valueMode: "currency",
    viewMode: "month",
  };
}

function calendarUiReducer(
  state: CalendarUiState,
  action: CalendarUiAction,
): CalendarUiState {
  switch (action.type) {
    case "closeDay":
      return { ...state, openDayKey: null };
    case "selectDay":
      return {
        ...state,
        openDayKey: action.open ? action.dayKey : state.openDayKey,
        selectedDayKey: action.dayKey,
      };
    case "selectMonth":
      return {
        ...state,
        selectedDayKey: action.dayKey,
        selectedMonthKey: action.monthKey,
      };
    case "setValueMode":
      return { ...state, valueMode: action.valueMode };
    case "setViewMode":
      return { ...state, viewMode: action.viewMode };
  }
}

type CalendarOverview = ReturnType<typeof getCalendarPeriodOverview>;
type CalendarKpi = [label: string, value: string, note: string];
type CalendarChartTheme = ReturnType<typeof useReferenceLivelineTheme>;
type AnnualMonthCard = CalendarOverview["annualMonthCards"][number];
type MonthWeekRow = CalendarOverview["monthWeekRows"][number];
type YearlyCalendarRow = CalendarOverview["yearly"][number];
type OpenCalendarDay = NonNullable<CalendarOverview["openDay"]>;
type OpenCalendarTrade = CalendarOverview["openDayTrades"][number];

function CalendarReferenceHeader() {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-normal text-foreground">
        Calendario
      </h1>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Resultado diario y semanal, curva acumulada y rentabilidad anual en una lectura única.
      </p>
    </div>
  );
}

function CalendarControls({
  activeDaysCount,
  monthsWithTrades,
  onMonthSelect,
  onSetValueMode,
  onSetViewMode,
  selectedMonthKey,
  selectedMonthTitle,
  selectedYear,
  valueMode,
  viewMode,
}: {
  activeDaysCount: number;
  monthsWithTrades: number;
  onMonthSelect: (monthKey: string) => void;
  onSetValueMode: (valueMode: CalendarValueMode) => void;
  onSetViewMode: (viewMode: CalendarViewMode) => void;
  selectedMonthKey: string;
  selectedMonthTitle: string;
  selectedYear: number;
  valueMode: CalendarValueMode;
  viewMode: CalendarViewMode;
}) {
  const step = viewMode === "year" ? 12 : 1;

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 rounded-lg border border-border/70 bg-background/35 p-1.5 lg:w-auto lg:flex-row lg:items-center">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="shrink-0"
          onClick={() => onMonthSelect(shiftMonthKey(selectedMonthKey, -step))}
          aria-label={viewMode === "year" ? "Año anterior" : "Mes anterior"}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1 px-1 lg:min-w-44">
          <p className="truncate text-sm font-medium text-foreground">
            {viewMode === "year" ? selectedYear : selectedMonthTitle}
          </p>
          <p className="text-xs text-muted-foreground">
            {viewMode === "year"
              ? `${monthsWithTrades} meses operados`
              : `${activeDaysCount} días operados`}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="shrink-0"
          onClick={() => onMonthSelect(shiftMonthKey(selectedMonthKey, step))}
          aria-label={viewMode === "year" ? "Año siguiente" : "Mes siguiente"}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <Separator orientation="vertical" className="hidden h-8 lg:block" />
      <div className="flex flex-wrap gap-2 lg:flex-nowrap">
        <Button
          type="button"
          variant={viewMode === "month" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onSetViewMode("month")}
        >
          Mes
        </Button>
        <Button
          type="button"
          variant={viewMode === "year" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onSetViewMode("year")}
        >
          Año
        </Button>
        <Button
          type="button"
          variant={valueMode === "currency" ? "secondary" : "ghost"}
          size="sm"
          className="min-w-11"
          onClick={() => onSetValueMode("currency")}
        >
          $
        </Button>
        <Button
          type="button"
          variant={valueMode === "percent" ? "secondary" : "ghost"}
          size="sm"
          className="min-w-11"
          onClick={() => onSetValueMode("percent")}
        >
          %
        </Button>
      </div>
    </div>
  );
}

function CalendarKpiGrid({
  calendarKpis,
  selectedPeriodPnl,
}: {
  calendarKpis: CalendarKpi[];
  selectedPeriodPnl: number;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {calendarKpis.map(([label, value, note], index) => (
        <div
          key={label}
          className="min-w-0 rounded-xl border border-border/50 bg-card/60 p-4"
        >
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p
            className={cn(
              "mt-2 truncate text-2xl font-semibold tracking-normal text-foreground",
              index === 0 && selectedPeriodPnl > 0 && "text-profit",
              index === 0 && selectedPeriodPnl < 0 && "text-loss",
            )}
          >
            {value}
          </p>
          <p className="mt-2 truncate text-xs text-muted-foreground">{note}</p>
        </div>
      ))}
    </div>
  );
}

function AnnualCalendarCard({
  annualMonthCards,
  baseCapital,
  controls,
  onMonthSelect,
  onSelectDay,
  selectedMonthKey,
  valueMode,
}: {
  annualMonthCards: AnnualMonthCard[];
  baseCapital: number;
  controls: React.ReactNode;
  onMonthSelect: (monthKey: string) => void;
  onSelectDay: (dayKey: string, trades: number) => void;
  selectedMonthKey: string;
  valueMode: CalendarValueMode;
}) {
  return (
    <Card className="min-w-0 max-w-full overflow-hidden border-border/70 bg-card/70">
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <CardTitle>Calendario anual</CardTitle>
            <CardDescription>
              Meses fuertes, baches y días que merecen revisión sin salir del calendario.
            </CardDescription>
          </div>
          {controls}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid overflow-hidden rounded-lg border border-border/60 md:grid-cols-2 xl:grid-cols-3">
          {annualMonthCards.map((month, index) => (
            <div
              key={month.key}
              className={cn(
                "min-w-0 border-border/60 p-3 text-left transition hover:bg-background/20",
                index > 0 && "border-t md:border-t-0",
                index % 2 === 1 && "md:border-l",
                index > 1 && "md:border-t xl:border-t-0",
                index % 3 !== 0 && "xl:border-l",
                month.key === selectedMonthKey && "bg-background/25",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onMonthSelect(month.key)}
                  className="text-left font-medium capitalize text-foreground transition hover:text-zinc-100"
                >
                  {month.label}
                </button>
                <div className="text-right">
                  <p
                    className={cn(
                      "font-mono text-xs font-medium",
                      month.pnl > 0
                        ? "text-profit"
                        : month.pnl < 0
                          ? "text-loss"
                          : "text-muted-foreground",
                    )}
                  >
                    {formatCalendarValue(month.pnl, valueMode, baseCapital)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {month.trades} op
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-7 gap-1">
                {month.cells.map((cell) =>
                  cell.inMonth ? (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => onSelectDay(cell.key, cell.trades)}
                      disabled={!cell.trades}
                      className={[
                        "h-5 rounded-sm text-center text-[10px] leading-5 transition",
                        cell.state === "win"
                          ? "bg-profit-muted text-profit"
                          : cell.state === "loss"
                            ? "bg-loss-muted text-loss"
                            : cell.trades
                              ? "bg-muted text-foreground"
                              : "bg-muted/30 text-muted-foreground",
                        cell.trades ? "hover:ring-1 hover:ring-zinc-200/50" : "cursor-default",
                      ].join(" ")}
                      title={cell.trades ? `${cell.trades} operaciones / ${formatCalendarValue(cell.pnl, valueMode, baseCapital)}` : "Sin operativa"}
                    >
                      {cell.dayNumber}
                    </button>
                  ) : (
                    <span key={cell.key} className="h-5" />
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MonthlyCalendarCard({
  baseCapital,
  controls,
  monthWeekRows,
  onSelectDay,
  selectedDayKey,
  valueMode,
}: {
  baseCapital: number;
  controls: React.ReactNode;
  monthWeekRows: MonthWeekRow[];
  onSelectDay: (dayKey: string, trades: number) => void;
  selectedDayKey: string;
  valueMode: CalendarValueMode;
}) {
  return (
    <Card className="min-w-0 overflow-hidden border-border/70 bg-card/70">
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <CardTitle>Vista mensual</CardTitle>
            <CardDescription>
              Ritmo diario, resultado por sesión y semanas que sostuvieron la curva.
            </CardDescription>
          </div>
          {controls}
        </div>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4 overflow-hidden">
        <div className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-profit" />
              Positivo
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-loss" />
              Negativo
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-zinc-300" />
              Semana
            </span>
          </div>
          <div className="mt-3 max-w-full overflow-hidden pb-1">
            <div className="grid w-full grid-cols-7 gap-1 md:grid-cols-[repeat(7,minmax(0,1fr))_minmax(118px,0.92fr)] md:gap-1.5">
              {["D", "L", "M", "X", "J", "V", "S", "Semana"].map((header) => (
                <div
                  key={header}
                  className={cn(
                    "px-1 py-2 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground",
                    header === "Semana" && "hidden md:block",
                  )}
                >
                  {header}
                </div>
              ))}
              {monthWeekRows.map((row) => (
                <React.Fragment key={row.key}>
                  {row.cells.map((cell) =>
                    cell.inMonth ? (
                      <button
                        key={cell.key}
                        type="button"
                        onClick={() => onSelectDay(cell.key, cell.trades)}
                        disabled={!cell.trades}
                        title={cell.trades ? `${cell.trades} operaciones / ${formatCalendarValue(cell.pnl, valueMode, baseCapital)}. Abrir detalle` : "Sin operativa"}
                        aria-label={cell.trades ? `${cell.dayNumber}: ${cell.trades} operaciones, ${formatCalendarValue(cell.pnl, valueMode, baseCapital)}. Abrir detalle` : `${cell.dayNumber}: sin operativa`}
                        className={cn(
                          "min-h-16 rounded-lg border p-1.5 text-left transition md:min-h-[72px] md:p-2 xl:min-h-20",
                          cell.state === "win"
                            ? "border-profit/40 bg-profit-muted hover:bg-profit-muted"
                            : cell.state === "loss"
                              ? "border-loss/40 bg-loss-muted hover:bg-loss-muted"
                              : "border-border/70 bg-card/60 hover:bg-card",
                          cell.key === selectedDayKey &&
                            "border-zinc-400/70 ring-1 ring-zinc-300/45",
                          cell.trades ? "cursor-pointer" : "cursor-default hover:bg-card/60",
                        )}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="text-sm font-medium text-foreground">
                            {cell.dayNumber}
                          </span>
                          <span className="hidden min-w-5 rounded-full bg-background/55 px-1 py-0.5 text-center font-mono text-[10px] leading-none whitespace-nowrap text-muted-foreground sm:inline-block">
                            {cell.trades ? cell.trades : null}
                          </span>
                        </div>
                        <div className="mt-2 xl:mt-5">
                          <p className="max-w-full break-words font-mono text-[11px] font-medium leading-tight text-foreground md:text-xs">
                            {cell.trades ? formatCalendarValue(cell.pnl, valueMode, baseCapital) : "—"}
                          </p>
                        </div>
                      </button>
                    ) : (
                      <div
                        key={cell.key}
                        className="min-h-16 rounded-lg border border-transparent bg-transparent md:min-h-[72px] xl:min-h-20"
                        aria-hidden="true"
                      />
                    ),
                  )}
                  <div className="hidden min-h-16 min-w-0 flex-col justify-between rounded-lg border border-border/70 bg-card/55 p-1.5 md:flex md:min-h-[72px] md:p-2 xl:min-h-20">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        {row.week?.label ?? "Semana"}
                      </p>
                      <p
                        className={cn(
                          "mt-2 whitespace-nowrap font-mono text-[13px] font-semibold leading-tight md:text-sm",
                          (row.week?.pnl ?? 0) > 0
                            ? "text-profit"
                            : (row.week?.pnl ?? 0) < 0
                              ? "text-loss"
                              : "text-foreground",
                        )}
                      >
                        {row.week ? formatCalendarValue(row.week.pnl, valueMode, baseCapital) : "—"}
                      </p>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {row.week ? `${row.week.activeDays} días / ${row.week.trades} op` : "Sin operativa"}
                    </p>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CumulativeCalendarSection({
  calendarChartTheme,
  cumulativeLatest,
  cumulativeLivelineData,
  cumulativeWindowSecs,
  formatCumulativeLivelineTime,
  valueMode,
}: {
  calendarChartTheme: CalendarChartTheme;
  cumulativeLatest: number;
  cumulativeLivelineData: LivelinePoint[];
  cumulativeWindowSecs: number;
  formatCumulativeLivelineTime: (time: number) => string;
  valueMode: CalendarValueMode;
}) {
  const isMobile = useIsMobile();

  return (
    <section className="min-w-0 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Rentabilidad acumulada</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Curva acumulada para seguir tracción, baches y recuperación del periodo.
          </p>
        </div>
        <Badge variant="outline">
          {valueMode === "currency"
            ? formatSignedCurrency(cumulativeLatest)
            : formatPercent(cumulativeLatest, 2)}
        </Badge>
      </div>
      <div data-kmfx-liveline className="mt-4 h-72 min-w-0 overflow-hidden">
        {cumulativeLivelineData.length >= 2 ? (
          <Liveline
            badge
            badgeVariant="minimal"
            color={calendarChartTheme.accent}
            data={cumulativeLivelineData}
            emptyText="Historial insuficiente"
            fill
            formatTime={formatCumulativeLivelineTime}
            formatValue={(value) =>
              valueMode === "currency"
                ? formatResponsiveLivelineSignedCurrency(Number(value), "USD", isMobile)
                : formatResponsiveLivelinePercent(Number(value), isMobile)
            }
            grid
            badgeTail={!isMobile}
            lineWidth={2.25}
            momentum={false}
            padding={livelinePadding(isMobile, {
              top: 12,
              right: 132,
              bottom: 28,
              left: 18,
            })}
            pulse
            referenceLine={{ value: 0, label: valueMode === "currency" ? "0 US$" : "0%" }}
            scrub
            style={{ height: "100%" }}
            theme={calendarChartTheme.theme}
            value={cumulativeLatest}
            valueMomentumColor={false}
            window={cumulativeWindowSecs}
            windowStyle="rounded"
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border/70 text-sm text-muted-foreground">
            Historial insuficiente para curva acumulada.
          </div>
        )}
      </div>
    </section>
  );
}

function calendarMonthsForYear(
  year: YearlyCalendarRow,
  monthlyByKey: CalendarOverview["monthlyByKey"],
) {
  return Array.from({ length: 12 }, (_, index) => {
    const key = monthKeyFromYearMonth(Number(year.key), index);
    return monthlyByKey.get(key) ?? {
      key,
      label: calendarMonthLongLabel(index),
      pnl: 0,
      trades: 0,
      redDays: 0,
    };
  });
}

function YearlyReturnTable({
  baseCapital,
  monthlyByKey,
  yearly,
}: {
  baseCapital: number;
  monthlyByKey: CalendarOverview["monthlyByKey"];
  yearly: YearlyCalendarRow[];
}) {
  return (
    <section className="min-w-0 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Tabla de rentabilidad</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Rentabilidad mensual y acumulado anual sobre el capital conectado.
          </p>
        </div>
      </div>
      <div className="mt-4 max-w-full overflow-hidden">
        <div className="border-y border-border/70 md:hidden">
          {yearly.length > 0 ? (
            yearly.map((year) => {
              const months = calendarMonthsForYear(year, monthlyByKey);

              return (
                <div key={year.key} className="border-t border-border/60 first:border-t-0">
                  <div className="flex items-center justify-between border-b border-border/60 py-2">
                    <span className="text-sm font-medium text-foreground">{year.label}</span>
                    <span className="font-mono text-xs text-foreground">
                      {formatCalendarValue(year.pnl, "percent", baseCapital)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2">
                    {months.map((month) => (
                      <div
                        key={month.key}
                        className="min-w-0 border-t border-border/50 py-2 odd:border-r odd:pr-2 even:pl-2"
                      >
                        <p className="rounded-sm bg-muted/35 px-1.5 py-1 text-xs capitalize leading-tight text-muted-foreground">
                          {month.label}
                        </p>
                        <p
                          className={cn(
                            "mt-1 font-mono text-xs",
                            month.pnl > 0
                              ? "text-profit"
                              : month.pnl < 0
                                ? "text-loss"
                                : "text-muted-foreground",
                          )}
                        >
                          {month.trades ? formatCalendarValue(month.pnl, "percent", baseCapital) : "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Sin rentabilidad anual disponible.
            </div>
          )}
        </div>
        <div className="hidden min-w-0 border-y border-border/70 text-[10px] md:block md:text-[11px]">
          <div className="grid grid-cols-[minmax(38px,0.65fr)_repeat(12,minmax(0,1fr))_minmax(46px,0.75fr)] border-b border-border/70">
            <div className="px-1.5 py-2 text-xs font-medium text-muted-foreground">
              Año
            </div>
            {Array.from({ length: 12 }, (_, index) => (
              <div
                key={index}
                className="min-w-0 border-l border-border/50 bg-muted/35 px-1 py-2 text-center text-[9px] font-medium capitalize leading-tight text-muted-foreground md:text-[10px] xl:text-[11px]"
                title={calendarMonthLongLabel(index)}
              >
                {calendarMonthShortLabel(index)}
              </div>
            ))}
            <div className="border-l border-border/50 px-1.5 py-2 text-right text-xs font-medium text-muted-foreground">
              Total
            </div>
          </div>
          {yearly.length > 0 ? (
            yearly.map((year) => {
              const months = calendarMonthsForYear(year, monthlyByKey);

              return (
                <div
                  key={year.key}
                  className="grid grid-cols-[minmax(38px,0.65fr)_repeat(12,minmax(0,1fr))_minmax(46px,0.75fr)] border-t border-border/50 first:border-t-0"
                >
                  <div className="px-1.5 py-2 text-sm font-medium text-foreground">
                    {year.label}
                  </div>
                  {months.map((month) => (
                    <div
                      key={month.key}
                      className={cn(
                        "min-w-0 border-l border-border/50 px-0.5 py-2 text-center font-mono leading-tight",
                        month.pnl > 0
                          ? "text-profit"
                          : month.pnl < 0
                            ? "text-loss"
                            : "text-muted-foreground",
                      )}
                      title={`${month.label}: ${formatCalendarValue(month.pnl, "percent", baseCapital)}`}
                    >
                      <span className="block truncate">
                        {month.trades ? formatCalendarValue(month.pnl, "percent", baseCapital) : "—"}
                      </span>
                    </div>
                  ))}
                  <div className="border-l border-border/50 px-1.5 py-2 text-right font-mono text-xs text-foreground">
                    {formatCalendarValue(year.pnl, "percent", baseCapital)}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Sin rentabilidad anual disponible.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function OpenDayStats({
  baseCapital,
  openDay,
  valueMode,
}: {
  baseCapital: number;
  openDay: OpenCalendarDay;
  valueMode: CalendarValueMode;
}) {
  const stats = [
    {
      label: "Resultado",
      value: formatCalendarValue(openDay.pnl, valueMode, baseCapital),
      note: `${openDay.trades} operaciones`,
      valueClass:
        openDay.pnl > 0
          ? "text-profit"
          : openDay.pnl < 0
            ? "text-loss"
            : "text-foreground",
    },
    {
      label: "Win rate",
      value: `${openDay.winRatePct.toFixed(0)}%`,
      note:
        openDay.trades > 0 && openDay.trades < 5
          ? `Pocas operaciones: ${openDay.trades} op`
          : `${openDay.wins} ganadoras / ${openDay.losses} perdedoras`,
      valueClass:
        openDay.trades === 0
          ? "text-muted-foreground"
          : openDay.trades < 5
            ? "text-foreground"
            : openDay.winRatePct >= 55
              ? "text-profit"
              : openDay.winRatePct >= 45
                ? "text-risk"
                : "text-loss",
    },
    {
      label: "Revisión",
      value: String(openDay.reviewCount),
      note: "Operaciones con presión",
      valueClass: openDay.reviewCount > 0 ? "text-risk" : "text-foreground",
    },
    {
      label: "Setup pendiente",
      value: String(openDay.missingTags),
      note: "Atribución pendiente",
      valueClass: openDay.missingTags > 0 ? "text-risk" : "text-foreground",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {stats.map((item) => (
        <div key={item.label} className="min-w-0">
          <p className="text-xs text-muted-foreground">{item.label}</p>
          <p className={cn("mt-2 text-lg font-semibold", item.valueClass)}>
            {item.value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
        </div>
      ))}
    </div>
  );
}

function OpenDayCurve({
  baseCapital,
  calendarChartTheme,
  formatOpenDayLivelineTime,
  openDay,
  openDayLivelineData,
  openDayWindowSecs,
  valueMode,
}: {
  baseCapital: number;
  calendarChartTheme: CalendarChartTheme;
  formatOpenDayLivelineTime: (time: number) => string;
  openDay: OpenCalendarDay;
  openDayLivelineData: LivelinePoint[];
  openDayWindowSecs: number;
  valueMode: CalendarValueMode;
}) {
  const isMobile = useIsMobile();

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Curva del día</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Rentabilidad acumulada por cierre dentro del día.
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            openDay.pnl > 0 && "text-profit",
            openDay.pnl < 0 && "text-loss",
          )}
        >
          {formatCalendarValue(openDay.pnl, valueMode, baseCapital)}
        </Badge>
      </div>
      <div data-kmfx-liveline className="mt-4 h-56">
        {openDayLivelineData.length >= 2 ? (
          <Liveline
            badge
            badgeVariant="minimal"
            color={calendarChartTheme.accent}
            data={openDayLivelineData}
            emptyText="Hace falta más de un cierre"
            fill
            formatTime={formatOpenDayLivelineTime}
            formatValue={(value) =>
              valueMode === "currency"
                ? formatResponsiveLivelineSignedCurrency(Number(value), "USD", isMobile)
                : formatResponsiveLivelinePercent(Number(value), isMobile)
            }
            grid
            badgeTail={!isMobile}
            lineWidth={2.2}
            momentum={false}
            padding={livelinePadding(isMobile, {
              top: 14,
              right: 142,
              bottom: 24,
              left: 18,
            })}
            pulse
            referenceLine={{ value: 0, label: valueMode === "currency" ? "0 US$" : "0%" }}
            scrub
            style={{ height: "100%" }}
            theme={calendarChartTheme.theme}
            value={openDayLivelineData.at(-1)?.value ?? 0}
            valueMomentumColor={false}
            window={openDayWindowSecs}
            windowStyle="rounded"
          />
        ) : (
          <div className="flex h-full items-center justify-center border-t border-dashed border-border/70 text-sm text-muted-foreground">
            Hace falta más de un cierre para curva intradía.
          </div>
        )}
      </div>
    </div>
  );
}

function OpenDayTrades({
  baseCapital,
  openDayTrades,
  valueMode,
}: {
  baseCapital: number;
  openDayTrades: OpenCalendarTrade[];
  valueMode: CalendarValueMode;
}) {
  return (
    <div className="grid gap-3">
      {openDayTrades.length > 0 ? (
        openDayTrades.map((trade) => (
          <div
            key={trade.id}
            className="py-3 first:pt-4 last:pb-0"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{trade.symbol}</p>
                  <Badge variant={trade.netPnl < 0 ? "secondary" : "outline"}>
                    {trade.side.toUpperCase()}
                  </Badge>
                  <Badge variant="outline">{trade.session}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {trade.setup ?? "Setup pendiente"} / {trade.volume} lotes /{" "}
                  {trade.durationMinutes === null ? "duración pendiente" : `${trade.durationMinutes} min`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Entrada {trade.entryPrice} / salida {trade.exitPrice} /{" "}
                  {formatExecutionTotal(trade.executions.length)}
                </p>
              </div>
              <div className="text-left md:text-right">
                <p
                  className={cn(
                    "font-mono text-lg",
                    trade.netPnl > 0
                      ? "text-profit"
                      : trade.netPnl < 0
                        ? "text-loss"
                        : "text-foreground",
                  )}
                >
                  {formatCalendarValue(trade.netPnl, valueMode, baseCapital)}
                </p>
                <p
                  className={cn(
                    "mt-1 text-xs",
                    Math.abs(trade.commission) + Math.abs(trade.swap) > 0
                      ? "text-loss/80"
                      : "text-muted-foreground",
                  )}
                >
                  Costes {formatCurrency(Math.abs(trade.commission) + Math.abs(trade.swap))}
                </p>
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className="pt-4 text-sm text-muted-foreground">
          No hay operaciones cerradas para este día.
        </div>
      )}
    </div>
  );
}

function OpenDayDialog({
  baseCapital,
  calendarChartTheme,
  formatOpenDayLivelineTime,
  onClose,
  openDay,
  openDayKey,
  openDayLivelineData,
  openDayTrades,
  openDayWindowSecs,
  valueMode,
}: {
  baseCapital: number;
  calendarChartTheme: CalendarChartTheme;
  formatOpenDayLivelineTime: (time: number) => string;
  onClose: () => void;
  openDay: CalendarOverview["openDay"];
  openDayKey: string | null;
  openDayLivelineData: LivelinePoint[];
  openDayTrades: OpenCalendarTrade[];
  openDayWindowSecs: number;
  valueMode: CalendarValueMode;
}) {
  return (
    <Dialog open={openDayKey !== null} onOpenChange={(open) => {
      if (!open) onClose();
    }}>
      <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {openDay?.label ?? "Detalle del día"}
          </DialogTitle>
          <DialogDescription>
            Ventana operativa del día seleccionado con operaciones, curva intradía y presión de revisión.
          </DialogDescription>
        </DialogHeader>
        {openDay ? (
          <div className="grid gap-4">
            <OpenDayStats
              baseCapital={baseCapital}
              openDay={openDay}
              valueMode={valueMode}
            />
            <OpenDayCurve
              baseCapital={baseCapital}
              calendarChartTheme={calendarChartTheme}
              formatOpenDayLivelineTime={formatOpenDayLivelineTime}
              openDay={openDay}
              openDayLivelineData={openDayLivelineData}
              openDayWindowSecs={openDayWindowSecs}
              valueMode={valueMode}
            />
            <OpenDayTrades
              baseCapital={baseCapital}
              openDayTrades={openDayTrades}
              valueMode={valueMode}
            />
            <div className="grid gap-2 md:grid-cols-2">
              <Button
                render={<Link href="/trades" />}
                nativeButton={false}
                variant="outline"
                className="justify-between"
              >
                Ver operaciones
                <span>→</span>
              </Button>
              <Button
                render={<Link href="/trades" />}
                nativeButton={false}
                variant="ghost"
                className="justify-between"
              >
                Ver trades del día
                <span>→</span>
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}


function useCalendarReferenceModel({
  workspace,
}: {
  workspace: WorkspaceState;
}) {
  const calendarChartTheme = useReferenceLivelineTheme();
  const initialCalendarOverview = React.useMemo(
    () => getCalendarPeriodOverview(workspace),
    [workspace],
  );
  const activeAccount =
    workspace.accounts.find((account) => account.id === workspace.activeAccountId) ??
    workspace.accounts[0];
  const baseCapital = activeAccount?.balance || activeAccount?.equity || 0;
  const [calendarUiState, dispatchCalendarUi] = React.useReducer(
    calendarUiReducer,
    {
      selectedDayKey: initialCalendarOverview.latestDay?.tradingDayKey ?? "",
      selectedMonthKey: initialCalendarOverview.selectedMonthKey,
    },
    createInitialCalendarUiState,
  );
  const {
    openDayKey,
    selectedDayKey: selectedDayKeyState,
    selectedMonthKey: selectedMonthKeyState,
    valueMode,
    viewMode,
  } = calendarUiState;

  const calendarOverview = React.useMemo(
    () =>
      getCalendarPeriodOverview(workspace, {
        selectedMonthKey: selectedMonthKeyState,
        selectedDayKey: selectedDayKeyState,
        openDayKey,
        viewMode,
      }),
    [openDayKey, selectedDayKeyState, selectedMonthKeyState, viewMode, workspace],
  );
  const {
    days,
    yearly,
    monthlyByKey,
    selectedMonthKey,
    selectedYear,
    selectedMonth,
    activeDaysInMonth,
    selectedDayKey,
    openDay,
    openDayTrades,
    annualMonthCards,
    selectedPeriodPnl,
    selectedPeriodTrades,
    monthsWithTrades,
    bestPeriodDay,
    worstPeriodDay,
    reviewDay,
    monthWeekRows,
  } = calendarOverview;
  const cumulativeChartData = React.useMemo(() => {
    return [...days]
      .toSorted((a, b) => a.tradingDayKey.localeCompare(b.tradingDayKey))
      .reduce<{ total: number; points: Array<{ label: string; time: number; value: number }> }>((acc, day, index) => {
        const nextTotal = acc.total + day.pnl;
        const date = tradingDayKeyToUtcDate(day.tradingDayKey);

        return {
          total: nextTotal,
          points: [
            ...acc.points,
            {
              label: shortDayLabel(`${day.tradingDayKey}T00:00:00Z`),
              time: date
                ? Math.floor(date.getTime() / 1000)
                : 1_777_593_600 + index * 86_400,
              value:
                valueMode === "percent" && baseCapital > 0
                  ? (nextTotal / baseCapital) * 100
                  : nextTotal,
            },
          ],
        };
      }, { total: 0, points: [] }).points;
  }, [baseCapital, days, valueMode]);
  const visibleCumulativeChartData = React.useMemo(
    () =>
      cumulativeChartData.length === 1
        ? [
            {
              label: "Inicio",
              time: cumulativeChartData[0].time - 86_400,
              value: 0,
            },
            ...cumulativeChartData,
          ]
        : cumulativeChartData,
    [cumulativeChartData],
  );
  const cumulativeLatest = cumulativeChartData.at(-1)?.value ?? 0;
  const cumulativeLivelineData = React.useMemo<LivelinePoint[]>(
    () =>
      prepareHistoricalLivelineCurve(toStaticLivelineTimeline(visibleCumulativeChartData, {
        minSpanSecs: 86_400,
        minStepSecs: 86_400,
      }), {
        bucketSecs: 86_400,
        maxPoints: 48,
        minPoints: 12,
        minStepSecs: 86_400,
      }),
    [visibleCumulativeChartData],
  );
  const cumulativeLabelByTime = React.useMemo(
    () =>
      new Map(
        cumulativeLivelineData.map((point, index) => [
          point.time,
          visibleCumulativeChartData[index]?.label ?? "Cierre",
        ]),
      ),
    [cumulativeLivelineData, visibleCumulativeChartData],
  );
  const formatCumulativeLivelineTime = React.useCallback(
    (time: number) => {
      const exactLabel = cumulativeLabelByTime.get(time);
      if (exactLabel) return exactLabel;

      const syntheticFirst = cumulativeLivelineData[0]?.time;
      const syntheticLast = cumulativeLivelineData.at(-1)?.time;
      const sourceFirst = visibleCumulativeChartData[0]?.time;
      const sourceLast = visibleCumulativeChartData.at(-1)?.time;

      if (!syntheticFirst || !syntheticLast || !sourceFirst || !sourceLast) {
        return shortDayLabel(new Date(time * 1000).toISOString());
      }

      const ratio =
        syntheticLast > syntheticFirst
          ? (time - syntheticFirst) / (syntheticLast - syntheticFirst)
          : 1;
      const sourceTime = sourceFirst + (sourceLast - sourceFirst) * ratio;

      return shortDayLabel(new Date(sourceTime * 1000).toISOString());
    },
    [cumulativeLabelByTime, cumulativeLivelineData, visibleCumulativeChartData],
  );
  const cumulativeWindowSecs = React.useMemo(() => {
    const first = cumulativeLivelineData[0]?.time;
    const last = cumulativeLivelineData.at(-1)?.time;
    const requestedWindow = first && last ? Math.max(86_400, last - first + 86_400) : 86_400;

    return livelineWindowForData(cumulativeLivelineData, requestedWindow, {
      minSecs: 86_400,
      maxPadSecs: 86_400,
    });
  }, [cumulativeLivelineData]);
  const openDayChartData = React.useMemo(() => {
    const points = openDayTrades
      .slice()
      .toSorted((a, b) => a.closedAt.localeCompare(b.closedAt))
      .reduce<{ total: number; points: Array<{ label: string; time: number; value: number }> }>((acc, trade, index) => {
        const nextTotal = acc.total + trade.netPnl;
        const closedAt = new Date(trade.closedAt);
        const isValidTime = !Number.isNaN(closedAt.getTime());

        return {
          total: nextTotal,
          points: [
            ...acc.points,
            {
              label: isValidTime
                ? OPEN_DAY_TIME_FORMATTER.format(closedAt)
                : "Cierre",
              time: isValidTime
                ? Math.floor(closedAt.getTime() / 1000)
                : 1_777_593_600 + index * 900,
              value:
                valueMode === "percent" && baseCapital > 0
                  ? (nextTotal / baseCapital) * 100
                  : nextTotal,
            },
          ],
        };
      }, { total: 0, points: [] }).points;

    return points.length > 0
      ? [
          {
            label: "Inicio",
            time: points[0].time - 900,
            value: 0,
          },
          ...points,
        ]
      : points;
  }, [baseCapital, openDayTrades, valueMode]);
  const openDayLivelineData = React.useMemo<LivelinePoint[]>(
    () =>
      prepareHistoricalLivelineCurve(toStaticLivelineTimeline(openDayChartData, {
        minSpanSecs: 3_600,
        minStepSecs: 900,
      }), {
        bucketSecs: 900,
        maxPoints: 36,
        minPoints: 8,
        minStepSecs: 900,
      }),
    [openDayChartData],
  );
  const openDayLabelByTime = React.useMemo(
    () =>
      new Map(
        openDayLivelineData.map((point, index) => [
          point.time,
          openDayChartData[index]?.label ?? "Cierre",
        ]),
      ),
    [openDayChartData, openDayLivelineData],
  );
  const formatOpenDayLivelineTime = React.useCallback(
    (time: number) => {
      const exactLabel = openDayLabelByTime.get(time);
      if (exactLabel) return exactLabel;

      const syntheticFirst = openDayLivelineData[0]?.time;
      const syntheticLast = openDayLivelineData.at(-1)?.time;
      const sourceFirst = openDayChartData[0]?.time;
      const sourceLast = openDayChartData.at(-1)?.time;

      if (!syntheticFirst || !syntheticLast || !sourceFirst || !sourceLast) {
        return OPEN_DAY_TIME_FORMATTER.format(new Date(time * 1000));
      }

      const ratio =
        syntheticLast > syntheticFirst
          ? (time - syntheticFirst) / (syntheticLast - syntheticFirst)
          : 1;
      const sourceTime = sourceFirst + (sourceLast - sourceFirst) * ratio;

      return OPEN_DAY_TIME_FORMATTER.format(new Date(sourceTime * 1000));
    },
    [openDayChartData, openDayLabelByTime, openDayLivelineData],
  );
  const openDayWindowSecs = React.useMemo(() => {
    const first = openDayLivelineData[0]?.time;
    const last = openDayLivelineData.at(-1)?.time;
    const requestedWindow = first && last ? Math.max(3_600, last - first + 1_800) : 3_600;

    return livelineWindowForData(openDayLivelineData, requestedWindow, {
      minSecs: 3_600,
      padRatio: 0.18,
      maxPadSecs: 1_800,
    });
  }, [openDayLivelineData]);
  const calendarKpis: CalendarKpi[] = [
    [
      viewMode === "year" ? "Resultado del año" : "Resultado del mes",
      formatCalendarValue(selectedPeriodPnl, valueMode, baseCapital),
      `${selectedPeriodTrades} operaciones cerradas`,
    ],
    [
      "Operaciones",
      String(selectedPeriodTrades),
      viewMode === "year"
        ? `${monthsWithTrades} meses operados`
        : `${activeDaysInMonth.length} días operados`,
    ],
    [
      "Días clave",
      bestPeriodDay && worstPeriodDay
        ? `${shortDayLabel(`${bestPeriodDay.tradingDayKey}T00:00:00Z`)} / ${shortDayLabel(`${worstPeriodDay.tradingDayKey}T00:00:00Z`)}`
        : "Sin días clave",
      bestPeriodDay && worstPeriodDay
        ? `Mejor ${formatSignedCurrency(bestPeriodDay.pnl)} / Peor ${formatSignedCurrency(worstPeriodDay.pnl)}`
        : "Sin sesiones para comparar",
    ],
    [
      "Revisión sugerida",
      reviewDay ? `Revisar ${shortDayLabel(`${reviewDay.tradingDayKey}T00:00:00Z`)}` : "Sin revisión urgente",
      reviewDay ? "Día con pérdida o presión operativa" : "Periodo estable por ahora",
    ],
  ];

  const handleMonthSelect = React.useCallback(
    (monthKey: string) => {
      const nextDay = days.find((day) => monthKeyFromTradingDayKey(day.tradingDayKey) === monthKey);
      dispatchCalendarUi({
        type: "selectMonth",
        dayKey: nextDay?.tradingDayKey ?? "",
        monthKey,
      });
    },
    [days],
  );
  const selectedMonthTitle =
    selectedMonth.label.charAt(0).toUpperCase() + selectedMonth.label.slice(1);
  const setViewMode = React.useCallback((nextViewMode: CalendarViewMode) => {
    dispatchCalendarUi({ type: "setViewMode", viewMode: nextViewMode });
  }, []);
  const setValueMode = React.useCallback((nextValueMode: CalendarValueMode) => {
    dispatchCalendarUi({ type: "setValueMode", valueMode: nextValueMode });
  }, []);
  const selectDay = React.useCallback((dayKey: string, trades: number) => {
    dispatchCalendarUi({
      type: "selectDay",
      dayKey,
      open: trades > 0,
    });
  }, []);
  const closeOpenDay = React.useCallback(() => {
    dispatchCalendarUi({ type: "closeDay" });
  }, []);
  const calendarControls = (
    <CalendarControls
      activeDaysCount={activeDaysInMonth.length}
      monthsWithTrades={monthsWithTrades}
      onMonthSelect={handleMonthSelect}
      onSetValueMode={setValueMode}
      onSetViewMode={setViewMode}
      selectedMonthKey={selectedMonthKey}
      selectedMonthTitle={selectedMonthTitle}
      selectedYear={selectedYear}
      valueMode={valueMode}
      viewMode={viewMode}
    />
  );

  const kpiGrid = (
    <CalendarKpiGrid
      calendarKpis={calendarKpis}
      selectedPeriodPnl={selectedPeriodPnl}
    />
  );

  return {
    annualMonthCards,
    baseCapital,
    calendarChartTheme,
    calendarControls,
    closeOpenDay,
    cumulativeLatest,
    cumulativeLivelineData,
    cumulativeWindowSecs,
    formatCumulativeLivelineTime,
    formatOpenDayLivelineTime,
    handleMonthSelect,
    kpiGrid,
    monthWeekRows,
    monthlyByKey,
    openDay,
    openDayKey,
    openDayLivelineData,
    openDayTrades,
    openDayWindowSecs,
    selectDay,
    selectedDayKey,
    selectedMonthKey,
    valueMode,
    viewMode,
    yearly,
  };
}

export function CalendarReferenceSection({
  workspace,
}: {
  workspace: WorkspaceState;
}) {
  const model = useCalendarReferenceModel({ workspace });

  return (
    <PageMotion>
      <div className="grid gap-4">
        <CalendarReferenceHeader />
        {model.kpiGrid}
        {model.viewMode === "year" ? (
          <AnnualCalendarCard
            annualMonthCards={model.annualMonthCards}
            baseCapital={model.baseCapital}
            controls={model.calendarControls}
            onMonthSelect={model.handleMonthSelect}
            onSelectDay={model.selectDay}
            selectedMonthKey={model.selectedMonthKey}
            valueMode={model.valueMode}
          />
        ) : (
          <MonthlyCalendarCard
            baseCapital={model.baseCapital}
            controls={model.calendarControls}
            monthWeekRows={model.monthWeekRows}
            onSelectDay={model.selectDay}
            selectedDayKey={model.selectedDayKey}
            valueMode={model.valueMode}
          />
        )}
        <CumulativeCalendarSection
          calendarChartTheme={model.calendarChartTheme}
          cumulativeLatest={model.cumulativeLatest}
          cumulativeLivelineData={model.cumulativeLivelineData}
          cumulativeWindowSecs={model.cumulativeWindowSecs}
          formatCumulativeLivelineTime={model.formatCumulativeLivelineTime}
          valueMode={model.valueMode}
        />
        <YearlyReturnTable
          baseCapital={model.baseCapital}
          monthlyByKey={model.monthlyByKey}
          yearly={model.yearly}
        />
      </div>
      <OpenDayDialog
        baseCapital={model.baseCapital}
        calendarChartTheme={model.calendarChartTheme}
        formatOpenDayLivelineTime={model.formatOpenDayLivelineTime}
        onClose={model.closeOpenDay}
        openDay={model.openDay}
        openDayKey={model.openDayKey}
        openDayLivelineData={model.openDayLivelineData}
        openDayTrades={model.openDayTrades}
        openDayWindowSecs={model.openDayWindowSecs}
        valueMode={model.valueMode}
      />
    </PageMotion>
  );
}
