"use client";

import * as React from "react";
import Link from "next/link";
import { Liveline, type LivelinePoint, type LivelineSeries, type ThemeMode } from "liveline";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { AnimatedProgress } from "@/components/uitripled/animated-progress-shadcnui";
import { FunnelChart } from "@/components/charts/funnel-chart";
import { Gauge as GaugeChart } from "@/components/charts/gauge";
import { GlassWalletCard } from "@/components/uitripled/glass-wallet-card-shadcnui";
import { AnimatedGradient, type CustomConfig } from "@/components/ui/animated-gradient";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { TradingAccount } from "@/lib/contracts/account";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import {
  getCalendarPeriodOverview,
  monthKeyFromTradingDayKey,
  shiftMonthKey,
  tradingDayKeyToUtcDate,
} from "@/lib/domain/calendar-selectors";
import {
  getPortfolioOverview,
  getPortfolioPolicyReadiness,
} from "@/lib/domain/portfolio-selectors";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/formatters/numbers";
import { signedTextClass } from "@/lib/domain/semantic-colors";
import {
  livelineWindowForData,
  normalizeLivelinePoints,
  prepareHistoricalLivelineCurve,
} from "@/lib/charts/liveline-points";
import {
  formatResponsiveLivelineCurrency,
  formatResponsiveLivelinePercent,
  livelinePadding,
} from "@/lib/charts/liveline-layout";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const PORTFOLIO_PERIOD_OPTIONS = ["7D", "30D", "90D", "YTD"] as const;
type PortfolioPeriodOption = (typeof PORTFOLIO_PERIOD_OPTIONS)[number];
type PortfolioDisplayMode = "capital" | "percent";
type PortfolioComparisonMode = "start" | "common";
type PortfolioUiState = {
  comparisonMode: PortfolioComparisonMode;
  comparisonPeriod: PortfolioPeriodOption;
  displayMode: PortfolioDisplayMode;
  period: PortfolioPeriodOption;
  selectedCalendarDayKey: string;
  selectedCalendarMonthKey: string;
};
type PortfolioUiAction =
  | { type: "selectCalendarDay"; dayKey: string }
  | { type: "selectCalendarMonth"; dayKey: string; monthKey: string }
  | { type: "setComparisonMode"; comparisonMode: PortfolioComparisonMode }
  | { type: "setComparisonPeriod"; comparisonPeriod: PortfolioPeriodOption }
  | { type: "setDisplayMode"; displayMode: PortfolioDisplayMode }
  | { type: "setPeriod"; period: PortfolioPeriodOption };

function createInitialPortfolioUiState({
  selectedCalendarDayKey,
  selectedCalendarMonthKey,
}: {
  selectedCalendarDayKey: string;
  selectedCalendarMonthKey: string;
}): PortfolioUiState {
  return {
    comparisonMode: "start",
    comparisonPeriod: "30D",
    displayMode: "capital",
    period: "30D",
    selectedCalendarDayKey,
    selectedCalendarMonthKey,
  };
}

function portfolioUiReducer(
  state: PortfolioUiState,
  action: PortfolioUiAction,
): PortfolioUiState {
  switch (action.type) {
    case "selectCalendarDay":
      return { ...state, selectedCalendarDayKey: action.dayKey };
    case "selectCalendarMonth":
      return {
        ...state,
        selectedCalendarDayKey: action.dayKey,
        selectedCalendarMonthKey: action.monthKey,
      };
    case "setComparisonMode":
      return { ...state, comparisonMode: action.comparisonMode };
    case "setComparisonPeriod":
      return { ...state, comparisonPeriod: action.comparisonPeriod };
    case "setDisplayMode":
      return { ...state, displayMode: action.displayMode };
    case "setPeriod":
      return { ...state, period: action.period };
  }
}
const PORTFOLIO_FALLBACK_EPOCH_SECONDS = 1_777_593_600;
const PORTFOLIO_SERIES_COLORS = [
  "#8b5cf6",
  "#22c55e",
  "#38bdf8",
  "#f59e0b",
  "#f43f5e",
  "#14b8a6",
  "#a3e635",
  "#f97316",
];
const PORTFOLIO_READINESS_STATUS_LABELS = {
  empty: "Sin cuentas",
  partial: "Reglas parciales",
  requires_review: "Requiere revisión",
  ready: "Lista",
} as const;
const ALLOCATION_FUNNEL_COLORS = [
  "oklch(0.84 0 0)",
  "oklch(0.68 0 0)",
  "oklch(0.47 0 0)",
  "oklch(0.38 0 0)",
  "oklch(0.31 0 0)",
  "oklch(0.28 0 0)",
  "oklch(0.22 0 0)",
];
const MAX_ALLOCATION_FUNNEL_SEGMENTS = 5;
const LIVELINE_ACCENT_BY_THEME = {
  dark: "#f5f5f5",
  light: "#171717",
} satisfies Record<ThemeMode, string>;

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

function useReferenceLivelineTheme() {
  const isLight = React.useSyncExternalStore(
    subscribeThemeClass,
    getThemeClassSnapshot,
    () => false,
  );
  const theme = (isLight ? "light" : "dark") as ThemeMode;

  return {
    theme,
    accent: LIVELINE_ACCENT_BY_THEME[theme],
  };
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function periodStartFromLatest(latestEpochMs: number, period: PortfolioPeriodOption) {
  const latestDate = new Date(latestEpochMs);

  if (period === "YTD") {
    return Date.UTC(latestDate.getUTCFullYear(), 0, 1);
  }

  const days = period === "7D" ? 7 : period === "30D" ? 30 : 90;

  return latestEpochMs - (days - 1) * 86_400_000;
}

function tradingDayKeyToTime(tradingDayKey: string) {
  const parsed = Date.parse(`${tradingDayKey}T00:00:00.000Z`);

  return Number.isFinite(parsed) ? parsed : null;
}

const SHORT_DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});
const SHORT_DAY_LABEL_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
});

function shortDateLabel(epochMs: number) {
  return SHORT_DATE_LABEL_FORMATTER.format(new Date(epochMs));
}

function getPeriodCapitalCurve(
  data: LivelinePoint[],
  periodStartMs: number,
): LivelinePoint[] {
  if (data.length < 2) return data;

  const periodStartSecs = Math.floor(periodStartMs / 1000);
  const visible = data.filter((point) => point.time >= periodStartSecs);

  if (visible.length >= 2) return visible;

  const previous = data.findLast((point) => point.time < periodStartSecs);

  if (visible.length === 1 && previous) {
    return [previous, visible[0]];
  }

  return data.slice(-Math.min(12, data.length));
}

function getAccountPeriodCurve(
  account: TradingAccount,
  periodStartMs: number,
): LivelinePoint[] {
  const source = normalizeLivelinePoints(
    (account.equityHistory ?? []).flatMap((point) => {
      if (!point.timestamp) return [];
      const time = Date.parse(point.timestamp);

      return Number.isFinite(time) && Number.isFinite(point.value)
        ? [{ time: Math.floor(time / 1000), value: point.value }]
        : [];
    }),
    60,
  );

  if (source.length < 2) return [];

  const periodStartSecs = Math.floor(periodStartMs / 1000);
  const visible = source.filter((point) => point.time >= periodStartSecs);

  if (visible.length >= 2) return visible;

  const previous = source.findLast((point) => point.time < periodStartSecs);
  if (previous && visible[0]) return [previous, visible[0]];

  return [];
}

function getLivelineValueAt(points: LivelinePoint[], time: number) {
  const first = points[0];
  const last = points.at(-1);

  if (!first || !last) return 0;
  if (time <= first.time) return first.value;
  if (time >= last.time) return last.value;

  const rightIndex = points.findIndex((point) => point.time >= time);
  const right = points[rightIndex];
  const left = points[Math.max(0, rightIndex - 1)];

  if (!left || !right) return last.value;
  if (right.time === left.time) return right.value;

  const ratio = (time - left.time) / (right.time - left.time);

  return left.value + (right.value - left.value) * ratio;
}

function getCommonPeriodReturnCurve(
  points: LivelinePoint[],
  commonStartSecs: number,
): LivelinePoint[] {
  const startValue = getLivelineValueAt(points, commonStartSecs);
  if (startValue <= 0) return [];

  const visible = points.filter((point) => point.time > commonStartSecs);
  const rebased = [
    { time: commonStartSecs, value: 0 },
    ...visible.map((point) => ({
      time: point.time,
      value: Number((((point.value - startValue) / startValue) * 100).toFixed(3)),
    })),
  ];

  return normalizeLivelinePoints(rebased, 60);
}

function getStartPeriodReturnCurve(points: LivelinePoint[]): LivelinePoint[] {
  const startValue = points[0]?.value ?? 0;
  if (startValue <= 0) return [];

  return normalizeLivelinePoints(
    points.map((point) => ({
      time: point.time,
      value: Number((((point.value - startValue) / startValue) * 100).toFixed(3)),
    })),
    60,
  );
}

function toStaticLivelineTimeline<T extends { time: number; value: number }>(
  data: T[],
  {
    endOffsetSecs = 120,
    minSpanSecs = 0,
    minStepSecs = 60,
  }: {
    endOffsetSecs?: number;
    minSpanSecs?: number;
    minStepSecs?: number;
  } = {},
): LivelinePoint[] {
  if (data.length < 2) {
    return data.map((point) => ({ time: point.time, value: point.value }));
  }

  const firstTime = data[0].time;
  const lastTime = data.at(-1)?.time ?? firstTime;
  const sourceSpan = Math.max(1, lastTime - firstTime);
  const targetSpan = Math.max(
    sourceSpan,
    minSpanSecs,
    (data.length - 1) * minStepSecs,
  );
  const targetEnd = Math.floor(Date.now() / 1000) - endOffsetSecs;
  const targetStart = targetEnd - targetSpan;

  return data.map((point, index) => {
    const ratio =
      lastTime > firstTime
        ? (point.time - firstTime) / sourceSpan
        : index / Math.max(1, data.length - 1);

    return {
      time: Math.round(targetStart + targetSpan * ratio),
      value: point.value,
    };
  });
}

function portfolioWindowSecsForPeriod(period: PortfolioPeriodOption) {
  if (period === "7D") return 604_800;
  if (period === "30D") return 2_592_000;
  if (period === "90D") return 7_776_000;

  return 31_536_000;
}

type PageMotionProps = {
  children: React.ReactNode;
};

function PageMotion({ children }: PageMotionProps) {
  return <div>{children}</div>;
}

function toneBadgeVariant(
  tone: "connected" | "syncing" | "stale" | "warning" | "danger",
) {
  if (tone === "danger") return "destructive" as const;
  if (tone === "warning") return "secondary" as const;
  if (tone === "stale") return "outline" as const;
  return "default" as const;
}

function formatConnectionStateLabel(state: TradingAccount["connectionState"]) {
  const labels: Record<TradingAccount["connectionState"], string> = {
    connected: "Conectada",
    syncing: "Sincronizando",
    stale: "Desactualizada",
    pending: "Pendiente",
    plan_limited: "Plan limitado",
    error: "Error",
  };

  return labels[state];
}

function shortDayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return SHORT_DAY_LABEL_FORMATTER.format(date);
}

type PortfolioGradientTheme = Omit<CustomConfig, "preset" | "speed">;

const DEFAULT_PORTFOLIO_GRADIENT_THEME: PortfolioGradientTheme = {
  color1: "#070707",
  color2: "#1c1c1c",
  color3: "#a3a3a3",
  rotation: 45,
  proportion: 50,
  scale: 0.3,
  distortion: 10,
  swirl: 30,
  swirlIterations: 5,
  softness: 100,
  offset: 0,
  shape: "Checks",
  shapeSize: 60,
};

