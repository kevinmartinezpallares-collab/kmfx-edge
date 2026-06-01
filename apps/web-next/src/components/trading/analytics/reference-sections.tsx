"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DailyTradeBucket } from "@/lib/contracts/trade";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import {
  buildInsightActionFindings,
  buildInsightAttribution,
  getAnalyticsDailyOverview,
  getAnalyticsHourlyOverview,
  getAnalyticsReadiness,
} from "@/lib/domain/analytics-selectors";
import { getReviewAction } from "@/lib/domain/review-selectors";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/formatters/numbers";
import { signedTextClass } from "@/lib/domain/semantic-colors";
import { cn } from "@/lib/utils";

const AnalyticsCumulativeChart = dynamic(
  () =>
    import("@/components/trading/analytics/analytics-cumulative-chart").then(
      (mod) => mod.AnalyticsCumulativeChart,
    ),
  {
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Cargando curva…
      </div>
    ),
    ssr: false,
  },
);

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
const MONTH_TITLE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function shortDayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return SHORT_DAY_LABEL_FORMATTER.format(date);
}


function signedTextTone(value: number) {
  return signedTextClass(value);
}

function insightFindingClasses(tone: "positive" | "negative" | "warning" | "neutral") {
  return cn(
    tone === "positive" && "text-profit",
    tone === "negative" && "text-loss",
    tone === "warning" && "text-risk",
    tone === "neutral" && "text-foreground",
  );
}

function readableSampleLabel(label: string) {
  return label;
}

function formatOperationCount(count: number) {
  return `${count} ${count === 1 ? "operación" : "operaciones"}`;
}

function buildTradeDistributionPerformance(trades: WorkspaceState["trades"]) {
  const netPnls = trades.flatMap((trade) =>
    trade.executions.length
      ? trade.executions.map((execution) => execution.netPnl)
      : [trade.netPnl],
  );
  const totalTrades = netPnls.length;
  const winCount = netPnls.filter((netPnl) => netPnl >= 0).length;
  const lossCount = netPnls.filter((netPnl) => netPnl < 0).length;
  const grossProfit = netPnls
    .filter((netPnl) => netPnl > 0)
    .reduce((sum, netPnl) => sum + netPnl, 0);
  const grossLoss = Math.abs(
    netPnls.filter((netPnl) => netPnl < 0).reduce((sum, netPnl) => sum + netPnl, 0),
  );
  const netProfit = netPnls.reduce((sum, netPnl) => sum + netPnl, 0);

  return {
    expectancy: totalTrades > 0 ? netProfit / totalTrades : 0,
    lossCount,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? grossProfit : 0,
    totalTrades,
    winCount,
    winRatePct: totalTrades > 0 ? (winCount / totalTrades) * 100 : 0,
  };
}

const insightChartColors = {
  neutralStrong: "var(--chart-1)",
  neutral: "var(--chart-2)",
  neutralMuted: "var(--chart-3)",
  inactive: "color-mix(in srgb, var(--chart-background) 72%, transparent)",
  grid: "var(--chart-grid)",
  panel: "color-mix(in srgb, var(--chart-background) 54%, transparent)",
  profit: "var(--profit)",
  profitMuted: "var(--profit-muted)",
  loss: "var(--loss)",
  lossMuted: "var(--loss-muted)",
};

const SESSION_SIGNAL_PALETTE = [
  insightChartColors.neutralStrong,
  insightChartColors.neutral,
  insightChartColors.neutralMuted,
];
const RISK_LOSS_BUDGET_PALETTE = [
  insightChartColors.neutralStrong,
  insightChartColors.neutral,
  insightChartColors.neutralMuted,
  insightChartColors.inactive,
];
const WEEK_DAY_ROWS = [
  { key: 1, label: "Lun" },
  { key: 2, label: "Mar" },
  { key: 3, label: "Mié" },
  { key: 4, label: "Jue" },
  { key: 5, label: "Vie" },
  { key: 6, label: "Sáb" },
  { key: 0, label: "Dom" },
];

function SessionSignalMap({
  rows,
}: {
  rows: Array<{ label: string; trades: number; pnl: number }>;
}) {
  const visibleRows = rows.length > 0 ? rows : [{ label: "Sin sesión", trades: 0, pnl: 0 }];
  const totalAbs = Math.max(
    visibleRows.reduce((sum, row) => sum + Math.abs(row.pnl), 0),
    1,
  );
  const orderedRows = [...visibleRows].toSorted((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
  const chartRows = orderedRows.map((row, index) => ({
    ...row,
    value: Math.max(Math.abs(row.pnl), 0.01),
    sharePct: (Math.abs(row.pnl) / totalAbs) * 100,
    color:
      row.pnl < 0
        ? insightChartColors.loss
        : SESSION_SIGNAL_PALETTE[index] ?? insightChartColors.neutralMuted,
  }));
  const [selectedSessionLabel, setSelectedSessionLabel] = React.useState(
    chartRows[0]?.label ?? "",
  );
  const selectedRow =
    chartRows.find((row) => row.label === selectedSessionLabel) ?? chartRows[0] ?? null;
  const selectedTone =
    (selectedRow?.pnl ?? 0) > 0
      ? "positive"
      : (selectedRow?.pnl ?? 0) < 0
        ? "negative"
        : "neutral";
  const donutStops = chartRows.reduce(
    (acc, row) => {
      const start = acc.cursor;
      const end = Math.min(100, acc.cursor + row.sharePct);

      return {
        cursor: end,
        stops: [...acc.stops, `${row.color} ${start}% ${end}%`],
      };
    },
    { cursor: 0, stops: [] as string[] },
  ).stops.join(", ");
  const selectedIndex = Math.max(
    0,
    chartRows.findIndex((row) => row.label === selectedRow?.label),
  );

  return (
    <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
      <div className="relative grid min-h-[220px] place-items-center">
        <button
          type="button"
          onClick={() => setSelectedSessionLabel(chartRows[(selectedIndex + 1) % chartRows.length]?.label ?? "")}
          className="relative grid size-[184px] place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            background: `conic-gradient(from -90deg, ${donutStops || insightChartColors.inactive})`,
          }}
          aria-label="Cambiar sesión seleccionada"
        >
          <span className="absolute inset-4 rounded-full border border-border/60 bg-card" />
          <span className="absolute inset-0 rounded-full ring-1 ring-border/70" />
        </button>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div className="max-w-[128px]">
            <p className="truncate text-sm font-semibold text-foreground">
              {selectedRow?.label ?? "Sin sesión"}
            </p>
            <p className={cn("mt-1 font-mono text-lg font-semibold", insightFindingClasses(selectedTone))}>
              {selectedRow ? formatSignedCurrency(selectedRow.pnl) : "0 US$"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedRow ? formatPercent(selectedRow.sharePct, 0) : "0%"}
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-2">
        {chartRows.map((row) => {
        const tone =
          row.pnl > 0 ? "positive" : row.pnl < 0 ? "negative" : "neutral";
        const isSelected = selectedRow?.label === row.label;

        return (
          <button
            key={row.label}
            type="button"
            onClick={() => setSelectedSessionLabel(row.label)}
            onMouseEnter={() => setSelectedSessionLabel(row.label)}
            className={cn(
              "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-border/55 py-3 text-left transition first:border-t-0 first:pt-0",
              isSelected && "bg-muted/25 px-2",
            )}
	          >
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ background: row.color }}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{row.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{formatOperationCount(row.trades)}</p>
            </div>
            <div className="ml-auto text-right">
              <p className={cn("font-mono text-sm font-semibold", insightFindingClasses(tone))}>
                {formatSignedCurrency(row.pnl)}
              </p>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                {formatPercent(row.sharePct, 0)}
              </p>
            </div>
          </button>
        );
      })}
      </div>
    </div>
  );
}

