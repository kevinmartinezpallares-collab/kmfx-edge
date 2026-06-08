import type { TradingAccount } from "@/lib/contracts/account";

export type FundingRulePhase = "phase_1" | "phase_2" | "funded";

export type FundingDrawdownKind =
  | "static_initial_balance"
  | "daily_high_water_balance"
  | "trailing_equity"
  | "trailing_lock"
  | "allocation_model"
  | "unknown";

export type FundingDailyBaseline =
  | "initial_balance"
  | "reset_balance_minus_initial_limit"
  | "opening_balance_or_equity"
  | "previous_day_close_balance_or_equity"
  | "allocation_model"
  | "unknown";

export type FundingRuleVerification = "verified" | "requires_review" | "not_funded";

export type FundingRuleSetDefinition = {
  id: string;
  firmId: string;
  firmName: string;
  firmAliases: string[];
  programId: string;
  programName: string;
  programAliases: string[];
  phaseId: FundingRulePhase;
  phaseAliases: string[];
  accountModes: Array<NonNullable<TradingAccount["funding"]>["accountMode"]>;
  dailyLossLimitPct: number | null;
  maxLossLimitPct: number | null;
  profitTargetPct: number | null;
  minimumTradingDays: number | null;
  minimumTrades: number | null;
  maxDrawdownKind: FundingDrawdownKind;
  dailyBaseline: FundingDailyBaseline;
  dailyResetTime: string | null;
  dailyResetTimezone: string | null;
  floatingLossCounts: boolean;
  touchedLimitBreaches: boolean;
  bestDayRulePct: number | null;
  consistencyThresholdPct: number | null;
  maxRiskPerTradePct: number | null;
  sourceUrl: string;
  sourceLabel: string;
  verifiedAt: string;
  notes: string[];
};

export type FundingRuleResolution =
  | {
      status: "not_funded";
      accountId: string;
      message: string;
    }
  | {
      status: "verified";
      accountId: string;
      ruleSet: FundingRuleSetDefinition;
      matchConfidence: "exact" | "firm_phase";
      warnings: string[];
    }
  | {
      status: "requires_review";
      accountId: string;
      firmName: string;
      candidateRules: FundingRuleSetDefinition[];
      reason: string;
      warnings: string[];
    };

export type FundingRuleAlert = {
  id: string;
  tone: "danger" | "warning" | "info";
  label: string;
  reason: string;
  ruleId?: string;
  sourceLabel?: string;
};

export type FundingRuleEvaluationStatus =
  | "not_funded"
  | "clear"
  | "warning"
  | "blocked"
  | "requires_review";

export type FundingRuleEvaluation = {
  resolution: FundingRuleResolution;
  status: FundingRuleEvaluationStatus;
  allowNewTradesRecommendation: boolean;
  dailyUsagePct: number | null;
  maxUsagePct: number | null;
  alerts: FundingRuleAlert[];
};

const VERIFIED_AT = "2026-06-05";

