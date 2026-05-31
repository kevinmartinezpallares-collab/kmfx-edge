"use client";

import * as React from "react";

import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { countClosedTradeExecutions, getTradesOverview } from "@/lib/domain/trades-selectors";
import { TradesActivityCard, type TradesActivityRow } from "./activity-card";
import { TradesLedgerCard } from "./ledger-card";
import { TradesSummaryFiltersCard } from "./summary-filters-card";
import { TradeDetailCard } from "./trade-detail-card";

type PageMotionProps = {
  children: React.ReactNode;
};

function PageMotion({ children }: PageMotionProps) {
  return <div>{children}</div>;
}

const SHORT_MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
});

function parseTradeDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTradingDayKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTradeClosedDate(trade: WorkspaceState["trades"][number]) {
  const closedAt = parseTradeDate(trade.closedAt);
  if (closedAt) return closedAt;

  const latestExecutionClose = trade.executions
    .map((execution) => parseTradeDate(execution.closedAt))
    .filter((date): date is Date => date !== null)
    .toSorted((a, b) => b.getTime() - a.getTime())[0];
  if (latestExecutionClose) return latestExecutionClose;

  return parseTradingDayKey(trade.tradingDayKey) ?? parseTradeDate(trade.openedAt);
}

function toTradeDateInputValue(trade: WorkspaceState["trades"][number]) {
  return getTradeClosedDate(trade)?.toISOString().slice(0, 10) ?? "";
}

function shortMonthLabel(value: Date) {
  return SHORT_MONTH_LABEL_FORMATTER.format(value);
}

function tradeOutcomeMatches(
  netPnl: number,
  outcome: "all" | "win" | "loss" | "flat",
) {
  if (outcome === "win") return netPnl > 0;
  if (outcome === "loss") return netPnl < 0;
  if (outcome === "flat") return netPnl === 0;
  return true;
}

type TradesChartRange = "3m" | "6m" | "12m" | "ytd";
type TradesOutcomeFilter = "all" | "win" | "loss" | "flat";
type TradesSetupFilter = "all" | "with" | "without";

type TradesUiState = {
  chartRange: TradesChartRange;
  dateFrom: string;
  dateTo: string;
  outcomeFilter: TradesOutcomeFilter;
  selectedTradeId: string | null;
  sessionFilter: string;
  setupFilter: TradesSetupFilter;
  symbolFilter: string;
  tablePage: number;
};

type TradesUiAction =
  | { type: "resetFilters" }
  | { type: "selectTrade"; tradeId: string }
  | { type: "setChartRange"; chartRange: TradesChartRange }
  | { type: "setDateFrom"; dateFrom: string }
  | { type: "setDateTo"; dateTo: string }
  | { type: "setOutcomeFilter"; outcomeFilter: TradesOutcomeFilter }
  | { type: "setSessionFilter"; sessionFilter: string }
  | { type: "setSetupFilter"; setupFilter: TradesSetupFilter }
  | { type: "setSymbolFilter"; symbolFilter: string }
  | { type: "setTablePage"; tablePage: number };

function createInitialTradesUiState(
  selectedTradeId: string | null,
): TradesUiState {
  return {
    chartRange: "12m",
    dateFrom: "",
    dateTo: "",
    outcomeFilter: "all",
    selectedTradeId,
    sessionFilter: "all",
    setupFilter: "all",
    symbolFilter: "all",
    tablePage: 0,
  };
}

