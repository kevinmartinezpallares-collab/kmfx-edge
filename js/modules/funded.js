import { closeModal, openModal } from "./modal-system.js?v=build-20260406-213500";
import { describeAccountAuthority, formatCurrency, formatDateTime, formatPercent, selectCurrentAccount } from "./utils.js?v=build-20260406-213500";
import { badgeMarkup } from "./status-badges.js?v=build-20260406-213500";
import { pageHeaderMarkup, pnlTextMarkup } from "./ui-primitives.js?v=build-20260406-213500";
import { isAdminUserId } from "./auth-session.js?v=build-20260406-213500";
import {
  FUNDING_RULE_PHASES,
  availableFundingFirms,
  availableFundingPrograms,
  fundingRuleNote,
  inferFundingProgramModel,
  normalizeFundingPhase,
  resolveFundingRulePreset,
} from "./funding-rules.js?v=build-20260406-213500";
import {
  buildFundingJourneys,
  fundingJourneyCurrentPhaseLine,
  fundingJourneyStatusLabel,
  fundingPhaseStatusLabel,
} from "./funding-journeys.js?v=build-20260406-213500";
import {
  FUNDING_TRANSACTION_TYPES,
  deriveFundingEconomics,
  fundingTransactionTypeLabel,
  fundingTransactionsForJourney,
  normalizeFundingTransaction,
} from "./funding-ledger.js?v=build-20260406-213500";

const ORION_FUNDING_LINK = {
  login: "80571774",
  serverNeedle: "ogminternational",
};

const RULE_CONFIRMATION_STATUS = {
  UNCONFIRMED: "unconfirmed",
  USER_CONFIRMED: "user_confirmed",
  OFFICIAL_VERIFIED: "official_verified",
};

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function isAdminState(state = {}) {
  const user = state.auth?.user || {};
  return Boolean(user.is_admin || user.role === "admin" || isAdminUserId(user.id));
}

function accountLogin(account = {}) {
  return String(account.login || account.model?.account?.login || account.dashboardPayload?.login || account.meta?.login || "");
}

function accountServer(account = {}) {
  return String(account.meta?.server || account.model?.account?.server || account.dashboardPayload?.server || account.server || "");
}

function accountBroker(account = {}) {
  return String(account.broker || account.model?.account?.broker || account.dashboardPayload?.broker || "");
}

function isOrionLiveAccount(account = {}) {
  if (!account || account.sourceType !== "mt5") return false;
  const loginMatches = accountLogin(account) === ORION_FUNDING_LINK.login;
  const serverMatches = normalizeText(accountServer(account)).includes(ORION_FUNDING_LINK.serverNeedle)
    || normalizeText(accountBroker(account)).includes(ORION_FUNDING_LINK.serverNeedle);
  return loginMatches && serverMatches;
}

function isOrionFundingCandidate(fundedAccount = {}) {
  const identity = normalizeText([
    fundedAccount.accountId,
    fundedAccount.firm,
    fundedAccount.propFirm,
    fundedAccount.label,
  ].filter(Boolean).join(" "));
  return identity.includes("orion") || fundedAccount.accountId === "funded";
}

function findOrionLiveAccount(state = {}) {
  return Object.values(state.accounts || {}).find(isOrionLiveAccount) || null;
}

function resolveFundedAccountLink(fundedAccount = {}, state = {}) {
  const explicit = state.accounts?.[fundedAccount.accountId] || null;
  const canUseAdminFallback = isAdminState(state) && isOrionFundingCandidate(fundedAccount);
  const orion = canUseAdminFallback ? findOrionLiveAccount(state) : null;

  if (orion && explicit?.sourceType !== "mt5") {
    return {
      linked: orion,
      accountId: orion.id || fundedAccount.accountId,
      source: "admin_orion_live_fallback",
    };
  }

  return {
    linked: explicit,
    accountId: explicit?.id || fundedAccount.accountId,
    source: explicit ? "explicit_account_id" : "unlinked",
  };
}

function linkedAccountContextLabel(account = {}) {
  if (!account.linked) return "Sin cuenta live vinculada";
  const broker = accountBroker(account.linked) || "MT5";
  const login = accountLogin(account.linked);
  const server = accountServer(account.linked);
  return [broker, login, server].filter(Boolean).join(" · ");
}

function selectedLinkedAccountMeta(account = {}) {
  if (!account.linked) return "Sin cuenta live vinculada";
  const broker = accountBroker(account.linked) || account.propFirm || "MT5";
  const login = accountLogin(account.linked);
  const server = accountServer(account.linked);
  return [broker, login, server].filter(Boolean).join(" · ");
}

function formatCompactAccountSize(value) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size >= 1000 && size % 1000 === 0) return `${Math.round(size / 1000)}k`;
  return formatCurrency(size);
}

function fundedChallengeDisplayName(account = {}) {
  const label = String(account.label || account.name || "Challenge");
  const compactSize = formatCompactAccountSize(account.accountSize);
  let displayLabel = label;
  if (!compactSize) return label;
  const normalizedSize = compactSize.replace(/\s+/g, "");
  if (!new RegExp(`\\b${normalizedSize}\\b`, "i").test(label.replace(/\s+/g, "")) && /\b\d+\s*k\b/i.test(label)) {
    displayLabel = label.replace(/\b\d+\s*k\b/i, compactSize);
  }
  const firmPrefix = String(account.propFirm || account.firm || "")
    .replace(/\s*Funded\s*$/i, "")
    .trim();
  if (firmPrefix && /^challenge\b/i.test(displayLabel)) {
    return `${firmPrefix} ${displayLabel}`;
  }
  return displayLabel;
}

function hasAccountSizeMismatch({ linked = null, accountSize = 0, balance = 0, equity = 0 } = {}) {
  if (!linked || !accountSize) return false;
  const liveCapital = Number(equity || balance || 0);
  if (!Number.isFinite(liveCapital) || liveCapital <= 0) return false;
  const ratio = accountSize / liveCapital;
  return ratio >= 3 || ratio <= 0.33;
}

function updateFundedAccount(store, fundedId, updater) {
  store.setState((state) => ({
    ...state,
    workspace: {
      ...state.workspace,
      fundedAccounts: state.workspace.fundedAccounts.map((item) => (
        item.id === fundedId ? updater(item) : item
      ))
    }
  }));
}

function addFundingTransaction(store, transaction) {
  store.setState((state) => ({
    ...state,
    workspace: {
      ...state.workspace,
      fundingTransactions: [
        ...(Array.isArray(state.workspace?.fundingTransactions) ? state.workspace.fundingTransactions : []),
        transaction,
      ],
    },
  }));
}

function applyFundedFieldChange(store, fundedId, fieldName, value) {
  if (!fundedId || !fieldName) return;

  if (fieldName === "propFirm") {
    updateFundedAccount(store, fundedId, (account) => {
      const nextModels = availableModels(value);
      const nextProgram = nextModels.includes(account.programModel) ? account.programModel : nextModels[0] || "Editable";
      return {
        ...account,
        propFirm: value,
        firm: value,
        programModel: nextProgram,
        rulesConfirmationStatus: RULE_CONFIRMATION_STATUS.UNCONFIRMED,
      };
    });
    return;
  }

  if (fieldName === "programModel") {
    updateFundedAccount(store, fundedId, (account) => ({
      ...account,
      programModel: value,
      rulesConfirmationStatus: RULE_CONFIRMATION_STATUS.UNCONFIRMED,
    }));
    return;
  }

  if (fieldName === "phase") {
    updateFundedAccount(store, fundedId, (account) => ({
      ...account,
      phase: value,
      rulesConfirmationStatus: RULE_CONFIRMATION_STATUS.UNCONFIRMED,
    }));
    return;
  }

  if (fieldName === "accountSize") {
    const size = Number(value || 0);
    updateFundedAccount(store, fundedId, (account) => ({ ...account, accountSize: size, size }));
    return;
  }

  if (fieldName === "rulesConfirmationStatus") {
    const allowed = new Set([
      RULE_CONFIRMATION_STATUS.UNCONFIRMED,
      RULE_CONFIRMATION_STATUS.USER_CONFIRMED,
      RULE_CONFIRMATION_STATUS.OFFICIAL_VERIFIED,
    ]);
    updateFundedAccount(store, fundedId, (account) => ({
      ...account,
      rulesConfirmationStatus: allowed.has(value) ? value : RULE_CONFIRMATION_STATUS.UNCONFIRMED,
      rulesConfirmedByUser: value === RULE_CONFIRMATION_STATUS.USER_CONFIRMED,
    }));
  }
}

function normalizePhase(phase = "") {
  return normalizeFundingPhase(phase);
}

function inferProgramModel(account = {}) {
  return inferFundingProgramModel(account);
}

function isEditableProgramModel(programModel = "") {
  const normalized = normalizeText(programModel);
  return !normalized
    || normalized === "editable"
    || normalized === "manual"
    || normalized.includes("manual / sin preset")
    || normalized.includes("sin preset")
    || normalized.includes("legacy / editable");
}

function shouldUseOrionStandardSwingFallback(account = {}, linked = null, accountSize = 0) {
  const firm = normalizeText(account.propFirm || account.firm);
  if (!firm.includes("orion")) return false;
  if (!isEditableProgramModel(account.programModel)) return false;
  const identity = normalizeText([
    account.id,
    account.accountId,
    account.label,
    account.name,
    account.programModel,
  ].filter(Boolean).join(" "));
  return identity.includes("orion challenge 5k")
    || identity.includes("orion standard")
    || identity.includes("standard")
    || identity.includes("swing")
    || (Number(accountSize) === 5000 && isOrionLiveAccount(linked));
}

function resolveProgramModel(account = {}, linked = null, accountSize = 0) {
  if (shouldUseOrionStandardSwingFallback(account, linked, accountSize)) return "Orion Standard/Swing";
  return account.programModel || inferProgramModel(account);
}

function availableModels(firm = "", currentModel = "") {
  const models = availableFundingPrograms(firm);
  if (currentModel && !models.includes(currentModel)) return [currentModel, ...models];
  return models.length ? models : ["Editable"];
}

function availableFirms(currentFirm = "") {
  const firms = availableFundingFirms();
  if (currentFirm && !firms.includes(currentFirm)) return [currentFirm, ...firms];
  return firms;
}

function resolveRulePreset(propFirm, programModel, phase, accountSize) {
  return resolveFundingRulePreset({ propFirm, programModel, phase, accountSize });
}

function canApplyPresetValues(preset = null) {
  if (!preset || preset.editable || preset.legacy) return false;
  if (preset.verified && !preset.requiresReview) return true;
  return preset.sourceType === "user_manual" && Boolean(
    preset.profitTargetPct
      || preset.dailyLossLimitPct
      || preset.maxLossLimitPct
      || preset.minTradingDays
  );
}

function avgR(trades = []) {
  if (!trades.length) return 0;
  return trades.reduce((sum, trade) => sum + Number(trade.rMultiple || 0), 0) / trades.length;
}

function tradingDaysCompleted(model) {
  return Array.isArray(model?.dailyReturns) ? model.dailyReturns.length : 0;
}

