"use client";

import * as React from "react";
import Link from "next/link";
import { Liveline, type LivelinePoint, type ThemeMode } from "liveline";
import { ChevronRight } from "lucide-react";

import { Gauge } from "@/components/charts/gauge";
import { PieChart } from "@/components/charts/pie-chart";
import { PieSlice } from "@/components/charts/pie-slice";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TradingAccount } from "@/lib/contracts/account";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import {
  economicImpactLabel,
  getEconomicCalendarOverview,
  type EconomicImpact,
} from "@/lib/domain/economic-calendar-selectors";
import {
  buildDashboardAttentionItems,
  buildDashboardPerformance,
  buildDashboardSessionRows,
  buildDashboardSymbolRows,
  resolveAccountMode,
  riskStatusLabel,
  sessionLabel,
} from "@/lib/domain/dashboard-selectors";
import { countClosedTradeExecutions } from "@/lib/domain/trades-selectors";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/formatters/numbers";
import {
  signedTextClass,
} from "@/lib/domain/semantic-colors";
import {
  livelineWindowForData,
  normalizeLivelinePoints,
  smoothLivelinePoints,
} from "@/lib/charts/liveline-points";
import { cn } from "@/lib/utils";

const CHART_ACCENT_BY_THEME = {
  light: "#171717",
  dark: "#f5f5f5",
} satisfies Record<ThemeMode, string>;
const CHART_ACCENT_SOFT = "var(--chart-line-secondary)";
const PANEL_EQUITY_WINDOWS = [
  { label: "7D", secs: 604_800 },
  { label: "30D", secs: 2_592_000 },
  { label: "90D", secs: 7_776_000 },
] as const;
type EquityChartPoint = {
  label: string;
  equity: number;
  balance: number;
  time: number;
};
type MetricDelta = {
  value: number;
  suffix?: string;
  label: string;
  tone?: "positive" | "negative" | "neutral";
};

function subscribeThemeClass(onStoreChange: () => void) {
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

function getThemeClassSnapshot() {
  if (typeof document === "undefined") return false;
  return !document.documentElement.classList.contains("dark");
}

function usePanelChartTheme() {
  const isLight = React.useSyncExternalStore(
    subscribeThemeClass,
    getThemeClassSnapshot,
    () => false,
  );
  const donutNeutrals = isLight
    ? {
        win: "oklch(0.92 0 0)",
        loss: "var(--loss)",
        breakeven: "oklch(0.56 0 0)",
      }
    : {
        win: "oklch(0.92 0 0)",
        loss: "var(--loss)",
        breakeven: "oklch(0.52 0 0)",
      };

  return {
    theme: (isLight ? "light" : "dark") as ThemeMode,
    isLight,
    accent: CHART_ACCENT_BY_THEME[isLight ? "light" : "dark"],
    softAccent: CHART_ACCENT_SOFT,
    win: donutNeutrals.win,
    loss: donutNeutrals.loss,
    breakeven: donutNeutrals.breakeven,
  };
}

function makeInitialSeries(base: number, seed: number, count = 120) {
  const now = Math.floor(Date.now() / 1000);
  let value = base;

  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin((index + seed) / 7) * base * 0.0007;
    const pulse = Math.cos((index + seed) / 13) * base * 0.00045;
    value = Math.max(base * 0.2, value + wave + pulse);

    return {
      time: now - (count - index) * 2,
      value,
    };
  });
}

function useLivelineFeed(base: number, seed: number, volatility = 0.001) {
  const [data, setData] = React.useState<LivelinePoint[]>(() =>
    makeInitialSeries(base, seed),
  );

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      setData((current) => {
        const last = current.at(-1)?.value ?? base;
        const noise = (Math.random() - 0.48) * base * volatility;
        const wave = Math.sin(Date.now() / (3100 + seed * 120)) * base * volatility;
        const next = Math.max(base * 0.2, last + noise + wave);

        return [
          ...current.slice(-180),
          { time: Math.floor(Date.now() / 1000), value: next },
        ];
      });
    }, 950 + seed * 70);

    return () => window.clearInterval(interval);
  }, [base, seed, volatility]);

  return {
    data,
    value: data.at(-1)?.value ?? base,
  };
}

function formatCompactCurrency(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: value > 100 ? 0 : 4,
    minimumFractionDigits: value > 100 ? 0 : 4,
  });
}