function tradesUiReducer(
  state: TradesUiState,
  action: TradesUiAction,
): TradesUiState {
  switch (action.type) {
    case "resetFilters":
      return {
        ...state,
        dateFrom: "",
        dateTo: "",
        outcomeFilter: "all",
        sessionFilter: "all",
        setupFilter: "all",
        symbolFilter: "all",
        tablePage: 0,
      };
    case "selectTrade":
      return { ...state, selectedTradeId: action.tradeId };
    case "setChartRange":
      return { ...state, chartRange: action.chartRange };
    case "setDateFrom":
      return { ...state, dateFrom: action.dateFrom, tablePage: 0 };
    case "setDateTo":
      return { ...state, dateTo: action.dateTo, tablePage: 0 };
    case "setOutcomeFilter":
      return { ...state, outcomeFilter: action.outcomeFilter, tablePage: 0 };
    case "setSessionFilter":
      return { ...state, sessionFilter: action.sessionFilter, tablePage: 0 };
    case "setSetupFilter":
      return { ...state, setupFilter: action.setupFilter, tablePage: 0 };
    case "setSymbolFilter":
      return { ...state, symbolFilter: action.symbolFilter, tablePage: 0 };
    case "setTablePage":
      return { ...state, tablePage: action.tablePage };
  }
}

const TRADES_CHART_RANGES: Array<{
  value: TradesChartRange;
  label: string;
  caption: string;
}> = [
  { value: "3m", label: "3M", caption: "Trades cerrados en los últimos 3 meses" },
  { value: "6m", label: "6M", caption: "Trades cerrados en los últimos 6 meses" },
  { value: "12m", label: "12M", caption: "Trades cerrados en los últimos 12 meses" },
  { value: "ytd", label: "YTD", caption: "Trades cerrados en YTD" },
];


