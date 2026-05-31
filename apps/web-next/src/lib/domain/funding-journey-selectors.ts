import type { TradingAccount } from "@/lib/contracts/account";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/formatters/numbers";

export type FundingStageKey = "phase_1" | "phase_2" | "funded";

export type FundingStageState =
  | "active"
  | "passed"
  | "funded"
  | "failed"
  | "closed"
  | "requires_review";

export type FundingStageView = {
  key: FundingStageKey;
  label: string;
  state: FundingStageState;
  stateLabel: string;
  account: TradingAccount | null;
  loginLabel: string;
  profitLabel: string;
  progressLabel: string;
  dailyRoomLabel: string;
  maxRoomLabel: string;
  trades: number;
  provenance: string;
};

export type FundingJourneyView = {
  id: string;
  firm: string;
  program: string;
  sizeLabel: string;
  state: "active" | "funded" | "requires_review" | "blocked";
  stateLabel: string;
  currentStageKey: FundingStageKey;
  currentStageLabel: string;
  account: TradingAccount;
  stages: FundingStageView[];
  paidPayoutsUsd: number;
  pendingPayouts: number;
  feesResetsUsd: number;
  netRealUsd: number;
  nextAction: string;
  maxDrawdownLabel: string;
  provenance: string;
};

export type FundingRiskQueueItem = {
  journey: FundingJourneyView;
  requestedRiskAmount: number;
  dailyRoomAmount: number;
  maxRoomAmount: number;
  nextTradeRiskAmount: number;
  riskProgressPct: number;
  answer: string;
};

export type FundingJourneyDashboardView = {
  journeys: FundingJourneyView[];
  riskQueue: FundingRiskQueueItem[];
  nearBreachCount: number;
  nearPassCount: number;
};

export type FundingAccountRow = {
  journey: FundingJourneyView;
  stage: FundingStageView;
  account: TradingAccount;
  funding: NonNullable<TradingAccount["funding"]>;
};

export type FundingRuleRow = {
  journey: FundingJourneyView;
  stage: FundingStageView;
  funding: TradingAccount["funding"] | null;
};

export type FundingRulesOverview = {
  rows: FundingRuleRow[];
  requiresReviewCount: number;
  verifiedCount: number;
  blockedRulesCount: number;
  defensiveRulesCount: number;
  notes: string[];
};

export type FundingPayoutRow = {
  id: string;
  journey: FundingJourneyView;
  type:
    | "payout_received"
    | "payout_requested"
    | "challenge_fee"
    | "reset_fee"
    | "refund"
    | "commission"
    | "manual_adjustment";
  status: "draft" | "pending" | "paid" | "rejected" | "cancelled";
  typeLabel: string;
  statusLabel: string;
  grossUsd: number;
  traderSplitUsd: number;
  firmSplitUsd: number;
  feesUsd: number;
  netUsd: number;
  method: string;
  dateLabel: string;
  provenance: string;
};

export type FundingPayoutDefenseItem = {
  journey: FundingJourneyView;
  mode: "Push" | "Defend" | "Hold";
  note: string;
};

export type FundingPayoutsOverview = {
  rows: FundingPayoutRow[];
  paidPayoutsUsd: number;
  pendingPayoutCount: number;
  feesResetsUsd: number;
  netRealUsd: number;
  averagePayoutUsd: number;
  averagePaymentTimeLabel: string;
  defenseItems: FundingPayoutDefenseItem[];
};

const fundingStageLabels: Record<FundingStageKey, string> = {
  phase_1: "Fase 1",
  phase_2: "Fase 2",
  funded: "Real / Funded",
};

const fundingStageStateLabels: Record<FundingStageState, string> = {
  active: "Activa",
  passed: "Superada",
  funded: "Funded",
  failed: "Fallida",
  closed: "Cerrada",
  requires_review: "Revisar",
};

const fundingJourneyStateLabels: Record<FundingJourneyView["state"], string> = {
  active: "Activo",
  funded: "Funded",
  requires_review: "Revisar",
  blocked: "Bloqueado",
};

const fundingPayoutTypeLabels: Record<FundingPayoutRow["type"], string> = {
  payout_received: "Payout cobrado",
  payout_requested: "Payout solicitado",
  challenge_fee: "Coste de reto",
  reset_fee: "Reset",
  refund: "Reembolso",
  commission: "Comisión",
  manual_adjustment: "Ajuste manual",
};

const fundingPayoutStatusLabels: Record<FundingPayoutRow["status"], string> = {
  draft: "Borrador",
  pending: "Pendiente",
  paid: "Pagado",
  rejected: "Rechazado",
  cancelled: "Cancelado",
};

