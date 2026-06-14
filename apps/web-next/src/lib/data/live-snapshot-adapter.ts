import type { TradingAccount } from "@/lib/contracts/account";
import type { DashboardModel, MetricPoint } from "@/lib/contracts/dashboard-model";
import type {
  RawLiveAccountsSnapshot,
  RawLiveDashboardPayload,
  RawLiveSnapshotAccount,
  RawLiveTrade,
} from "@/lib/contracts/live-snapshot";
import type { RiskSnapshot, RiskStatus } from "@/lib/contracts/risk";
import type {
  ClosedTrade,
  DailyTradeBucket,
  HourlyTradeBucket,
  TradeSession,
  TradeSide,
} from "@/lib/contracts/trade";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/formatters/numbers";

type WorkspaceSourceMode = WorkspaceState["meta"]["sourceMode"];

function emptyWorkspace(sourceMode: WorkspaceSourceMode): WorkspaceState {
  const sourceLabel =
    sourceMode === "live" ? "Sin cuentas conectadas" : "Lectura preparada";

  return {
    activeAccountId: "",
    accounts: [],
    trades: [],
    dashboard: {
      title: "Panel operativo",
      subtitle: "Conecta una cuenta MT5 para activar métricas reales.",
      metrics: [
        {
          id: "equity",
          label: "Equity",
          value: formatCurrency(0, "USD"),
          note: "Sin cuenta conectada",
          tone: "neutral",
        },
        {
          id: "open-pnl",
          label: "P&L abierto",
          value: formatSignedCurrency(0, "USD"),
          note: "Sin posiciones abiertas",
          tone: "neutral",
        },
        {
          id: "daily-room",
          label: "Room diario",
          value: formatPercent(0),
          note: "Pendiente de cuenta",
          tone: "neutral",
        },
        {
          id: "open-heat",
          label: "Riesgo abierto",
          value: formatPercent(0),
          note: "Sin exposición",
          tone: "neutral",
        },
      ],
      equitySeries: [],
      pulseItems: [
        {
          label: "Origen",
          value: sourceLabel,
          tone: "info",
        },
        {
          label: "Cuentas",
          value: "0 conectadas",
          tone: "neutral",
        },
        {
          label: "Trades cerrados",
          value: "0",
          tone: "neutral",
        },
      ],
    },
    risk: {
      status: "safe",
      severity: "info",
      actionRequired: "Conecta una cuenta MT5 para calcular riesgo real.",
      allowNewTrades: false,
      dailyDrawdownPct: 0,
      dailyLimitPct: 0,
      dailyRoomLeftPct: 0,
      maxDrawdownPct: 0,
      maxLimitPct: 0,
      totalOpenRiskPct: 0,
      heatLimitPct: 0,
      exposureBySymbol: [],
    },
    funding: {
      profiles: [],
      ruleSets: [],
      journeys: [],
      stageAccounts: [],
      ledgerEntries: [],
      timelineEvents: [],
    },
    portfolio: {
      portfolios: [],
      accounts: [],
      policies: [],
    },
    policies: {
      riskPolicies: [],
      evaluations: [],
      recommendations: [],
    },
    analytics: {
      performance: {
        netProfit: 0,
        grossProfit: 0,
        grossLoss: 0,
        winRatePct: 0,
        totalTrades: 0,
        winCount: 0,
        lossCount: 0,
        profitFactor: 0,
        sortino: null,
        expectancy: 0,
        avgWin: 0,
        avgLoss: 0,
        bestTrade: null,
        worstTrade: null,
        bestWinStreak: 0,
        bestLossStreak: 0,
        score: 0,
      },
      summary: [
        {
          label: "Estado",
          value: "Sin cuenta",
          note: "Añade una cuenta MT5 para iniciar la lectura.",
        },
      ],
      daily: [],
      hourly: [],
      periodOptions: ["30D", "90D", "YTD"],
      currentPeriod: "30D",
    },
    meta: {
      sourceMode,
      sourceLabel,
    },
  };
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function userRoleLabelFromSnapshot(snapshot: RawLiveAccountsSnapshot) {
  if (snapshot.is_admin) return "Administrador";
  if (String(snapshot.auth_email || "").trim()) return "Usuario";
  return undefined;
}

function userAvatarUrlFromSnapshot(snapshot: RawLiveAccountsSnapshot) {
  return String(
    snapshot.auth_avatar_url ||
      snapshot.auth_picture ||
      snapshot.user_avatar_url ||
      snapshot.avatar_url ||
      snapshot.picture ||
      "",
  ).trim();
}

function userMetaFromSnapshot(snapshot: RawLiveAccountsSnapshot) {
  const userEmail = String(snapshot.auth_email || "").trim();
  const userRoleLabel = userRoleLabelFromSnapshot(snapshot);
  const userAvatarUrl = userAvatarUrlFromSnapshot(snapshot);

  return {
    ...(userAvatarUrl ? { userAvatarUrl } : {}),
    ...(userEmail ? { userEmail } : {}),
    ...(userRoleLabel ? { userRoleLabel } : {}),
  };
}

function parseDateFromUnixOrIso(
  unixValue: unknown,
  isoValue: unknown,
  fallback = "1970-01-01T00:00:00.000Z",
) {
  const parsedUnix = Number(unixValue);
  if (Number.isFinite(parsedUnix) && parsedUnix > 0) {
    return new Date(parsedUnix * 1000).toISOString();
  }

  const parsed = new Date(String(isoValue || ""));
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return fallback;
}

function inferTradeSide(trade: RawLiveTrade): TradeSide {
  const source = String(trade.direction || trade.type || "").trim().toLowerCase();
  return source.includes("sell") ? "sell" : "buy";
}

function inferTradeSession(value: string): TradeSession {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  const hour = date.getUTCHours();
  if (hour < 7) return "Asia";
  if (hour < 13) return "London";
  if (hour < 21) return "New York";
  return "Asia";
}

function directionMove(side: TradeSide, fromPrice: number, toPrice: number) {
  return side === "sell" ? fromPrice - toPrice : toPrice - fromPrice;
}

function finiteOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function mapTradeExecutionMetrics({
  entryPrice,
  exitPrice,
  netPnl,
  row,
  side,
}: {
  entryPrice: number;
  exitPrice: number;
  netPnl: number;
  row: RawLiveTrade;
  side: TradeSide;
}) {
  const initialStopPrice = toNullableFiniteNumber(
    row.initial_stop_price ?? row.stop_loss ?? row.sl,
  );
  const targetPrice = toNullableFiniteNumber(
    row.target_price ?? row.take_profit ?? row.tp,
  );
  const plannedRiskAmount = toNullableFiniteNumber(
    row.planned_risk_amount ?? row.initial_risk_amount ?? row.risk_amount,
  );
  const sourcePlannedRewardAmount = toNullableFiniteNumber(
    row.planned_reward_amount ?? row.reward_amount,
  );
  const sourcePlannedRewardRiskRatio = toNullableFiniteNumber(
    row.planned_reward_risk_ratio ?? row.planned_rr ?? row.rr,
  );
  const riskPriceDistance =
    initialStopPrice !== null ? Math.abs(entryPrice - initialStopPrice) : null;
  const rewardPriceDistance =
    targetPrice !== null ? Math.abs(targetPrice - entryPrice) : null;
  const pricePlannedRewardRiskRatio =
    riskPriceDistance && rewardPriceDistance
      ? rewardPriceDistance / riskPriceDistance
      : null;
  const plannedRewardRiskRatio =
    sourcePlannedRewardRiskRatio ?? pricePlannedRewardRiskRatio;
  const plannedRewardAmount =
    sourcePlannedRewardAmount ??
    (plannedRiskAmount !== null && plannedRewardRiskRatio !== null
      ? plannedRiskAmount * plannedRewardRiskRatio
      : null);
  const sourceCapturedR = toNullableFiniteNumber(row.captured_r ?? row.r_multiple);
  const capturedR =
    sourceCapturedR ??
    (plannedRiskAmount !== null && plannedRiskAmount > 0
      ? netPnl / plannedRiskAmount
      : riskPriceDistance && riskPriceDistance > 0
        ? directionMove(side, entryPrice, exitPrice) / riskPriceDistance
        : null);
  const maxFavorableExcursionAmount = toNullableFiniteNumber(
    row.max_favorable_excursion_amount ??
      row.max_favorable_excursion ??
      row.mfe,
  );
  const maxAdverseExcursionAmount = toNullableFiniteNumber(
    row.max_adverse_excursion_amount ??
      row.max_adverse_excursion ??
      row.mae,
  );
  const mfeR =
    toNullableFiniteNumber(row.mfe_r) ??
    (plannedRiskAmount !== null &&
    plannedRiskAmount > 0 &&
    maxFavorableExcursionAmount !== null
      ? maxFavorableExcursionAmount / plannedRiskAmount
      : null);
  const maeR =
    toNullableFiniteNumber(row.mae_r) ??
    (plannedRiskAmount !== null &&
    plannedRiskAmount > 0 &&
    maxAdverseExcursionAmount !== null
      ? Math.abs(maxAdverseExcursionAmount) / plannedRiskAmount
      : null);
  const sourceExitEfficiency = toNullableFiniteNumber(
    row.exit_efficiency_pct ?? row.exit_efficiency,
  );
  const exitEfficiencyPct =
    sourceExitEfficiency ??
    (capturedR !== null && mfeR !== null && mfeR > 0
      ? clampPercent((capturedR / mfeR) * 100)
      : null);

  return {
    initialStopPrice,
    targetPrice,
    plannedRiskAmount,
    plannedRewardAmount,
    plannedRewardRiskRatio,
    capturedR,
    maxFavorableExcursionAmount,
    maxAdverseExcursionAmount,
    mfeR,
    maeR,
    exitEfficiencyPct,
  };
}

function mergeTradeExecutionMetrics(trade: ClosedTrade) {
  const plannedRiskAmount = finiteOrNull(trade.plannedRiskAmount);
  const sourceCapturedR = finiteOrNull(trade.capturedR);
  const sourceMfeR = finiteOrNull(trade.mfeR);
  const sourceMaeR = finiteOrNull(trade.maeR);
  const maxFavorableExcursionAmount = finiteOrNull(trade.maxFavorableExcursionAmount);
  const maxAdverseExcursionAmount = finiteOrNull(trade.maxAdverseExcursionAmount);
  const capturedR =
    plannedRiskAmount !== null && plannedRiskAmount > 0
      ? trade.netPnl / plannedRiskAmount
      : sourceCapturedR;
  const mfeR =
    plannedRiskAmount !== null &&
    plannedRiskAmount > 0 &&
    maxFavorableExcursionAmount !== null
      ? maxFavorableExcursionAmount / plannedRiskAmount
      : sourceMfeR;
  const maeR =
    plannedRiskAmount !== null &&
    plannedRiskAmount > 0 &&
    maxAdverseExcursionAmount !== null
      ? Math.abs(maxAdverseExcursionAmount) / plannedRiskAmount
      : sourceMaeR;
  const exitEfficiencyPct =
    capturedR !== null && mfeR !== null && mfeR > 0
      ? clampPercent((capturedR / mfeR) * 100)
      : trade.exitEfficiencyPct;

  trade.capturedR = capturedR;
  trade.mfeR = mfeR;
  trade.maeR = maeR;
  trade.exitEfficiencyPct = exitEfficiencyPct;
}

function toTradingDayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown-day";

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
});
const COMPACT_HISTORY_LABEL_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  month: "short",
  day: "numeric",
});

function toDayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return DAY_LABEL_FORMATTER.format(date);
}

function buildTradeBuckets(trades: ClosedTrade[]) {
  const dailyMap = new Map<string, DailyTradeBucket>();
  const hourlyMap = new Map<number, HourlyTradeBucket>();

  trades.forEach((trade) => {
    const dayKey = trade.tradingDayKey;
    const executions = trade.executions.length
      ? trade.executions
      : [
          {
            id: trade.id,
            volume: trade.volume,
            exitPrice: trade.exitPrice,
            closedAt: trade.closedAt,
            grossPnl: trade.grossPnl,
            commission: trade.commission,
            swap: trade.swap,
            netPnl: trade.netPnl,
          },
        ];
    const dayBucket = dailyMap.get(dayKey) ?? {
      tradingDayKey: dayKey,
      label: toDayLabel(trade.closedAt),
      pnl: 0,
      trades: 0,
      wins: 0,
      losses: 0,
      winRatePct: 0,
    };

    dayBucket.pnl += trade.netPnl;
    executions.forEach((execution) => {
      dayBucket.trades += 1;
      if (execution.netPnl >= 0) {
        dayBucket.wins += 1;
      } else {
        dayBucket.losses += 1;
      }
    });
    dayBucket.winRatePct =
      dayBucket.trades > 0 ? (dayBucket.wins / dayBucket.trades) * 100 : 0;
    dailyMap.set(dayKey, dayBucket);

    const date = new Date(trade.closedAt);
    const hour = Number.isNaN(date.getTime()) ? -1 : date.getUTCHours();
    if (hour >= 0) {
      const hourlyBucket = hourlyMap.get(hour) ?? {
        hour,
        label: `${String(hour).padStart(2, "0")}:00`,
        pnl: 0,
        trades: 0,
        wins: 0,
        losses: 0,
      };

      hourlyBucket.pnl += trade.netPnl;
      executions.forEach((execution) => {
        hourlyBucket.trades += 1;
        if (execution.netPnl >= 0) {
          hourlyBucket.wins += 1;
        } else {
          hourlyBucket.losses += 1;
        }
      });
      hourlyMap.set(hour, hourlyBucket);
    }
  });

  return {
    daily: [...dailyMap.values()].toSorted((a, b) =>
      a.tradingDayKey.localeCompare(b.tradingDayKey),
    ),
    hourly: [...hourlyMap.values()].toSorted((a, b) => a.hour - b.hour),
  };
}