function useTradesReferenceModel(workspace: WorkspaceState) {
  const overview = getTradesOverview(workspace);
  const trades = overview.trades;
  const activeAccount =
    workspace.accounts.find((account) => account.id === workspace.activeAccountId) ??
    workspace.accounts[0] ??
    null;
  const symbols = React.useMemo(
    () => [...new Set(trades.map((trade) => trade.symbol))].toSorted(),
    [trades],
  );
  const sessions = React.useMemo(
    () => [...new Set(trades.map((trade) => trade.session))].toSorted(),
    [trades],
  );
  const [tradesUiState, dispatchTradesUi] = React.useReducer(
    tradesUiReducer,
    overview.ledgerRows[0]?.trade.id ?? null,
    createInitialTradesUiState,
  );
  const {
    chartRange,
    dateFrom,
    dateTo,
    outcomeFilter,
    selectedTradeId,
    sessionFilter,
    setupFilter,
    symbolFilter,
    tablePage,
  } = tradesUiState;

  const filteredRows = React.useMemo(
    () =>
      overview.ledgerRows.filter((row) => {
        const { trade } = row;
        const closedDay = toTradeDateInputValue(trade);
        const matchesDateFrom = !dateFrom || (closedDay && closedDay >= dateFrom);
        const matchesDateTo = !dateTo || (closedDay && closedDay <= dateTo);
        const matchesSymbol = symbolFilter === "all" || trade.symbol === symbolFilter;
        const matchesSession = sessionFilter === "all" || trade.session === sessionFilter;
        const matchesOutcome = tradeOutcomeMatches(trade.netPnl, outcomeFilter);
        const matchesSetup =
          setupFilter === "all" ||
          (setupFilter === "with" && Boolean(trade.setup)) ||
          (setupFilter === "without" && !trade.setup);

        return (
          matchesDateFrom &&
          matchesDateTo &&
          matchesSymbol &&
          matchesSession &&
          matchesOutcome &&
          matchesSetup
        );
      }),
    [
      dateFrom,
      dateTo,
      outcomeFilter,
      overview.ledgerRows,
      sessionFilter,
      setupFilter,
      symbolFilter,
    ],
  );
  const selectedRow =
    filteredRows.find((row) => row.trade.id === selectedTradeId) ??
    filteredRows[0] ??
    null;
  const selectedTrade = selectedRow?.trade ?? null;
  const missingSetupCount = trades.reduce(
    (sum, trade) => sum + (!trade.setup ? Math.max(1, trade.executions.length) : 0),
    0,
  );
  const missingDurationCount = trades.filter((trade) => trade.durationMinutes === null).length;
  const rowsWithPartials = filteredRows.filter((row) => row.trade.executions.length > 1).length;
  const visibleExecutionCount = countClosedTradeExecutions(
    filteredRows.map((row) => row.trade),
  );
  const chartData = React.useMemo(() => {
    const validCloseTimes = filteredRows
      .map((row) => getTradeClosedDate(row.trade)?.getTime())
      .filter((value): value is number => typeof value === "number");

    const latestDate = validCloseTimes.length
      ? new Date(Math.max(...validCloseTimes))
      : new Date();
    const latestMonthStart = new Date(latestDate.getFullYear(), latestDate.getMonth(), 1);
    const monthCount = chartRange === "ytd" ? 12 : Number.parseInt(chartRange, 10);
    const rows = Array.from({ length: monthCount }).map((_, index) => {
      const date =
        chartRange === "ytd"
          ? new Date(latestDate.getFullYear(), index, 1)
          : new Date(latestMonthStart);
      if (chartRange !== "ytd") {
        date.setMonth(latestMonthStart.getMonth() - (monthCount - 1 - index));
      }
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      return {
        key,
        month: shortMonthLabel(date),
        desktop: 0,
        mobile: 0,
        wins: 0,
        losses: 0,
        pnl: 0,
        trades: 0,
        isNoData: true,
        isEmpty: true,
      };
    });
    const rowByKey = new Map(rows.map((row) => [row.key, row]));

    filteredRows.forEach((row) => {
      const closedDate = getTradeClosedDate(row.trade);
      if (!closedDate) return;

      const key = `${closedDate.getFullYear()}-${String(closedDate.getMonth() + 1).padStart(2, "0")}`;
      const chartRow = rowByKey.get(key);
      if (!chartRow) return;
      const netPnls = row.trade.executions.length
        ? row.trade.executions.map((execution) => execution.netPnl)
        : [row.trade.netPnl];

      netPnls.forEach((netPnl) => {
        if (netPnl >= 0) {
          chartRow.desktop += 1;
          chartRow.wins += 1;
        } else {
          chartRow.mobile += 1;
          chartRow.losses += 1;
        }
        chartRow.trades += 1;
      });
      chartRow.pnl += row.trade.netPnl;
      chartRow.isNoData = false;
      chartRow.isEmpty = false;
    });

    const filledRows = rows.filter((row) => !row.isNoData);
    const avgDesktop = filledRows.length
      ? Math.round(filledRows.reduce((sum, row) => sum + row.desktop, 0) / filledRows.length)
      : 1;
    const avgMobile = filledRows.length
      ? Math.round(filledRows.reduce((sum, row) => sum + row.mobile, 0) / filledRows.length)
      : 1;
    const placeholderDesktop = Math.max(1, avgDesktop);
    const placeholderMobile = Math.max(1, avgMobile);
    const hasNoDataMonth = rows.some((row) => row.isNoData);
    rows.forEach((row, index) => {
      if (row.isNoData || (!hasNoDataMonth && index === 0)) {
        row.desktop = placeholderDesktop;
        row.mobile = placeholderMobile;
        row.isEmpty = true;
      }
    });

    return rows;
  }, [chartRange, filteredRows]);
  const chartRangeConfig =
    TRADES_CHART_RANGES.find((range) => range.value === chartRange) ?? TRADES_CHART_RANGES[2];
  const chartTradeCount = chartData.reduce((sum, row) => sum + (row.isEmpty ? 0 : row.trades), 0);
  const chartNetPnl = chartData.reduce((sum, row) => sum + (row.isEmpty ? 0 : row.pnl), 0);
  const chartPeak = chartData.reduce<TradesActivityRow | null>(
    (peak, row) => (!row.isEmpty && (!peak || row.trades > peak.trades) ? row : peak),
    null,
  );
  const tablePageSize = 12;
  const tablePageCount = Math.max(1, Math.ceil(filteredRows.length / tablePageSize));
  const activeTablePage = Math.min(tablePage, tablePageCount - 1);
  const tableStart = activeTablePage * tablePageSize;
  const visibleLedgerRows = filteredRows.slice(tableStart, tableStart + tablePageSize);
  const tableRangeLabel = filteredRows.length
    ? `${tableStart + 1}-${Math.min(tableStart + tablePageSize, filteredRows.length)}`
    : "0";
  const symbolFilterLabel = symbolFilter === "all" ? "Todos" : symbolFilter;
  const sessionFilterLabel = sessionFilter === "all" ? "Todas" : sessionFilter;
  const outcomeFilterLabel =
    outcomeFilter === "all"
      ? "Todo"
      : outcomeFilter === "win"
        ? "Ganadoras"
        : outcomeFilter === "loss"
          ? "Perdedoras"
          : "Neutras";
  const setupFilterLabel =
    setupFilter === "all" ? "Todo" : setupFilter === "with" ? "Con setup" : "Sin setup";
  const updateSymbolFilter = React.useCallback((value: string | null) => {
    dispatchTradesUi({ type: "setSymbolFilter", symbolFilter: value ?? "all" });
  }, []);
  const updateSessionFilter = React.useCallback((value: string | null) => {
    dispatchTradesUi({ type: "setSessionFilter", sessionFilter: value ?? "all" });
  }, []);
  const updateOutcomeFilter = React.useCallback((value: string | null) => {
    dispatchTradesUi({
      type: "setOutcomeFilter",
      outcomeFilter: (value as TradesOutcomeFilter | null) ?? "all",
    });
  }, []);
  const updateSetupFilter = React.useCallback((value: string | null) => {
    dispatchTradesUi({
      type: "setSetupFilter",
      setupFilter: (value as TradesSetupFilter | null) ?? "all",
    });
  }, []);
  const updateDateFrom = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      dispatchTradesUi({ type: "setDateFrom", dateFrom: event.target.value });
    },
    [],
  );
  const updateDateTo = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      dispatchTradesUi({ type: "setDateTo", dateTo: event.target.value });
    },
    [],
  );
  const updateChartRange = React.useCallback(
    (value: string[]) => {
      const nextValue = value.find((item) => item !== chartRange) ?? value.at(-1);
      if (nextValue) {
        dispatchTradesUi({
          type: "setChartRange",
          chartRange: nextValue as TradesChartRange,
        });
      }
    },
    [chartRange],
  );
  const resetFilters = React.useCallback(() => {
    dispatchTradesUi({ type: "resetFilters" });
  }, []);
  const selectTrade = React.useCallback((tradeId: string) => {
    dispatchTradesUi({ type: "selectTrade", tradeId });
  }, []);
  const setTablePage = React.useCallback((nextTablePage: number) => {
    dispatchTradesUi({ type: "setTablePage", tablePage: nextTablePage });
  }, []);

  return {
    activeAccount,
    activeTablePage,
    chartData,
    chartNetPnl,
    chartPeak,
    chartRange,
    chartRangeConfig,
    chartTradeCount,
    dateFrom,
    dateTo,
    filteredRows,
    missingDurationCount,
    missingSetupCount,
    outcomeFilter,
    outcomeFilterLabel,
    resetFilters,
    selectTrade,
    selectedRow,
    selectedTrade,
    sessionFilter,
    sessionFilterLabel,
    sessions,
    setTablePage,
    setupFilter,
    setupFilterLabel,
    symbolFilter,
    symbolFilterLabel,
    symbols,
    tablePageCount,
    tableRangeLabel,
    trades,
    updateChartRange,
    updateDateFrom,
    updateDateTo,
    updateOutcomeFilter,
    updateSessionFilter,
    updateSetupFilter,
    updateSymbolFilter,
    visibleExecutionCount,
    visibleLedgerRows,
    rowsWithPartials,
    overview,
  };
}

