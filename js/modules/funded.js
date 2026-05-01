import { openModal } from "./modal-system.js?v=build-20260406-213500";
import { describeAccountAuthority, formatCurrency, formatDateTime, formatPercent, renderAuthorityNotice, selectCurrentAccount } from "./utils.js?v=build-20260406-213500";
import { badgeMarkup, getConnectionStatusMeta, getFundedStatusMeta } from "./status-badges.js?v=build-20260406-213500";
import { pageHeaderMarkup, pnlTextMarkup } from "./ui-primitives.js?v=build-20260406-213500";
import { isAdminUserId } from "./auth-session.js?v=build-20260406-213500";

const FUNDED_PHASES = ["Challenge", "Verification", "Funded"];
const ORION_FUNDING_LINK = {
  login: "80571774",
  serverNeedle: "ogminternational",
};

const PROP_RULES = {
  FTMO: {
    verified: true,
    models: {
      "2-Step": {
        phases: {
          Challenge: { profitTargetPct: 10, dailyLossLimitPct: 5, maxLossLimitPct: 10, requiredTradingDays: 0 },
          Verification: { profitTargetPct: 5, dailyLossLimitPct: 5, maxLossLimitPct: 10, requiredTradingDays: 0 },
          Funded: { profitTargetPct: 0, dailyLossLimitPct: 5, maxLossLimitPct: 10, requiredTradingDays: 0 }
        }
      }
    }
  },
  FundingPips: {
    verified: true,
    models: {
      "Baseline": {
        phases: {
          Challenge: { profitTargetPct: null, dailyLossLimitPct: 5, maxLossLimitPct: 10, requiredTradingDays: 0 },
          Verification: { profitTargetPct: null, dailyLossLimitPct: 5, maxLossLimitPct: 10, requiredTradingDays: 0 },
          Funded: { profitTargetPct: 0, dailyLossLimitPct: 5, maxLossLimitPct: 10, requiredTradingDays: 0 }
        }
      }
    }
  },
  The5ers: {
    verified: true,
    models: {
      "High Stakes": {
        phases: {
          Challenge: { profitTargetPct: 10, dailyLossLimitPct: 5, maxLossLimitPct: 10, requiredTradingDays: 3 },
          Verification: { profitTargetPct: 5, dailyLossLimitPct: 5, maxLossLimitPct: 10, requiredTradingDays: 3 },
          Funded: { profitTargetPct: 0, dailyLossLimitPct: 5, maxLossLimitPct: 10, requiredTradingDays: 3 }
        }
      }
    }
  },
  FundedNext: {
    verified: true,
    models: {
      "Stellar 2-Step": {
        phases: {
          Challenge: { profitTargetPct: null, dailyLossLimitPct: 5, maxLossLimitPct: 10, requiredTradingDays: 0 },
          Verification: { profitTargetPct: null, dailyLossLimitPct: 5, maxLossLimitPct: 10, requiredTradingDays: 0 },
          Funded: { profitTargetPct: 0, dailyLossLimitPct: 5, maxLossLimitPct: 10, requiredTradingDays: 0, noMinimumDays: true }
        }
      }
    }
  },
  "Orion Funded": {
    verified: false,
    models: {
      Editable: {
        phases: {
          Challenge: { editable: true },
          Verification: { editable: true },
          Funded: { editable: true }
        }
      }
    }
  },
  "Wall Street Funded": {
    verified: false,
    models: {
      Editable: {
        phases: {
          Challenge: { editable: true },
          Verification: { editable: true },
          Funded: { editable: true }
        }
      }
    }
  },
  Apex: {
    verified: false,
    models: {
      "Legacy / Editable": {
        phases: {
          Challenge: { editable: true },
          Verification: { editable: true },
          Funded: { editable: true }
        }
      }
    }
  }
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

function selectedChallengeIdentity(account = {}) {
  const broker = account.linked ? accountBroker(account.linked) : account.propFirm;
  const server = account.linked ? accountServer(account.linked) : "";
  const venue = broker && server && normalizeText(broker) !== normalizeText(server)
    ? `${broker} / ${server}`
    : broker || server;
  const login = account.linked ? accountLogin(account.linked) : "";
  return [account.label, venue, login].filter(Boolean).join(" · ");
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

function normalizePhase(phase = "") {
  const normalized = String(phase || "").toLowerCase();
  if (normalized.includes("phase 1") || normalized.includes("challenge") || normalized.includes("step 1")) return "Challenge";
  if (normalized.includes("phase 2") || normalized.includes("verification") || normalized.includes("step 2")) return "Verification";
  if (normalized.includes("funded")) return "Funded";
  return "Challenge";
}

function inferProgramModel(account = {}) {
  if (account.programModel) return account.programModel;
  if (account.firm === "FTMO") return "2-Step";
  if (account.firm === "FundedNext") return "Stellar 2-Step";
  if (account.firm === "The5ers") return "High Stakes";
  if (account.firm === "Apex") return "Legacy / Editable";
  if (account.firm === "FundingPips") return "Baseline";
  return "Editable";
}

function availableModels(firm = "") {
  return Object.keys(PROP_RULES[firm]?.models || {});
}

function resolveRulePreset(propFirm, programModel, phase) {
  return PROP_RULES[propFirm]?.models?.[programModel]?.phases?.[phase] || null;
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
  const preset = resolveRulePreset(propFirm, programModel, phase);
  const balance = Number(linked?.model?.account?.balance || raw.balance || accountSize || 0);
  const equity = Number(linked?.model?.account?.equity || balance);
  const totalPnl = Number(linked?.model?.totals?.pnl || (balance - accountSize));
  const openPnl = Number(linked?.model?.account?.openPnl || 0);
  const currentProfitUsd = balance - accountSize;
  const currentProfitPct = accountSize ? (currentProfitUsd / accountSize) * 100 : 0;
  const accountSizeMismatch = hasAccountSizeMismatch({ linked, accountSize, balance, equity });
  const targetPct = Number(
    raw.targetPct ?? raw.profitTargetPct ?? preset?.profitTargetPct ?? 0
  ) || 0;
  const targetUsd = targetPct > 0 ? (accountSize * targetPct) / 100 : 0;
  const progressRatio = targetUsd > 0 ? clamp(currentProfitUsd / targetUsd, 0, 1) : (phase === "Funded" ? 1 : 0);
  const targetCompletionPct = progressRatio * 100;
  const remainingUsd = targetUsd > 0 ? Math.max(targetUsd - Math.max(currentProfitUsd, 0), 0) : 0;
  const dailyDdPct = Number(raw.dailyDdPct ?? linked?.model?.riskSummary?.dailyDrawdownPct ?? 0) || 0;
  const maxDdPct = Number(raw.maxDdPct ?? linked?.model?.totals?.drawdown?.maxPct ?? 0) || 0;
  const dailyLimitPct = Number(raw.dailyLossLimitPct ?? preset?.dailyLossLimitPct ?? linked?.model?.riskProfile?.dailyLossLimitPct ?? 0) || 0;
  const maxLimitPct = Number(raw.maxLossLimitPct ?? preset?.maxLossLimitPct ?? linked?.model?.account?.maxDrawdownLimit ?? 0) || 0;
  const dailyUsagePct = dailyLimitPct ? (dailyDdPct / dailyLimitPct) * 100 : 0;
  const maxUsagePct = maxLimitPct ? (maxDdPct / maxLimitPct) * 100 : 0;
  const daysCompleted = tradingDaysCompleted(linked?.model);
  const requiredTradingDays = Number(raw.requiredTradingDays ?? preset?.requiredTradingDays ?? 0) || 0;
  const noMinimumDays = Boolean(raw.noMinimumDays ?? preset?.noMinimumDays ?? false);
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

function progressFillClass(usage) {
  if (usage >= 100) return "danger";
  if (usage >= 80) return "warn";
  return "ok";
}

function ruleNote(account) {
  if (account.preset?.editable) return "Preset editable: reglas ajustables manualmente.";
  if (PROP_RULES[account.propFirm]?.verified) return `Preset verificado: ${account.propFirm} / ${account.programModel}`;
  return `Preset editable: ${account.propFirm}`;
}

function currencySymbol(code = "USD") {
  return code === "EUR" ? "€" : "$";
}

function fundedAttentionScore(account) {
  if (account.accountSizeMismatch) return 3;
  if (account.globalStatus === "DANGER" || account.challengeState === "failed") return 4;
  if (account.globalStatus === "WARNING") return 3;
  if (account.challengeState === "watch") return 2;
  if (account.alerts?.some((alert) => alert.tone === "warn" || alert.tone === "error")) return 1;
  return 0;
}

function fundedProgressLabel(account) {
  if (account.accountSizeMismatch) return "Revisar tamaño";
  if (!account.targetUsd) return "Sin objetivo de fase";
  return `${Math.round(account.targetCompletionPct)}% del objetivo`;
}

function fundedProgressMeta(account) {
  if (account.accountSizeMismatch) return "Tamaño incompatible con balance live";
  if (!account.targetUsd) return "Preservación de capital";
  return `${formatCurrency(account.currentProfitUsd)} / ${formatCurrency(account.targetUsd)}`;
}

function fundedDisplayStateMeta(account) {
  const status = fundedChallengeStatus(account);
  return { label: status.label, tone: status.tone };
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
  if (account.dailyLimitPct && account.dailyUsagePct >= 80) {
    alerts.push({
      tone: account.dailyUsagePct >= 100 ? "error" : "warn",
      title: "Margen diario reducido",
      detail: `${Math.round(account.dailyUsagePct)}% del límite diario usado.`,
      badge: "DD diario",
    });
  }
  if (account.maxLimitPct && account.maxUsagePct >= 80) {
    alerts.push({
      tone: account.maxUsagePct >= 100 ? "error" : "warn",
      title: "Margen máximo reducido",
      detail: `${Math.round(account.maxUsagePct)}% del límite máximo usado.`,
      badge: "DD máximo",
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

export function initFunded(store) {
  const root = document.getElementById("fundedRoot");
  if (!root) return;

  root.addEventListener("click", (event) => {
    const selectButton = event.target.closest("[data-funded-select]");
    if (selectButton) {
      root.dataset.selectedFundedId = selectButton.dataset.fundedId;
      renderFunded(root, store.getState());
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
    const value = field.value;

    if (fieldName === "propFirm") {
      updateFundedAccount(store, fundedId, (account) => {
        const nextModels = availableModels(value);
        const nextProgram = nextModels.includes(account.programModel) ? account.programModel : nextModels[0];
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

  const selectedByCurrentAccount = fundedAccounts.find((item) => item.accountId === state.currentAccount || item.linkedAccountId === state.currentAccount);
  const selected = fundedAccounts.find((item) => item.id === root.dataset.selectedFundedId)
    || selectedByCurrentAccount
    || fundedAccounts[0];
  root.dataset.selectedFundedId = selected.id;
  const authorityMeta = describeAccountAuthority(selected.linked || selectCurrentAccount(state), "derived");
  console.info("[KMFX][FUNDED_AUTHORITY]", {
    account_id: selected.linked?.id || "",
    login: selected.linked?.login || "",
    broker: selected.linked?.broker || "",
    payloadSource: authorityMeta.authority.payloadSource,
    tradeCount: authorityMeta.authority.tradeCount,
    sourceUsed: "derived_funded_progress",
  });

  const modelOptions = availableModels(selected.propFirm);
  const appCurrency = state.workspace?.baseCurrency || state.preferences?.baseCurrency || "USD";
  const accountCurrency = selected.linked?.currency || selected.linked?.model?.account?.currency || appCurrency;
  const accountCurrencySymbol = currencySymbol(accountCurrency);
  const totalAccountSize = fundedAccounts.reduce((sum, account) => sum + Number(account.accountSize || 0), 0);
  const accountsToReview = fundedAccounts.filter((account) => fundedAttentionScore(account) > 0);
  const attentionAccount = [...fundedAccounts]
    .sort((a, b) => fundedAttentionScore(b) - fundedAttentionScore(a))[0];
  const hasAttentionAccount = attentionAccount && fundedAttentionScore(attentionAccount) > 0;
  const challengeStatus = fundedChallengeStatus(selected);
  const daysStatus = tradingDaysStatus(selected);
  const reviewAlerts = fundedReviewAlerts(selected);
  const visibleReviewAlerts = reviewAlerts.slice(0, 3);
  const hiddenReviewAlertCount = Math.max(reviewAlerts.length - visibleReviewAlerts.length, 0);
  const dailyMargin = drawdownMarginPct(selected.dailyLimitPct, selected.dailyDdPct);
  const maxMargin = drawdownMarginPct(selected.maxLimitPct, selected.maxDdPct);

  root.innerHTML = `
    <div class="funded-page-stack">
      ${pageHeaderMarkup({
        title: "Funding",
        description: "Seguimiento de cuentas fondeadas, progreso de fase y preservación de capital.",
        className: "tl-page-header",
        titleClassName: "tl-page-title",
        descriptionClassName: "tl-page-sub",
      })}

      ${renderAuthorityNotice(authorityMeta)}

      <section class="funding-overview" aria-label="Resumen de funding">
        <article class="funding-kpi" data-tone="info">
          <div class="funding-kpi__label">Cuentas funded</div>
          <div class="funding-kpi__value">${fundedAccounts.length}</div>
          <div class="funding-kpi__meta">${accountsToReview.length ? `${accountsToReview.length} a revisar` : "Sin alertas críticas"}</div>
        </article>
        <article class="funding-kpi">
          <div class="funding-kpi__label">Capital seguimiento</div>
          <div class="funding-kpi__value">${formatCurrency(totalAccountSize)}</div>
          <div class="funding-kpi__meta">Tamaño total de cuentas</div>
        </article>
        <article class="funding-kpi" data-tone="${hasAttentionAccount ? "warning" : "neutral"}">
          <div class="funding-kpi__label">Cuenta a revisar</div>
          <div class="funding-kpi__value">${hasAttentionAccount ? escapeHtml(attentionAccount.linked?.name || attentionAccount.label) : "Sin alertas"}</div>
          <div class="funding-kpi__meta">${hasAttentionAccount ? fundedDisplayStateMeta(attentionAccount).label : "Sin presión crítica visible"}</div>
        </article>
        <article class="funding-kpi funding-kpi--note">
          <div class="funding-kpi__label">Costes pendientes</div>
          <div class="funding-kpi__value">Pendiente</div>
          <div class="funding-kpi__meta">Costes, payouts y recuperaciones pendientes de modelar.</div>
        </article>
      </section>

      ${fundedAccounts.length > 1 ? `
        <div class="funded-account-switch" aria-label="Seleccionar challenge funded">
          ${fundedAccounts.map((account) => `
            <button class="funded-account-pill funding-challenge-card ${account.id === selected.id ? "is-active" : ""}" data-funded-select data-funded-id="${account.id}">
              <span class="funding-challenge-card__main">
                <span class="funding-challenge-card__name">${escapeHtml(account.label)}</span>
                <span class="funding-challenge-card__meta">${escapeHtml(account.propFirm)} · ${escapeHtml(account.phase)}</span>
                <span class="funding-challenge-card__meta">${escapeHtml(linkedAccountContextLabel(account))}</span>
              </span>
              <span class="funding-challenge-card__side">
                ${badgeMarkup(fundedDisplayStateMeta(account), "ui-badge--compact")}
                <span class="funding-challenge-card__progress">${fundedProgressLabel(account)}</span>
              </span>
            </button>
          `).join("")}
        </div>
      ` : ""}

      <article class="tl-section-card funded-hero-card funding-selected-challenge" data-tone="${challengeStatus.dataTone}">
        <div class="funded-hero-grid">
          <div class="funded-hero-copy">
            <div class="funding-selected-challenge__header">
              <div>
                <div class="tl-section-title">Challenge seleccionado</div>
                <div class="funding-selected-challenge__identity">${escapeHtml(selectedChallengeIdentity(selected))}</div>
                <div class="funding-selected-challenge__meta">${escapeHtml(`${selected.propFirm} · ${selected.programModel} · ${selected.phase}`)}</div>
              </div>
              ${badgeMarkup({ label: challengeStatus.label, tone: challengeStatus.tone }, "ui-badge--compact")}
            </div>

            ${selected.accountSizeMismatch ? `
              <div class="funded-mismatch-note" role="status">
                <strong>Revisa el tamaño de cuenta configurado.</strong>
                <span>El tamaño configurado no coincide con el balance live recibido.</span>
              </div>
            ` : ""}

            <div class="funding-selected-challenge__stats">
              <div><span>Estado</span><strong>${escapeHtml(challengeStatus.label)}</strong></div>
              <div><span>Tamaño</span><strong>${formatCurrency(selected.accountSize)}</strong></div>
              <div><span>Balance</span><strong>${formatCurrency(selected.balance)}</strong></div>
              <div><span>Equity</span><strong>${formatCurrency(selected.equity)}</strong></div>
              <div><span>Resultado</span><strong>${fundedResultMarkup(selected)}</strong></div>
            </div>
          </div>

          <div class="funded-hero-config">
            <div class="funded-config-header">
              <div>
                <div class="funded-config-title">Configuración</div>
                <div class="funded-config-sub">Ajustes de fase y reglas del challenge.</div>
              </div>
            </div>
            <div class="funded-config-grid">
              <label class="form-stack">
                <span>Firma</span>
                <div class="funded-select-wrap">
                  <select data-funded-field="propFirm" data-funded-id="${selected.id}">
                    ${Object.keys(PROP_RULES).map((firm) => `<option value="${firm}" ${firm === selected.propFirm ? "selected" : ""}>${firm}</option>`).join("")}
                  </select>
                  <span class="funded-select-chevron" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M6 9l6 6 6-6" stroke="#636366" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                  </span>
                </div>
              </label>
              <label class="form-stack">
                <span>Modelo</span>
                <div class="funded-select-wrap">
                  <select data-funded-field="programModel" data-funded-id="${selected.id}">
                    ${modelOptions.map((model) => `<option value="${model}" ${model === selected.programModel ? "selected" : ""}>${model}</option>`).join("")}
                  </select>
                  <span class="funded-select-chevron" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M6 9l6 6 6-6" stroke="#636366" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                  </span>
                </div>
              </label>
              <label class="form-stack">
                <span>Fase</span>
                <div class="funded-select-wrap">
                  <select data-funded-field="phase" data-funded-id="${selected.id}">
                    ${FUNDED_PHASES.map((phase) => `<option value="${phase}" ${phase === selected.phase ? "selected" : ""}>${phase}</option>`).join("")}
                  </select>
                  <span class="funded-select-chevron" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M6 9l6 6 6-6" stroke="#636366" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                  </span>
                </div>
              </label>
              <label class="form-stack">
                <span>Tamaño de cuenta</span>
                <div class="funded-size-wrap">
                  <span class="funded-size-prefix">${accountCurrencySymbol}</span>
                  <input class="funded-size-input" type="number" min="0" step="1000" value="${selected.accountSize}" data-funded-field="accountSize" data-funded-id="${selected.id}">
                </div>
              </label>
            </div>
            <div class="goal-card-sub funded-preset-note">
              <svg class="funded-preset-note-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"></circle>
                <path d="M12 10v6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
                <circle cx="12" cy="7.2" r="1" fill="currentColor"></circle>
              </svg>
              <span>${ruleNote(selected)}</span>
            </div>
            <div class="funded-config-actions">
              <button class="btn-secondary funded-detail-btn" data-funded-action="view" data-funded-id="${selected.id}">Ver detalle</button>
            </div>
          </div>
        </div>
      </article>

      <section class="funding-challenge-board" aria-label="Progreso y revisión del challenge">
        <article class="tl-section-card funding-limits-panel">
          <div class="funding-section-head">
            <div>
              <div class="tl-section-title">Progreso y límites</div>
              <div class="tl-section-sub">${escapeHtml(challengeStatus.detail)}</div>
            </div>
          </div>
          <div class="funding-limit-grid">
            <article class="funding-limit-card" data-tone="${selected.accountSizeMismatch ? "warning" : selected.targetCompletionPct >= 100 ? "profit" : selected.currentProfitUsd < 0 ? "warning" : "neutral"}">
              <div class="funding-limit-card__label">Progreso fase</div>
              <div class="funding-limit-card__value">${selected.accountSizeMismatch ? "Revisar" : selected.targetUsd ? `${Math.round(selected.targetCompletionPct)}%` : "Sin objetivo"}</div>
              <div class="funding-limit-card__meta">${selected.accountSizeMismatch ? "Tamaño de cuenta pendiente" : fundedProgressMeta(selected)}</div>
              <div class="funding-progress-rail" aria-hidden="true">
                <div class="funding-progress-rail__fill ${selected.accountSizeMismatch ? "warn" : progressFillClass(selected.targetCompletionPct)}" style="width:${selected.accountSizeMismatch ? 0 : selected.targetUsd ? selected.targetCompletionPct : 0}%"></div>
              </div>
            </article>
            <article class="funding-limit-card" data-tone="${drawdownTone(selected.dailyUsagePct, selected.dailyLimitPct)}">
              <div class="funding-limit-card__label">DD diario</div>
              <div class="funding-limit-card__value">${Math.round(selected.dailyUsagePct)}% usado</div>
              <div class="funding-limit-card__meta">Margen ${dailyMargin == null ? "—" : formatPercent(dailyMargin)} · límite ${formatRuleValue(selected.dailyLimitPct)}</div>
              <div class="funding-progress-rail" aria-hidden="true">
                <div class="funding-progress-rail__fill ${progressFillClass(selected.dailyUsagePct)}" style="width:${clamp(selected.dailyUsagePct)}%"></div>
              </div>
            </article>
            <article class="funding-limit-card" data-tone="${drawdownTone(selected.maxUsagePct, selected.maxLimitPct)}">
              <div class="funding-limit-card__label">DD máximo</div>
              <div class="funding-limit-card__value">${Math.round(selected.maxUsagePct)}% usado</div>
              <div class="funding-limit-card__meta">Margen ${maxMargin == null ? "—" : formatPercent(maxMargin)} · límite ${formatRuleValue(selected.maxLimitPct)}</div>
              <div class="funding-progress-rail" aria-hidden="true">
                <div class="funding-progress-rail__fill ${progressFillClass(selected.maxUsagePct)}" style="width:${clamp(selected.maxUsagePct)}%"></div>
              </div>
            </article>
            <article class="funding-limit-card" data-tone="${daysStatus.tone}">
              <div class="funding-limit-card__label">Días operados</div>
              <div class="funding-limit-card__value">${selected.requiredTradingDays ? `${selected.daysCompleted}/${selected.requiredTradingDays}` : selected.daysCompleted}</div>
              <div class="funding-limit-card__meta">${escapeHtml(daysStatus.remaining)}</div>
              <div class="funding-limit-card__status">${escapeHtml(daysStatus.label)}</div>
            </article>
          </div>
        </article>

        <article class="tl-section-card funding-review-panel">
          <div class="funding-section-head">
            <div>
              <div class="tl-section-title">Revisión</div>
              <div class="tl-section-sub">Señales que requieren una lectura antes de interpretar el challenge.</div>
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
      </section>
    </div>
  `;
}
