"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Bar, BarChart, BarXAxis, ChartTooltip, Grid } from "@/components/ui/charts";
import {
  Field,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { countClosedTradeExecutions, getTradesOverview } from "@/lib/domain/trades-selectors";
import {
  formatCurrency,
  formatSignedCurrency,
} from "@/lib/formatters/numbers";
import { signedTextClass } from "@/lib/domain/semantic-colors";
import { cn } from "@/lib/utils";

type PageMotionProps = {
  children: React.ReactNode;
};

function PageMotion({ children }: PageMotionProps) {
  return <div>{children}</div>;
}

function shortDayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function signedTextTone(value: number) {
  return signedTextClass(value);
}

function reviewPriorityLabel(score: number) {
  if (score >= 5) return "Alta";
  if (score >= 3) return "Media";
  return "Baja";
}

function reviewPriorityTone(score: number | null) {
  if (score === null) return "text-profit";
  if (score >= 5) return "text-loss";
  if (score >= 3) return "text-risk";
  return "text-muted-foreground";
}

function formatTradeSide(side: WorkspaceState["trades"][number]["side"]) {
  return side === "buy" ? "BUY" : "SELL";
}

function formatTradeDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

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

function formatTradeDuration(minutes: number | null) {
  if (minutes === null) return "Duración pendiente";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

function shortMonthLabel(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
  }).format(value);
}

