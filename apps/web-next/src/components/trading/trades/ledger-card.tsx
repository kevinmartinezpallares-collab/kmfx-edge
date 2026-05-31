import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { signedTextClass } from "@/lib/domain/semantic-colors";
import { formatCurrency, formatSignedCurrency } from "@/lib/formatters/numbers";
import { cn } from "@/lib/utils";

const SHORT_DAY_LABEL_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
});

function shortDayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return SHORT_DAY_LABEL_FORMATTER.format(date);
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

function formatExecutionCount(trade: WorkspaceState["trades"][number]) {
  if (trade.executions.length > 1) return `${trade.executions.length} parciales`;
  return "1 cierre";
}

export type TradesLedgerRow = {
  costs: number;
  reviewScore: number | null;
  trade: WorkspaceState["trades"][number];
};

type TradesLedgerCardProps = {
  activeTablePage: number;
  filteredRowsLength: number;
  onResetFilters: () => void;
  onSelectTrade: (tradeId: string) => void;
  onSetTablePage: (tablePage: number) => void;
  rowsWithPartials: number;
  selectedTradeId: string | null;
  tablePageCount: number;
  tableRangeLabel: string;
  tradesCount: number;
  visibleExecutionCount: number;
  visibleLedgerRows: TradesLedgerRow[];
};

export function TradesLedgerCard({
  activeTablePage,
  filteredRowsLength,
  onResetFilters,
  onSelectTrade,
  onSetTablePage,
  rowsWithPartials,
  selectedTradeId,
  tablePageCount,
  tableRangeLabel,
  tradesCount,
  visibleExecutionCount,
  visibleLedgerRows,
}: TradesLedgerCardProps) {
  return (
    <Card className="min-w-0 border-border/70 bg-card/70">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Ledger de operaciones</CardTitle>
            <CardDescription>
              Mostrando {tableRangeLabel} de {filteredRowsLength} posiciones visibles /{" "}
              {visibleExecutionCount} cierres MT5 / {rowsWithPartials} con parciales.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onResetFilters}>
            Limpiar filtros
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {tradesCount === 0 ? (
          <div className="rounded-lg border border-border/70 bg-background/35 p-5">
            <p className="font-medium text-foreground">Sin operaciones cerradas</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Esperando cierres reales desde MT5 para construir el ledger.
            </p>
          </div>
        ) : filteredRowsLength === 0 ? (
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
                    const isSelected = selectedTradeId === trade.id;

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
                            onClick={() => onSelectTrade(trade.id)}
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
                            signedTextClass(trade.netPnl),
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
                const isSelected = selectedTradeId === trade.id;

                return (
                  <button
                    key={trade.id}
                    type="button"
                    onClick={() => onSelectTrade(trade.id)}
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
                      <span className={cn("font-mono font-semibold", signedTextClass(trade.netPnl))}>
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
                  onClick={() => onSetTablePage(Math.max(0, activeTablePage - 1))}
                  disabled={activeTablePage === 0}
                >
                  <ChevronLeft className="size-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSetTablePage(Math.min(tablePageCount - 1, activeTablePage + 1))}
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
  );
}
