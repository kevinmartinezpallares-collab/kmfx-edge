import type {
  ClosedTrade,
  DailyTradeBucket,
  TradeSession,
} from "@/lib/contracts/trade";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";

export type CalendarConfidenceLabel = "Operativa" | "Temprana" | "Pocas operaciones";

export type CalendarDayRow = DailyTradeBucket & {
  dominantSymbol: string;
  dominantSession: TradeSession | "Pend.";
  reviewCount: number;
  missingTags: number;
  firstOpenAt: string | null;
  latestCloseAt: string | null;
  confidenceLabel: CalendarConfidenceLabel;
};

export type CalendarMonthSummary = {
  key: string;
  label: string;
  pnl: number;
  trades: number;
  redDays: number;
};

export type CalendarYearSummary = {
  key: string;
  label: string;
  pnl: number;
  trades: number;
  activeDays: number;
};

export type CalendarMonthCell = {
  key: string;
  label: string;
  dayNumber: number | null;
  trades: number;
  pnl: number;
  inMonth: boolean;
  state: "win" | "loss" | "flat" | "idle";
};

export type CalendarViewMode = "month" | "year";

export type CalendarWeekSummary = {
  key: string;
  label: string;
  pnl: number;
  trades: number;
  activeDays: number;
};

export type CalendarMonthWeekRow = {
  key: string;
  cells: CalendarMonthCell[];
  week: CalendarWeekSummary | undefined;
};

export type CalendarAnnualMonthCard = CalendarMonthSummary & {
  cells: CalendarMonthCell[];
};

export type CalendarPeriodOverview = {
  days: CalendarDayRow[];
  monthlyRows: CalendarMonthSummary[];
  yearlyRows: CalendarYearSummary[];
  monthly: CalendarMonthSummary[];
  yearly: CalendarYearSummary[];
  tradesByDay: Record<string, ClosedTrade[]>;
  monthlyByKey: Map<string, CalendarMonthSummary>;
  selectedMonthKey: string;
  selectedYear: number;
  selectedMonth: CalendarMonthSummary;
  monthCells: CalendarMonthCell[];
  activeMonthDays: CalendarDayRow[];
  activeDaysInMonth: CalendarDayRow[];
  selectedDayKey: string;
  selectedDay: CalendarDayRow | null;
  openDay: CalendarDayRow | null;
  openDayTrades: ClosedTrade[];
  annualMonths: CalendarMonthSummary[];
  annualMonthCards: CalendarAnnualMonthCard[];
  selectedPeriodPnl: number;
  selectedPeriodTrades: number;
  monthsWithTrades: number;
  latestDay: CalendarDayRow | null;
  bestPeriodDay: CalendarDayRow | null;
  worstPeriodDay: CalendarDayRow | null;
  reviewDay: CalendarDayRow | null;
  monthWeeks: CalendarWeekSummary[];
  monthWeekRows: CalendarMonthWeekRow[];
};

function getDominantMapKey<T extends string>(map: Map<T, number>, fallback: T | "Pend.") {
  return [...map.entries()].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
}

