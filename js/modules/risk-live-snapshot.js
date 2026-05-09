const DEFAULT_STALE_AFTER_SECONDS = 15;

function normalizeBridgeUrl(rawUrl = "") {
  const value = String(rawUrl || "").trim();
  if (!value || value === "ws://localhost:8080/bridge") return "ws://localhost:8765";
  if (value.startsWith("http://")) return value.replace("http://", "ws://");
  if (value.startsWith("https://")) return value.replace("https://", "wss://");
  return value;
}

function normalizeRule(rule = {}, index = 0) {
  return {
    id: rule.id || rule.key || `rule-${index}`,
    title: String(rule.title || rule.name || "Regla"),
    condition: String(rule.condition || "Sin condición"),
    state: String(rule.state || "Sin estado"),
    impact: String(rule.impact || "Sin impacto"),
    isDominant: Boolean(rule.is_dominant || rule.isDominant),
    tone: String(rule.tone || "neutral"),
  };
}

function normalizeMetric(item = {}, index = 0) {
  return {
    key: String(item.key || `metric-${index}`),
    label: String(item.label || "Métrica"),
    display: String(item.display || "0%"),
    noteValue: String(item.note_value || item.noteValue || "0"),
    noteLabel: String(item.note_label || item.noteLabel || ""),
    tone: String(item.tone || "neutral"),
  };
}

function normalizeLadderRow(item = {}, index = 0) {
  return {
    level: String(item.level || `L${index}`),
    riskPct: Number.isFinite(Number(item.risk_pct ?? item.riskPct)) ? Number(item.risk_pct ?? item.riskPct) : 0,
    isCurrent: Boolean(item.is_current ?? item.isCurrent),
    isRecommended: Boolean(item.is_recommended ?? item.isRecommended),
    state: String(item.state || "idle"),
    entryCondition: String(item.entry_condition || item.entryCondition || ""),
    riseCondition: String(item.rise_condition || item.riseCondition || ""),
    fallCondition: String(item.fall_condition || item.fallCondition || ""),
    tradesTo100k: Number.isFinite(Number(item.trades_to_100k ?? item.tradesTo100k)) ? Number(item.trades_to_100k ?? item.tradesTo100k) : 0,
  };
}