function mapTrades(payload: RawLiveDashboardPayload): ClosedTrade[] {
  const rows = Array.isArray(payload.trades) ? payload.trades : [];
  const grouped = new Map<string, ClosedTrade>();

  rows.forEach((row, index) => {
    const executionId =
      String(row.trade_id || row.ticket || `${row.symbol || "trade"}-${index}`).trim();
    const positionId =
      String(row.position_id || row.ticket || executionId).trim() || executionId;
    const openedAt = parseDateFromUnixOrIso(
      row.open_time_unix,
      row.open_time,
      parseDateFromUnixOrIso(row.time_unix, row.time),
    );
    const closedAt = parseDateFromUnixOrIso(
      row.close_time_unix ?? row.time_unix,
      row.close_time ?? row.time,
    );
    const side = inferTradeSide(row);
    const volume = toFiniteNumber(row.volume);
    const entryPrice = toFiniteNumber(row.entry_price ?? row.open_price);
    const exitPrice = toFiniteNumber(row.exit_price ?? row.price);
    const grossPnl = toFiniteNumber(row.profit);
    const commission = toFiniteNumber(row.commission);
    const swap = toFiniteNumber(row.swap);
    const netPnl = toFiniteNumber(row.net, grossPnl + commission + swap);
    const setup = String(row.strategy_tag || row.comment || "").trim() || null;
    const executionMetrics = mapTradeExecutionMetrics({
      entryPrice,
      exitPrice,
      netPnl,
      row,
      side,
    });

    const execution = {
      id: executionId,
      volume,
      exitPrice,
      closedAt,
      grossPnl,
      commission,
      swap,
      netPnl,
    };

    const existing = grouped.get(positionId);
    if (!existing) {
      const openedDate = new Date(openedAt);
      const closedDate = new Date(closedAt);
      const durationMinutes =
        !Number.isNaN(openedDate.getTime()) && !Number.isNaN(closedDate.getTime())
          ? Math.max(0, Math.round((closedDate.getTime() - openedDate.getTime()) / 60000))
          : null;

      grouped.set(positionId, {
        id: executionId,
        positionId,
        symbol: String(row.symbol || "N/A"),
        side,
        volume,
        entryPrice,
        exitPrice,
        openedAt,
        closedAt,
        durationMinutes,
        grossPnl,
        commission,
        swap,
        netPnl,
        session: inferTradeSession(closedAt),
        setup,
        tradingDayKey: toTradingDayKey(closedAt),
        ...executionMetrics,
        executions: [execution],
      });
      return;
    }

    const totalVolume = existing.volume + volume;
    const weightedExitPrice =
      totalVolume > 0
        ? (existing.exitPrice * existing.volume + exitPrice * volume) / totalVolume
        : existing.exitPrice;

    existing.id = executionId;
    existing.volume = totalVolume;
    existing.exitPrice = weightedExitPrice;
    existing.closedAt =
      new Date(closedAt).getTime() > new Date(existing.closedAt).getTime()
        ? closedAt
        : existing.closedAt;
    existing.grossPnl += grossPnl;
    existing.commission += commission;
    existing.swap += swap;
    existing.netPnl += netPnl;
    existing.session = inferTradeSession(existing.closedAt);
    existing.setup = existing.setup || setup;
    existing.tradingDayKey = toTradingDayKey(existing.closedAt);
    existing.initialStopPrice = existing.initialStopPrice ?? executionMetrics.initialStopPrice;
    existing.targetPrice = existing.targetPrice ?? executionMetrics.targetPrice;
    existing.plannedRiskAmount =
      existing.plannedRiskAmount ?? executionMetrics.plannedRiskAmount;
    existing.plannedRewardAmount =
      existing.plannedRewardAmount ?? executionMetrics.plannedRewardAmount;
    existing.plannedRewardRiskRatio =
      existing.plannedRewardRiskRatio ?? executionMetrics.plannedRewardRiskRatio;
    existing.maxFavorableExcursionAmount = Math.max(
      existing.maxFavorableExcursionAmount ?? Number.NEGATIVE_INFINITY,
      executionMetrics.maxFavorableExcursionAmount ?? Number.NEGATIVE_INFINITY,
    );
    if (existing.maxFavorableExcursionAmount === Number.NEGATIVE_INFINITY) {
      existing.maxFavorableExcursionAmount = null;
    }
    existing.maxAdverseExcursionAmount = Math.min(
      existing.maxAdverseExcursionAmount ?? Number.POSITIVE_INFINITY,
      executionMetrics.maxAdverseExcursionAmount ?? Number.POSITIVE_INFINITY,
    );
    if (existing.maxAdverseExcursionAmount === Number.POSITIVE_INFINITY) {
      existing.maxAdverseExcursionAmount = null;
    }
    mergeTradeExecutionMetrics(existing);
    existing.executions.push(execution);
    if (existing.durationMinutes !== null) {
      const openedDate = new Date(existing.openedAt);
      const latestClose = new Date(existing.closedAt);
      existing.durationMinutes = Math.max(
        0,
        Math.round((latestClose.getTime() - openedDate.getTime()) / 60000),
      );
    }
  });

  return [...grouped.values()].toSorted(
    (a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime(),
  );
}

function toRiskStatus(value: unknown): RiskStatus {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "warning") return "caution";
  if (normalized === "violation") return "blocked";
  return "safe";
}

