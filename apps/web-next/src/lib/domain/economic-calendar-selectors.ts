import type {
  EconomicCalendarEvent,
  EconomicImpact,
} from "@/lib/contracts/economic-calendar";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";

export type { EconomicImpact } from "@/lib/contracts/economic-calendar";

export type EconomicCalendarEventRow = {
  time: string;
  currency: string;
  event: string;
  impact: EconomicImpact;
  affected: string[];
  action: string;
  window: string;
};

export type EconomicCalendarSummaryCard = {
  label: string;
  value: string;
  note: string;
};

export type EconomicCalendarOverview = {
  rows: EconomicCalendarEventRow[];
  summaryCards: EconomicCalendarSummaryCard[];
  guardRows: EconomicCalendarSummaryCard[];
  providerNotes: string[];
  activeSymbols: string[];
  highImpactCount: number;
};

export const economicCalendarPreviewEvents: EconomicCalendarEvent[] = [
  {
    id: "preview-eur-pmi-composite",
    scheduledAt: "2026-05-19T10:00:00+02:00",
    timeLabel: "10:00",
    currency: "EUR",
    title: "PMI compuesto",
    impact: "medio",
    affectedSymbols: ["EURUSD"],
    suggestedAction: "Vigilar spread y evitar entradas impulsivas",
    protectionWindowLabel: "10 min antes / 10 min después",
    source: {
      provider: "Preview KMFX",
      status: "not_connected",
    },
  },
  {
    id: "preview-us-cpi-monthly",
    scheduledAt: "2026-05-19T14:30:00+02:00",
    timeLabel: "14:30",
    currency: "USD",
    title: "IPC mensual",
    impact: "alto",
    affectedSymbols: ["EURUSD", "XAUUSD", "USDCAD"],
    suggestedAction: "No abrir riesgo nuevo en la ventana crítica",
    protectionWindowLabel: "30 min antes / 15 min después",
    source: {
      provider: "Preview KMFX",
      status: "not_connected",
    },
  },
  {
    id: "preview-us-consumer-confidence",
    scheduledAt: "2026-05-19T16:00:00+02:00",
    timeLabel: "16:00",
    currency: "USD",
    title: "Confianza del consumidor",
    impact: "medio",
    affectedSymbols: ["EURUSD", "XAUUSD"],
    suggestedAction: "Reducir tamaño si ya hay exposición abierta",
    protectionWindowLabel: "15 min antes / 10 min después",
    source: {
      provider: "Preview KMFX",
      status: "not_connected",
    },
  },
  {
    id: "preview-us-fomc-minutes",
    scheduledAt: "2026-05-19T20:00:00+02:00",
    timeLabel: "20:00",
    currency: "USD",
    title: "Actas FOMC",
    impact: "alto",
    affectedSymbols: ["USD", "XAUUSD", "Índices"],
    suggestedAction: "Solo cerrar o reducir posiciones",
    protectionWindowLabel: "30 min antes / 30 min después",
    source: {
      provider: "Preview KMFX",
      status: "not_connected",
    },
  },
];

function toEconomicCalendarRow(event: EconomicCalendarEvent): EconomicCalendarEventRow {
  return {
    time: event.timeLabel,
    currency: event.currency,
    event: event.title,
    impact: event.impact,
    affected: event.affectedSymbols,
    action: event.suggestedAction,
    window: event.protectionWindowLabel,
  };
}

export function economicImpactLabel(impact: EconomicImpact) {
  const labels: Record<EconomicImpact, string> = {
    alto: "Alto impacto",
    medio: "Impacto medio",
    bajo: "Bajo impacto",
  };

  return labels[impact];
}

export function buildEconomicSymbolContext(workspace: WorkspaceState) {
  const symbols = Array.from(new Set(workspace.trades.map((trade) => trade.symbol))).slice(
    0,
    4,
  );

  return symbols.length > 0 ? symbols : ["EURUSD", "XAUUSD"];
}

export function getEconomicCalendarOverview(
  workspace: WorkspaceState,
): EconomicCalendarOverview {
  const activeAccount =
    workspace.accounts.find((account) => account.id === workspace.activeAccountId) ??
    workspace.accounts[0];
  const activeSymbols = buildEconomicSymbolContext(workspace);
  const rows = economicCalendarPreviewEvents.map(toEconomicCalendarRow);
  const highImpactCount = rows.filter(
    (event) => event.impact === "alto",
  ).length;
  const nextHighImpact =
    rows.find((event) => event.impact === "alto") ??
    rows[0];

  return {
    rows,
    activeSymbols,
    highImpactCount,
    summaryCards: [
      {
        label: "Próxima noticia",
        value: `${nextHighImpact.currency} / ${nextHighImpact.time}`,
        note: nextHighImpact.event,
      },
      {
        label: "Impacto alto hoy",
        value: String(highImpactCount),
        note: "Eventos que requieren ventana de protección",
      },
      {
        label: "Cuenta activa",
        value: activeAccount?.label ?? "Sin cuenta",
        note: activeAccount?.broker ?? "Pendiente de conexión",
      },
      {
        label: "Símbolos vigilados",
        value: activeSymbols.join(" / "),
        note: "Derivados de la operativa visible",
      },
    ],
    guardRows: [
      {
        label: "Avisos",
        value: "30 / 15 / 5 min",
        note: "Notificación antes de alto impacto",
      },
      {
        label: "Protección",
        value: "Solo lectura",
        note: "Recomienda y avisa; no modifica operaciones",
      },
      {
        label: "RiskGuard",
        value: "Conectable",
        note: "Puede sugerir reducción o pausa",
      },
    ],
    providerNotes: [
      "V1 puede funcionar con un proveedor REST económico y cache diario: eventos, moneda, impacto, hora y revisión manual de reglas.",
      "V2 añade actualización más frecuente, forecast/previous/actual y notificaciones automáticas por cuenta.",
      "Regla de producto: si no hay fuente con provenance, el sistema solo avisa y nunca afirma bloqueo técnico real.",
    ],
  };
}