function buildFundingRows(workspace: WorkspaceState) {
  return workspace.accounts
    .flatMap((account) =>
      account.funding
        ? [
            {
              account,
              funding: account.funding,
            },
          ]
        : [],
    )
    .toSorted((a, b) => {
      const severityRank = { blocked: 0, caution: 1, safe: 2 };
      const statusDiff = severityRank[a.funding.status] - severityRank[b.funding.status];
      if (statusDiff !== 0) return statusDiff;
      return a.funding.dailyRoomLeftPct - b.funding.dailyRoomLeftPct;
    });
}

function inferFundingStageKey(account: TradingAccount): FundingStageKey {
  const funding = account.funding;
  const phaseLabel = String(funding?.phaseLabel ?? "").toLowerCase();

  if (funding?.accountMode === "funded" || phaseLabel.includes("funded")) {
    return "funded";
  }

  if (
    funding?.accountMode === "evaluation" ||
    phaseLabel.includes("phase 2") ||
    phaseLabel.includes("fase 2") ||
    phaseLabel.includes("verification")
  ) {
    return "phase_2";
  }

  return "phase_1";
}

function getFundingStageState(
  account: TradingAccount,
  stageKey: FundingStageKey,
): FundingStageState {
  const funding = account.funding;

  if (!funding) return "requires_review";
  if (funding.status === "blocked") return "failed";
  if (stageKey === "funded") return "funded";

  const objective = funding.objectivePct;
  const progress = funding.progressPct;
  if (objective !== null && progress !== null && progress >= objective) return "passed";

  return "active";
}

function formatNullablePercent(value: number | null) {
  return value === null ? "requiere revisión" : formatPercent(value);
}

function getJourneyLedger(workspace: WorkspaceState, journeyId: string, accountId: string) {
  return (workspace.funding?.ledgerEntries ?? []).filter(
    (entry) => entry.fundingJourneyId === journeyId || entry.accountId === accountId,
  );
}

function sumLedgerAmount(
  entries: ReturnType<typeof getJourneyLedger>,
  predicate: (entry: ReturnType<typeof getJourneyLedger>[number]) => boolean,
) {
  return entries
    .filter(predicate)
    .reduce((sum, entry) => sum + (entry.netReceivedAmount ?? entry.grossAmount ?? 0), 0);
}

export function buildFundingJourneys(workspace: WorkspaceState): FundingJourneyView[] {
  return buildFundingRows(workspace).map(({ account, funding }) => {
    const id = `journey-${account.id}`;
    const currentStageKey = inferFundingStageKey(account);
    const explicitProvenance =
      workspace.meta.sourceMode === "live"
        ? "Lectura MT5 + perfil de fondeo"
        : `${workspace.meta.sourceLabel} + perfil de fondeo`;
    const trades = workspace.trades.length;
    const ledgerEntries = getJourneyLedger(workspace, id, account.id);
    const ledgerFeesResetsUsd = Math.abs(
      sumLedgerAmount(
        ledgerEntries,
        (entry) => entry.type === "challenge_fee" || entry.type === "reset_fee",
      ),
    );
    const paidPayoutsUsd = sumLedgerAmount(
      ledgerEntries,
      (entry) => entry.type === "payout_received" && entry.status === "paid",
    );
    const pendingPayoutEntries = ledgerEntries.filter(
      (entry) => entry.type === "payout_requested" && entry.status === "pending",
    ).length;
    const feesResetsUsd =
      ledgerEntries.length > 0 ? ledgerFeesResetsUsd : funding.resetCostUsd ?? 0;
    const pendingPayouts =
      pendingPayoutEntries > 0 ? pendingPayoutEntries : funding.nextPayoutLabel ? 1 : 0;
    const netRealUsd = paidPayoutsUsd - feesResetsUsd;
    const stageViews: FundingStageView[] = (["phase_1", "phase_2", "funded"] as const).map(
      (stageKey) => {
        if (stageKey !== currentStageKey) {
          return {
            key: stageKey,
            label: fundingStageLabels[stageKey],
            state: "requires_review",
            stateLabel: fundingStageStateLabels.requires_review,
            account: null,
            loginLabel: "Sin login vinculado",
            profitLabel: "requiere revisión",
            progressLabel: "requiere revisión",
            dailyRoomLabel: "requiere revisión",
            maxRoomLabel: "requiere revisión",
            trades: 0,
            provenance: "No hay cuenta historica vinculada todavia",
          };
        }

        const state = getFundingStageState(account, stageKey);

        return {
          key: stageKey,
          label: fundingStageLabels[stageKey],
          state,
          stateLabel: fundingStageStateLabels[state],
          account,
          loginLabel: account.login,
          profitLabel: formatSignedCurrency(account.totalPnl, account.baseCurrency),
          progressLabel:
            funding.objectivePct === null && funding.progressPct === null
              ? "N/A"
              : `${formatNullablePercent(funding.progressPct)} / ${formatNullablePercent(
                  funding.objectivePct,
                )}`,
          dailyRoomLabel: formatPercent(funding.dailyRoomLeftPct),
          maxRoomLabel: formatPercent(funding.maxRoomLeftPct),
          trades,
          provenance: explicitProvenance,
        };
      },
    );

    const hasMissingStages = stageViews.some((stage) => stage.state === "requires_review");
    const state =
      funding.status === "blocked"
        ? "blocked"
        : currentStageKey === "funded"
          ? "funded"
          : hasMissingStages
            ? "requires_review"
            : "active";
    const sizeLabel = formatCurrency(account.balance, account.baseCurrency);
    const nextAction =
      funding.status === "blocked"
        ? "Revisar posible breach antes de operar"
        : currentStageKey === "funded"
          ? "Proteger payout y separar trading PnL de retiros"
          : funding.progressPct !== null && funding.objectivePct !== null
            ? "Gestionar avance sin agotar daily/max room"
            : "Completar reglas verificadas y cuentas historicas";

    return {
      id,
      firm: funding.firm,
      program: funding.phaseLabel,
      sizeLabel,
      state,
      stateLabel: fundingJourneyStateLabels[state],
      currentStageKey,
      currentStageLabel: fundingStageLabels[currentStageKey],
      account,
      stages: stageViews,
      paidPayoutsUsd,
      pendingPayouts,
      feesResetsUsd,
      netRealUsd,
      nextAction,
      maxDrawdownLabel: formatPercent(Math.max(0, 100 - funding.maxRoomLeftPct)),
      provenance: explicitProvenance,
    };
  });
}

