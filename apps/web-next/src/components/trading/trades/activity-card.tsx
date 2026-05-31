import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, BarXAxis, ChartTooltip, Grid } from "@/components/ui/charts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { signedTextClass } from "@/lib/domain/semantic-colors";
import { formatSignedCurrency } from "@/lib/formatters/numbers";
import { cn } from "@/lib/utils";

type TradesChartRange = "3m" | "6m" | "12m" | "ytd";

export type TradesActivityRow = {
  desktop: number;
  isEmpty: boolean;
  isNoData: boolean;
  key: string;
  losses: number;
  mobile: number;
  month: string;
  pnl: number;
  trades: number;
  wins: number;
};

type TradesActivityRangeOption = {
  caption: string;
  label: string;
  value: TradesChartRange;
};

type TradesActivityCardProps = {
  chartData: TradesActivityRow[];
  chartNetPnl: number;
  chartPeak: TradesActivityRow | null;
  chartRange: TradesChartRange;
  chartRangeCaption: string;
  chartTradeCount: number;
  ranges: TradesActivityRangeOption[];
  onChartRangeChange: (value: string[]) => void;
};

export function TradesActivityCard({
  chartData,
  chartNetPnl,
  chartPeak,
  chartRange,
  chartRangeCaption,
  chartTradeCount,
  ranges,
  onChartRangeChange,
}: TradesActivityCardProps) {
  const isMobile = useIsMobile();

  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader className="pb-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div>
            <CardTitle>Actividad mensual</CardTitle>
            <CardDescription>
              {chartRangeCaption} / meses suaves indican periodos sin operaciones.
            </CardDescription>
          </div>
          <ToggleGroup
            aria-label="Rango del gráfico de trades"
            className="sm:justify-self-end"
            onValueChange={onChartRangeChange}
            size="sm"
            spacing={1}
            value={[chartRange]}
            variant="outline"
          >
            {ranges.map((range) => (
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
                signedTextClass(chartNetPnl),
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
  );
}