function normalizeExposureSnapshot(raw = {}) {
  const safe = raw && typeof raw === "object" ? raw : {};
  const correlatedRisk = safe.effective_correlated_risk ?? safe.correlated_risk_pct ?? safe.effectiveCorrelatedRisk;
  return {
    openPositions: Number.isFinite(Number(safe.open_positions ?? safe.openPositions)) ? Number(safe.open_positions ?? safe.openPositions) : 0,
    totalOpenRiskPct: Number.isFinite(Number(safe.total_open_risk_pct ?? safe.totalOpenRiskPct)) ? Number(safe.total_open_risk_pct ?? safe.totalOpenRiskPct) : 0,
    effectiveCorrelatedRisk: Number.isFinite(Number(correlatedRisk)) ? Number(correlatedRisk) : null,
    pressureLabel: String(safe.pressure_label || safe.pressureLabel || ""),
    pressureTone: String(safe.pressure_tone || safe.pressureTone || "neutral"),
  };
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function firstFinite(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function normalizePolicySnapshot(rawPolicy = {}) {
  const policy = safeObject(rawPolicy);
  return {
    ...policy,
    risk_per_trade_pct: firstFinite(policy.risk_per_trade_pct, policy.max_risk_per_trade_pct),
    daily_dd_limit_pct: firstFinite(policy.daily_dd_limit_pct),
    max_dd_limit_pct: firstFinite(policy.max_dd_limit_pct),
    max_total_open_risk_pct: firstFinite(policy.max_total_open_risk_pct, policy.portfolio_heat_limit_pct),
    max_correlated_risk_pct: firstFinite(policy.max_correlated_risk_pct),
    allowed_sessions: Array.isArray(policy.allowed_sessions) ? policy.allowed_sessions : [],
    allowed_symbols: Array.isArray(policy.allowed_symbols) ? policy.allowed_symbols : [],
    max_volume: firstFinite(policy.max_volume),
    auto_block_enabled: Boolean(policy.auto_block_enabled),
    current_level: String(policy.current_level || ""),
    recommended_level: String(policy.recommended_level || ""),
    policy_source_label: String(policy.policy_source_label || policy.source_label || ""),
    policy_controls: safeObject(policy.policy_controls),
  };
}

export function normalizeRiskSnapshot(raw = {}) {
  const safe = raw && typeof raw === "object" ? raw : {};
  const summary = safeObject(safe.summary);
  const status = safeObject(safe.status);
  const policy = normalizePolicySnapshot(safe.policy || safe.policy_snapshot);
  const exposure = normalizeExposureSnapshot(safe.exposure_snapshot || {
    open_positions: summary.open_positions_count,
    total_open_risk_pct: summary.total_open_risk_pct ?? safe.total_open_risk_pct,
    effective_correlated_risk: safe.effective_correlated_risk ?? safe.correlated_risk_pct,
    pressure_label: status.risk_status ?? safe.risk_status,
    pressure_tone: status.severity,
  });
  const riskStatus = String(status.risk_status || safe.risk_status || "unavailable");
  const trigger = String(status.reason_code || safe.trigger || "");
  const blockingRule = String(status.blocking_rule || safe.blocking_rule || "");
  const actionRequired = String(status.action_required || safe.action_required || "");
  const dailyDrawdownPct = firstFinite(summary.daily_drawdown_pct, safe.daily_drawdown_pct, 0);
  const maxDrawdownPct = firstFinite(summary.peak_to_equity_drawdown_pct, summary.max_drawdown_pct, safe.max_drawdown_pct, 0);
  const totalOpenRiskPct = firstFinite(summary.total_open_risk_pct, safe.total_open_risk_pct, exposure.totalOpenRiskPct, 0);
  const effectiveCorrelatedRisk = firstFinite(
    safe.effective_correlated_risk,
    safe.correlated_risk_pct,
    summary.effective_correlated_risk,
    summary.correlated_risk_pct,
    exposure.effectiveCorrelatedRisk
  );
  const remainingDailyMarginPct = firstFinite(summary.distance_to_daily_dd_limit_pct, safe.remaining_daily_margin_pct, 0);
  const remainingTotalMarginPct = firstFinite(summary.distance_to_max_dd_limit_pct, safe.remaining_total_margin_pct, 0);
  const mt5LimitStates = safeObject(safe.mt5_limit_states || safe.mt5LimitStates);
  const ladderSource = safeObject(safe.ladder_snapshot || safe.ladderSnapshot);
  const ladderLevels = Array.isArray(ladderSource.levels) ? ladderSource.levels.map(normalizeLadderRow) : [];
  const activeRules = Array.isArray(safe.active_rules)
    ? safe.active_rules.map(normalizeRule)
    : Array.isArray(safe.riskRules)
      ? safe.riskRules.map(normalizeRule)
      : [];
  const breaches = Array.isArray(safe.breaches)
    ? safe.breaches
    : Array.isArray(safe.policy_evaluation?.breaches)
      ? safe.policy_evaluation.breaches
      : [];
  const warnings = [
    ...(Array.isArray(safe.warnings) ? safe.warnings : []),
    ...(Array.isArray(safe.policy_evaluation?.warnings) ? safe.policy_evaluation.warnings : []),
    ...(Array.isArray(safe.metadata?.warnings) ? safe.metadata.warnings : []),
  ];
  const legacySummary = {
    ...summary,
    daily_drawdown_pct: dailyDrawdownPct,
    peak_to_equity_drawdown_pct: maxDrawdownPct,
    total_open_risk_pct: totalOpenRiskPct,
    distance_to_daily_dd_limit_pct: remainingDailyMarginPct,
    distance_to_max_dd_limit_pct: remainingTotalMarginPct,
    max_risk_per_trade_pct: firstFinite(summary.max_risk_per_trade_pct, policy.risk_per_trade_pct, 0),
    portfolio_heat_limit_pct: firstFinite(summary.portfolio_heat_limit_pct, policy.max_total_open_risk_pct, 0),
    open_positions_count: firstFinite(summary.open_positions_count, exposure.openPositions, 0),
  };
  const legacyStatus = {
    ...status,
    risk_status: riskStatus,
    reason_code: trigger,
    blocking_rule: blockingRule,
    action_required: actionRequired,
    severity: status.severity || (riskStatus === "protection_mode" || riskStatus === "manual_lock" || riskStatus === "blocked" ? "critical" : riskStatus === "active_monitoring" || riskStatus === "warning" ? "warning" : "info"),
    enforcement: safeObject(status.enforcement),
  };
  return {
    riskStatus,
    trigger,
    blockingRule,
    actionRequired,
    remainingDailyMarginPct,
    remainingTotalMarginPct,
    dailyDrawdownPct,
    maxDrawdownPct,
    totalOpenRiskPct,
    effectiveCorrelatedRisk,
    volatilityOverrideActive: Boolean(safe.volatility_override_active),
    recommendedLevel: String(safe.recommended_level || ""),
    currentLevel: String(safe.current_level || ""),
    panicLockActive: Boolean(safe.panic_lock_active),
    panicLockExpiresAt: String(safe.panic_lock_expires_at || ""),
    activeRules,
    mt5LimitStates,
    limitsAndPressure: Array.isArray(safe.limits_and_pressure) ? safe.limits_and_pressure.map(normalizeMetric) : [],
    policySnapshot: policy,
    ladderSnapshot: {
      currentLevel: String(ladderSource.current_level || ladderSource.currentLevel || policy.current_level || safe.current_level || ""),
      recommendedLevel: String(ladderSource.recommended_level || ladderSource.recommendedLevel || policy.recommended_level || safe.recommended_level || ""),
      volatilityOverrideActive: Boolean(ladderSource.volatility_override_active ?? ladderSource.volatilityOverrideActive ?? safe.volatility_override_active),
      levels: ladderLevels,
    },
    exposureSnapshot: exposure,
    summary: legacySummary,
    status: legacyStatus,
    policy,
    warnings,
    breaches,
    policyAppliedAt: String(safe.policy_applied_at || ""),
    policySource: String(safe.policy_source || ""),
    policyDirty: Boolean(safe.policy_dirty),
    lastSnapshotAt: String(safe.last_snapshot_at || ""),
    staleAfterSeconds: Number.isFinite(Number(safe.snapshot_stale_after_seconds)) ? Number(safe.snapshot_stale_after_seconds) : DEFAULT_STALE_AFTER_SECONDS,
    backendConnected: Boolean(safe.backend_connected),
    mt5Connected: Boolean(safe.mt5_connected),
    mode: String(safe.mode || "unknown"),
    error: String(safe.error || ""),
  };
}

function createEmptyState() {
  return {
    status: "idle",
    snapshot: null,
    lastError: "",
    lastReceivedAt: 0,
    socket: null,
    reconnectTimer: null,
    bridgeUrl: "",
  };
}

function emitChange(root, onChange) {
  if (typeof onChange === "function") onChange();
  if (typeof root.__riskLiveOnChange === "function") root.__riskLiveOnChange();
}

function getInternalState(root) {
  if (!root.__riskLiveState) {
    root.__riskLiveState = createEmptyState();
  }
  return root.__riskLiveState;
}

function connect(root, bridgeUrl, onChange) {
  const state = getInternalState(root);
  if (state.socket) {
    try {
      state.socket.close();
    } catch {
      // noop
    }
  }

  state.bridgeUrl = bridgeUrl;
  state.status = "loading";
  state.lastError = "";

  try {
    const socket = new WebSocket(bridgeUrl);
    state.socket = socket;

    socket.addEventListener("open", () => {
      state.status = "loading";
      state.lastError = "";
      socket.send(JSON.stringify({ cmd: "get_snapshot" }));
      emitChange(root, onChange);
    });

    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data || "{}");
        if (!payload || (payload.type !== "snapshot" && payload.type !== "update")) return;
        if (!payload.risk_snapshot) return;
        state.snapshot = normalizeRiskSnapshot(payload.risk_snapshot);
        state.lastReceivedAt = Date.now();
        state.status = "ready";
        state.lastError = "";
        emitChange(root, onChange);
      } catch (error) {
        state.status = state.snapshot ? "stale" : "error";
        state.lastError = error instanceof Error ? error.message : String(error);
        emitChange(root, onChange);
      }
    });

    socket.addEventListener("error", () => {
      state.lastError = "No se pudo abrir la conexión MT5.";
      state.status = state.snapshot ? "stale" : "error";
      emitChange(root, onChange);
    });

    socket.addEventListener("close", () => {
      state.socket = null;
      state.status = state.snapshot ? "stale" : "disconnected";
      emitChange(root, onChange);
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = window.setTimeout(() => connect(root, bridgeUrl, onChange), 3000);
    });
  } catch (error) {
    state.status = "error";
    state.lastError = error instanceof Error ? error.message : String(error);
    emitChange(root, onChange);
  }
}

export function ensureRiskSnapshotFeed(root, { bridgeUrl, onChange } = {}) {
  const state = getInternalState(root);
  const normalizedUrl = normalizeBridgeUrl(bridgeUrl);
  root.__riskLiveOnChange = onChange || root.__riskLiveOnChange || null;

  if (!normalizedUrl) {
    state.status = "error";
    state.lastError = "No hay una conexión MT5 configurada.";
    return getRiskSnapshotState(root);
  }

  if (!state.socket || state.bridgeUrl !== normalizedUrl) {
    clearTimeout(state.reconnectTimer);
    connect(root, normalizedUrl, onChange);
  }

  if (state.snapshot) {
    const staleAfterMs = (state.snapshot.staleAfterSeconds || DEFAULT_STALE_AFTER_SECONDS) * 1000;
    if (Date.now() - state.lastReceivedAt > staleAfterMs) {
      state.status = "stale";
    }
  }

  return getRiskSnapshotState(root);
}

export function getRiskSnapshotState(root) {
  const state = getInternalState(root);
  return {
    status: state.status,
    snapshot: state.snapshot,
    lastError: state.lastError,
    bridgeUrl: state.bridgeUrl,
    lastReceivedAt: state.lastReceivedAt,
  };
}