export function buildCalendarRows(workspace: WorkspaceState): CalendarDayRow[] {
  const tradeDetails = workspace.trades.reduce<
    Map<
      string,
      {
        reviewCount: number;
        missingTags: number;
        sessions: Map<TradeSession, number>;
        symbols: Map<string, number>;
        firstOpenAt: string | null;
        latestCloseAt: string | null;
      }
    >
  >((acc, trade) => {
    const current = acc.get(trade.tradingDayKey) ?? {
      reviewCount: 0,
      missingTags: 0,
      sessions: new Map<TradeSession, number>(),
      symbols: new Map<string, number>(),
      firstOpenAt: null,
      latestCloseAt: null,
    };

    const executionCount = Math.max(1, trade.executions.length);
    current.sessions.set(
      trade.session,
      (current.sessions.get(trade.session) ?? 0) + executionCount,
    );
    current.symbols.set(
      trade.symbol,
      (current.symbols.get(trade.symbol) ?? 0) + executionCount,
    );
    current.firstOpenAt =
      current.firstOpenAt === null || trade.openedAt < current.firstOpenAt
        ? trade.openedAt
        : current.firstOpenAt;
    current.latestCloseAt =
      current.latestCloseAt === null || trade.closedAt > current.latestCloseAt
        ? trade.closedAt
        : current.latestCloseAt;

    current.reviewCount += trade.executions.length
      ? trade.executions.filter((execution) => execution.netPnl < 0).length
      : trade.netPnl < 0
        ? 1
        : 0;

    if (!trade.setup) {
      current.missingTags += executionCount;
    }

    acc.set(trade.tradingDayKey, current);
    return acc;
  }, new Map());

  return [...workspace.analytics.daily]
    .toSorted((a, b) => b.tradingDayKey.localeCompare(a.tradingDayKey))
    .map((day) => {
      const detail = tradeDetails.get(day.tradingDayKey);

      return {
        ...day,
        dominantSymbol: detail ? getDominantMapKey(detail.symbols, "Pend.") : "Pend.",
        dominantSession: detail ? getDominantMapKey(detail.sessions, "Pend.") : "Pend.",
        reviewCount: detail?.reviewCount ?? 0,
        missingTags: detail?.missingTags ?? 0,
        firstOpenAt: detail?.firstOpenAt ?? null,
        latestCloseAt: detail?.latestCloseAt ?? null,
        confidenceLabel:
          day.trades >= 4 ? "Operativa" : day.trades >= 2 ? "Temprana" : "Pocas operaciones",
      };
    });
}

const MONTH_KEY_LABEL_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const CALENDAR_MONTH_LONG_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  timeZone: "UTC",
});

export function tradingDayKeyToUtcDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function monthKeyFromTradingDayKey(value: string) {
  return value.slice(0, 7);
}

export function monthKeyLabel(value: string) {
  const date = tradingDayKeyToUtcDate(`${value}-01`);
  if (!date) return value;
  return MONTH_KEY_LABEL_FORMATTER.format(date);
}