function deriveFundedAccount(raw, linked, linkContext = {}) {
  const propFirm = raw.propFirm || raw.firm || "FTMO";
  const phase = normalizePhase(raw.phase);
  const accountSize = Number(raw.accountSize || raw.size || linked?.model?.account?.balance || 0);
  const programModel = resolveProgramModel(raw, linked, accountSize);
  const preset = resolveRulePreset(propFirm, programModel, phase, accountSize);
  const canUsePresetValues = canApplyPresetValues(preset);
  const rulesVerified = Boolean(preset?.verified && !preset?.requiresReview && !preset?.editable && !preset?.legacy);
  const resolvedRulesConfirmationStatus = rulesVerified
    ? RULE_CONFIRMATION_STATUS.OFFICIAL_VERIFIED
    : (raw.rulesConfirmedByUser || raw.rulesConfirmationStatus === RULE_CONFIRMATION_STATUS.USER_CONFIRMED)
      ? RULE_CONFIRMATION_STATUS.USER_CONFIRMED
      : RULE_CONFIRMATION_STATUS.UNCONFIRMED;
  const balance = Number(linked?.model?.account?.balance || raw.balance || accountSize || 0);
  const equity = Number(linked?.model?.account?.equity || balance);
  const totalPnl = Number(linked?.model?.totals?.pnl || (balance - accountSize));
  const openPnl = Number(linked?.model?.account?.openPnl || 0);
  const currentProfitUsd = balance - accountSize;
  const currentProfitPct = accountSize ? (currentProfitUsd / accountSize) * 100 : 0;
  const accountSizeMismatch = hasAccountSizeMismatch({ linked, accountSize, balance, equity });
  const targetPct = Number(
    raw.targetPct ?? raw.profitTargetPct ?? (canUsePresetValues ? preset?.profitTargetPct : undefined) ?? 0
  ) || 0;
  const targetUsd = targetPct > 0 ? (accountSize * targetPct) / 100 : 0;
  const progressRatio = targetUsd > 0 ? clamp(currentProfitUsd / targetUsd, 0, 1) : (phase === "Funded" ? 1 : 0);
  const targetCompletionPct = progressRatio * 100;
  const remainingUsd = targetUsd > 0 ? Math.max(targetUsd - Math.max(currentProfitUsd, 0), 0) : 0;
  const dailyDdPct = Number(raw.dailyDdPct ?? linked?.model?.riskSummary?.dailyDrawdownPct ?? 0) || 0;
  const maxDdPct = Number(raw.maxDdPct ?? linked?.model?.totals?.drawdown?.maxPct ?? 0) || 0;
  const dailyLimitPct = Number(
    raw.dailyLossLimitPct
      ?? (canUsePresetValues ? preset?.dailyLossLimitPct : undefined)
      ?? linked?.model?.riskProfile?.dailyLossLimitPct
      ?? 0
  ) || 0;
  const maxLimitPct = Number(
    raw.maxLossLimitPct
      ?? (canUsePresetValues ? preset?.maxLossLimitPct : undefined)
      ?? linked?.model?.account?.maxDrawdownLimit
      ?? 0
  ) || 0;
  const dailyUsagePct = dailyLimitPct ? (dailyDdPct / dailyLimitPct) * 100 : 0;
  const maxUsagePct = maxLimitPct ? (maxDdPct / maxLimitPct) * 100 : 0;
  const daysCompleted = tradingDaysCompleted(linked?.model);
  const requiredTradingDays = Number(
    raw.requiredTradingDays
      ?? (canUsePresetValues ? preset?.minTradingDays ?? preset?.requiredTradingDays : undefined)
      ?? 0
  ) || 0;
  const noMinimumDays = Boolean(raw.noMinimumDays ?? (canUsePresetValues ? preset?.noMinimumDays : undefined) ?? false);
  const winRate = Number(linked?.model?.totals?.winRate || 0);
  const avgRValue = avgR(linked?.model?.trades || []);
  const profitFactor = Number(linked?.model?.totals?.profitFactor || 0);
  const totalTrades = Number(linked?.model?.totals?.totalTrades || 0);
  const tradesPerDay = daysCompleted ? totalTrades / daysCompleted : 0;
  const completedDaysVsRule = noMinimumDays || !requiredTradingDays
    ? "Sin mínimo de días operados"
    : `${daysCompleted} / ${requiredTradingDays} días`;

  let globalStatus = "SAFE";
  if (dailyUsagePct >= 100 || maxUsagePct >= 100) {
    globalStatus = "DANGER";
  } else if (dailyUsagePct >= 85 || maxUsagePct >= 85 || (phase !== "Funded" && targetPct > 0 && currentProfitPct < 0)) {
    globalStatus = "WARNING";
  }

  const challengeState = (
    dailyUsagePct >= 100 || maxUsagePct >= 100
      ? "limit-exceeded"
      : phase !== "Funded" && targetPct > 0 && currentProfitPct >= targetPct && (noMinimumDays || daysCompleted >= requiredTradingDays)
        ? "passed"
        : currentProfitPct >= 0
          ? "on-track"
          : "watch"
  );

  const alerts = [];
  if (accountSizeMismatch) {
    alerts.push({
      tone: "warn",
      title: "Revisa el tamaño de cuenta configurado",
      detail: "El tamaño configurado no coincide con el balance live recibido.",
    });
  }
  if (dailyUsagePct >= 100) alerts.push({ tone: "error", title: "Límite diario superado", detail: `Uso ${Math.round(dailyUsagePct)}% del límite diario.` });
  else if (dailyUsagePct >= 80) alerts.push({ tone: "warn", title: "Drawdown diario cerca del límite", detail: `Uso ${Math.round(dailyUsagePct)}% del límite diario.` });
  if (maxUsagePct >= 100) alerts.push({ tone: "error", title: "Límite total superado", detail: `Uso ${Math.round(maxUsagePct)}% del límite total.` });
  else if (maxUsagePct >= 80) alerts.push({ tone: "warn", title: "Drawdown total bajo presión", detail: `Uso ${Math.round(maxUsagePct)}% del límite total.` });
  if (!accountSizeMismatch && phase !== "Funded" && targetPct > 0) {
    if (currentProfitPct >= targetPct) alerts.push({ tone: "ok", title: "Objetivo alcanzado", detail: `Objetivo ${formatPercent(targetPct)} conseguido.` });
    else alerts.push({ tone: "info", title: "Progreso de fase", detail: `${formatPercent(currentProfitPct)} / ${formatPercent(targetPct)} objetivo.` });
  }
  if (noMinimumDays) {
    alerts.push({ tone: "neutral", title: "Días operados", detail: "Esta fase no exige mínimo de días." });
  } else if (requiredTradingDays) {
    alerts.push({ tone: daysCompleted >= requiredTradingDays ? "ok" : "info", title: "Días operados", detail: completedDaysVsRule });
  }

  return {
    ...raw,
    linked,
    configuredAccountId: raw.accountId || "",
    linkedAccountId: linked?.id || "",
    accountId: linkContext.accountId || linked?.id || raw.accountId || "",
    linkSource: linkContext.source || (linked ? "explicit_account_id" : "unlinked"),
    propFirm,
    programModel,
    phase,
    accountSize,
    preset,
    ruleStatus: preset?.ruleStatus || null,
    rulesVerified,
    rulesConfirmationStatus: resolvedRulesConfirmationStatus,
    rulesConfirmedByUser: resolvedRulesConfirmationStatus === RULE_CONFIRMATION_STATUS.USER_CONFIRMED,
    balance,
    equity,
    totalPnl,
    openPnl,
    currentProfitUsd,
    currentProfitPct,
    accountSizeMismatch,
    targetPct,
    targetUsd,
    progressRatio,
    targetCompletionPct,
    remainingUsd,
    dailyDdPct,
    maxDdPct,
    dailyLimitPct,
    maxLimitPct,
    dailyUsagePct,
    maxUsagePct,
    daysCompleted,
    requiredTradingDays,
    noMinimumDays,
    completedDaysVsRule,
    winRate,
    avgRValue,
    profitFactor,
    totalTrades,
    tradesPerDay,
    globalStatus,
    challengeState,
    alerts
  };
}

function attachFundingJourneyContext(fundedAccounts = [], state = {}) {
  const journeyContext = buildFundingJourneys({
    fundedAccounts,
    journeys: state.workspace?.fundingJourneys,
    phases: state.workspace?.fundingPhases,
  });

  return fundedAccounts.map((account) => ({
    ...account,
    fundingJourney: journeyContext.journeyByFundedId.get(account.id) || null,
    fundingPhase: journeyContext.phaseByFundedId.get(account.id) || null,
  }));
}

function enrichFundedAccounts(state = {}) {
  const fundedAccounts = (state.workspace?.fundedAccounts || []).map((account) => {
    const linkContext = resolveFundedAccountLink(account, state);
    return deriveFundedAccount(account, linkContext.linked, linkContext);
  });
  return attachFundingJourneyContext(fundedAccounts, state);
}

function enrichFundedAccount(state = {}, fundedId = "") {
  return enrichFundedAccounts(state).find((account) => account.id === fundedId) || null;
}

function fundedStatusMeta(status) {
  if (status === "DANGER") return { label: "Presión alta", tone: "error" };
  if (status === "WARNING") return { label: "En vigilancia", tone: "warn" };
  return { label: "Estable", tone: "ok" };
}

function ruleNote(account) {
  return fundingRuleNote(account.preset);
}

function currencySymbol(code = "USD") {
  return code === "EUR" ? "€" : "$";
}

function hasExplicitPhaseFailure(account = {}) {
  const phase = account.fundingPhase || {};
  const statusValues = [
    account.phaseStatus,
    account.status,
    account.manualStatus,
    account.providerStatus,
    phase.status,
  ].map((value) => normalizeText(value));
  return Boolean(
    account.failedAt
      || phase.failedAt
      || account.manualFailed === true
      || account.phaseFailed === true
      || account.providerFailed === true
      || statusValues.some((status) => (
        status === "failed"
          || status === "phase_failed"
          || status === "phase_1_failed"
          || status === "phase_2_failed"
          || status === "fallida"
      ))
  );
}

function hasOfficialVerifiedRules(account = {}) {
  const preset = account.preset || {};
  return Boolean(preset.verified && !preset.requiresReview && !preset.editable && !preset.legacy && preset.sourceType === "official");
}

function ruleConfirmationStatus(account = {}) {
  if (hasOfficialVerifiedRules(account)) return RULE_CONFIRMATION_STATUS.OFFICIAL_VERIFIED;
  const rawStatus = normalizeText(account.rulesConfirmationStatus);
  if (
    account.rulesConfirmedByUser === true
      || rawStatus === RULE_CONFIRMATION_STATUS.USER_CONFIRMED
      || rawStatus === "confirmed"
      || rawStatus === "user-confirmed"
      || rawStatus === "confirmadas"
  ) {
    return RULE_CONFIRMATION_STATUS.USER_CONFIRMED;
  }
  return RULE_CONFIRMATION_STATUS.UNCONFIRMED;
}

function hasUserConfirmedRules(account = {}) {
  return ruleConfirmationStatus(account) === RULE_CONFIRMATION_STATUS.USER_CONFIRMED;
}

function requiresRuleVerification(account = {}) {
  if (ruleConfirmationStatus(account) !== RULE_CONFIRMATION_STATUS.UNCONFIRMED) return false;
  const statusLabel = normalizeText(account.ruleStatus?.label);
  return Boolean(
    account.preset?.requiresReview
      || account.preset?.verified === false
      || account.rulesVerified === false
      || statusLabel.includes("verificacion")
      || statusLabel.includes("verificación")
      || statusLabel.includes("editable")
      || statusLabel.includes("legacy")
      || statusLabel.includes("sin preset")
  );
}

function fundedAttentionScore(account) {
  if (account.accountSizeMismatch) return 3;
  if (account.globalStatus === "DANGER" || account.challengeState === "limit-exceeded" || hasExplicitPhaseFailure(account)) return 4;
  if (account.globalStatus === "WARNING") return 3;
  if (account.challengeState === "watch") return 2;
  if (account.alerts?.some((alert) => alert.tone === "warn" || alert.tone === "error")) return 1;
  return 0;
}