export const fundingRuleCatalog: FundingRuleSetDefinition[] = [
  {
    accountModes: ["evaluation", "challenge"],
    bestDayRulePct: null,
    consistencyThresholdPct: null,
    dailyBaseline: "opening_balance_or_equity",
    dailyLossLimitPct: 3,
    dailyResetTime: "00:00",
    dailyResetTimezone: "UTC+3 platform time",
    firmAliases: ["funding pips", "the funding pips", "fundingpips", "tfp"],
    firmId: "the-funding-pips",
    firmName: "The Funding Pips",
    floatingLossCounts: true,
    id: "the-funding-pips-1-step-phase-1",
    maxDrawdownKind: "static_initial_balance",
    maxLossLimitPct: 6,
    maxRiskPerTradePct: null,
    minimumTrades: null,
    minimumTradingDays: 3,
    notes: [
      "1-Step evaluation has one phase before Master.",
      "Risk per trade idea applies only on Master accounts.",
      "A touched daily or maximum loss limit is treated as a violation.",
    ],
    phaseAliases: ["phase 1", "fase 1", "1 step", "one step", "evaluation"],
    phaseId: "phase_1",
    profitTargetPct: 10,
    programAliases: ["1 step", "1-step", "one step", "one-step"],
    programId: "1-step",
    programName: "1 Step",
    sourceLabel: "The Funding Pips Help Center, 1 Step Model",
    sourceUrl: "https://help.fundingpips.com/hc/en-us/articles/34501697434385-1-Step-Model",
    touchedLimitBreaches: true,
    verifiedAt: VERIFIED_AT,
  },
  {
    accountModes: ["evaluation", "challenge"],
    bestDayRulePct: null,
    consistencyThresholdPct: null,
    dailyBaseline: "opening_balance_or_equity",
    dailyLossLimitPct: 5,
    dailyResetTime: "00:00",
    dailyResetTimezone: "UTC+3 platform time",
    firmAliases: ["funding pips", "the funding pips", "fundingpips", "tfp"],
    firmId: "the-funding-pips",
    firmName: "The Funding Pips",
    floatingLossCounts: true,
    id: "the-funding-pips-2-step-standard-phase-1-8",
    maxDrawdownKind: "static_initial_balance",
    maxLossLimitPct: 10,
    maxRiskPerTradePct: null,
    minimumTrades: null,
    minimumTradingDays: 3,
    notes: [
      "2-Step Standard Phase 1 can be 8% or 10%; account metadata must identify selected target.",
      "Risk per trade idea applies only on Master accounts.",
      "A touched daily or maximum loss limit is treated as a violation.",
    ],
    phaseAliases: ["phase 1", "fase 1", "student"],
    phaseId: "phase_1",
    profitTargetPct: 8,
    programAliases: ["2 step", "2-step", "two step", "two-step", "standard", "step 1"],
    programId: "2-step-standard-8",
    programName: "2 Step Standard, Phase 1 target 8%",
    sourceLabel: "The Funding Pips Help Center, 2 Step Standard",
    sourceUrl: "https://help.fundingpips.com/hc/en-us/articles/34501809112081-2-Step-Standard",
    touchedLimitBreaches: true,
    verifiedAt: VERIFIED_AT,
  },
  {
    accountModes: ["evaluation", "challenge"],
    bestDayRulePct: null,
    consistencyThresholdPct: null,
    dailyBaseline: "opening_balance_or_equity",
    dailyLossLimitPct: 5,
    dailyResetTime: "00:00",
    dailyResetTimezone: "UTC+3 platform time",
    firmAliases: ["funding pips", "the funding pips", "fundingpips", "tfp"],
    firmId: "the-funding-pips",
    firmName: "The Funding Pips",
    floatingLossCounts: true,
    id: "the-funding-pips-2-step-standard-phase-1-10",
    maxDrawdownKind: "static_initial_balance",
    maxLossLimitPct: 10,
    maxRiskPerTradePct: null,
    minimumTrades: null,
    minimumTradingDays: 3,
    notes: [
      "2-Step Standard Phase 1 can be 8% or 10%; account metadata must identify selected target.",
      "Risk per trade idea applies only on Master accounts.",
      "A touched daily or maximum loss limit is treated as a violation.",
    ],
    phaseAliases: ["phase 1", "fase 1", "student"],
    phaseId: "phase_1",
    profitTargetPct: 10,
    programAliases: ["2 step", "2-step", "two step", "two-step", "standard", "step 1"],
    programId: "2-step-standard-10",
    programName: "2 Step Standard, Phase 1 target 10%",
    sourceLabel: "The Funding Pips Help Center, 2 Step Standard",
    sourceUrl: "https://help.fundingpips.com/hc/en-us/articles/34501809112081-2-Step-Standard",
    touchedLimitBreaches: true,
    verifiedAt: VERIFIED_AT,
  },
  {
    accountModes: ["evaluation", "challenge"],
    bestDayRulePct: null,
    consistencyThresholdPct: null,
    dailyBaseline: "opening_balance_or_equity",
    dailyLossLimitPct: 5,
    dailyResetTime: "00:00",
    dailyResetTimezone: "UTC+3 platform time",
    firmAliases: ["funding pips", "the funding pips", "fundingpips", "tfp"],
    firmId: "the-funding-pips",
    firmName: "The Funding Pips",
    floatingLossCounts: true,
    id: "the-funding-pips-2-step-standard-phase-2",
    maxDrawdownKind: "static_initial_balance",
    maxLossLimitPct: 10,
    maxRiskPerTradePct: null,
    minimumTrades: null,
    minimumTradingDays: 3,
    notes: [
      "2-Step Standard Phase 2 target is 5%.",
      "Risk per trade idea applies only on Master accounts.",
      "A touched daily or maximum loss limit is treated as a violation.",
    ],
    phaseAliases: ["phase 2", "fase 2", "step 2", "practitioner", "verification"],
    phaseId: "phase_2",
    profitTargetPct: 5,
    programAliases: ["2 step", "2-step", "two step", "two-step", "standard", "step 2"],
    programId: "2-step-standard",
    programName: "2 Step Standard",
    sourceLabel: "The Funding Pips Help Center, 2 Step Standard",
    sourceUrl: "https://help.fundingpips.com/hc/en-us/articles/34501809112081-2-Step-Standard",
    touchedLimitBreaches: true,
    verifiedAt: VERIFIED_AT,
  },
  {
    accountModes: ["funded"],
    bestDayRulePct: null,
    consistencyThresholdPct: 35,
    dailyBaseline: "opening_balance_or_equity",
    dailyLossLimitPct: 5,
    dailyResetTime: "00:00",
    dailyResetTimezone: "UTC+3 platform time",
    firmAliases: ["funding pips", "the funding pips", "fundingpips", "tfp"],
    firmId: "the-funding-pips",
    firmName: "The Funding Pips",
    floatingLossCounts: true,
    id: "the-funding-pips-2-step-standard-master",
    maxDrawdownKind: "static_initial_balance",
    maxLossLimitPct: 10,
    maxRiskPerTradePct: 2,
    minimumTrades: null,
    minimumTradingDays: null,
    notes: [
      "Risk per trade idea applies on Master accounts.",
      "Master max risk per trade idea is 3% below 50K and 2% at 50K or above; catalog stores conservative 2% until account size branch is resolved.",
      "On Demand rewards require 35% consistency score and minimum 2% profit.",
      "Weekend holds are temporarily not allowed on Master accounts per help center.",
    ],
    phaseAliases: ["master", "funded", "funded account", "real"],
    phaseId: "funded",
    profitTargetPct: null,
    programAliases: ["2 step", "2-step", "two step", "two-step", "standard", "master"],
    programId: "2-step-standard-master",
    programName: "2 Step Standard Master",
    sourceLabel: "The Funding Pips Help Center, 2 Step Standard",
    sourceUrl: "https://help.fundingpips.com/hc/en-us/articles/34501809112081-2-Step-Standard",
    touchedLimitBreaches: true,
    verifiedAt: VERIFIED_AT,
  },
  {
    accountModes: ["evaluation", "challenge"],
    bestDayRulePct: 50,
    consistencyThresholdPct: null,
    dailyBaseline: "reset_balance_minus_initial_limit",
    dailyLossLimitPct: 3,
    dailyResetTime: "00:00",
    dailyResetTimezone: "CE(S)T",
    firmAliases: ["ftmo", "ftmo challenge"],
    firmId: "ftmo",
    firmName: "FTMO",
    floatingLossCounts: true,
    id: "ftmo-1-step-phase-1",
    maxDrawdownKind: "daily_high_water_balance",
    maxLossLimitPct: 10,
    maxRiskPerTradePct: null,
    minimumTrades: null,
    minimumTradingDays: null,
    notes: [
      "1-Step maximum loss is recalculated against the higher midnight balance or initial simulated capital.",
      "Best Day Rule is 50%.",
      "Daily loss is measured from the balance recorded at reset minus the fixed initial-capital daily loss amount.",
    ],
    phaseAliases: ["phase 1", "fase 1", "1 step", "one step", "challenge"],
    phaseId: "phase_1",
    profitTargetPct: 10,
    programAliases: ["1 step", "1-step", "one step", "one-step"],
    programId: "1-step",
    programName: "1-Step Challenge",
    sourceLabel: "FTMO Trading Objectives",
    sourceUrl: "https://ftmo.com/en/trading-objectives/",
    touchedLimitBreaches: true,
    verifiedAt: VERIFIED_AT,
  },
  {
    accountModes: ["evaluation", "challenge"],
    bestDayRulePct: null,
    consistencyThresholdPct: null,
    dailyBaseline: "initial_balance",
    dailyLossLimitPct: 5,
    dailyResetTime: "00:00",
    dailyResetTimezone: "CE(S)T",
    firmAliases: ["ftmo", "ftmo challenge"],
    firmId: "ftmo",
    firmName: "FTMO",
    floatingLossCounts: true,
    id: "ftmo-2-step-phase-1",
    maxDrawdownKind: "static_initial_balance",
    maxLossLimitPct: 10,
    maxRiskPerTradePct: null,
    minimumTrades: null,
    minimumTradingDays: 4,
    notes: ["2-Step Challenge Phase 1 profit target is 10%."],
    phaseAliases: ["phase 1", "fase 1", "challenge"],
    phaseId: "phase_1",
    profitTargetPct: 10,
    programAliases: ["2 step", "2-step", "two step", "two-step", "challenge"],
    programId: "2-step",
    programName: "2-Step Challenge",
    sourceLabel: "FTMO Trading Objectives",
    sourceUrl: "https://ftmo.com/en/trading-objectives/",
    touchedLimitBreaches: true,
    verifiedAt: VERIFIED_AT,
  },
  {
    accountModes: ["evaluation", "challenge"],
    bestDayRulePct: null,
    consistencyThresholdPct: null,
    dailyBaseline: "initial_balance",
    dailyLossLimitPct: 5,
    dailyResetTime: "00:00",
    dailyResetTimezone: "CE(S)T",
    firmAliases: ["ftmo", "ftmo challenge"],
    firmId: "ftmo",
    firmName: "FTMO",
    floatingLossCounts: true,
    id: "ftmo-2-step-phase-2",
    maxDrawdownKind: "static_initial_balance",
    maxLossLimitPct: 10,
    maxRiskPerTradePct: null,
    minimumTrades: null,
    minimumTradingDays: 4,
    notes: ["FTMO Verification target is 5%."],
    phaseAliases: ["phase 2", "fase 2", "verification"],
    phaseId: "phase_2",
    profitTargetPct: 5,
    programAliases: ["2 step", "2-step", "two step", "two-step", "verification"],
    programId: "2-step",
    programName: "2-Step Challenge",
    sourceLabel: "FTMO Trading Objectives",
    sourceUrl: "https://ftmo.com/en/trading-objectives/",
    touchedLimitBreaches: true,
    verifiedAt: VERIFIED_AT,
  },
  {
    accountModes: ["funded"],
    bestDayRulePct: null,
    consistencyThresholdPct: null,
    dailyBaseline: "initial_balance",
    dailyLossLimitPct: 5,
    dailyResetTime: "00:00",
    dailyResetTimezone: "CE(S)T",
    firmAliases: ["ftmo", "ftmo account", "ftmo funded"],
    firmId: "ftmo",
    firmName: "FTMO",
    floatingLossCounts: true,
    id: "ftmo-2-step-funded",
    maxDrawdownKind: "static_initial_balance",
    maxLossLimitPct: 10,
    maxRiskPerTradePct: null,
    minimumTrades: null,
    minimumTradingDays: null,
    notes: ["FTMO Account has no profit target; drawdown objectives remain."],
    phaseAliases: ["funded", "ftmo account", "real", "payout"],
    phaseId: "funded",
    profitTargetPct: null,
    programAliases: ["2 step", "2-step", "two step", "two-step", "payout"],
    programId: "2-step-funded",
    programName: "2-Step FTMO Account",
    sourceLabel: "FTMO Trading Objectives",
    sourceUrl: "https://ftmo.com/en/trading-objectives/",
    touchedLimitBreaches: true,
    verifiedAt: VERIFIED_AT,
  },
  {
    accountModes: ["evaluation", "challenge"],
    bestDayRulePct: null,
    consistencyThresholdPct: null,
    dailyBaseline: "previous_day_close_balance_or_equity",
    dailyLossLimitPct: 5,
    dailyResetTime: "00:00",
    dailyResetTimezone: "server time",
    firmAliases: ["the5ers", "the 5ers", "5ers"],
    firmId: "the5ers",
    firmName: "The5ers",
    floatingLossCounts: true,
    id: "the5ers-high-stakes-new-phase-1",
    maxDrawdownKind: "static_initial_balance",
    maxLossLimitPct: 10,
    maxRiskPerTradePct: null,
    minimumTrades: null,
    minimumTradingDays: 3,
    notes: [
      "New High Stakes is a 2-step evaluation.",
      "Minimum trading-day requirement is three profitable trading days.",
      "Daily drawdown uses the higher previous-day closing equity or balance.",
    ],
    phaseAliases: ["phase 1", "fase 1", "high stakes"],
    phaseId: "phase_1",
    profitTargetPct: 10,
    programAliases: ["high stakes", "new high stakes"],
    programId: "high-stakes-new",
    programName: "High Stakes New",
    sourceLabel: "The5ers Help Center, High Stakes",
    sourceUrl: "https://help.the5ers.com/what-are-the-general-rules-for-the-high-stakes-program/",
    touchedLimitBreaches: true,
    verifiedAt: VERIFIED_AT,
  },
  {
    accountModes: ["evaluation", "challenge"],
    bestDayRulePct: null,
    consistencyThresholdPct: null,
    dailyBaseline: "previous_day_close_balance_or_equity",
    dailyLossLimitPct: 5,
    dailyResetTime: "00:00",
    dailyResetTimezone: "server time",
    firmAliases: ["the5ers", "the 5ers", "5ers"],
    firmId: "the5ers",
    firmName: "The5ers",
    floatingLossCounts: true,
    id: "the5ers-high-stakes-classic-phase-1",
    maxDrawdownKind: "static_initial_balance",
    maxLossLimitPct: 10,
    maxRiskPerTradePct: null,
    minimumTrades: null,
    minimumTradingDays: 3,
    notes: [
      "Classic High Stakes Phase 1 target is 8%.",
      "Minimum trading-day requirement is three profitable trading days.",
      "Daily drawdown uses the higher previous-day closing equity or balance.",
    ],
    phaseAliases: ["phase 1", "fase 1", "high stakes", "classic"],
    phaseId: "phase_1",
    profitTargetPct: 8,
    programAliases: ["high stakes", "classic high stakes"],
    programId: "high-stakes-classic",
    programName: "High Stakes Classic",
    sourceLabel: "The5ers Help Center, High Stakes",
    sourceUrl: "https://help.the5ers.com/what-are-the-general-rules-for-the-high-stakes-program/",
    touchedLimitBreaches: true,
    verifiedAt: VERIFIED_AT,
  },
  {
    accountModes: ["evaluation", "challenge"],
    bestDayRulePct: null,
    consistencyThresholdPct: null,
    dailyBaseline: "previous_day_close_balance_or_equity",
    dailyLossLimitPct: 5,
    dailyResetTime: "00:00",
    dailyResetTimezone: "server time",
    firmAliases: ["the5ers", "the 5ers", "5ers"],
    firmId: "the5ers",
    firmName: "The5ers",
    floatingLossCounts: true,
    id: "the5ers-high-stakes-phase-2",
    maxDrawdownKind: "static_initial_balance",
    maxLossLimitPct: 10,
    maxRiskPerTradePct: null,
    minimumTrades: null,
    minimumTradingDays: 3,
    notes: [
      "High Stakes Phase 2 target is 5% for New and Classic variants.",
      "Minimum trading-day requirement is three profitable trading days.",
      "Daily drawdown uses the higher previous-day closing equity or balance.",
    ],
    phaseAliases: ["phase 2", "fase 2", "verification", "high stakes"],
    phaseId: "phase_2",
    profitTargetPct: 5,
    programAliases: ["high stakes", "new high stakes", "classic high stakes"],
    programId: "high-stakes",
    programName: "High Stakes",
    sourceLabel: "The5ers Help Center, High Stakes",
    sourceUrl: "https://help.the5ers.com/what-are-the-general-rules-for-the-high-stakes-program/",
    touchedLimitBreaches: true,
    verifiedAt: VERIFIED_AT,
  },
  {
    accountModes: ["evaluation", "challenge"],
    bestDayRulePct: null,
    consistencyThresholdPct: null,
    dailyBaseline: "initial_balance",
    dailyLossLimitPct: 5,
    dailyResetTime: "22:00",
    dailyResetTimezone: "UTC",
    firmAliases: ["orion funded", "orion"],
    firmId: "orion-funded",
    firmName: "Orion Funded",
    floatingLossCounts: true,
    id: "orion-standard-swing-phase-1",
    maxDrawdownKind: "static_initial_balance",
    maxLossLimitPct: 6,
    maxRiskPerTradePct: null,
    minimumTrades: null,
    minimumTradingDays: null,
    notes: [
      "Standard Swing has 5% daily loss and static maximum drawdown.",
      "The static drawdown floor example in Orion docs is 6% below starting balance.",
      "Floating losses count toward daily loss in real time.",
    ],
    phaseAliases: ["phase 1", "fase 1", "standard swing", "swing"],
    phaseId: "phase_1",
    profitTargetPct: 8,
    programAliases: ["standard swing", "swing"],
    programId: "standard-swing",
    programName: "Standard Swing",
    sourceLabel: "Orion Funded Help Center",
    sourceUrl: "https://www.orionfunded.com/faq/programs/daily-loss",
    touchedLimitBreaches: true,
    verifiedAt: VERIFIED_AT,
  },
  {
    accountModes: ["evaluation", "challenge"],
    bestDayRulePct: null,
    consistencyThresholdPct: null,
    dailyBaseline: "initial_balance",
    dailyLossLimitPct: 5,
    dailyResetTime: "22:00",
    dailyResetTimezone: "UTC",
    firmAliases: ["orion funded", "orion"],
    firmId: "orion-funded",
    firmName: "Orion Funded",
    floatingLossCounts: true,
    id: "orion-standard-swing-phase-2",
    maxDrawdownKind: "static_initial_balance",
    maxLossLimitPct: 6,
    maxRiskPerTradePct: null,
    minimumTrades: null,
    minimumTradingDays: null,
    notes: [
      "Standard Swing Phase 2 target is 5%.",
      "The static drawdown floor example in Orion docs is 6% below starting balance.",
      "Floating losses count toward daily loss in real time.",
    ],
    phaseAliases: ["phase 2", "fase 2", "standard swing", "swing"],
    phaseId: "phase_2",
    profitTargetPct: 5,
    programAliases: ["standard swing", "swing"],
    programId: "standard-swing",
    programName: "Standard Swing",
    sourceLabel: "Orion Funded Help Center",
    sourceUrl: "https://www.orionfunded.com/faq/programs/profit-targets",
    touchedLimitBreaches: true,
    verifiedAt: VERIFIED_AT,
  },
];

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function textIncludesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => {
    const normalizedNeedle = normalizeText(needle);
    return normalizedNeedle.length > 0 && haystack.includes(normalizedNeedle);
  });
}

