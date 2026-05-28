import type { TradingAccount } from "@/lib/contracts/account";
import type { FundingJourneyStatus } from "@/lib/contracts/funding";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";

export type FundingAccountPosture = {
  account: TradingAccount;
  journeyStatus: FundingJourneyStatus;
  phaseLabel: string;
  dailyRoomLeftPct: number | null;
  maxRoomLeftPct: number | null;
  recommendedRiskPct: number | null;
  nextPayoutLabel: string | null;
  requiresReview: boolean;
  blockers: string[];
};

export type FundingCockpitSummary = {
  status: "empty" | "partial" | "requires_review" | "ready";
  fundedCapital: number;
  activeChallengeCount: number;
  activeFundedCount: number;
  linkedAccountCount: number;
  paidPayouts: number;
  pendingPayouts: number;
  feesAndResets: number;
  netFundingResult: number;
  requiresReviewCount: number;
  nextEventLabel: string;
  postures: FundingAccountPosture[];
};

function getJourneyStatus(account: TradingAccount): FundingJourneyStatus {
  if (!account.funding) return "requires_review";
  if (!account.funding.allowNewTrades || account.funding.status === "blocked") {
    return "failed";
  }
  if (account.funding.accountMode === "funded") return "funded_active";
  if (account.funding.accountMode === "challenge") return "active";
  return "requires_review";
}

export function getFundingAccountPostures(
  workspace: WorkspaceState,
): FundingAccountPosture[] {
  return workspace.accounts
    .filter((account) => account.isFunded || Boolean(account.funding))
    .map((account) => {
      const funding = account.funding;
      const blockers = [
        !funding ? "missing_funding_profile" : null,
        funding?.dailyRoomLeftPct !== undefined && funding.dailyRoomLeftPct <= 2
          ? "daily_room_low"
          : null,
        account.planAccess === "limited" ? "plan_limited" : null,
        account.connectionState === "stale" ? "stale_sync" : null,
      ].filter((item): item is string => Boolean(item));

      return {
        account,
        journeyStatus: getJourneyStatus(account),
        phaseLabel: funding?.phaseLabel ?? "requiere revisión",
        dailyRoomLeftPct: funding?.dailyRoomLeftPct ?? null,
        maxRoomLeftPct: funding?.maxRoomLeftPct ?? null,
        recommendedRiskPct: funding?.recommendedRiskPct ?? null,
        nextPayoutLabel: funding?.nextPayoutLabel ?? null,
        requiresReview: blockers.length > 0 || !funding,
        blockers,
      };
    });
}

export function getFundingCockpitSummary(
  workspace: WorkspaceState,
): FundingCockpitSummary {
  const postures = getFundingAccountPostures(workspace);
  const ledgerEntries = workspace.funding?.ledgerEntries ?? [];
  const paidPayouts = ledgerEntries
    .filter((entry) => entry.type === "payout_received" && entry.status === "paid")
    .reduce((sum, entry) => sum + (entry.netReceivedAmount ?? entry.grossAmount ?? 0), 0);
  const pendingPayouts = ledgerEntries
    .filter((entry) => entry.type === "payout_requested" && entry.status === "pending")
    .reduce((sum, entry) => sum + (entry.netReceivedAmount ?? entry.grossAmount ?? 0), 0);
  const feesAndResets = ledgerEntries
    .filter((entry) => entry.type === "challenge_fee" || entry.type === "reset_fee")
    .reduce((sum, entry) => sum + Math.abs(entry.netReceivedAmount ?? entry.grossAmount ?? 0), 0);
  const ledgerAccountIds = new Set(
    ledgerEntries
      .filter((entry) => entry.type === "challenge_fee" || entry.type === "reset_fee")
      .map((entry) => entry.accountId)
      .filter((accountId): accountId is string => Boolean(accountId)),
  );
  const profileFeesAndResets = postures.reduce((sum, posture) => {
    if (ledgerAccountIds.has(posture.account.id)) return sum;
    return sum + Math.abs(posture.account.funding?.resetCostUsd ?? 0);
  }, 0);
  const totalFeesAndResets = feesAndResets + profileFeesAndResets;
  const fundedCapital = postures.reduce(
    (sum, posture) => sum + posture.account.equity,
    0,
  );
  const nextEventLabel =
    postures.find((posture) => posture.nextPayoutLabel)?.nextPayoutLabel ??
    "requiere revisión";
  const requiresReviewCount = postures.filter((posture) => posture.requiresReview).length;
  const status =
    postures.length === 0
      ? "empty"
      : requiresReviewCount === 0
        ? "ready"
        : requiresReviewCount === postures.length
          ? "requires_review"
          : "partial";

  return {
    status,
    fundedCapital,
    activeChallengeCount: postures.filter(
      (posture) => posture.account.funding?.accountMode === "challenge",
    ).length,
    activeFundedCount: postures.filter(
      (posture) => posture.account.funding?.accountMode === "funded",
    ).length,
    linkedAccountCount: postures.length,
    paidPayouts,
    pendingPayouts,
    feesAndResets: totalFeesAndResets,
    netFundingResult: paidPayouts - totalFeesAndResets,
    requiresReviewCount,
    nextEventLabel,
    postures,
  };
}