function isLiveFundedAccount(account = {}) {
  return Boolean(account.linked && (account.linked.sourceType === "mt5" || account.linked.source === "mt5"));
}

function fundedReviewScore(account = {}) {
  const attentionScore = fundedAttentionScore(account);
  if (!attentionScore) return 0;
  const status = fundedChallengeStatus(account);
  const liveBonus = isLiveFundedAccount(account) ? 100 : 0;
  const toneBonus = status.dataTone === "risk" ? 40 : status.dataTone === "warning" ? 25 : 0;
  return liveBonus + toneBonus + attentionScore * 10;
}

function fundedDefaultSelectionScore(account = {}) {
  const isLive = isLiveFundedAccount(account);
  const reviewScore = fundedReviewScore(account);
  if (isLive && reviewScore) return 500 + reviewScore;
  if (isLive && account.targetUsd) return 400;
  if (isLive) return 300;
  if (reviewScore) return 200 + reviewScore;
  if (account.targetUsd) return 100;
  return 0;
}

function fundedSelectorScore(account = {}) {
  if (!account.linked) return 0;
  const reviewScore = fundedReviewScore(account);
  if (reviewScore) return 500 + reviewScore;
  const status = fundedChallengeStatus(account);
  const liveBonus = isLiveFundedAccount(account) ? 10 : 0;
  if (status.label === "En vigilancia") return 400 + liveBonus;
  if (status.label === "En objetivo") return 300 + liveBonus;
  if (!account.targetUsd) return 200 + liveBonus;
  return 100 + liveBonus;
}

function compareFundedRelevance(a, b) {
  const scoreDiff = fundedSelectorScore(b) - fundedSelectorScore(a);
  if (scoreDiff) return scoreDiff;
  return String(a.label || "").localeCompare(String(b.label || ""));
}

function fundedChallengeStatus(account) {
  if (hasExplicitPhaseFailure(account)) {
    return {
      label: "Fase fallida",
      tone: "error",
      dataTone: "risk",
      detail: "La fase figura como fallida por estado explícito o registro manual.",
    };
  }
  if (account.accountSizeMismatch) {
    return {
      label: "Revisa configuración",
      tone: "warn",
      dataTone: "warning",
      detail: "El tamaño de cuenta configurado no coincide con el capital live recibido.",
    };
  }
  if (account.dailyUsagePct >= 100) {
    return {
      label: "Límite diario excedido",
      tone: "error",
      dataTone: "risk",
      detail: requiresRuleVerification(account)
        ? "El cálculo supera el límite diario configurado; confirma reglas antes de marcar la fase como fallida."
        : "El cálculo supera el límite diario configurado; requiere revisión antes de continuar.",
    };
  }
  if (account.maxUsagePct >= 100) {
    return {
      label: "Límite máximo excedido",
      tone: "error",
      dataTone: "risk",
      detail: requiresRuleVerification(account)
        ? "El cálculo supera el límite máximo configurado; confirma reglas antes de marcar la fase como fallida."
        : "El cálculo supera el límite máximo configurado; requiere revisión antes de continuar.",
    };
  }
  if (!account.targetUsd) {
    return {
      label: "Sin objetivo definido",
      tone: "neutral",
      dataTone: "neutral",
      detail: "Esta fase no tiene objetivo de beneficio configurado; la lectura se centra en preservación.",
    };
  }
  if (account.dailyUsagePct >= 80 || account.maxUsagePct >= 80) {
    return {
      label: "En riesgo",
      tone: "warn",
      dataTone: "warning",
      detail: "El margen de drawdown está reducido; revisa la fase sin sobrerreaccionar al resultado.",
    };
  }
  if (account.globalStatus === "WARNING" || account.currentProfitUsd < 0 || account.challengeState === "watch") {
    return {
      label: "En vigilancia",
      tone: "neutral",
      dataTone: "neutral",
      detail: "El challenge requiere revisión por presión de resultado o margen.",
    };
  }
  return {
    label: "En objetivo",
    tone: "ok",
    dataTone: "profit",
    detail: "Resultado y márgenes se mantienen dentro de la lectura esperada.",
  };
}

function fundedResultMarkup(account, className = "") {
  if (account.accountSizeMismatch) {
    return `<span class="funded-mismatch-value ${escapeHtml(className)}">Revisar tamaño</span>`;
  }
  return pnlTextMarkup({
    value: account.currentProfitUsd,
    text: formatCurrency(account.currentProfitUsd),
    className: account.currentProfitUsd >= 0 ? "metric-positive" : "metric-negative",
  });
}

function formatRuleValue(value) {
  return Number(value) ? formatPercent(Math.abs(Number(value))).replace(/^\+/, "") : "—";
}

function formatRuleLimitValue(value) {
  return Number(value) ? `${formatRuleValue(value)} límite` : "Sin límite";
}

function ruleAmountFromPct(account = {}, pct = 0) {
  const accountSize = Number(account.accountSize || 0);
  const pctValue = Math.abs(Number(pct || 0));
  if (!accountSize || !pctValue) return "—";
  return formatCurrency((accountSize * pctValue) / 100);
}

function dailyResetLabel(reset = "") {
  const normalized = normalizeText(reset);
  if (normalized === "server_time") return "Reset servidor";
  if (normalized === "local_time") return "Reset local";
  return "Reset por verificar";
}

function maxLossBasisLabel(basis = "", drawdownType = "") {
  const normalized = normalizeText(basis);
  const type = normalizeText(drawdownType);
  if (type === "trailing") return "Trailing";
  if (normalized === "initial_balance") return "Base: balance inicial";
  if (normalized === "current_balance") return "Base: balance actual";
  if (normalized === "equity_peak") return "Base: pico equity";
  if (normalized === "trailing_high_watermark") return "High watermark";
  return "Base por verificar";
}

function drawdownMarginPct(limitPct, usedPct) {
  if (!Number(limitPct)) return null;
  return Math.max(Number(limitPct) - Number(usedPct || 0), 0);
}

function drawdownTone(usagePct, limitPct) {
  if (!Number(limitPct)) return "neutral";
  if (usagePct >= 100) return "risk";
  if (usagePct >= 80) return "warning";
  if (usagePct <= 35) return "profit";
  return "neutral";
}

function tradingDaysStatus(account) {
  if (account.noMinimumDays || !account.requiredTradingDays) {
    return { label: "Sin mínimo requerido", tone: "neutral", remaining: "Sin requisito de días" };
  }
  const remaining = Math.max(account.requiredTradingDays - account.daysCompleted, 0);
  if (!remaining) {
    return { label: "Cumplido", tone: "profit", remaining: "Mínimo completado" };
  }
  return { label: "Pendiente", tone: "warning", remaining: `${remaining} días por completar` };
}

function drawdownStatusLabel(usagePct, limitPct) {
  if (!Number(limitPct)) return "Sin límite";
  if (usagePct >= 100) return "Fuera";
  if (usagePct >= 80) return "Reducido";
  return "Disponible";
}

function fundedLinkedAccountShortMeta(account = {}) {
  if (!account.linked) return "Sin cuenta live";
  const login = accountLogin(account.linked);
  const server = accountServer(account.linked);
  return [login, server].filter(Boolean).join(" · ") || "Cuenta live vinculada";
}

function fundingJourneyMetaLine(account = {}) {
  const line = fundingJourneyCurrentPhaseLine(account.fundingJourney);
  if (!line) return "";
  const status = fundingJourneyStatusLabel(account.fundingJourney?.status);
  return `${line} · ${status}`;
}

function fundingPhaseMetaLine(account = {}) {
  const phase = account.fundingPhase;
  if (!phase) return "";
  return `${phase.phaseName || phase.phaseId} · ${fundingPhaseStatusLabel(phase.status)}`;
}

function economicsAmountMarkup(value = 0) {
  return pnlTextMarkup({
    value,
    text: formatCurrency(value),
    className: value >= 0 ? "metric-positive" : "metric-negative",
  });
}

function economicsRoiMarkup(roiOnCosts = null) {
  if (roiOnCosts == null) return "—";
  const pct = roiOnCosts * 100;
  return pnlTextMarkup({
    value: pct,
    text: formatPercent(pct),
    className: pct >= 0 ? "metric-positive" : "metric-negative",
  });
}

function fundingEconomicsMarkup(economics = {}) {
  const payoutAndWithdrawals = Number(economics.totalPayouts || 0) + Number(economics.totalWithdrawals || 0);
  if (!economics.hasTransactions) {
    return `<div class="funding-economics-empty">Costes y payouts pendientes de registrar.</div>`;
  }
  return `
    <div class="funding-economics-metrics">
      <div><span>Costes</span><strong>${formatCurrency(economics.totalSpent || 0)}</strong></div>
      <div><span>Payouts/Retiros</span><strong>${formatCurrency(payoutAndWithdrawals)}</strong></div>
      <div><span>Neto funding</span><strong>${economicsAmountMarkup(economics.netFundingResult || 0)}</strong></div>
      <div><span>ROI costes</span><strong>${economicsRoiMarkup(economics.roiOnCosts)}</strong></div>
    </div>
  `;
}

function fundingEconomicsKpiMarkup(economics = {}) {
  const payoutAndWithdrawals = Number(economics.totalPayouts || 0) + Number(economics.totalWithdrawals || 0);
  if (!economics.hasTransactions) {
    return `
      <article class="funding-kpi funding-kpi--muted">
        <span class="funding-kpi__label">Costes pendientes</span>
        <strong class="funding-kpi__value">Pendiente</strong>
        <span class="funding-kpi__meta">Costes/payouts no modelados</span>
      </article>
    `;
  }
  return `
    <article class="funding-kpi" data-tone="${Number(economics.netFundingResult || 0) < 0 ? "warning" : "profit"}">
      <span class="funding-kpi__label">Economía funding</span>
      <strong class="funding-kpi__value">${economicsAmountMarkup(economics.netFundingResult || 0)}</strong>
      <span class="funding-kpi__meta">Costes ${formatCurrency(economics.totalSpent || 0)} · Payouts ${formatCurrency(payoutAndWithdrawals)}</span>
    </article>
  `;
}

function fundingSubpageKpiMarkup({ label = "", value = "", meta = "", tone = "neutral" } = {}) {
  return `
    <article class="funding-subpage-kpi" data-tone="${escapeHtml(tone)}">
      <span class="funding-subpage-kpi__label">${escapeHtml(label)}</span>
      <strong class="funding-subpage-kpi__value">${value}</strong>
      <span class="funding-subpage-kpi__meta">${escapeHtml(meta)}</span>
    </article>
  `;
}

function fundingRulesSummaryMarkup(account = {}, economics = {}, daysStatus = tradingDaysStatus(account), challengeStatus = fundedChallengeStatus(account)) {
  const dailyMargin = drawdownMarginPct(account.dailyLimitPct, account.dailyDdPct);
  const maxMargin = drawdownMarginPct(account.maxLimitPct, account.maxDdPct);
  return `
    <section class="funding-subpage-hero funding-subpage-hero--rules" aria-label="Resumen de reglas de funding">
      <div class="funding-subpage-hero__copy">
        <span>Rule command</span>
        <h2>${escapeHtml(fundingRuleDisplayLabel(account))}</h2>
        <p>${escapeHtml(fundingInsightSummary(account, economics))}</p>
      </div>
      <div class="funding-subpage-kpi-grid">
        ${fundingSubpageKpiMarkup({
          label: "Estado",
          value: escapeHtml(challengeStatus.label),
          meta: selectedLinkedAccountMeta(account),
          tone: challengeStatus.dataTone || "neutral",
        })}
        ${fundingSubpageKpiMarkup({
          label: "DD diario",
          value: escapeHtml(dailyMargin == null ? "Sin regla" : `${formatRuleValue(dailyMargin)} margen`),
          meta: account.dailyLimitPct ? `Límite ${formatRuleValue(account.dailyLimitPct)}` : "No configurado",
          tone: drawdownTone(account.dailyUsagePct, account.dailyLimitPct),
        })}
        ${fundingSubpageKpiMarkup({
          label: "DD máximo",
          value: escapeHtml(maxMargin == null ? "Sin regla" : `${formatRuleValue(maxMargin)} margen`),
          meta: account.maxLimitPct ? `Límite ${formatRuleValue(account.maxLimitPct)}` : "No configurado",
          tone: drawdownTone(account.maxUsagePct, account.maxLimitPct),
        })}
        ${fundingSubpageKpiMarkup({
          label: "Días mínimos",
          value: escapeHtml(daysStatus.label),
          meta: daysStatus.remaining,
          tone: daysStatus.tone,
        })}
      </div>
    </section>
  `;
}