function toRiskSeverity(value: unknown): RiskSnapshot["severity"] {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "danger") return "danger";
  if (normalized === "warning") return "warning";
  return "info";
}

function inferPlanAccess(
  account: RawLiveSnapshotAccount,
): TradingAccount["planAccess"] {
  return String(account.status || "").trim().toLowerCase() === "active"
    ? "active"
    : "limited";
}

function inferIsFunded(account: RawLiveSnapshotAccount) {
  const source = accountIdentityText(account);
  return [
    "challenge",
    "funded",
    "funding",
    "prop",
    "reto",
    "evaluation",
    "ftmo",
    "the5ers",
    "the 5ers",
    "funding pips",
    "fundingpips",
    "orion funded",
    "darwinex zero",
    "wsfunded",
    "wsf funded",
    "wall street funded",
  ].some((token) =>
    source.includes(token),
  );
}

function normalizeIdentityText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

function accountIdentityText(account: RawLiveSnapshotAccount) {
  const payload = account.dashboard_payload || {};
  const fundingProfile = payload.fundingProfile;

  return normalizeIdentityText([
    account.display_name,
    account.broker,
    account.server,
    payload.accountName,
    payload.name,
    payload.broker,
    payload.server,
    fundingProfile?.firm,
    fundingProfile?.phase_label,
    fundingProfile?.playbook_label,
    fundingProfile?.account_type,
  ].filter(Boolean).join(" "));
}

function isGenericAccountLabel(label: string) {
  const normalized = label.trim().toLowerCase();

  return [
    "mt5 account",
    "cuenta mt5",
    "cuenta real mt5",
    "nueva cuenta mt5",
  ].includes(normalized);
}

