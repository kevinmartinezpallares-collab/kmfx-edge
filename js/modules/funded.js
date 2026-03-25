import { openModal } from "./modal-system.js";
import { formatCurrency, formatDateTime, formatPercent } from "./utils.js";
import { badgeMarkup, getConnectionStatusMeta, getFundedStatusMeta } from "./status-badges.js";

const FUNDED_PHASES = ["Challenge", "Verification", "Funded"];

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

function deriveFundedAccount(raw, linked) {
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
  const targetCompletionPct = targetPct > 0 ? clamp((currentProfitPct / targetPct) * 100, 0, 100) : (phase === "Funded" ? 100 : 0);
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
    ? "No minimum trading days"
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
  if (dailyUsagePct >= 100) alerts.push({ tone: "error", title: "Daily DD breached", detail: `Uso ${Math.round(dailyUsagePct)}% del límite diario.` });
  else if (dailyUsagePct >= 80) alerts.push({ tone: "warn", title: "Daily DD near limit", detail: `Uso ${Math.round(dailyUsagePct)}% del límite diario.` });
  if (maxUsagePct >= 100) alerts.push({ tone: "error", title: "Max DD breached", detail: `Uso ${Math.round(maxUsagePct)}% del límite total.` });
  else if (maxUsagePct >= 80) alerts.push({ tone: "warn", title: "Max DD under pressure", detail: `Uso ${Math.round(maxUsagePct)}% del límite total.` });
  if (phase !== "Funded" && targetPct > 0) {
    if (currentProfitPct >= targetPct) alerts.push({ tone: "ok", title: "Target reached", detail: `Objetivo ${formatPercent(targetPct)} conseguido.` });
    else alerts.push({ tone: "info", title: "Challenge progress", detail: `${formatPercent(currentProfitPct)} / ${formatPercent(targetPct)} objetivo.` });
  }
  if (noMinimumDays) {
    alerts.push({ tone: "neutral", title: "Trading days", detail: "No minimum trading days for this phase." });
  } else if (requiredTradingDays) {
    alerts.push({ tone: daysCompleted >= requiredTradingDays ? "ok" : "info", title: "Trading days", detail: completedDaysVsRule });
  }

  return {
    ...raw,
    linked,
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
    targetCompletionPct,
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
  if (status === "DANGER") return { label: "DANGER", tone: "error" };
  if (status === "WARNING") return { label: "WARNING", tone: "warn" };
  return { label: "SAFE", tone: "ok" };
}

function challengeStateMeta(state) {
  if (state === "failed") return { label: "Failed", tone: "error" };
  if (state === "passed") return { label: "Passed", tone: "ok" };
  if (state === "on-track") return { label: "On track", tone: "info" };
  return { label: "Watch", tone: "warn" };
}

function progressFillClass(usage) {
  if (usage >= 100) return "danger";
  if (usage >= 80) return "warn";
  return "ok";
}

function ruleNote(account) {
  if (account.preset?.editable) return "Preset editable: revisa y ajusta reglas manualmente.";
  if (PROP_RULES[account.propFirm]?.verified) return `Preset verificado · ${account.propFirm} / ${account.programModel}`;
  return `Preset editable · ${account.propFirm}`;
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
    const linked = store.getState().accounts[account.accountId];
    const enriched = deriveFundedAccount(account, linked);

    openModal({
      title: `${enriched.propFirm} · ${linked?.name || account.label}`,
      subtitle: "Detalle de seguimiento funded",
      maxWidth: 620,
      content: `
        <div class="info-list compact">
          <div><strong>Cuenta</strong><span>${linked?.name || "Sin vincular"}</span></div>
          <div><strong>Firma</strong><span>${enriched.propFirm}</span></div>
          <div><strong>Modelo</strong><span>${enriched.programModel}</span></div>
          <div><strong>Fase</strong><span>${enriched.phase}</span></div>
          <div><strong>Tamaño</strong><span>${formatCurrency(enriched.accountSize)}</span></div>
          <div><strong>Profit actual</strong><span>${formatCurrency(enriched.currentProfitUsd)} / ${formatPercent(enriched.currentProfitPct)}</span></div>
          <div><strong>Objetivo</strong><span>${enriched.targetPct ? formatPercent(enriched.targetPct) : "Sin objetivo de challenge"}</span></div>
          <div><strong>Daily DD</strong><span>${formatPercent(enriched.dailyDdPct)} / ${enriched.dailyLimitPct ? formatPercent(enriched.dailyLimitPct) : "—"}</span></div>
          <div><strong>Max DD</strong><span>${formatPercent(enriched.maxDdPct)} / ${enriched.maxLimitPct ? formatPercent(enriched.maxLimitPct) : "—"}</span></div>
          <div><strong>Días</strong><span>${enriched.completedDaysVsRule}</span></div>
          <div><strong>Estado</strong><span>${enriched.globalStatus}</span></div>
          <div><strong>Preset</strong><span>${ruleNote(enriched)}</span></div>
          <div><strong>Última sync</strong><span>${linked?.connection?.lastSync ? formatDateTime(linked.connection.lastSync) : "—"}</span></div>
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
  const fundedAccounts = state.workspace.fundedAccounts.map((account) => deriveFundedAccount(account, state.accounts[account.accountId]));
  if (!fundedAccounts.length) {
    root.innerHTML = `
      <div class="funded-page-stack">
        <div class="tl-page-header">
          <div class="tl-page-title">Funded</div>
          <div class="tl-page-sub">Aún no hay cuentas funded configuradas.</div>
        </div>
      </div>
    `;
    return;
  }

  const selectedByCurrentAccount = fundedAccounts.find((item) => item.accountId === state.currentAccount);
  const selected = fundedAccounts.find((item) => item.id === root.dataset.selectedFundedId)
    || selectedByCurrentAccount
    || fundedAccounts[0];
  root.dataset.selectedFundedId = selected.id;

  const statusMeta = fundedStatusMeta(selected.globalStatus);
  const challengeMeta = challengeStateMeta(selected.challengeState);
  const modelOptions = availableModels(selected.propFirm);

  root.innerHTML = `
    <div class="funded-page-stack">
      <div class="tl-page-header">
        <div class="tl-page-title">Funded</div>
        <div class="tl-page-sub">Mission progress, compliance y preservación de capital para cuentas prop.</div>
      </div>

      <article class="tl-section-card funded-hero-card">
        <div class="funded-account-switch">
          ${fundedAccounts.map((account) => `
            <button class="funded-account-pill ${account.id === selected.id ? "is-active" : ""}" data-funded-select data-funded-id="${account.id}">
              <span>${account.linked?.name || account.label}</span>
              ${badgeMarkup(challengeStateMeta(account.challengeState), "ui-badge--compact")}
            </button>
          `).join("")}
        </div>

        <div class="funded-hero-grid">
          <div class="funded-hero-copy">
            <div class="banner-kicker">Mission status</div>
            <div class="funded-hero-head">
              <div>
                <div class="banner-title">${selected.linked?.name || selected.label}</div>
                <div class="row-sub">${selected.propFirm} · ${selected.programModel} · ${selected.phase}</div>
              </div>
              ${badgeMarkup(statusMeta)}
            </div>

            <div class="account-banner-badges">
              ${badgeMarkup(getConnectionStatusMeta(selected.linked?.connection))}
              ${badgeMarkup(getFundedStatusMeta(selected.status, selected.linked?.compliance))}
              ${badgeMarkup(challengeMeta, "ui-badge--compact")}
            </div>

            <div class="funded-hero-kpis">
              <div class="metric-item"><div class="metric-label">Account size</div><div class="metric-value">${formatCurrency(selected.accountSize)}</div></div>
              <div class="metric-item"><div class="metric-label">Balance</div><div class="metric-value">${formatCurrency(selected.balance)}</div></div>
              <div class="metric-item"><div class="metric-label">Equity</div><div class="metric-value">${formatCurrency(selected.equity)}</div></div>
              <div class="metric-item"><div class="metric-label">Open P&L</div><div class="metric-value ${selected.openPnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(selected.openPnl)}</div></div>
            </div>
          </div>

          <div class="funded-hero-config">
            <div class="funded-config-grid">
              <label class="form-stack">
                <span>Prop firm</span>
                <select data-funded-field="propFirm" data-funded-id="${selected.id}">
                  ${Object.keys(PROP_RULES).map((firm) => `<option value="${firm}" ${firm === selected.propFirm ? "selected" : ""}>${firm}</option>`).join("")}
                </select>
              </label>
              <label class="form-stack">
                <span>Program model</span>
                <select data-funded-field="programModel" data-funded-id="${selected.id}">
                  ${modelOptions.map((model) => `<option value="${model}" ${model === selected.programModel ? "selected" : ""}>${model}</option>`).join("")}
                </select>
              </label>
              <label class="form-stack">
                <span>Phase</span>
                <select data-funded-field="phase" data-funded-id="${selected.id}">
                  ${FUNDED_PHASES.map((phase) => `<option value="${phase}" ${phase === selected.phase ? "selected" : ""}>${phase}</option>`).join("")}
                </select>
              </label>
              <label class="form-stack">
                <span>Account size</span>
                <input type="number" min="0" step="1000" value="${selected.accountSize}" data-funded-field="accountSize" data-funded-id="${selected.id}">
              </label>
            </div>
            <div class="goal-card-sub funded-preset-note">${ruleNote(selected)}</div>
            <div class="settings-actions">
              <button class="btn-secondary" data-funded-action="view" data-funded-id="${selected.id}">Ver detalle</button>
            </div>
          </div>
        </div>
      </article>

      <article class="tl-section-card funded-progress-card">
        <div class="tl-section-header">
          <div>
            <div class="tl-section-title">Progress vs target</div>
            <div class="tl-section-sub">Ancla principal del challenge: beneficio actual frente al objetivo de la fase.</div>
          </div>
          <div class="funded-progress-metric">${selected.targetPct ? `${formatPercent(selected.currentProfitPct)} / ${formatPercent(selected.targetPct)}` : "Capital preservation"}</div>
        </div>
        <div class="funded-progress-layout">
          <div class="funded-progress-main">
            <div class="funded-progress-value ${selected.currentProfitUsd >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(selected.currentProfitUsd)}</div>
            <div class="row-sub">${selected.targetPct ? `${Math.round(selected.targetCompletionPct)}% del objetivo completado` : "Sin profit target en esta fase"}</div>
          </div>
          <div class="funded-progress-track">
            <div class="funded-progress-bar">
              <div class="funded-progress-fill ${progressFillClass(selected.targetCompletionPct)}" style="width:${selected.targetPct ? selected.targetCompletionPct : clamp(selected.currentProfitPct + 50, 0, 100)}%"></div>
            </div>
            <div class="funded-progress-meta">
              <span>Profit actual: ${formatPercent(selected.currentProfitPct)}</span>
              <span>${selected.targetPct ? `Target: ${formatPercent(selected.targetPct)}` : "Target no aplicable"}</span>
            </div>
          </div>
        </div>
      </article>

      <div class="grid-3 funded-rules-grid">
        <article class="tl-kpi-card funded-rule-card">
          <div class="tl-kpi-label">Daily Drawdown</div>
          <div class="tl-kpi-val ${selected.dailyUsagePct >= 80 ? "red" : ""}">${formatPercent(selected.dailyDdPct)}</div>
          <div class="row-sub">${selected.dailyLimitPct ? `${Math.round(selected.dailyUsagePct)}% del límite ${formatPercent(selected.dailyLimitPct)}` : "Límite no configurado"}</div>
          <div class="funded-mini-track"><div class="funded-mini-fill ${progressFillClass(selected.dailyUsagePct)}" style="width:${clamp(selected.dailyUsagePct)}%"></div></div>
        </article>
        <article class="tl-kpi-card funded-rule-card">
          <div class="tl-kpi-label">Max Drawdown</div>
          <div class="tl-kpi-val ${selected.maxUsagePct >= 80 ? "red" : ""}">${formatPercent(selected.maxDdPct)}</div>
          <div class="row-sub">${selected.maxLimitPct ? `${Math.round(selected.maxUsagePct)}% del límite ${formatPercent(selected.maxLimitPct)}` : "Límite no configurado"}</div>
          <div class="funded-mini-track"><div class="funded-mini-fill ${progressFillClass(selected.maxUsagePct)}" style="width:${clamp(selected.maxUsagePct)}%"></div></div>
        </article>
        <article class="tl-kpi-card funded-rule-card">
          <div class="tl-kpi-label">Trading Days</div>
          <div class="tl-kpi-val">${selected.noMinimumDays ? "Libre" : selected.daysCompleted}</div>
          <div class="row-sub">${selected.completedDaysVsRule}</div>
          <div class="funded-days-note">${selected.noMinimumDays ? "No minimum trading days" : selected.requiredTradingDays ? `${Math.max(selected.requiredTradingDays - selected.daysCompleted, 0)} días por completar` : "Sin requisito de días"}</div>
        </article>
      </div>

      <div class="tl-kpi-row five funded-secondary-kpis">
        <article class="tl-kpi-card"><div class="tl-kpi-label">Winrate</div><div class="tl-kpi-val">${formatPercent(selected.winRate)}</div></article>
        <article class="tl-kpi-card"><div class="tl-kpi-label">Avg R</div><div class="tl-kpi-val">${selected.avgRValue.toFixed(2)}R</div></article>
        <article class="tl-kpi-card"><div class="tl-kpi-label">Profit Factor</div><div class="tl-kpi-val">${selected.profitFactor.toFixed(2)}</div></article>
        <article class="tl-kpi-card"><div class="tl-kpi-label">Open P&L</div><div class="tl-kpi-val ${selected.openPnl >= 0 ? "green" : "red"}">${formatCurrency(selected.openPnl)}</div></article>
        <article class="tl-kpi-card"><div class="tl-kpi-label">Days</div><div class="tl-kpi-val">${selected.noMinimumDays ? selected.daysCompleted : `${selected.daysCompleted}/${selected.requiredTradingDays || 0}`}</div></article>
      </div>

      <article class="tl-section-card funded-alerts-card">
        <div class="tl-section-header">
          <div>
            <div class="tl-section-title">Account health & alerts</div>
            <div class="tl-section-sub">Warnings, breaches y lectura de misión en una sola vista.</div>
          </div>
        </div>
        <div class="breakdown-list">
          ${selected.alerts.map((alert) => `
            <div class="list-row">
              <div>
                <div class="row-title">${alert.title}</div>
                <div class="row-sub">${alert.detail}</div>
              </div>
              ${badgeMarkup({ label: alert.tone === "error" ? "DANGER" : alert.tone === "warn" ? "WARNING" : alert.tone === "ok" ? "SAFE" : "INFO", tone: alert.tone }, "ui-badge--compact")}
            </div>
          `).join("")}
        </div>
      </article>
    </div>
  `;
}