function fundingPayoutTone(value = 0) {
  const numeric = Number(value || 0);
  if (numeric > 0) return "profit";
  if (numeric < 0) return "loss";
  return "neutral";
}

function fundingPayoutsSummaryMarkup(economics = {}, transactions = []) {
  const payoutAndWithdrawals = Number(economics.totalPayouts || 0) + Number(economics.totalWithdrawals || 0);
  return `
    <section class="funding-subpage-hero funding-subpage-hero--payouts" aria-label="Resumen de payouts">
      <div class="funding-subpage-hero__copy">
        <span>Payout ledger</span>
        <h2>${economicsAmountMarkup(economics.netFundingResult || 0)}</h2>
        <p>${economics.hasTransactions ? `${transactions.length} movimientos registrados en el journey seleccionado.` : "Ledger de costes, refunds, payouts y ajustes pendiente de completar."}</p>
      </div>
      <div class="funding-subpage-kpi-grid">
        ${fundingSubpageKpiMarkup({
          label: "Costes",
          value: escapeHtml(formatCurrency(economics.totalSpent || 0)),
          meta: "Fees, resets y rebuys",
          tone: economics.totalSpent > 0 ? "warning" : "neutral",
        })}
        ${fundingSubpageKpiMarkup({
          label: "Payouts / retiros",
          value: escapeHtml(formatCurrency(payoutAndWithdrawals)),
          meta: `${formatCurrency(economics.totalRefunds || 0)} refunds`,
          tone: payoutAndWithdrawals > 0 ? "profit" : "neutral",
        })}
        ${fundingSubpageKpiMarkup({
          label: "Neto funding",
          value: economicsAmountMarkup(economics.netFundingResult || 0),
          meta: "Cashflow manual",
          tone: fundingPayoutTone(economics.netFundingResult || 0),
        })}
        ${fundingSubpageKpiMarkup({
          label: "ROI costes",
          value: economicsRoiMarkup(economics.roiOnCosts),
          meta: "Retorno sobre fees",
          tone: economics.roiOnCosts == null ? "neutral" : fundingPayoutTone(economics.roiOnCosts),
        })}
      </div>
    </section>
  `;
}

function fundingLedgerTone(transaction = {}) {
  if (transaction.type === "payout" || transaction.type === "withdrawal" || transaction.type === "refund") return "profit";
  if (transaction.type === "challenge_fee" || transaction.type === "reset_fee" || transaction.type === "rebuy_fee") return "warning";
  return Number(transaction.amount || 0) < 0 ? "loss" : "neutral";
}