export function getFundingRiskQueue(workspace: WorkspaceState): FundingRiskQueueItem[] {
  const journeys = buildFundingJourneys(workspace);
  const nearPass = journeys.filter((journey) => {
    const funding = journey.account.funding;
    if (!funding || funding.objectivePct === null || funding.progressPct === null) {
      return false;
    }

    return funding.objectivePct > 0 && funding.progressPct / funding.objectivePct >= 0.75;
  }).length;

  return journeys.map((journey) => {
    const funding = journey.account.funding;
    const requestedRiskAmount = funding
      ? journey.account.equity * (funding.recommendedRiskPct / 100)
      : 0;
    const dailyRoomAmount = funding
      ? journey.account.equity * (funding.dailyRoomLeftPct / 100)
      : 0;
    const maxRoomAmount = funding
      ? journey.account.equity * (funding.maxRoomLeftPct / 100)
      : 0;
    const answer =
      journey.state === "blocked"
        ? "Mas cerca de romper"
        : journey.currentStageKey === "funded"
          ? "Mas cerca de cobrar si protege payout"
          : nearPass > 0
            ? "Mas cerca de pasar con riesgo controlado"
            : "Requiere mas evidencia";

    return {
      journey,
      requestedRiskAmount,
      dailyRoomAmount,
      maxRoomAmount,
      nextTradeRiskAmount: Math.min(requestedRiskAmount, dailyRoomAmount, maxRoomAmount),
      riskProgressPct: Math.min(100, ((funding?.recommendedRiskPct ?? 0) / 1) * 100),
      answer,
    };
  });
}

export function getFundingJourneyDashboard(
  workspace: WorkspaceState,
): FundingJourneyDashboardView {
  const journeys = buildFundingJourneys(workspace);
  const riskQueue = getFundingRiskQueue(workspace);
  const nearBreachCount = journeys.filter(
    (journey) =>
      journey.account.funding?.status === "blocked" ||
      (journey.account.funding?.dailyRoomLeftPct ?? 100) <= 2,
  ).length;
  const nearPassCount = journeys.filter((journey) => {
    const funding = journey.account.funding;
    if (!funding || funding.objectivePct === null || funding.progressPct === null) {
      return false;
    }

    return funding.objectivePct > 0 && funding.progressPct / funding.objectivePct >= 0.75;
  }).length;

  return {
    journeys,
    riskQueue,
    nearBreachCount,
    nearPassCount,
  };
}

export function getFundingAccountRows(workspace: WorkspaceState): FundingAccountRow[] {
  return buildFundingJourneys(workspace).flatMap((journey) =>
    journey.stages
      .filter((stage): stage is FundingStageView & { account: TradingAccount } =>
        Boolean(stage.account),
      )
      .map((stage) => ({
        journey,
        stage,
        account: stage.account,
        funding: stage.account.funding!,
      })),
  );
}

