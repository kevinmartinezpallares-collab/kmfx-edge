import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import {
  buildAnnualMonthRows,
  buildCalendarMonthCells,
  buildCalendarMonthWeekRows,
  buildCalendarMonthWeeks,
  buildCalendarRows,
  buildMonthlyCalendarRows,
  buildTradesByDay,
  buildYearlyCalendarRows,
  getCalendarPeriodOverview,
  monthKeyFromYearMonth,
  shiftMonthKey,
} from "@/lib/domain/calendar-selectors";

describe("calendar selectors", () => {
  it("builds day rows with review pressure and dominant context", () => {
    const days = buildCalendarRows(wave1Workspace);

    expect(days.length).toBeGreaterThan(0);
    expect(days[0]?.dominantSymbol).toBeTruthy();
    expect(days.some((day) => day.reviewCount > 0)).toBe(true);
    expect(days.every((day) => day.confidenceLabel)).toBe(true);
  });

  it("builds month cells with stable seven-column rows", () => {
    const days = buildCalendarRows(wave1Workspace);
    const cells = buildCalendarMonthCells(days, "2026-05");

    expect(cells.length % 7).toBe(0);
    expect(cells.some((cell) => cell.key === "2026-05-02" && cell.state === "win")).toBe(true);
    expect(cells.some((cell) => cell.key === "2026-05-04" && cell.trades > 0)).toBe(true);
  });

  it("summarises monthly, annual and trades-by-day data", () => {
    const days = buildCalendarRows(wave1Workspace);
    const monthly = [...buildMonthlyCalendarRows(days)];
    const yearly = [...buildYearlyCalendarRows(days)];
    const monthlyByKey = new Map(monthly.map((month) => [month.key, month]));
    const annualMonths = buildAnnualMonthRows(monthlyByKey, 2026);
    const tradesByDay = buildTradesByDay(wave1Workspace.trades);

    expect(monthly[0]?.trades).toBeGreaterThan(0);
    expect(yearly[0]?.label).toBe("2026");
    expect(annualMonths).toHaveLength(12);
    expect(tradesByDay["2026-05-04"]?.length).toBeGreaterThan(0);
  });

  it("builds week rows and period overview for the selected calendar view", () => {
    const days = buildCalendarRows(wave1Workspace);
    const cells = buildCalendarMonthCells(days, "2026-05");
    const weeks = buildCalendarMonthWeeks(cells, "2026-05");
    const weekRows = buildCalendarMonthWeekRows(cells, weeks, "2026-05");
    const overview = getCalendarPeriodOverview(wave1Workspace, {
      selectedMonthKey: "2026-05",
      selectedDayKey: "2026-05-04",
      openDayKey: "2026-05-04",
      viewMode: "month",
    });

    expect(weeks.some((week) => week.trades > 0)).toBe(true);
    expect(weekRows).toHaveLength(Math.ceil(cells.length / 7));
    expect(overview.selectedMonthKey).toBe("2026-05");
    expect(overview.selectedDay?.tradingDayKey).toBe("2026-05-04");
    expect(overview.openDayTrades.length).toBeGreaterThan(0);
    expect(overview.annualMonthCards).toHaveLength(12);
    expect(overview.selectedPeriodTrades).toBe(overview.selectedMonth.trades);
  });

  it("shifts month keys safely", () => {
    expect(monthKeyFromYearMonth(2026, 4)).toBe("2026-05");
    expect(shiftMonthKey("2026-05", 1)).toBe("2026-06");
    expect(shiftMonthKey("bad", 1)).toBe("bad");
  });
});
