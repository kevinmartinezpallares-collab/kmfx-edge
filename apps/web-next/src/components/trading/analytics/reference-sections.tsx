"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Liveline, type LivelinePoint, type LivelineSeries, type ThemeMode } from "liveline";

import { PieChart } from "@/components/charts/pie-chart";
import { usePie } from "@/components/charts/pie-context";
import { PieSlice } from "@/components/charts/pie-slice";
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
import {
  livelinePadding,
} from "@/lib/charts/liveline-layout";
import { useIsMobile } from "@/hooks/use-mobile";
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

function formatSignedPercent(value: number, digits = 2) {
  const formatted = formatPercent(Math.abs(value), digits);

  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatPercent(0, digits);
}

function classifyAssetFamily(symbol: string) {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const currencies = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"];
  const looksLikeForex =
    normalized.length >= 6 &&
    currencies.includes(normalized.slice(0, 3)) &&
    currencies.includes(normalized.slice(3, 6));

  if (looksLikeForex) return "Divisas";
  if (/^(XAU|XAG|XPT|XPD|GOLD|SILVER)/.test(normalized)) return "Metales";
  if (/(USOIL|UKOIL|WTI|BRENT|OIL|NATGAS|NGAS)/.test(normalized)) return "Energía";
  if (/(BTC|ETH|SOL|XRP|ADA|DOGE|CRYPTO)/.test(normalized)) return "Crypto";
  if (/(NAS|US100|SPX|SP500|US500|US30|DJI|DOW|DAX|GER40|DE40|UK100|FTSE|JPN225|HK50|FRA40|CAC|AUS200)/.test(normalized)) {
    return "Índices";
  }

  return "Otros";
}