function fundingLedgerRowsMarkup(transactions = []) {
  if (!transactions.length) {
    return `
      <div class="funding-ledger-empty">
        <strong>Sin movimientos registrados</strong>
        <span>Cuando añadas costes, refunds o payouts aparecerán aquí separados del P&L de trading.</span>
      </div>
    `;
  }
  return `
    <div class="funding-ledger-table">
      <table>
        <thead>
          <tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Importe</th><th>Notas</th></tr>
        </thead>
        <tbody>
          ${transactions.map((transaction) => `
            <tr>
              <td>${escapeHtml(transaction.date || "—")}</td>
              <td><span class="funding-ledger-type" data-tone="${escapeHtml(fundingLedgerTone(transaction))}">${escapeHtml(fundingTransactionTypeLabel(transaction.type))}</span></td>
              <td><strong>${escapeHtml(transaction.label || "Movimiento")}</strong></td>
              <td>${economicsAmountMarkup(transaction.amount || 0)}</td>
              <td>${escapeHtml(transaction.notes || "—")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function fundingRuleCommandCardMarkup({ label = "", value = "", meta = "", tone = "neutral" } = {}) {
  return `
    <article class="funding-rule-command-card" data-tone="${escapeHtml(tone)}">
      <span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
      <small>${escapeHtml(meta)}</small>
    </article>
  `;
}

function fundingRulesCommandDeckMarkup(account = {}, daysStatus = tradingDaysStatus(account), challengeStatus = fundedChallengeStatus(account)) {
  const preset = account.preset || {};
  const dailyMargin = drawdownMarginPct(account.dailyLimitPct, account.dailyDdPct);
  const maxMargin = drawdownMarginPct(account.maxLimitPct, account.maxDdPct);
  const rewardPct = Number(preset.rewardPct ?? preset.payoutSplitPct ?? 0);
  return `
    <section class="funding-rules-command-deck" aria-label="Matriz operativa de reglas">
      ${fundingRuleCommandCardMarkup({
        label: "Objetivo fase",
        value: escapeHtml(account.targetPct ? formatRuleValue(account.targetPct) : "Sin objetivo"),
        meta: account.targetUsd ? `${formatCurrency(account.targetUsd)} objetivo` : "Preservación primero",
        tone: targetProgressTone(account),
      })}
      ${fundingRuleCommandCardMarkup({
        label: "DD diario",
        value: escapeHtml(formatRuleLimitValue(account.dailyLimitPct)),
        meta: dailyMargin == null ? "Sin margen configurado" : `${formatRuleValue(dailyMargin)} margen · ${dailyResetLabel(preset.dailyReset)}`,
        tone: drawdownTone(account.dailyUsagePct, account.dailyLimitPct),
      })}
      ${fundingRuleCommandCardMarkup({
        label: "DD máximo",
        value: escapeHtml(formatRuleLimitValue(account.maxLimitPct)),
        meta: maxMargin == null ? "Sin margen configurado" : `${formatRuleValue(maxMargin)} margen · ${maxLossBasisShortLabel(preset.maxLossBasis, preset.drawdownType)}`,
        tone: drawdownTone(account.maxUsagePct, account.maxLimitPct),
      })}
      ${fundingRuleCommandCardMarkup({
        label: "Modelo DD",
        value: escapeHtml(drawdownTypeLabel(preset.drawdownType)),
        meta: maxLossBasisLabel(preset.maxLossBasis, preset.drawdownType),
        tone: requiresRuleVerification(account) ? "warning" : "info",
      })}
      ${fundingRuleCommandCardMarkup({
        label: "Días mínimos",
        value: escapeHtml(minimumDaysRuleLabel(account)),
        meta: daysStatus.remaining,
        tone: daysStatus.tone,
      })}
      ${fundingRuleCommandCardMarkup({
        label: "Payout split",
        value: escapeHtml(rewardPct ? formatRuleValue(rewardPct) : "No modelado"),
        meta: rewardPct ? "Recompensa estimada del preset" : "Pendiente de completar",
        tone: rewardPct ? "profit" : "neutral",
      })}
      ${fundingRuleCommandCardMarkup({
        label: "Fuente",
        value: escapeHtml(fundingRuleDisplayLabel(account)),
        meta: fundingRuleDisplayMeta(account),
        tone: fundingRuleTone(account),
      })}
      ${fundingRuleCommandCardMarkup({
        label: "Estado",
        value: escapeHtml(challengeStatus.label),
        meta: challengeStatus.detail,
        tone: challengeStatus.dataTone || "neutral",
      })}
    </section>
  `;
}

function fundingRulesProtocolMarkup(account = {}, reviewAlerts = []) {
  const preset = account.preset || {};
  const primaryAlerts = reviewAlerts.slice(0, 3);
  const dailyPressure = account.dailyLimitPct ? account.dailyUsagePct : 0;
  const maxPressure = account.maxLimitPct ? account.maxUsagePct : 0;
  const pressureTone = dailyPressure >= 80 || maxPressure >= 80 ? "warning" : "profit";
  return `
    <section class="funding-rules-protocol" aria-label="Protocolo de reglas">
      <div class="funding-rules-protocol__main">
        <div>
          <span>Protocolo antes de operar</span>
          <strong>${requiresRuleVerification(account) ? "Validar reglas antes de subir riesgo" : "Reglas listas para ejecución controlada"}</strong>
          <p>${escapeHtml(ruleNote(account) || fundingRuleDisplayMeta(account))}</p>
        </div>
        <div class="funding-rules-protocol__chips">
          <span data-tone="${escapeHtml(fundingRuleTone(account))}">${escapeHtml(fundingRuleDisplayLabel(account))}</span>
          <span data-tone="${escapeHtml(pressureTone)}">Presión DD ${Math.max(Math.round(dailyPressure), Math.round(maxPressure))}%</span>
          <span data-tone="info">${escapeHtml(preset.programName || account.programModel || "Preset")}</span>
        </div>
      </div>
      <div class="funding-rules-alert-list">
        ${primaryAlerts.map((alert) => `
          <div class="funding-rules-alert-item" data-tone="${escapeHtml(alert.tone)}">
            <span class="funding-review-row__dot" aria-hidden="true"></span>
            <div>
              <strong>${escapeHtml(alert.title)}</strong>
              <small>${escapeHtml(alert.detail)}</small>
            </div>
          </div>
        `).join("")}
        ${primaryAlerts.length ? "" : `
          <div class="funding-rules-alert-item" data-tone="profit">
            <span class="funding-review-row__dot" aria-hidden="true"></span>
            <div>
              <strong>Sin bloqueos críticos</strong>
              <small>La matriz no detecta presión severa sobre reglas.</small>
            </div>
          </div>
        `}
      </div>
    </section>
  `;
}

function fundingPayoutCashflowCardMarkup({ label = "", value = "", meta = "", tone = "neutral" } = {}) {
  return `
    <article class="funding-payout-cashflow-card" data-tone="${escapeHtml(tone)}">
      <span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
      <small>${escapeHtml(meta)}</small>
    </article>
  `;
}

function fundingPayoutCashflowMarkup(economics = {}) {
  const payoutAndWithdrawals = Number(economics.totalPayouts || 0) + Number(economics.totalWithdrawals || 0);
  return `
    <section class="funding-payout-cashflow-grid" aria-label="Cashflow de fondeo">
      ${fundingPayoutCashflowCardMarkup({
        label: "Costes",
        value: escapeHtml(formatCurrency(economics.totalSpent || 0)),
        meta: "Challenge, reset y rebuy",
        tone: economics.totalSpent > 0 ? "warning" : "neutral",
      })}
      ${fundingPayoutCashflowCardMarkup({
        label: "Refunds",
        value: escapeHtml(formatCurrency(economics.totalRefunds || 0)),
        meta: "Devoluciones recuperadas",
        tone: economics.totalRefunds > 0 ? "profit" : "neutral",
      })}
      ${fundingPayoutCashflowCardMarkup({
        label: "Payouts",
        value: escapeHtml(formatCurrency(economics.totalPayouts || 0)),
        meta: "Pagos recibidos",
        tone: economics.totalPayouts > 0 ? "profit" : "neutral",
      })}
      ${fundingPayoutCashflowCardMarkup({
        label: "Retiros",
        value: escapeHtml(formatCurrency(economics.totalWithdrawals || 0)),
        meta: "Capital retirado",
        tone: economics.totalWithdrawals > 0 ? "profit" : "neutral",
      })}
      ${fundingPayoutCashflowCardMarkup({
        label: "Neto",
        value: economicsAmountMarkup(economics.netFundingResult || 0),
        meta: "Resultado funding puro",
        tone: fundingPayoutTone(economics.netFundingResult || 0),
      })}
      ${fundingPayoutCashflowCardMarkup({
        label: "ROI costes",
        value: economicsRoiMarkup(economics.roiOnCosts),
        meta: "Retorno sobre fees",
        tone: economics.roiOnCosts == null ? "neutral" : fundingPayoutTone(economics.roiOnCosts),
      })}
      ${fundingPayoutCashflowCardMarkup({
        label: "Cash in",
        value: escapeHtml(formatCurrency(payoutAndWithdrawals + Number(economics.totalRefunds || 0))),
        meta: "Payouts, retiros y refunds",
        tone: payoutAndWithdrawals || economics.totalRefunds ? "profit" : "neutral",
      })}
      ${fundingPayoutCashflowCardMarkup({
        label: "Ajustes",
        value: escapeHtml(formatCurrency(economics.totalAdjustments || 0)),
        meta: "Descuentos y ajustes manuales",
        tone: fundingPayoutTone(economics.totalAdjustments || 0),
      })}
    </section>
  `;
}

function fundingPayoutReadinessMarkup(account = {}, economics = {}, transactions = []) {
  const preset = account.preset || {};
  const splitPct = Number(preset.rewardPct ?? preset.payoutSplitPct ?? 0);
  const eligibleProfit = Math.max(Number(account.currentProfitUsd || 0), 0);
  const estimatedPayout = splitPct ? (eligibleProfit * splitPct) / 100 : 0;
  const latestTransaction = transactions[0] || null;
  const readinessTone = estimatedPayout > 0 ? "profit" : economics.hasTransactions ? "info" : "warning";
  return `
    <section class="funding-payout-readiness" data-tone="${escapeHtml(readinessTone)}" aria-label="Estado de cobro">
      <div class="funding-payout-readiness__copy">
        <span>Estado de cobro</span>
        <strong>${estimatedPayout > 0 ? `${formatCurrency(estimatedPayout)} estimado` : "Sin payout estimado"}</strong>
        <p>${estimatedPayout > 0 ? "Estimación basada en beneficio positivo y split modelado; registrar sólo pagos reales cuando se reciban." : "Esta página separa cashflow de fondeo del P&L operativo hasta que exista payout real."}</p>
      </div>
      <div class="funding-payout-readiness__grid">
        <span><small>Split</small><strong>${splitPct ? formatRuleValue(splitPct) : "No modelado"}</strong></span>
        <span><small>Beneficio elegible</small><strong>${formatCurrency(eligibleProfit)}</strong></span>
        <span><small>Último movimiento</small><strong>${latestTransaction ? escapeHtml(latestTransaction.date || "—") : "Sin ledger"}</strong></span>
        <span><small>Movimientos</small><strong>${transactions.length}</strong></span>
      </div>
    </section>
  `;
}

function fundingCardEconomicsValue(economics = {}) {
  if (!economics.hasTransactions) return "Pendiente";
  return economicsAmountMarkup(economics.netFundingResult || 0);
}

function fundingInsightSummary(account = {}, economics = {}) {
  const status = fundedChallengeStatus(account);
  if (status.label === "Fase fallida") {
    const maxPressure = account.maxUsagePct >= 80 ? " margen máximo reducido" : " revisar registro de fase";
    const failureCause = account.dailyUsagePct >= 100
      ? "límite diario"
      : account.maxUsagePct >= 100
        ? "límite máximo"
        : "regla de fase";
    return `Fase fallida registrada por ${failureCause};${maxPressure}.`;
  }
  if (status.label === "Límite diario excedido") return "Límite diario excedido; confirma reglas antes de marcar la fase como fallida.";
  if (status.label === "Límite máximo excedido") return "Límite máximo excedido; confirma reglas antes de marcar la fase como fallida.";
  if (account.accountSizeMismatch) return "Configuración pendiente antes de interpretar progreso.";
  if (account.dailyUsagePct >= 80 || account.maxUsagePct >= 80) return "Margen de drawdown reducido; operar con lectura conservadora.";
  if (!account.targetUsd) return "Sin objetivo de beneficio activo; lectura centrada en preservación.";
  if (status.label === "En vigilancia" && hasUserConfirmedRules(account)) return "Challenge en vigilancia; reglas confirmadas por usuario.";
  if (status.label === "En vigilancia" && requiresRuleVerification(account)) return "Challenge en vigilancia; reglas pendientes de validar.";
  if (status.label === "En vigilancia") return "Challenge en vigilancia; revisar evolución sin señal crítica.";
  if (economics.hasTransactions && economics.netFundingResult < 0) return "Challenge en seguimiento con economía funding todavía negativa.";
  return "Challenge dentro de objetivo y sin alertas críticas visibles.";
}

function fundingRuleTone(account = {}) {
  const confirmation = ruleConfirmationStatus(account);
  if (confirmation === RULE_CONFIRMATION_STATUS.OFFICIAL_VERIFIED) return "profit";
  if (confirmation === RULE_CONFIRMATION_STATUS.USER_CONFIRMED) return "info";
  if (requiresRuleVerification(account)) return "warning";
  return "neutral";
}

function fundingRuleDisplayLabel(account = {}) {
  const confirmation = ruleConfirmationStatus(account);
  if (confirmation === RULE_CONFIRMATION_STATUS.OFFICIAL_VERIFIED) return "Preset verificado";
  if (confirmation === RULE_CONFIRMATION_STATUS.USER_CONFIRMED) return "Reglas confirmadas";
  if (requiresRuleVerification(account)) return "Pendiente de validar";
  return account.ruleStatus?.label || "Sin preset";
}

function fundingRuleDisplayMeta(account = {}) {
  const confirmation = ruleConfirmationStatus(account);
  if (confirmation === RULE_CONFIRMATION_STATUS.OFFICIAL_VERIFIED) {
    return account.preset?.sourceNote || account.preset?.versionLabel || "Fuente oficial vinculada";
  }
  if (confirmation === RULE_CONFIRMATION_STATUS.USER_CONFIRMED) return "Confirmadas por usuario";
  if (requiresRuleVerification(account)) return "Reglas cargadas · validar contra dashboard";
  return account.preset?.versionLabel || "Fuente no configurada";
}

function drawdownTypeLabel(type = "") {
  const normalized = normalizeText(type);
  if (normalized === "static") return "Estático";
  if (normalized === "trailing") return "Trailing";
  if (normalized === "relative") return "Relativo";
  if (normalized === "daily_balance") return "Diario sobre balance";
  if (normalized === "daily_equity") return "Diario sobre equity";
  if (normalized === "daily_balance_or_equity") return "Balance o equity";
  return "Por verificar";
}

function maxLossBasisShortLabel(basis = "", drawdownType = "") {
  const label = maxLossBasisLabel(basis, drawdownType);
  return label.replace(/^Base:\s*/i, "");
}

function minimumDaysRuleLabel(account = {}) {
  if (account.noMinimumDays || !account.requiredTradingDays) return "Sin mínimo";
  return `${account.requiredTradingDays} días`;
}

function fundingRuleRowMarkup(label = "", value = "", meta = "", tone = "neutral") {
  return `
    <span class="funding-rule-row" data-tone="${escapeHtml(tone)}">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(value)}</strong>
      ${meta ? `<em>${escapeHtml(meta)}</em>` : ""}
    </span>
  `;
}

function ruleLimitMeta(account = {}, pct = 0, suffix = "") {
  if (!Number(pct)) return "No configurado";
  return [ruleAmountFromPct(account, pct), suffix].filter(Boolean).join(" · ");
}

function fundingRulesVisualMarkup(account = {}) {
  const preset = account.preset || {};
  const targetValue = account.targetPct ? formatPercent(account.targetPct) : "Sin objetivo";
  const targetMeta = account.targetUsd ? formatCurrency(account.targetUsd) : "No configurado";
  const presetLabel = fundingRuleDisplayLabel(account);
  const presetMeta = fundingRuleDisplayMeta(account);
  const programLabel = preset.programName || account.programModel || "Preset";
  const rewardPct = Number(preset.rewardPct ?? preset.payoutSplitPct ?? 0);
  return `
    <div class="funding-rule-card" aria-label="Reglas de la fase">
      <div class="funding-rule-card__head">
        <strong>Reglas de la fase</strong>
        <span data-tone="${escapeHtml(fundingRuleTone(account))}">${escapeHtml(programLabel)}</span>
      </div>
      <div class="funding-rule-list">
        ${fundingRuleRowMarkup("Objetivo de beneficio", targetValue, targetMeta)}
        ${fundingRuleRowMarkup("Drawdown diario", formatRuleLimitValue(account.dailyLimitPct), ruleLimitMeta(account, account.dailyLimitPct, dailyResetLabel(preset.dailyReset)))}
        ${fundingRuleRowMarkup("Pérdida máxima", formatRuleLimitValue(account.maxLimitPct), ruleLimitMeta(account, account.maxLimitPct))}
        ${fundingRuleRowMarkup("Tipo de drawdown", drawdownTypeLabel(preset.drawdownType), "")}
        ${fundingRuleRowMarkup("Base de cálculo", maxLossBasisShortLabel(preset.maxLossBasis, preset.drawdownType), "")}
        ${fundingRuleRowMarkup("Días mínimos", minimumDaysRuleLabel(account), "")}
        ${fundingRuleRowMarkup("Recompensa", rewardPct ? `${formatRuleValue(rewardPct)}` : "No modelado", rewardPct ? "Payout split" : "No se infiere de P&L")}
        ${fundingRuleRowMarkup("Fuente", presetLabel, presetMeta, fundingRuleTone(account))}
      </div>
    </div>
  `;
}

function drawdownCurrentLine(usagePct = 0, limitPct = 0, usedPct = 0) {
  if (!Number(limitPct)) return "Sin regla configurada";
  const margin = drawdownMarginPct(limitPct, usedPct);
  const marginLabel = margin <= 0 ? "sin margen" : `margen ${formatRuleValue(margin)}`;
  return `${Math.round(usagePct)}% usado · ${marginLabel}`;
}

function fundingCardSummaryMarkup(account = {}, economics = {}) {
  const targetLabel = account.targetUsd ? `objetivo ${formatCurrency(account.targetUsd)}` : "sin objetivo";
  return `
    <span class="funding-card-summary">
      <span><strong>Resultado</strong><em>${fundedResultMarkup(account)} / ${escapeHtml(targetLabel)}</em></span>
      <span data-tone="${escapeHtml(drawdownTone(account.dailyUsagePct, account.dailyLimitPct))}">
        <strong>DD diario</strong><em>${escapeHtml(drawdownCurrentLine(account.dailyUsagePct, account.dailyLimitPct, account.dailyDdPct))}</em>
      </span>
      <span data-tone="${escapeHtml(drawdownTone(account.maxUsagePct, account.maxLimitPct))}">
        <strong>DD máximo</strong><em>${escapeHtml(drawdownCurrentLine(account.maxUsagePct, account.maxLimitPct, account.maxDdPct))}</em>
      </span>
      <span><strong>Neto funding</strong><em>${fundingCardEconomicsValue(economics)}</em></span>
    </span>
  `;
}

function currentStateValueMarkup({ label = "", value = "", meta = "", tone = "neutral" } = {}) {
  return `
    <span class="funding-state-row" data-tone="${escapeHtml(tone)}">
      <small>${escapeHtml(label)}</small>
      <strong>${value}</strong>
      ${meta ? `<em>${escapeHtml(meta)}</em>` : ""}
    </span>
  `;
}

function fundingCurrentStateMarkup(account = {}, economics = {}, daysStatus = tradingDaysStatus(account)) {
  const targetMeta = account.targetUsd ? `pendiente ${formatCurrency(account.remainingUsd)}` : "Sin objetivo";
  const daysValue = account.requiredTradingDays
    ? `${account.daysCompleted} / ${account.requiredTradingDays}`
    : String(account.daysCompleted || 0);
  return `
    <div class="funding-state-card" aria-label="Estado actual del challenge">
      <div class="funding-rule-card__head">
        <strong>Estado actual</strong>
        <span data-tone="${escapeHtml(fundedChallengeStatus(account).dataTone)}">${escapeHtml(fundedChallengeStatus(account).label)}</span>
      </div>
      <div class="funding-rule-list">
        ${currentStateValueMarkup({
          label: "Resultado actual",
          value: fundedResultMarkup(account),
          tone: account.currentProfitUsd < 0 ? "risk" : "profit",
        })}
        ${currentStateValueMarkup({
          label: "Objetivo",
          value: escapeHtml(account.targetUsd ? `${Math.round(account.targetCompletionPct)}%` : "—"),
          meta: targetMeta,
        })}
        ${currentStateValueMarkup({
          label: "DD diario usado",
          value: escapeHtml(account.dailyLimitPct ? `${Math.round(account.dailyUsagePct)}%` : "—"),
          meta: drawdownCurrentLine(account.dailyUsagePct, account.dailyLimitPct, account.dailyDdPct),
          tone: drawdownTone(account.dailyUsagePct, account.dailyLimitPct),
        })}
        ${currentStateValueMarkup({
          label: "DD máximo usado",
          value: escapeHtml(account.maxLimitPct ? `${Math.round(account.maxUsagePct)}%` : "—"),
          meta: drawdownCurrentLine(account.maxUsagePct, account.maxLimitPct, account.maxDdPct),
          tone: drawdownTone(account.maxUsagePct, account.maxLimitPct),
        })}
        ${currentStateValueMarkup({
          label: "Días",
          value: escapeHtml(daysValue),
          meta: daysStatus.label,
        })}
        ${currentStateValueMarkup({
          label: "Neto funding",
          value: fundingCardEconomicsValue(economics),
          meta: economics.hasTransactions ? "Ledger manual" : "Pendiente de registrar",
          tone: economics.hasTransactions && economics.netFundingResult < 0 ? "warning" : "neutral",
        })}
      </div>
    </div>
  `;
}

function targetProgressTone(account = {}) {
  if (account.accountSizeMismatch) return "warning";
  if (!account.targetUsd) return "neutral";
  if (account.targetCompletionPct >= 100) return "profit";
  if (account.currentProfitUsd > 0) return "profit";
  return "neutral";
}

function fundingGaugeMarkup({ label = "", value = 0, tone = "neutral", primary = "", meta = "" } = {}) {
  return `
    <span class="funding-gauge" data-tone="${escapeHtml(tone)}">
      <span class="funding-gauge__head">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(primary)}</strong>
      </span>
      <span class="funding-bar__rail" aria-hidden="true">
        <span class="funding-bar__fill" style="width:${clamp(Number(value || 0))}%"></span>
      </span>
      <span class="funding-gauge__meta">${escapeHtml(meta)}</span>
    </span>
  `;
}

function fundingCardStatusMarkup(account = {}) {
  const status = fundedChallengeStatus(account);
  const compactLabels = {
    "Sin objetivo definido": "Sin objetivo",
    "Revisa configuración": "Configuración",
    "Límite diario excedido": "DD diario",
    "Límite máximo excedido": "DD máximo",
  };
  const label = compactLabels[status.label] || status.label;
  return `
    <span class="funding-status-chip" data-tone="${escapeHtml(status.dataTone)}" title="${escapeHtml(status.label)}" aria-label="${escapeHtml(status.label)}">
      <span class="funding-status-chip__dot" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function fundingAccountContextBadgeMarkup(account = {}) {
  if (isLiveFundedAccount(account)) return "";
  const labels = account.linked ? ["Demo", "Sin cuenta live"] : ["Sin cuenta live"];
  return `
    ${labels.map((label) => `
      <span class="funding-rule-chip" data-tone="neutral" title="${escapeHtml(label)}">
        ${escapeHtml(label)}
      </span>
    `).join("")}
  `;
}

function fundingAccountGaugesMarkup(account = {}) {
  const dailyMargin = drawdownMarginPct(account.dailyLimitPct, account.dailyDdPct);
  const maxMargin = drawdownMarginPct(account.maxLimitPct, account.maxDdPct);
  return `
    <span class="funding-card-gauges" aria-label="Progreso y límites del challenge">
      ${fundingGaugeMarkup({
        label: "Objetivo",
        value: account.accountSizeMismatch ? 0 : account.targetUsd ? account.targetCompletionPct : 0,
        tone: targetProgressTone(account),
        primary: account.accountSizeMismatch
          ? "Revisar"
          : account.targetUsd
            ? `${Math.round(account.targetCompletionPct)}%`
            : "Sin objetivo",
        meta: account.accountSizeMismatch
          ? "Tamaño incompatible"
          : account.targetUsd
            ? `${formatCurrency(account.currentProfitUsd)} / ${formatCurrency(account.targetUsd)} · pendiente ${formatCurrency(account.remainingUsd)}`
            : "Sin objetivo en esta fase",
      })}
      ${fundingGaugeMarkup({
        label: "DD diario",
        value: account.dailyLimitPct ? account.dailyUsagePct : 0,
        tone: drawdownTone(account.dailyUsagePct, account.dailyLimitPct),
        primary: account.dailyLimitPct ? `${Math.round(account.dailyUsagePct)}%` : "Sin límite",
        meta: account.dailyLimitPct
          ? `${dailyMargin <= 0 ? "Sin margen" : `Margen ${formatRuleValue(dailyMargin)}`} · límite ${formatRuleValue(account.dailyLimitPct)}`
          : "Sin regla configurada",
      })}
      ${fundingGaugeMarkup({
        label: "DD máximo",
        value: account.maxLimitPct ? account.maxUsagePct : 0,
        tone: drawdownTone(account.maxUsagePct, account.maxLimitPct),
        primary: account.maxLimitPct ? `${Math.round(account.maxUsagePct)}%` : "Sin límite",
        meta: account.maxLimitPct
          ? `${maxMargin <= 0 ? "Sin margen" : `Margen ${formatRuleValue(maxMargin)}`} · límite ${formatRuleValue(account.maxLimitPct)}`
          : "Sin regla configurada",
      })}
    </span>
  `;
}

function isLinkedAccountStale(account) {
  if (!account.linked) return true;
  if (account.linked.connection?.connected === false || account.linked.connection?.state === "disconnected") return true;
  const lastSync = account.linked.connection?.lastSync || account.linked.dashboardPayload?.last_sync_at || account.linked.dashboardPayload?.timestamp || "";
  if (!lastSync) return true;
  const parsed = new Date(lastSync);
  if (Number.isNaN(parsed.getTime())) return true;
  return Date.now() - parsed.getTime() > 15 * 60 * 1000;
}

function fundedReviewAlerts(account, fundingEconomics = {}) {
  const alerts = [];
  if (hasExplicitPhaseFailure(account)) {
    alerts.push({
      tone: "error",
      title: "Fase fallida",
      detail: "La fase figura como fallida por estado explícito o registro manual.",
      badge: "Fase",
    });
  }
  if (account.dailyLimitPct && account.dailyUsagePct >= 80) {
    alerts.push({
      tone: account.dailyUsagePct >= 100 ? "error" : "warn",
      title: account.dailyUsagePct >= 100 ? "Límite diario excedido" : "Margen diario reducido",
      detail: account.dailyUsagePct >= 100
        ? "El cálculo supera el límite diario configurado. Confirma reglas/preset antes de marcar la fase como fallida."
        : `${Math.round(account.dailyUsagePct)}% del límite diario usado.`,
      badge: "DD diario",
    });
  }
  if (account.maxLimitPct && account.maxUsagePct >= 80) {
    alerts.push({
      tone: account.maxUsagePct >= 100 ? "error" : "warn",
      title: account.maxUsagePct >= 100 ? "Límite máximo excedido" : "Margen máximo reducido",
      detail: account.maxUsagePct >= 100
        ? "El cálculo supera el límite máximo configurado. Confirma reglas/preset antes de marcar la fase como fallida."
        : `${Math.round(account.maxUsagePct)}% del límite máximo usado.`,
      badge: "DD máximo",
    });
  }
  if (requiresRuleVerification(account)) {
    alerts.push({
      tone: "neutral",
      title: account.preset?.sourceType === "user_manual" ? "Reglas pendientes" : "Confirmar reglas del programa",
      detail: account.preset?.sourceType === "user_manual"
        ? "Valida que coinciden con el dashboard de la prop firm."
        : "Confirma el programa exacto de la prop firm.",
      badge: "Reglas",
    });
  }
  if (
    account.dailyLimitPct
      && account.dailyUsagePct >= 50
      && account.dailyUsagePct < 80
      && !alerts.some((alert) => alert.badge === "DD diario")
  ) {
    alerts.push({
      tone: "neutral",
      title: "Margen diario en vigilancia",
      detail: `${Math.round(account.dailyUsagePct)}% del límite diario usado.`,
      badge: "DD diario",
    });
  }
  if (account.accountSizeMismatch) {
    alerts.push({
      tone: "warn",
      title: "Revisa tamaño de cuenta",
      detail: "El tamaño configurado no coincide con el balance live recibido.",
      badge: "Config",
    });
  }
  if (!account.targetUsd) {
    alerts.push({
      tone: "info",
      title: "Objetivo no configurado",
      detail: "La fase actual no tiene objetivo de beneficio activo.",
      badge: "Objetivo",
    });
  }
  if (isLinkedAccountStale(account)) {
    alerts.push({
      tone: "warn",
      title: "Cuenta sin sincronización reciente",
      detail: "Revisa la última conexión live antes de interpretar la fase.",
      badge: "Sync",
    });
  }
  if (!alerts.some((alert) => alert.tone === "error" || alert.tone === "warn")) {
    alerts.push({
      tone: "ok",
      title: "Sin alertas críticas",
      detail: "No hay señales críticas con los datos disponibles.",
      badge: "OK",
    });
  }
  if (!fundingEconomics.hasTransactions) {
    alerts.push({
      tone: "neutral",
      title: "Costes y payouts pendientes",
      detail: "Costes, payouts y recuperaciones todavía no están registrados.",
      badge: "Info",
    });
  }
  return alerts;
}

function openFundedConfigModal(store, account, accountCurrencySymbol = "$") {
  const firmOptions = availableFirms(account.propFirm);
  const modelOptions = availableModels(account.propFirm, account.programModel);
  const confirmationStatus = ruleConfirmationStatus(account);
  const officialRulesAvailable = hasOfficialVerifiedRules(account);
  openModal({
    title: "Editar configuración",
    subtitle: fundedChallengeDisplayName(account),
    maxWidth: 620,
    content: `
      <div class="funding-config-modal">
        <label class="form-stack">
          <span>Firma</span>
          <select data-funded-field="propFirm" data-funded-id="${account.id}">
            ${firmOptions.map((firm) => `<option value="${firm}" ${firm === account.propFirm ? "selected" : ""}>${firm}</option>`).join("")}
          </select>
        </label>
        <label class="form-stack">
          <span>Modelo</span>
          <select data-funded-field="programModel" data-funded-id="${account.id}">
            ${modelOptions.map((model) => `<option value="${model}" ${model === account.programModel ? "selected" : ""}>${model}</option>`).join("")}
          </select>
        </label>
        <label class="form-stack">
          <span>Fase</span>
          <select data-funded-field="phase" data-funded-id="${account.id}">
            ${FUNDING_RULE_PHASES.map((phase) => `<option value="${phase}" ${phase === account.phase ? "selected" : ""}>${phase}</option>`).join("")}
          </select>
        </label>
        <label class="form-stack">
          <span>Confirmación de reglas</span>
          <select data-funded-field="rulesConfirmationStatus" data-funded-id="${account.id}">
            <option value="${RULE_CONFIRMATION_STATUS.UNCONFIRMED}" ${confirmationStatus === RULE_CONFIRMATION_STATUS.UNCONFIRMED ? "selected" : ""}>Pendiente de confirmar</option>
            <option value="${RULE_CONFIRMATION_STATUS.USER_CONFIRMED}" ${confirmationStatus === RULE_CONFIRMATION_STATUS.USER_CONFIRMED ? "selected" : ""}>Confirmadas por mí</option>
            ${officialRulesAvailable ? `<option value="${RULE_CONFIRMATION_STATUS.OFFICIAL_VERIFIED}" selected>Usar preset oficial</option>` : ""}
          </select>
        </label>
        <label class="form-stack">
          <span>Tamaño de cuenta</span>
          <div class="funded-size-wrap">
            <span class="funded-size-prefix">${accountCurrencySymbol}</span>
            <input class="funded-size-input" type="number" min="0" step="1000" value="${account.accountSize}" data-funded-field="accountSize" data-funded-id="${account.id}">
          </div>
        </label>
        <div class="goal-card-sub funded-preset-note">
          <svg class="funded-preset-note-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"></circle>
            <path d="M12 10v6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
            <circle cx="12" cy="7.2" r="1" fill="currentColor"></circle>
          </svg>
          <span>Marca las reglas como confirmadas si coinciden con el dashboard de la prop firm. ${ruleNote(account)}</span>
        </div>
      </div>
    `,
    onMount: (card) => {
      card?.addEventListener("change", (event) => {
        const field = event.target.closest("[data-funded-field]");
        if (!field) return;
        applyFundedFieldChange(store, field.dataset.fundedId || account.id, field.dataset.fundedField, field.value);
      });
    }
  });
}

function openFundingTransactionModal(store, root, account, currency = "USD") {
  const journey = account.fundingJourney;
  const phase = account.fundingPhase;
  if (!journey?.id) return;

  openModal({
    title: "Añadir movimiento",
    subtitle: `${fundedChallengeDisplayName(account)} · economía del fondeo`,
    maxWidth: 620,
    content: `
      <form class="funding-ledger-form" data-funding-transaction-form>
        <label class="form-stack">
          <span>Tipo</span>
          <select name="type" required>
            ${FUNDING_TRANSACTION_TYPES.map((type) => `<option value="${type}">${fundingTransactionTypeLabel(type)}</option>`).join("")}
          </select>
        </label>
        <label class="form-stack">
          <span>Importe</span>
          <input type="number" name="amount" step="0.01" required placeholder="0.00">
        </label>
        <label class="form-stack">
          <span>Fecha</span>
          <input type="date" name="date" value="${new Date().toISOString().slice(0, 10)}">
        </label>
        <label class="form-stack">
          <span>Etiqueta</span>
          <input type="text" name="label" placeholder="Ej. Challenge fee Orion">
        </label>
        <label class="form-stack">
          <span>Notas</span>
          <textarea name="notes" rows="3" placeholder="Referencia, invoice, payout o contexto manual"></textarea>
        </label>
        <div class="funding-economics-note">
          Los costes se guardan como importes negativos. Esta economía no se infiere del P&L de trading.
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" type="button" data-modal-dismiss="true">Cancelar</button>
          <button class="btn-primary" type="submit">Guardar movimiento</button>
        </div>
      </form>
    `,
    onMount: (card) => {
      const form = card?.querySelector("[data-funding-transaction-form]");
      form?.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const transaction = normalizeFundingTransaction({
          type: data.get("type"),
          amount: data.get("amount"),
          date: data.get("date"),
          label: data.get("label"),
          notes: data.get("notes"),
        }, {
          journeyId: journey.id,
          phaseId: phase?.id || journey.currentPhaseId || "",
          currency,
        });
        if (!transaction.amount) return;
        addFundingTransaction(store, transaction);
        closeModal();
        renderFunded(root, store.getState());
      });
    },
  });
}

export function initFunded(store) {
  const root = document.getElementById("fundedRoot");
  if (!root) return;

  root.addEventListener("click", (event) => {
    const selectButton = event.target.closest("[data-funded-select]");
    if (selectButton) {
      root.dataset.selectedFundedId = selectButton.dataset.fundedId;
      root.dataset.fundedSelectionMode = "manual";
      renderFunded(root, store.getState());
      return;
    }

    const configButton = event.target.closest("[data-funded-action='edit-config']");
    if (configButton) {
      const currentState = store.getState();
      const enriched = enrichFundedAccount(currentState, configButton.dataset.fundedId);
      if (!enriched) return;
      const appCurrency = currentState.workspace?.baseCurrency || currentState.preferences?.baseCurrency || "USD";
      const accountCurrency = enriched.linked?.currency || enriched.linked?.model?.account?.currency || appCurrency;
      openFundedConfigModal(store, enriched, currencySymbol(accountCurrency));
      return;
    }

    const transactionButton = event.target.closest("[data-funded-action='add-transaction']");
    if (transactionButton) {
      const currentState = store.getState();
      const enriched = enrichFundedAccount(currentState, transactionButton.dataset.fundedId);
      if (!enriched) return;
      const appCurrency = currentState.workspace?.baseCurrency || currentState.preferences?.baseCurrency || "USD";
      const accountCurrency = enriched.linked?.currency || enriched.linked?.model?.account?.currency || appCurrency;
      openFundingTransactionModal(store, root, enriched, accountCurrency);
      return;
    }

    const detailButton = event.target.closest("[data-funded-action='view']");
    if (!detailButton) return;
    const currentState = store.getState();
    const enriched = enrichFundedAccount(currentState, detailButton.dataset.fundedId);
    if (!enriched) return;
    const linked = enriched.linked;
    const enrichedStatus = fundedStatusMeta(enriched.globalStatus);
    const adminView = currentState.auth?.user?.role === "admin";

    openModal({
      title: `${enriched.propFirm} · ${linked?.name || enriched.label}`,
      subtitle: "Detalle de seguimiento funding",
      maxWidth: 620,
      content: `
        <div class="info-list compact">
          <div><strong>Cuenta</strong><span>${linked?.name || "Sin vincular"}</span></div>
          <div><strong>Cuenta live</strong><span>${escapeHtml(linkedAccountContextLabel(enriched))}</span></div>
          <div><strong>Recorrido</strong><span>${escapeHtml(fundingJourneyMetaLine(enriched) || "Recorrido derivado de la cuenta funded")}</span></div>
          <div><strong>Fase actual</strong><span>${escapeHtml(fundingPhaseMetaLine(enriched) || enriched.phase)}</span></div>
          <div><strong>Firma</strong><span>${enriched.propFirm}</span></div>
          <div><strong>Modelo</strong><span>${enriched.programModel}</span></div>
          <div><strong>Fase</strong><span>${enriched.phase}</span></div>
          <div><strong>Tamaño</strong><span>${formatCurrency(enriched.accountSize)}</span></div>
          <div><strong>Resultado actual</strong><span>${enriched.accountSizeMismatch ? "Revisar tamaño de cuenta" : `${pnlTextMarkup({ value: enriched.currentProfitUsd, text: formatCurrency(enriched.currentProfitUsd), className: enriched.currentProfitUsd >= 0 ? "metric-positive" : "metric-negative" })} / ${formatPercent(enriched.currentProfitPct)}`}</span></div>
          <div><strong>Objetivo</strong><span>${enriched.targetPct ? formatPercent(enriched.targetPct) : "Sin objetivo de challenge"}</span></div>
          <div><strong>DD diario</strong><span>${formatPercent(enriched.dailyDdPct)} / ${enriched.dailyLimitPct ? formatPercent(enriched.dailyLimitPct) : "—"}</span></div>
          <div><strong>DD máximo</strong><span>${formatPercent(enriched.maxDdPct)} / ${enriched.maxLimitPct ? formatPercent(enriched.maxLimitPct) : "—"}</span></div>
          <div><strong>Días</strong><span>${enriched.completedDaysVsRule}</span></div>
          <div><strong>Estado</strong><span>${enrichedStatus.label}</span></div>
          <div><strong>Reglas</strong><span>${escapeHtml(`${fundingRuleDisplayLabel(enriched)} · ${fundingRuleDisplayMeta(enriched)}`)}</span></div>
          ${adminView ? `<div><strong>Última sync</strong><span>${linked?.connection?.lastSync ? formatDateTime(linked.connection.lastSync) : "—"}</span></div>` : ""}
        </div>
      `
    });
  });

  root.addEventListener("change", (event) => {
    const field = event.target.closest("[data-funded-field]");
    if (!field) return;
    const fundedId = field.dataset.fundedId || root.dataset.selectedFundedId;
    if (!fundedId) return;
    const fieldName = field.dataset.fundedField;
    applyFundedFieldChange(store, fundedId, fieldName, field.value);
  });
}

export function renderFunded(root, state) {
  const fundedAccounts = enrichFundedAccounts(state);
  if (!fundedAccounts.length) {
    root.innerHTML = `
      <div class="funded-page-stack">
        ${pageHeaderMarkup({
          title: "Funding",
          description: "Aún no hay cuentas funded configuradas.",
          className: "tl-page-header",
          titleClassName: "tl-page-title",
          descriptionClassName: "tl-page-sub",
        })}
      </div>
    `;
    return;
  }

  const rankedFundedAccounts = [...fundedAccounts].sort(compareFundedRelevance);
  const selectedByCurrentAccount = fundedAccounts.find((item) => item.accountId === state.currentAccount || item.linkedAccountId === state.currentAccount);
  const savedSelection = fundedAccounts.find((item) => item.id === root.dataset.selectedFundedId);
  const prioritySelection = rankedFundedAccounts[0] || fundedAccounts[0];
  const isManualSelection = root.dataset.fundedSelectionMode === "manual";
  const currentCandidate = savedSelection || selectedByCurrentAccount || fundedAccounts[0];
  const selected = isManualSelection && savedSelection
    ? savedSelection
    : fundedDefaultSelectionScore(prioritySelection) > fundedDefaultSelectionScore(currentCandidate)
      ? prioritySelection
      : currentCandidate;
  root.dataset.selectedFundedId = selected.id;
  if (!isManualSelection) root.dataset.fundedSelectionMode = "auto";
  const authorityMeta = describeAccountAuthority(selected.linked || selectCurrentAccount(state), "derived");
  console.info("[KMFX][FUNDED_AUTHORITY]", {
    account_id: selected.linked?.id || "",
    login: selected.linked?.login || "",
    broker: selected.linked?.broker || "",
    payloadSource: authorityMeta.authority.payloadSource,
    tradeCount: authorityMeta.authority.tradeCount,
    sourceUsed: "derived_funded_progress",
  });

  const totalAccountSize = fundedAccounts.reduce((sum, account) => sum + Number(account.accountSize || 0), 0);
  const reviewCount = fundedAccounts.filter((account) => fundedReviewScore(account) > 0).length;
  const attentionAccount = [...fundedAccounts]
    .sort((a, b) => fundedReviewScore(b) - fundedReviewScore(a))[0];
  const hasAttentionAccount = attentionAccount && fundedReviewScore(attentionAccount) > 0;
  const attentionStatus = hasAttentionAccount ? fundedChallengeStatus(attentionAccount) : null;
  const challengeStatus = fundedChallengeStatus(selected);
  const daysStatus = tradingDaysStatus(selected);
  const selectedFundingTransactions = fundingTransactionsForJourney(
    state.workspace?.fundingTransactions,
    selected.fundingJourney?.id
  );
  const selectedFundingEconomics = deriveFundingEconomics(selectedFundingTransactions);
  const visibleJourneyIds = new Set(fundedAccounts.map((account) => account.fundingJourney?.id).filter(Boolean));
  const visibleFundingTransactions = (state.workspace?.fundingTransactions || []).filter((transaction) => (
    visibleJourneyIds.has(transaction?.journeyId)
  ));
  const visibleFundingEconomics = deriveFundingEconomics(visibleFundingTransactions);
  const fundingTransactions = Array.isArray(state.workspace?.fundingTransactions) ? state.workspace.fundingTransactions : [];
  const reviewAlerts = fundedReviewAlerts(selected, selectedFundingEconomics);
  const visibleReviewAlerts = reviewAlerts.slice(0, 3);
  const hiddenReviewAlertCount = Math.max(reviewAlerts.length - visibleReviewAlerts.length, 0);
  const reviewSubtitle = hasExplicitPhaseFailure(selected)
    ? "La fase figura como fallida por estado explícito o registro manual."
    : challengeStatus.dataTone === "risk"
      ? "Señales críticas calculadas; confirma reglas antes de decidir."
      : "Señales compactas de seguimiento.";
  const activePage = state.ui.activePage || "funded";
  const showChallenges = activePage === "funded";
  const showRules = activePage === "funded-rules";
  const showPayouts = activePage === "funded-payouts";
  const fundedTitle = showRules ? "Reglas de Funding" : showPayouts ? "Payouts" : "Funding";
  const fundedDescription = showRules
    ? "Buffers, límites y lectura de reglas para la cuenta fondeada seleccionada."
    : showPayouts
      ? "Economía del fondeo: costes, payouts, retiros y resultado neto."
      : "Seguimiento de cuentas fondeadas, progreso de fase y preservación de capital.";
  const fundedSubpageClass = showChallenges ? "" : ` kmfx-subpage-shell kmfx-subpage-shell--${activePage}`;
  const fundedSubpageAttr = showChallenges ? "" : ` data-kmfx-subpage="${activePage}"`;

  root.innerHTML = `
    <div class="funded-page-stack${fundedSubpageClass}"${fundedSubpageAttr}>
      ${pageHeaderMarkup({
        title: fundedTitle,
        description: fundedDescription,
        className: "tl-page-header",
        titleClassName: "tl-page-title",
        descriptionClassName: "tl-page-sub",
      })}

      ${showChallenges ? `
      <section class="funding-overview" aria-label="Resumen de funding">
        <article class="funding-kpi" data-tone="info">
          <span class="funding-kpi__label">Cuentas funded</span>
          <strong class="funding-kpi__value">${fundedAccounts.length}</strong>
          <span class="funding-kpi__meta">${reviewCount ? `${reviewCount} a revisar` : "Sin revisión"}</span>
        </article>
        <article class="funding-kpi">
          <span class="funding-kpi__label">Capital bajo seguimiento</span>
          <strong class="funding-kpi__value">${formatCurrency(totalAccountSize)}</strong>
          <span class="funding-kpi__meta">Tamaño total de cuentas</span>
        </article>
        <article class="funding-kpi" data-tone="${attentionStatus?.dataTone || "neutral"}">
          <span class="funding-kpi__label">Cuenta a revisar</span>
          <strong class="funding-kpi__value">${hasAttentionAccount ? escapeHtml(fundedChallengeDisplayName(attentionAccount)) : "Sin alertas"}</strong>
          <span class="funding-kpi__meta">${attentionStatus?.label || "Sin presión crítica visible"}</span>
        </article>
        ${fundingEconomicsKpiMarkup(visibleFundingEconomics)}
      </section>
      ` : ""}

      ${showRules ? fundingRulesSummaryMarkup(selected, selectedFundingEconomics, daysStatus, challengeStatus) : ""}
      ${showPayouts ? fundingPayoutsSummaryMarkup(selectedFundingEconomics, selectedFundingTransactions) : ""}

      ${showChallenges ? `
      <section class="tl-section-card funding-accounts-panel" aria-label="Cuentas de fondeo">
        <div class="funding-section-head">
          <div>
            <div class="tl-section-title">Cuentas de fondeo</div>
            <div class="tl-section-sub">Monitor principal por challenge, objetivo y margen de reglas.</div>
          </div>
        </div>
        <div class="funding-card-grid" aria-label="Cuentas de fondeo">
          ${rankedFundedAccounts.map((account) => {
            const status = fundedChallengeStatus(account);
            const accountFundingEconomics = deriveFundingEconomics(fundingTransactionsForJourney(
              fundingTransactions,
              account.fundingJourney?.id
            ));
            return `
              <button class="funding-challenge-card ${account.id === selected.id ? "is-active" : ""} ${isLiveFundedAccount(account) ? "" : "is-secondary"}" data-funded-select data-funded-id="${account.id}" data-tone="${status.dataTone}">
                <span class="funding-challenge-card__head">
                  <span class="funding-challenge-card__identity">
                    <strong>${escapeHtml(fundedChallengeDisplayName(account))}</strong>
                    <small>${escapeHtml(`${account.propFirm} · ${account.phase}`)}</small>
                    <em>${escapeHtml(fundedLinkedAccountShortMeta(account))}</em>
                  </span>
                  <span class="funding-card-badges">
                    ${fundingCardStatusMarkup(account)}
                    ${fundingAccountContextBadgeMarkup(account)}
                    ${requiresRuleVerification(account) ? `<span class="funding-rule-chip" data-tone="warning">${escapeHtml(fundingRuleDisplayLabel(account))}</span>` : ""}
                  </span>
                </span>
                ${fundingCardSummaryMarkup(account, accountFundingEconomics)}
                ${fundingAccountGaugesMarkup(account)}
              </button>
            `;
          }).join("")}
        </div>
      </section>
      ` : ""}

      ${showChallenges ? `
      <article class="tl-section-card funding-detail-panel" data-tone="${challengeStatus.dataTone}">
        <div class="funding-detail-header">
          <div>
            <div class="tl-section-title">Lectura del challenge</div>
            <div class="funding-detail-title">${escapeHtml(fundingInsightSummary(selected, selectedFundingEconomics))}</div>
            <div class="funding-detail-sub">${escapeHtml(selectedLinkedAccountMeta(selected))}</div>
            ${fundingJourneyMetaLine(selected) ? `<div class="funding-detail-sub">${escapeHtml(fundingJourneyMetaLine(selected))}</div>` : ""}
          </div>
          <div class="funding-detail-actions">
            ${badgeMarkup({ label: challengeStatus.label, tone: challengeStatus.tone }, "ui-badge--compact")}
            <button class="btn-secondary funded-detail-btn funding-edit-config-btn" data-funded-action="edit-config" data-funded-id="${selected.id}">Editar configuración</button>
            <button class="btn-secondary funded-detail-btn" data-funded-action="add-transaction" data-funded-id="${selected.id}">Añadir movimiento</button>
            <button class="btn-secondary funded-detail-btn" data-funded-action="view" data-funded-id="${selected.id}">Ver detalle</button>
          </div>
        </div>

        ${selected.accountSizeMismatch ? `
          <div class="funded-mismatch-note" role="status">
            <strong>Revisa el tamaño de cuenta configurado.</strong>
            <span>El tamaño configurado no coincide con el balance live recibido.</span>
          </div>
        ` : ""}

        <div class="funding-reading-grid">
          ${fundingRulesVisualMarkup(selected)}
          ${fundingCurrentStateMarkup(selected, selectedFundingEconomics, daysStatus)}
        </div>

        <div class="funding-economics-panel" aria-label="Economía del fondeo">
          <div class="funding-economics-head">
            <div>
              <div class="funding-detail-kicker">Economía del fondeo</div>
              <div class="funding-rule-note-line">Ledger manual separado del P&L de trading.</div>
            </div>
          </div>
          ${fundingEconomicsMarkup(selectedFundingEconomics)}
        </div>
      </article>
      ` : ""}

      ${showRules ? `
      <article class="tl-section-card funding-rules-command-panel" data-tone="${challengeStatus.dataTone}">
        <div class="funding-detail-header">
          <div>
            <div class="tl-section-title">Command center de reglas</div>
            <div class="funding-detail-title">Límites, fuente oficial y protocolo operativo.</div>
            <div class="funding-detail-sub">${escapeHtml(selectedLinkedAccountMeta(selected))}</div>
            ${fundingJourneyMetaLine(selected) ? `<div class="funding-detail-sub">${escapeHtml(fundingJourneyMetaLine(selected))}</div>` : ""}
          </div>
          <div class="funding-detail-actions">
            ${badgeMarkup({ label: challengeStatus.label, tone: challengeStatus.tone }, "ui-badge--compact")}
            <button class="btn-secondary funded-detail-btn funding-edit-config-btn" data-funded-action="edit-config" data-funded-id="${selected.id}">Editar configuración</button>
          </div>
        </div>
        <div class="funding-rules-command-layout">
          ${fundingRulesCommandDeckMarkup(selected, daysStatus, challengeStatus)}
          ${fundingRulesProtocolMarkup(selected, reviewAlerts)}
        </div>
      </article>
      ` : ""}

      ${showPayouts ? `
      <article class="tl-section-card funding-payout-ledger-panel" data-tone="${safeNumber(selectedFundingEconomics.netFundingResult || 0) < 0 ? "warning" : "profit"}">
        <div class="funding-detail-header">
          <div>
            <div class="tl-section-title">Ledger de payouts</div>
            <div class="funding-detail-title">Cashflow separado del P&L de trading.</div>
            <div class="funding-detail-sub">${escapeHtml(selectedLinkedAccountMeta(selected))}</div>
          </div>
          <div class="funding-detail-actions">
            <button class="btn-secondary funded-detail-btn" data-funded-action="add-transaction" data-funded-id="${selected.id}">Añadir movimiento</button>
            <button class="btn-secondary funded-detail-btn" data-funded-action="view" data-funded-id="${selected.id}">Ver detalle</button>
          </div>
        </div>
        <div class="funding-payout-ledger-grid">
          ${fundingPayoutCashflowMarkup(selectedFundingEconomics)}
          ${fundingPayoutReadinessMarkup(selected, selectedFundingEconomics, selectedFundingTransactions)}
          ${fundingLedgerRowsMarkup(selectedFundingTransactions)}
        </div>
      </article>
      ` : ""}

      ${showChallenges ? `
      <article class="tl-section-card funding-review-panel">
        <div class="funding-section-head">
          <div>
            <div class="tl-section-title">Revisión</div>
            <div class="tl-section-sub">${escapeHtml(reviewSubtitle)}</div>
          </div>
        </div>
        <div class="funding-review-list">
          ${visibleReviewAlerts.map((alert) => `
            <div class="funding-review-row" data-tone="${escapeHtml(alert.tone)}">
              <span class="funding-review-row__dot" aria-hidden="true"></span>
              <div>
                <strong>${escapeHtml(alert.title)}</strong>
                <span>${escapeHtml(alert.detail)}</span>
              </div>
            </div>
          `).join("")}
          ${hiddenReviewAlertCount ? `<div class="funding-review-more">+${hiddenReviewAlertCount} más en seguimiento</div>` : ""}
        </div>
      </article>
      ` : ""}
    </div>
  `;
}