export function TradesReferenceSection({
  workspace,
}: {
  workspace: WorkspaceState;
}) {
  const {
    activeAccount,
    activeTablePage,
    chartData,
    chartNetPnl,
    chartPeak,
    chartRange,
    chartRangeConfig,
    chartTradeCount,
    dateFrom,
    dateTo,
    filteredRows,
    missingDurationCount,
    missingSetupCount,
    outcomeFilter,
    outcomeFilterLabel,
    resetFilters,
    selectTrade,
    selectedRow,
    selectedTrade,
    sessionFilter,
    sessionFilterLabel,
    sessions,
    setTablePage,
    setupFilter,
    setupFilterLabel,
    symbolFilter,
    symbolFilterLabel,
    symbols,
    tablePageCount,
    tableRangeLabel,
    trades,
    updateChartRange,
    updateDateFrom,
    updateDateTo,
    updateOutcomeFilter,
    updateSessionFilter,
    updateSetupFilter,
    updateSymbolFilter,
    visibleExecutionCount,
    visibleLedgerRows,
    rowsWithPartials,
    overview,
  } = useTradesReferenceModel(workspace);

  return (
    <PageMotion>
      <div className="grid gap-4">
        <TradesSummaryFiltersCard
          accountLabel={activeAccount?.label ?? "Cuenta activa"}
          costs={overview.costs}
          dateFrom={dateFrom}
          dateTo={dateTo}
          losses={overview.losses}
          missingSetupCount={missingSetupCount}
          netPnl={overview.netPnl}
          onDateFromChange={updateDateFrom}
          onDateToChange={updateDateTo}
          onOutcomeFilterChange={updateOutcomeFilter}
          onSessionFilterChange={updateSessionFilter}
          onSetupFilterChange={updateSetupFilter}
          onSymbolFilterChange={updateSymbolFilter}
          outcomeFilter={outcomeFilter}
          outcomeFilterLabel={outcomeFilterLabel}
          sessionFilter={sessionFilter}
          sessionFilterLabel={sessionFilterLabel}
          sessions={sessions}
          setupFilter={setupFilter}
          setupFilterLabel={setupFilterLabel}
          symbolFilter={symbolFilter}
          symbolFilterLabel={symbolFilterLabel}
          symbols={symbols}
          tagCoveragePct={overview.tagCoveragePct}
          totalTrades={overview.totalTrades}
          wins={overview.wins}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <TradesLedgerCard
            activeTablePage={activeTablePage}
            filteredRowsLength={filteredRows.length}
            onResetFilters={resetFilters}
            onSelectTrade={selectTrade}
            onSetTablePage={setTablePage}
            rowsWithPartials={rowsWithPartials}
            selectedTradeId={selectedTrade?.id ?? null}
            tablePageCount={tablePageCount}
            tableRangeLabel={tableRangeLabel}
            tradesCount={trades.length}
            visibleExecutionCount={visibleExecutionCount}
            visibleLedgerRows={visibleLedgerRows}
          />

          <TradeDetailCard
            missingDurationCount={missingDurationCount}
            missingSetupCount={missingSetupCount}
            reviewQueueCount={overview.reviewQueueCount}
            selectedCosts={selectedRow?.costs ?? 0}
            selectedReviewScore={selectedRow?.reviewScore ?? null}
            selectedTrade={selectedTrade}
          />
        </div>

        <TradesActivityCard
          chartData={chartData}
          chartNetPnl={chartNetPnl}
          chartPeak={chartPeak}
          chartRange={chartRange}
          chartRangeCaption={chartRangeConfig.caption}
          chartTradeCount={chartTradeCount}
          onChartRangeChange={updateChartRange}
          ranges={TRADES_CHART_RANGES}
        />
      </div>
    </PageMotion>
  );
}