function AttributionSignalMap({
  rows,
}: {
  rows: Array<{ label: string; trades: number; pnl: number; wins?: number; losses?: number }>;
}) {
  const visibleRows = rows.length > 0 ? rows : [{ label: "Sin datos", trades: 0, pnl: 0 }];
  const maxAbs = Math.max(...visibleRows.map((row) => Math.abs(row.pnl)), 1);
  const columnCount = 16;

  return (
    <div className="grid gap-5">
      <div className="grid min-h-[236px] grid-cols-5 items-end gap-3 border-y border-border/55 py-5">
        {visibleRows.slice(0, 5).map((row) => {
          const activeSegments = Math.max(
            row.pnl === 0 ? 0 : 2,
            Math.round((Math.abs(row.pnl) / maxAbs) * columnCount),
          );
          const tone =
            row.pnl > 0 ? "positive" : row.pnl < 0 ? "negative" : "neutral";

          return (
            <div key={row.label} className="grid min-w-0 gap-3">
              <div className="flex h-40 flex-col-reverse items-center gap-1">
                {Array.from({ length: columnCount }, (_, segmentIndex) => (
                  <span
                    key={segmentIndex}
                    className={cn(
                      "h-1.5 w-full max-w-12 rounded-sm",
                    )}
                    style={{
                      background:
                        segmentIndex < activeSegments
                          ? tone === "negative"
                            ? insightChartColors.loss
                            : insightChartColors.neutral
                          : insightChartColors.inactive,
                      opacity: segmentIndex < activeSegments ? 0.76 : 1,
                    }}
                    aria-hidden="true"
                  />
                ))}
              </div>
              <div className="min-w-0 text-center">
                <p className="truncate text-xs font-medium text-foreground">{row.label}</p>
                <p className={cn("mt-1 font-mono text-[11px] font-semibold", insightFindingClasses(tone))}>
                  {formatSignedCurrency(row.pnl)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid gap-2">
        {visibleRows.slice(0, 5).map((row, index) => {
          const tone =
            row.pnl > 0 ? "positive" : row.pnl < 0 ? "negative" : "neutral";
          const winRate =
            row.wins !== undefined && row.trades > 0
              ? Math.round((row.wins / row.trades) * 100)
              : null;

          return (
            <div
              key={row.label}
              className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 border-t border-border/55 py-2 first:border-t-0 first:pt-0"
            >
              <span className="font-mono text-xs text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{row.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatOperationCount(row.trades)}{winRate !== null ? ` / WR ${winRate}%` : ""}
                </p>
              </div>
              <span className={cn("font-mono text-sm font-semibold", insightFindingClasses(tone))}>
                {formatSignedCurrency(row.pnl)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RiskLossBudgetChart({
  rows,
  totalLoss,
}: {
  rows: Array<{
    label: string;
    pnl: number;
    trades: number;
    losses: number;
    lossAmount: number;
    lossSharePct: number;
  }>;
  totalLoss: number;
}) {
  const lossRows = rows.filter((row) => row.losses > 0 && row.lossAmount > 0);
  const topRows = lossRows.slice(0, 3);
  const shownLoss = topRows.reduce((sum, row) => sum + row.lossAmount, 0);
  const remainderLoss = Math.max(0, totalLoss - shownLoss);
  const chartRows =
    remainderLoss > 0
      ? [
          ...topRows,
          {
            label: "Resto",
            pnl: -remainderLoss,
            trades: 0,
            losses: 0,
            lossAmount: remainderLoss,
            lossSharePct: totalLoss > 0 ? (remainderLoss / totalLoss) * 100 : 0,
          },
        ]
      : topRows;
  if (totalLoss <= 0 || chartRows.length === 0) {
    return (
      <div className="border-y border-border/60 py-5 text-sm text-muted-foreground">
        Sin pérdida cerrada para repartir por sesión.
      </div>
    );
  }

  return (
    <div className="border-y border-border/60 py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Pérdida cerrada</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-foreground">
            {formatCurrency(totalLoss)}
          </p>
        </div>
        <p className="max-w-[260px] text-sm leading-relaxed text-muted-foreground sm:text-right">
          Reparto por sesión para localizar dónde se acumuló el daño antes de subir riesgo.
        </p>
      </div>

      <div className="mt-8 grid gap-3">
        <div className="grid gap-2" style={{ gridTemplateColumns: chartRows.map((row) => `${Math.max(row.lossSharePct, 5)}fr`).join(" ") }}>
          {chartRows.map((row) => (
            <div key={row.label} className="min-w-0">
              <p className="mb-3 font-mono text-sm text-muted-foreground">
                {formatPercent(row.lossSharePct, 0)}
              </p>
              <div
                className="h-8 rounded-full"
                style={{
                  background:
                    RISK_LOSS_BUDGET_PALETTE[chartRows.indexOf(row)] ??
                    RISK_LOSS_BUDGET_PALETTE.at(-1),
                }}
              />
            </div>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          {chartRows.map((row, index) => (
            <div key={row.label} className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <span
                className="size-3 shrink-0 rounded-full"
                style={{
                  background:
                    RISK_LOSS_BUDGET_PALETTE[index] ?? RISK_LOSS_BUDGET_PALETTE.at(-1),
                }}
              />
              <span className="truncate">{row.label}</span>
              <span className="ml-auto font-mono text-xs text-foreground">
                {formatCurrency(row.lossAmount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InsightsDailyTracker({ days }: { days: DailyTradeBucket[] }) {
  const recentDays = [...days]
    .filter((day) => day.trades > 0)
    .toSorted((a, b) => a.tradingDayKey.localeCompare(b.tradingDayKey))
    .slice(-14);
  const totalPnl = recentDays.reduce((sum, day) => sum + day.pnl, 0);
  const totalTrades = recentDays.reduce((sum, day) => sum + day.trades, 0);
  const positiveDays = recentDays.filter((day) => day.pnl > 0);
  const negativeDays = recentDays.filter((day) => day.pnl < 0);
  const positivePnl = positiveDays.reduce((sum, day) => sum + day.pnl, 0);
  const lossAbs = Math.abs(negativeDays.reduce((sum, day) => sum + day.pnl, 0));
  const topDays = [...positiveDays].toSorted((a, b) => b.pnl - a.pnl).slice(0, 3);
  const topPositivePnl = topDays.reduce((sum, day) => sum + day.pnl, 0);
  const restPositivePnl = Math.max(0, positivePnl - topPositivePnl);
  const grossMovement = Math.max(topPositivePnl + restPositivePnl + lossAbs, 1);
  const topShareOfPositive = positivePnl > 0 ? (topPositivePnl / positivePnl) * 100 : 0;
  const dependencyLabel =
    topShareOfPositive >= 70
      ? "Alta"
      : topShareOfPositive >= 45
        ? "Media"
        : "Baja";
  const segments = [
    {
      label: "Top 3 días",
      value: topPositivePnl,
      pct: (topPositivePnl / grossMovement) * 100,
      color: insightChartColors.neutralStrong,
    },
    {
      label: "Resto positivo",
      value: restPositivePnl,
      pct: (restPositivePnl / grossMovement) * 100,
      color: insightChartColors.neutral,
    },
    {
      label: "Pérdidas cerradas",
      value: lossAbs,
      pct: (lossAbs / grossMovement) * 100,
      color: insightChartColors.neutralMuted,
    },
  ];

  return (
    <Card className="border-border/70 bg-card/70">
      <CardContent className="p-6 md:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-lg text-muted-foreground">Dependencia del periodo</p>
            <p className="mt-2 font-mono text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              {formatSignedCurrency(totalPnl)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {recentDays.length} días operados / {formatOperationCount(totalTrades)} cerradas
            </p>
          </div>
          <div className="text-sm text-muted-foreground md:text-right">
            <Button
              render={<Link href="/analytics/daily" />}
              nativeButton={false}
              variant="outline"
              size="sm"
              className="w-full justify-between md:w-auto"
            >
              Ver días
              <ChevronRight data-icon="inline-end" className="size-4" />
            </Button>
            <p className="mt-2 max-w-[280px] leading-relaxed">
              Top 3 explican {formatPercent(topShareOfPositive, 0)} del beneficio. Dependencia {dependencyLabel.toLowerCase()}.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-5">
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: segments
                .map((segment) => `${Math.max(segment.pct, segment.value > 0 ? 8 : 3)}fr`)
                .join(" "),
            }}
          >
            {segments.map((segment) => (
              <div key={segment.label} className="min-w-0">
                <p className="font-mono text-sm text-muted-foreground">
                  {formatPercent(segment.pct, 0)}
                </p>
                <div className="mt-3 h-8 border-l border-muted-foreground/45" />
                <div
                  className="h-8 rounded-full"
                  style={{
                    background: segment.value > 0 ? segment.color : insightChartColors.inactive,
                  }}
                  title={`${segment.label}: ${formatCurrency(segment.value)}`}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
            {segments.map((segment) => (
              <span key={segment.label} className="inline-flex items-center gap-2">
                <span
                  className="size-3 rounded-full"
                  style={{
                    background: segment.value > 0 ? segment.color : insightChartColors.inactive,
                  }}
                />
                {segment.label}
                <span className="font-mono text-foreground">{formatCurrency(segment.value)}</span>
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function WinLossDistributionGauge({
  winRatePct,
  wins,
  losses,
}: {
  winRatePct: number;
  wins: number;
  losses: number;
}) {
  const safeWinRate = Math.max(0, Math.min(100, winRatePct));
  const arcValue = safeWinRate * 0.75;

  return (
    <div className="relative grid place-items-center md:justify-start xl:justify-center">
      <figure
        className="relative m-0 grid size-[132px] place-items-center rounded-full max-[640px]:size-[120px]"
        style={{
          background: `conic-gradient(from 210deg, var(--chart-1) 0 ${arcValue}%, var(--chart-3) ${arcValue}% 75%, transparent 75% 100%)`,
        }}
        aria-label={`Win rate ${safeWinRate.toFixed(0)}%, ${wins} ganadoras y ${losses} perdedoras`}
      >
        <div
          className="absolute inset-3 rounded-full border"
          style={{
            borderColor: "var(--chart-grid)",
            background: "color-mix(in srgb, var(--card) 92%, var(--chart-background) 8%)",
          }}
        />
        <div className="relative z-10 grid place-items-center gap-0.5 text-center">
          <p className="font-mono text-[22px] font-extrabold leading-none tracking-[-0.045em] text-foreground">
            {safeWinRate.toFixed(0)}%
          </p>
          <p className="text-[9px] font-bold uppercase leading-none tracking-[0.14em] text-muted-foreground">
            Win rate
          </p>
        </div>
      </figure>
    </div>
  );
}

function EfferdSegmentedArc({
  value,
  valueLabel,
  label,
  helper,
  segments = 58,
}: {
  value: number;
  valueLabel: string;
  label: string;
  helper: string;
  segments?: number;
}) {
  const safeValue = Math.max(0, Math.min(100, value));
  const activeSegments = Math.round((safeValue / 100) * segments);
  const startAngle = 218;
  const sweep = 284;

  return (
    <div className="grid place-items-center">
      <div className="relative grid size-[244px] place-items-center">
        {Array.from({ length: segments }, (_, index) => {
          const angle = startAngle + (sweep / (segments - 1)) * index;
          const isActive = index < activeSegments;

          return (
            <span
              key={index}
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 h-8 w-2 rounded-full"
              style={{
                background: isActive ? "var(--chart-1)" : insightChartColors.inactive,
                transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-96px)`,
              }}
            />
          );
        })}
        <div className="relative z-10 grid place-items-center text-center">
          <div
            className="mb-4 grid size-14 place-items-center rounded-full border"
            style={{
              background: insightChartColors.panel,
              borderColor: insightChartColors.grid,
            }}
          >
            <span className="size-2 rounded-full bg-chart-1" />
          </div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 font-mono text-2xl font-semibold tracking-[-0.04em] text-foreground">
            {valueLabel}
          </p>
          <p className="mt-1 max-w-[150px] text-[11px] leading-snug text-muted-foreground">
            {helper}
          </p>
        </div>
      </div>
    </div>
  );
}

function EfferdSegmentedMeter({
  label,
  value,
  valueLabel,
  helper,
  segments = 44,
}: {
  label: string;
  value: number;
  valueLabel: string;
  helper: string;
  segments?: number;
}) {
  const safeValue = Math.max(0, Math.min(100, value));
  const activeSegments = Math.round((safeValue / 100) * segments);

  return (
    <div className="rounded-xl border border-border/70 bg-background/35 p-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 font-mono text-xl font-semibold text-foreground">
            {valueLabel}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">{Math.round(safeValue)}%</p>
      </div>
      <div className="mt-3 grid grid-cols-[repeat(44,minmax(0,1fr))] gap-1">
        {Array.from({ length: segments }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className="h-7 rounded-full"
            style={{
              background: index < activeSegments ? "var(--chart-1)" : insightChartColors.inactive,
            }}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

type InsightTone = "positive" | "negative" | "warning" | "neutral";
type InsightAttribution = ReturnType<typeof buildInsightAttribution>;
type InsightSessionRow = InsightAttribution["sessionRows"][number];
type InsightSymbolRow = {
  label: string;
  trades: number;
  pnl: number;
  wins?: number;
  losses?: number;
};
type InsightActionFinding = ReturnType<typeof buildInsightActionFindings>[number];

type ConcentrationCard = {
  label: string;
  value: string;
  meta: string;
  secondary: string;
  tone: InsightTone;
};

type HourInsight = {
  label: string;
  pnl: number;
  trades: number;
};

type TimingWindow = {
  pnl: number;
  trades: number;
} | null | undefined;

function ConcentrationCardsGrid({ cards }: { cards: readonly ConcentrationCard[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((item) => (
        <Card key={item.label} className="border-border/70 bg-card/70">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {item.label}
            </p>
            <p className="mt-2 truncate text-sm font-semibold text-foreground">
              {item.value}
            </p>
            <p className={cn("mt-1 font-mono text-sm font-semibold", insightFindingClasses(item.tone))}>
              {item.meta}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {item.secondary}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SessionPerformanceCard({
  bestSession,
  rows,
  worstSession,
}: {
  bestSession: InsightSessionRow | null;
  rows: InsightAttribution["sessionRows"];
  worstSession: InsightSessionRow | null;
}) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>Rendimiento por sesión</CardTitle>
        <CardDescription>
          Comparativa de PnL, operaciones cerradas y peso operativo por sesión.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <SessionSignalMap rows={rows} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Mejor sesión</p>
            <p className="mt-2 font-semibold text-foreground">
              {bestSession?.label ?? "Sin sesión"}
            </p>
            <p className={cn("mt-1 font-mono text-sm font-semibold", signedTextTone(bestSession?.pnl ?? 0))}>
              {bestSession ? formatSignedCurrency(bestSession.pnl) : "Sin operaciones"}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Sesión a revisar</p>
            <p className="mt-2 font-semibold text-foreground">
              {worstSession?.label ?? "Sin sesión negativa"}
            </p>
            <p className={cn("mt-1 font-mono text-sm font-semibold", signedTextTone(worstSession?.pnl ?? 0))}>
              {worstSession ? formatSignedCurrency(worstSession.pnl) : "Sin sesión negativa"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TimingWindowCard({
  bestHour,
  bestWindow,
  bestWindowLabel,
  worstHour,
}: {
  bestHour: HourInsight | null;
  bestWindow: TimingWindow;
  bestWindowLabel: string;
  worstHour: HourInsight | null;
}) {
  const timingCards = [
    {
      label: "Mejor hora",
      value: bestHour?.label ?? bestWindowLabel,
      note: bestHour
        ? `${formatSignedCurrency(bestHour.pnl)} / ${formatOperationCount(bestHour.trades)}`
        : "Sin operaciones",
      tone: bestHour && bestHour.pnl > 0 ? "positive" : "neutral",
    },
    {
      label: "Hora a revisar",
      value: worstHour?.label ?? "Sin hora negativa",
      note: worstHour
        ? `${formatSignedCurrency(worstHour.pnl)} / ${formatOperationCount(worstHour.trades)}`
        : "Sin hora negativa",
      tone: worstHour && worstHour.pnl < 0 ? "negative" : "neutral",
    },
  ] as const;

  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>Timing y ventana operativa</CardTitle>
        <CardDescription>
          Horas con mejor y peor resultado. Ideal para filtrar sesiones sin usar setups.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-3 md:grid-cols-2">
          {timingCards.map((item) => (
            <div key={item.label} className="min-w-0">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="mt-2 text-sm font-semibold text-foreground">{item.value}</p>
              <p className={cn("mt-1 font-mono text-xs font-semibold", insightFindingClasses(item.tone))}>
                {item.note}
              </p>
            </div>
          ))}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Resumen horario</p>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {bestWindow
              ? `La mejor ventana es ${bestWindowLabel}.`
              : "Todavía faltan operaciones por franjas."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Úsalo para evitar horarios con bajo rendimiento antes de añadir más riesgo.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function InsightActionLinksCard({ findings }: { findings: InsightActionFinding[] }) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardContent className="p-0">
        <div className="divide-y divide-border/60">
          {findings.map((finding) => (
            <Link
              key={finding.label}
              href={finding.href}
              className="group flex items-center justify-between gap-4 p-4 transition hover:bg-background/35"
            >
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                  {finding.label}
                </p>
                <p
                  className={cn(
                    "mt-2 text-base font-semibold tracking-tight",
                    insightFindingClasses(finding.tone),
                  )}
                >
                  {finding.title}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {finding.body}
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SymbolPerformanceCard({ rows }: { rows: InsightSymbolRow[] }) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>Rendimiento por símbolo</CardTitle>
        <CardDescription>
          Qué instrumento funciona mejor y cuál conviene vigilar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AttributionSignalMap rows={rows.slice(0, 5)} />
      </CardContent>
    </Card>
  );
}

function WinLossDistributionCard({
  distributionTitle,
  expectancy,
  lossCount,
  profitFactor,
  totalTrades,
  winCount,
  winRatePct,
}: {
  distributionTitle: string;
  expectancy: number;
  lossCount: number;
  profitFactor: number;
  totalTrades: number;
  winCount: number;
  winRatePct: number;
}) {
  const stats = [
    ["PF", profitFactor.toFixed(2), "neutral"],
    ["Expectativa", formatSignedCurrency(expectancy), expectancy >= 0 ? "positive" : "negative"],
    ["Operaciones", `${totalTrades}`, "neutral"],
  ] as const;

  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>Distribución win/loss</CardTitle>
        <CardDescription>
          Relación entre aciertos, Profit factor y expectativa media.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-[160px_1fr] xl:grid-cols-1">
        <WinLossDistributionGauge
          winRatePct={winRatePct}
          wins={winCount}
          losses={lossCount}
        />
        <div className="grid gap-3">
          <div>
            <p className="text-lg font-semibold text-foreground">{distributionTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {expectancy >= 0
                ? "Distribución positiva. Revisa si el margen se repite."
                : "La distribución no compensa el riesgo del periodo."}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {stats.map(([label, value, tone]) => (
              <div key={label} className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={cn("mt-2 font-mono text-sm font-semibold", insightFindingClasses(tone))}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type DailySummaryMetric = readonly [string, string, string, InsightTone];
type DailyCalendarCell = {
  key: string;
  day: DailyTradeBucket | null;
  dateNumber: number;
  inMonth: boolean;
};

function DailySummaryCard({ metrics }: { metrics: readonly DailySummaryMetric[] }) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>Días que explican el periodo</CardTitle>
        <CardDescription>
          Resultado, días positivos y día a revisar dentro de las operaciones cerradas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-4">
          {metrics.map(([label, value, note, tone]) => (
            <div key={label} className="min-w-0">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p
                className={cn(
                  "mt-2 text-2xl font-semibold text-foreground",
                  insightFindingClasses(tone),
                )}
              >
                {value}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{note}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DailyCalendarCard({
  calendarCells,
  canGoNext,
  canGoPrevious,
  monthActiveDayCount,
  onChangeMonth,
  onSelectDay,
  selectedDayKey,
  selectedMonthTitle,
}: {
  calendarCells: DailyCalendarCell[];
  canGoNext: boolean;
  canGoPrevious: boolean;
  monthActiveDayCount: number;
  onChangeMonth: (offset: number) => void;
  onSelectDay: (dayKey: string) => void;
  selectedDayKey: string;
  selectedMonthTitle: string;
}) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Mapa diario</CardTitle>
            <CardDescription>
              Días con más impacto real sobre el periodo. Selecciona uno para ver el detalle.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!canGoPrevious}
              onClick={() => onChangeMonth(-1)}
              aria-label="Mes anterior"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="min-w-40 rounded-lg border border-border/70 bg-background/35 px-3 py-2 text-center">
              <p className="text-sm font-semibold capitalize text-foreground">
                {selectedMonthTitle}
              </p>
              <p className="text-xs text-muted-foreground">
                {monthActiveDayCount} días operados
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!canGoNext}
              onClick={() => onChangeMonth(1)}
              aria-label="Mes siguiente"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid min-w-0 grid-cols-7 gap-1 sm:gap-2">
          {["L", "M", "X", "J", "V", "S", "D"].map((label) => (
            <div
              key={label}
              className="pb-1 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
            >
              {label}
            </div>
          ))}
          {calendarCells.map((cell) => (
            <DailyCalendarDayButton
              key={cell.key}
              cell={cell}
              isSelected={selectedDayKey === cell.key}
              onSelectDay={onSelectDay}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DailyCalendarDayButton({
  cell,
  isSelected,
  onSelectDay,
}: {
  cell: DailyCalendarCell;
  isSelected: boolean;
  onSelectDay: (dayKey: string) => void;
}) {
  const day = cell.day;
  const tone = !day || day.pnl === 0 ? "neutral" : day.pnl > 0 ? "positive" : "negative";

  return (
    <button
      type="button"
      disabled={!day}
      onClick={() => {
        if (day) onSelectDay(day.tradingDayKey);
      }}
      className={cn(
        "min-h-16 rounded-lg border p-1.5 text-left transition md:min-h-[72px] md:p-2 xl:min-h-20",
        !cell.inMonth && "opacity-35",
        isSelected
          ? "border-zinc-200/70 bg-card text-foreground ring-1 ring-white/10"
          : tone === "positive"
            ? "border-profit/40 bg-profit-muted hover:bg-profit-muted"
            : tone === "negative"
              ? "border-loss/40 bg-loss-muted hover:bg-loss-muted"
              : "border-border/70 bg-card/60 hover:bg-card",
        day ? "cursor-pointer" : "cursor-default hover:bg-card/60",
      )}
      title={
        day ? `${formatOperationCount(day.trades)} / ${formatSignedCurrency(day.pnl)}` : "Sin operativa"
      }
      aria-label={
        day
          ? `${cell.dateNumber}: ${formatOperationCount(day.trades)}, ${formatSignedCurrency(day.pnl)}`
          : `${cell.dateNumber}: sin operativa`
      }
    >
      <div className="flex h-full flex-col justify-between gap-2">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium text-foreground">
            {cell.dateNumber}
          </span>
          <span className="hidden rounded-full bg-background/55 px-1.5 py-0.5 text-[10px] text-muted-foreground md:inline-flex">
            {day ? `${day.trades} op` : ""}
          </span>
        </div>
        <div>
          <p className="max-w-full break-words font-mono text-[11px] font-medium leading-tight text-foreground md:text-xs">
            {day ? formatSignedCurrency(day.pnl) : "—"}
          </p>
        </div>
      </div>
    </button>
  );
}

function DailyReliabilityCard({
  confidenceLabel,
  confidenceText,
  negativeDays,
  positiveDays,
  totalDays,
}: {
  confidenceLabel: string;
  confidenceText: string;
  negativeDays: number;
  positiveDays: number;
  totalDays: number;
}) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Fiabilidad del patrón</CardTitle>
            <CardDescription>{confidenceText}</CardDescription>
          </div>
          <span
            className={cn(
              "rounded-full bg-muted px-2.5 py-1 text-xs font-semibold",
              confidenceLabel === "Alta" && "text-profit",
              confidenceLabel === "Baja" && "text-risk",
            )}
          >
            {confidenceLabel}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid divide-y divide-border/60 border-t border-border/60 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="p-4">
            <p className="text-xs text-muted-foreground">Días positivos</p>
            <p className="mt-2 font-mono text-sm font-semibold text-foreground">
              {positiveDays} / {totalDays}
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs text-muted-foreground">Días negativos</p>
            <p className="mt-2 font-mono text-sm font-semibold text-foreground">
              {negativeDays}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SelectedDailyCard({
  dailySignal,
  dayImpactLabel,
  dominantSession,
  dominantSymbol,
  keyDays,
  onSelectDay,
  selectedDay,
  selectedDayLabel,
  selectedDayReading,
}: {
  dailySignal: string;
  dayImpactLabel: (day: DailyTradeBucket) => string;
  dominantSession: string;
  dominantSymbol: string;
  keyDays: DailyTradeBucket[];
  onSelectDay: (dayKey: string) => void;
  selectedDay: DailyTradeBucket | null;
  selectedDayLabel: string;
  selectedDayReading: string;
}) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>Día seleccionado</CardTitle>
        <CardDescription>{dailySignal}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="border-t border-border/60 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            {selectedDayLabel}
          </p>
          <p className={cn("mt-2 font-mono text-3xl font-semibold", signedTextTone(selectedDay?.pnl ?? 0))}>
            {selectedDay ? formatSignedCurrency(selectedDay.pnl) : "0 US$"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{selectedDayReading}</p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-border/60 border-t border-border/60">
          {[
            ["Operaciones", selectedDay ? String(selectedDay.trades) : "0"],
            ["Win rate", selectedDay ? `${selectedDay.winRatePct.toFixed(0)}%` : "0%"],
            ["Sesión", dominantSession],
            ["Símbolo", dominantSymbol],
          ].map(([label, value], index) => (
            <div key={label} className={cn("p-4", index % 2 === 0 && "border-l-0")}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 truncate text-sm font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-border/60 p-4">
          <p className="text-sm font-medium text-foreground">Días clave</p>
          <div className="mt-3 divide-y divide-border/60 border-y border-border/60">
            {keyDays.map((day) => {
              const isActive = selectedDay?.tradingDayKey === day.tradingDayKey;

              return (
                <button
                  key={day.tradingDayKey}
                  type="button"
                  onClick={() => onSelectDay(day.tradingDayKey)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 py-3 text-left transition hover:bg-background/35",
                    isActive && "bg-muted/25 px-2",
                  )}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {shortDayLabel(`${day.tradingDayKey}T00:00:00Z`)}
                      </p>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {dayImpactLabel(day)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatOperationCount(day.trades)} / Win rate {day.winRatePct.toFixed(0)}%
                    </p>
                  </div>
                  <span className={cn("font-mono text-sm font-semibold", signedTextTone(day.pnl))}>
                    {formatSignedCurrency(day.pnl)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type HourlySummaryMetric = readonly [string, string, string, InsightTone];
type HourlyTimelineCell = {
  hour: number;
  label: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
};
type HourlyHeatmapCell = HourlyTimelineCell & {
  key: string;
  dayKey: number;
  dayLabel: string;
};
type KeyHourInsight = HourlyTimelineCell & {
  reason: string;
};
type FormatHourValue = (value: number, mode: "currency" | "percent") => string;

function HourlySummaryCard({
  hourlyLead,
  metrics,
}: {
  hourlyLead: string;
  metrics: readonly HourlySummaryMetric[];
}) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>Timing operativo</CardTitle>
        <CardDescription>{hourlyLead}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-4">
        {metrics.map(([label, value, note, tone]) => (
          <div key={label} className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p
              className={cn(
                "mt-2 text-2xl font-semibold text-foreground",
                insightFindingClasses(tone),
              )}
            >
              {value}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{note}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function HourlyHeatmapCard({
  activeHoursCount,
  bestWindow,
  dominantSession,
  formatHourValue,
  heatmapCells,
  heatmapCellsByDay,
  hourValueMode,
  keyHours,
  maxCellPnl,
  onSelectCell,
  onSetMode,
  selectedCell,
  selectedTone,
  timeline,
  totalHourlyLosses,
  totalHourlyPnl,
  totalHourlyTrades,
  totalHourlyWins,
  windowHourSet,
}: {
  activeHoursCount: number;
  bestWindow: { start: number; end: number } | null | undefined;
  dominantSession: string;
  formatHourValue: FormatHourValue;
  heatmapCells: HourlyHeatmapCell[];
  heatmapCellsByDay: Map<number, HourlyHeatmapCell[]>;
  hourValueMode: "currency" | "percent";
  keyHours: KeyHourInsight[];
  maxCellPnl: number;
  onSelectCell: (cellKey: string) => void;
  onSetMode: (mode: "currency" | "percent") => void;
  selectedCell: HourlyHeatmapCell | null | undefined;
  selectedTone: InsightTone;
  timeline: HourlyTimelineCell[];
  totalHourlyLosses: number;
  totalHourlyPnl: number;
  totalHourlyTrades: number;
  totalHourlyWins: number;
  windowHourSet: Set<number>;
}) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Mapa horario</CardTitle>
            <CardDescription>
              Resultado por franja. Útil para filtrar horarios y evitar horas débiles.
            </CardDescription>
          </div>
          <div className="flex rounded-full border border-border/70 bg-background/35 p-1">
            {[
              ["currency", "$"],
              ["percent", "%"],
            ].map(([mode, label]) => (
              <Button
                key={mode}
                type="button"
                variant={hourValueMode === mode ? "secondary" : "ghost"}
                size="sm"
                className="h-11 rounded-full px-4 sm:h-7 sm:px-3"
                onClick={() => onSetMode(mode as "currency" | "percent")}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-5 p-1 sm:p-2">
          <HourlyHeatmapSelectionSummary
            activeHoursCount={activeHoursCount}
            formatHourValue={formatHourValue}
            hourValueMode={hourValueMode}
            selectedCell={selectedCell}
            totalHourlyLosses={totalHourlyLosses}
            totalHourlyPnl={totalHourlyPnl}
            totalHourlyTrades={totalHourlyTrades}
            totalHourlyWins={totalHourlyWins}
          />
          <HourlyMobileHeatmap
            formatHourValue={formatHourValue}
            heatmapCells={heatmapCells}
            hourValueMode={hourValueMode}
            maxCellPnl={maxCellPnl}
            onSelectCell={onSelectCell}
            selectedCell={selectedCell}
            timeline={timeline}
          />
          <HourlyDesktopHeatmap
            bestWindow={bestWindow}
            formatHourValue={formatHourValue}
            heatmapCellsByDay={heatmapCellsByDay}
            hourValueMode={hourValueMode}
            maxCellPnl={maxCellPnl}
            onSelectCell={onSelectCell}
            selectedCell={selectedCell}
            windowHourSet={windowHourSet}
          />
          <HourlyHeatmapLegend
            selectedCell={selectedCell}
            selectedTone={selectedTone}
          />
        </div>

        <HourlyKeyHoursList
          dominantSession={dominantSession}
          formatHourValue={formatHourValue}
          hourValueMode={hourValueMode}
          keyHours={keyHours}
        />
      </CardContent>
    </Card>
  );
}

function HourlyHeatmapSelectionSummary({
  activeHoursCount,
  formatHourValue,
  hourValueMode,
  selectedCell,
  totalHourlyLosses,
  totalHourlyPnl,
  totalHourlyTrades,
  totalHourlyWins,
}: {
  activeHoursCount: number;
  formatHourValue: FormatHourValue;
  hourValueMode: "currency" | "percent";
  selectedCell: HourlyHeatmapCell | null | undefined;
  totalHourlyLosses: number;
  totalHourlyPnl: number;
  totalHourlyTrades: number;
  totalHourlyWins: number;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px] md:items-start">
      <div className="min-w-0">
        <p className="text-4xl font-semibold tracking-tight text-foreground">
          {selectedCell ? formatHourValue(selectedCell.pnl, hourValueMode) : "Sin datos"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Selección / {selectedCell?.label ?? "sin franja"} /{" "}
          {formatOperationCount(selectedCell?.trades ?? 0)}
        </p>
      </div>
      <div className="pt-1 md:text-right">
        <p className="text-xs text-muted-foreground">Promedio / hora activa</p>
        <p className={cn("mt-2 font-mono text-lg font-semibold", insightFindingClasses(totalHourlyPnl >= 0 ? "positive" : "negative"))}>
          {activeHoursCount > 0
            ? formatHourValue(totalHourlyPnl / activeHoursCount, hourValueMode)
            : "Sin datos"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatOperationCount(totalHourlyTrades)} / {totalHourlyWins}W / {totalHourlyLosses}L
        </p>
      </div>
    </div>
  );
}

function HourlyMobileHeatmap({
  formatHourValue,
  heatmapCells,
  hourValueMode,
  maxCellPnl,
  onSelectCell,
  selectedCell,
  timeline,
}: {
  formatHourValue: FormatHourValue;
  heatmapCells: HourlyHeatmapCell[];
  hourValueMode: "currency" | "percent";
  maxCellPnl: number;
  onSelectCell: (cellKey: string) => void;
  selectedCell: HourlyHeatmapCell | null | undefined;
  timeline: HourlyTimelineCell[];
}) {
  return (
    <div className="grid grid-cols-6 gap-1.5 sm:hidden">
      {timeline.map((hour) => {
        const hourCells = heatmapCells
          .filter((cell) => cell.hour === hour.hour && cell.trades > 0)
          .toSorted((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
        const representative = hourCells[0] ?? null;
        const pnl = representative?.pnl ?? hour.pnl;
        const trades = representative?.trades ?? hour.trades;
        const intensity = trades > 0 ? Math.max(0.14, Math.min(0.88, Math.abs(pnl) / maxCellPnl)) : 0;
        const heatPct = Math.round(12 + intensity * 56);
        const isSelected =
          representative?.key === selectedCell?.key ||
          (!representative && selectedCell?.hour === hour.hour);

        return (
          <button
            key={hour.hour}
            type="button"
            disabled={!representative}
            onClick={() => {
              if (representative) onSelectCell(representative.key);
            }}
            className={cn(
              "min-h-14 rounded-xl border p-1.5 text-left transition",
              representative
                ? "border-border/70 hover:border-foreground/35"
                : "cursor-default border-border/30 opacity-55",
              isSelected && "border-foreground/70 ring-2 ring-foreground/20",
            )}
            style={{
              background: trades
                ? `color-mix(in srgb, var(--chart-2) ${heatPct}%, var(--chart-background))`
                : "color-mix(in srgb, var(--chart-background) 56%, transparent)",
            }}
            title={`${String(hour.hour).padStart(2, "0")}:00 / ${formatOperationCount(trades)} / ${formatHourValue(pnl, hourValueMode)}`}
          >
            <span className="block font-mono text-xs font-semibold text-foreground">
              {String(hour.hour).padStart(2, "0")}
            </span>
            <span
              className={cn(
                "mt-2 block truncate font-mono text-[11px] font-semibold",
                insightFindingClasses(pnl > 0 ? "positive" : pnl < 0 ? "negative" : "neutral"),
              )}
            >
              {trades ? formatHourValue(pnl, hourValueMode) : "—"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function HourlyDesktopHeatmap({
  bestWindow,
  formatHourValue,
  heatmapCellsByDay,
  hourValueMode,
  maxCellPnl,
  onSelectCell,
  selectedCell,
  windowHourSet,
}: {
  bestWindow: { start: number; end: number } | null | undefined;
  formatHourValue: FormatHourValue;
  heatmapCellsByDay: Map<number, HourlyHeatmapCell[]>;
  hourValueMode: "currency" | "percent";
  maxCellPnl: number;
  onSelectCell: (cellKey: string) => void;
  selectedCell: HourlyHeatmapCell | null | undefined;
  windowHourSet: Set<number>;
}) {
  return (
    <div className="hidden min-w-0 overflow-x-auto pb-1 sm:block">
      <div className="grid min-w-[860px] grid-cols-[40px_repeat(24,minmax(22px,1fr))] gap-x-1 gap-y-1.5">
        <div />
        {Array.from({ length: 24 }, (_, hour) => (
          <div
            key={hour}
            className={cn(
              "text-center font-mono text-[10px] text-muted-foreground",
              hour % 6 !== 0 && "opacity-0",
            )}
          >
            {hour === 0 ? "0" : hour}
          </div>
        ))}
        {WEEK_DAY_ROWS.map((day) => (
          <React.Fragment key={day.key}>
            <div className="flex h-8 items-center text-xs font-medium text-muted-foreground">
              {day.label}
            </div>
            {(heatmapCellsByDay.get(day.key) ?? []).map((cell) => (
              <HourlyDesktopHeatmapCell
                key={cell.key}
                bestWindow={bestWindow}
                cell={cell}
                formatHourValue={formatHourValue}
                hourValueMode={hourValueMode}
                isSelected={selectedCell?.key === cell.key}
                maxCellPnl={maxCellPnl}
                onSelectCell={onSelectCell}
                windowHourSet={windowHourSet}
              />
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function HourlyDesktopHeatmapCell({
  bestWindow,
  cell,
  formatHourValue,
  hourValueMode,
  isSelected,
  maxCellPnl,
  onSelectCell,
  windowHourSet,
}: {
  bestWindow: { start: number; end: number } | null | undefined;
  cell: HourlyHeatmapCell;
  formatHourValue: FormatHourValue;
  hourValueMode: "currency" | "percent";
  isSelected: boolean;
  maxCellPnl: number;
  onSelectCell: (cellKey: string) => void;
  windowHourSet: Set<number>;
}) {
  const intensity =
    cell.trades > 0 ? Math.max(0.14, Math.min(0.88, Math.abs(cell.pnl) / maxCellPnl)) : 0;
  const inBestWindow = windowHourSet.has(cell.hour);
  const isBestWindowStart = Boolean(bestWindow && cell.hour === bestWindow.start);
  const isBestWindowEnd = Boolean(bestWindow && cell.hour === bestWindow.end);
  const heatPct = Math.round(12 + intensity * 56);

  return (
    <button
      type="button"
      disabled={cell.trades === 0}
      onClick={() => onSelectCell(cell.key)}
      className={cn(
        "relative h-8 rounded-[5px] border border-transparent transition",
        cell.trades > 0 ? "hover:border-foreground/30" : "cursor-default opacity-50",
        isSelected && "z-10 border-foreground/70 ring-2 ring-foreground/25",
        inBestWindow && !isSelected && "border-border/70",
        inBestWindow && isBestWindowStart && "rounded-l-xl",
        inBestWindow && isBestWindowEnd && "rounded-r-xl",
      )}
      style={{
        background: cell.trades
          ? `color-mix(in srgb, var(--chart-2) ${heatPct}%, var(--chart-background))`
          : "color-mix(in srgb, var(--chart-background) 56%, transparent)",
        boxShadow: isSelected
          ? "0 0 0 1px color-mix(in srgb, var(--foreground) 72%, transparent) inset"
          : inBestWindow
            ? "0 0 0 1px var(--chart-grid) inset"
            : undefined,
      }}
      title={`${cell.label} / ${formatOperationCount(cell.trades)} / ${formatHourValue(cell.pnl, hourValueMode)}`}
    >
      {cell.trades > 0 ? (
        <span
          className={cn(
            "sr-only",
            insightFindingClasses(
              cell.pnl > 0 ? "positive" : cell.pnl < 0 ? "negative" : "neutral",
            ),
          )}
        >
          {formatHourValue(cell.pnl, hourValueMode)}
        </span>
      ) : null}
    </button>
  );
}

function HourlyHeatmapLegend({
  selectedCell,
  selectedTone,
}: {
  selectedCell: HourlyHeatmapCell | null | undefined;
  selectedTone: InsightTone;
}) {
  return (
    <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Baja</span>
        {[0.08, 0.15, 0.24, 0.34, 0.46].map((alpha) => (
          <span
            key={alpha}
            className="size-4 rounded-[4px]"
            style={{
              background: `color-mix(in srgb, var(--chart-2) ${Math.round(alpha * 100)}%, var(--chart-background))`,
            }}
          />
        ))}
        <span>Alta</span>
      </div>
      <p className={cn("font-mono text-xs font-semibold", insightFindingClasses(selectedTone))}>
        {selectedCell ? `${selectedCell.wins}W / ${selectedCell.losses}L` : "Sin selección"}
      </p>
    </div>
  );
}

function HourlyKeyHoursList({
  dominantSession,
  formatHourValue,
  hourValueMode,
  keyHours,
}: {
  dominantSession: string;
  formatHourValue: FormatHourValue;
  hourValueMode: "currency" | "percent";
  keyHours: KeyHourInsight[];
}) {
  return (
    <div className="pt-2">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Lectura rápida</p>
          <p className="text-xs text-muted-foreground">
            Qué horario repetir, qué hora evitar y qué sesión pesa más.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Sesión dominante: <span className="font-semibold text-foreground">{dominantSession}</span>
        </p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {keyHours.map((hour) => {
          const tone = hour.pnl > 0 ? "positive" : hour.pnl < 0 ? "negative" : "neutral";

          return (
            <div key={hour.label} className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <p className="font-mono text-sm font-semibold text-foreground">
                  {hour.label}
                </p>
                <p className={cn("font-mono text-sm font-semibold", insightFindingClasses(tone))}>
                  {formatHourValue(hour.pnl, hourValueMode)}
                </p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {hour.reason} / {formatOperationCount(hour.trades)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type RiskMetricRow = {
  label: string;
  value: string;
  note: string;
  tone: InsightTone;
};
type RiskBudgetRow = {
  label: string;
  pnl: number;
  trades: number;
  losses: number;
  lossAmount: number;
  wins: number;
  lossSharePct: number;
  winRatePct: number;
  avgLoss: number;
};
type RiskReviewLink = {
  title: string;
  body: string;
  href: string;
};

function RiskDecisionCard({
  decisionRows,
  riskTitle,
  riskTone,
}: {
  decisionRows: readonly RiskMetricRow[];
  riskTitle: string;
  riskTone: InsightTone;
}) {
  return (
    <Card className="overflow-hidden border-border/70 bg-card/70">
      <CardContent className="grid gap-5 p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Riesgo de Insights
          </p>
          <h2 className={cn("mt-3 text-3xl font-semibold tracking-tight", insightFindingClasses(riskTone))}>
            {riskTitle}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Dónde se concentró la pérdida, qué comportamiento empeoró el periodo y qué revisar antes de subir riesgo.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {decisionRows.map((row) => (
            <div key={row.label} className="min-w-0">
              <p className="text-xs text-muted-foreground">{row.label}</p>
              <p className={cn("mt-2 text-lg font-semibold tracking-tight", insightFindingClasses(row.tone))}>
                {row.value}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {row.note}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RiskConcentrationCard({
  concentrationRows,
  sessionRiskRows,
  totalLoss,
}: {
  concentrationRows: readonly RiskMetricRow[];
  sessionRiskRows: RiskBudgetRow[];
  totalLoss: number;
}) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>Concentración de pérdida</CardTitle>
        <CardDescription>
          Sesiones, símbolos y días donde el resultado se deterioró más.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <RiskLossBudgetChart rows={sessionRiskRows} totalLoss={totalLoss} />
        <div className="grid gap-3">
          {concentrationRows.map((row) => (
            <div key={row.label} className="grid gap-2 sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-center">
              <p className="text-xs text-muted-foreground">{row.label}</p>
              <p className="min-w-0 truncate text-sm font-semibold text-foreground">{row.value}</p>
              <p className={cn("font-mono text-sm font-semibold", insightFindingClasses(row.tone))}>
                {row.note}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RiskBehaviorCard({ behaviorRows }: { behaviorRows: readonly RiskMetricRow[] }) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>Comportamiento a vigilar</CardTitle>
        <CardDescription>
          Señales históricas que pueden distorsionar la lectura del edge.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          {behaviorRows.map((row) => (
            <div key={row.label} className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{row.label}</p>
                <span className={cn("font-mono text-sm font-semibold", insightFindingClasses(row.tone))}>
                  {row.value}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{row.note}</p>
            </div>
          ))}
        </div>
        <div className="h-1" />
        <Button
          render={<Link href="/risk" />}
          nativeButton={false}
          variant="outline"
          className="justify-between"
        >
          Ver límites en RiskGuard
          <ChevronRight className="size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function RiskReviewLinksCard({ links }: { links: RiskReviewLink[] }) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>Dónde revisar el daño</CardTitle>
        <CardDescription>
          Riesgo de Insights deriva al análisis correcto sin duplicar RiskGuard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-3">
          {links.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="group flex min-w-0 items-start justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/35"
            >
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">{item.title}</span>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {item.body}
                </span>
              </span>
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalyticsOverviewSection({
  workspace,
}: {
  workspace: WorkspaceState;
}) {
  const insights = buildInsightAttribution(workspace);
  const actionFindings = buildInsightActionFindings(workspace);
  const analyticsReadiness = getAnalyticsReadiness(workspace);
  const dailyOverview = getAnalyticsDailyOverview(workspace);
  const hourlyOverview = getAnalyticsHourlyOverview(workspace);
  const trades = workspace.trades;
  const tradeDistributionPerformance = buildTradeDistributionPerformance(trades);
  const bestSession = insights.sessionRows.find((session) => session.pnl > 0) ?? null;
  const worstSession =
    [...insights.sessionRows]
      .filter((session) => session.pnl < 0)
      .toSorted((a, b) => a.pnl - b.pnl)[0] ?? null;
  const symbolRows = Object.values(
    trades.reduce<
      Record<
        string,
        { label: string; trades: number; pnl: number; wins: number; losses: number }
      >
    >((acc, trade) => {
      const current = acc[trade.symbol] ?? {
        label: trade.symbol,
        trades: 0,
        pnl: 0,
        wins: 0,
        losses: 0,
      };
      current.trades += 1;
      current.pnl += trade.netPnl;
      if (trade.netPnl > 0) current.wins += 1;
      if (trade.netPnl < 0) current.losses += 1;
      acc[trade.symbol] = current;
      return acc;
    }, {}),
  ).toSorted((a, b) => b.pnl - a.pnl);
  const bestSymbol = symbolRows.find((symbol) => symbol.pnl > 0) ?? symbolRows[0] ?? null;
  const worstSymbol =
    [...symbolRows].filter((symbol) => symbol.pnl < 0).toSorted((a, b) => a.pnl - b.pnl)[0] ??
    null;
  const hourMap = new Map(hourlyOverview.hours.map((hour) => [hour.hour, hour]));
  const timeline = Array.from({ length: 24 }, (_, hour) => {
    const source = hourMap.get(hour);
    return (
      source ?? {
        hour,
        label: `${String(hour).padStart(2, "0")}:00`,
        pnl: 0,
        trades: 0,
        wins: 0,
        losses: 0,
      }
    );
  });
  const activeHours = timeline.filter((hour) => hour.trades > 0);
  const bestHour =
    activeHours.length > 0 ? [...activeHours].toSorted((a, b) => b.pnl - a.pnl)[0] : null;
  const worstHour =
    activeHours.length > 0 ? [...activeHours].toSorted((a, b) => a.pnl - b.pnl)[0] : null;
  const bestWindow = Array.from({ length: 22 }, (_, start) => {
    const windowHours = timeline.slice(start, start + 3);
    return {
      start,
      end: start + 2,
      pnl: windowHours.reduce((sum, hour) => sum + hour.pnl, 0),
      trades: windowHours.reduce((sum, hour) => sum + hour.trades, 0),
    };
  })
    .filter((window) => window.trades > 0)
    .toSorted((a, b) => b.pnl - a.pnl)[0];
  const bestWindowLabel = bestWindow
    ? `${String(bestWindow.start).padStart(2, "0")}:00-${String(bestWindow.end).padStart(2, "0")}:00`
    : "Sin ventana";
  const distributionTitle =
    tradeDistributionPerformance.expectancy >= 0
      ? tradeDistributionPerformance.profitFactor >= 1.4
        ? "Edge positivo"
        : "Edge positivo estrecho"
      : "Edge bajo presión";
  const concentrationCards = [
    {
      label: "Sesión",
      value: bestSession?.label ?? "Sin sesión",
      meta: bestSession ? formatSignedCurrency(bestSession.pnl) : "Sin operaciones",
      secondary: worstSession
        ? `Revisar ${worstSession.label} / ${formatSignedCurrency(worstSession.pnl)}`
        : "Sin sesión negativa clara",
      tone: bestSession && bestSession.pnl > 0 ? "positive" : "neutral",
    },
    {
      label: "Símbolo",
      value: bestSymbol?.label ?? "Sin símbolo",
      meta: bestSymbol ? formatSignedCurrency(bestSymbol.pnl) : "Sin operaciones",
      secondary: worstSymbol
        ? `Revisar ${worstSymbol.label} / ${formatSignedCurrency(worstSymbol.pnl)}`
        : "Sin símbolo negativo dominante",
      tone: bestSymbol && bestSymbol.pnl > 0 ? "positive" : "neutral",
    },
    {
      label: "Horario",
      value: bestWindowLabel,
      meta: bestWindow ? formatSignedCurrency(bestWindow.pnl) : "Sin operaciones",
      secondary: worstHour
        ? `Revisar ${worstHour.label} / ${formatSignedCurrency(worstHour.pnl)}`
        : "Sin hora débil",
      tone: bestWindow && bestWindow.pnl > 0 ? "positive" : "neutral",
    },
    {
      label: "Distribución",
      value: distributionTitle,
      meta: `PF ${tradeDistributionPerformance.profitFactor.toFixed(2)}`,
      secondary: `Expectativa ${formatSignedCurrency(tradeDistributionPerformance.expectancy)}`,
      tone: tradeDistributionPerformance.expectancy >= 0 ? "positive" : "negative",
    },
  ] as const;

  return (
    <PageMotion>
      <div className="grid gap-4">
        <section className="flex flex-col gap-2 px-1 lg:flex-row lg:items-end lg:justify-between">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Qué explica el resultado: sesión, símbolo, distribución win/loss y ventana operativa.
          </p>
          <p className="text-xs text-muted-foreground">
            {readableSampleLabel(analyticsReadiness.sampleLabel)} /{" "}
            {formatOperationCount(tradeDistributionPerformance.totalTrades)} cerradas
          </p>
        </section>

        <InsightsDailyTracker days={dailyOverview.days} />

        <ConcentrationCardsGrid cards={concentrationCards} />

        <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
          <div className="grid gap-4">
            <SessionPerformanceCard
              bestSession={bestSession}
              rows={insights.sessionRows}
              worstSession={worstSession}
            />
            <TimingWindowCard
              bestHour={bestHour}
              bestWindow={bestWindow}
              bestWindowLabel={bestWindowLabel}
              worstHour={worstHour}
            />
            <InsightActionLinksCard findings={actionFindings} />
          </div>

          <div className="grid gap-4">
            <SymbolPerformanceCard rows={symbolRows} />
            <WinLossDistributionCard
              distributionTitle={distributionTitle}
              expectancy={tradeDistributionPerformance.expectancy}
              lossCount={tradeDistributionPerformance.lossCount}
              profitFactor={tradeDistributionPerformance.profitFactor}
              totalTrades={tradeDistributionPerformance.totalTrades}
              winCount={tradeDistributionPerformance.winCount}
              winRatePct={tradeDistributionPerformance.winRatePct}
            />
          </div>
        </div>
      </div>
    </PageMotion>
  );
}

export function PerformanceReferenceSection({
  workspace,
}: {
  workspace: WorkspaceState;
}) {
  const performance = workspace.analytics.performance;
  const insights = buildInsightAttribution(workspace);
  const totalClosed = Math.max(1, performance.totalTrades);
  const winPct = (performance.winCount / totalClosed) * 100;
  const lossPct = (performance.lossCount / totalClosed) * 100;
  const scoreInputs = [
    {
      label: "Win rate",
      value: formatPercent(performance.winRatePct, 1),
      progress: performance.winRatePct,
      note: `${performance.winCount} ganadoras / ${performance.lossCount} perdedoras`,
    },
    {
      label: "Profit factor",
      value: performance.profitFactor.toFixed(2),
      progress: Math.min(100, (performance.profitFactor / 2.5) * 100),
      note: "Ganancia bruta frente a pérdida bruta",
    },
    {
      label: "Expectancy",
      value: formatSignedCurrency(performance.expectancy),
      progress: Math.min(100, Math.max(0, 50 + performance.expectancy / 4)),
      note: "Media neta por operación cerrada",
    },
  ];
  const tradeStats = [
    {
      label: "Mejor setup",
      value: insights.bestSetup?.name ?? "Sin atribución",
      note: insights.bestSetup
        ? `${formatSignedCurrency(insights.bestSetup.netPnl)} / ${
            insights.bestSetup.trades
          } operaciones`
        : "Faltan operaciones con setup",
      tone: insights.bestSetup?.netPnl ?? 0,
    },
    {
      label: "Setup a revisar",
      value: insights.worstSetup?.name ?? "Sin etiqueta negativa clara",
      note: insights.worstSetup
        ? `${formatSignedCurrency(insights.worstSetup.netPnl)} / ${
            insights.worstSetup.trades
          } operaciones`
        : "No hay setup negativo dominante",
      tone: insights.worstSetup?.netPnl ?? 0,
    },
    {
      label: "Símbolo dominante",
      value: insights.topSymbol?.label ?? "Pendiente",
      note: insights.topSymbol
        ? `${formatSignedCurrency(insights.topSymbol.pnl)} / ${
            insights.topSymbol.trades
          } operaciones`
        : "Sin concentración visible",
      tone: insights.topSymbol?.pnl ?? 0,
    },
    {
      label: "Sesión dominante",
      value: insights.topSession?.label ?? "Pendiente",
      note: insights.topSession
        ? `${formatSignedCurrency(insights.topSession.pnl)} / ${
            insights.topSession.trades
          } operaciones`
        : "Sin sesión dominante",
      tone: insights.topSession?.pnl ?? 0,
    },
  ];

  return (
    <PageMotion>
      <div className="grid gap-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="border-border/70 bg-card/70">
            <CardHeader>
              <CardTitle>Rendimiento acumulado</CardTitle>
              <CardDescription>
                Resultado neto acumulado, baches y recuperación del periodo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[280px] min-h-0 min-w-0 rounded-2xl border border-border/70 bg-background/35 p-4">
                {insights.cumulativeCurve.length > 0 ? (
                  <AnalyticsCumulativeChart data={insights.cumulativeCurve} />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Sin cierres suficientes para pintar una curva.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/70">
            <CardHeader>
              <CardTitle>Calidad de lectura</CardTitle>
              <CardDescription>
                Lo mínimo para confiar en las conclusiones sin sobrerreaccionar.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
              <EfferdSegmentedArc
                value={performance.score}
                valueLabel={`${performance.score}/100`}
                label="Score operativo"
                helper="Lectura global del periodo"
              />
              {scoreInputs.map((item) => (
                <EfferdSegmentedMeter
                  key={item.label}
                  label={item.label}
                  value={item.progress}
                  valueLabel={item.value}
                  helper={item.note}
                />
              ))}
              <div className="rounded-xl border border-border/70 bg-background/35 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">Distribución</span>
                  <span className="font-mono text-sm text-foreground">
                    {performance.winCount} / {performance.lossCount}
                  </span>
                </div>
                <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted/30">
                  <div className="bg-profit" style={{ width: `${winPct}%` }} />
                  <div className="bg-loss" style={{ width: `${lossPct}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Ganadoras / perdedoras</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 bg-card/70">
          <CardHeader>
            <CardTitle>Atribución operativa</CardTitle>
            <CardDescription>
              Dónde se gana, dónde se pierde y qué merece revisión antes de añadir tamaño.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {tradeStats.map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-border/70 bg-background/35 p-4"
              >
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-3 text-lg font-semibold tracking-tight text-foreground">
                  {item.value}
                </p>
                <p className={cn("mt-2 text-sm", signedTextTone(item.tone))}>
                  {item.note}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/70">
          <CardHeader>
            <CardTitle>Review prioritario</CardTitle>
            <CardDescription>
              Operaciones que más pueden explicar pérdidas, falta de etiquetado o mala gestión.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Trade</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {insights.reviewQueue.slice(0, 5).map((item) => (
                  <TableRow key={item.trade.id}>
                    <TableCell>{shortDayLabel(item.trade.closedAt)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{item.trade.symbol}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.trade.session} / {item.trade.setup ?? "Sin etiqueta"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{item.reasons.join(" / ")}</TableCell>
                    <TableCell className="max-w-[320px] text-muted-foreground">
                      {getReviewAction(item.reasons)}
                    </TableCell>
                    <TableCell
                      className={cn("text-right font-mono", signedTextTone(item.trade.netPnl))}
                    >
                      {formatSignedCurrency(item.trade.netPnl)}
                    </TableCell>
                  </TableRow>
                ))}
                {insights.reviewQueue.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      Sin operaciones urgentes en los datos actuales.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PageMotion>
  );
}



export function AnalyticsDailyReferenceSection({
  workspace,
}: {
  workspace: WorkspaceState;
}) {
  const dailyOverview = getAnalyticsDailyOverview(workspace);
  const { days, bestDay } = dailyOverview;
  const activeDays = days.filter((day) => day.trades > 0);
  const negativeDays = activeDays.filter((day) => day.pnl < 0);
  const reviewDay =
    negativeDays.length > 0
      ? [...negativeDays].toSorted((a, b) => a.pnl - b.pnl)[0]
      : [...activeDays].toSorted((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))[0] ?? null;
  const dayRows = [...days].toSorted((a, b) =>
    a.tradingDayKey.localeCompare(b.tradingDayKey),
  );
  const operatedMonthKeys = Array.from(
    new Set(dayRows.map((day) => day.tradingDayKey.slice(0, 7))),
  ).toSorted();
  const buildDailyMonthRange = () => {
    if (operatedMonthKeys.length === 0) return [];

    const monthKeyFromDate = (date: Date) =>
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const firstMonthParts = operatedMonthKeys[0].split("-").map(Number);
    const lastMonthParts = operatedMonthKeys[operatedMonthKeys.length - 1].split("-").map(Number);
    const start = new Date(Date.UTC(firstMonthParts[0], 0, 1));
    const end = new Date(Date.UTC(lastMonthParts[0], 11, 1));

    const keys: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      keys.push(monthKeyFromDate(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    return keys;
  };
  const monthKeys = buildDailyMonthRange();
  const initialMonthKey =
    reviewDay?.tradingDayKey.slice(0, 7) ??
    bestDay?.tradingDayKey.slice(0, 7) ??
    monthKeys.at(-1) ??
    "";
  const [selectedMonthKey, setSelectedMonthKey] = React.useState(initialMonthKey);
  const selectedMonthIndex = monthKeys.indexOf(selectedMonthKey);
  const safeSelectedMonthIndex = Math.max(0, selectedMonthIndex);
  const monthActiveDays = dayRows.filter((day) =>
    day.tradingDayKey.startsWith(selectedMonthKey),
  );
  const positiveMonthDays = monthActiveDays.filter((day) => day.pnl > 0);
  const negativeMonthDays = monthActiveDays.filter((day) => day.pnl < 0);
  const monthBestDay =
    [...monthActiveDays].toSorted((a, b) => b.pnl - a.pnl)[0] ?? null;
  const monthWorstDay =
    [...monthActiveDays].toSorted((a, b) => a.pnl - b.pnl)[0] ?? null;
  const monthReviewDay =
    negativeMonthDays.length > 0
      ? [...negativeMonthDays].toSorted((a, b) => a.pnl - b.pnl)[0]
      : [...monthActiveDays].toSorted((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))[0] ?? null;
  const keyDays = [...monthActiveDays]
    .toSorted((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, 5);
  const [selectedDayKey, setSelectedDayKey] = React.useState(
    monthReviewDay?.tradingDayKey ??
      monthBestDay?.tradingDayKey ??
      monthActiveDays[0]?.tradingDayKey ??
      "",
  );
  const selectedDay =
    monthActiveDays.find((day) => day.tradingDayKey === selectedDayKey) ??
    monthReviewDay ??
    monthBestDay ??
    null;
  const selectedDayTrades = selectedDay
    ? workspace.trades.filter((trade) => trade.tradingDayKey === selectedDay.tradingDayKey)
    : [];
  const dominantSession =
    Object.entries(
      selectedDayTrades.reduce<Record<string, number>>((acc, trade) => {
        acc[trade.session] = (acc[trade.session] ?? 0) + 1;
        return acc;
      }, {}),
    ).toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? "Sin sesión";
  const dominantSymbol =
    Object.entries(
      selectedDayTrades.reduce<Record<string, number>>((acc, trade) => {
        acc[trade.symbol] = (acc[trade.symbol] ?? 0) + 1;
        return acc;
      }, {}),
    ).toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? "Sin símbolo";
  const selectedDayLabel = selectedDay
    ? shortDayLabel(`${selectedDay.tradingDayKey}T00:00:00Z`)
    : "Sin día";
  const selectedMonthDate = selectedMonthKey
    ? new Date(`${selectedMonthKey}-01T00:00:00Z`)
    : null;
  const selectedMonthTitle =
    selectedMonthDate && !Number.isNaN(selectedMonthDate.getTime())
      ? MONTH_TITLE_FORMATTER.format(selectedMonthDate)
      : "Sin mes";
  const calendarCells = (() => {
    if (!selectedMonthDate || Number.isNaN(selectedMonthDate.getTime())) return [];

    const monthCellMap = new Map(dayRows.map((day) => [day.tradingDayKey, day]));
    const year = selectedMonthDate.getUTCFullYear();
    const month = selectedMonthDate.getUTCMonth();
    const leadingDays = (selectedMonthDate.getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const cellCount = Math.max(35, Math.ceil((leadingDays + daysInMonth) / 7) * 7);

    return Array.from({ length: cellCount }, (_, index) => {
      const date = new Date(Date.UTC(year, month, index - leadingDays + 1));
      const key = date.toISOString().slice(0, 10);
      const day = monthCellMap.get(key) ?? null;

      return {
        key,
        day,
        dateNumber: date.getUTCDate(),
        inMonth: date.getUTCMonth() === month,
      };
    });
  })();
  const changeDailyMonth = (offset: number) => {
    const nextMonthKey = monthKeys[safeSelectedMonthIndex + offset];
    if (!nextMonthKey) return;

    const firstDayInMonth = dayRows.find((day) =>
      day.tradingDayKey.startsWith(nextMonthKey),
    );
    setSelectedMonthKey(nextMonthKey);
    setSelectedDayKey(firstDayInMonth?.tradingDayKey ?? "");
  };
  const selectedDayReading =
    selectedDay && selectedDay.pnl < 0
      ? "Día para revisar antes de subir riesgo."
      : selectedDay && selectedDay.trades > dailyOverview.averageTradesPerActiveDay * 1.4
        ? "Día con actividad alta. Revisa si la frecuencia fue necesaria."
        : selectedDay && selectedDay.pnl > 0
          ? "Día positivo. Busca qué parte fue repetible."
          : "Selecciona un día con operaciones para leer el patrón.";
  const dayImpactLabel = (day: typeof activeDays[number]) => {
    if (monthBestDay?.tradingDayKey === day.tradingDayKey && day.pnl > 0) return "Mejor día";
    if (monthWorstDay?.tradingDayKey === day.tradingDayKey && day.pnl < 0) return "Peor día";
    if (monthReviewDay?.tradingDayKey === day.tradingDayKey) return "Revisar";
    if (day.trades > dailyOverview.averageTradesPerActiveDay * 1.4) return "Alta frecuencia";
    return day.pnl >= 0 ? "Positivo" : "Negativo";
  };
  const monthWinDayRate =
    monthActiveDays.length > 0 ? (positiveMonthDays.length / monthActiveDays.length) * 100 : 0;
  const confidenceLabel =
    monthActiveDays.length >= 6 && monthWinDayRate >= 55
      ? "Alta"
      : monthActiveDays.length >= 4
        ? "Media"
        : "Baja";
  const confidenceText =
    confidenceLabel === "Alta"
      ? "El patrón diario empieza a ser repetible."
      : confidenceLabel === "Media"
        ? "Lectura útil, pero todavía conviene confirmar más días."
        : "Lectura orientativa. No escales por un único día.";
  const dailySignal =
    monthActiveDays.length === 0
      ? "Mes sin operaciones cerradas."
      : negativeMonthDays.length > positiveMonthDays.length
        ? "El mes pide revisión defensiva."
        : positiveMonthDays.length > 0
        ? "Los días positivos sostienen la lectura."
        : "Todavía faltan días operados.";
  const summaryMetrics = [
    [
      "Días activos",
      String(monthActiveDays.length),
      `${positiveMonthDays.length} positivos / ${negativeMonthDays.length} negativos`,
      "neutral",
    ],
    [
      "Mejor día",
      monthBestDay ? formatSignedCurrency(monthBestDay.pnl) : "Sin actividad",
      monthBestDay ? `${monthBestDay.label} / ${formatOperationCount(monthBestDay.trades)}` : "Sin actividad",
      monthBestDay && monthBestDay.pnl > 0 ? "positive" : "neutral",
    ],
    [
      "Peor día",
      monthWorstDay ? formatSignedCurrency(monthWorstDay.pnl) : "Sin actividad",
      monthWorstDay ? `${monthWorstDay.label} / ${formatOperationCount(monthWorstDay.trades)}` : "Sin actividad",
      monthWorstDay && monthWorstDay.pnl < 0 ? "negative" : "neutral",
    ],
    [
      "Día a revisar",
      monthReviewDay ? monthReviewDay.label : "Sin actividad",
      monthReviewDay
        ? `${formatSignedCurrency(monthReviewDay.pnl)} / ${formatOperationCount(monthReviewDay.trades)}`
        : "Sin presión visible",
      monthReviewDay && monthReviewDay.pnl < 0 ? "warning" : "neutral",
    ],
  ] as const satisfies readonly DailySummaryMetric[];

  return (
    <PageMotion>
      <div className="grid gap-4">
        <DailySummaryCard metrics={summaryMetrics} />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <div className="grid gap-4">
            <DailyCalendarCard
              calendarCells={calendarCells}
              canGoNext={safeSelectedMonthIndex < monthKeys.length - 1}
              canGoPrevious={safeSelectedMonthIndex > 0}
              monthActiveDayCount={monthActiveDays.length}
              onChangeMonth={changeDailyMonth}
              onSelectDay={setSelectedDayKey}
              selectedDayKey={selectedDay?.tradingDayKey ?? ""}
              selectedMonthTitle={selectedMonthTitle}
            />
            <DailyReliabilityCard
              confidenceLabel={confidenceLabel}
              confidenceText={confidenceText}
              negativeDays={negativeMonthDays.length}
              positiveDays={positiveMonthDays.length}
              totalDays={monthActiveDays.length || 0}
            />
          </div>

          <SelectedDailyCard
            dailySignal={dailySignal}
            dayImpactLabel={dayImpactLabel}
            dominantSession={dominantSession}
            dominantSymbol={dominantSymbol}
            keyDays={keyDays}
            onSelectDay={setSelectedDayKey}
            selectedDay={selectedDay}
            selectedDayLabel={selectedDayLabel}
            selectedDayReading={selectedDayReading}
          />
        </div>
      </div>
    </PageMotion>
  );
}

export function AnalyticsHourlyReferenceSection({
  workspace,
}: {
  workspace: WorkspaceState;
}) {
  const hourlyOverview = getAnalyticsHourlyOverview(workspace);
  const { hours, bestHour } = hourlyOverview;
  const activeAccount =
    workspace.accounts.find((account) => account.id === workspace.activeAccountId) ??
    workspace.accounts[0] ??
    null;
  const hourMap = new Map(hours.map((hour) => [hour.hour, hour]));
  const timeline = Array.from({ length: 24 }, (_, hour) => {
    const source = hourMap.get(hour);
    return (
      source ?? {
        hour,
        label: `${String(hour).padStart(2, "0")}:00`,
        pnl: 0,
        trades: 0,
        wins: 0,
        losses: 0,
      }
    );
  });
  const activeHours = timeline.filter((hour) => hour.trades > 0);
  const worstHour =
    activeHours.length > 0 ? [...activeHours].toSorted((a, b) => a.pnl - b.pnl)[0] : null;
  const totalHourlyPnl = activeHours.reduce((sum, hour) => sum + hour.pnl, 0);
  const totalHourlyTrades = activeHours.reduce((sum, hour) => sum + hour.trades, 0);
  const totalHourlyWins = activeHours.reduce((sum, hour) => sum + hour.wins, 0);
  const totalHourlyLosses = activeHours.reduce((sum, hour) => sum + hour.losses, 0);
  const hourPercentBase = Math.max(activeAccount?.balance ?? activeAccount?.equity ?? 0, 1);
  const formatHourValue = (value: number, mode: "currency" | "percent") =>
    mode === "percent"
      ? `${value > 0 ? "+" : ""}${formatPercent((value / hourPercentBase) * 100, 2)}`
      : formatSignedCurrency(value);
  const bestWindow = Array.from({ length: 22 }, (_, start) => {
    const windowHours = timeline.slice(start, start + 3);
    return {
      start,
      end: start + 2,
      pnl: windowHours.reduce((sum, hour) => sum + hour.pnl, 0),
      trades: windowHours.reduce((sum, hour) => sum + hour.trades, 0),
    };
  })
    .filter((window) => window.trades > 0)
    .toSorted((a, b) => b.pnl - a.pnl)[0];
  const bestWindowLabel = bestWindow
    ? `${String(bestWindow.start).padStart(2, "0")}:00-${String(bestWindow.end).padStart(2, "0")}:00`
    : "Sin ventana";
  const windowHourSet = new Set<number>(
    bestWindow
      ? Array.from({ length: bestWindow.end - bestWindow.start + 1 }, (_, index) => bestWindow.start + index)
      : [],
  );
  const [hourValueMode, setHourValueMode] = React.useState<"currency" | "percent">("currency");
  const hourlyHeatmapCells = WEEK_DAY_ROWS.flatMap((day) =>
    Array.from({ length: 24 }, (_, hour) => {
      const tradesInCell = workspace.trades.filter((trade) => {
        const closedAt = new Date(trade.closedAt);

        return (
          !Number.isNaN(closedAt.getTime()) &&
          closedAt.getUTCDay() === day.key &&
          closedAt.getUTCHours() === hour
        );
      });
      const pnl = tradesInCell.reduce((sum, trade) => sum + trade.netPnl, 0);
      const wins = tradesInCell.filter((trade) => trade.netPnl > 0).length;
      const losses = tradesInCell.filter((trade) => trade.netPnl < 0).length;

      return {
        key: `${day.key}-${hour}`,
        dayKey: day.key,
        dayLabel: day.label,
        hour,
        label: `${day.label} ${String(hour).padStart(2, "0")}:00`,
        pnl,
        trades: tradesInCell.length,
        wins,
        losses,
      };
    }),
  );
  const hourlyHeatmapCellsByDay = hourlyHeatmapCells.reduce<
    Map<number, typeof hourlyHeatmapCells>
  >((cellsByDay, cell) => {
    const cells = cellsByDay.get(cell.dayKey);
    if (cells) {
      cells.push(cell);
    } else {
      cellsByDay.set(cell.dayKey, [cell]);
    }

    return cellsByDay;
  }, new Map());
  const maxCellPnl = Math.max(
    ...hourlyHeatmapCells.map((cell) => Math.abs(cell.pnl)),
    1,
  );
  const defaultSelectedHeatmapCell =
    [...hourlyHeatmapCells]
      .filter((cell) => cell.trades > 0)
      .toSorted((a, b) => b.pnl - a.pnl)[0] ??
    [...hourlyHeatmapCells]
      .filter((cell) => cell.trades > 0)
      .toSorted((a, b) => a.pnl - b.pnl)[0] ??
    null;
  const [selectedHeatmapCellKey, setSelectedHeatmapCellKey] = React.useState(
    defaultSelectedHeatmapCell?.key ?? "",
  );
  const selectedHeatmapCell =
    hourlyHeatmapCells.find((cell) => cell.key === selectedHeatmapCellKey) ??
    defaultSelectedHeatmapCell;
  const selectedHeatmapTone =
    (selectedHeatmapCell?.pnl ?? 0) > 0
      ? "positive"
      : (selectedHeatmapCell?.pnl ?? 0) < 0
        ? "negative"
        : "neutral";
  const hourlyLead =
    bestWindow && bestWindow.pnl > 0
      ? `${bestWindowLabel} concentra el mejor tramo horario.`
      : "Todavía no hay una ventana positiva clara.";
  const supportingWindowHours = bestWindow
    ? timeline.flatMap((hour) =>
        windowHourSet.has(hour.hour) && hour.trades > 0 && hour.hour !== bestHour?.hour
          ? [{ ...hour, reason: "Sostiene la ventana" }]
          : [],
      )
    : [];
  const secondaryActiveHours = activeHours
    .flatMap((hour) =>
      hour.hour !== bestHour?.hour &&
      hour.hour !== worstHour?.hour &&
      !windowHourSet.has(hour.hour)
        ? [
            {
              ...hour,
              reason: hour.pnl >= 0 ? "Aporte secundario" : "Revisar timing",
            },
          ]
        : [],
    )
    .toSorted((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
  const keyHours = [
    ...(bestHour ? [{ ...bestHour, reason: "Mayor aporte" }] : []),
    ...supportingWindowHours,
    ...(worstHour ? [{ ...worstHour, reason: "Hora a revisar" }] : []),
    ...secondaryActiveHours,
  ]
    .filter((hour, index, list) => list.findIndex((item) => item.hour === hour.hour) === index)
    .slice(0, 5);
  const summaryMetrics = [
    [
      "Horas activas",
      String(activeHours.length),
      `${formatOperationCount(totalHourlyTrades)} / ${totalHourlyWins}W / ${totalHourlyLosses}L`,
      "neutral",
    ],
    [
      "Mejor hora",
      bestHour ? bestHour.label : "Sin actividad",
      bestHour
        ? `${formatSignedCurrency(bestHour.pnl)} / ${formatOperationCount(bestHour.trades)}`
        : "Sin operaciones",
      bestHour && bestHour.pnl > 0 ? "positive" : "neutral",
    ],
    [
      "Hora a revisar",
      worstHour ? worstHour.label : "Sin actividad",
      worstHour
        ? `${formatSignedCurrency(worstHour.pnl)} / ${formatOperationCount(worstHour.trades)}`
        : "Sin hora negativa",
      worstHour && worstHour.pnl < 0 ? "negative" : "neutral",
    ],
    [
      "Resultado por horas",
      formatSignedCurrency(totalHourlyPnl),
      bestWindow ? `Mejor ventana ${bestWindowLabel}` : "Sin ventana clara",
      totalHourlyPnl > 0 ? "positive" : totalHourlyPnl < 0 ? "negative" : "neutral",
    ],
  ] as const satisfies readonly HourlySummaryMetric[];

  return (
    <PageMotion>
      <div className="grid gap-4">
        <HourlySummaryCard hourlyLead={hourlyLead} metrics={summaryMetrics} />

        <HourlyHeatmapCard
          activeHoursCount={activeHours.length}
          bestWindow={bestWindow}
          dominantSession={hourlyOverview.dominantSession}
          formatHourValue={formatHourValue}
          heatmapCells={hourlyHeatmapCells}
          heatmapCellsByDay={hourlyHeatmapCellsByDay}
          hourValueMode={hourValueMode}
          keyHours={keyHours}
          maxCellPnl={maxCellPnl}
          onSelectCell={setSelectedHeatmapCellKey}
          onSetMode={setHourValueMode}
          selectedCell={selectedHeatmapCell}
          selectedTone={selectedHeatmapTone}
          timeline={timeline}
          totalHourlyLosses={totalHourlyLosses}
          totalHourlyPnl={totalHourlyPnl}
          totalHourlyTrades={totalHourlyTrades}
          totalHourlyWins={totalHourlyWins}
          windowHourSet={windowHourSet}
        />
      </div>
    </PageMotion>
  );
}

export function AnalyticsRiskReferenceSection({
  workspace,
}: {
  workspace: WorkspaceState;
}) {
  const performance = workspace.analytics.performance;
  const insights = buildInsightAttribution(workspace);
  const totalCost = workspace.trades.reduce(
    (sum, trade) => sum + Math.abs(trade.commission) + Math.abs(trade.swap),
    0,
  );
  const lossStreak = performance.bestLossStreak;
  const outlierDependency = insights.outlierDependency ?? 0;
  const negativeTrades = workspace.trades.filter((trade) => trade.netPnl < 0);
  const totalLoss = Math.abs(
    negativeTrades.reduce((sum, trade) => sum + trade.netPnl, 0),
  );
  const groupRiskRows = (
    labelForTrade: (trade: WorkspaceState["trades"][number]) => string,
  ) =>
    Object.values(
      workspace.trades.reduce<
        Record<
          string,
          {
            label: string;
            pnl: number;
            trades: number;
            losses: number;
            lossAmount: number;
            wins: number;
          }
        >
      >((acc, trade) => {
        const label = labelForTrade(trade);
        const current = acc[label] ?? {
          label,
          pnl: 0,
          trades: 0,
          losses: 0,
          lossAmount: 0,
          wins: 0,
        };
        current.pnl += trade.netPnl;
        current.trades += 1;
        if (trade.netPnl < 0) {
          current.losses += 1;
          current.lossAmount += Math.abs(trade.netPnl);
        }
        if (trade.netPnl > 0) current.wins += 1;
        acc[label] = current;
        return acc;
      }, {}),
    ).map((row) => ({
      ...row,
      lossSharePct: totalLoss > 0 ? (row.lossAmount / totalLoss) * 100 : 0,
      winRatePct: row.trades > 0 ? (row.wins / row.trades) * 100 : 0,
      avgLoss: row.losses > 0 ? row.lossAmount / row.losses : 0,
    }));

  const sessionRiskRows = groupRiskRows((trade) => trade.session).toSorted(
    (a, b) => b.lossSharePct - a.lossSharePct || a.pnl - b.pnl,
  );
  const symbolRiskRows = groupRiskRows((trade) => trade.symbol).toSorted(
    (a, b) => b.lossSharePct - a.lossSharePct || a.pnl - b.pnl,
  );
  const dayRiskRows = groupRiskRows((trade) =>
    shortDayLabel(`${trade.tradingDayKey}T00:00:00Z`),
  ).toSorted((a, b) => b.lossSharePct - a.lossSharePct || a.pnl - b.pnl);
  const worstSession = sessionRiskRows.find((row) => row.losses > 0) ?? null;
  const worstSymbol = symbolRiskRows.find((row) => row.losses > 0) ?? null;
  const worstDay = dayRiskRows.find((row) => row.losses > 0) ?? null;
  const costDragPct =
    Math.abs(performance.grossProfit) > 0
      ? Math.min(100, (totalCost / Math.abs(performance.grossProfit)) * 100)
      : 0;
  const riskTone =
    lossStreak >= 4 ||
    outlierDependency > 55 ||
    (worstSession?.lossSharePct ?? 0) >= 55
      ? "negative"
      : lossStreak >= 2 ||
        outlierDependency > 35 ||
        (worstSession?.lossSharePct ?? 0) >= 35 ||
        costDragPct > 18
        ? "warning"
        : "positive";
  const riskTitle =
    riskTone === "negative"
      ? "Comportamiento dañando el resultado"
      : riskTone === "warning"
        ? "Riesgo histórico en vigilancia"
        : "Riesgo histórico estable";
  const dominantRiskSignal =
    (worstSession?.lossSharePct ?? 0) >= 35
      ? `${worstSession?.label} concentra ${formatPercent(worstSession?.lossSharePct ?? 0, 0)} de la pérdida`
      : outlierDependency > 35
        ? "Resultado dependiente de pocas operaciones"
        : lossStreak >= 2
          ? `Racha negativa de ${lossStreak}`
          : costDragPct > 18
            ? "Costes pesando sobre el resultado"
            : "Sin problema dominante";
  const behaviorRows = [
    {
      label: "Racha de pérdidas",
      value: `${lossStreak}`,
      note: lossStreak >= 2 ? "Revisar impulso antes de volver a aumentar tamaño." : "Sin presión conductual fuerte.",
      tone: lossStreak >= 3 ? "negative" : lossStreak >= 2 ? "warning" : "positive",
    },
    {
      label: "Operación dominante",
      value: insights.outlierDependency === null ? "Sin cálculo" : `${outlierDependency.toFixed(0)}%`,
      note: outlierDependency > 35 ? "No escalar hasta confirmar repetición." : "Resultado menos dependiente.",
      tone: outlierDependency > 35 ? "warning" : "positive",
    },
    {
      label: "Coste operativo",
      value: formatCurrency(totalCost),
      note: "Comisiones y swap visibles en operaciones cerradas.",
      tone: costDragPct > 18 ? "warning" : "neutral",
    },
  ] as const;
  const concentrationRows = [
    {
      label: "Sesión",
      value: worstSession?.label ?? "Sin sesión",
      note: worstSession
        ? `${formatPercent(worstSession.lossSharePct, 0)} de pérdidas / ${worstSession.losses} pérdidas`
        : "Sin pérdidas por sesión",
      tone: worstSession && worstSession.pnl < 0 ? "negative" : "neutral",
    },
    {
      label: "Símbolo",
      value: worstSymbol?.label ?? "Sin símbolo",
      note: worstSymbol
        ? `${formatPercent(worstSymbol.lossSharePct, 0)} de pérdidas / ${worstSymbol.losses} pérdidas`
        : "Sin pérdidas por símbolo",
      tone: worstSymbol && worstSymbol.pnl < 0 ? "negative" : "neutral",
    },
    {
      label: "Día",
      value: worstDay?.label ?? "Sin día",
      note: worstDay
        ? `${formatPercent(worstDay.lossSharePct, 0)} de pérdidas / ${formatOperationCount(worstDay.trades)}`
        : "Sin día negativo",
      tone: worstDay && worstDay.pnl < 0 ? "negative" : "neutral",
    },
  ] as const;
  const decisionRows = [
    {
      label: "Lectura actual",
      value:
        riskTone === "negative"
          ? "No escalar"
          : riskTone === "warning"
            ? "Operar con cautela"
            : "Lectura usable",
      note:
        riskTone === "negative"
          ? "El historial marca concentración de daño o dependencia excesiva."
          : riskTone === "warning"
            ? "Usa Insights para revisar, no para aumentar tamaño."
            : "Puedes usar Insights como apoyo, manteniendo el tamaño.",
      tone: riskTone,
    },
    {
      label: "Señal dominante",
      value: dominantRiskSignal,
      note:
        dominantRiskSignal === "Sin problema dominante"
          ? "No hay una señal que distorsione claramente la lectura."
          : "Resuelve esto antes de sacar conclusiones fuertes.",
      tone: riskTone,
    },
    {
      label: "Siguiente paso",
      value:
        riskTone === "negative"
          ? "Reducir y revisar"
          : worstSession
            ? "Revisar horario"
            : "Revisar diario",
      note:
        riskTone === "negative"
          ? "Primero corrige la fuente del daño; RiskGuard solo si hay límite activo."
          : worstSession
            ? "El patrón más claro está en sesión/hora."
            : "Busca días que expliquen el resultado.",
      tone: riskTone === "positive" ? "neutral" : riskTone,
    },
  ] as const;
  const reviewLinks = [
    {
      title: "Pérdida por símbolo",
      body: worstSymbol
        ? `${worstSymbol.label} concentra ${formatPercent(worstSymbol.lossSharePct, 0)} de pérdidas. Revisar ejecución y contexto.`
        : "No hay símbolo con daño dominante en el periodo.",
      href: "/risk",
    },
    {
      title: "Día que explica el bache",
      body: worstDay
        ? `${worstDay.label} tiene ${formatOperationCount(worstDay.trades)} y ${formatSignedCurrency(worstDay.pnl)} neto.`
        : "No hay día negativo dominante.",
      href: "/analytics/daily",
    },
    {
      title: "Ventana o sesión débil",
      body: worstSession
        ? `${worstSession.label} pesa más en las pérdidas. Filtra horarios antes de añadir riesgo.`
        : "No hay sesión negativa dominante.",
      href: "/analytics/hourly",
    },
  ];

  return (
    <PageMotion>
      <div className="grid gap-4">
        <RiskDecisionCard
          decisionRows={decisionRows}
          riskTitle={riskTitle}
          riskTone={riskTone}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <RiskConcentrationCard
            concentrationRows={concentrationRows}
            sessionRiskRows={sessionRiskRows}
            totalLoss={totalLoss}
          />
          <RiskBehaviorCard behaviorRows={behaviorRows} />
        </div>

        <RiskReviewLinksCard links={reviewLinks} />
      </div>
    </PageMotion>
  );
}