const PORTFOLIO_LOGO_GRADIENT_THEMES = [
  {
    tokens: ["darwin"],
    theme: {
      color1: "#06111d",
      color2: "#123f8c",
      color3: "#d6e54a",
      rotation: -34,
      proportion: 56,
      scale: 0.34,
      distortion: 15,
      swirl: 36,
      swirlIterations: 6,
      softness: 92,
      offset: 80,
      shape: "Edge",
      shapeSize: 48,
    },
  },
  {
    tokens: ["ftmo"],
    theme: {
      color1: "#05080d",
      color2: "#16406f",
      color3: "#8ab4f8",
      rotation: -55,
      proportion: 54,
      scale: 0.32,
      distortion: 12,
      swirl: 36,
      swirlIterations: 6,
      softness: 96,
      offset: 60,
      shape: "Edge",
      shapeSize: 50,
    },
  },
  {
    tokens: ["orion", "ogm"],
    theme: {
      color1: "#140900",
      color2: "#5a2403",
      color3: "#fb923c",
      rotation: 115,
      proportion: 62,
      scale: 0.36,
      distortion: 14,
      swirl: 34,
      swirlIterations: 8,
      softness: 90,
      offset: 220,
      shape: "Stripes",
      shapeSize: 46,
    },
  },
  {
    tokens: ["funding pips"],
    theme: {
      color1: "#03120f",
      color2: "#0b3b35",
      color3: "#5eead4",
      rotation: -25,
      proportion: 58,
      scale: 0.38,
      distortion: 18,
      swirl: 42,
      swirlIterations: 7,
      softness: 88,
      offset: 120,
      shape: "Edge",
      shapeSize: 42,
    },
  },
  {
    tokens: ["5ers", "the5ers"],
    theme: {
      color1: "#07110f",
      color2: "#0f4f46",
      color3: "#9debdc",
      rotation: 36,
      proportion: 52,
      scale: 0.34,
      distortion: 14,
      swirl: 39,
      swirlIterations: 7,
      softness: 92,
      offset: -40,
      shape: "Checks",
      shapeSize: 54,
    },
  },
  {
    tokens: ["ic markets", "icmarkets"],
    theme: {
      color1: "#100507",
      color2: "#4b1018",
      color3: "#fb7185",
      rotation: 24,
      proportion: 48,
      scale: 0.34,
      distortion: 16,
      swirl: 38,
      swirlIterations: 6,
      softness: 92,
      offset: -80,
      shape: "Checks",
      shapeSize: 54,
    },
  },
  {
    tokens: ["pepperstone"],
    theme: {
      color1: "#061005",
      color2: "#174d1f",
      color3: "#86efac",
      rotation: -18,
      proportion: 57,
      scale: 0.36,
      distortion: 15,
      swirl: 34,
      swirlIterations: 6,
      softness: 94,
      offset: 160,
      shape: "Edge",
      shapeSize: 44,
    },
  },
] satisfies Array<{
  tokens: string[];
  theme: PortfolioGradientTheme;
}>;

function portfolioCompanyName(account: TradingAccount) {
  return account.funding?.firm || account.broker;
}

