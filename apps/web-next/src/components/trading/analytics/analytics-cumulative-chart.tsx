"use client";

import * as React from "react";

import {
  formatResponsiveLivelineSignedCurrency,
} from "@/lib/charts/liveline-layout";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatSignedCurrency } from "@/lib/formatters/numbers";

type AnalyticsCumulativeChartProps = {
  data: Array<{
    label: string;
    pnl: number;
  }>;
  isMobile?: boolean;
};

const RechartsCumulativeAreaChart = React.lazy(async () => {
  const {
    Area,
    AreaChart,
    CartesianGrid,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
  } = await import("recharts");

  return {
    default: function RechartsCumulativeAreaChart({
      data,
      isMobile = false,
    }: AnalyticsCumulativeChartProps) {
      return (
        <ResponsiveContainer height="100%" minHeight={0} minWidth={0} width="100%">
          <AreaChart
            data={data}
            margin={{
              left: isMobile ? 0 : 8,
              right: isMobile ? 6 : 18,
              top: 12,
              bottom: 0,
            }}
          >
            <defs>
              <linearGradient id="insightsPnlFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.26} />
                <stop offset="90%" stopColor="var(--chart-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="var(--chart-grid)"
              strokeDasharray="3 6"
              vertical={false}
              opacity={0.45}
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--chart-label)", fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--chart-label)", fontSize: 12 }}
              tickFormatter={(value) =>
                isMobile
                  ? formatResponsiveLivelineSignedCurrency(Number(value), "USD", true)
                  : formatSignedCurrency(Number(value))
              }
              width={isMobile ? 42 : 86}
            />
            <Tooltip
              cursor={{ stroke: "var(--chart-crosshair)", strokeDasharray: "4 4" }}
              contentStyle={{
                background: "var(--chart-tooltip-background)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                color: "var(--chart-tooltip-foreground)",
              }}
              formatter={(value) => [
                formatSignedCurrency(Number(value)),
                "PnL acumulado",
              ]}
            />
            <ReferenceLine y={0} stroke="var(--chart-crosshair)" strokeDasharray="4 4" />
            <Area
              type="monotone"
              dataKey="pnl"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#insightsPnlFill)"
              dot={false}
              activeDot={{
                r: 5,
                fill: "var(--chart-marker-background)",
                stroke: "var(--chart-marker-border)",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      );
    },
  };
});

function AnalyticsCumulativeChartFallback() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Cargando curva…
    </div>
  );
}

export function AnalyticsCumulativeChart({
  data,
}: AnalyticsCumulativeChartProps) {
  const isMobile = useIsMobile();

  return (
    <React.Suspense fallback={<AnalyticsCumulativeChartFallback />}>
      <RechartsCumulativeAreaChart data={data} isMobile={isMobile} />
    </React.Suspense>
  );
}
