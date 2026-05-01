import { openModal } from "./modal-system.js?v=build-20260406-213500";
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

const ORION_FUNDING_LINK = {
  login: "80571774",
  serverNeedle: "ogminternational",
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
        programModel: nextProgram
      };
    });
    return;
  }

  if (fieldName === "programModel") {
    updateFundedAccount(store, fundedId, (account) => ({ ...account, programModel: value }));
    return;
  }

  if (fieldName === "phase") {
    updateFundedAccount(store, fundedId, (account) => ({ ...account, phase: value }));
    return;
  }

  if (fieldName === "accountSize") {
    const size = Number(value || 0);
    updateFundedAccount(store, fundedId, (account) => ({ ...account, accountSize: size, size }));
  }
}

function normalizePhase(phase = "") {
  return normalizeFundingPhase(phase);
}

function inferProgramModel(account = {}) {
  return inferFundingProgramModel(account);
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

function avgR(trades = []) {
  if (!trades.length) return 0;
  return trades.reduce((sum, trade) => sum + Number(trade.rMultiple || 0), 0) / trades.length;
}

function tradingDaysCompleted(model) {
  return Array.isArray(model?.dailyReturns) ? model.dailyReturns.length : 0;
}

function deriveFundedAccount(raw, linked, linkContext = {}) {
  const propFirm = raw.propFirm || raw.firm || "FTMO";
  const programModel = raw.programModel || inferProgramModel(raw);
  const phase = normalizePhase(raw.phase);
  const accountSize = Number(raw.accountSize || raw.size || linked?.model?.account?.balance || 0);
  const preset = resolveRulePreset(propFirm, programModel, phase, accountSize);
  const canUsePresetValues = Boolean(preset?.verified && !preset?.requiresReview && !preset?.editable && !preset?.legacy);
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
      ? "failed"
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
    rulesVerified: canUsePresetValues,
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

function fundingRuleModeLabel(value = "") {
  const labels = {
    static: "Estático",
    trailing: "Trailing",
    relative: "Relativo",
    daily_balance: "Balance diario",
    daily_equity: "Equity diaria",
    daily_balance_or_equity: "Balance/equity diario",
    initial_balance: "Balance inicial",
    current_balance: "Balance actual",
    equity_peak: "Pico de equity",
    trailing_high_watermark: "High watermark",
    server_time: "Hora servidor",
    local_time: "Hora local",
    unknown: "Por verificar",
  };
  return labels[value] || String(value || "Por verificar");
}

function fundedAttentionScore(account) {
  if (account.accountSizeMismatch) return 3;
  if (account.globalStatus === "DANGER" || account.challengeState === "failed") return 4;
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
  if (account.accountSizeMismatch) {
    return {
      label: "Revisa configuración",
      tone: "warn",
      dataTone: "warning",
      detail: "El tamaño de cuenta configurado no coincide con el capital live recibido.",
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
  if (account.dailyUsagePct >= 100 || account.maxUsagePct >= 100 || account.globalStatus === "DANGER" || account.challengeState === "failed") {
    return {
      label: "En riesgo",
      tone: "error",
      dataTone: "risk",
      detail: "El challenge requiere revisión por presión de drawdown o reglas.",
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
      tone: "warn",
      dataTone: "warning",
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
  return Number(value) ? formatPercent(value) : "—";
}

function drawdownMarginPct(limitPct, usedPct) {
  if (!Number(limitPct)) return null;
  return Math.max(Number(limitPct) - Number(usedPct || 0), 0);
}

function drawdownTone(usagePct, limitPct) {
  if (!Number(limitPct)) return "neutral";
  if (usagePct >= 100) return "risk";
  if (usagePct >= 80) return "warning";
  return "profit";
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

function drawdownCombinedTone(account = {}) {
  if (account.dailyUsagePct >= 100 || account.maxUsagePct >= 100) return "risk";
  if (account.dailyUsagePct >= 80 || account.maxUsagePct >= 80) return "warning";
  if (account.dailyLimitPct || account.maxLimitPct) return "profit";
  return "neutral";
}

function targetProgressTone(account = {}) {
  if (account.accountSizeMismatch) return "warning";
  if (!account.targetUsd) return "neutral";
  if (account.targetCompletionPct >= 100) return "profit";
  if (account.currentProfitUsd > 0) return "profit";
  return "neutral";
}

function daysProgressPct(account = {}) {
  if (!account.requiredTradingDays) return 0;
  return clamp((Number(account.daysCompleted || 0) / Number(account.requiredTradingDays)) * 100);
}

function daysProgressTone(account = {}) {
  if (!account.requiredTradingDays || account.noMinimumDays) return "neutral";
  return account.daysCompleted >= account.requiredTradingDays ? "profit" : "warning";
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
  const label = status.label === "Sin objetivo definido"
    ? "Sin objetivo"
    : status.label === "Revisa configuración"
      ? "Configuración"
      : status.label;
  return `
    <span class="funding-status-chip" data-tone="${escapeHtml(status.dataTone)}" title="${escapeHtml(status.label)}" aria-label="${escapeHtml(status.label)}">
      <span class="funding-status-chip__dot" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function fundingRuleStatusMarkup(account = {}) {
  if (!account.ruleStatus?.label) return "";
  const tone = account.ruleStatus.tone === "ok" ? "profit" : account.ruleStatus.tone === "warning" ? "warning" : "neutral";
  return `
    <span class="funding-rule-chip" data-tone="${escapeHtml(tone)}" title="${escapeHtml(ruleNote(account))}">
      ${escapeHtml(account.ruleStatus.label)}
    </span>
  `;
}

function fundingAccountGaugesMarkup(account = {}) {
  const dailyMargin = drawdownMarginPct(account.dailyLimitPct, account.dailyDdPct);
  const maxMargin = drawdownMarginPct(account.maxLimitPct, account.maxDdPct);
  const daysStatus = tradingDaysStatus(account);
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
        primary: account.dailyLimitPct ? `${Math.round(account.dailyUsagePct)}% usado` : "Sin límite",
        meta: account.dailyLimitPct
          ? `Margen ${dailyMargin == null ? "—" : formatPercent(dailyMargin)} · límite ${formatRuleValue(account.dailyLimitPct)}`
          : "Sin regla configurada",
      })}
      ${fundingGaugeMarkup({
        label: "DD máximo",
        value: account.maxLimitPct ? account.maxUsagePct : 0,
        tone: drawdownTone(account.maxUsagePct, account.maxLimitPct),
        primary: account.maxLimitPct ? `${Math.round(account.maxUsagePct)}% usado` : "Sin límite",
        meta: account.maxLimitPct
          ? `Margen ${maxMargin == null ? "—" : formatPercent(maxMargin)} · límite ${formatRuleValue(account.maxLimitPct)}`
          : "Sin regla configurada",
      })}
      ${fundingGaugeMarkup({
        label: "Días",
        value: account.requiredTradingDays ? daysProgressPct(account) : 0,
        tone: daysProgressTone(account),
        primary: account.requiredTradingDays ? `${account.daysCompleted}/${account.requiredTradingDays}` : "Sin mínimo",
        meta: account.requiredTradingDays ? daysStatus.remaining : `${account.daysCompleted} días operados`,
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

function fundedReviewAlerts(account) {
  const alerts = [];
  if (account.dailyLimitPct && account.dailyUsagePct >= 80) {
    alerts.push({
      tone: account.dailyUsagePct >= 100 ? "error" : "warn",
      title: account.dailyUsagePct >= 100 ? "Límite diario agotado" : "Margen diario reducido",
      detail: `${Math.round(account.dailyUsagePct)}% del límite diario usado.`,
      badge: "DD diario",
    });
  }
  if (account.maxLimitPct && account.maxUsagePct >= 80) {
    alerts.push({
      tone: account.maxUsagePct >= 100 ? "error" : "warn",
      title: account.maxUsagePct >= 100 ? "Límite máximo agotado" : "Margen máximo reducido",
      detail: `${Math.round(account.maxUsagePct)}% del límite máximo usado.`,
      badge: "DD máximo",
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
  alerts.push({
    tone: "neutral",
    title: "Costes y payouts pendientes",
    detail: "Costes, payouts y recuperaciones todavía no están modelados.",
    badge: "Info",
  });
  return alerts;
}

function openFundedConfigModal(store, account, accountCurrencySymbol = "$") {
  const firmOptions = availableFirms(account.propFirm);
  const modelOptions = availableModels(account.propFirm, account.programModel);
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
          <span>${ruleNote(account)}</span>
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
      const account = currentState.workspace.fundedAccounts.find((item) => item.id === configButton.dataset.fundedId);
      if (!account) return;
      const linkContext = resolveFundedAccountLink(account, currentState);
      const enriched = deriveFundedAccount(account, linkContext.linked, linkContext);
      const appCurrency = currentState.workspace?.baseCurrency || currentState.preferences?.baseCurrency || "USD";
      const accountCurrency = enriched.linked?.currency || enriched.linked?.model?.account?.currency || appCurrency;
      openFundedConfigModal(store, enriched, currencySymbol(accountCurrency));
      return;
    }

    const detailButton = event.target.closest("[data-funded-action='view']");
    if (!detailButton) return;
    const account = store.getState().workspace.fundedAccounts.find((item) => item.id === detailButton.dataset.fundedId);
    if (!account) return;
    const linkContext = resolveFundedAccountLink(account, store.getState());
    const linked = linkContext.linked;
    const enriched = deriveFundedAccount(account, linked, linkContext);
    const enrichedStatus = fundedStatusMeta(enriched.globalStatus);
    const adminView = store.getState().auth?.user?.role === "admin";

    openModal({
      title: `${enriched.propFirm} · ${linked?.name || account.label}`,
      subtitle: "Detalle de seguimiento funding",
      maxWidth: 620,
      content: `
        <div class="info-list compact">
          <div><strong>Cuenta</strong><span>${linked?.name || "Sin vincular"}</span></div>
          <div><strong>Cuenta live</strong><span>${escapeHtml(linkedAccountContextLabel(enriched))}</span></div>
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
          <div><strong>Preset</strong><span>${ruleNote(enriched)}</span></div>
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
  const fundedAccounts = state.workspace.fundedAccounts.map((account) => {
    const linkContext = resolveFundedAccountLink(account, state);
    return deriveFundedAccount(account, linkContext.linked, linkContext);
  });
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
  const reviewAlerts = fundedReviewAlerts(selected);
  const visibleReviewAlerts = reviewAlerts.slice(0, 3);
  const hiddenReviewAlertCount = Math.max(reviewAlerts.length - visibleReviewAlerts.length, 0);

  root.innerHTML = `
    <div class="funded-page-stack">
      ${pageHeaderMarkup({
        title: "Funding",
        description: "Seguimiento de cuentas fondeadas, progreso de fase y preservación de capital.",
        className: "tl-page-header",
        titleClassName: "tl-page-title",
        descriptionClassName: "tl-page-sub",
      })}

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
        <article class="funding-kpi funding-kpi--muted">
          <span class="funding-kpi__label">Costes pendientes</span>
          <strong class="funding-kpi__value">Pendiente</strong>
          <span class="funding-kpi__meta">Costes/payouts no modelados</span>
        </article>
      </section>

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
            return `
              <button class="funding-challenge-card ${account.id === selected.id ? "is-active" : ""}" data-funded-select data-funded-id="${account.id}" data-tone="${status.dataTone}">
                <span class="funding-challenge-card__head">
                  <span class="funding-challenge-card__identity">
                    <strong>${escapeHtml(fundedChallengeDisplayName(account))}</strong>
                    <small>${escapeHtml(fundedLinkedAccountShortMeta(account))}</small>
                  </span>
                  ${fundingCardStatusMarkup(account)}
                </span>
                <span class="funding-challenge-card__meta">
                  <span><small>Firma</small><strong>${escapeHtml(account.propFirm)}</strong></span>
                  <span><small>Modelo</small><strong>${escapeHtml(account.programModel)}</strong></span>
                  <span><small>Fase</small><strong>${escapeHtml(account.phase)}</strong></span>
                  <span><small>Tamaño</small><strong>${formatCurrency(account.accountSize)}</strong></span>
                </span>
                <span class="funding-challenge-card__snapshot">
                  <span><small>Resultado</small><strong>${fundedResultMarkup(account)}</strong></span>
                  <span><small>Objetivo</small><strong>${account.targetUsd ? formatCurrency(account.targetUsd) : "Sin objetivo"}</strong></span>
                  <span><small>Equity</small><strong>${formatCurrency(account.equity)}</strong></span>
                  ${fundingRuleStatusMarkup(account)}
                </span>
                ${fundingAccountGaugesMarkup(account)}
              </button>
            `;
          }).join("")}
        </div>
      </section>

      <article class="tl-section-card funding-detail-panel" data-tone="${challengeStatus.dataTone}">
        <div class="funding-detail-header">
          <div>
            <div class="tl-section-title">Detalle del challenge</div>
            <div class="funding-detail-title">${escapeHtml(fundedChallengeDisplayName(selected))}</div>
            <div class="funding-detail-sub">${escapeHtml(selectedLinkedAccountMeta(selected))}</div>
          </div>
          <div class="funding-detail-actions">
            ${badgeMarkup({ label: challengeStatus.label, tone: challengeStatus.tone }, "ui-badge--compact")}
            <button class="btn-secondary funded-detail-btn funding-edit-config-btn" data-funded-action="edit-config" data-funded-id="${selected.id}">Editar configuración</button>
            <button class="btn-secondary funded-detail-btn" data-funded-action="view" data-funded-id="${selected.id}">Ver detalle</button>
          </div>
        </div>

        ${selected.accountSizeMismatch ? `
          <div class="funded-mismatch-note" role="status">
            <strong>Revisa el tamaño de cuenta configurado.</strong>
            <span>El tamaño configurado no coincide con el balance live recibido.</span>
          </div>
        ` : ""}

        <div class="funding-detail-grid">
          <div class="funding-detail-block">
            <div class="funding-detail-kicker">Reglas aplicadas</div>
            <div class="funding-detail-metrics funding-detail-metrics--rules">
              <div><span>Preset</span><strong>${escapeHtml(selected.ruleStatus?.label || "Sin preset")}</strong></div>
              <div><span>Objetivo</span><strong>${selected.targetPct ? formatPercent(selected.targetPct) : "Sin objetivo"}</strong></div>
              <div><span>DD diario</span><strong>${formatRuleValue(selected.dailyLimitPct)}</strong></div>
              <div><span>DD máximo</span><strong>${formatRuleValue(selected.maxLimitPct)}</strong></div>
              <div><span>Tipo DD</span><strong>${escapeHtml(fundingRuleModeLabel(selected.preset?.drawdownType))}</strong></div>
              <div><span>Base máxima</span><strong>${escapeHtml(fundingRuleModeLabel(selected.preset?.maxLossBasis))}</strong></div>
            </div>
            <div class="funding-rule-note-line">${escapeHtml(ruleNote(selected))}</div>
          </div>
          <div class="funding-detail-block">
            <div class="funding-detail-kicker">Lectura seleccionada</div>
            <div class="funding-detail-metrics">
              <div><span>Resultado</span><strong>${fundedResultMarkup(selected)}</strong></div>
              <div><span>Pendiente</span><strong>${selected.accountSizeMismatch ? "Revisar config" : selected.targetUsd ? formatCurrency(selected.remainingUsd) : "No aplica"}</strong></div>
              <div><span>Equity</span><strong>${formatCurrency(selected.equity)}</strong></div>
              <div><span>Días</span><strong>${selected.requiredTradingDays ? `${selected.daysCompleted}/${selected.requiredTradingDays}` : selected.daysCompleted}</strong></div>
            </div>
            <div class="funding-rule-note-line">${escapeHtml(daysStatus.label)} · ${escapeHtml(selectedLinkedAccountMeta(selected))}</div>
          </div>
        </div>
      </article>

      <article class="tl-section-card funding-review-panel">
        <div class="funding-section-head">
          <div>
            <div class="tl-section-title">Revisión</div>
            <div class="tl-section-sub">Máximo tres señales para revisar antes de actuar.</div>
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
    </div>
  `;
}