function inferPhaseId(account: TradingAccount): FundingRulePhase {
  const funding = account.funding;
  const phase = normalizeText(funding?.phaseLabel);

  if (funding?.accountMode === "funded" || textIncludesAny(phase, ["funded", "master", "real"])) {
    return "funded";
  }

  if (textIncludesAny(phase, ["phase 2", "fase 2", "step 2", "verification", "practitioner"])) {
    return "phase_2";
  }

  return "phase_1";
}

function accountSearchText(account: TradingAccount) {
  return normalizeText([
    account.label,
    account.broker,
    account.server,
    account.funding?.firm,
    account.funding?.phaseLabel,
    account.funding?.playbookLabel,
    account.funding?.accountMode,
  ].filter(Boolean).join(" "));
}

function objectiveMatches(rule: FundingRuleSetDefinition, account: TradingAccount) {
  const objective = account.funding?.objectivePct;
  if (objective === null || objective === undefined) return true;
  if (rule.profitTargetPct === null) return true;
  return Math.abs(rule.profitTargetPct - objective) < 0.001;
}

function usagePctFromRoom(limitPct: number | null, roomLeftPct: number | null | undefined) {
  if (limitPct === null || limitPct <= 0) return null;
  const room = Number(roomLeftPct);
  if (!Number.isFinite(room)) return null;
  return Math.max(0, Math.min(999, ((limitPct - room) / limitPct) * 100));
}