function buildTradeDistributionPerformance(trades: WorkspaceState["trades"]) {
  const netPnls = trades.flatMap((trade) =>
    trade.executions.length
      ? trade.executions.map((execution) => execution.netPnl)
      : [trade.netPnl],
  );
  const totalTrades = netPnls.length;
  const winCount = netPnls.filter((netPnl) => netPnl > 0).length;
  const lossCount = netPnls.filter((netPnl) => netPnl < 0).length;
  const breakevenCount = netPnls.filter((netPnl) => netPnl === 0).length;
  const grossProfit = netPnls
    .filter((netPnl) => netPnl > 0)
    .reduce((sum, netPnl) => sum + netPnl, 0);
  const grossLoss = Math.abs(
    netPnls.filter((netPnl) => netPnl < 0).reduce((sum, netPnl) => sum + netPnl, 0),
  );
  const netProfit = netPnls.reduce((sum, netPnl) => sum + netPnl, 0);

  return {
    breakevenCount,
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
  risk: "var(--risk)",
  riskMuted: "var(--risk-muted)",
  breakeven: "var(--breakeven)",
  info: "var(--info)",
  infoMuted: "var(--info-muted)",
};

const insightMonochromePalette = [
  "color-mix(in srgb, var(--foreground) 88%, var(--card))",
  "color-mix(in srgb, var(--foreground) 66%, var(--card))",
  "color-mix(in srgb, var(--foreground) 48%, var(--card))",
  "color-mix(in srgb, var(--foreground) 32%, var(--card))",
  "color-mix(in srgb, var(--foreground) 22%, var(--card))",
  "color-mix(in srgb, var(--foreground) 14%, var(--card))",
] as const;

const INSIGHT_DONUT_SIZE = 184;
const INSIGHT_DONUT_INNER_RADIUS = 58;

const SESSION_SIGNAL_PALETTE = [
  insightMonochromePalette[0],
  insightMonochromePalette[2],
  insightMonochromePalette[4],
];
const ASSET_FAMILY_PALETTE = [
  insightMonochromePalette[0],
  insightMonochromePalette[1],
  insightMonochromePalette[2],
  insightMonochromePalette[3],
  insightMonochromePalette[4],
  insightMonochromePalette[5],
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

function tonedChartColor(_tone: InsightTone, intensityPct: number, empty = false) {
  if (empty) {
    return "color-mix(in srgb, var(--foreground) 6%, var(--card))";
  }

  const clampedPct = Math.max(12, Math.min(78, intensityPct));

  return `color-mix(in srgb, var(--foreground) ${clampedPct}%, var(--card))`;
}

function heatmapCellColor(_pnl: number, trades: number, intensityPct: number) {
  if (trades === 0) return tonedChartColor("neutral", intensityPct, true);
  return tonedChartColor("neutral", intensityPct);
}

function InsightDonutCenter({
  children,
}: {
  children: (props: { centerSize: number; hoveredIndex: number | null }) => React.ReactNode;
}) {
  const { hoveredIndex, innerRadius } = usePie();
  const centerSize = Math.max(48, innerRadius * 2 - 16);

  return (
    <div
      className="flex items-center justify-center text-center"
      style={{ width: centerSize, height: centerSize }}
    >
      {children({ centerSize, hoveredIndex })}
    </div>
  );
}

InsightDonutCenter.displayName = "PieCenter";

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
    color: SESSION_SIGNAL_PALETTE[index] ?? insightMonochromePalette[5],
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
  const selectedIndex = Math.max(
    0,
    chartRows.findIndex((row) => row.label === selectedRow?.label),
  );
  const selectedMetrics = [
    ["Operaciones", selectedRow ? String(selectedRow.trades) : "0"],
    ["Peso", selectedRow ? formatPercent(selectedRow.sharePct, 0) : "0%"],
    ["PnL neto", selectedRow ? formatSignedCurrency(selectedRow.pnl) : "0 US$"],
  ] as const;

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center">
      <div className="relative grid min-h-[220px] place-items-center">
        <figure
          className="relative m-0 grid place-items-center"
          style={{ width: INSIGHT_DONUT_SIZE, height: INSIGHT_DONUT_SIZE }}
          aria-label={`Reparto por sesión. ${selectedRow?.label ?? "Sin sesión"} seleccionado.`}
        >
          <PieChart
            data={chartRows}
            size={INSIGHT_DONUT_SIZE}
            innerRadius={INSIGHT_DONUT_INNER_RADIUS}
            hoveredIndex={selectedIndex}
            onHoverChange={(index) => {
              if (index !== null) {
                setSelectedSessionLabel(chartRows[index]?.label ?? "");
              }
            }}
            padAngle={0.14}
            cornerRadius={10}
            hoverOffset={6}
          >
            {chartRows.map((row, index) => (
              <PieSlice
                key={row.label}
                index={index}
                animate={false}
                showGlow={false}
                hoverEffect="grow"
              />
            ))}
            <InsightDonutCenter>
              {() => (
                <div className="grid w-full min-w-0 place-items-center gap-1">
                  <p className="max-w-full truncate text-[11px] font-semibold leading-tight text-foreground">
                    {selectedRow?.label ?? "Sin sesión"}
                  </p>
                  <p className={cn("max-w-full truncate font-mono text-[13px] font-semibold leading-tight tracking-[-0.03em]", insightFindingClasses(selectedTone))}>
                    {selectedRow ? formatSignedCurrency(selectedRow.pnl) : "0 US$"}
                  </p>
                  <p className="font-mono text-[10px] leading-none text-muted-foreground">
                    {selectedRow ? formatPercent(selectedRow.sharePct, 0) : "0%"}
                  </p>
                </div>
              )}
            </InsightDonutCenter>
          </PieChart>
        </figure>
      </div>
      <div className="grid content-center gap-5">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {selectedRow?.label ?? "Sin sesión"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedRow
              ? `${formatPercent(selectedRow.sharePct, 0)} del resultado atribuido por sesión.`
              : "Sin operaciones cerradas en sesiones."}
          </p>
        </div>

        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 2xl:grid-cols-3">
          {selectedMetrics.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">{label}</p>
              <p
                className={cn(
                  "mt-2 break-words font-mono text-sm font-semibold leading-tight text-foreground",
                  label === "PnL neto" && insightFindingClasses(selectedTone),
                )}
              >
                {value}
              </p>
            </div>
          ))}
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
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatOperationCount(row.trades)}
                  </p>
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
        Sin drawdown cerrado para repartir por sesión.
      </div>
    );
  }

  return (
    <div className="border-y border-border/60 py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Drawdown cerrado</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-foreground">
            {formatCurrency(totalLoss)}
          </p>
        </div>
        <p className="max-w-[260px] text-sm leading-relaxed text-muted-foreground sm:text-right">
          Reparto por sesión para ver dónde se acumuló la pérdida antes de subir riesgo.
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

type WinLossGaugeSegment = {
  label: string;
  value: number;
  actualValue: number;
  color: string;
  fill: string;
};

function buildWinLossGaugeSegments({
  breakevens,
  losses,
  wins,
}: {
  breakevens: number;
  losses: number;
  wins: number;
}): WinLossGaugeSegment[] {
  const totalResolvedTrades = wins + losses + breakevens;
  const visualBreakevenCount =
    totalResolvedTrades > 0
      ? breakevens > 0
        ? breakevens
        : Math.max(0.45, totalResolvedTrades * 0.08)
      : 1;

  return [
    {
      label: "Ganadoras",
      value: wins,
      actualValue: wins,
      color: insightMonochromePalette[0],
      fill: insightMonochromePalette[0],
    },
    {
      label: "Perdedoras",
      value: losses,
      actualValue: losses,
      color: insightMonochromePalette[2],
      fill: insightMonochromePalette[2],
    },
    {
      label: "Break-even",
      value: visualBreakevenCount,
      actualValue: breakevens,
      color: insightMonochromePalette[4],
      fill: insightMonochromePalette[4],
    },
  ];
}

function WinLossDistributionGauge({
  segments,
  winRatePct,
}: {
  segments: WinLossGaugeSegment[];
  winRatePct: number;
}) {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
  const safeWinRate = Math.max(0, Math.min(100, winRatePct));
  const hoveredSegment = hoveredIndex === null ? null : segments[hoveredIndex];
  const centerValue = hoveredSegment
    ? String(hoveredSegment.actualValue)
    : formatPercent(safeWinRate, 0);
  const centerLabel = hoveredSegment ? hoveredSegment.label : "acierto";
  const wins = segments[0]?.actualValue ?? 0;
  const losses = segments[1]?.actualValue ?? 0;
  const breakevens = segments[2]?.actualValue ?? 0;

  return (
    <figure
      className="relative m-0 grid place-items-center"
      style={{ width: INSIGHT_DONUT_SIZE, height: INSIGHT_DONUT_SIZE }}
      aria-label={`Win rate ${safeWinRate.toFixed(0)}%, ${wins} ganadoras, ${losses} perdedoras y ${breakevens} break-even`}
    >
      <PieChart
        data={segments}
        size={INSIGHT_DONUT_SIZE}
        innerRadius={INSIGHT_DONUT_INNER_RADIUS}
        hoveredIndex={hoveredIndex}
        onHoverChange={setHoveredIndex}
        padAngle={0.16}
        cornerRadius={10}
        hoverOffset={6}
      >
        <PieSlice index={0} animate={false} showGlow={false} hoverEffect="grow" />
        <PieSlice index={1} animate={false} showGlow={false} hoverEffect="grow" />
        <PieSlice index={2} animate={false} showGlow={false} hoverEffect="grow" />
        <InsightDonutCenter>
          {() => (
            <div className="grid w-full min-w-0 place-items-center gap-1">
              <p className="max-w-full truncate font-mono text-xl font-semibold leading-none text-foreground">
                {centerValue}
              </p>
              <p className="max-w-full truncate text-[9px] font-semibold uppercase leading-none tracking-[0.08em] text-muted-foreground">
                {centerLabel}
              </p>
            </div>
          )}
        </InsightDonutCenter>
      </PieChart>
    </figure>
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
type AssetFamilyRow = {
  label: string;
  value: number;
  trades: number;
  pnl: number;
  wins: number;
  losses: number;
  assetCount: number;
  sharePct: number;
  color: string;
};
const FALLBACK_ASSET_FAMILY_ROW: AssetFamilyRow = {
  assetCount: 0,
  color: insightChartColors.inactive,
  label: "Sin familia",
  losses: 0,
  pnl: 0,
  sharePct: 0,
  trades: 0,
  value: 1,
  wins: 0,
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

function AssetFamilyDistributionCard({ rows }: { rows: readonly AssetFamilyRow[] }) {
  const visibleRows = rows.length > 0 ? rows : [FALLBACK_ASSET_FAMILY_ROW];
  const pieRows = [...visibleRows];
  const [selectedLabel, setSelectedLabel] = React.useState(visibleRows[0]?.label ?? "");
  const selectedRow =
    visibleRows.find((row) => row.label === selectedLabel) ?? visibleRows[0] ?? FALLBACK_ASSET_FAMILY_ROW;
  const selectedIndex = Math.max(
    0,
    visibleRows.findIndex((row) => row.label === selectedRow.label),
  );
  const selectedTone =
    selectedRow.pnl > 0 ? "positive" : selectedRow.pnl < 0 ? "negative" : "neutral";
  const winRatePct =
    selectedRow.trades > 0 ? (selectedRow.wins / selectedRow.trades) * 100 : 0;
  const metrics = [
    ["Operaciones", String(selectedRow.trades)],
    ["Win rate", formatPercent(winRatePct, 0)],
    ["PnL neto", formatSignedCurrency(selectedRow.pnl)],
    ["Activos", String(selectedRow.assetCount)],
  ] as const;

  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>Distribución por activos</CardTitle>
        <CardDescription>
          Peso por familia de instrumento, rendimiento neto y concentración operativa.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center">
        <figure
          className="relative m-0 grid min-h-[220px] place-items-center"
          aria-label={`Distribución por activos. ${selectedRow.label} seleccionado.`}
        >
          <PieChart
            data={pieRows}
            size={INSIGHT_DONUT_SIZE}
            innerRadius={INSIGHT_DONUT_INNER_RADIUS}
            hoveredIndex={selectedIndex}
            onHoverChange={(index) => {
              if (index !== null) setSelectedLabel(visibleRows[index]?.label ?? "");
            }}
            padAngle={0.14}
            cornerRadius={10}
            hoverOffset={6}
          >
            {visibleRows.map((row, index) => (
              <PieSlice
                key={row.label}
                index={index}
                animate={false}
                showGlow={false}
                hoverEffect="grow"
              />
            ))}
            <InsightDonutCenter>
              {() => (
                <div className="grid w-full min-w-0 place-items-center gap-1">
                  <p className="max-w-full truncate text-[11px] font-semibold leading-tight text-foreground">
                    {selectedRow.label}
                  </p>
                  <p className="font-mono text-xl font-semibold leading-none text-foreground">
                    {formatPercent(selectedRow.sharePct, 0)}
                  </p>
                  <p className="text-[10px] leading-none text-muted-foreground">
                    de operaciones
                  </p>
                </div>
              )}
            </InsightDonutCenter>
          </PieChart>
        </figure>

        <div className="grid content-center gap-5">
          <div>
            <p className="text-sm font-semibold text-foreground">{selectedRow.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatPercent(selectedRow.sharePct, 0)} de las operaciones cerradas.
            </p>
          </div>

          <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 2xl:grid-cols-4">
            {metrics.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{label}</p>
                <p
                  className={cn(
                    "mt-2 break-words font-mono text-sm font-semibold leading-tight text-foreground",
                    label === "PnL neto" && insightFindingClasses(selectedTone),
                  )}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-2">
            {visibleRows.slice(0, 5).map((row) => (
              <button
                key={row.label}
                type="button"
                onClick={() => setSelectedLabel(row.label)}
                onMouseEnter={() => setSelectedLabel(row.label)}
                className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-border/55 py-2.5 text-left first:border-t-0"
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: row.color }}
                  aria-hidden="true"
                />
                <span className="truncate text-sm text-foreground">{row.label}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatPercent(row.sharePct, 0)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SessionPerformanceCard({
  rows,
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
      <CardContent>
        <SessionSignalMap rows={rows} />
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
        <div className="divide-y divide-border/60 xl:grid xl:grid-cols-3 xl:divide-x xl:divide-y-0">
          {findings.map((finding) => (
            <Link
              key={finding.label}
              href={finding.href}
              className="group flex min-h-full items-center justify-between gap-4 p-4 transition hover:bg-background/35 xl:p-5"
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
  breakevenCount,
  distributionTitle,
  expectancy,
  lossCount,
  profitFactor,
  totalTrades,
  winCount,
  winRatePct,
}: {
  breakevenCount: number;
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
  const segments = buildWinLossGaugeSegments({
    breakevens: breakevenCount,
    losses: lossCount,
    wins: winCount,
  });

  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>Distribución win/loss</CardTitle>
        <CardDescription>
          Relación entre aciertos, Profit factor y expectativa media.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center">
        <div className="grid min-h-[220px] place-items-center">
          <WinLossDistributionGauge
            segments={segments}
            winRatePct={winRatePct}
          />
        </div>
        <div className="grid content-center gap-5">
          <div>
            <p className="text-sm font-semibold text-foreground">{distributionTitle}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {expectancy >= 0
                ? "Distribución positiva. Revisa si el margen se repite."
                : "La distribución no compensa el riesgo del periodo."}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {stats.map(([label, value, tone]) => (
              <div key={label} className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={cn("mt-2 font-mono text-sm font-semibold", insightFindingClasses(tone))}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-2">
            {segments.map((segment) => (
              <div
                key={segment.label}
                className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-border/55 py-2.5 first:border-t-0"
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: segment.color }}
                  aria-hidden="true"
                />
                <span className="truncate text-sm text-foreground">{segment.label}</span>
                <span className="font-mono text-xs font-semibold text-muted-foreground">
                  {segment.actualValue}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type DailySummaryMetric = readonly [string, string, string, InsightTone];
type WeekdayPatternRow = {
  key: number;
  label: string;
  activeDays: number;
  pnl: number;
  returnPct: number;
  trades: number;
  wins: number;
  losses: number;
};
type WeekdayCurveSeries = {
  id: string;
  key: number;
  label: string;
  color: string;
  activeDays: number;
  pnl: number;
  returnPct: number;
  points: LivelinePoint[];
  value: number;
};
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

const WEEKDAY_LINE_COLORS = [
  "oklch(0.78 0.15 152)",
  "oklch(0.7 0.16 28)",
  "oklch(0.72 0.17 302)",
  "oklch(0.68 0.15 252)",
  "oklch(0.76 0.13 78)",
  "oklch(0.7 0.12 205)",
  "oklch(0.72 0.11 340)",
];

const INSIGHTS_LIVELINE_ACCENT_BY_THEME = {
  dark: "#f5f5f5",
  light: "#171717",
} satisfies Record<ThemeMode, string>;
let insightsLivelineClockSnapshot: number | null = null;

function subscribeInsightsThemeClass(onStoreChange: () => void) {
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

function getInsightsThemeClassSnapshot() {
  if (typeof document === "undefined") return false;
  return !document.documentElement.classList.contains("dark");
}

function useInsightsLivelineTheme() {
  const isLight = React.useSyncExternalStore(
    subscribeInsightsThemeClass,
    getInsightsThemeClassSnapshot,
    () => false,
  );
  const theme = (isLight ? "light" : "dark") as ThemeMode;

  return {
    theme,
    accent: INSIGHTS_LIVELINE_ACCENT_BY_THEME[theme],
  };
}

function subscribeInsightsLivelineClock() {
  return () => {};
}

function getInsightsLivelineClockSnapshot() {
  if (typeof window === "undefined") return 0;
  insightsLivelineClockSnapshot ??= Math.floor(Date.now() / 1000) - 3_600;
  return insightsLivelineClockSnapshot;
}

function useInsightsLivelineClock() {
  return React.useSyncExternalStore(
    subscribeInsightsLivelineClock,
    getInsightsLivelineClockSnapshot,
    () => 0,
  );
}

function WeekdayPatternCard({
  rows,
  series,
}: {
  rows: readonly WeekdayPatternRow[];
  series: readonly WeekdayCurveSeries[];
}) {
  const isMobile = useIsMobile();
  const chartTheme = useInsightsLivelineTheme();
  const activeRows = rows.filter((row) => row.activeDays > 0);
  const bestRow = [...activeRows].toSorted((a, b) => b.returnPct - a.returnPct)[0] ?? null;
  const worstRow = [...activeRows].toSorted((a, b) => a.returnPct - b.returnPct)[0] ?? null;
  const legendRows = [...series].toSorted((a, b) => b.returnPct - a.returnPct);
  const chartEndTime = useInsightsLivelineClock();
  const maxRelativeTime = Math.max(
    86_400,
    ...series.flatMap((item) => item.points.map((point) => point.time)),
  );
  const chartStartTime = chartEndTime - maxRelativeTime;
  const livelineSeries = series.map<LivelineSeries>((item) => ({
    color: item.color,
    data: item.points.map((point) => ({
      time: chartStartTime + point.time,
      value: point.value,
    })),
    id: item.id,
    label: isMobile ? undefined : item.label,
    value: item.value,
  }));
  const livelineWindow = Math.max(172_800, maxRelativeTime + 86_400);
  const chartValue = livelineSeries[0]?.value ?? 0;

  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Distribución de rentabilidad por día de la semana</CardTitle>
            <CardDescription>
              Rentabilidad acumulada aproximada por día de la semana, separada por curva.
            </CardDescription>
          </div>
          <div className="grid gap-1 text-sm lg:text-right">
            <p className="text-muted-foreground">
              Mejor día{" "}
              <span className="font-semibold text-foreground">
                {bestRow ? bestRow.label : "Sin datos"}
              </span>
            </p>
            <p className="text-muted-foreground">
              {(worstRow?.returnPct ?? 0) < 0 ? "Día débil" : "Menor aporte"}{" "}
              <span className="font-semibold text-foreground">
                {worstRow ? worstRow.label : "Sin datos"}
              </span>
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {livelineSeries.length > 0 ? (
          <div className="grid gap-3">
            <div
              data-kmfx-liveline
              className="h-[280px] min-h-0 min-w-0 overflow-hidden md:h-[340px] [&>div:first-child]:!hidden"
            >
              <Liveline
                badge={false}
                color={chartTheme.accent}
                data={livelineSeries[0]?.data ?? []}
                emptyText="Sin días operados"
                fill={false}
                formatTime={(time) => {
                  const sampleIndex = Math.max(0, Math.round((time - chartStartTime) / 86_400));

                  return sampleIndex === 0
                    ? "Inicio"
                    : isMobile
                      ? `${sampleIndex}`
                      : `Día ${sampleIndex}`;
                }}
                formatValue={(value) =>
                  formatSignedPercent(Number(value), isMobile ? 1 : 2)
                }
                grid
                lineWidth={isMobile ? 2 : 2.25}
                momentum={false}
                padding={livelinePadding(isMobile, {
                  top: 18,
                  right: 110,
                  bottom: 34,
                  left: 18,
                }, {
                  right: 58,
                  bottom: 28,
                })}
                pulse={false}
                referenceLine={{ value: 0, label: "0%" }}
                scrub
                series={livelineSeries}
                seriesToggleCompact
                showValue={false}
                style={{ height: "100%" }}
                theme={chartTheme.theme}
                value={chartValue}
                window={livelineWindow}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/60 pt-3">
              {legendRows.map((item) => {
                const tone: InsightTone =
                  item.returnPct > 0 ? "positive" : item.returnPct < 0 ? "negative" : "neutral";

                return (
                  <div key={item.id} className="inline-flex min-w-0 items-center gap-2">
                    <span
                      className="h-2 w-5 rounded-full"
                      style={{ background: item.color }}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-medium text-foreground">
                      {item.label}
                    </span>
                    <span className={cn("font-mono text-xs font-semibold", insightFindingClasses(tone))}>
                      {formatSignedPercent(item.returnPct, 2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid h-32 place-items-center text-sm text-muted-foreground">
            Sin días operados para comparar.
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Cada línea empieza en cero y acumula el retorno estimado de los cierres de ese día.
        </p>
      </CardContent>
    </Card>
  );
}

function DailyCalendarCard({
  calendarCells,
  canGoNext,
  canGoPrevious,
  maxAbsPnl,
  monthActiveDayCount,
  onChangeMonth,
  onSelectDay,
  selectedDayKey,
  selectedMonthTitle,
}: {
  calendarCells: DailyCalendarCell[];
  canGoNext: boolean;
  canGoPrevious: boolean;
  maxAbsPnl: number;
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
            <div className="min-w-40 px-3 py-1 text-center">
              <p className="text-sm font-semibold capitalize leading-tight text-foreground">
                {selectedMonthTitle}
              </p>
              <p className="mt-1 text-xs leading-tight text-muted-foreground">
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
        <div className="grid min-w-0 grid-cols-7 gap-1.5 overflow-x-auto pb-1">
          {["L", "M", "X", "J", "V", "S", "D"].map((label) => (
            <div
              key={label}
              className="pb-1 text-center font-mono text-[10px] text-muted-foreground"
            >
              {label}
            </div>
          ))}
          {calendarCells.map((cell) => (
            <DailyCalendarDayButton
              key={cell.key}
              cell={cell}
              isSelected={selectedDayKey === cell.key}
              maxAbsPnl={maxAbsPnl}
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
  maxAbsPnl,
  onSelectDay,
}: {
  cell: DailyCalendarCell;
  isSelected: boolean;
  maxAbsPnl: number;
  onSelectDay: (dayKey: string) => void;
}) {
  const day = cell.day;
  const hasTrades = Boolean(day && day.trades > 0);
  const intensity = day
    ? Math.max(0.08, Math.min(0.74, Math.abs(day.pnl) / maxAbsPnl))
    : 0;
  const background = hasTrades
    ? `color-mix(in oklab, var(--foreground) ${Math.round(intensity * 42)}%, transparent)`
    : "color-mix(in oklab, var(--muted) 28%, transparent)";

  return (
    <button
      type="button"
      disabled={!day}
      onClick={() => {
        if (day) onSelectDay(day.tradingDayKey);
      }}
      className={cn(
        "grid min-h-16 content-center rounded-md border border-border/60 px-1.5 text-center font-mono text-[10px] transition md:min-h-[72px] xl:min-h-20",
        !cell.inMonth && "opacity-35",
        hasTrades ? "text-foreground hover:border-foreground/35" : "text-muted-foreground/40",
        isSelected && "border-foreground/60 ring-1 ring-foreground/20",
        day ? "cursor-pointer" : "cursor-default",
      )}
      style={{ background }}
      title={
        day ? `${formatOperationCount(day.trades)} / ${formatSignedCurrency(day.pnl)}` : "Sin operativa"
      }
      aria-label={
        day
          ? `${cell.dateNumber}: ${formatOperationCount(day.trades)}, ${formatSignedCurrency(day.pnl)}`
          : `${cell.dateNumber}: sin operativa`
      }
    >
      <div className="grid gap-1">
        <span className={cn("text-[11px] font-semibold", hasTrades ? "text-foreground" : "text-muted-foreground/40")}>
          {cell.dateNumber}
        </span>
        {hasTrades ? (
          <>
            <span className="truncate text-[11px] font-semibold text-foreground md:text-xs">
              {formatSignedCurrency(day?.pnl ?? 0)}
            </span>
            <span className="text-[9px] text-muted-foreground">
              {day?.trades ?? 0} op
            </span>
          </>
        ) : (
          <span aria-label="Sin operaciones">-</span>
        )}
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
        const heatPct = Math.round(18 + intensity * 58);
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
              background: heatmapCellColor(pnl, trades, heatPct),
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
  const heatPct = Math.round(18 + intensity * 58);

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
        background: heatmapCellColor(cell.pnl, cell.trades, heatPct),
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
              background: tonedChartColor("positive", Math.round(18 + alpha * 58)),
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
type RiskDrilldownLink = {
  title: string;
  body: string;
  href: string;
};
type RiskInsightKpi = {
  label: string;
  value: string;
  note: string;
  progressPct: number;
  tone: InsightTone;
};

function RiskDecisionCard({
  kpis,
  riskTitle,
  riskTone,
}: {
  kpis: readonly RiskInsightKpi[];
  riskTitle: string;
  riskTone: InsightTone;
}) {
  return (
    <Card className="overflow-hidden border-border/70 bg-card/70">
      <CardContent className="grid gap-7 p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Control de riesgo
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
              {riskTitle}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Revisa si el PnL permite subir tamaño o si antes hay que controlar drawdown, operaciones dominantes y costes.
            </p>
          </div>
          <span className={cn("w-fit rounded-full border px-3 py-1 text-xs font-semibold", riskStatusClasses(riskTone))}>
            {riskStatusLabel(riskTone)}
          </span>
        </div>
        <div className="grid gap-6 border-t border-border/60 pt-5 md:grid-cols-3">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="grid min-h-[152px] min-w-0 content-between"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-foreground">
                    {kpi.value}
                  </p>
                </div>
                <RiskKpiBars progressPct={kpi.progressPct} />
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted/55">
                <div
                  className="h-full rounded-full bg-foreground/55"
                  style={{ width: `${Math.max(4, Math.min(100, kpi.progressPct))}%` }}
                />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {kpi.note}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function riskStatusLabel(tone: InsightTone) {
  if (tone === "negative") return "No subir tamaño";
  if (tone === "warning") return "Operar más pequeño";
  if (tone === "positive") return "Riesgo controlado";

  return "Sin presión";
}

function riskStatusClasses(tone: InsightTone) {
  return cn(
    tone === "negative" && "border-loss/25 bg-loss-muted/45 text-loss",
    tone === "warning" && "border-risk/25 bg-risk-muted/45 text-risk",
    tone === "positive" && "border-profit/25 bg-profit-muted/45 text-profit",
    tone === "neutral" && "border-border bg-muted/45 text-muted-foreground",
  );
}

function RiskKpiBars({ progressPct }: { progressPct: number }) {
  const activeBars = Math.ceil((Math.max(0, Math.min(100, progressPct)) / 100) * 8);

  return (
    <div className="flex h-10 shrink-0 items-end gap-0.5" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => {
        const isActive = index < activeBars;

        return (
          <span
            key={index}
            className={cn(
              "w-1.5 rounded-full bg-muted",
              isActive && "bg-foreground/55",
            )}
            style={{ height: `${10 + index * 4}px` }}
          />
        );
      })}
    </div>
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
        <CardTitle>Dónde se concentra la pérdida</CardTitle>
        <CardDescription>
          Sesión, símbolo y día que más pesan en el drawdown del periodo.
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
        <CardTitle>Disciplina y coste</CardTitle>
        <CardDescription>
          Racha, operación dominante y coste real antes de aumentar lotaje.
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
          Ver límites en Mesa de Riesgo
          <ChevronRight className="size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function RiskDrilldownLinksCard({ links }: { links: RiskDrilldownLink[] }) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>Abrir análisis</CardTitle>
        <CardDescription>
          Salta a la vista que explica la pérdida sin repetir métricas.
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
  const assetFamilyGroups = trades.reduce<
    Record<
      string,
      { label: string; trades: number; pnl: number; wins: number; losses: number; assets: Set<string> }
    >
  >((acc, trade) => {
    const label = classifyAssetFamily(trade.symbol);
    const current = acc[label] ?? {
      assets: new Set<string>(),
      label,
      losses: 0,
      pnl: 0,
      trades: 0,
      wins: 0,
    };
    current.assets.add(trade.symbol);
    current.trades += 1;
    current.pnl += trade.netPnl;
    if (trade.netPnl > 0) current.wins += 1;
    if (trade.netPnl < 0) current.losses += 1;
    acc[label] = current;
    return acc;
  }, {});
  const assetFamilyTotalTrades = Math.max(1, trades.length);
  const assetFamilyRows = Object.values(assetFamilyGroups)
    .toSorted((a, b) => b.trades - a.trades || b.pnl - a.pnl)
    .map((row, index) => ({
      assetCount: row.assets.size,
      color: ASSET_FAMILY_PALETTE[index] ?? insightChartColors.inactive,
      label: row.label,
      losses: row.losses,
      pnl: row.pnl,
      sharePct: (row.trades / assetFamilyTotalTrades) * 100,
      trades: row.trades,
      value: Math.max(row.trades, 0.01),
      wins: row.wins,
    })) satisfies AssetFamilyRow[];
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

        <div className="grid gap-4 xl:grid-cols-2">
          <AssetFamilyDistributionCard rows={assetFamilyRows} />
          <SessionPerformanceCard
            bestSession={bestSession}
            rows={insights.sessionRows}
            worstSession={worstSession}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
          <SymbolPerformanceCard rows={symbolRows} />
          <div className="grid gap-4">
            <WinLossDistributionCard
              breakevenCount={tradeDistributionPerformance.breakevenCount}
              distributionTitle={distributionTitle}
              expectancy={tradeDistributionPerformance.expectancy}
              lossCount={tradeDistributionPerformance.lossCount}
              profitFactor={tradeDistributionPerformance.profitFactor}
              totalTrades={tradeDistributionPerformance.totalTrades}
              winCount={tradeDistributionPerformance.winCount}
              winRatePct={tradeDistributionPerformance.winRatePct}
            />
            <TimingWindowCard
              bestHour={bestHour}
              bestWindow={bestWindow}
              bestWindowLabel={bestWindowLabel}
              worstHour={worstHour}
            />
          </div>
        </div>

        <InsightActionLinksCard findings={actionFindings} />
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
            <CardTitle>Prioridad operativa</CardTitle>
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
  const performance = workspace.analytics.performance;
  const { days, bestDay } = dailyOverview;
  const activeDays = days.filter((day) => day.trades > 0);
  const activeAccount =
    workspace.accounts.find((account) => account.id === workspace.activeAccountId) ??
    workspace.accounts[0] ??
    null;
  const currentCapital = activeAccount?.balance ?? activeAccount?.equity ?? 0;
  const totalClosedPnl = activeDays.reduce((sum, day) => sum + day.pnl, 0);
  const estimatedStartingCapital =
    currentCapital > 0
      ? Math.max(1, currentCapital - totalClosedPnl)
      : Math.max(1, Math.abs(totalClosedPnl), Math.abs(performance.netProfit));
  const activeDayKeys = new Set(activeDays.map((day) => day.tradingDayKey));
  const equityHistoryByDay = new Map<string, { time: number; value: number }>();
  for (const point of activeAccount?.equityHistory ?? []) {
    const rawTime = point.timestamp ?? point.label;
    const date = new Date(rawTime);
    if (Number.isNaN(date.getTime()) || !Number.isFinite(point.value)) continue;

    const key = date.toISOString().slice(0, 10);
    const time = date.getTime();
    const previous = equityHistoryByDay.get(key);
    if (!previous || time >= previous.time) {
      equityHistoryByDay.set(key, { time, value: point.value });
    }
  }
  const equityDailyReturnMap = new Map<string, number>();
  const equityDailyValues = [...equityHistoryByDay.entries()]
    .map(([key, point]) => ({ key, ...point }))
    .toSorted((a, b) => a.time - b.time);
  for (let index = 1; index < equityDailyValues.length; index += 1) {
    const previous = equityDailyValues[index - 1];
    const current = equityDailyValues[index];
    if (!previous || !current || !activeDayKeys.has(current.key) || previous.value <= 0) continue;

    equityDailyReturnMap.set(current.key, ((current.value - previous.value) / previous.value) * 100);
  }
  const dailyReturnMap = new Map<string, number>();
  let runningCapital = estimatedStartingCapital;
  for (const day of [...activeDays].toSorted((a, b) => a.tradingDayKey.localeCompare(b.tradingDayKey))) {
    const returnPct =
      equityDailyReturnMap.get(day.tradingDayKey) ??
      (runningCapital > 0 ? (day.pnl / runningCapital) * 100 : 0);
    dailyReturnMap.set(day.tradingDayKey, returnPct);
    runningCapital = Math.max(1, runningCapital + day.pnl);
  }
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
  const calendarMaxAbsPnl = Math.max(
    1,
    ...monthActiveDays.map((day) => Math.abs(day.pnl)),
  );
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
  const weekdayPatternRows = WEEK_DAY_ROWS.map((weekday) => {
    const matchingDays = activeDays.filter((day) => {
      const date = new Date(`${day.tradingDayKey}T00:00:00Z`);

      return !Number.isNaN(date.getTime()) && date.getUTCDay() === weekday.key;
    });
    const returnFactor = matchingDays.reduce(
      (factor, day) => factor * (1 + (dailyReturnMap.get(day.tradingDayKey) ?? 0) / 100),
      1,
    );

    return {
      activeDays: matchingDays.length,
      key: weekday.key,
      label: weekday.label,
      losses: matchingDays.reduce((sum, day) => sum + day.losses, 0),
      pnl: matchingDays.reduce((sum, day) => sum + day.pnl, 0),
      returnPct: (returnFactor - 1) * 100,
      trades: matchingDays.reduce((sum, day) => sum + day.trades, 0),
      wins: matchingDays.reduce((sum, day) => sum + day.wins, 0),
    };
  }) satisfies WeekdayPatternRow[];
  const weekdayCurveSeries = WEEK_DAY_ROWS.reduce<WeekdayCurveSeries[]>((seriesRows, weekday, index) => {
    const matchingDays: typeof activeDays = [];
    for (const day of activeDays) {
      const date = new Date(`${day.tradingDayKey}T00:00:00Z`);
      if (!Number.isNaN(date.getTime()) && date.getUTCDay() === weekday.key) {
        matchingDays.push(day);
      }
    }
    matchingDays.sort((a, b) => a.tradingDayKey.localeCompare(b.tradingDayKey));
    if (matchingDays.length === 0) return seriesRows;

    let cumulativePnl = 0;
    let cumulativeReturnFactor = 1;
    const points: LivelinePoint[] = [{ time: 0, value: 0 }];
    for (const [pointIndex, day] of matchingDays.entries()) {
      cumulativePnl += day.pnl;
      cumulativeReturnFactor *= 1 + (dailyReturnMap.get(day.tradingDayKey) ?? 0) / 100;
      points.push({
        time: (pointIndex + 1) * 86_400,
        value: (cumulativeReturnFactor - 1) * 100,
      });
    }
    const cumulativeReturnPct = (cumulativeReturnFactor - 1) * 100;

    seriesRows.push({
      activeDays: matchingDays.length,
      color: WEEKDAY_LINE_COLORS[index] ?? "var(--chart-line-secondary)",
      id: `weekday_${weekday.key}`,
      key: weekday.key,
      label: weekday.label,
      pnl: cumulativePnl,
      returnPct: cumulativeReturnPct,
      points,
      value: cumulativeReturnPct,
    });

    return seriesRows;
  }, []) satisfies WeekdayCurveSeries[];
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
        <WeekdayPatternCard rows={weekdayPatternRows} series={weekdayCurveSeries} />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <div className="grid gap-4">
            <DailyCalendarCard
              calendarCells={calendarCells}
              canGoNext={safeSelectedMonthIndex < monthKeys.length - 1}
              canGoPrevious={safeSelectedMonthIndex > 0}
              maxAbsPnl={calendarMaxAbsPnl}
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
      ? "Drawdown concentrado"
      : riskTone === "warning"
        ? "Riesgo pendiente de filtrar"
        : "Riesgo operativo controlado";
  const behaviorRows = [
    {
      label: "Racha perdedora",
      value: `${lossStreak}`,
      note: lossStreak >= 2 ? "No subas tamaño hasta cortar la racha." : "Sin racha que obligue a bajar tamaño.",
      tone: lossStreak >= 3 ? "negative" : lossStreak >= 2 ? "warning" : "positive",
    },
    {
      label: "Operación dominante",
      value: insights.outlierDependency === null ? "Sin cálculo" : `${outlierDependency.toFixed(0)}%`,
      note: outlierDependency > 35 ? "Una operación pesa demasiado en el PnL." : "PnL repartido entre varias operaciones.",
      tone: outlierDependency > 35 ? "warning" : "positive",
    },
    {
      label: "Costes de trading",
      value: formatCurrency(totalCost),
      note: "Comisiones y swap descontados de cierres MT5.",
      tone: costDragPct > 18 ? "warning" : "neutral",
    },
  ] as const;
  const concentrationRows = [
    {
      label: "Sesión",
      value: worstSession?.label ?? "Sin sesión",
      note: worstSession
        ? `${formatPercent(worstSession.lossSharePct, 0)} del drawdown / ${worstSession.losses} pérdidas`
        : "Sin drawdown por sesión",
      tone: worstSession && worstSession.pnl < 0 ? "negative" : "neutral",
    },
    {
      label: "Símbolo",
      value: worstSymbol?.label ?? "Sin símbolo",
      note: worstSymbol
        ? `${formatPercent(worstSymbol.lossSharePct, 0)} del drawdown / ${worstSymbol.losses} pérdidas`
        : "Sin drawdown por símbolo",
      tone: worstSymbol && worstSymbol.pnl < 0 ? "negative" : "neutral",
    },
    {
      label: "Día",
      value: worstDay?.label ?? "Sin día",
      note: worstDay
        ? `${formatPercent(worstDay.lossSharePct, 0)} del drawdown / ${formatOperationCount(worstDay.trades)}`
        : "Sin día negativo",
      tone: worstDay && worstDay.pnl < 0 ? "negative" : "neutral",
    },
  ] as const;
  const lossConcentrationPct = worstSession?.lossSharePct ?? 0;
  const riskKpis = [
    {
      label: "Drawdown por sesión",
      value: formatPercent(lossConcentrationPct, 0),
      note:
        worstSession && lossConcentrationPct > 0
          ? `${worstSession.label} concentra el drawdown del periodo.`
          : "Sin sesión dominante en drawdown.",
      progressPct: lossConcentrationPct,
      tone: lossConcentrationPct >= 55 ? "negative" : lossConcentrationPct >= 35 ? "warning" : "positive",
    },
    {
      label: "Operación dominante",
      value: insights.outlierDependency === null ? "0%" : formatPercent(outlierDependency, 0),
      note:
        outlierDependency > 35
          ? "Una o pocas operaciones pesan demasiado en el PnL."
          : "PnL repartido; sin operación dominante.",
      progressPct: outlierDependency,
      tone: outlierDependency >= 55 ? "negative" : outlierDependency >= 35 ? "warning" : "positive",
    },
    {
      label: "Coste sobre ganancia",
      value: formatPercent(costDragPct, 0),
      note: `${formatCurrency(totalCost)} en comisiones y swap sobre ganancia bruta.`,
      progressPct: costDragPct,
      tone: costDragPct > 18 ? "warning" : "neutral",
    },
  ] as const satisfies readonly RiskInsightKpi[];
  const reviewLinks = [
    {
      title: "Símbolo con pérdida",
      body: worstSymbol
        ? `${worstSymbol.label} concentra ${formatPercent(worstSymbol.lossSharePct, 0)} del drawdown. Revisa ejecución y contexto.`
        : "No hay símbolo que domine el drawdown.",
      href: "/risk",
    },
    {
      title: "Día de drawdown",
      body: worstDay
        ? `${worstDay.label} tiene ${formatOperationCount(worstDay.trades)} y ${formatSignedCurrency(worstDay.pnl)} neto.`
        : "No hay día que explique la pérdida.",
      href: "/analytics/daily",
    },
    {
      title: "Sesión débil",
      body: worstSession
        ? `${worstSession.label} pesa más en el drawdown. Filtra horario antes de añadir riesgo.`
        : "No hay sesión que concentre pérdida.",
      href: "/analytics/hourly",
    },
  ];

  return (
    <PageMotion>
      <div className="grid gap-4">
        <RiskDecisionCard
          kpis={riskKpis}
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

        <RiskDrilldownLinksCard links={reviewLinks} />
      </div>
    </PageMotion>
  );
}
