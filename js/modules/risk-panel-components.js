import { formatCurrency, formatPercent } from "./utils.js?v=build-20260504-080918";

function formatPlainPercent(value, digits = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0,0%";
  return `${parsed.toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

function clampWidth(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

export function riskToneFromStatus(status = "unavailable", severity = "info") {
  const normalizedStatus = String(status || "").toLowerCase();
  const normalizedSeverity = String(severity || "").toLowerCase();
  if (normalizedStatus === "blocked" || normalizedSeverity === "critical") return "blocked";
  if (normalizedStatus === "breach") return "breach";
  if (normalizedStatus === "warning" || normalizedSeverity === "warning") return "warning";
  return "ok";
}

function riskStatusLabel(status = "unavailable") {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "blocked") return "Blocked";
  if (normalized === "breach") return "Breach";
  if (normalized === "warning") return "Warning";
  if (normalized === "active_monitoring" || normalized === "ok") return "OK";
  return "Sin dato";
}

function formatEnforcementValue(value) {
  return value ? "Sí" : "No";
}

export function renderRiskStatusBadge(status = "unavailable", severity = "info") {
  const tone = riskToneFromStatus(status, severity);
  return `<span class="risk-status-badge risk-status-badge--${tone}">${riskStatusLabel(status)}</span>`;
}

export function renderRiskMetricCard({ label, value, meta = "", tone = "neutral" }) {
  return `
    <article class="risk-metric-card risk-metric-card--${tone}">
      <div class="risk-metric-card__label">${label}</div>
      <div class="risk-metric-card__value">${value}</div>
      ${meta ? `<div class="risk-metric-card__meta">${meta}</div>` : ""}
    </article>
  `;
}

export function renderRiskLimitBar({ label, currentPct, limitPct, distancePct, state = "ok" }) {
  const safeCurrent = Number.isFinite(Number(currentPct)) ? Number(currentPct) : 0;
  const safeLimit = Number.isFinite(Number(limitPct)) && Number(limitPct) > 0 ? Number(limitPct) : 0;
  const usageRatio = safeLimit > 0 ? (safeCurrent / safeLimit) * 100 : 0;
  return `
    <div class="risk-limit-bar">
      <div class="risk-limit-bar__top">
        <span>${label}</span>
        <strong>${formatPlainPercent(safeCurrent)} / ${formatPlainPercent(safeLimit)}</strong>
      </div>
      <div class="risk-limit-bar__track">
        <div class="risk-limit-bar__fill risk-limit-bar__fill--${state}" style="width:${clampWidth(usageRatio)}%"></div>
      </div>
      <div class="risk-limit-bar__meta">
        <span>Uso ${formatPlainPercent(usageRatio, 1)}</span>
        <span>Margen ${formatPlainPercent(distancePct)}</span>
      </div>
    </div>
  `;
}

export function renderEnforcementPanel(status) {
  const items = [
    ["Abrir nuevas operaciones", status.allowNewTrades],
    ["Bloquear nuevas entradas", status.blockNewTrades],
    ["Reducir tamaño", status.reduceSize],
    ["Cerrar posiciones", status.closePositionsRequired],
  ];
  return `
    <div class="risk-enforcement-panel">
      ${items.map(([label, value]) => `
        <div class="risk-enforcement-panel__item">
          <span>${label}</span>
          <strong class="${value ? "is-on" : "is-off"}">${formatEnforcementValue(value)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

export function renderSymbolExposureTable(exposure = []) {
  if (!Array.isArray(exposure) || !exposure.length) {
    return `<div class="risk-exposure-table__empty">Sin exposición abierta por símbolo.</div>`;
  }

  return `
    <div class="risk-exposure-table">
      <div class="risk-exposure-table__head">
        <span>Símbolo</span>
        <span>Riesgo</span>
        <span>P&amp;L</span>
        <span>Dirección</span>
      </div>
      ${exposure.map((item) => `
        <div class="risk-exposure-table__row">
          <strong>${item.symbol || "—"}</strong>
          <span>${formatPlainPercent(item.risk_pct, 2)}</span>
          <span class="${Number(item.open_pnl || 0) >= 0 ? "is-positive" : "is-negative"}">${formatCurrency(item.open_pnl || 0)}</span>
          <span>${item.direction || "—"}</span>
        </div>
      `).join("")}
    </div>
  `;
}

export function renderOpenTradeRiskTable(trades = []) {
  if (!Array.isArray(trades) || !trades.length) {
    return `<div class="risk-exposure-table__empty">Sin riesgo abierto por posición.</div>`;
  }

  return `
    <div class="risk-exposure-table">
      <div class="risk-exposure-table__head">
        <span>Posición</span>
        <span>Riesgo</span>
        <span>SL</span>
        <span>P&amp;L</span>
      </div>
      ${trades.map((item) => `
        <div class="risk-exposure-table__row">
          <strong>${item.symbol || "—"} · ${item.side || "—"}</strong>
          <span>${formatPlainPercent(item.risk_pct, 2)}</span>
          <span>${Number.isFinite(Number(item.stop_loss)) ? Number(item.stop_loss).toLocaleString("es-ES", { maximumFractionDigits: 5 }) : "—"}</span>
          <span class="${Number(item.open_pnl || 0) >= 0 ? "is-positive" : "is-negative"}">${formatCurrency(item.open_pnl || 0)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

export function formatRiskValuePct(value, digits = 2) {
  return formatPlainPercent(value, digits);
}

export function formatRiskCurrency(value) {
  return formatCurrency(value || 0);
}

export function formatUiPercent(value) {
  return formatPercent(value || 0);
}