function pushRuleAlert(alerts: FundingRuleAlert[], alert: FundingRuleAlert) {
  if (alerts.some((item) => item.id === alert.id)) return;
  alerts.push(alert);
}

function phaseMatches(rule: FundingRuleSetDefinition, account: TradingAccount, searchText: string) {
  if (rule.phaseId !== inferPhaseId(account)) return false;
  if (textIncludesAny(searchText, rule.phaseAliases)) return true;
  return rule.phaseId === "phase_1" && account.funding?.accountMode === "challenge";
}

export function resolveFundingRuleForAccount(
  account: TradingAccount,
  catalog: FundingRuleSetDefinition[] = fundingRuleCatalog,
): FundingRuleResolution {
  const funding = account.funding;
  if (!funding) {
    return {
      accountId: account.id,
      message: "Cuenta sin perfil de fondeo.",
      status: "not_funded",
    };
  }

  const searchText = accountSearchText(account);
  const firmCandidates = catalog.filter((rule) =>
    textIncludesAny(searchText, [rule.firmName, ...rule.firmAliases]),
  );

  if (!firmCandidates.length) {
    return {
      accountId: account.id,
      candidateRules: [],
      firmName: funding.firm,
      reason: "Firma de fondeo sin catálogo verificado.",
      status: "requires_review",
      warnings: ["Añadir fuente oficial antes de usar límites como política."],
    };
  }

  const phaseCandidates = firmCandidates.filter((rule) =>
    rule.accountModes.includes(funding.accountMode) && phaseMatches(rule, account, searchText),
  );
  const programCandidates = phaseCandidates.filter((rule) =>
    textIncludesAny(searchText, [rule.programName, ...rule.programAliases]),
  );
  const objectiveCandidates = programCandidates.filter((rule) => objectiveMatches(rule, account));

  if (objectiveCandidates.length === 1) {
    return {
      accountId: account.id,
      matchConfidence: "exact",
      ruleSet: objectiveCandidates[0],
      status: "verified",
      warnings: [],
    };
  }

  if (phaseCandidates.length === 1 && objectiveMatches(phaseCandidates[0], account)) {
    return {
      accountId: account.id,
      matchConfidence: "firm_phase",
      ruleSet: phaseCandidates[0],
      status: "verified",
      warnings: ["Programa inferido por firma y fase; confirmar etiqueta exacta del examen."],
    };
  }

  return {
    accountId: account.id,
    candidateRules: objectiveCandidates.length ? objectiveCandidates : phaseCandidates,
    firmName: funding.firm,
    reason:
      "No se puede resolver una única regla verificada con la firma, programa, fase y objetivo disponibles.",
    status: "requires_review",
    warnings: [
      "La cuenta debe indicar modelo exacto del examen antes de usar límites como política.",
    ],
  };
}

