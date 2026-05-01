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
  if (dailyUsagePct >= 100) alerts.push({ tone: "error", title: "Límite diario superado", detail: `Uso ${Math.round(dailyUsagePct)}% del límite diario.` });
  else if (dailyUsagePct >= 80) alerts.push({ tone: "warn", title: "Drawdown diario cerca del límite", detail: `Uso ${Math.round(dailyUsagePct)}% del límite diario.` });
  if (maxUsagePct >= 100) alerts.push({ tone: "error", title: "Límite total superado", detail: `Uso ${Math.round(maxUsagePct)}% del límite total.` });
  else if (maxUsagePct >= 80) alerts.push({ tone: "warn", title: "Drawdown total bajo presión", detail: `Uso ${Math.round(maxUsagePct)}% del límite total.` });
  if (phase !== "Funded" && targetPct > 0) {
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

function challengeStateMeta(state) {
  if (state === "failed") return { label: "Fuera de regla", tone: "error" };
  if (state === "passed") return { label: "Objetivo superado", tone: "ok" };
  if (state === "on-track") return { label: "En progreso", tone: "info" };
  return { label: "A revisar", tone: "warn" };
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
  if (account.globalStatus === "DANGER" || account.challengeState === "failed") return 4;
  if (account.globalStatus === "WARNING") return 3;
  if (account.challengeState === "watch") return 2;
  if (account.alerts?.some((alert) => alert.tone === "warn" || alert.tone === "error")) return 1;
  return 0;
}

function fundedProgressLabel(account) {
  if (!account.targetUsd) return "Sin objetivo de fase";
  return `${Math.round(account.targetCompletionPct)}% del objetivo`;
}

function fundedProgressMeta(account) {
  if (!account.targetUsd) return "Preservación de capital";
  return `${formatCurrency(account.currentProfitUsd)} / ${formatCurrency(account.targetUsd)}`;
}

function fundedAlertBadge(alert) {
  if (alert.tone === "error") return { label: "Alta", tone: "error" };
  if (alert.tone === "warn") return { label: "Media", tone: "warn" };
  if (alert.tone === "ok") return { label: "OK", tone: "ok" };
  return { label: "Info", tone: alert.tone };
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
          <div><strong>Resultado actual</strong><span>${pnlTextMarkup({ value: enriched.currentProfitUsd, text: formatCurrency(enriched.currentProfitUsd), className: enriched.currentProfitUsd >= 0 ? "metric-positive" : "metric-negative" })} / ${formatPercent(enriched.currentProfitPct)}</span></div>
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

  const statusMeta = fundedStatusMeta(selected.globalStatus);
  const challengeMeta = challengeStateMeta(selected.challengeState);
  const modelOptions = availableModels(selected.propFirm);
  const appCurrency = state.workspace?.baseCurrency || state.preferences?.baseCurrency || "USD";
  const accountCurrency = selected.linked?.currency || selected.linked?.model?.account?.currency || appCurrency;
  const accountCurrencySymbol = currencySymbol(accountCurrency);
  const totalAccountSize = fundedAccounts.reduce((sum, account) => sum + Number(account.accountSize || 0), 0);
  const accountsToReview = fundedAccounts.filter((account) => fundedAttentionScore(account) > 0);
  const attentionAccount = [...fundedAccounts]
    .sort((a, b) => fundedAttentionScore(b) - fundedAttentionScore(a))[0];
  const hasAttentionAccount = attentionAccount && fundedAttentionScore(attentionAccount) > 0;
  const selectedProgressValue = selected.targetUsd ? `${Math.round(selected.targetCompletionPct)}%` : "Sin objetivo";
  const selectedProgressMeta = selected.targetUsd
    ? `${formatCurrency(selected.currentProfitUsd)} / ${formatCurrency(selected.targetUsd)}`
    : "Fase orientada a preservar capital";

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
          <div class="funding-kpi__label">Capital bajo seguimiento</div>
          <div class="funding-kpi__value">${formatCurrency(totalAccountSize)}</div>
          <div class="funding-kpi__meta">Tamaño total de cuentas</div>
        </article>
        <article class="funding-kpi" data-tone="${selected.targetUsd ? (selected.currentProfitUsd >= 0 ? "profit" : "loss") : "neutral"}">
          <div class="funding-kpi__label">Progreso seleccionado</div>
          <div class="funding-kpi__value">${selectedProgressValue}</div>
          <div class="funding-kpi__meta">${selectedProgressMeta}</div>
        </article>
        <article class="funding-kpi" data-tone="${hasAttentionAccount ? "warning" : "neutral"}">
          <div class="funding-kpi__label">Cuenta a revisar</div>
          <div class="funding-kpi__value">${hasAttentionAccount ? (attentionAccount.linked?.name || attentionAccount.label) : "Sin alertas"}</div>
          <div class="funding-kpi__meta">${hasAttentionAccount ? challengeStateMeta(attentionAccount.challengeState).label : "Sin presión crítica visible"}</div>
        </article>
        <article class="funding-kpi funding-kpi--note">
          <div class="funding-kpi__label">Costes y payouts</div>
          <div class="funding-kpi__value">Pendiente</div>
          <div class="funding-kpi__meta">Costes, payouts y recuperaciones pendientes de modelar.</div>
        </article>
      </section>

      <article class="tl-section-card funded-hero-card">
        <div class="funded-account-switch">
          ${fundedAccounts.map((account) => `
            <button class="funded-account-pill funding-challenge-card ${account.id === selected.id ? "is-active" : ""}" data-funded-select data-funded-id="${account.id}">
              <span class="funding-challenge-card__main">
                <span class="funding-challenge-card__name">${account.linked?.name || account.label}</span>
                <span class="funding-challenge-card__meta">${account.propFirm} · ${account.phase}</span>
                <span class="funding-challenge-card__meta">${escapeHtml(linkedAccountContextLabel(account))}</span>
              </span>
              <span class="funding-challenge-card__side">
                ${badgeMarkup(challengeStateMeta(account.challengeState), "ui-badge--compact")}
                <span class="funding-challenge-card__progress">${fundedProgressLabel(account)}</span>
              </span>
            </button>
          `).join("")}
        </div>

        <div class="funded-hero-grid">
          <div class="funded-hero-copy">
            <div class="banner-kicker">Estado del challenge</div>
            <div class="funded-hero-head">
              <div>
                <div class="banner-title">${selected.linked?.name || selected.label}</div>
                <div class="row-sub">${selected.propFirm} · ${selected.programModel} · ${selected.phase}</div>
                <div class="row-sub">${escapeHtml(linkedAccountContextLabel(selected))}</div>
              </div>
              ${badgeMarkup(statusMeta)}
            </div>

            <div class="account-banner-badges">
              ${badgeMarkup(getConnectionStatusMeta(selected.linked?.connection))}
              ${badgeMarkup(getFundedStatusMeta(selected.status, selected.linked?.compliance))}
              ${badgeMarkup(challengeMeta, "ui-badge--compact")}
            </div>

            <div class="funded-hero-kpis">
              <div class="metric-item"><div class="metric-label">Tamaño de cuenta</div><div class="metric-value">${formatCurrency(selected.accountSize)}</div></div>
              <div class="metric-item"><div class="metric-label">Balance</div><div class="metric-value">${formatCurrency(selected.balance)}</div></div>
              <div class="metric-item"><div class="metric-label">Equity</div><div class="metric-value">${formatCurrency(selected.equity)}</div></div>
              <div class="metric-item"><div class="metric-label">P&L abierto</div><div class="metric-value ${selected.openPnl >= 0 ? "metric-positive" : "metric-negative"}">${pnlTextMarkup({ value: selected.openPnl, text: formatCurrency(selected.openPnl), className: selected.openPnl >= 0 ? "metric-positive" : "metric-negative" })}</div></div>
              <div class="metric-item"><div class="metric-label">Resultado actual</div><div class="metric-value ${selected.currentProfitUsd >= 0 ? "metric-positive" : "metric-negative"}">${pnlTextMarkup({ value: selected.currentProfitUsd, text: formatCurrency(selected.currentProfitUsd), className: selected.currentProfitUsd >= 0 ? "metric-positive" : "metric-negative" })}</div></div>
            </div>
          </div>

          <div class="funded-hero-config">
            <div class="funded-config-header">
              <div>
                <div class="funded-config-title">Configuración de seguimiento</div>
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
              <button class="btn-primary funded-detail-btn" data-funded-action="view" data-funded-id="${selected.id}">Ver detalle</button>
            </div>
          </div>
        </div>
      </article>

      <article class="tl-section-card funded-progress-card">
        <div class="tl-section-header">
          <div>
            <div class="tl-section-title">Progreso frente al objetivo</div>
            <div class="tl-section-sub">Ancla principal del challenge: beneficio actual frente al objetivo de la fase.</div>
          </div>
          <div class="funded-progress-metric">${fundedProgressMeta(selected)}</div>
        </div>
        <div class="funded-progress-layout">
          <div class="funded-progress-main">
            <div class="funded-progress-value ${selected.currentProfitUsd >= 0 ? "metric-positive" : "metric-negative"}">${pnlTextMarkup({ value: selected.currentProfitUsd, text: selected.targetUsd ? `${formatCurrency(selected.currentProfitUsd)} / ${formatCurrency(selected.targetUsd)}` : formatCurrency(selected.currentProfitUsd), className: selected.currentProfitUsd >= 0 ? "metric-positive" : "metric-negative" })}</div>
            <div class="row-sub">${selected.targetUsd ? `${Math.round(selected.targetCompletionPct)}% completado. Pendiente: ${formatCurrency(selected.remainingUsd)}` : "Sin objetivo de beneficio en esta fase"}</div>
          </div>
          <div class="funded-progress-track">
            <div class="funded-progress-bar">
              <div class="funded-progress-fill ${progressFillClass(selected.targetCompletionPct)}" style="width:${selected.targetUsd ? selected.targetCompletionPct : 0}%"></div>
            </div>
            <div class="funded-progress-meta">
              <span>Resultado actual: ${pnlTextMarkup({ value: selected.currentProfitUsd, text: formatCurrency(selected.currentProfitUsd), className: selected.currentProfitUsd >= 0 ? "metric-positive" : "metric-negative" })}</span>
              <span>${selected.targetUsd ? `Objetivo: ${formatCurrency(selected.targetUsd)}` : "Objetivo no aplicable"}</span>
            </div>
          </div>
        </div>
      </article>

      <div class="grid-3 funded-rules-grid">
        <article class="tl-kpi-card funded-rule-card">
          <div class="tl-kpi-label">Drawdown diario</div>
          <div class="tl-kpi-val ${selected.dailyUsagePct >= 80 ? "red" : ""}">${formatPercent(selected.dailyDdPct)}</div>
          <div class="row-sub">${selected.dailyLimitPct ? `${Math.round(selected.dailyUsagePct)}% del límite ${formatPercent(selected.dailyLimitPct)}` : "Límite no configurado"}</div>
          <div class="funded-mini-track"><div class="funded-mini-fill ${progressFillClass(selected.dailyUsagePct)}" style="width:${clamp(selected.dailyUsagePct)}%"></div></div>
        </article>
        <article class="tl-kpi-card funded-rule-card">
          <div class="tl-kpi-label">Drawdown máximo</div>
          <div class="tl-kpi-val ${selected.maxUsagePct >= 80 ? "red" : ""}">${formatPercent(selected.maxDdPct)}</div>
          <div class="row-sub">${selected.maxLimitPct ? `${Math.round(selected.maxUsagePct)}% del límite ${formatPercent(selected.maxLimitPct)}` : "Límite no configurado"}</div>
          <div class="funded-mini-track"><div class="funded-mini-fill ${progressFillClass(selected.maxUsagePct)}" style="width:${clamp(selected.maxUsagePct)}%"></div></div>
        </article>
        <article class="tl-kpi-card funded-rule-card">
          <div class="tl-kpi-label">Días operados</div>
          <div class="tl-kpi-val">${selected.noMinimumDays ? "Libre" : selected.daysCompleted}</div>
          <div class="row-sub">${selected.completedDaysVsRule}</div>
          <div class="funded-days-note">${selected.noMinimumDays ? "Sin mínimo de días operados" : selected.requiredTradingDays ? `${Math.max(selected.requiredTradingDays - selected.daysCompleted, 0)} días por completar` : "Sin requisito de días"}</div>
        </article>
      </div>

      <div class="tl-kpi-row five funded-secondary-kpis">
        <article class="tl-kpi-card"><div class="tl-kpi-label">Acierto</div><div class="tl-kpi-val">${formatPercent(selected.winRate)}</div></article>
        <article class="tl-kpi-card"><div class="tl-kpi-label">R medio</div><div class="tl-kpi-val">${selected.avgRValue.toFixed(2)}R</div></article>
        <article class="tl-kpi-card"><div class="tl-kpi-label">Profit Factor</div><div class="tl-kpi-val">${selected.profitFactor.toFixed(2)}</div></article>
        <article class="tl-kpi-card"><div class="tl-kpi-label">P&L abierto</div><div class="tl-kpi-val ${selected.openPnl >= 0 ? "green" : "red"}">${formatCurrency(selected.openPnl)}</div></article>
        <article class="tl-kpi-card"><div class="tl-kpi-label">Días</div><div class="tl-kpi-val">${selected.noMinimumDays ? selected.daysCompleted : `${selected.daysCompleted}/${selected.requiredTradingDays || 0}`}</div></article>
      </div>

      <article class="tl-section-card funded-alerts-card">
        <div class="tl-section-header">
          <div>
            <div class="tl-section-title">Alertas y estado de cuenta</div>
            <div class="tl-section-sub">Señales de presión, progreso y reglas visibles en la muestra.</div>
          </div>
        </div>
        <div class="breakdown-list">
          ${selected.alerts.map((alert) => `
            <div class="list-row">
              <div>
                <div class="row-title">${alert.title}</div>
                <div class="row-sub">${alert.detail}</div>
              </div>
              ${badgeMarkup(fundedAlertBadge(alert), "ui-badge--compact")}
            </div>
          `).join("")}
        </div>
      </article>
    </div>
  `;
}