export function getFundingRulesOverview(
  workspace: WorkspaceState,
): FundingRulesOverview {
  const rows = buildFundingJourneys(workspace).flatMap((journey) =>
    journey.stages.map((stage) => ({
      journey,
      stage,
      funding: stage.account?.funding ?? null,
    })),
  );
  const verifiedRows = rows.filter((item) => item.stage.account);

  return {
    rows,
    requiresReviewCount: rows.filter((item) => item.stage.state === "requires_review").length,
    verifiedCount: verifiedRows.length,
    blockedRulesCount: verifiedRows.filter((item) => item.funding?.status === "blocked").length,
    defensiveRulesCount: verifiedRows.filter(
      (item) =>
        item.funding?.status === "caution" ||
        (item.funding?.recommendedRiskPct ?? Number.POSITIVE_INFINITY) <= 0.3,
    ).length,
    notes: [
      "Margen diario y margen máximo solo se muestran si vienen de cuenta/perfil de fondeo.",
      "Las fases sin cuenta vinculada se marcan como requiere revisión, no se completan con defaults.",
      "Todavía no hay motor de reglas por firma; se evita falsa precisión.",
    ],
  };
}

export function getFundingPayoutsOverview(
  workspace: WorkspaceState,
): FundingPayoutsOverview {
  const journeys = buildFundingJourneys(workspace);
  const rows = journeys.flatMap((journey): FundingPayoutRow[] => {
    const payoutRows: FundingPayoutRow[] = [];

    if (journey.pendingPayouts > 0) {
      payoutRows.push({
        id: `${journey.id}-pending-payout`,
        journey,
        type: "payout_requested",
        status: "pending",
        typeLabel: fundingPayoutTypeLabels.payout_requested,
        statusLabel: fundingPayoutStatusLabels.pending,
        grossUsd: 0,
        traderSplitUsd: 0,
        firmSplitUsd: 0,
        feesUsd: 0,
        netUsd: 0,
        method: "requiere revisión",
        dateLabel: journey.account.funding?.nextPayoutLabel ?? "requiere revisión",
        provenance: journey.provenance,
      });
    }

    if (journey.feesResetsUsd > 0) {
      payoutRows.push({
        id: `${journey.id}-reset-fee`,
        journey,
        type: "reset_fee",
        status: "paid",
        typeLabel: fundingPayoutTypeLabels.reset_fee,
        statusLabel: fundingPayoutStatusLabels.paid,
        grossUsd: 0,
        traderSplitUsd: 0,
        firmSplitUsd: 0,
        feesUsd: journey.feesResetsUsd,
        netUsd: -journey.feesResetsUsd,
        method: "manual",
        dateLabel: "requiere revisión",
        provenance: "Perfil de fondeo / coste de reset",
      });
    }

    if (payoutRows.length === 0) {
      payoutRows.push({
        id: `${journey.id}-empty-ledger`,
        journey,
        type: "manual_adjustment",
        status: "draft",
        typeLabel: fundingPayoutTypeLabels.manual_adjustment,
        statusLabel: fundingPayoutStatusLabels.draft,
        grossUsd: 0,
        traderSplitUsd: 0,
        firmSplitUsd: 0,
        feesUsd: 0,
        netUsd: 0,
        method: "manual",
        dateLabel: "requiere revisión",
        provenance: "Sin entradas manuales de payout todavía",
      });
    }

    return payoutRows;
  });
  const paidRows = rows.filter((row) => row.type === "payout_received" && row.status === "paid");
  const paidPayoutsUsd = paidRows.reduce((sum, row) => sum + row.netUsd, 0);
  const pendingPayoutCount = rows.filter((row) => row.type === "payout_requested").length;
  const feesResetsUsd = rows.reduce((sum, row) => sum + row.feesUsd, 0);
  const netRealUsd = paidPayoutsUsd - feesResetsUsd;

  return {
    rows,
    paidPayoutsUsd,
    pendingPayoutCount,
    feesResetsUsd,
    netRealUsd,
    averagePayoutUsd: paidRows.length === 0 ? 0 : paidPayoutsUsd / paidRows.length,
    averagePaymentTimeLabel: "Requiere revisión",
    defenseItems: journeys.slice(0, 3).map((journey) => {
      const funding = journey.account.funding;
      const mode =
        funding?.status === "blocked"
          ? "Hold"
          : (funding?.recommendedRiskPct ?? 1) <= 0.3 || funding?.status === "caution"
            ? "Defend"
            : "Push";

      return {
        journey,
        mode,
        note: `${funding?.nextPayoutLabel ?? "Sin payout visible"} / ${
          funding?.playbookLabel ?? "requiere revisión"
        }`,
      };
    }),
  };
}
