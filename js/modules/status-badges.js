export function getConnectionStatusMeta(connection = {}) {
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

export function getRiskStatusMeta(compliance = {}) {
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