export function evaluateFundingRuleForAccount(
  account: TradingAccount,
  catalog: FundingRuleSetDefinition[] = fundingRuleCatalog,
): FundingRuleEvaluation {
  const resolution = resolveFundingRuleForAccount(account, catalog);

  if (resolution.status === "not_funded") {
    return {
      alerts: [],
      allowNewTradesRecommendation: true,
      dailyUsagePct: null,
      maxUsagePct: null,
      resolution,
      status: "not_funded",
    };
  }

  if (resolution.status === "requires_review") {
    return {
      alerts: [
        {
          id: "funding-rule-review",
          label: "Regla de fondeo pendiente",
          reason: resolution.reason,
          tone: "warning",
        },
      ],
      allowNewTradesRecommendation: account.funding?.allowNewTrades ?? true,
      dailyUsagePct: null,
      maxUsagePct: null,
      resolution,
      status: "requires_review",
    };
  }

  const funding = account.funding;
  const rule = resolution.ruleSet;
  const alerts: FundingRuleAlert[] = [];
  const dailyUsagePct = usagePctFromRoom(rule.dailyLossLimitPct, funding?.dailyRoomLeftPct);
  const maxUsagePct = usagePctFromRoom(rule.maxLossLimitPct, funding?.maxRoomLeftPct);
  const sourceMeta = {
    ruleId: rule.id,
    sourceLabel: rule.sourceLabel,
  };

  if (funding?.status === "blocked" || funding?.allowNewTrades === false) {
    pushRuleAlert(alerts, {
      ...sourceMeta,
      id: "funding-account-blocked",
      label: "Bloqueo de fondeo",
      reason: "La cuenta conectada marca nuevas operaciones como no permitidas.",
      tone: "danger",
    });
  }

  if (dailyUsagePct !== null) {
    if (dailyUsagePct >= 100 || (funding?.dailyRoomLeftPct ?? 1) <= 0) {
      pushRuleAlert(alerts, {
        ...sourceMeta,
        id: "funding-daily-block",
        label: "Bloqueo diario de fondeo",
        reason: "El room diario de la firma esta agotado o por debajo de cero.",
        tone: "danger",
      });
    } else if (dailyUsagePct >= 90) {
      pushRuleAlert(alerts, {
        ...sourceMeta,
        id: "funding-daily-critical",
        label: "Fondeo en zona critica diaria",
        reason: "El consumo del limite diario verificado supera el 90%.",
        tone: "danger",
      });
    } else if (dailyUsagePct >= 70) {
      pushRuleAlert(alerts, {
        ...sourceMeta,
        id: "funding-daily-warning",
        label: "Fondeo en vigilancia diaria",
        reason: "El consumo del limite diario verificado supera el 70%.",
        tone: "warning",
      });
    }
  }

  if (maxUsagePct !== null) {
    if (maxUsagePct >= 100 || (funding?.maxRoomLeftPct ?? 1) <= 0) {
      pushRuleAlert(alerts, {
        ...sourceMeta,
        id: "funding-max-block",
        label: "Bloqueo maximo de fondeo",
        reason: "El room maximo de la firma esta agotado o por debajo de cero.",
        tone: "danger",
      });
    } else if (maxUsagePct >= 90) {
      pushRuleAlert(alerts, {
        ...sourceMeta,
        id: "funding-max-critical",
        label: "Fondeo en zona critica maxima",
        reason: "El consumo del limite maximo verificado supera el 90%.",
        tone: "danger",
      });
    } else if (maxUsagePct >= 70) {
      pushRuleAlert(alerts, {
        ...sourceMeta,
        id: "funding-max-warning",
        label: "Fondeo en vigilancia maxima",
        reason: "El consumo del limite maximo verificado supera el 70%.",
        tone: "warning",
      });
    }
  }

  if (
    rule.maxRiskPerTradePct !== null &&
    funding &&
    funding.recommendedRiskPct > rule.maxRiskPerTradePct
  ) {
    pushRuleAlert(alerts, {
      ...sourceMeta,
      id: "funding-risk-per-trade-warning",
      label: "Riesgo por idea excedido",
      reason: `La cuenta recomienda ${funding.recommendedRiskPct.toFixed(2)}% y la regla limita ${rule.maxRiskPerTradePct.toFixed(2)}%.`,
      tone: "warning",
    });
  }

  if (rule.touchedLimitBreaches && rule.floatingLossCounts) {
    pushRuleAlert(alerts, {
      ...sourceMeta,
      id: "funding-equity-touch",
      label: "Equity intradia cuenta",
      reason: "La firma cuenta perdidas flotantes y un toque intradia del limite como incumplimiento.",
      tone: "info",
    });
  }

  const hasDanger = alerts.some((alert) => alert.tone === "danger");
  const hasWarning = alerts.some((alert) => alert.tone === "warning");

  return {
    alerts,
    allowNewTradesRecommendation: !hasDanger && (funding?.allowNewTrades ?? true),
    dailyUsagePct,
    maxUsagePct,
    resolution,
    status: hasDanger ? "blocked" : (hasWarning ? "warning" : "clear"),
  };
}
