function safeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function resolveLiveContext(context = {}) {
  const account = safeObject(context.account);
  const dashboardPayload = safeObject(account.dashboardPayload || context.dashboardPayload);
  const authority = safeObject(context.authority);
  const sourceType = String(account.sourceType || account.source || "").toLowerCase();
  const payloadSource = String(dashboardPayload.payloadSource || account.model?.sourceTrace?.payloadSource || authority.payloadSource || "").toLowerCase();
  const lastSync = account.connection?.lastSync || dashboardPayload.timestamp || dashboardPayload.last_sync_at || account.lastSyncAt || account.last_sync_at || "";
  const hasUsableLiveSnapshot = Boolean(authority.hasUsableLiveSnapshot)
    || (payloadSource === "mt5_sync_live" && Object.keys(dashboardPayload).length > 0);
  return {
    account,
    dashboardPayload,
    authority,
    isMt5: sourceType === "mt5" || payloadSource === "mt5_sync_live",
    payloadSource,
    lastSync,
    hasUsableLiveSnapshot,
  };
}

function hasExplicitRiskViolation(context = {}) {
  const { account, dashboardPayload } = resolveLiveContext(context);
  const riskSnapshot = safeObject(account.riskSnapshot || dashboardPayload.riskSnapshot || context.riskSnapshot);
  const status = safeObject(riskSnapshot.status);
  const enforcement = safeObject(status.enforcement);
  const policyEvaluation = safeObject(riskSnapshot.policy_evaluation);
  const riskStatus = String(status.risk_status || "").toLowerCase();
  const severity = String(status.severity || "").toLowerCase();
  const breaches = Array.isArray(policyEvaluation.breaches) ? policyEvaluation.breaches : [];

  return ["violation", "breach", "blocked"].includes(riskStatus)
    || ["error", "critical"].includes(severity)
    || Boolean(status.blocking_rule)
    || Boolean(enforcement.block_new_trades || enforcement.reduce_size || enforcement.close_positions_required)
    || breaches.length > 0;
}

export function getConnectionStatusMeta(connection = {}, context = {}) {
  const live = resolveLiveContext(context);
  if (live.isMt5 && live.hasUsableLiveSnapshot && connection.state !== "error") {
    return { label: "Conectado", tone: "ok" };
  }
  if (connection.isSyncing) return { label: "Sincronizando...", tone: "info" };
  switch (connection.state) {
    case "connected":
      return { label: "Conectado", tone: "ok" };
    case "connecting":
      return { label: "Sincronizando...", tone: "warn" };
    case "error":
      return { label: "Error de conexión", tone: "error" };
    default:
      return { label: "Sin conexión", tone: "neutral" };
  }
}

export function getRiskStatusMeta(compliance = {}, context = {}) {
  const live = resolveLiveContext(context);
  if (live.isMt5 && compliance.riskStatus === "violation" && !hasExplicitRiskViolation(context)) {
    return { label: "Riesgo saludable", tone: "ok" };
  }
  switch (compliance.riskStatus) {
    case "violation":
      return { label: "Riesgo fuera de regla", tone: "error" };
    case "warning":
      return { label: "Riesgo en vigilancia", tone: "warn" };
    default:
      return { label: "Riesgo saludable", tone: "ok" };
  }
}

export function getFundedStatusMeta(fundedStatus = "standby", compliance = {}) {
  if (compliance.fundedStatus === "violation") return { label: "Fondeo fuera de regla", tone: "error" };
  if (compliance.fundedStatus === "warning") return { label: "Fondeo en vigilancia", tone: "warn" };
  if (fundedStatus === "funded") return { label: "Fondeada", tone: "ok" };
  if (fundedStatus === "on-track") return { label: "En objetivo", tone: "ok" };
  if (fundedStatus === "testing") return { label: "En prueba", tone: "info" };
  if (fundedStatus === "planned") return { label: "Planificada", tone: "neutral" };
  return { label: "En espera", tone: "neutral" };
}

export function getWorkspaceStatusMeta(source = "mock") {
  return source === "mt5-ready"
    ? { label: "Preparada para MT5", tone: "info" }
    : { label: "Fuente local", tone: "neutral" };
}

export function badgeMarkup(meta, extraClass = "") {
  const tone = meta?.tone || "neutral";
  const label = meta?.label || "Sin dato";
  return `<span class="ui-badge ui-badge--${tone}${extraClass ? ` ${extraClass}` : ""}"><span class="ui-badge__dot"></span>${label}</span>`;
}