export function monthKeyFromYearMonth(year: number, monthIndex: number) {
  const date = new Date(Date.UTC(year, monthIndex, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonthKey(monthKey: string, delta: number) {
  const date = tradingDayKeyToUtcDate(`${monthKey}-01`);
  if (!date) return monthKey;

  return monthKeyFromYearMonth(date.getUTCFullYear(), date.getUTCMonth() + delta);
}

export function calendarMonthLongLabel(monthIndex: number) {
  return CALENDAR_MONTH_LONG_FORMATTER.format(new Date(Date.UTC(2026, monthIndex, 1)));
}

export function buildCalendarMonthCells<
  T extends { tradingDayKey: string; trades: number; pnl: number },
>(rows: T[], monthKey: string): CalendarMonthCell[] {
  const monthDate = tradingDayKeyToUtcDate(`${monthKey}-01`);
  if (!monthDate) return [];

  const year = monthDate.getUTCFullYear();
  const monthIndex = monthDate.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const firstWeekday = firstDay.getUTCDay();
  const totalDays = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const rowsByDay = new Map(rows.map((row) => [row.tradingDayKey, row]));
  const cells: CalendarMonthCell[] = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({
      key: `blank-${monthKey}-${index}`,
      label: "",
      dayNumber: null,
      trades: 0,
      pnl: 0,
      inMonth: false,
      state: "idle",
    });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const key = `${monthKey}-${String(day).padStart(2, "0")}`;
    const row = rowsByDay.get(key);
    const pnl = row?.pnl ?? 0;
    cells.push({
      key,
      label: key,
      dayNumber: day,
      trades: row?.trades ?? 0,
      pnl,
      inMonth: true,
      state:
        row?.trades && pnl > 0
          ? "win"
          : row?.trades && pnl < 0
            ? "loss"
            : row?.trades
              ? "flat"
              : "idle",
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      key: `blank-tail-${monthKey}-${cells.length}`,
      label: "",
      dayNumber: null,
      trades: 0,
      pnl: 0,
      inMonth: false,
      state: "idle",
    });
  }

  return cells;
}

export function buildMonthlyCalendarRows(days: CalendarDayRow[]) {
  const rows = [...days].reduce<Map<string, CalendarMonthSummary>>((acc, day) => {
      const key = monthKeyFromTradingDayKey(day.tradingDayKey);
      const label = monthKeyLabel(key);
      const current = acc.get(key) ?? { key, label, pnl: 0, trades: 0, redDays: 0 };
      current.pnl += day.pnl;
      current.trades += day.trades;
      if (day.pnl < 0) current.redDays += 1;
      acc.set(key, current);
      return acc;
    }, new Map());

  return [...rows.values()];
}

export function buildYearlyCalendarRows(days: CalendarDayRow[]) {
  const rows = [...days].reduce<Map<string, CalendarYearSummary>>((acc, day) => {
      const year = day.tradingDayKey.slice(0, 4);
      const current = acc.get(year) ?? {
        key: year,
        label: year,
        pnl: 0,
        trades: 0,
        activeDays: 0,
      };
      current.pnl += day.pnl;
      current.trades += day.trades;
      current.activeDays += 1;
      acc.set(year, current);
      return acc;
    }, new Map());

  return [...rows.values()];
}

export function buildTradesByDay(trades: ClosedTrade[]) {
  return trades.reduce<Record<string, ClosedTrade[]>>((acc, trade) => {
    acc[trade.tradingDayKey] = [...(acc[trade.tradingDayKey] ?? []), trade];
    return acc;
  }, {});
}

export function buildAnnualMonthRows(
  monthlyByKey: Map<string, CalendarMonthSummary>,
  selectedYear: number,
) {
  return Array.from({ length: 12 }, (_, index) => {
    const key = monthKeyFromYearMonth(selectedYear, index);
    const record = monthlyByKey.get(key);

    return {
      key,
      label: calendarMonthLongLabel(index),
      pnl: record?.pnl ?? 0,
      trades: record?.trades ?? 0,
      redDays: record?.redDays ?? 0,
    };
  });
}

export function buildCalendarMonthWeeks(
  monthCells: CalendarMonthCell[],
  selectedMonthKey: string,
): CalendarWeekSummary[] {
  const weeks: CalendarWeekSummary[] = [];

  for (let index = 0; index < monthCells.length; index += 7) {
    const weekCells = monthCells.slice(index, index + 7).filter((cell) => cell.inMonth);
    if (weekCells.length === 0) continue;

    weeks.push({
      key: `${selectedMonthKey}-week-${weeks.length + 1}`,
      label: `Sem ${weeks.length + 1}`,
      pnl: weekCells.reduce((sum, cell) => sum + cell.pnl, 0),
      trades: weekCells.reduce((sum, cell) => sum + cell.trades, 0),
      activeDays: weekCells.filter((cell) => cell.trades > 0).length,
    });
  }

  return weeks;
}

export function buildCalendarMonthWeekRows(
  monthCells: CalendarMonthCell[],
  monthWeeks: CalendarWeekSummary[],
  selectedMonthKey: string,
): CalendarMonthWeekRow[] {
  return Array.from({ length: Math.ceil(monthCells.length / 7) }, (_, index) => ({
    key: `${selectedMonthKey}-row-${index + 1}`,
    cells: monthCells.slice(index * 7, index * 7 + 7),
    week: monthWeeks[index],
  }));
}

export function getCalendarPeriodOverview(
  workspace: WorkspaceState,
  options: {
    selectedMonthKey?: string;
    selectedDayKey?: string;
    openDayKey?: string | null;
    viewMode?: CalendarViewMode;
  } = {},
): CalendarPeriodOverview {
  const days = buildCalendarRows(workspace);
  const monthlyRows = buildMonthlyCalendarRows(days);
  const yearlyRows = buildYearlyCalendarRows(days);
  const monthly = [...monthlyRows].toSorted((a, b) => b.key.localeCompare(a.key));
  const yearly = [...yearlyRows].toSorted((a, b) => b.key.localeCompare(a.key));
  const tradesByDay = buildTradesByDay(workspace.trades);
  const monthlyByKey = new Map(monthly.map((month) => [month.key, month]));
  const latestDay = days[0] ?? null;
  const fallbackMonthKey = latestDay
    ? monthKeyFromTradingDayKey(latestDay.tradingDayKey)
    : monthKeyFromYearMonth(new Date().getUTCFullYear(), new Date().getUTCMonth());
  const selectedMonthKey = options.selectedMonthKey || fallbackMonthKey;
  const selectedYear = Number(selectedMonthKey.slice(0, 4)) || new Date().getUTCFullYear();
  const annualMonths = buildAnnualMonthRows(monthlyByKey, selectedYear);
  const monthCells = buildCalendarMonthCells(days, selectedMonthKey);
  const activeMonthDays = days.filter(
    (day) => monthKeyFromTradingDayKey(day.tradingDayKey) === selectedMonthKey,
  );
  const defaultSelectedDayKey =
    activeMonthDays[0]?.tradingDayKey ?? latestDay?.tradingDayKey ?? "";
  const selectedDayKey = activeMonthDays.some(
    (day) => day.tradingDayKey === options.selectedDayKey,
  )
    ? options.selectedDayKey ?? defaultSelectedDayKey
    : defaultSelectedDayKey;
  const selectedDay =
    days.find((day) => day.tradingDayKey === selectedDayKey) ?? latestDay ?? null;
  const selectedMonth =
    monthlyByKey.get(selectedMonthKey) ??
    ({
      key: selectedMonthKey,
      label: monthKeyLabel(selectedMonthKey),
      pnl: 0,
      trades: 0,
      redDays: 0,
    } satisfies CalendarMonthSummary);
  const openDay = options.openDayKey
    ? days.find((day) => day.tradingDayKey === options.openDayKey) ?? null
    : selectedDay;
  const openDayTrades = openDay ? tradesByDay[openDay.tradingDayKey] ?? [] : [];
  const activeDaysInMonth = activeMonthDays.filter((day) => day.trades > 0);
  const bestPeriodDay =
    activeMonthDays.length > 0
      ? [...activeMonthDays].toSorted((a, b) => b.pnl - a.pnl)[0] ?? null
      : null;
  const worstPeriodDay =
    activeMonthDays.length > 0
      ? [...activeMonthDays].toSorted((a, b) => a.pnl - b.pnl)[0] ?? null
      : null;
  const reviewDay =
    activeMonthDays.find((day) => day.reviewCount > 0) ??
    (worstPeriodDay && worstPeriodDay.pnl < 0 ? worstPeriodDay : null);
  const monthWeeks = buildCalendarMonthWeeks(monthCells, selectedMonthKey);
  const monthWeekRows = buildCalendarMonthWeekRows(
    monthCells,
    monthWeeks,
    selectedMonthKey,
  );
  const monthsWithTrades = annualMonths.filter((month) => month.trades > 0).length;
  const selectedPeriodPnl =
    options.viewMode === "year"
      ? annualMonths.reduce((sum, month) => sum + month.pnl, 0)
      : selectedMonth.pnl;
  const selectedPeriodTrades =
    options.viewMode === "year"
      ? annualMonths.reduce((sum, month) => sum + month.trades, 0)
      : selectedMonth.trades;
  const annualMonthCards = annualMonths.map((month) => ({
    ...month,
    cells: buildCalendarMonthCells(days, month.key),
  }));

  return {
    days,
    monthlyRows,
    yearlyRows,
    monthly,
    yearly,
    tradesByDay,
    monthlyByKey,
    selectedMonthKey,
    selectedYear,
    selectedMonth,
    monthCells,
    activeMonthDays,
    activeDaysInMonth,
    selectedDayKey,
    selectedDay,
    openDay,
    openDayTrades,
    annualMonths,
    annualMonthCards,
    selectedPeriodPnl,
    selectedPeriodTrades,
    monthsWithTrades,
    latestDay,
    bestPeriodDay,
    worstPeriodDay,
    reviewDay,
    monthWeeks,
    monthWeekRows,
  };
}