function portfolioCompanyLogoUrl(account: TradingAccount) {
  const source = [
    account.funding?.firm,
    account.label,
    account.broker,
    account.server,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (source.includes("ftmo")) return "/brand-logos/ftmo.png";
  if (source.includes("darwin")) return "/brand-logos/darwinex-zero.webp";
  if (source.includes("orion") || source.includes("ogm")) {
    return "/brand-logos/orion-funded.jpeg";
  }
  if (source.includes("funding pips")) return "/brand-logos/the-funding-pips.jpeg";
  if (source.includes("wsf")) return "/brand-logos/wsf.png";
  if (source.includes("5ers") || source.includes("the5ers")) {
    return "/brand-logos/the5ers.png";
  }
  if (source.includes("ic markets") || source.includes("icmarkets")) {
    return "/brand-logos/ic-markets.png";
  }
  if (source.includes("pepperstone")) return "/brand-logos/pepperstone.svg";

  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    portfolioCompanyName(account),
  )}&background=111111&color=ffffff&bold=true`;
}

function portfolioGradientSeed(accountId: string) {
  return Array.from(accountId).reduce(
    (seed, character) => seed + character.charCodeAt(0),
    0,
  );
}

function portfolioGradientThemeForAccount(account: TradingAccount) {
  const source = [
    portfolioCompanyName(account),
    account.label,
    account.broker,
    account.server,
    account.funding?.firm,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    PORTFOLIO_LOGO_GRADIENT_THEMES.find(({ tokens }) =>
      tokens.some((token) => source.includes(token)),
    )?.theme ?? DEFAULT_PORTFOLIO_GRADIENT_THEME
  );
}

function portfolioGradientConfig(account: TradingAccount, index: number): CustomConfig {
  const idSeed = portfolioGradientSeed(account.id);
  const theme = portfolioGradientThemeForAccount(account);

  return {
    preset: "custom",
    ...theme,
    offset: (theme.offset ?? 0) + (idSeed % 180),
    speed: 6 + ((idSeed + index * 3) % 10),
  };
}

function portfolioRuleBadgeLabel(row: {
  ruleSource: "Definidas" | "Heredadas" | "Revisar";
  type: "Fondeo" | "Darwinex" | "Real";
}) {
  if (row.ruleSource === "Definidas") return "Reglas propias";
  if (row.ruleSource === "Heredadas") return "Reglas de fondeo";
  if (row.type === "Real" || row.type === "Darwinex") return "Cuenta real";

  return "Configurar reglas";
}

function formatPortfolioRole(role: string) {
  const labels: Record<string, string> = {
    lead: "Cuenta principal",
    follower: "Cuenta secundaria",
    challenge: "Reto de fondeo",
    payout_protection: "Cuenta fondeada",
    experimental: "Pruebas",
    own_capital: "Cuenta real propia",
    requires_review: "Definir tipo",
  };

  return labels[role] ?? role;
}

function formatPortfolioBlocker(blocker: string, accounts: TradingAccount[]) {
  const [accountId, reason] = blocker.includes(":")
    ? blocker.split(":")
    : [null, blocker];
  const accountLabel = accountId
    ? accounts.find((account) => account.id === accountId)?.label
    : null;
  const labels: Record<string, string> = {
    missing_portfolio_policy: "Falta definir reglas generales de capital",
    missing_portfolio_account_policy: "Falta definir reglas para la cuenta",
    missing_risk_budget: "Falta definir riesgo asignado",
    plan_limited: "Plan limitado",
    stale_sync: "Datos desactualizados",
  };
  const readableReason = labels[reason] ?? reason;

  return accountLabel ? `${accountLabel}: ${readableReason}` : readableReason;
}

function buildAccountRows(workspace: WorkspaceState) {
  const totalEquity = workspace.accounts.reduce(
    (sum, account) => sum + account.equity,
    0,
  );

  return workspace.accounts.map((account) => ({
    ...account,
    sharePct: totalEquity > 0 ? (account.equity / totalEquity) * 100 : 0,
  }));
}

function formatCalendarValue(
  value: number,
  mode: "currency" | "percent",
  baseCapital: number,
) {
  if (mode === "percent") {
    return baseCapital > 0 ? formatPercent((value / baseCapital) * 100, 2) : "—";
  }

  return formatSignedCurrency(value);
}

function allocationFunnelVisualPct(index: number, total: number) {
  if (total <= 1) return 100;

  const minPct = 8;
  const progress = index / (total - 1);
  return Math.round(100 - progress * (100 - minPct));
}

function compactAllocationLabel(label: string) {
  const cleaned = label
    .replace(/\s+/g, " ")
    .replace(/\b(Account|Cuenta)\b/gi, "")
    .replace(/\b(Challenge|Evaluation|Funded)\b/gi, "")
    .trim();

  if (cleaned.length <= 18) return cleaned || label;
  return `${cleaned.slice(0, 17).trimEnd()}…`;
}

function useCapitalReferenceModel(workspace: WorkspaceState) {
  const portfolioChartTheme = useReferenceLivelineTheme();
  const initialPortfolioCalendarOverview = React.useMemo(
    () => getCalendarPeriodOverview(workspace),
    [workspace],
  );
  const [portfolioUiState, dispatchPortfolioUi] = React.useReducer(
    portfolioUiReducer,
    {
      selectedCalendarDayKey:
        initialPortfolioCalendarOverview.latestDay?.tradingDayKey ?? "",
      selectedCalendarMonthKey:
        initialPortfolioCalendarOverview.selectedMonthKey,
    },
    createInitialPortfolioUiState,
  );
  const {
    comparisonMode: portfolioComparisonMode,
    comparisonPeriod: portfolioComparisonPeriod,
    displayMode: portfolioDisplayMode,
    period: portfolioPeriod,
    selectedCalendarDayKey: portfolioCalendarDayKey,
    selectedCalendarMonthKey: portfolioCalendarMonthKey,
  } = portfolioUiState;
  const portfolioCalendarOverview = React.useMemo(
    () =>
      getCalendarPeriodOverview(workspace, {
        selectedMonthKey: portfolioCalendarMonthKey,
        selectedDayKey: portfolioCalendarDayKey,
        viewMode: "month",
      }),
    [portfolioCalendarDayKey, portfolioCalendarMonthKey, workspace],
  );
  const portfolio = workspace.portfolio?.portfolios[0] ?? null;
  const portfolioOverview = getPortfolioOverview(workspace);
  const {
    accountRows,
    allocationRows,
    capitalCurveSeries,
    capitalCurveDisplaySeries,
    concentrationRows,
    connectedAccounts,
    contributionRows,
    heatSharePct: heatShare,
    policyBlockers,
    portfolioReadiness,
    portfolioReturnPct,
    staleAccounts,
    topExposure,
    totalEquity,
    totalPnl,
  } = portfolioOverview;
  const {
    activeDaysInMonth: portfolioCalendarActiveDays,
    bestPeriodDay: portfolioCalendarBestDay,
    monthWeekRows: portfolioCalendarWeekRows,
    reviewDay: portfolioCalendarReviewDay,
    selectedDayKey: portfolioCalendarSelectedDayKey,
    selectedMonth: portfolioCalendarSelectedMonth,
    selectedMonthKey: portfolioCalendarSelectedMonthKey,
    selectedPeriodPnl: portfolioCalendarPnl,
    selectedPeriodTrades: portfolioCalendarTrades,
    worstPeriodDay: portfolioCalendarWorstDay,
  } = portfolioCalendarOverview;
  const baseCurrency = portfolio?.baseCurrency ?? accountRows[0]?.baseCurrency ?? "USD";
  const portfolioCalendarValueMode: "currency" | "percent" =
    portfolioDisplayMode === "capital" ? "currency" : "percent";
  const portfolioCalendarBaseCapital = Math.max(1, totalEquity);
  const portfolioCalendarMonthTitle =
    portfolioCalendarSelectedMonth.label.charAt(0).toUpperCase() +
    portfolioCalendarSelectedMonth.label.slice(1);
  const handlePortfolioCalendarMonthSelect = React.useCallback(
    (monthKey: string) => {
      const nextDay = portfolioCalendarOverview.days.find(
        (day) => monthKeyFromTradingDayKey(day.tradingDayKey) === monthKey,
      );
      dispatchPortfolioUi({
        type: "selectCalendarMonth",
        dayKey: nextDay?.tradingDayKey ?? "",
        monthKey,
      });
    },
    [portfolioCalendarOverview.days],
  );
  const portfolioStatusLabel = portfolio
    ? {
        active: "Activo",
        paused: "Pausado",
        archived: "Archivado",
        requires_review: "Requiere revisión",
      }[portfolio.status]
    : "Sin reglas generales";
  const maxAbsPnl = Math.max(
    1,
    ...contributionRows.map((item) => Math.abs(item.account.totalPnl)),
  );
  const dominantAllocation = allocationRows[0] ?? null;
  const bestContribution = contributionRows[0] ?? null;
  const weakestContribution = contributionRows.at(-1) ?? null;
  const accountToReview =
    allocationRows.find((row) => row.action !== "Mantener") ??
    allocationRows.find((row) => row.ruleSource === "Revisar") ??
    null;
  const latestDailyTime =
    workspace.analytics.daily.reduce<number | null>((latest, day) => {
      const dayTime = tradingDayKeyToTime(day.tradingDayKey);
      if (dayTime === null) return latest;
      return latest === null ? dayTime : Math.max(latest, dayTime);
    }, null) ??
    (capitalCurveDisplaySeries.at(-1)?.time ?? PORTFOLIO_FALLBACK_EPOCH_SECONDS) * 1000;
  const periodStartMs = periodStartFromLatest(latestDailyTime, portfolioPeriod);
  const periodDailyRows = workspace.analytics.daily.filter((day) => {
    const dayTime = tradingDayKeyToTime(day.tradingDayKey);

    return dayTime === null ? true : dayTime >= periodStartMs;
  });
  const visibleDailyRows =
    periodDailyRows.length > 0 ? periodDailyRows : workspace.analytics.daily;
  const portfolioWindowSecs = portfolioWindowSecsForPeriod(portfolioPeriod);
  const portfolioComparisonWindowSecs = portfolioWindowSecsForPeriod(
    portfolioComparisonPeriod,
  );
  const periodCapitalCurve = getPeriodCapitalCurve(capitalCurveSeries, periodStartMs);
  const capitalCurveForChart =
    periodCapitalCurve.length > 0 && periodCapitalCurve.length < 12
      ? toStaticLivelineTimeline(periodCapitalCurve, {
          endOffsetSecs: 600,
          minSpanSecs: 86_400,
          minStepSecs: 3_600,
        })
      : periodCapitalCurve.length >= 2
        ? periodCapitalCurve
        : capitalCurveDisplaySeries;
  const comparisonPeriodStartMs = periodStartFromLatest(
    latestDailyTime,
    portfolioComparisonPeriod,
  );
  const capitalCurveBase =
    capitalCurveForChart[0]?.value ?? Math.max(1, totalEquity - totalPnl);
  const capitalChartData = capitalCurveForChart.map((point) => ({
    label: shortDateLabel(point.time * 1000),
    capital: point.value,
    percent: capitalCurveBase > 0 ? ((point.value - capitalCurveBase) / capitalCurveBase) * 100 : 0,
  }));
  const portfolioLivelineSource = capitalChartData.map((point, index) => ({
    time: capitalCurveForChart[index]?.time ?? PORTFOLIO_FALLBACK_EPOCH_SECONDS + index * 86_400,
    value: portfolioDisplayMode === "capital" ? point.capital : point.percent,
  }));
  const portfolioLivelineData = prepareHistoricalLivelineCurve(
    portfolioLivelineSource,
    {
      maxPoints: 64,
      minPoints: 28,
      minStepSecs: 1_800,
    },
  );
  const portfolioEffectiveWindowSecs = livelineWindowForData(
    portfolioLivelineData,
    portfolioWindowSecs,
    { minSecs: 86_400, maxPadSecs: 172_800 },
  );
  const portfolioLabelByTime = new Map(
    capitalChartData.map((point, index) => [
      capitalCurveForChart[index]?.time ?? PORTFOLIO_FALLBACK_EPOCH_SECONDS + index * 86_400,
      point.label,
    ]),
  );
  const portfolioChartLatest =
    portfolioLivelineSource.at(-1)?.value ??
    (portfolioDisplayMode === "capital" ? totalEquity : portfolioReturnPct);
  const portfolioComparisonSources = allocationRows
    .reduce<Array<{
      account: (typeof allocationRows)[number]["account"];
      data: ReturnType<typeof getAccountPeriodCurve>;
      index: number;
    }>>((series, row, index) => {
      const data = getAccountPeriodCurve(row.account, comparisonPeriodStartMs);

      if (data.length >= 2) {
        series.push({
          account: row.account,
          data,
          index,
        });
      }

      return series;
    }, []);
  const portfolioComparisonCommonStart =
    portfolioComparisonMode === "common" && portfolioComparisonSources.length >= 2
      ? Math.max(...portfolioComparisonSources.map((series) => series.data[0]?.time ?? 0))
      : 0;
  const portfolioComparisonDescription =
    portfolioComparisonMode === "common"
      ? "Rendimiento real normalizado desde el tramo común disponible por cuenta."
      : "Rendimiento real desde el primer histórico de equity disponible de cada cuenta.";
  const portfolioComparisonSeries = portfolioComparisonSources
    .flatMap<LivelineSeries>((source) => {
      const data =
        portfolioComparisonMode === "common"
          ? portfolioComparisonCommonStart
            ? getCommonPeriodReturnCurve(source.data, portfolioComparisonCommonStart)
            : []
          : getStartPeriodReturnCurve(source.data);
      const visualData = prepareHistoricalLivelineCurve(data, {
        maxPoints: 64,
        minPoints: 28,
        minStepSecs: 1_800,
      });
      const series = {
        id: source.account.id,
        label: source.account.label,
        color: PORTFOLIO_SERIES_COLORS[source.index % PORTFOLIO_SERIES_COLORS.length],
        data: visualData,
        value: data.at(-1)?.value ?? 0,
      };

      return series.data.length >= 2 ? [series] : [];
    });
  const portfolioComparisonData = normalizeLivelinePoints(
    portfolioComparisonSeries.flatMap((series) => series.data),
    60,
  );
  const portfolioComparisonEffectiveWindowSecs = livelineWindowForData(
    portfolioComparisonData,
    portfolioComparisonWindowSecs,
    { minSecs: 86_400, maxPadSecs: 172_800 },
  );
  const portfolioComparisonLatest = portfolioComparisonSeries[0]?.value ?? 0;
  const portfolioComparisonLeader =
    [...portfolioComparisonSeries].toSorted((a, b) => b.value - a.value)[0] ?? null;
  const portfolioComparisonLag =
    [...portfolioComparisonSeries].toSorted((a, b) => a.value - b.value)[0] ?? null;
  const portfolioComparisonSpread =
    portfolioComparisonLeader && portfolioComparisonLag
      ? portfolioComparisonLeader.value - portfolioComparisonLag.value
      : 0;
  const portfolioComparisonLabelByTime = new Map(
    portfolioComparisonData.map((point) => [
      point.time,
      shortDateLabel(point.time * 1000),
    ]),
  );
  const currentPeriodPnl = visibleDailyRows.reduce((sum, day) => sum + day.pnl, 0);
  const currentPeriodTrades = visibleDailyRows.reduce((sum, day) => sum + day.trades, 0);
  const currentPeriodWins = visibleDailyRows.reduce((sum, day) => sum + day.wins, 0);
  const currentPeriodLosses = visibleDailyRows.reduce((sum, day) => sum + day.losses, 0);
  const currentPeriodWinRate =
    currentPeriodWins + currentPeriodLosses > 0
      ? (currentPeriodWins / (currentPeriodWins + currentPeriodLosses)) * 100
      : null;
  const dominantShare = dominantAllocation?.allocationPct ?? 0;
  const concentrationScore = clampScore(100 - Math.max(0, dominantShare - 35) * 2.4);
  const riskScore = clampScore(100 - heatShare);
  const consistencyScore = clampScore(currentPeriodWinRate ?? 0);
  const growthScore = clampScore(50 + portfolioReturnPct * 4);
  const allocationScore = clampScore(
    consistencyScore * 0.25 +
      riskScore * 0.25 +
      concentrationScore * 0.25 +
      growthScore * 0.25,
  );
  const allocationScoreLabel =
    allocationScore >= 82
      ? "Portfolio preparado"
      : allocationScore >= 64
        ? "Requiere ajuste fino"
        : "Requiere revisión";
  const visibleClosedTrades = currentPeriodWins + currentPeriodLosses;
  const growthBarValue = Math.min(100, Math.abs(portfolioReturnPct));
  const portfolioCommand = !workspace.risk.allowNewTrades
    ? {
        label: "No añadir riesgo",
        title: workspace.risk.blockingRule ?? "Mesa de Riesgo recomienda revisar riesgo",
        detail: workspace.risk.actionRequired,
        tone: "negative",
      }
    : accountToReview
      ? {
          label: "Primero cerrar regla",
          title: accountToReview.account.label,
          detail:
            accountToReview.ruleSource === "Revisar"
              ? "Falta budget o límite de portfolio antes de escalar."
              : `${accountToReview.action} antes de aumentar exposición.`,
          tone: "warning",
        }
      : weakestContribution && weakestContribution.account.totalPnl < 0
        ? {
            label: "Reducir o aislar",
            title: weakestContribution.account.label,
            detail: `${formatSignedCurrency(
              weakestContribution.account.totalPnl,
              weakestContribution.account.baseCurrency,
            )} neto en el periodo visible.`,
            tone: "negative",
          }
        : bestContribution
          ? {
              label: "Escalar con control",
              title: bestContribution.account.label,
              detail: `${formatSignedCurrency(
                bestContribution.account.totalPnl,
                bestContribution.account.baseCurrency,
              )} neto sin superar límites de concentración.`,
              tone: "positive",
            }
          : {
              label: "Esperar datos",
              title: "Historial insuficiente",
              detail: "Conecta cuentas o amplía el periodo para decidir capital.",
              tone: "neutral",
            };
  const portfolioCommandHref =
    portfolioCommand.label === "No añadir riesgo" || topExposure?.tone !== "safe"
      ? "/risk"
      : "/accounts";
  const portfolioCommandCta =
    portfolioCommandHref === "/risk" ? "Abrir Mesa de Riesgo" : "Ver cuentas";
  const decisionContextRows = [
    {
      label: "Riesgo total abierto",
      value: formatPercent(workspace.risk.totalOpenRiskPct),
      detail: `Límite ${formatPercent(workspace.risk.heatLimitPct)}`,
    },
    {
      label: "Reglas listas",
      value: `${portfolioReadiness.readinessPct}%`,
      detail:
        portfolioReadiness.blockers.length > 0
          ? `${portfolioReadiness.blockers.length} pendientes`
          : "Cobertura completa",
    },
    {
      label: "Cuenta líder",
      value: dominantAllocation?.account.label ?? "Sin cuenta",
      detail: dominantAllocation
        ? `${dominantAllocation.allocationPct.toFixed(1)}% del capital`
        : "Sin asignación",
    },
  ];
  const healthMetricRows = [
    {
      label: "Consistencia",
      value: currentPeriodWinRate === null ? "Sin datos" : formatPercent(currentPeriodWinRate, 1),
      barValue: currentPeriodWinRate ?? 0,
      target: 70,
      tone: "neutral",
      note:
        visibleClosedTrades > 0
          ? `${currentPeriodWins} ganadas / ${currentPeriodLosses} perdidas`
          : "Sin cierres en el periodo",
    },
    {
      label: "Riesgo total abierto",
      value: formatPercent(workspace.risk.totalOpenRiskPct, 2),
      barValue: heatShare,
      target: null,
      tone: heatShare >= 80 ? "negative" : heatShare >= 50 ? "warning" : "neutral",
      note:
        heatShare > 0
          ? `${Math.round(heatShare)}% del límite ${formatPercent(workspace.risk.heatLimitPct, 2)}`
          : `Sin riesgo abierto / límite ${formatPercent(workspace.risk.heatLimitPct, 2)}`,
    },
    {
      label: "Diversificación",
      value: dominantAllocation ? `${dominantAllocation.allocationPct.toFixed(1)}%` : "Sin datos",
      barValue: dominantShare,
      target: 35,
      tone: dominantShare > 55 ? "warning" : "neutral",
      note: dominantAllocation
        ? `${dominantAllocation.account.label} cuenta líder`
        : "Sin cuenta líder",
    },
    {
      label: "Crecimiento",
      value: formatPercent(portfolioReturnPct, 2),
      barValue: growthBarValue,
      target: null,
      tone: portfolioReturnPct < 0 ? "negative" : portfolioReturnPct > 0 ? "positive" : "neutral",
      note: `${formatSignedCurrency(totalPnl, baseCurrency)} P&L agregado visible`,
    },
  ];
  const decisionRows = [
    bestContribution && bestContribution.account.totalPnl > 0
      ? {
          label: bestContribution.account.totalPnl >= 0 ? "Escalar candidata" : "Sin cuenta positiva",
          title: bestContribution.account.label,
          detail: `${formatSignedCurrency(
            bestContribution.account.totalPnl,
            bestContribution.account.baseCurrency,
          )} neto / ${bestContribution.allocationPct.toFixed(1)}% del portfolio`,
          tone: bestContribution.account.totalPnl >= 0 ? "positive" : "neutral",
        }
      : null,
    weakestContribution && weakestContribution.account.totalPnl < 0
      ? {
          label: "Reducir o aislar",
          title: weakestContribution.account.label,
          detail: `${formatSignedCurrency(
            weakestContribution.account.totalPnl,
            weakestContribution.account.baseCurrency,
          )} neto / ${weakestContribution.action.toLowerCase()}`,
          tone: "negative",
        }
      : null,
    topExposure && topExposure.tone !== "safe"
      ? {
          label: "Vigilar símbolo",
          title: topExposure.symbol,
          detail: `${formatPercent(topExposure.openRiskPct, 2)} de riesgo abierto. Evitar duplicar exposición.`,
          tone: "warning",
        }
      : null,
    dominantAllocation
      ? {
          label: "Peso dominante",
          title: dominantAllocation.account.label,
          detail: `${dominantAllocation.allocationPct.toFixed(1)}% del capital. ${
            dominantAllocation.allocationPct > 35
              ? "Mantener sin concentrar más."
              : "Peso operativo equilibrado."
          }`,
          tone: dominantAllocation.allocationPct > 35 ? "warning" : "neutral",
        }
      : null,
    portfolioReadiness.blockers.length > 0
      ? {
          label: "Reglas pendientes",
          title: `${portfolioReadiness.blockers.length} punto(s) por cerrar`,
          detail: "Completar budgets y límites antes de automatizar asignación.",
          tone: "warning",
        }
      : {
          label: "Reglas listas",
          title: "Cobertura completa",
          detail: "La asignación puede revisarse con menor fricción operativa.",
          tone: "positive",
        },
  ].filter((row): row is {
    label: string;
    title: string;
    detail: string;
    tone: string;
  } => Boolean(row));
  const allocationFunnelRows = [...allocationRows]
    .toSorted((left, right) => right.allocationPct - left.allocationPct);
  const allocationFunnelVisibleRows =
    allocationFunnelRows.length > MAX_ALLOCATION_FUNNEL_SEGMENTS
      ? allocationFunnelRows.slice(0, MAX_ALLOCATION_FUNNEL_SEGMENTS - 1)
      : allocationFunnelRows;
  const allocationFunnelRestRows =
    allocationFunnelRows.length > MAX_ALLOCATION_FUNNEL_SEGMENTS
      ? allocationFunnelRows.slice(MAX_ALLOCATION_FUNNEL_SEGMENTS - 1)
      : [];
  const allocationFunnelItems = [
    ...allocationFunnelVisibleRows.map((row) => ({
      accountCount: 1,
      allocationPct: row.allocationPct,
      baseCurrency: row.account.baseCurrency,
      chartLabel: compactAllocationLabel(row.account.label),
      equity: row.account.equity,
      id: row.account.id,
      isRest: false,
      label: row.account.label,
    })),
    ...(allocationFunnelRestRows.length > 0
      ? [
          {
            accountCount: allocationFunnelRestRows.length,
            allocationPct: allocationFunnelRestRows.reduce(
              (sum, row) => sum + row.allocationPct,
              0,
            ),
            baseCurrency:
              allocationFunnelRestRows[0]?.account.baseCurrency ??
              dominantAllocation?.account.baseCurrency ??
              "USD",
            chartLabel: "Resto",
            equity: allocationFunnelRestRows.reduce(
              (sum, row) => sum + row.account.equity,
              0,
            ),
            id: "allocation-rest",
            isRest: true,
            label: `Resto (${allocationFunnelRestRows.length})`,
          },
        ]
      : []),
  ];
  const allocationFunnelData = allocationFunnelItems.map((item, index) => ({
    label: item.chartLabel,
    value: allocationFunnelVisualPct(index, allocationFunnelItems.length),
    displayValue: formatCurrency(item.equity, item.baseCurrency),
    color: ALLOCATION_FUNNEL_COLORS[index] ?? "oklch(0.28 0 0)",
  }));
  const allocationFunnelLegend = allocationFunnelItems.map((item, index) => ({
    ...item,
    visualPct: allocationFunnelVisualPct(index, allocationFunnelItems.length),
  }));
  const riskDuplicationRows = [
    topExposure
      ? {
          label: "Símbolo con más riesgo",
          value: topExposure.symbol,
          metric: formatPercent(topExposure.openRiskPct, 2),
          state:
            topExposure.tone === "safe"
              ? "Exposición abierta controlada."
              : "No añadir tamaño sin revisar correlación.",
          tone: topExposure.tone === "safe" ? "neutral" : "warning",
        }
      : null,
    dominantAllocation
      ? {
          label: "Cuenta dominante",
          value: dominantAllocation.account.label,
          metric: `${dominantAllocation.allocationPct.toFixed(1)}%`,
          state:
            dominantAllocation.allocationPct >= 45
              ? "La asignación depende demasiado de una cuenta."
              : "Peso principal dentro de rango operativo.",
          tone: dominantAllocation.allocationPct >= 45 ? "warning" : "neutral",
        }
      : null,
    ...concentrationRows
      .filter((item) => item.label !== "Cuenta dominante" && item.label !== "Símbolo dominante")
      .slice(0, 2)
      .map((item) => ({
        ...item,
        tone: item.state.toLowerCase().includes("vigilar") || item.state.toLowerCase().includes("falta")
          ? "warning"
          : "neutral",
      })),
  ].filter((item): item is {
    label: string;
    value: string;
    metric: string;
    state: string;
    tone: string;
  } => Boolean(item));
  const kpiItems = [
    {
      label: "Capital total",
      value: formatCurrency(totalEquity),
      note: `${accountRows.length} cuentas visibles`,
    },
    {
      label: "Resultado neto",
      value: formatSignedCurrency(totalPnl),
      note: "P&L agregado visible",
    },
    {
      label: "Retorno",
      value: formatPercent(portfolioReturnPct, 2),
      note: "Sobre capital visible",
    },
    {
      label: "Riesgo total abierto",
      value: formatPercent(workspace.risk.totalOpenRiskPct),
      note: `Límite ${formatPercent(workspace.risk.heatLimitPct)}`,
    },
    {
      label: "Drawdown máx.",
      value: formatPercent(workspace.risk.maxDrawdownPct),
      note: `Límite ${formatPercent(workspace.risk.maxLimitPct)}`,
    },
    {
      label: "Conexión",
      value: `${connectedAccounts}/${accountRows.length}`,
      note: staleAccounts > 0 ? `${staleAccounts} por actualizar` : "Cuentas al día",
    },
  ];

  return {
    accountRows,
    allocationFunnelData,
    allocationFunnelLegend,
    allocationFunnelRestRows,
    allocationFunnelVisibleRows,
    allocationRows,
    allocationScore,
    allocationScoreLabel,
    baseCurrency,
    capitalCurveBase,
    contributionRows,
    currentPeriodPnl,
    currentPeriodTrades,
    currentPeriodWinRate,
    decisionContextRows,
    decisionRows,
    dispatchPortfolioUi,
    dominantAllocation,
    handlePortfolioCalendarMonthSelect,
    healthMetricRows,
    heatShare,
    kpiItems,
    maxAbsPnl,
    policyBlockers,
    portfolio,
    portfolioCalendarActiveDays,
    portfolioCalendarBaseCapital,
    portfolioCalendarBestDay,
    portfolioCalendarMonthTitle,
    portfolioCalendarPnl,
    portfolioCalendarReviewDay,
    portfolioCalendarSelectedDayKey,
    portfolioCalendarSelectedMonthKey,
    portfolioCalendarTrades,
    portfolioCalendarValueMode,
    portfolioCalendarWeekRows,
    portfolioCalendarWorstDay,
    portfolioChartLatest,
    portfolioChartTheme,
    portfolioCommand,
    portfolioCommandCta,
    portfolioCommandHref,
    portfolioComparisonData,
    portfolioComparisonDescription,
    portfolioComparisonEffectiveWindowSecs,
    portfolioComparisonLabelByTime,
    portfolioComparisonLatest,
    portfolioComparisonLeader,
    portfolioComparisonMode,
    portfolioComparisonPeriod,
    portfolioComparisonSeries,
    portfolioComparisonSpread,
    portfolioDisplayMode,
    portfolioEffectiveWindowSecs,
    portfolioLabelByTime,
    portfolioLivelineData,
    portfolioPeriod,
    portfolioReadiness,
    portfolioReturnPct,
    portfolioStatusLabel,
    portfolioWindowSecs,
    riskDuplicationRows,
    riskScore,
    staleAccounts,
    topExposure,
    totalEquity,
    totalPnl,
    visibleDailyRows,
    weakestContribution,
  };
}

type CapitalReferenceModel = ReturnType<typeof useCapitalReferenceModel>;

export function CapitalReferenceSection({
  workspace,
}: {
  workspace: WorkspaceState;
}) {
  const model = useCapitalReferenceModel(workspace);
  const isMobile = useIsMobile();

  return renderCapitalReferenceSection(workspace, model, isMobile);
}

function renderCapitalReferenceSection(
  workspace: WorkspaceState,
  model: CapitalReferenceModel,
  isMobile: boolean,
) {
  const {
    accountRows,
    allocationFunnelData,
    allocationFunnelLegend,
    allocationFunnelRestRows,
    allocationFunnelVisibleRows,
    allocationRows,
    allocationScore,
    allocationScoreLabel,
    baseCurrency,
    capitalCurveBase,
    contributionRows,
    currentPeriodPnl,
    currentPeriodTrades,
    currentPeriodWinRate,
    decisionContextRows,
    decisionRows,
    dispatchPortfolioUi,
    dominantAllocation,
    handlePortfolioCalendarMonthSelect,
    healthMetricRows,
    heatShare,
    kpiItems,
    maxAbsPnl,
    policyBlockers,
    portfolio,
    portfolioCalendarActiveDays,
    portfolioCalendarBaseCapital,
    portfolioCalendarBestDay,
    portfolioCalendarMonthTitle,
    portfolioCalendarPnl,
    portfolioCalendarReviewDay,
    portfolioCalendarSelectedDayKey,
    portfolioCalendarSelectedMonthKey,
    portfolioCalendarTrades,
    portfolioCalendarValueMode,
    portfolioCalendarWeekRows,
    portfolioCalendarWorstDay,
    portfolioChartLatest,
    portfolioChartTheme,
    portfolioCommand,
    portfolioCommandCta,
    portfolioCommandHref,
    portfolioComparisonData,
    portfolioComparisonDescription,
    portfolioComparisonEffectiveWindowSecs,
    portfolioComparisonLabelByTime,
    portfolioComparisonLatest,
    portfolioComparisonLeader,
    portfolioComparisonMode,
    portfolioComparisonPeriod,
    portfolioComparisonSeries,
    portfolioComparisonSpread,
    portfolioDisplayMode,
    portfolioEffectiveWindowSecs,
    portfolioLabelByTime,
    portfolioLivelineData,
    portfolioPeriod,
    portfolioReadiness,
    portfolioStatusLabel,
    riskDuplicationRows,
    staleAccounts,
    totalEquity,
  } = model;

  return (
    <PageMotion>
      <div className="grid gap-4">
        <section className="overflow-hidden rounded-xl border border-border/70 bg-card/60">
          <div className="grid xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{portfolioStatusLabel}</Badge>
                <Badge variant={workspace.risk.allowNewTrades ? "outline" : "destructive"}>
                  {workspace.risk.allowNewTrades ? "Riesgo operable" : "Riesgo bloqueado"}
                </Badge>
                <Badge variant={portfolioReadiness.blockers.length > 0 ? "secondary" : "outline"}>
                  {PORTFOLIO_READINESS_STATUS_LABELS[portfolioReadiness.status]}
                </Badge>
                {staleAccounts > 0 ? <Badge variant="secondary">Datos desactualizados</Badge> : null}
              </div>
              <h1 className="mt-4 font-heading text-3xl font-semibold tracking-tight text-foreground">
                {portfolio?.name ?? "Asignación de capital"}
              </h1>
              <p className="mt-2 max-w-3xl text-base text-muted-foreground">
                {portfolio?.objective ??
                  "Compara peso, aporte y riesgo por cuenta antes de mover tamaño."}
              </p>

              <div className="mt-6 overflow-hidden">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Asignación de mayor a menor
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {allocationFunnelRestRows.length > 0
                        ? `Top ${allocationFunnelVisibleRows.length} y resto agrupado. El desglose completo queda debajo.`
                        : "Efecto visual relativo frente al líder. La tabla inferior enseña el peso real."}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {dominantAllocation
                      ? `${dominantAllocation.allocationPct.toFixed(1)}% líder`
                      : "Sin asignación"}
                  </p>
                </div>

                {allocationFunnelData.length > 0 ? (
                  <div className="relative mt-4 overflow-visible sm:overflow-hidden">
                    <div className="sm:hidden">
                      <FunnelChart
                        color="oklch(0.82 0 0)"
                        data={allocationFunnelData}
                        edges="curved"
                        enterTransition={{
                          duration: 0.55,
                          ease: [0.4, 0, 0.2, 1],
                        }}
                        formatPercentage={(percentage) => `${Math.round(percentage)}%`}
                        gap={8}
                        grid={{
                          bands: false,
                          lineColor: "var(--border)",
                          lineOpacity: 0.65,
                          lineWidth: 1,
                          lines: true,
                        }}
                        labelLayout="spread"
                        layers={3}
                        orientation="vertical"
                        showLabels
                        showPercentage
                        showValues
                        staggerDelay={0.12}
                        style={{
                          height: Math.max(360, allocationFunnelData.length * 112),
                        }}
                      />
                    </div>
                    <div className="hidden sm:block">
                      <FunnelChart
                        className="h-[320px]"
                        color="oklch(0.82 0 0)"
                        data={allocationFunnelData}
                        edges="curved"
                        enterTransition={{
                          duration: 0.55,
                          ease: [0.4, 0, 0.2, 1],
                        }}
                        formatPercentage={(percentage) => `${Math.round(percentage)}%`}
                        gap={2}
                        grid={{
                          bands: false,
                          lineColor: "var(--border)",
                          lineOpacity: 0.8,
                          lineWidth: 1,
                          lines: true,
                        }}
                        labelLayout="spread"
                        layers={3}
                        orientation="horizontal"
                        showLabels
                        showPercentage
                        showValues
                        staggerDelay={0.12}
                      />
                    </div>
                    <div className="hidden border-t border-border/60 sm:block">
                      <div className="grid divide-y divide-border/50 sm:auto-cols-fr sm:grid-flow-col sm:divide-x sm:divide-y-0">
                        {allocationFunnelLegend.map((item) => (
                          <div
                            key={item.id}
                            className="grid min-h-[92px] min-w-0 content-center gap-2 p-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium leading-tight text-foreground">
                                {item.label}
                              </p>
                              <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
                                {formatCurrency(item.equity, item.baseCurrency)}
                              </p>
                            </div>
                            <div className="grid min-w-0 gap-1">
                              <p className="truncate font-mono text-[11px] font-medium leading-none text-muted-foreground">
                                {item.visualPct}% escala
                              </p>
                              <p className="truncate font-mono text-[11px] text-foreground">
                                {item.allocationPct.toFixed(1)}%
                                <span className="ml-1 text-muted-foreground">real</span>
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid h-32 place-items-center text-sm text-muted-foreground">
                    Sin cuentas conectadas para ordenar asignación.
                  </div>
                )}
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Capital bajo control
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">
                    {formatCurrency(totalEquity, baseCurrency)}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {accountRows.length} cuentas, base {baseCurrency}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Cuenta dominante
                  </p>
                  <p className="mt-2 text-xl font-semibold leading-tight text-foreground">
                    {dominantAllocation?.account.label ?? "Sin cuentas"}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {dominantAllocation
                      ? `${dominantAllocation.allocationPct.toFixed(1)}% del portfolio`
                      : "Sin capital asignado"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Reglas listas
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">
                    {portfolioReadiness.readinessPct}%
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {portfolioReadiness.blockers.length > 0
                      ? `${portfolioReadiness.blockers.length} punto(s) pendientes`
                      : "Sin bloqueos críticos visibles"}
                  </p>
                </div>
              </div>
            </div>

            <aside className="border-t border-border/60 bg-background/25 p-5 xl:border-l xl:border-t-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Plan de asignación
                  </p>
                  <h2 className="mt-2 font-heading text-xl font-semibold tracking-tight text-foreground">
                    {portfolioCommand.title}
                  </h2>
                </div>
                <Badge
                  variant={
                    portfolioCommand.tone === "negative"
                      ? "destructive"
                      : portfolioCommand.tone === "warning"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {portfolioCommand.label}
                </Badge>
              </div>

              <div className="mt-5 border-y border-border/60 py-4">
                <div
                  className={cn(
                    "border-l-2 pl-4",
                    portfolioCommand.tone === "positive" && "border-profit",
                    portfolioCommand.tone === "negative" && "border-loss",
                    portfolioCommand.tone === "warning" && "border-border",
                    portfolioCommand.tone === "neutral" && "border-border",
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Orden principal</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {portfolioCommand.detail}
                    </p>
                    <Link
                      href={portfolioCommandHref}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}
                    >
                      {portfolioCommandCta}
                      <ArrowUpRight data-icon="inline-end" />
                    </Link>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                {decisionContextRows.map((item) => (
                  <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="mt-1 truncate text-sm font-medium text-foreground">{item.value}</p>
                    </div>
                    <p className="self-end text-right text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                ))}
              </div>

              <Separator className="my-4" />

              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">Señales que explican la decisión</p>
                  <span className="text-xs text-muted-foreground">{decisionRows.length || 1}</span>
                </div>
                <div className="mt-3 grid gap-3">
                  {(decisionRows.length > 0 ? decisionRows : [{
                    label: "Esperar datos",
                    title: "Sin lectura secundaria",
                    detail: "Amplía el periodo o conecta más cuentas para elevar confianza.",
                    tone: "neutral",
                  }]).slice(0, 5).map((item, index) => (
                    <div key={`${item.label}-${item.title}`} className="relative grid gap-1 border-l border-border/70 pl-4">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute -left-[5px] top-1 size-2.5 rounded-full",
                          item.tone === "positive"
                            ? "bg-profit"
                            : item.tone === "negative"
                              ? "bg-loss"
                              : item.tone === "warning"
                                ? "bg-risk"
                                : "bg-muted-foreground",
                        )}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                          {index + 1}. {item.label}
                        </p>
                        <Badge variant="outline">{item.tone === "positive" ? "OK" : item.tone === "negative" ? "Reducir" : item.tone === "warning" ? "Vigilar" : "Info"}</Badge>
                      </div>
                      <p className="font-medium leading-tight text-foreground">{item.title}</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {kpiItems.map((item) => (
            <div key={item.label} className="rounded-lg border border-border/60 bg-card/60 p-3">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{item.value}</p>
              <p className="mt-2 text-xs text-muted-foreground">{item.note}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4">
          <Card className="border-border/70 bg-card/70">
            <CardHeader>
              <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div>
                  <CardTitle>Portfolio Health Score</CardTitle>
                  <CardDescription>
                    Evaluación integral del rendimiento y gestión de riesgo del portfolio.
                  </CardDescription>
                </div>
                <Badge variant={allocationScore >= 82 ? "outline" : "secondary"}>
                  {allocationScoreLabel}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-5 border-y border-border/60 py-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-center xl:grid-cols-[300px_minmax(0,1fr)]">
                <div className="grid justify-center lg:justify-start">
                  <div className="h-52 w-64 max-w-full">
                    <GaugeChart
                      activeFill="var(--foreground)"
                      activeFillOpacity={1}
                      centerValue={allocationScore}
                      defaultLabel="Score"
                      endAngle={389}
                      enterStaggerScale={1.05}
                      enterTransition={{ type: "tween", duration: 1.1, ease: [0.65, 0, 0.35, 1] }}
                      formatOptions={{ maximumFractionDigits: 0 }}
                      inactiveFill="var(--muted)"
                      inactiveFillOpacity={1}
                      labelClassName="text-xs uppercase tracking-[0.18em] text-muted-foreground"
                      notchCornerRadius={12}
                      notchLengthPercent={71}
                      spacing={50}
                      startAngle={31}
                      suffix="/100"
                      totalNotches={80}
                      uniformWidth={false}
                      useGradient={false}
                      value={allocationScore}
                      valueClassName="font-mono text-4xl font-semibold text-foreground"
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {healthMetricRows.map((item) => (
                    <div key={item.label} className="min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
                        </div>
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {item.value}
                        </span>
                      </div>
                      <figure
                        aria-label={`${item.label}: ${item.value}`}
                        className="m-0 mt-3"
                      >
                        <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "absolute inset-y-0 left-0 rounded-full",
                              item.tone === "positive" && "bg-profit",
                              item.tone === "negative" && "bg-loss",
                              item.tone === "warning" && "bg-risk",
                              item.tone === "neutral" && "bg-primary",
                            )}
                            style={{ width: `${Math.min(100, Math.max(0, item.barValue))}%` }}
                          />
                          {typeof item.target === "number" ? (
                            <span
                              className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-foreground/70"
                              style={{ left: `${Math.min(100, Math.max(0, item.target))}%` }}
                            />
                          ) : null}
                        </div>
                      </figure>
                      <p className="mt-2 truncate text-xs text-muted-foreground">{item.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/70">
            <CardHeader className="pb-3">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div>
                  <CardTitle>Equity global del portfolio</CardTitle>
                  <CardDescription>
                    Evolución agregada del capital visible en el periodo seleccionado.
                  </CardDescription>
                </div>
                <div className="flex flex-col gap-3 lg:items-end xl:flex-row xl:items-center xl:justify-end">
                  <div className="grid gap-1 text-left text-sm lg:text-right">
                    <span
                      className={cn(
                        "font-mono font-semibold",
                        currentPeriodPnl > 0 && "text-profit",
                        currentPeriodPnl < 0 && "text-loss",
                        currentPeriodPnl === 0 && "text-breakeven",
                      )}
                    >
                      {formatSignedCurrency(currentPeriodPnl, baseCurrency)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {currentPeriodTrades} operaciones /{" "}
                      {currentPeriodWinRate === null
                        ? "sin win rate"
                        : `${formatPercent(currentPeriodWinRate, 1)} win rate`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <ToggleGroup
                      aria-label="Temporalidad del gráfico de equity"
                      onValueChange={(value) => {
                        const nextValue = value[0] as PortfolioPeriodOption | undefined;

                        if (nextValue) {
                          dispatchPortfolioUi({
                            type: "setPeriod",
                            period: nextValue,
                          });
                        }
                      }}
                      size="sm"
                      spacing={1}
                      value={[portfolioPeriod]}
                      variant="outline"
                    >
                      {PORTFOLIO_PERIOD_OPTIONS.map((period) => (
                        <ToggleGroupItem className="h-11 min-w-11 sm:h-8 sm:min-w-10" key={period} value={period}>
                          {period}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                    <ToggleGroup
                      aria-label="Unidad del gráfico de equity"
                      onValueChange={(value) => {
                        const nextValue = value[0] as PortfolioDisplayMode | undefined;

                        if (nextValue) {
                          dispatchPortfolioUi({
                            type: "setDisplayMode",
                            displayMode: nextValue,
                          });
                        }
                      }}
                      size="sm"
                      spacing={1}
                      value={[portfolioDisplayMode]}
                      variant="outline"
                    >
                      <ToggleGroupItem className="h-11 min-w-16 sm:h-8" value="capital">
                        Capital
                      </ToggleGroupItem>
                      <ToggleGroupItem className="h-11 min-w-11 sm:h-8 sm:min-w-10" value="percent">
                        %
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5 pt-0">
              {portfolioLivelineData.length >= 2 ? (
                <div data-kmfx-liveline className="relative h-[300px] w-full md:h-[340px] xl:h-[380px]">
                  <div className="pointer-events-none absolute left-[18px] top-1 z-10 font-mono text-xl font-semibold tracking-normal text-foreground/90 md:text-2xl">
                    {portfolioDisplayMode === "capital"
                      ? formatCurrency(Number(portfolioChartLatest), baseCurrency)
                      : `${Number(portfolioChartLatest).toFixed(2)}%`}
                  </div>
                  <Liveline
                    badge
                    badgeVariant="minimal"
                    color={portfolioChartTheme.accent}
                    data={portfolioLivelineData}
                    emptyText="Historial insuficiente"
                    fill
                    formatTime={(time) => portfolioLabelByTime.get(time) ?? shortDateLabel(time * 1000)}
                    formatValue={(value) =>
                      portfolioDisplayMode === "capital"
                        ? formatResponsiveLivelineCurrency(Number(value), baseCurrency, isMobile)
                        : formatResponsiveLivelinePercent(Number(value), isMobile)
                    }
                    grid
                    badgeTail={!isMobile}
                    lineWidth={2.2}
                    momentum={false}
                    padding={livelinePadding(isMobile, {
                      top: 64,
                      right: 116,
                      bottom: 30,
                      left: 18,
                    })}
                    pulse
                    referenceLine={{
                      value: portfolioDisplayMode === "capital" ? capitalCurveBase : 0,
                      label: portfolioDisplayMode === "capital" ? "Base" : "0%",
                    }}
                    scrub
                    showValue={false}
                    style={{ height: "100%" }}
                    theme={portfolioChartTheme.theme}
                    value={portfolioChartLatest}
                    valueMomentumColor={false}
                    window={portfolioEffectiveWindowSecs}
                    windowStyle="rounded"
                  />
                </div>
              ) : (
                <div className="grid h-[300px] place-items-center border border-dashed border-border/70 bg-background/30 text-sm text-muted-foreground md:h-[340px] xl:h-[380px]">
                  Historial insuficiente para trazar curva de equity.
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {allocationRows.length > 0 ? allocationRows.map((row, index) => {
              const contributionTone =
                row.account.totalPnl < 0 ? "text-loss" : signedTextClass(row.account.totalPnl);
              const companyName = portfolioCompanyName(row.account);
              const logoUrl = portfolioCompanyLogoUrl(row.account);
              const gradientConfig = portfolioGradientConfig(row.account, index);

              return (
                <article
                  key={row.account.id}
                  className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/55 shadow-sm transition-all duration-300 hover:border-primary/35"
                >
                  <div className="relative h-32 overflow-hidden">
                    <AnimatedGradient config={gradientConfig} />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/25 to-transparent opacity-75 transition-opacity duration-300 group-hover:opacity-60" />
                    <div className="absolute left-4 top-4">
                      <Badge
                        variant={row.ruleSource === "Revisar" ? "secondary" : "outline"}
                        className="border-white/10 bg-background/55 backdrop-blur-md"
                      >
                        {portfolioRuleBadgeLabel(row)}
                      </Badge>
                    </div>
                    <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
                      <Avatar className="size-12 border border-white/20 bg-background/70 shadow-xl ring-4 ring-black/25">
                        <AvatarImage src={logoUrl} alt={companyName} />
                        <AvatarFallback>{companyName[0]}</AvatarFallback>
                      </Avatar>
                      <div className="rounded-full border border-white/10 bg-background/60 px-3 py-1.5 text-right text-xs font-medium text-foreground shadow-lg backdrop-blur-md">
                        {row.allocationPct.toFixed(1)}%
                        <span className="ml-1 text-muted-foreground">del portfolio</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <div className="h-[92px] min-w-0">
                      <p className="line-clamp-2 min-h-[3.25rem] text-xl font-semibold leading-tight text-foreground">
                        {row.account.label}
                      </p>
                      <p className="mt-2 truncate text-xs text-muted-foreground">
                        {companyName} · {row.type} · {row.role}
                      </p>
                    </div>

                    <div className="grid min-h-[154px] grid-cols-2 gap-x-4 gap-y-3 border-y border-border/50 py-4">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Capital</p>
                        <p className="mt-1 truncate font-mono text-sm font-medium text-foreground">
                          {formatCurrency(row.account.equity, row.account.baseCurrency)}
                        </p>
                      </div>
                      <div className="min-w-0 text-right">
                        <p className="text-xs text-muted-foreground">Aporte</p>
                        <p className={cn("mt-1 truncate text-sm font-semibold", contributionTone)}>
                          {formatSignedCurrency(
                            row.account.totalPnl,
                            row.account.baseCurrency,
                          )}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Riesgo por trade</p>
                        <p className="mt-1 text-sm font-medium text-foreground">
                          {row.riskBudgetPct === null
                            ? "No definido"
                            : formatPercent(row.riskBudgetPct)}
                        </p>
                      </div>
                      <div className="min-w-0 text-right">
                        <p className="text-xs text-muted-foreground">Máx. riesgo abierto</p>
                        <p className="mt-1 truncate text-sm font-medium text-foreground">
                          {row.maxHeatPct === null
                            ? "No definido"
                            : formatPercent(row.maxHeatPct)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-background/70">
                      <div
                        className="h-full rounded-full bg-foreground"
                        style={{ width: `${Math.max(row.allocationPct, 4)}%` }}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">Acción</p>
                      <Badge
                        variant={row.action === "Reducir" || row.action === "Definir reglas" ? "secondary" : "outline"}
                      >
                        {row.action}
                      </Badge>
                    </div>
                  </div>
                </article>
              );
          }) : (
            <div className="rounded-xl border border-border/70 bg-card/60 p-4 text-sm text-muted-foreground md:col-span-2 xl:col-span-4">
              Sin cuentas suficientes para crear tarjetas de portfolio.
            </div>
          )}
        </section>

        <Card className="border-border/70 bg-card/70">
          <CardHeader>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
              <div>
                <CardTitle>Comparativa por cuenta</CardTitle>
                <CardDescription>
                  {portfolioComparisonDescription}
                </CardDescription>
              </div>
              <div className="grid gap-2 lg:justify-items-end">
                <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                  <ToggleGroup
                    aria-label="Temporalidad de comparativa por cuenta"
                    onValueChange={(value) => {
                      const nextValue = value[0] as PortfolioPeriodOption | undefined;

                      if (nextValue) {
                        dispatchPortfolioUi({
                          type: "setComparisonPeriod",
                          comparisonPeriod: nextValue,
                        });
                      }
                    }}
                    size="sm"
                    spacing={1}
                    value={[portfolioComparisonPeriod]}
                    variant="outline"
                  >
                    {PORTFOLIO_PERIOD_OPTIONS.map((period) => (
                      <ToggleGroupItem className="h-11 min-w-11 sm:h-8 sm:min-w-10" key={period} value={period}>
                        {period}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <ToggleGroup
                    aria-label="Modo de comparativa por cuenta"
                    onValueChange={(value) => {
                      const nextValue = value[0] as PortfolioComparisonMode | undefined;

                      if (nextValue) {
                        dispatchPortfolioUi({
                          type: "setComparisonMode",
                          comparisonMode: nextValue,
                        });
                      }
                    }}
                    size="sm"
                    spacing={1}
                    value={[portfolioComparisonMode]}
                    variant="outline"
                  >
                    <ToggleGroupItem className="h-11 min-w-[76px] sm:h-8" value="start">
                      Inicio
                    </ToggleGroupItem>
                    <ToggleGroupItem className="h-11 min-w-[76px] sm:h-8" value="common">
                      Común
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="rounded-lg border border-border/60 bg-background/35 px-3 py-2 text-right">
                  <p className="text-xs text-muted-foreground">Unidad</p>
                  <p className="mt-1 font-mono text-sm font-medium text-foreground">% retorno</p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 px-5 pb-5">
            <div className="grid border-y border-border/60 md:grid-cols-3">
              <div className="py-3 md:px-3">
                <p className="text-xs text-muted-foreground">Cuenta líder</p>
                <p className="mt-1 truncate text-sm font-medium text-foreground">
                  {portfolioComparisonLeader?.label ?? "Sin lectura"}
                </p>
              </div>
              <div className="border-t border-border/60 py-3 md:border-l md:border-t-0 md:px-3">
                <p className="text-xs text-muted-foreground">Diferencial</p>
                <p className="mt-1 font-mono text-sm font-medium text-foreground">
                  {portfolioComparisonSpread.toFixed(2)} pts
                </p>
              </div>
              <div className="border-t border-border/60 py-3 md:border-l md:border-t-0 md:px-3">
                <p className="text-xs text-muted-foreground">Cuentas visibles</p>
                <p className="mt-1 font-mono text-sm font-medium text-foreground">
                  {portfolioComparisonSeries.length}
                </p>
              </div>
            </div>
            {portfolioComparisonSeries.length >= 2 && portfolioComparisonData.length >= 2 ? (
              <div data-kmfx-liveline className="h-[320px] w-full md:h-[360px]">
                <Liveline
                  badge={false}
                  color={portfolioChartTheme.accent}
                  data={portfolioComparisonSeries[0]?.data ?? []}
                  emptyText="Sin histórico por cuenta"
                  fill={false}
                  formatTime={(time) => portfolioComparisonLabelByTime.get(time) ?? shortDateLabel(time * 1000)}
                  formatValue={(value) =>
                    formatResponsiveLivelinePercent(Number(value), isMobile)
                  }
                  grid
                  lineWidth={2}
                  momentum={false}
                  padding={livelinePadding(isMobile, {
                    top: 18,
                    right: 92,
                    bottom: 34,
                    left: 18,
                  })}
                  pulse={false}
                  referenceLine={{ value: 0, label: "0%" }}
                  scrub
                  series={portfolioComparisonSeries}
                  seriesToggleCompact
                  showValue={false}
                  style={{ height: "100%" }}
                  theme={portfolioChartTheme.theme}
                  value={portfolioComparisonLatest}
                  window={portfolioComparisonEffectiveWindowSecs}
                />
              </div>
            ) : (
              <div className="grid h-[280px] place-items-center border border-dashed border-border/70 bg-background/30 text-sm text-muted-foreground">
                Hace falta histórico de equity en al menos dos cuentas para comparar curvas reales.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid gap-4">
            <Card className="border-border/70 bg-card/70">
              <CardHeader>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle>Asignación por cuenta</CardTitle>
                    <CardDescription>
                      Capital, rol, límites y acción recomendada por cuenta.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/accounts"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Ver cuentas
                    </Link>
                    <Link
                      href="/risk"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Revisar riesgo
                    </Link>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border/60 border-y border-border/60">
                  {allocationRows.length > 0 ? allocationRows.map((row) => (
                    <div
                      key={row.account.id}
                      className="grid gap-3 py-4 text-sm lg:grid-cols-[minmax(0,1.25fr)_minmax(0,.9fr)_minmax(0,1.2fr)_minmax(0,.85fr)_minmax(0,.85fr)_minmax(0,1fr)] lg:items-center"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{row.account.label}</div>
                        <div className="mt-1 break-words text-xs text-muted-foreground">
                          {row.account.broker} / {row.account.server}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div>{row.type}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{row.role}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span>{row.allocationPct.toFixed(1)}%</span>
                          <span className="text-muted-foreground">
                            {formatCurrency(row.account.equity, row.account.baseCurrency)}
                          </span>
                        </div>
                        <Progress value={row.allocationPct} className="mt-2 h-1.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm">
                          {row.riskBudgetPct === null ? "Revisar" : formatPercent(row.riskBudgetPct)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Límite {row.maxHeatPct === null ? "sin definir" : formatPercent(row.maxHeatPct)}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="font-mono text-sm">
                          {formatSignedCurrency(row.account.totalPnl, row.account.baseCurrency)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatPercent(row.contributionPct, 2)}
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
                        <Badge variant={row.ruleSource === "Revisar" ? "secondary" : "outline"}>
                          {portfolioRuleBadgeLabel(row)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{row.action}</span>
                      </div>
                    </div>
                  )) : (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No hay cuentas conectadas para construir la asignación.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/70">
              <CardHeader>
                <CardTitle>Aporte por cuenta</CardTitle>
                <CardDescription>
                  Ranking por PnL disponible; la lectura ajustada a riesgo queda marcada como pendiente cuando falte histórico por cuenta.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border/60 border-y border-border/60">
                  {contributionRows.length > 0 ? contributionRows.map((row) => {
                    const barWidth = Math.min(100, (Math.abs(row.account.totalPnl) / maxAbsPnl) * 100);

                    return (
                      <div key={row.account.id} className="grid gap-2 bg-background/25 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">{row.account.label}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Peso {row.allocationPct.toFixed(1)}% / {row.type}
                            </p>
                          </div>
                          <span className="font-mono text-sm text-foreground">
                            {formatSignedCurrency(row.account.totalPnl, row.account.baseCurrency)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-1.5 rounded-full",
                              row.account.totalPnl < 0 ? "bg-loss" : "bg-foreground",
                            )}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="bg-background/25 p-4 text-sm text-muted-foreground">
                      Sin cuentas suficientes para ordenar aportación.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

          </div>

          <div className="grid gap-4">
            <Card className="border-border/70 bg-card/70">
              <CardHeader>
                <CardTitle>Riesgo duplicado</CardTitle>
                <CardDescription>
                  Cuentas, símbolos o setups que pueden concentrar la exposición.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {riskDuplicationRows.map((item) => (
                  <div
                    key={`${item.label}-${item.value}`}
                    className={cn(
                      "border-l-2 py-2 pl-3",
                      item.tone === "warning"
                        ? "border-risk"
                        : "border-border",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          {item.label}
                        </p>
                        <p className="mt-2 font-medium text-foreground">{item.value}</p>
                      </div>
                      <Badge variant="outline">{item.metric}</Badge>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">{item.state}</p>
                  </div>
                ))}
                {riskDuplicationRows.length === 0 ? (
                  <div className="border-y border-border/60 py-3 text-sm text-muted-foreground">
                    Sin datos suficientes para detectar concentración cruzada.
                  </div>
                ) : null}
                <div className="border-t border-border/60 pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">Riesgo abierto</p>
                    <span className="font-mono text-sm text-foreground">
                      {Math.round(heatShare)}%
                    </span>
                  </div>
                  <Progress value={heatShare} className="mt-3 h-1.5" />
                  <p className="mt-3 text-xs text-muted-foreground">
                    {workspace.risk.actionRequired}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/70">
              <CardHeader>
                <CardTitle>Reglas del portfolio</CardTitle>
                <CardDescription>
                  Qué falta antes de convertir la asignación en reglas operables.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="border-y border-border/60 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Cobertura actual</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Cuentas con reglas definidas o límites heredados.
                      </p>
                    </div>
                    <span className="font-mono text-sm text-foreground">
                      {portfolioReadiness.readinessPct}%
                    </span>
                  </div>
                  <Progress value={portfolioReadiness.readinessPct} className="mt-3 h-1.5" />
                </div>
                <div className="grid gap-2">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Pendientes
                  </p>
                  {policyBlockers.length > 0 ? (
                    policyBlockers.slice(0, 5).map((item) => (
                      <div
                        key={item}
                        className="border-l-2 border-border py-2 pl-3 text-sm text-muted-foreground"
                      >
                        {item}
                      </div>
                    ))
                  ) : (
                    <div className="border-l-2 border-border py-2 pl-3 text-sm text-muted-foreground">
                      Sin bloqueos críticos visibles. Antes de automatizar, falta revisión manual.
                    </div>
                  )}
                </div>
                <Separator />
                <div className="grid gap-2 text-sm text-muted-foreground">
                  <p>Las reglas avanzadas siguen desactivadas hasta revisión manual.</p>
                  <p>Para separar bots/EAs cada operación debe traer identificador propio.</p>
                  <p>No exportable todavía.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="border-border/70 bg-card/70">
          <CardHeader>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <CardTitle>Calendario global de trading</CardTitle>
                <CardDescription>
                  Misma lectura que Calendario: días, semanas y P&L agregado del portfolio.
                </CardDescription>
              </div>
              <div className="flex w-full min-w-0 flex-col gap-2 rounded-lg border border-border/70 bg-background/35 p-1.5 sm:w-auto sm:flex-row sm:items-center">
                <div className="flex min-w-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="shrink-0"
                    onClick={() =>
                      handlePortfolioCalendarMonthSelect(
                        shiftMonthKey(portfolioCalendarSelectedMonthKey, -1),
                      )
                    }
                    aria-label="Mes anterior"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <div className="min-w-0 flex-1 px-1 sm:min-w-44">
                    <p className="truncate text-sm font-medium text-foreground">
                      {portfolioCalendarMonthTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {portfolioCalendarActiveDays.length} días operados
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="shrink-0"
                    onClick={() =>
                      handlePortfolioCalendarMonthSelect(
                        shiftMonthKey(portfolioCalendarSelectedMonthKey, 1),
                      )
                    }
                    aria-label="Mes siguiente"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
                <Separator orientation="vertical" className="hidden h-8 sm:block" />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={portfolioDisplayMode === "capital" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() =>
                      dispatchPortfolioUi({
                        type: "setDisplayMode",
                        displayMode: "capital",
                      })
                    }
                  >
                    Capital
                  </Button>
                  <Button
                    type="button"
                    variant={portfolioDisplayMode === "percent" ? "secondary" : "ghost"}
                    size="sm"
                    className="min-w-11"
                    onClick={() =>
                      dispatchPortfolioUi({
                        type: "setDisplayMode",
                        displayMode: "percent",
                      })
                    }
                  >
                    %
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Resultado del mes</p>
                <p className={cn("mt-2 font-mono text-lg font-semibold", signedTextClass(portfolioCalendarPnl))}>
                  {formatCalendarValue(
                    portfolioCalendarPnl,
                    portfolioCalendarValueMode,
                    portfolioCalendarBaseCapital,
                  )}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {portfolioCalendarTrades} operaciones cerradas
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Operaciones</p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {portfolioCalendarTrades}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {portfolioCalendarActiveDays.length} días operados
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Días clave</p>
                <p className="mt-2 truncate text-lg font-semibold text-foreground">
                  {portfolioCalendarBestDay && portfolioCalendarWorstDay
                    ? `${shortDayLabel(`${portfolioCalendarBestDay.tradingDayKey}T00:00:00Z`)} / ${shortDayLabel(`${portfolioCalendarWorstDay.tradingDayKey}T00:00:00Z`)}`
                    : "Sin días clave"}
                </p>
                <p className="mt-2 truncate text-xs text-muted-foreground">
                  {portfolioCalendarBestDay && portfolioCalendarWorstDay
                    ? `Mejor ${formatSignedCurrency(portfolioCalendarBestDay.pnl)} / Peor ${formatSignedCurrency(portfolioCalendarWorstDay.pnl)}`
                    : "Sin sesiones para comparar"}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Revisión sugerida</p>
                <p className="mt-2 truncate text-lg font-semibold text-foreground">
                  {portfolioCalendarReviewDay
                    ? `Revisar ${shortDayLabel(`${portfolioCalendarReviewDay.tradingDayKey}T00:00:00Z`)}`
                    : "Sin revisión urgente"}
                </p>
                <p className="mt-2 truncate text-xs text-muted-foreground">
                  {portfolioCalendarReviewDay
                    ? "Día con pérdida o presión operativa"
                    : "Periodo estable por ahora"}
                </p>
              </div>
            </div>

            <div className="min-w-0 overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full bg-profit" />
                  Positivo
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full bg-loss" />
                  Negativo
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full bg-zinc-300" />
                  Semana
                </span>
              </div>
              <div className="mt-3 max-w-full overflow-hidden pb-1">
                <div className="grid w-full grid-cols-7 gap-1 md:grid-cols-[repeat(7,minmax(0,1fr))_minmax(118px,0.92fr)] md:gap-1.5">
                  {["D", "L", "M", "X", "J", "V", "S", "Semana"].map((header) => (
                    <div
                      key={header}
                      className={cn(
                        "px-1 py-2 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground",
                        header === "Semana" && "hidden md:block",
                      )}
                    >
                      {header}
                    </div>
                  ))}
                  {portfolioCalendarWeekRows.map((row) => (
                    <React.Fragment key={row.key}>
                      {row.cells.map((cell) =>
                        cell.inMonth ? (
                          <button
                            key={cell.key}
                            type="button"
                            onClick={() => {
                              dispatchPortfolioUi({
                                type: "selectCalendarDay",
                                dayKey: cell.key,
                              });
                            }}
                            disabled={!cell.trades}
                            title={cell.trades ? `${cell.trades} operaciones / ${formatCalendarValue(cell.pnl, portfolioCalendarValueMode, portfolioCalendarBaseCapital)}` : "Sin operativa"}
                            aria-label={cell.trades ? `${cell.dayNumber}: ${cell.trades} operaciones, ${formatCalendarValue(cell.pnl, portfolioCalendarValueMode, portfolioCalendarBaseCapital)}` : `${cell.dayNumber}: sin operativa`}
                            className={[
                              "min-h-16 rounded-lg border p-1.5 text-left transition md:min-h-[72px] md:p-2 xl:min-h-20",
                              cell.key === portfolioCalendarSelectedDayKey
                                ? "border-zinc-200/70 bg-card text-foreground"
                                : cell.state === "win"
                                  ? "border-profit/40 bg-profit-muted hover:bg-profit-muted"
                                  : cell.state === "loss"
                                    ? "border-loss/40 bg-loss-muted hover:bg-loss-muted"
                                    : "border-border/70 bg-card/60 hover:bg-card",
                              cell.trades ? "cursor-pointer" : "cursor-default hover:bg-card/60",
                            ].join(" ")}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {cell.dayNumber}
                              </span>
                              <span className="hidden rounded-full bg-background/55 px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline-block">
                                {cell.trades ? cell.trades : ""}
                              </span>
                            </div>
                            <div className="mt-2 xl:mt-5">
                              <p className="max-w-full break-words font-mono text-[11px] font-medium leading-tight text-foreground md:text-xs">
                                {cell.trades
                                  ? formatCalendarValue(
                                      cell.pnl,
                                      portfolioCalendarValueMode,
                                      portfolioCalendarBaseCapital,
                                    )
                                  : "—"}
                              </p>
                            </div>
                          </button>
                        ) : (
                          <div
                            key={cell.key}
                            className="min-h-16 rounded-lg border border-transparent bg-transparent md:min-h-[72px] xl:min-h-20"
                            aria-hidden="true"
                          />
                        ),
                      )}
                      <div className="hidden min-h-16 min-w-0 flex-col justify-between rounded-lg border border-border/70 bg-card/55 p-1.5 md:flex md:min-h-[72px] md:p-2 xl:min-h-20">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">
                            {row.week?.label ?? "Semana"}
                          </p>
                          <p
                            className={cn(
                              "mt-2 whitespace-nowrap font-mono text-[13px] font-semibold leading-tight md:text-sm",
                              (row.week?.pnl ?? 0) > 0
                                ? "text-profit"
                                : (row.week?.pnl ?? 0) < 0
                                  ? "text-loss"
                                  : "text-foreground",
                            )}
                          >
                            {row.week
                              ? formatCalendarValue(
                                  row.week.pnl,
                                  portfolioCalendarValueMode,
                                  portfolioCalendarBaseCapital,
                                )
                              : "—"}
                          </p>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {row.week
                            ? `${row.week.activeDays} días / ${row.week.trades} op`
                            : "Sin operativa"}
                        </p>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageMotion>
  );
}

export function LegacyCapitalReferenceSection({
  workspace,
}: {
  workspace: WorkspaceState;
}) {
  const capitalChartTheme = useReferenceLivelineTheme();

  return renderLegacyCapitalReferenceSection(workspace, capitalChartTheme);
}

function renderLegacyCapitalReferenceSection(
  workspace: WorkspaceState,
  capitalChartTheme: ReturnType<typeof useReferenceLivelineTheme>,
) {
  const activeAccount =
    workspace.accounts.find((account) => account.id === workspace.activeAccountId) ??
    workspace.accounts[0];
  const equity = activeAccount?.equity ?? 0;
  const balance = activeAccount?.balance ?? equity;
  const trendPct = balance > 0 ? ((equity - balance) / balance) * 100 : 0;
  const heatShare =
    workspace.risk.heatLimitPct > 0
      ? Math.min(100, (workspace.risk.totalOpenRiskPct / workspace.risk.heatLimitPct) * 100)
      : 0;
  const accountRows = buildAccountRows(workspace);
  const fundedEquity = accountRows
    .filter((account) => account.isFunded)
    .reduce((sum, account) => sum + account.equity, 0);
  const ownEquity = accountRows
    .filter((account) => !account.isFunded)
    .reduce((sum, account) => sum + account.equity, 0);
  const totalEquity = fundedEquity + ownEquity;
  const fundedShare = totalEquity > 0 ? (fundedEquity / totalEquity) * 100 : 0;
  const largestAccount = [...accountRows].toSorted((a, b) => b.sharePct - a.sharePct)[0] ?? null;
  const contributionRows = [...accountRows]
    .map((account) => ({
      ...account,
      contributionPct:
        account.equity > 0 ? (account.totalPnl / account.equity) * 100 : 0,
    }))
    .toSorted((a, b) => b.totalPnl - a.totalPnl);
  const strategyWeights = Object.values(
    workspace.trades.reduce<Record<string, { setup: string; trades: number; pnl: number }>>((acc, trade) => {
      const executionCount = Math.max(1, trade.executions.length);
      const key = trade.setup ?? "Sin etiqueta";
      const current = acc[key] ?? { setup: key, trades: 0, pnl: 0 };
      current.trades += executionCount;
      current.pnl += trade.netPnl;
      acc[key] = current;
      return acc;
    }, {}),
  ).toSorted((a, b) => b.trades - a.trades);
  const symbolWeights = Object.values(
    workspace.trades.reduce<Record<string, { symbol: string; trades: number; pnl: number }>>((acc, trade) => {
      const executionCount = Math.max(1, trade.executions.length);
      const current = acc[trade.symbol] ?? { symbol: trade.symbol, trades: 0, pnl: 0 };
      current.trades += executionCount;
      current.pnl += trade.netPnl;
      acc[trade.symbol] = current;
      return acc;
    }, {}),
  ).toSorted((a, b) => b.trades - a.trades);
  const concentrationLabel =
    largestAccount && largestAccount.sharePct >= 50
      ? `Concentrado en ${largestAccount.label}`
      : "Distribución más equilibrada";
  const portfolioReadiness = getPortfolioPolicyReadiness(workspace);
  const portfolioPolicyRows = portfolioReadiness.accounts.map((item) => ({
    account: item.account,
    role: formatPortfolioRole(item.role),
    riskBudgetLabel:
      item.riskBudgetPct === null ? "Revisar" : formatPercent(item.riskBudgetPct),
    status:
      item.policySource === "portfolio_policy"
        ? "Definida"
        : item.policySource === "funding_profile"
          ? "Desde reglas"
          : "Revisar",
  }));
  const strategyPolicyRows = strategyWeights.slice(0, 3).map((strategy) => ({
    ...strategy,
    permission:
      strategy.pnl > 0 && strategy.trades >= 2
        ? "Candidata"
        : strategy.pnl < 0
          ? "Limitar"
          : "Observar",
  }));
  const policyBlockers = [
    ...portfolioReadiness.blockers.map((blocker) =>
      formatPortfolioBlocker(blocker, workspace.accounts),
    ),
    workspace.risk.allowNewTrades
      ? null
      : workspace.risk.blockingRule ?? "Mesa de Riesgo recomienda revisar riesgo",
    largestAccount && largestAccount.sharePct >= 50
      ? `Concentración alta en ${largestAccount.label}`
      : null,
    strategyWeights.some((strategy) => strategy.setup === "Sin etiqueta")
      ? "Hay operaciones sin setup; faltan permisos por estrategia"
      : null,
  ].filter((item): item is string => Boolean(item));
  const totalClosedPnl = workspace.analytics.daily.reduce((sum, day) => sum + day.pnl, 0);
  const capitalCurveBase = Math.max(0, totalEquity - totalClosedPnl);
  const sortedDailyCapital = [...workspace.analytics.daily].toSorted((a, b) =>
    a.tradingDayKey.localeCompare(b.tradingDayKey),
  );
  const capitalCurveSeries = sortedDailyCapital
    .reduce<{ total: number; points: LivelinePoint[] }>((acc, day, index) => {
      const nextTotal = acc.total + day.pnl;
      const date = tradingDayKeyToUtcDate(day.tradingDayKey);

      return {
        total: nextTotal,
        points: [
          ...acc.points,
          {
            time: date
              ? Math.floor(date.getTime() / 1000)
              : 1_777_593_600 + index * 86_400,
            value: capitalCurveBase + nextTotal,
          },
        ],
      };
    }, { total: 0, points: [] }).points;
  const capitalCurveLatest = capitalCurveSeries.at(-1)?.value ?? totalEquity;
  const capitalCurveWindow = 86_400 * 365;

  return (
    <PageMotion>
      <div className="grid gap-4">
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="flex flex-col gap-4">
            <GlassWalletCard
              balance={equity.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              currency={activeAccount?.baseCurrency ?? "USD"}
              trend={`${trendPct >= 0 ? "+" : ""}${trendPct.toFixed(1)}%`}
              cardHolder={activeAccount?.label ?? "KMFX Edge"}
              address={activeAccount?.login ? `${activeAccount.login.slice(0, 3)}...EDGE` : "LIVE...A01"}
              expiry="05/26"
              className="max-w-none"
            />
            <div className="grid gap-4 md:grid-cols-2">
              <AnimatedProgress title="Asignación intradía" value={68} />
              <AnimatedProgress title="Margen usado" value={Math.round(heatShare)} />
            </div>
            <Card className="border-border/70 bg-card/70">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>Evolución de capital</CardTitle>
                    <CardDescription>
                      Curva estimada con equity actual y resultado cerrado disponible.
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    {formatCurrency(capitalCurveLatest, activeAccount?.baseCurrency ?? "USD")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div data-kmfx-liveline className="h-52 overflow-hidden rounded-2xl border border-border/60 bg-background/35 p-2">
                  {capitalCurveSeries.length >= 2 ? (
                    <Liveline
                      data={capitalCurveSeries}
                      value={capitalCurveLatest}
                      theme={capitalChartTheme.theme}
                      color={capitalChartTheme.accent}
                      window={capitalCurveWindow}
                      windowStyle="rounded"
                      grid
                      badge
                      badgeVariant="minimal"
                      fill
                      scrub
                      emptyText="Sin curva suficiente"
                      valueMomentumColor={false}
                      formatValue={(current) =>
                        formatCurrency(current, activeAccount?.baseCurrency ?? "USD")
                      }
                      lineWidth={2}
                      style={{ height: "100%" }}
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-muted-foreground">
                      Aún no hay suficientes cierres para dibujar la curva.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          <Card className="border-border/70 bg-card/70">
            <CardHeader>
              <CardTitle>Distribución por cuenta</CardTitle>
              <CardDescription>
                Capital, conexión y peso relativo entre tus cuentas.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {accountRows.map((account) => (
                <div
                  key={account.id}
                  className="rounded-xl border border-border/70 bg-background/35 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {account.label}
                        </p>
                        <Badge variant={toneBadgeVariant(account.connectionTone)}>
                          {formatConnectionStateLabel(account.connectionState)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {account.broker} / MT5 {account.login} / {account.lastSyncLabel}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm text-foreground">
                        {formatCurrency(account.equity, account.baseCurrency)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {account.sharePct.toFixed(1)}% del equity
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Progress value={account.sharePct} className="h-1.5" />
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                    <span>P&L: {formatSignedCurrency(account.floatingPnl, account.baseCurrency)}</span>
                    <span>Posiciones: {account.openPositionsCount}</span>
                    <span>{account.isFunded ? "Con reglas de fondeo" : "Cuenta propia"}</span>
                  </div>
                </div>
              ))}
              <Separator />
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Exposición abierta</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Calculada desde el riesgo abierto por símbolo.
                    </p>
                  </div>
                  <Badge variant={workspace.risk.allowNewTrades ? "outline" : "destructive"}>
                    {workspace.risk.allowNewTrades ? "Operable" : "Bloqueado"}
                  </Badge>
                </div>
                {workspace.risk.exposureBySymbol.length > 0 ? (
                  workspace.risk.exposureBySymbol.map((item) => (
                    <div
                      key={item.symbol}
                      className="rounded-lg border border-border/70 bg-background/35 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-foreground">{item.symbol}</span>
                        <span className="font-mono text-sm text-foreground">
                          {formatPercent(item.openRiskPct)}
                        </span>
                      </div>
                      <Progress
                        value={
                          workspace.risk.heatLimitPct > 0
                            ? Math.min(100, (item.openRiskPct / workspace.risk.heatLimitPct) * 100)
                            : 0
                        }
                        className="mt-3 h-1.5"
                      />
                      <p className="mt-2 text-xs text-muted-foreground">
                        Riesgo dentro del límite de cartera: {formatPercent(workspace.risk.heatLimitPct)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-border/70 bg-background/35 p-3 text-sm text-muted-foreground">
                    Sin exposición abierta reportada.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <Card className="border-border/70 bg-card/70">
            <CardHeader>
              <CardTitle>Mapa de capital</CardTitle>
              <CardDescription>
                Asignación, aportación por cuenta y concentración en una sola lectura.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  [
                    "Capital con reglas",
                    formatPercent(fundedShare),
                    `${workspace.accounts.filter((a) => a.isFunded).length} cuenta(s) con reglas externas`,
                  ],
                  [
                    "Capital propio",
                    formatCurrency(ownEquity, activeAccount?.baseCurrency ?? "USD"),
                    "Equity sin reglas de fondeo",
                  ],
                  [
                    "Cuenta dominante",
                    largestAccount ? `${largestAccount.sharePct.toFixed(0)}%` : "Pend.",
                    concentrationLabel,
                  ],
                  [
                    "Riesgo abierto",
                    formatPercent(workspace.risk.totalOpenRiskPct),
                    `Límite ${formatPercent(workspace.risk.heatLimitPct)}`,
                  ],
                ].map(([label, value, note]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-border/70 bg-background/35 p-3"
                  >
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{note}</p>
                  </div>
                ))}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Peso</TableHead>
                    <TableHead>Aportación</TableHead>
                    <TableHead className="text-right">Total P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contributionRows.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="font-medium">{account.label}</TableCell>
                      <TableCell>{account.isFunded ? "Fondeo" : "Propia"}</TableCell>
                      <TableCell>{account.sharePct.toFixed(1)}%</TableCell>
                      <TableCell>{formatPercent(account.contributionPct)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatSignedCurrency(account.totalPnl, account.baseCurrency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <Card className="border-border/70 bg-card/70">
              <CardHeader>
                <CardTitle>Eficiencia de capital</CardTitle>
                <CardDescription>
                  Lecturas útiles para decidir dónde merece vivir el riesgo.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {contributionRows.slice(0, 3).map((account) => (
                  <div
                    key={account.id}
                    className="rounded-lg border border-border/70 bg-background/35 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-foreground">{account.label}</span>
                      <Badge variant={account.totalPnl >= 0 ? "default" : "secondary"}>
                        {account.totalPnl >= 0 ? "Positiva" : "Revisar"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Aportación {formatPercent(account.contributionPct)} / peso{" "}
                      {account.sharePct.toFixed(1)}%
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/70">
              <CardHeader>
                <CardTitle>Notas de concentración</CardTitle>
                <CardDescription>
                  Señales para evitar que el capital se concentre donde no toca.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {[
                  fundedShare >= 65
                    ? "El capital está muy inclinado a cuentas con reglas externas; vigila buffers y cobros."
                    : "La mezcla entre capital propio y cuentas con reglas externas está más equilibrada.",
                  largestAccount && largestAccount.sharePct >= 50
                    ? `Más de la mitad del equity vive en ${largestAccount.label}; riesgo de concentración por cuenta.`
                    : "No aparece una concentración extrema por cuenta en los datos actuales.",
                  "El siguiente paso será cruzar esta capa con estrategia y símbolo para una asignación más fina.",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-lg border border-border/70 bg-background/35 p-3 text-sm text-muted-foreground"
                  >
                    {item}
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/70">
              <CardHeader>
                <CardTitle>Pistas de asignación</CardTitle>
                <CardDescription>
                  Qué setups y símbolos concentran más resultado operativo.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {strategyWeights.slice(0, 2).map((item) => (
                  <div
                    key={item.setup}
                    className="rounded-lg border border-border/70 bg-background/35 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-foreground">{item.setup}</span>
                      <span className="font-mono text-sm text-foreground">
                        {formatSignedCurrency(item.pnl)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {item.trades} operaciones registradas
                    </p>
                  </div>
                ))}
                {symbolWeights.slice(0, 2).map((item) => (
                  <div
                    key={item.symbol}
                    className="rounded-lg border border-border/70 bg-background/35 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-foreground">{item.symbol}</span>
                      <span className="font-mono text-sm text-foreground">
                        {formatSignedCurrency(item.pnl)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {item.trades} operaciones / concentración por símbolo
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/70">
              <CardHeader>
                <CardTitle>Preparación de reglas</CardTitle>
                <CardDescription>
                  Estado de preparación antes de automatizar reglas por cuenta o estrategia.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="rounded-lg border border-border/70 bg-background/35 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Preparación</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Mide si tenemos cuentas, roles y setups suficientes para definir reglas.
                      </p>
                    </div>
                    <span className="font-mono text-sm text-foreground">
                      {portfolioReadiness.readinessPct}%
                    </span>
                  </div>
                  <Progress value={portfolioReadiness.readinessPct} className="mt-3 h-1.5" />
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Riesgo asignado</TableHead>
                      <TableHead className="text-right">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portfolioPolicyRows.map((row) => (
                      <TableRow key={row.account.id}>
                        <TableCell className="font-medium">{row.account.label}</TableCell>
                        <TableCell>{row.role}</TableCell>
                        <TableCell>{row.riskBudgetLabel}</TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={row.status === "Definida" ? "outline" : "secondary"}
                          >
                            {row.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="grid gap-2">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Permisos por estrategia
                  </p>
                  {strategyPolicyRows.map((strategy) => (
                    <div
                      key={strategy.setup}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/35 p-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{strategy.setup}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {strategy.trades} operaciones / {formatSignedCurrency(strategy.pnl)}
                        </p>
                      </div>
                      <Badge variant={strategy.permission === "Limitar" ? "secondary" : "outline"}>
                        {strategy.permission}
                      </Badge>
                    </div>
                  ))}
                </div>
                <div className="grid gap-2">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Pendientes antes de activar reglas
                  </p>
                  {policyBlockers.length > 0 ? (
                    policyBlockers.map((item) => (
                      <div
                        key={item}
                        className="rounded-lg border border-border/70 bg-background/35 p-3 text-sm text-muted-foreground"
                      >
                        {item}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-border/70 bg-background/35 p-3 text-sm text-muted-foreground">
                      No hay bloqueos obvios, pero falta revisar las reglas antes de activarlas.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PageMotion>
  );
}


export const PortfolioReferenceSection = CapitalReferenceSection;