function formatExecutionCount(trade: WorkspaceState["trades"][number]) {
  if (trade.executions.length > 1) return `${trade.executions.length} parciales`;
  return "1 cierre";
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


export function TradesReferenceSection({
  workspace,
}: {
  workspace: WorkspaceState;
}) {
  const overview = getTradesOverview(workspace);
  const trades = overview.trades;
  const isMobile = useIsMobile();
  const activeAccount =
    workspace.accounts.find((account) => account.id === workspace.activeAccountId) ??
    workspace.accounts[0] ??
    null;
  const symbols = React.useMemo(
    () => [...new Set(trades.map((trade) => trade.symbol))].sort(),
    [trades],
  );
  const sessions = React.useMemo(
    () => [...new Set(trades.map((trade) => trade.session))].sort(),
    [trades],
  );
  const [symbolFilter, setSymbolFilter] = React.useState("all");
  const [sessionFilter, setSessionFilter] = React.useState("all");
  const [outcomeFilter, setOutcomeFilter] = React.useState<"all" | "win" | "loss" | "flat">("all");
  const [setupFilter, setSetupFilter] = React.useState<"all" | "with" | "without">("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [tablePage, setTablePage] = React.useState(0);
  const [chartRange, setChartRange] = React.useState<TradesChartRange>("12m");
  const [selectedTradeId, setSelectedTradeId] = React.useState<string | null>(
    overview.ledgerRows[0]?.trade.id ?? null,
  );

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
  const chartPeak = chartData.reduce<(typeof chartData)[number] | null>(
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
    setSymbolFilter(value ?? "all");
    setTablePage(0);
  }, []);
  const updateSessionFilter = React.useCallback((value: string | null) => {
    setSessionFilter(value ?? "all");
    setTablePage(0);
  }, []);
  const updateOutcomeFilter = React.useCallback((value: string | null) => {
    setOutcomeFilter((value as "all" | "win" | "loss" | "flat" | null) ?? "all");
    setTablePage(0);
  }, []);
  const updateSetupFilter = React.useCallback((value: string | null) => {
    setSetupFilter((value as "all" | "with" | "without" | null) ?? "all");
    setTablePage(0);
  }, []);
  const updateDateFrom = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setDateFrom(event.target.value);
      setTablePage(0);
    },
    [],
  );
  const updateDateTo = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setDateTo(event.target.value);
      setTablePage(0);
    },
    [],
  );
  const updateChartRange = React.useCallback(
    (value: string[]) => {
      const nextValue = value.find((item) => item !== chartRange) ?? value.at(-1);
      if (nextValue) {
        setChartRange(nextValue as TradesChartRange);
      }
    },
    [chartRange],
  );
  const resetFilters = React.useCallback(() => {
    setSymbolFilter("all");
    setSessionFilter("all");
    setOutcomeFilter("all");
    setSetupFilter("all");
    setDateFrom("");
    setDateTo("");
    setTablePage(0);
  }, []);

  return (
    <PageMotion>
      <div className="grid gap-4">
        <Card className="border-border/70 bg-card/70">
          <CardHeader className="pb-3">
            <CardTitle>Trades</CardTitle>
            <CardDescription>
              Operaciones cerradas con resultado, costes, parciales y estado de revisión.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {[
                [
                  "Operaciones cerradas",
                  String(overview.totalTrades),
                  activeAccount ? activeAccount.label : "Cuenta activa",
                ],
                [
                  "PnL neto",
                  formatSignedCurrency(overview.netPnl),
                  `${overview.wins}W / ${overview.losses}L`,
                ],
                ["Costes", formatCurrency(overview.costs), "Comisión + swap"],
                [
                  "Setup / etiquetas",
                  `${overview.tagCoveragePct.toFixed(0)}%`,
                  `${missingSetupCount} pendientes`,
                ],
              ].map(([label, value, note]) => (
                <div key={label} className="min-w-0">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p
                    className={cn(
                      "mt-1 truncate text-lg font-semibold text-foreground sm:text-2xl",
                      label === "PnL neto" && signedTextTone(overview.netPnl),
                    )}
                  >
                    {value}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{note}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
              <Field className="col-span-2 lg:col-span-1">
                <FieldLabel>Cuenta</FieldLabel>
                <Input
                  value={activeAccount?.label ?? "Cuenta activa"}
                  disabled
                  className="border-border/70 bg-background/40"
                />
              </Field>
              <Field className="col-span-2 min-w-0 sm:col-span-1">
                <FieldLabel>Desde</FieldLabel>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={updateDateFrom}
                  className="border-border/70 bg-background/40"
                />
              </Field>
              <Field className="col-span-2 min-w-0 sm:col-span-1">
                <FieldLabel>Hasta</FieldLabel>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={updateDateTo}
                  className="border-border/70 bg-background/40"
                />
              </Field>
              <Field className="min-w-0">
                <FieldLabel>Símbolo</FieldLabel>
                <Select value={symbolFilter} onValueChange={updateSymbolFilter}>
                  <SelectTrigger className="w-full border-border/70 bg-background/40">
                    <SelectValue>{symbolFilterLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">Todos</SelectItem>
                      {symbols.map((symbol) => (
                        <SelectItem key={symbol} value={symbol}>
                          {symbol}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field className="min-w-0">
                <FieldLabel>Sesión</FieldLabel>
                <Select value={sessionFilter} onValueChange={updateSessionFilter}>
                  <SelectTrigger className="w-full border-border/70 bg-background/40">
                    <SelectValue>{sessionFilterLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">Todas</SelectItem>
                      {sessions.map((session) => (
                        <SelectItem key={session} value={session}>
                          {session}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field className="min-w-0">
                <FieldLabel>Resultado</FieldLabel>
                <Select
                  value={outcomeFilter}
                  onValueChange={updateOutcomeFilter}
                >
                  <SelectTrigger className="w-full border-border/70 bg-background/40">
                    <SelectValue>{outcomeFilterLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">Todo</SelectItem>
                      <SelectItem value="win">Ganadoras</SelectItem>
                      <SelectItem value="loss">Perdedoras</SelectItem>
                      <SelectItem value="flat">Neutras</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field className="min-w-0">
                <FieldLabel>Setup</FieldLabel>
                <Select
                  value={setupFilter}
                  onValueChange={updateSetupFilter}
                >
                  <SelectTrigger className="w-full border-border/70 bg-background/40">
                    <SelectValue>{setupFilterLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">Todo</SelectItem>
                      <SelectItem value="with">Con setup</SelectItem>
                      <SelectItem value="without">Sin setup</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="min-w-0 border-border/70 bg-card/70">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Ledger de operaciones</CardTitle>
                  <CardDescription>
                    Mostrando {tableRangeLabel} de {filteredRows.length} posiciones visibles /{" "}
                    {visibleExecutionCount} cierres MT5 / {rowsWithPartials} con parciales.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Limpiar filtros
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              {trades.length === 0 ? (
                <div className="rounded-lg border border-border/70 bg-background/35 p-5">
                  <p className="font-medium text-foreground">Sin operaciones cerradas</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Esperando cierres reales desde MT5 para construir el ledger.
                  </p>
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="rounded-lg border border-border/70 bg-background/35 p-5">
                  <p className="font-medium text-foreground">Sin resultados con estos filtros</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Ajusta fecha, símbolo, sesión, resultado o setup para recuperar filas.
                  </p>
                </div>
              ) : (
                <>
                  <div className="hidden lg:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cierre</TableHead>
                          <TableHead>Trade</TableHead>
                          <TableHead>Sesión</TableHead>
                          <TableHead>Setup</TableHead>
                          <TableHead>Parciales</TableHead>
                          <TableHead>Costes</TableHead>
                          <TableHead>Revisión</TableHead>
                          <TableHead className="text-right">PnL neto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleLedgerRows.map((row) => {
                          const { trade } = row;
                          const isSelected = selectedTrade?.id === trade.id;

                          return (
                            <TableRow
                              key={trade.id}
                              data-state={isSelected ? "selected" : undefined}
                              className={cn(trade.netPnl < 0 && "bg-loss-muted")}
                            >
                              <TableCell>{shortDayLabel(trade.closedAt)}</TableCell>
                              <TableCell>
                                <button
                                  type="button"
                                  onClick={() => setSelectedTradeId(trade.id)}
                                  className="flex min-w-0 flex-col text-left"
                                >
                                  <span className="font-medium text-foreground">{trade.symbol}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {formatTradeSide(trade.side)} / {trade.volume} lotes
                                  </span>
                                </button>
                              </TableCell>
                              <TableCell>{trade.session}</TableCell>
                              <TableCell className="max-w-44 truncate">
                                {trade.setup ?? "Sin setup"}
                              </TableCell>
                              <TableCell>{formatExecutionCount(trade)}</TableCell>
                              <TableCell className="font-mono">
                                {row.costs > 0 ? formatCurrency(row.costs) : "0"}
                              </TableCell>
                              <TableCell>
                                <span className={cn("text-xs font-medium", reviewPriorityTone(row.reviewScore))}>
                                  {row.reviewScore ? reviewPriorityLabel(row.reviewScore) : "OK"}
                                </span>
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "text-right font-mono font-semibold",
                                  signedTextTone(trade.netPnl),
                                )}
                              >
                                {formatSignedCurrency(trade.netPnl)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="grid gap-2 lg:hidden">
                    {visibleLedgerRows.map((row) => {
                      const { trade } = row;
                      const isSelected = selectedTrade?.id === trade.id;

                      return (
                        <button
                          key={trade.id}
                          type="button"
                          onClick={() => setSelectedTradeId(trade.id)}
                          className={cn(
                            "grid gap-2 rounded-lg border border-border/70 bg-background/35 p-3 text-left",
                            isSelected && "border-zinc-300/60 bg-zinc-100/[0.06]",
                            trade.netPnl < 0 && "bg-loss-muted",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium text-foreground">
                                {trade.symbol} / {formatTradeSide(trade.side)}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {shortDayLabel(trade.closedAt)} / {trade.session} / {formatExecutionCount(trade)}
                              </p>
                            </div>
                            <span className={cn("font-mono font-semibold", signedTextTone(trade.netPnl))}>
                              {formatSignedCurrency(trade.netPnl)}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>{trade.setup ?? "Sin setup"}</span>
                            <span>Costes {row.costs > 0 ? formatCurrency(row.costs) : "0"}</span>
                            <span className={reviewPriorityTone(row.reviewScore)}>
                              Revisión {row.reviewScore ? reviewPriorityLabel(row.reviewScore) : "OK"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      Página {activeTablePage + 1} de {tablePageCount}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTablePage(Math.max(0, activeTablePage - 1))}
                        disabled={activeTablePage === 0}
                      >
                        <ChevronLeft className="size-4" />
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTablePage(Math.min(tablePageCount - 1, activeTablePage + 1))}
                        disabled={activeTablePage >= tablePageCount - 1}
                      >
                        Siguiente
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {selectedTrade ? (
            <Card className="border-border/70 bg-card/70">
              <CardHeader className="pb-3">
                <CardTitle>Detalle</CardTitle>
                <CardDescription>
                  {selectedTrade.symbol} / {formatTradeSide(selectedTrade.side)} / {selectedTrade.session}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    ["Entrada", `${selectedTrade.entryPrice}`],
                    ["Salida", `${selectedTrade.exitPrice}`],
                    ["Duración", formatTradeDuration(selectedTrade.durationMinutes)],
                    ["Volumen", `${selectedTrade.volume} lotes`],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 truncate font-mono text-sm text-foreground">{value}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="text-sm font-medium text-foreground">Resultado</p>
                  <div className="mt-3 grid gap-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Bruto</span>
                      <span className={cn("font-mono font-semibold", signedTextTone(selectedTrade.grossPnl))}>
                        {formatSignedCurrency(selectedTrade.grossPnl)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Costes</span>
                      <span className="font-mono text-foreground">
                        {selectedRow.costs > 0 ? formatCurrency(selectedRow.costs) : "0"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-2">
                      <span className="text-muted-foreground">PnL neto</span>
                      <span className={cn("font-mono font-semibold", signedTextTone(selectedTrade.netPnl))}>
                        {formatSignedCurrency(selectedTrade.netPnl)}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-foreground">Ejecuciones parciales</p>
                  <div className="mt-3 grid gap-2">
                    {selectedTrade.executions.map((execution, index) => (
                      <div key={execution.id} className="grid gap-2 py-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-foreground">Parcial {index + 1}</span>
                          <span className={cn("font-mono font-semibold", signedTextTone(execution.netPnl))}>
                            {formatSignedCurrency(execution.netPnl)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatTradeDateTime(execution.closedAt)} / {execution.volume} lotes / salida {execution.exitPrice}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2 rounded-lg border border-border/70 bg-background/35 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Setup</span>
                    <span className="text-right text-foreground">{selectedTrade.setup ?? "Pendiente"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Revisión</span>
                    <span className={cn("font-medium", reviewPriorityTone(selectedRow.reviewScore))}>
                      {selectedRow.reviewScore ? reviewPriorityLabel(selectedRow.reviewScore) : "OK"}
                    </span>
                  </div>
                </div>

                <Button
                  render={<Link href="/journal/review-queue" />}
                  nativeButton={false}
                  variant="outline"
                  className="justify-between"
                >
                  Revisar operación
                  <ChevronRight className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/70 bg-card/70">
              <CardHeader>
                <CardTitle>Datos pendientes</CardTitle>
                <CardDescription>
                  La lectura mejora cuando llegan cierres y setups desde MT5 o desde el review.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {[
                  ["Setup pendiente", String(missingSetupCount)],
                  ["Duración pendiente", String(missingDurationCount)],
                  ["Revisión", String(overview.reviewQueueCount)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="font-mono text-sm text-foreground">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="border-border/70 bg-card/70">
          <CardHeader className="pb-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div>
                <CardTitle>Actividad mensual</CardTitle>
                <CardDescription>
                  {chartRangeConfig.caption} / meses suaves indican periodos sin operaciones.
                </CardDescription>
              </div>
              <ToggleGroup
                aria-label="Rango del gráfico de trades"
                className="sm:justify-self-end"
                onValueChange={updateChartRange}
                size="sm"
                spacing={1}
                value={[chartRange]}
                variant="outline"
              >
                {TRADES_CHART_RANGES.map((range) => (
                  <ToggleGroupItem
                    className="h-10 min-w-12 sm:h-7 sm:min-w-7"
                    key={range.value}
                    value={range.value}
                  >
                    {range.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Trades visibles</p>
                <p className="mt-1 truncate text-base font-semibold text-foreground sm:text-lg">
                  {chartTradeCount}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Peak</p>
                <p className="mt-1 truncate text-base font-semibold text-foreground sm:text-lg">
                  {chartPeak ? `${chartPeak.trades} / ${chartPeak.month}` : "0 / Sin mes"}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">PnL neto</p>
                <p
                  className={cn(
                    "mt-1 truncate text-base font-semibold sm:text-lg",
                    signedTextTone(chartNetPnl),
                  )}
                >
                  {formatSignedCurrency(chartNetPnl)}
                </p>
              </div>
            </div>

            <div className="h-[300px] [--chart-1:oklch(0.82_0_0)] [--chart-3:oklch(0.45_0_0)] sm:h-[240px]">
              <BarChart
                animationDuration={1100}
                animationEasing="cubic-bezier(0.85, 0, 0.181, 0.497)"
                aspectRatio={isMobile ? "1 / 1" : "4 / 1.15"}
                barGap={0.1}
                barWidth={isMobile ? 20 : 40}
                className="h-full"
                data={chartData}
                stackGap={3}
                stacked
                xDataKey="month"
              >
                <Grid horizontal />
                <Bar
                  dataKey="desktop"
                  fadedOpacity={1}
                  fill="var(--chart-1)"
                  groupGap={4}
                  lineCap="round"
                  opacity={(point) => (point.isEmpty ? 0.22 : 1)}
                  stackGap={3}
                />
                <Bar
                  dataKey="mobile"
                  fadedOpacity={1}
                  fill="var(--chart-3)"
                  groupGap={4}
                  lineCap="round"
                  opacity={(point) => (point.isEmpty ? 0.22 : 1)}
                  stackGap={3}
                />
                <BarXAxis maxLabels={isMobile ? 6 : 12} />
                <ChartTooltip
                  rows={(point) => [
                    {
                      color: "var(--chart-label)",
                      label: "Estado",
                      value: point.isEmpty ? "Sin trades" : "Con trades",
                    },
                    {
                      color: "var(--chart-1)",
                      label: "Ganadoras",
                      value: point.isEmpty ? 0 : (point.wins as number),
                    },
                    {
                      color: "var(--chart-3)",
                      label: "Perdedoras",
                      value: point.isEmpty ? 0 : (point.losses as number),
                    },
                    {
                      color: "var(--chart-label)",
                      label: "PnL neto",
                      value: formatSignedCurrency(point.isEmpty ? 0 : (point.pnl as number)),
                    },
                  ]}
                  showCrosshair={false}
                />
              </BarChart>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageMotion>
  );
}
