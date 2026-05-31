import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { signedTextClass } from "@/lib/domain/semantic-colors";
import { formatCurrency, formatSignedCurrency } from "@/lib/formatters/numbers";
import { cn } from "@/lib/utils";

const TRADE_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatTradeDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return TRADE_DATE_TIME_FORMATTER.format(date);
}

function formatTradeDuration(minutes: number | null) {
  if (minutes === null) return "Duración pendiente";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

function formatTradeSide(side: WorkspaceState["trades"][number]["side"]) {
  return side === "buy" ? "BUY" : "SELL";
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

type TradeDetailCardProps = {
  missingDurationCount: number;
  missingSetupCount: number;
  reviewQueueCount: number;
  selectedCosts: number;
  selectedReviewScore: number | null;
  selectedTrade: WorkspaceState["trades"][number] | null;
};

export function TradeDetailCard({
  missingDurationCount,
  missingSetupCount,
  reviewQueueCount,
  selectedCosts,
  selectedReviewScore,
  selectedTrade,
}: TradeDetailCardProps) {
  if (!selectedTrade) {
    return (
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
            ["Revisión", String(reviewQueueCount)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className="font-mono text-sm text-foreground">{value}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
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
              <span className={cn("font-mono font-semibold", signedTextClass(selectedTrade.grossPnl))}>
                {formatSignedCurrency(selectedTrade.grossPnl)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Costes</span>
              <span className="font-mono text-foreground">
                {selectedCosts > 0 ? formatCurrency(selectedCosts) : "0"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 pt-2">
              <span className="text-muted-foreground">PnL neto</span>
              <span className={cn("font-mono font-semibold", signedTextClass(selectedTrade.netPnl))}>
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
                  <span className={cn("font-mono font-semibold", signedTextClass(execution.netPnl))}>
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
            <span className={cn("font-medium", reviewPriorityTone(selectedReviewScore))}>
              {selectedReviewScore ? reviewPriorityLabel(selectedReviewScore) : "OK"}
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
  );
}