function friendlyAccountLabel(account: RawLiveSnapshotAccount): string {
  const payload = account.dashboard_payload || {};
  const rawLabel =
    String(account.display_name || "").trim() ||
    String(payload.accountName || payload.name || "").trim();

  if (rawLabel && !isGenericAccountLabel(rawLabel)) {
    return rawLabel;
  }

  const source = [
    account.broker,
    account.server,
    payload.broker,
    payload.server,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (source.includes("darwin")) return "Darwinex MT5";
  if (source.includes("ic markets") || source.includes("icmarkets")) {
    return "IC Markets MT5";
  }
  if (source.includes("ftmo")) return "FTMO MT5";
  if (source.includes("orion")) return "Orion MT5";
  if (source.includes("pepperstone")) return "Pepperstone MT5";

  const broker =
    String(account.broker || "").trim() ||
    String(payload.broker || "").trim();

  return broker ? `${broker} MT5` : rawLabel;
}

type InferredFundingIdentity = {
  firm: string | null;
  accountMode: NonNullable<TradingAccount["funding"]>["accountMode"];
  phaseLabel: string;
  objectivePct: number | null;
  playbookLabel: string;
};

function numberFromTextPercent(source: string, values: number[]) {
  return values.find((value) =>
    source.includes(`${value}%`) || source.includes(`${value} pct`) || source.includes(`${value} percent`),
  ) ?? null;
}

function inferFundingFirm(account: RawLiveSnapshotAccount, source: string) {
  const explicitFirm = String(account.dashboard_payload?.fundingProfile?.firm || "").trim();
  if (explicitFirm) return explicitFirm;

  if (source.includes("funding pips") || source.includes("fundingpips")) {
    return "The Funding Pips";
  }
  if (source.includes("the5ers") || source.includes("the 5ers") || source.includes("5ers")) {
    return "The5ers";
  }
  if (source.includes("ftmo")) return "FTMO";
  if (source.includes("orion")) return "Orion Funded";
  if (source.includes("darwinex zero")) return "Darwinex Zero";
  if (
    source.includes("wsfunded") ||
    source.includes("wsf funded") ||
    source.includes("wall street funded")
  ) {
    return "WSF";
  }

  return null;
}

function inferFundingAccountMode(
  fundingProfile: RawLiveDashboardPayload["fundingProfile"] | undefined,
  source: string,
): NonNullable<TradingAccount["funding"]>["accountMode"] {
  if (fundingProfile?.account_type) return fundingProfile.account_type;
  if (
    source.includes("funded") ||
    source.includes("master") ||
    source.includes("payout") ||
    source.includes("cuenta fondeada")
  ) {
    return "funded";
  }
  if (source.includes("evaluation") || source.includes("step")) return "evaluation";
  return "challenge";
}

function inferFundingPhaseLabel(
  firm: string | null,
  fundingProfile: RawLiveDashboardPayload["fundingProfile"] | undefined,
  accountMode: NonNullable<TradingAccount["funding"]>["accountMode"],
  source: string,
) {
  const explicitPhase = String(fundingProfile?.phase_label || "").trim();
  if (explicitPhase) return explicitPhase;
  if (accountMode === "funded") return "Cuenta fondeada";

  if (source.includes("phase 2") || source.includes("fase 2") || source.includes("step 2")) {
    return firm === "The Funding Pips" ? "Step 2" : "Fase 2";
  }
  if (source.includes("verification")) return "Fase 2";
  if (source.includes("phase 1") || source.includes("fase 1") || source.includes("step 1")) {
    return firm === "The Funding Pips" ? "Step 1" : "Fase 1";
  }
  if (firm === "The5ers" && source.includes("high stakes")) return "High Stakes";
  if (firm === "The Funding Pips" && source.includes("1 step")) return "1 Step";

  return "Reto";
}

function inferFundingPlaybookLabel(
  firm: string | null,
  fundingProfile: RawLiveDashboardPayload["fundingProfile"] | undefined,
  source: string,
  objectivePct: number | null,
) {
  const explicitPlaybook = String(fundingProfile?.playbook_label || "").trim();
  if (explicitPlaybook) return explicitPlaybook;

  if (firm === "The Funding Pips") {
    if (source.includes("1 step") || source.includes("one step")) return "1 Step";
    if (source.includes("2 step") || source.includes("two step") || source.includes("standard")) {
      return "2 Step Standard";
    }
  }
  if (firm === "The5ers" && source.includes("high stakes")) return "High Stakes";
  if (firm === "Orion Funded") {
    if (source.includes("standard swing") || source.includes("swing") || objectivePct === 8) {
      return "Standard Swing";
    }
  }
  if (firm === "FTMO") {
    if (source.includes("1 step") || source.includes("one step")) return "1-Step Challenge";
    if (source.includes("2 step") || source.includes("two step") || source.includes("verification")) {
      return "2-Step Challenge";
    }
  }

  return "Capital preservation";
}

function inferFundingObjectivePct(
  firm: string | null,
  fundingProfile: RawLiveDashboardPayload["fundingProfile"] | undefined,
  source: string,
  phaseLabel: string,
) {
  const explicitObjective = toNullableFiniteNumber(fundingProfile?.objective_pct);
  if (explicitObjective !== null) return explicitObjective;

  const sourcePercent = numberFromTextPercent(source, [10, 8, 6, 5, 3]);
  if (sourcePercent !== null) return sourcePercent;

  const phase = normalizeIdentityText(phaseLabel);
  if (firm === "The Funding Pips") {
    if (phase.includes("step 2") || phase.includes("phase 2") || phase.includes("fase 2")) {
      return 5;
    }
    if (source.includes("1 step") || source.includes("one step")) return 10;
  }
  if (firm === "FTMO") {
    if (phase.includes("phase 2") || phase.includes("fase 2") || source.includes("verification")) {
      return 5;
    }
    if (source.includes("1 step") || source.includes("2 step")) return 10;
  }
  if (firm === "Orion Funded" && (source.includes("standard swing") || source.includes("swing"))) {
    return phase.includes("phase 2") || phase.includes("fase 2") ? 5 : 8;
  }

  return null;
}

function inferFundingIdentity(account: RawLiveSnapshotAccount): InferredFundingIdentity {
  const payload = account.dashboard_payload || {};
  const fundingProfile = payload.fundingProfile;
  const source = accountIdentityText(account);
  const firm = inferFundingFirm(account, source);
  const accountMode = inferFundingAccountMode(fundingProfile, source);
  const phaseLabel = inferFundingPhaseLabel(firm, fundingProfile, accountMode, source);
  const objectivePct = inferFundingObjectivePct(firm, fundingProfile, source, phaseLabel);
  const playbookLabel = inferFundingPlaybookLabel(firm, fundingProfile, source, objectivePct);

  return {
    accountMode,
    firm,
    objectivePct,
    phaseLabel,
    playbookLabel,
  };
}

function mapFundingProfile(account: RawLiveSnapshotAccount) {
  const payload = account.dashboard_payload || {};
  const fundingProfile = payload.fundingProfile;
  const inferredIdentity = inferFundingIdentity(account);
  const isFunded = inferIsFunded(account);

  if (!isFunded && !fundingProfile && !inferredIdentity.firm) {
    return undefined;
  }

  const risk = mapRisk(payload);
  const maxRoomLeftPct = Math.max(0, risk.maxLimitPct - risk.maxDrawdownPct);

  return {
    firm:
      String(
          inferredIdentity.firm ||
            account.broker ||
            payload.broker ||
            "Firma de fondeo",
      ).trim() || "Firma de fondeo",
    accountMode: inferredIdentity.accountMode,
    phaseLabel: inferredIdentity.phaseLabel,
    objectivePct: inferredIdentity.objectivePct,
    progressPct: toNullableFiniteNumber(fundingProfile?.current_progress_pct),
    consistencyPct: toNullableFiniteNumber(fundingProfile?.consistency_pct),
    payoutCadenceLabel:
      String(fundingProfile?.payout_cadence_label || "").trim() || null,
    nextPayoutLabel:
      String(fundingProfile?.next_payout_label || "").trim() || null,
    playbookLabel:
      String(inferredIdentity.playbookLabel || "Capital preservation").trim() ||
      "Capital preservation",
    recommendedRiskPct: toFiniteNumber(
      fundingProfile?.recommended_risk_pct,
      Math.max(
        0.15,
        Math.min(risk.dailyRoomLeftPct * 0.3, risk.heatLimitPct * 0.2, 0.75),
      ),
    ),
    resetCostUsd: toNullableFiniteNumber(fundingProfile?.reset_cost_usd),
    dailyRoomLeftPct: risk.dailyRoomLeftPct,
    maxRoomLeftPct,
    status: risk.status,
    allowNewTrades: risk.allowNewTrades,
  } satisfies NonNullable<TradingAccount["funding"]>;
}

function formatSyncLabel(value: string | undefined) {
  if (!value) return "Sin sincronizar";

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "Lectura pendiente";

  const diffSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return `Hace ${diffSeconds} s`;

  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `Hace ${diffMinutes} min`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;

  const diffDays = Math.round(diffHours / 24);
  return `Hace ${diffDays} d`;
}

function getSyncAgeMinutes(value: string | undefined) {
  if (!value) return null;

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;

  return Math.max(0, (Date.now() - timestamp) / 60000);
}

function resolveConnectionTone(
  account: RawLiveSnapshotAccount,
): TradingAccount["connectionTone"] {
  const status = String(account.status || "").trim().toLowerCase();
  if (status === "error") return "danger";
  const ageMinutes = getSyncAgeMinutes(account.last_sync_at);
  if (ageMinutes === null) return "warning";

  if (ageMinutes <= 5) return "connected";
  if (ageMinutes <= 20) return "warning";
  return "stale";
}

function resolveConnectionState(
  account: RawLiveSnapshotAccount,
): TradingAccount["connectionState"] {
  const status = String(account.status || "").trim().toLowerCase();
  if (status === "error") return "error";
  if (status === "linked" || status === "pending_link") return "pending";
  if (status === "active" || status === "connected") {
    const ageMinutes = getSyncAgeMinutes(account.last_sync_at);

    if (ageMinutes === null) return "pending";
    if (ageMinutes > 20) return "stale";
    return "connected";
  }
  return "stale";
}

function mapAccount(account: RawLiveSnapshotAccount): TradingAccount {
  const payload = account.dashboard_payload || {};
  const sanitizeAccountText = (value: string, fallback: string) => {
    const sanitized = value
      .replace(/\bMT5\s+Demo\b/gi, "MT5")
      .replace(/\bDemo\b/gi, "")
      .replace(/-+/g, "-")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+-\s+/g, " - ")
      .replace(/-\s*$/g, "")
      .trim();

    return sanitized || fallback;
  };
  const rawLabel = friendlyAccountLabel(account);
  const rawServer =
    String(account.server || "").trim() ||
    String(payload.server || "").trim();

  return {
    id:
      String(account.account_id || "").trim() ||
      String(account.login || "").trim() ||
      "mt5-account",
    label: sanitizeAccountText(rawLabel, "MT5 Account"),
    broker:
      String(account.broker || "").trim() ||
      String(payload.broker || "").trim() ||
      "Broker no disponible",
    server: sanitizeAccountText(rawServer, "Server no disponible"),
    login: String(account.login || "").trim() || "Sin login",
    platform: "mt5",
    baseCurrency: "USD",
    balance: toFiniteNumber(payload.balance),
    equity: toFiniteNumber(payload.equity, toFiniteNumber(payload.balance)),
    floatingPnl: toFiniteNumber(payload.floatingPnl ?? payload.openPnl),
    totalPnl: toFiniteNumber(payload.totalPnl ?? payload.closedPnl),
    openPositionsCount: toFiniteNumber(payload.openPositionsCount),
    connectionState: resolveConnectionState(account),
    connectionTone: resolveConnectionTone(account),
    lastSyncLabel: formatSyncLabel(account.last_sync_at),
    isFunded: inferIsFunded(account),
    planAccess: inferPlanAccess(account),
    equityHistory: mapEquitySeries(payload),
    funding: mapFundingProfile(account),
  };
}

