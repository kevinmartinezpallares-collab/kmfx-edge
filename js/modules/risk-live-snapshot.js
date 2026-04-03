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

export function normalizeRiskSnapshot(raw = {}) {
  const safe = raw && typeof raw === "object" ? raw : {};
  return {
    riskStatus: String(safe.risk_status || "unavailable"),
    trigger: String(safe.trigger || ""),
    blockingRule: String(safe.blocking_rule || ""),
    actionRequired: String(safe.action_required || ""),
    remainingDailyMarginPct: Number.isFinite(Number(safe.remaining_daily_margin_pct)) ? Number(safe.remaining_daily_margin_pct) : 0,
    remainingTotalMarginPct: Number.isFinite(Number(safe.remaining_total_margin_pct)) ? Number(safe.remaining_total_margin_pct) : 0,
    dailyDrawdownPct: Number.isFinite(Number(safe.daily_drawdown_pct)) ? Number(safe.daily_drawdown_pct) : 0,
    maxDrawdownPct: Number.isFinite(Number(safe.max_drawdown_pct)) ? Number(safe.max_drawdown_pct) : 0,
    totalOpenRiskPct: Number.isFinite(Number(safe.total_open_risk_pct)) ? Number(safe.total_open_risk_pct) : 0,
    effectiveCorrelatedRisk: Number.isFinite(Number(safe.effective_correlated_risk)) ? Number(safe.effective_correlated_risk) : 0,
    volatilityOverrideActive: Boolean(safe.volatility_override_active),
    recommendedLevel: String(safe.recommended_level || ""),
    currentLevel: String(safe.current_level || ""),
    panicLockActive: Boolean(safe.panic_lock_active),
    panicLockExpiresAt: String(safe.panic_lock_expires_at || ""),
    activeRules: Array.isArray(safe.active_rules) ? safe.active_rules.map(normalizeRule) : [],
    mt5LimitStates: safe.mt5_limit_states && typeof safe.mt5_limit_states === "object" ? safe.mt5_limit_states : {},
    limitsAndPressure: Array.isArray(safe.limits_and_pressure) ? safe.limits_and_pressure.map(normalizeMetric) : [],
    policySnapshot: safe.policy_snapshot && typeof safe.policy_snapshot === "object" ? safe.policy_snapshot : {},
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
      state.lastError = "No se pudo abrir el bridge MT5.";
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
    state.lastError = "No hay URL de bridge configurada.";
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

