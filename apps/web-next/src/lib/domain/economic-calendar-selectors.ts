import type {
  EconomicCalendarEvent,
  EconomicImpact,
} from "@/lib/contracts/economic-calendar";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";

export type { EconomicImpact } from "@/lib/contracts/economic-calendar";

export type EconomicCalendarEventRow = {
  scheduledAt: string;
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

function toEconomicCalendarRow(event: EconomicCalendarEvent): EconomicCalendarEventRow {
  return {
    scheduledAt: event.scheduledAt,
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
  events: EconomicCalendarEvent[] = [],
): EconomicCalendarOverview {
  const activeAccount =
    workspace.accounts.find((account) => account.id === workspace.activeAccountId) ??
    workspace.accounts[0];
  const activeSymbols = buildEconomicSymbolContext(workspace);
  const rows = events.map(toEconomicCalendarRow);
  const highImpactCount = rows.filter(
    (event) => event.impact === "alto",
  ).length;
  const nextHighImpact =
    rows.find((event) => event.impact === "alto") ??
    rows[0] ?? null;

  return {
    rows,
    activeSymbols,
    highImpactCount,
    summaryCards: [
      {
        label: "Próxima noticia",
        value: nextHighImpact ? `${nextHighImpact.currency} / ${nextHighImpact.time}` : "Sin fuente",
        note: nextHighImpact?.event ?? "Pendiente de calendario conectado",
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