function compactHistoryLabel(value: string | undefined, index: number) {
  if (!value) return `P${index + 1}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `P${index + 1}`;

  return COMPACT_HISTORY_LABEL_FORMATTER.format(date);
}

function parseRawTradeCloseMs(row: RawLiveTrade) {
  const closedAt = parseDateFromUnixOrIso(
    row.close_time_unix ?? row.time_unix,
    row.close_time ?? row.time,
    "",
  );
  const closedMs = new Date(closedAt).getTime();

  return Number.isFinite(closedMs) ? closedMs : null;
}

function rawTradeNetPnl(row: RawLiveTrade) {
  const grossPnl = toFiniteNumber(row.profit);
  const commission = toFiniteNumber(row.commission);
  const swap = toFiniteNumber(row.swap);

  return toFiniteNumber(row.net, grossPnl + commission + swap);
}

function buildTradeBackfilledEquitySeries(
  payload: RawLiveDashboardPayload,
  historyPoints: MetricPoint[],
) {
  const rows = Array.isArray(payload.trades) ? payload.trades : [];
  if (!rows.length) return historyPoints;

  const firstHistoryMs = historyPoints[0]?.timestamp
    ? new Date(historyPoints[0].timestamp).getTime()
    : Number.POSITIVE_INFINITY;
  const hasHistoryStart = Number.isFinite(firstHistoryMs);
  const trades = rows
    .map((row) => ({
      time: parseRawTradeCloseMs(row),
      netPnl: rawTradeNetPnl(row),
    }))
    .filter((row): row is { time: number; netPnl: number } => row.time !== null)
    .toSorted((a, b) => a.time - b.time);
  const preHistoryTrades = hasHistoryStart
    ? trades.filter((trade) => trade.time < firstHistoryMs)
    : trades;

  if (!preHistoryTrades.length) return historyPoints;

  const anchorValue = hasHistoryStart
    ? historyPoints[0]?.value
    : toFiniteNumber(payload.equity, toFiniteNumber(payload.balance));
  if (!Number.isFinite(anchorValue)) return historyPoints;

  const preHistoryPnl = preHistoryTrades.reduce((sum, trade) => sum + trade.netPnl, 0);
  let runningValue = anchorValue - preHistoryPnl;
  const firstTradeTime = preHistoryTrades[0]?.time ?? 0;
  const backfilled: MetricPoint[] = [
    {
      label: compactHistoryLabel(new Date(Math.max(0, firstTradeTime - 60_000)).toISOString(), 0),
      value: runningValue,
      timestamp: new Date(Math.max(0, firstTradeTime - 60_000)).toISOString(),
    },
  ];

  preHistoryTrades.forEach((trade, index) => {
    runningValue += trade.netPnl;
    const timestamp = new Date(trade.time).toISOString();

    backfilled.push({
      label: compactHistoryLabel(timestamp, index + 1),
      value: runningValue,
      timestamp,
    });
  });

  return [...backfilled, ...historyPoints];
}

function mapEquitySeries(payload: RawLiveDashboardPayload): MetricPoint[] {
  const history = Array.isArray(payload.history) ? payload.history : [];
  if (!history.length) {
    return buildTradeBackfilledEquitySeries(payload, [
      {
        label: "Actual",
        value: toFiniteNumber(payload.equity, toFiniteNumber(payload.balance)),
      },
    ]);
  }

  return buildTradeBackfilledEquitySeries(payload, history.map((point, index) => ({
    label: compactHistoryLabel(point.timestamp, index),
    value: toFiniteNumber(point.value ?? point.equity ?? point.balance),
    timestamp: point.timestamp,
  })));
}

function mapRisk(payload: RawLiveDashboardPayload): RiskSnapshot {
  const riskSnapshot = payload.riskSnapshot || {};
  const summary = riskSnapshot.summary || {};
  const status = riskSnapshot.status || {};
  const policy = riskSnapshot.policy || {};
  const exposures = Array.isArray(riskSnapshot.symbol_exposure)
    ? riskSnapshot.symbol_exposure
    : [];

  const dailyLimitPct = toFiniteNumber(
    policy.daily_dd_limit_pct,
    toFiniteNumber(summary.daily_drawdown_pct) +
      toFiniteNumber(summary.distance_to_daily_dd_limit_pct),
  );
  const maxLimitPct = toFiniteNumber(
    policy.max_dd_limit_pct,
    toFiniteNumber(summary.max_drawdown_limit_pct),
  );
  const heatLimitPct = toFiniteNumber(
    policy.portfolio_heat_limit_pct,
    toFiniteNumber(summary.portfolio_heat_limit_pct),
  );

  return {
    status: toRiskStatus(status.risk_status),
    severity: toRiskSeverity(status.severity),
    actionRequired:
      String(status.action_required || "").trim() || "Sin acción requerida.",
    blockingRule:
      String(status.blocking_rule || "").trim() || "Sin bloqueo duro activo.",
    allowNewTrades: Boolean(status.enforcement?.allow_new_trades ?? true),
    dailyDrawdownPct: toFiniteNumber(summary.daily_drawdown_pct),
    dailyLimitPct,
    dailyRoomLeftPct: Math.max(
      0,
      toFiniteNumber(
        summary.distance_to_daily_dd_limit_pct,
        dailyLimitPct - toFiniteNumber(summary.daily_drawdown_pct),
      ),
    ),
    maxDrawdownPct: toFiniteNumber(summary.peak_to_equity_drawdown_pct),
    maxLimitPct,
    totalOpenRiskPct: toFiniteNumber(summary.total_open_risk_pct),
    heatLimitPct,
    exposureBySymbol: exposures.slice(0, 6).map((item) => {
      const riskPct = toFiniteNumber(item.risk_pct);
      return {
        symbol: String(item.symbol || "N/A"),
        openRiskPct: riskPct,
        tone: toRiskStatus(
          riskPct >= heatLimitPct
            ? "violation"
            : riskPct >= Math.max(heatLimitPct * 0.5, 1)
              ? "warning"
              : "ok",
        ),
      };
    }),
  };
}

function mapAnalytics(payload: RawLiveDashboardPayload) {
  const reportMetrics = payload.reportMetrics || {};
  const riskSnapshot = payload.riskSnapshot || {};
  const sortino = riskSnapshot.professional_metrics?.risk_adjusted?.sortino_ratio;
  const performanceSortino = typeof sortino === "number" ? sortino : null;
  const netProfit = toFiniteNumber(reportMetrics.netProfit, toFiniteNumber(payload.closedPnl));
  const totalTrades = Math.max(
    0,
    Math.round(toFiniteNumber(reportMetrics.totalTrades, toFiniteNumber(payload.totalTrades))),
  );
  const winRatePct = toFiniteNumber(reportMetrics.winRate, toFiniteNumber(payload.winRate));
  const winCount = Math.round((totalTrades * winRatePct) / 100);
  const lossCount = Math.max(0, totalTrades - winCount);
  const profitFactor = toFiniteNumber(reportMetrics.profitFactor);
  const reportedGrossProfit = toFiniteNumber(reportMetrics.grossProfit);
  const reportedGrossLoss = Math.abs(toFiniteNumber(reportMetrics.grossLoss));
  const hasReportedGrossMetrics =
    reportedGrossProfit > 0 || reportedGrossLoss > 0;
  const derivedGrossLoss =
    !hasReportedGrossMetrics &&
    Number.isFinite(netProfit) &&
    Number.isFinite(profitFactor) &&
    profitFactor !== 1
      ? Math.abs(netProfit / (profitFactor - 1))
      : 0;
  const grossLoss = hasReportedGrossMetrics
    ? reportedGrossLoss
    : clamp(derivedGrossLoss, 0, Number.MAX_SAFE_INTEGER);
  const grossProfit = hasReportedGrossMetrics
    ? reportedGrossProfit
    : clamp(grossLoss * profitFactor, 0, Number.MAX_SAFE_INTEGER);
  const history = Array.isArray(payload.history) ? payload.history : [];
  const firstHistoryValue = toFiniteNumber(history[0]?.value);
  const latestHistoryValue = toFiniteNumber(
    history.at(-1)?.value,
    toFiniteNumber(payload.equity, toFiniteNumber(payload.balance)),
  );
  const netReturnPct =
    firstHistoryValue > 0
      ? ((latestHistoryValue - firstHistoryValue) / firstHistoryValue) * 100
      : 0;

  return {
    performance: {
      netProfit,
      grossProfit,
      grossLoss,
      winRatePct,
      totalTrades,
      winCount,
      lossCount,
      profitFactor,
      sortino: performanceSortino,
      expectancy: totalTrades > 0 ? netProfit / totalTrades : 0,
      avgWin: winCount > 0 ? grossProfit / winCount : 0,
      avgLoss: lossCount > 0 ? grossLoss / lossCount : 0,
      bestTrade: toNullableFiniteNumber(reportMetrics.bestTrade),
      worstTrade: toNullableFiniteNumber(reportMetrics.worstTrade),
      bestWinStreak: Math.max(
        0,
        Math.round(toFiniteNumber(reportMetrics.bestWinningStreak)),
      ),
      bestLossStreak: Math.max(
        0,
        Math.round(toFiniteNumber(reportMetrics.bestLosingStreak)),
      ),
      score: computePerformanceScore({
        winRatePct,
        profitFactor,
        sortino: performanceSortino,
      }),
    },
    summary: [
      {
        label: "Net return",
        value: formatPercent(netReturnPct),
        note: "Derivado desde curva de equity disponible",
      },
      {
        label: "Profit factor",
        value: toFiniteNumber(reportMetrics.profitFactor).toFixed(2),
        note: "Base `reportMetrics`",
      },
      {
        label: "Sortino",
        value: typeof sortino === "number" ? sortino.toFixed(2) : "Pend.",
        note: "Desde `professional_metrics` si existe",
      },
      {
        label: "Win rate",
        value: formatPercent(winRatePct),
        note: `${totalTrades} operaciones cerradas`,
      },
    ],
    periodOptions: ["7D", "30D", "YTD"],
    currentPeriod: "YTD",
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function computePerformanceScore({
  winRatePct,
  profitFactor,
  sortino,
}: {
  winRatePct: number;
  profitFactor: number;
  sortino: number | null;
}) {
  const winRateScore = clamp(winRatePct, 0, 100);
  const profitFactorScore = clamp((profitFactor / 3) * 100, 0, 100);
  const sortinoScore =
    typeof sortino === "number" ? clamp((sortino / 2.5) * 100, 0, 100) : 50;

  return Math.round(
    winRateScore * 0.45 + profitFactorScore * 0.35 + sortinoScore * 0.2,
  );
}

function countFundingAlerts(accounts: RawLiveSnapshotAccount[]) {
  return accounts.reduce((count, account) => {
    const status = toRiskStatus(
      account.dashboard_payload?.riskSnapshot?.status?.risk_status,
    );
    return status === "caution" || status === "blocked" ? count + 1 : count;
  }, 0);
}

function mapDashboard(
  activeAccount: TradingAccount,
  payload: RawLiveDashboardPayload,
  risk: RiskSnapshot,
  accounts: RawLiveSnapshotAccount[],
  sourceMode: WorkspaceSourceMode,
): DashboardModel {
  const exposures = risk.exposureBySymbol[0]?.symbol || "Balanced";
  const fundingAlerts = countFundingAlerts(accounts);

  return {
    title: "Panel operativo",
    subtitle:
      sourceMode === "live"
        ? "Lectura segura sobre snapshot MT5 real y contratos tipados."
        : "Lectura segura sobre snapshot anonimizado y contratos tipados.",
    metrics: [
      {
        id: "equity",
        label: "Equity",
        value: formatCurrency(activeAccount.equity, activeAccount.baseCurrency),
        note: "Cuenta activa",
        tone: "info",
      },
      {
        id: "open-pnl",
        label: "P&L abierto",
        value: formatSignedCurrency(
          activeAccount.floatingPnl,
          activeAccount.baseCurrency,
        ),
        note: `${activeAccount.openPositionsCount} posiciones abiertas`,
        tone:
          activeAccount.floatingPnl > 0
            ? "profit"
            : activeAccount.floatingPnl < 0
              ? "loss"
              : "neutral",
      },
      {
        id: "daily-room",
        label: "Room diario",
        value: formatPercent(risk.dailyRoomLeftPct),
        note: "Distancia al límite diario",
        tone: "risk",
      },
      {
        id: "open-heat",
        label: "Riesgo abierto",
        value: formatPercent(risk.totalOpenRiskPct),
        note: `Límite ${formatPercent(risk.heatLimitPct)}`,
        tone: "neutral",
      },
    ],
    equitySeries: mapEquitySeries(payload),
    pulseItems: [
      {
        label: "Origen",
        value: sourceMode === "live" ? "Lectura MT5" : "Lectura preparada",
        tone: "info",
      },
      {
        label: "Prop Firms",
        value: fundingAlerts > 0 ? `${fundingAlerts} aviso(s)` : "Sin avisos",
        tone: fundingAlerts > 0 ? "risk" : "profit",
      },
      {
        label: "Exposición",
        value: exposures,
        tone: "neutral",
      },
      {
        label: "Trades cerrados",
        value: String(
          toFiniteNumber(payload.reportMetrics?.totalTrades, toFiniteNumber(payload.totalTrades)),
        ),
        tone: "info",
      },
    ],
  };
}

export function createWorkspaceFromLiveSnapshot(
  snapshot: RawLiveAccountsSnapshot,
  sourceMode: WorkspaceSourceMode,
  activeAccountId?: string,
): WorkspaceState {
  const rawAccounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
  if (!rawAccounts.length) {
    const workspace = emptyWorkspace(sourceMode);
    return {
      ...workspace,
      meta: {
        ...workspace.meta,
        ...userMetaFromSnapshot(snapshot),
      },
    };
  }

  const accounts = rawAccounts.map(mapAccount);
  const normalizedActiveAccountId = String(activeAccountId || "").trim();
  const activeRawAccount =
    rawAccounts.find((account) => account.account_id === normalizedActiveAccountId) ??
    rawAccounts.find((account) => account.is_default) ??
    rawAccounts[0];
  const activeAccount =
    accounts.find((account) => account.id === activeRawAccount.account_id) ??
    accounts[0];
  const activePayload = activeRawAccount.dashboard_payload || {};
  const trades = mapTrades(activePayload);
  const tradeBuckets = buildTradeBuckets(trades);
  const risk = mapRisk(activePayload);
  const activeAnalytics = mapAnalytics(activePayload);

  return {
    activeAccountId: activeAccount.id,
    accounts,
    trades,
    dashboard: mapDashboard(
      activeAccount,
      activePayload,
      risk,
      rawAccounts,
      sourceMode,
    ),
    risk,
    analytics: {
      ...activeAnalytics,
      daily: tradeBuckets.daily,
      hourly: tradeBuckets.hourly,
    },
    meta: {
      sourceMode,
      sourceLabel: sourceMode === "live" ? "Lectura MT5" : "Lectura preparada",
      ...userMetaFromSnapshot(snapshot),
    },
  };
}