function formatMetricValue({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const safeValue = Number.isFinite(value) ? value : 0;

  return `${prefix}${safeValue.toLocaleString("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${suffix}`;
}

const EFFERD_SEGMENT_TONE_CLASSES = {
  used: "bg-foreground/75",
  free: "bg-chart-background",
  reserve: "bg-muted-foreground/25",
} as const;

function EfferdSegmentedMeter({
  label,
  value,
  limit,
  segments,
}: {
  label: string;
  value: string;
  limit: string;
  segments: Array<{ label: string; pct: number; tone: "used" | "free" | "reserve" }>;
}) {
  return (
    <div className="border-t border-border/60 pt-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 font-mono text-xl font-semibold text-foreground">{value}</p>
        </div>
        <p className="font-mono text-xs text-muted-foreground">{limit}</p>
      </div>
      <div className="mt-4 flex h-3 gap-1.5">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className={cn("rounded-full", EFFERD_SEGMENT_TONE_CLASSES[segment.tone])}
            style={{ width: `${Math.max(3, segment.pct)}%` }}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
        {segments.map((segment) => (
          <span key={segment.label}>{segment.label}</span>
        ))}
      </div>
    </div>
  );
}

export function MetricCard({
  title,
  value,
  prefix,
  suffix,
  decimals = 0,
  caption,
  tone = "neutral",
  delta,
}: {
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  caption: string;
  tone?: "neutral" | "positive" | "negative";
  delta?: MetricDelta;
}) {
  const deltaTone =
    delta?.tone ?? (delta && delta.value > 0 ? "positive" : delta && delta.value < 0 ? "negative" : "neutral");
  const deltaArrow = delta && delta.value > 0 ? "↑" : delta && delta.value < 0 ? "↓" : "→";
  const deltaToneClass =
    deltaTone === "positive"
      ? "text-profit"
      : deltaTone === "negative"
        ? "text-loss"
        : "text-muted-foreground";
  const deltaDotClass =
    deltaTone === "positive"
      ? "bg-profit text-background"
      : deltaTone === "negative"
        ? "bg-loss text-background"
        : "bg-muted text-muted-foreground";

  return (
    <Card className="overflow-hidden border-border/70 bg-card/70 shadow-none">
      <CardContent className="grid min-h-[128px] content-center p-5">
        <div className="grid min-w-0 gap-3">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <div className="grid gap-2">
            <p
              className={cn(
                "whitespace-nowrap font-mono text-2xl font-bold tabular-nums text-foreground",
                tone === "positive" && "text-profit",
                tone === "negative" && "text-loss",
              )}
            >
              {formatMetricValue({ value, prefix, suffix, decimals })}
            </p>
            {delta ? (
              <div className="flex min-w-0 items-center gap-1.5 text-xs leading-none">
                <span className={cn("grid size-4 shrink-0 place-items-center rounded-full text-[11px] font-semibold", deltaDotClass)}>
                  {deltaArrow}
                </span>
                <span className={cn("whitespace-nowrap font-mono font-semibold", deltaToneClass)}>
                  {Math.abs(delta.value).toLocaleString("es-ES", { maximumFractionDigits: 2 })}
                  {" "}
                  {delta.suffix ?? "%"}
                </span>
                <span className="truncate text-muted-foreground">{delta.label}</span>
              </div>
            ) : null}
            <p className="max-w-[18rem] text-xs leading-snug text-muted-foreground">
              {caption}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function LiveMarketChart({
  symbol,
  base,
  compact = false,
  volatility = 0.001,
  showValue = false,
}: {
  symbol: string;
  base: number;
  compact?: boolean;
  volatility?: number;
  showValue?: boolean;
}) {
  const [windowSecs, setWindowSecs] = React.useState(compact ? 45 : 180);
  const feed = useLivelineFeed(base, symbol.length + Math.floor(base) % 9, volatility);
  const chartTheme = usePanelChartTheme();

  return (
    <div data-kmfx-liveline className={cn("w-full", compact ? "h-24" : "h-[360px]")}>
      <Liveline
        data={feed.data}
        value={feed.value}
        theme={chartTheme.theme}
        color={compact ? chartTheme.softAccent : chartTheme.accent}
        window={windowSecs}
        windows={
          compact
            ? undefined
            : [
                { label: "1m", secs: 60 },
                { label: "3m", secs: 180 },
                { label: "5m", secs: 300 },
                { label: "15m", secs: 900 },
              ]
        }
        onWindowChange={setWindowSecs}
        windowStyle="rounded"
        grid={!compact}
        badge={!compact}
        badgeVariant="minimal"
        fill
        pulse={!compact}
        scrub={!compact}
        showValue={showValue}
        valueMomentumColor={false}
        referenceLine={compact ? undefined : { value: base, label: "VWAP" }}
        formatValue={(current) => `${symbol} ${formatCompactCurrency(current)}`}
        lineWidth={compact ? 1.5 : 2}
      />
    </div>
  );
}

function buildEquityChartData(
  workspace: WorkspaceState,
  activeAccount: TradingAccount | undefined,
): EquityChartPoint[] {
  const balance = activeAccount?.balance ?? activeAccount?.equity ?? 0;
  const source = workspace.dashboard.equitySeries;
  const now = Math.floor(Date.now() / 1000);

  if (source.length >= 2) {
    const dated = source.map((point) => {
      const parsed = point.timestamp ? Date.parse(point.timestamp) : NaN;
      return {
        ...point,
        time: Number.isNaN(parsed) ? null : Math.floor(parsed / 1000),
      };
    });
    const hasDatedHistory = dated.every((point) => point.time !== null);

    if (hasDatedHistory) {
      const latestSourceTime = dated.at(-1)?.time ?? now;
      return dated
        .slice()
        .toSorted((left, right) => (left.time ?? now) - (right.time ?? now))
        .map((point) => ({
          label: point.label || shortPanelTimeLabel(point.time ?? now),
          equity: point.value,
          balance,
          time: now - (latestSourceTime - (point.time ?? latestSourceTime)),
        }));
    }

    const targetCount =
      workspace.meta.sourceMode === "live" ? source.length : Math.max(7, source.length);
    const missing = Math.max(0, targetCount - source.length);
    const firstDelta = source[1].value - source[0].value;
    const padded = [
      ...Array.from({ length: missing }, (_, index) => ({
        label: "",
        value: Math.max(
          balance * 0.85,
          source[0].value - firstDelta * 0.65 * (missing - index),
        ),
      })),
      ...source,
    ];

    return padded.map((point, index) => ({
      label: point.label || shortPanelTimeLabel(now - (padded.length - 1 - index) * 86_400),
      equity: point.value,
      balance,
      time: now - (padded.length - 1 - index) * 86_400,
    }));
  }

  const daily = workspace.analytics.daily;
  if (daily.length >= 2) {
    let running = activeAccount?.equity ?? balance;
    const reversed = daily
      .slice()
      .reverse()
      .map((bucket, index) => {
        const point = {
          label: bucket.label,
          equity: running,
          balance,
          time: now - (daily.length - 1 - index) * 86_400,
        };
        running -= bucket.pnl;
        return point;
      });

    return reversed.reverse();
  }

  return [
    { label: "Inicio", equity: balance, balance, time: now - 86_400 },
    { label: "Actual", equity: activeAccount?.equity ?? balance, balance, time: now },
  ];
}

function panelSourceLabel(workspace: WorkspaceState) {
  return workspace.meta.sourceMode === "live" ? "Lectura MT5" : "Lectura segura";
}

const SHORT_PANEL_TIME_LABEL_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
});

function shortPanelTimeLabel(time: number) {
  return SHORT_PANEL_TIME_LABEL_FORMATTER.format(new Date(time * 1000));
}

function PanelChartWindowControls({
  availableWindowSecs,
  value,
  onChange,
}: {
  availableWindowSecs: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {PANEL_EQUITY_WINDOWS.map((option) => {
          const isActive = option.secs === value;
          const isAvailable =
            option.secs === PANEL_EQUITY_WINDOWS[0].secs ||
            option.secs <= availableWindowSecs;

          return (
            <button
              aria-disabled={!isAvailable}
              aria-pressed={isActive}
              className={cn(
                "h-11 min-w-11 rounded-md border px-3 text-xs font-medium transition-colors sm:h-8 sm:min-w-0",
                "border-border bg-background text-foreground hover:bg-muted/70",
                isActive && "bg-muted text-foreground shadow-sm",
                !isAvailable &&
                  "cursor-not-allowed opacity-40 hover:bg-background",
              )}
              key={option.label}
              onClick={() => {
                if (isAvailable) onChange(option.secs);
              }}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {availableWindowSecs < PANEL_EQUITY_WINDOWS[1].secs ? (
        <span className="text-xs text-muted-foreground">
          Histórico disponible limitado al primer sync.
        </span>
      ) : null}
    </div>
  );
}

function EquityCurveCard({
  workspace,
  activeAccount,
}: {
  workspace: WorkspaceState;
  activeAccount: TradingAccount | undefined;
}) {
  const [windowSecs, setWindowSecs] = React.useState(604_800);
  const chartTheme = usePanelChartTheme();
  const chartData = buildEquityChartData(workspace, activeAccount);
  const latestValue = chartData.at(-1)?.equity ?? activeAccount?.equity ?? 0;
  const balance = activeAccount?.balance ?? latestValue;
  const hasHistory = chartData.length >= 2;
  const dataSpanSecs =
    chartData.length >= 2
      ? Math.max(0, (chartData.at(-1)?.time ?? 0) - (chartData[0]?.time ?? 0))
      : 0;
  const availableWindowSecs =
    dataSpanSecs >= PANEL_EQUITY_WINDOWS[1].secs
      ? PANEL_EQUITY_WINDOWS[2].secs
      : dataSpanSecs >= PANEL_EQUITY_WINDOWS[0].secs
        ? PANEL_EQUITY_WINDOWS[1].secs
        : PANEL_EQUITY_WINDOWS[0].secs;
  const selectedWindowSecs =
    windowSecs > availableWindowSecs ? PANEL_EQUITY_WINDOWS[0].secs : windowSecs;
  const livelineData = smoothLivelinePoints(
    normalizeLivelinePoints(
      chartData.map((point) => ({
        time: point.time,
        value: point.equity,
      })),
      60,
    ),
    { radius: 4, minPoints: 24 },
  );
  const effectiveWindowSecs = livelineWindowForData(livelineData, selectedWindowSecs, {
    minSecs: Math.min(selectedWindowSecs, 86_400),
    padRatio: 0.18,
    maxPadSecs: 86_400,
  });
  const labelByTime = new Map(chartData.map((point) => [point.time, point.label]));

  return (
    <Card className="overflow-hidden border-border/70 bg-card/70">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Curva de equity y balance</CardTitle>
            <CardDescription>
              Evolución de la cuenta activa frente al balance de referencia.
            </CardDescription>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {hasHistory ? panelSourceLabel(workspace) : "Historial insuficiente"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-5">
        {hasHistory ? (
          <div className="grid gap-3">
            <PanelChartWindowControls
              availableWindowSecs={availableWindowSecs}
              value={selectedWindowSecs}
              onChange={setWindowSecs}
            />
            <div
              data-kmfx-liveline
              className="h-[320px] w-full xl:h-[340px]"
              style={chartTheme.isLight ? { filter: "contrast(1.18)" } : undefined}
            >
              <Liveline
                data={livelineData}
                value={latestValue}
                theme={chartTheme.theme}
                color={chartTheme.accent}
                window={effectiveWindowSecs}
                grid
                badge
                badgeVariant="minimal"
                badgeTail
                fill
                pulse
                scrub
                momentum={false}
                referenceLine={{ value: balance, label: "Balance" }}
                formatValue={(value) =>
                  formatCurrency(Number(value), activeAccount?.baseCurrency ?? "USD")
                }
                formatTime={(time) => labelByTime.get(time) ?? shortPanelTimeLabel(time)}
                lerpSpeed={0.14}
                lineWidth={2.35}
                padding={{ top: 18, right: 132, bottom: 34, left: 24 }}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-background/35 text-center xl:h-[340px]">
            <p className="text-sm font-medium text-foreground">Historial insuficiente</p>
            <p className="mt-2 max-w-sm text-xs text-muted-foreground">
              Conecta historial de equity o espera cierres reales para activar la curva.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryHeroCard({
  workspace,
  activeAccount,
}: {
  workspace: WorkspaceState;
  activeAccount: TradingAccount | undefined;
}) {
  const mode = resolveAccountMode(activeAccount);

  return (
    <Card className="overflow-hidden border-border/70 bg-card/75">
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="mt-3 text-2xl tracking-tight">
              {activeAccount?.label ?? "Sin cuenta conectada"}
            </CardTitle>
            <CardDescription>
              {activeAccount
                ? `${activeAccount.broker} / ${activeAccount.server} / MT5 ${activeAccount.login}`
                : "Conecta una cuenta para activar el Panel."}
            </CardDescription>
          </div>
          <Button
            render={<Link href="/accounts" />}
            nativeButton={false}
            variant="outline"
            className="justify-between lg:min-w-52"
          >
            Ver cuentas
            <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      </CardHeader>
      {activeAccount ? (
        <CardContent className="grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Modo</p>
            <p className="mt-1 text-sm font-medium text-foreground">{mode}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Moneda base</p>
            <p className="mt-1 font-mono text-sm font-medium text-foreground">
              {activeAccount.baseCurrency}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Posiciones abiertas</p>
            <p className="mt-1 font-mono text-sm font-medium text-foreground">
              {activeAccount.openPositionsCount}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Estado de datos</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {panelSourceLabel(workspace)}
            </p>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

function impactToneClass(impact: EconomicImpact) {
  return cn(
    impact === "alto" && "text-risk",
    impact === "medio" && "text-info",
    impact === "bajo" && "text-muted-foreground",
  );
}

function DecisionControlCard({ workspace }: { workspace: WorkspaceState }) {
  const items = buildDashboardAttentionItems(workspace);
  const chartTheme = usePanelChartTheme();
  const primaryItem = items[0];
  const activeAccount =
    workspace.accounts.find((account) => account.id === workspace.activeAccountId) ??
    workspace.accounts[0];
  const currency = activeAccount?.baseCurrency ?? "USD";
  const accountEquity = activeAccount?.equity ?? activeAccount?.balance ?? 0;
  const dailyUsage =
    workspace.risk.dailyLimitPct > 0
      ? Math.min(100, (workspace.risk.dailyDrawdownPct / workspace.risk.dailyLimitPct) * 100)
      : 0;
  const heatUsage =
    workspace.risk.heatLimitPct > 0
      ? Math.min(100, (workspace.risk.totalOpenRiskPct / workspace.risk.heatLimitPct) * 100)
      : 0;
  const dailyRemainingPct =
    workspace.risk.dailyLimitPct > 0
      ? Math.max(
          0,
          Math.min(
            100,
            ((workspace.risk.dailyLimitPct - workspace.risk.dailyDrawdownPct) /
              workspace.risk.dailyLimitPct) *
              100,
          ),
        )
      : 100;
  const dailyRoom = Math.max(
    0,
    workspace.risk.dailyLimitPct - workspace.risk.dailyDrawdownPct,
  );
  const dailyRoomCurrency = accountEquity * (dailyRoom / 100);
  const dominantExposure = [...workspace.risk.exposureBySymbol].toSorted(
    (a, b) => b.openRiskPct - a.openRiskPct,
  )[0];
  const statusTone = cn(
    workspace.risk.status === "blocked" && "text-loss",
    workspace.risk.status === "caution" && "text-risk",
    workspace.risk.status === "safe" && "text-muted-foreground",
  );

  return (
    <Card className="h-full border-border/70 bg-card/70 shadow-none">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Estado operativo</CardTitle>
            <CardDescription>Margen, riesgo abierto y siguiente acción.</CardDescription>
          </div>
          <span className={cn("text-xs font-medium", statusTone)}>
            {riskStatusLabel(workspace.risk.status)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid justify-items-center gap-2">
          <Gauge
            className="mx-auto w-full max-w-[380px]"
            value={dailyRemainingPct}
            centerValue={dailyRoomCurrency}
            totalNotches={25}
            spacing={20}
            notchCornerRadius={12}
            notchLengthPercent={100}
            startAngle={174}
            endAngle={367}
            useGradient={false}
            uniformWidth={false}
            activeFill={chartTheme.isLight ? "#171717" : "#f5f5f5"}
            inactiveFill="var(--chart-background)"
            inactiveFillOpacity={1}
            activeFillOpacity={1}
            defaultLabel="Margen estimado"
            formatOptions={{
              maximumFractionDigits: 0,
            }}
            suffix={` ${currency === "USD" ? "US$" : currency}`}
            valueClassName="whitespace-nowrap text-2xl font-semibold leading-none tracking-tight"
            labelClassName="text-xs"
            minWidth={0}
            enterTransition={{ type: "spring", duration: 1, bounce: 0.6 }}
            enterStaggerScale={1}
          />
          <p className="max-w-64 text-center text-xs leading-relaxed text-muted-foreground">
            Estimación según la referencia de riesgo disponible.
          </p>
        </div>

        <EfferdSegmentedMeter
          label="Uso diario"
          value={formatPercent(workspace.risk.dailyDrawdownPct, 2)}
          limit={`Referencia ${formatPercent(workspace.risk.dailyLimitPct, 2)}`}
          segments={[
            { label: "Usado", pct: dailyUsage, tone: "used" },
            { label: "Disponible", pct: Math.max(0, 100 - dailyUsage), tone: "free" },
          ]}
        />

        <EfferdSegmentedMeter
          label="Riesgo abierto"
          value={formatPercent(workspace.risk.totalOpenRiskPct, 2)}
          limit={`Referencia ${formatPercent(workspace.risk.heatLimitPct, 2)}`}
          segments={[
            { label: "Abierto", pct: heatUsage, tone: "used" },
            { label: "Libre", pct: Math.max(0, 100 - heatUsage), tone: "reserve" },
          ]}
        />

        <div className="border-t border-border/60 pt-5">
          <div className="grid grid-cols-[1fr_auto] gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Exposición dominante</p>
              <p className="mt-1 font-medium text-foreground">
                {dominantExposure ? dominantExposure.symbol : "Sin exposición abierta"}
              </p>
            </div>
            <p className="font-mono font-semibold text-foreground">
              {dominantExposure ? formatPercent(dominantExposure.openRiskPct, 2) : "0%"}
            </p>
          </div>
        </div>

        {primaryItem ? (
          <Link
            href={primaryItem.href}
            className="group flex items-start justify-between gap-3 border-t border-border/60 pt-5 transition"
          >
            <div>
              <p className="text-xs text-muted-foreground">Prioridad</p>
              <p className="mt-1 font-medium text-foreground">{primaryItem.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{primaryItem.body}</p>
            </div>
            <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
          </Link>
        ) : null}

        <Button
          render={<Link href="/risk" />}
          nativeButton={false}
          variant="outline"
          className="justify-between"
        >
          Ver riesgo
          <ChevronRight data-icon="inline-end" />
        </Button>
      </CardContent>
    </Card>
  );
}

function NewsRiskCard({
  workspace,
  className,
}: {
  workspace: WorkspaceState;
  className?: string;
}) {
  const overview = getEconomicCalendarOverview(workspace);
  const nextEvent =
    overview.rows.find((event) => event.impact === "alto") ?? overview.rows[0];
  const affectedSymbols = nextEvent?.affected.join(" / ") ?? "Sin símbolos";
  const nextWindows = overview.rows
    .filter((event) => event.event !== nextEvent?.event)
    .slice(0, 2);
  const impactLabel = nextEvent ? economicImpactLabel(nextEvent.impact) : null;

  return (
    <Card className={cn("h-full border-border/70 bg-card/70 shadow-none", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Noticias</CardTitle>
            <CardDescription>Eventos macro que pueden afectar la operativa.</CardDescription>
          </div>
          {nextEvent ? (
            <p className={cn("shrink-0 text-xs font-medium", impactToneClass(nextEvent.impact))}>
              {impactLabel}
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex h-full flex-col gap-5">
        {nextEvent ? (
          <div className="grid gap-5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Próxima ventana</p>
                <p className="mt-2 truncate text-lg font-semibold leading-none text-foreground">
                  {nextEvent.event}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {nextEvent.currency} / {nextEvent.window}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-2xl font-semibold leading-none text-foreground">
                  {nextEvent.time}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{nextEvent.currency}</p>
              </div>
            </div>

            <div className="grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Símbolos expuestos</p>
                <p className="mt-1 truncate text-sm font-medium text-foreground">
                  {affectedSymbols}
                </p>
              </div>
              <div className="min-w-0 sm:text-right">
                <p className="text-xs text-muted-foreground">Lectura</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  Revisar antes de subir riesgo
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin noticias relevantes visibles.</p>
        )}

        {nextWindows.length > 0 ? (
          <div className="grid gap-0 border-t border-border/60">
            {nextWindows.map((event) => (
              <div
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border/60 py-3 last:border-b-0"
                key={`${event.event}-${event.currency}-${event.time}`}
              >
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {economicImpactLabel(event.impact)}
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-foreground">
                    {event.event}
                  </p>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {event.currency} / {event.time}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        <Button
          render={<Link href="/market/economic-calendar" />}
          nativeButton={false}
          variant="outline"
          className="mt-auto justify-between"
        >
          Ver calendario macro
          <ChevronRight data-icon="inline-end" />
        </Button>
      </CardContent>
    </Card>
  );
}

function RecentTradesCard({
  workspace,
  className,
}: {
  workspace: WorkspaceState;
  className?: string;
}) {
  const trades = workspace.trades.slice(0, 5);

  return (
    <Card className={cn("border-border/70 bg-card/70 shadow-none", className)}>
      <CardHeader>
        <CardTitle>Operaciones recientes</CardTitle>
        <CardDescription>Operaciones que explican el último movimiento de la cuenta.</CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operación</TableHead>
                <TableHead className="hidden md:table-cell">Setup</TableHead>
                <TableHead className="hidden lg:table-cell">Sesión</TableHead>
                <TableHead className="hidden lg:table-cell">Parciales</TableHead>
                <TableHead className="text-right">PnL neto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.map((trade) => (
                <TableRow key={trade.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{trade.symbol}</span>
                      <span className="text-xs text-muted-foreground">
                        {trade.side.toUpperCase()} / {trade.tradingDayKey}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {trade.setup ?? "Sin etiqueta"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">{trade.session}</TableCell>
                  <TableCell className="hidden lg:table-cell">{trade.executions.length}</TableCell>
                  <TableCell className={cn("text-right font-mono font-semibold", signedTextClass(trade.netPnl))}>
                    {formatSignedCurrency(trade.netPnl)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Button
          render={<Link href="/trades" />}
          nativeButton={false}
          variant="ghost"
          className="mt-3 w-full justify-between"
        >
          Ver operaciones
          <ChevronRight data-icon="inline-end" />
        </Button>
      </CardContent>
    </Card>
  );
}

function WinLossDonut({
  winRatePct,
  winCount,
  lossCount,
  breakevenCount,
}: {
  winRatePct: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
}) {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
  const chartTheme = usePanelChartTheme();
  const totalResolvedTrades = winCount + lossCount + breakevenCount;
  const visualBreakevenCount =
    breakevenCount > 0 ? breakevenCount : Math.max(0.45, totalResolvedTrades * 0.08);
  const data = [
    {
      label: "Ganadoras",
      value: winCount,
      actualValue: winCount,
      color: chartTheme.win,
      fill: chartTheme.win,
    },
    {
      label: "Perdedoras",
      value: lossCount,
      actualValue: lossCount,
      color: chartTheme.loss,
      fill: chartTheme.loss,
    },
    {
      label: "Break-even",
      value: visualBreakevenCount,
      actualValue: breakevenCount,
      color: chartTheme.breakeven,
      fill: chartTheme.breakeven,
    },
  ];
  const hoveredSegment = hoveredIndex === null ? null : data[hoveredIndex];
  const centerValue = hoveredSegment
    ? String(hoveredSegment.actualValue)
    : formatPercent(winRatePct, 0);
  const centerLabel = hoveredSegment ? hoveredSegment.label : "acierto";

  return (
    <div className="grid justify-items-center gap-3">
      <div className="relative size-[158px]">
        <PieChart
          data={data}
          size={158}
          innerRadius={48}
          hoveredIndex={hoveredIndex}
          onHoverChange={setHoveredIndex}
          padAngle={0.16}
          cornerRadius={10}
          hoverOffset={6}
        >
          <PieSlice index={0} showGlow={false} hoverEffect="grow" />
          <PieSlice index={1} showGlow={false} hoverEffect="grow" />
          <PieSlice index={2} showGlow={false} hoverEffect="grow" />
        </PieChart>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div className="max-w-[76px]">
            <p className="font-mono text-2xl font-semibold leading-none text-foreground">
              {centerValue}
            </p>
            <p className="mt-2 truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {centerLabel}
            </p>
          </div>
        </div>
      </div>
      <div className="grid w-full grid-cols-3 gap-2 text-center text-[11px]">
        {data.map((item) => (
          <div key={item.label} className="min-w-0">
            <div className="mx-auto mb-1 size-1.5 rounded-full" style={{ backgroundColor: item.color }} />
            <p className="truncate text-muted-foreground">{item.label}</p>
            <p className="font-mono font-semibold text-foreground">{item.actualValue}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelInsightsCompact({
  workspace,
  className,
}: {
  workspace: WorkspaceState;
  className?: string;
}) {
  const performance = buildDashboardPerformance(workspace, { preferActiveTrades: true });
  const symbolRows = buildDashboardSymbolRows(workspace.trades);
  const sessionRows = buildDashboardSessionRows(workspace.trades);
  const topSymbol = [...symbolRows].toSorted((a, b) => b.pnl - a.pnl)[0];
  const topSession = [...sessionRows].toSorted((a, b) => b.pnl - a.pnl)[0];
  const reviewSession = [...sessionRows].toSorted((a, b) => a.pnl - b.pnl)[0];
  const tradeOutcome = workspace.trades.reduce(
    (counts, trade) => {
      const netPnls = trade.executions.length
        ? trade.executions.map((execution) => execution.netPnl)
        : [trade.netPnl];
      netPnls.forEach((netPnl) => {
        if (netPnl > 0) counts.winCount += 1;
        if (netPnl < 0) counts.lossCount += 1;
        if (netPnl === 0) counts.breakevenCount += 1;
      });
      return counts;
    },
    { winCount: 0, lossCount: 0, breakevenCount: 0 },
  );
  const hasTradeOutcome = countClosedTradeExecutions(workspace.trades) > 0;
  const donutWinCount = hasTradeOutcome ? tradeOutcome.winCount : performance.winCount;
  const donutLossCount = hasTradeOutcome ? tradeOutcome.lossCount : performance.lossCount;
  const donutBreakevenCount = hasTradeOutcome
    ? tradeOutcome.breakevenCount
    : Math.max(0, performance.totalTrades - performance.winCount - performance.lossCount);
  const donutTotal = donutWinCount + donutLossCount + donutBreakevenCount;
  const donutWinRatePct =
    donutTotal > 0 ? (donutWinCount / donutTotal) * 100 : performance.winRatePct;

  return (
    <Card className={cn("h-full border-border/70 bg-card/70 shadow-none", className)}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Insights rápidos</CardTitle>
            <CardDescription>Lectura mínima antes de subir riesgo.</CardDescription>
          </div>
          <Button
            render={<Link href="/analytics" />}
            nativeButton={false}
            variant="ghost"
            size="sm"
            className="h-11 px-3 sm:h-8 sm:px-2"
          >
            Ver detalle
            <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid flex-1 content-start gap-5">
        <WinLossDonut
          winRatePct={donutWinRatePct}
          winCount={donutWinCount}
          lossCount={donutLossCount}
          breakevenCount={donutBreakevenCount}
        />

        <div className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-border/60 pt-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Mejor símbolo</p>
            <p className="mt-1 truncate font-medium text-foreground">
              {topSymbol?.symbol ?? "Sin datos"}
            </p>
            <p className={cn("mt-1 font-mono text-sm font-semibold", signedTextClass(topSymbol?.pnl ?? 0))}>
              {topSymbol ? formatSignedCurrency(topSymbol.pnl) : "-"}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Mejor sesión</p>
            <p className="mt-1 truncate font-medium text-foreground">
              {topSession ? sessionLabel(topSession.session) : "Sin sesión"}
            </p>
            <p className={cn("mt-1 font-mono text-sm font-semibold", signedTextClass(topSession?.pnl ?? 0))}>
              {topSession ? formatSignedCurrency(topSession.pnl) : "-"}
            </p>
          </div>
          <div className="col-span-2 border-t border-border/60 pt-4">
            <p className="text-xs text-muted-foreground">Sesión a vigilar</p>
            <p className="mt-1 font-medium text-foreground">
              {reviewSession ? sessionLabel(reviewSession.session) : "Sin sesión a vigilar"}
            </p>
            <p className={cn("mt-1 font-mono text-sm font-semibold", signedTextClass(reviewSession?.pnl ?? 0))}>
              {reviewSession ? formatSignedCurrency(reviewSession.pnl) : "-"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const PANEL_COMPARISON_DAYS = 30;
const DAY_SECONDS = 86_400;

function deltaTone(value: number): MetricDelta["tone"] {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

function pctChange(current: number, previous: number) {
  if (!Number.isFinite(previous) || previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function tradePerformance(trades: WorkspaceState["trades"]) {
  const executionNetPnls = trades.flatMap((trade) =>
    trade.executions.length
      ? trade.executions.map((execution) => execution.netPnl)
      : [trade.netPnl],
  );
  const netProfit = trades.reduce((sum, trade) => sum + trade.netPnl, 0);
  const wins = executionNetPnls.filter((netPnl) => netPnl > 0).length;
  const grossProfit = trades
    .filter((trade) => trade.netPnl > 0)
    .reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = Math.abs(
    trades
      .filter((trade) => trade.netPnl < 0)
      .reduce((sum, trade) => sum + trade.netPnl, 0),
  );

  return {
    netProfit,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? grossProfit : 0,
    winRatePct: executionNetPnls.length > 0 ? (wins / executionNetPnls.length) * 100 : 0,
  };
}

function tradesInRange(
  trades: WorkspaceState["trades"],
  startMs: number,
  endMs: number,
) {
  return trades.filter((trade) => {
    const closedAt = new Date(trade.closedAt).getTime();

    return Number.isFinite(closedAt) && closedAt >= startMs && closedAt < endMs;
  });
}

function nearestPointAtOrBefore(points: EquityChartPoint[], targetTime: number) {
  return [...points].reverse().find((point) => point.time <= targetTime);
}

function maxDrawdownPct(points: EquityChartPoint[]) {
  let peak = 0;
  let maxDrawdown = 0;

  points.forEach((point) => {
    peak = Math.max(peak, point.equity);
    if (peak > 0) {
      maxDrawdown = Math.max(maxDrawdown, ((peak - point.equity) / peak) * 100);
    }
  });

  return maxDrawdown;
}

function buildPanelMetricDeltas(
  workspace: WorkspaceState,
  activeAccount: TradingAccount | undefined,
): Record<"equity" | "pnl" | "profitFactor" | "winRate" | "drawdown", MetricDelta> {
  const equitySeries = buildEquityChartData(workspace, activeAccount);
  const latestEquityPoint = equitySeries.at(-1);
  const sevenDaysAgo = latestEquityPoint
    ? nearestPointAtOrBefore(equitySeries, latestEquityPoint.time - 7 * DAY_SECONDS)
    : undefined;
  const equityDelta = latestEquityPoint && sevenDaysAgo
    ? pctChange(latestEquityPoint.equity, sevenDaysAgo.equity)
    : 0;

  const tradeTimes = workspace.trades.reduce<number[]>((times, trade) => {
    const value = new Date(trade.closedAt).getTime();
    if (Number.isFinite(value)) times.push(value);
    return times;
  }, []);
  const latestTradeMs = tradeTimes.length > 0 ? Math.max(...tradeTimes) : Date.now();
  const currentStartMs = latestTradeMs - PANEL_COMPARISON_DAYS * DAY_SECONDS * 1000;
  const previousStartMs = latestTradeMs - PANEL_COMPARISON_DAYS * 2 * DAY_SECONDS * 1000;
  const currentPerformance = tradePerformance(
    tradesInRange(workspace.trades, currentStartMs, latestTradeMs + 1),
  );
  const previousPerformance = tradePerformance(
    tradesInRange(workspace.trades, previousStartMs, currentStartMs),
  );
  const pnlDelta = pctChange(currentPerformance.netProfit, previousPerformance.netProfit);
  const profitFactorDelta = currentPerformance.profitFactor - previousPerformance.profitFactor;
  const winRateDelta = currentPerformance.winRatePct - previousPerformance.winRatePct;
  const previousDrawdown = latestEquityPoint
    ? maxDrawdownPct(
        equitySeries.filter(
          (point) =>
            point.time >= latestEquityPoint.time - PANEL_COMPARISON_DAYS * 2 * DAY_SECONDS &&
            point.time < latestEquityPoint.time - PANEL_COMPARISON_DAYS * DAY_SECONDS,
        ),
      )
    : 0;
  const drawdownDelta =
    previousDrawdown > 0 ? workspace.risk.maxDrawdownPct - previousDrawdown : 0;

  return {
    equity: { value: equityDelta, label: "vs 7D", tone: deltaTone(equityDelta) },
    pnl: { value: pnlDelta, label: "vs periodo anterior", tone: deltaTone(pnlDelta) },
    profitFactor: {
      value: profitFactorDelta,
      suffix: "",
      label: "vs periodo anterior",
      tone: deltaTone(profitFactorDelta),
    },
    winRate: {
      value: winRateDelta,
      suffix: "",
      label: "vs periodo anterior",
      tone: deltaTone(winRateDelta),
    },
    drawdown: {
      value: drawdownDelta,
      suffix: "",
      label: "vs periodo anterior",
      tone: deltaTone(drawdownDelta),
    },
  };
}

function OverviewSection({ workspace }: { workspace: WorkspaceState }) {
  const activeAccount =
    workspace.accounts.find((account) => account.id === workspace.activeAccountId) ??
    workspace.accounts[0];
  const performance = buildDashboardPerformance(workspace, { preferActiveTrades: true });
  const metricDeltas = buildPanelMetricDeltas(workspace, activeAccount);

  return (
    <div className="flex flex-col gap-4">
      <SummaryHeroCard
        workspace={workspace}
        activeAccount={activeAccount}
      />

      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          title="Capital activo"
          value={activeAccount?.equity ?? 0}
          suffix={` ${activeAccount?.baseCurrency ?? "USD"}`}
          caption="Equity de la cuenta activa"
          tone="neutral"
          delta={metricDeltas.equity}
        />
        <MetricCard
          title="PnL"
          value={performance.netProfit}
          suffix={` ${activeAccount?.baseCurrency ?? "USD"}`}
          caption={`${performance.totalTrades} operaciones cerradas`}
          tone={performance.netProfit > 0 ? "positive" : performance.netProfit < 0 ? "negative" : "neutral"}
          delta={metricDeltas.pnl}
        />
        <MetricCard
          title="PF"
          value={performance.profitFactor}
          decimals={2}
          caption="Ratio ganancia / pérdida"
          tone={
            performance.profitFactor >= 1
              ? "neutral"
              : performance.profitFactor < 1
                ? "negative"
                : "neutral"
          }
          delta={metricDeltas.profitFactor}
        />
        <MetricCard
          title="Win rate"
          value={performance.winRatePct}
          suffix="%"
          decimals={1}
          caption={`${performance.winCount} ganadoras / ${performance.lossCount} perdedoras`}
          tone={performance.winRatePct >= 50 ? "neutral" : "negative"}
          delta={metricDeltas.winRate}
        />
        <MetricCard
          title="DD"
          value={workspace.risk.maxDrawdownPct}
          suffix="%"
          decimals={2}
          caption={`Límite ${formatPercent(workspace.risk.maxLimitPct, 2)}`}
          tone={
            workspace.risk.maxLimitPct > 0 &&
            workspace.risk.maxDrawdownPct >= workspace.risk.maxLimitPct * 0.8
              ? "negative"
              : "neutral"
          }
          delta={metricDeltas.drawdown}
        />
      </div>

      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="grid min-w-0 gap-4 xl:h-full xl:grid-rows-[auto_auto_minmax(0,1fr)]">
          <EquityCurveCard workspace={workspace} activeAccount={activeAccount} />
          <RecentTradesCard workspace={workspace} className="h-full" />
          <NewsRiskCard workspace={workspace} />
        </div>
        <div className="grid min-w-0 content-start gap-4">
          <DecisionControlCard workspace={workspace} />
          <PanelInsightsCompact workspace={workspace} />
        </div>
      </div>
    </div>
  );
}

export function MesaDashboard({ workspace }: { workspace: WorkspaceState }) {
  return <OverviewSection workspace={workspace} />;
}
