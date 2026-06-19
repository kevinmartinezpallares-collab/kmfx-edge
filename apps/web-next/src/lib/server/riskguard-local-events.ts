import "server-only";

import type { RawRiskGuardAlertEvent } from "@/lib/contracts/live-snapshot";

type StoredRiskGuardAlertEvent = RawRiskGuardAlertEvent & {
  accountId?: string;
  connectionKeyPreview?: string;
};

const alertableEventTypes = new Set([
  "block_new_entries",
  "close_all_required",
  "pending_delete_preview",
  "pending_order_blocked",
  "pending_order_deleted",
  "synthetic_pending_blocked",
  "trade_flagged_after_execution",
]);

const localStoreKey = Symbol.for("kmfx.riskguard.localAlertEvent");

type GlobalWithRiskGuardEvent = typeof globalThis & {
  [localStoreKey]?: StoredRiskGuardAlertEvent | null;
};

function globalStore() {
  return globalThis as GlobalWithRiskGuardEvent;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function maskConnectionKey(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "[set]";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function resolveLabel(eventType: string) {
  if (eventType === "close_all_required") {
    return "Mesa de Riesgo: reducción defensiva requerida";
  }

  if (
    eventType === "pending_order_blocked" ||
    eventType === "pending_order_deleted" ||
    eventType === "pending_delete_preview" ||
    eventType === "synthetic_pending_blocked"
  ) {
    return "Mesa de Riesgo: orden bloqueada";
  }

  if (eventType === "trade_flagged_after_execution") {
    return "Mesa de Riesgo: operación revisable";
  }

  return "Mesa de Riesgo: entradas bloqueadas";
}

function resolveReason(eventType: string, sourceReason: string) {
  if (sourceReason) return sourceReason;

  if (eventType === "close_all_required") {
    return "La política activa indica que hay que reducir exposición antes de seguir operando.";
  }

  if (
    eventType === "pending_order_blocked" ||
    eventType === "pending_order_deleted" ||
    eventType === "pending_delete_preview" ||
    eventType === "synthetic_pending_blocked"
  ) {
    return "RiskGuard ha detectado una entrada que no cumple la política activa.";
  }

  if (eventType === "trade_flagged_after_execution") {
    return "La entrada se ha marcado para revisión porque la política activa no permitía más exposición.";
  }

  return "La política activa no permite abrir más operaciones ahora.";
}

function resolveTone(eventType: string, severity: string): "danger" | "warning" | "info" {
  if (eventType === "close_all_required" || eventType === "pending_order_deleted") {
    return "danger";
  }

  if (severity === "danger" || severity === "info") return severity;
  return "warning";
}

export function buildLocalRiskGuardAlertEvent({
  accountId,
  connectionKey,
  payload,
}: {
  accountId?: string;
  connectionKey?: string;
  payload: Record<string, unknown>;
}) {
  const eventType = stringValue(
    payload.event_type ??
      payload.eventType ??
      payload.riskguard_event_type ??
      payload.riskGuardEventType,
  );

  if (!alertableEventTypes.has(eventType)) return null;

  const policyHash = stringValue(payload.policy_hash ?? payload.policyHash);
  const blockingRule = stringValue(payload.blocking_rule ?? payload.blockingRule);
  const symbol = stringValue(payload.symbol ?? payload.event_symbol ?? payload.eventSymbol);
  const orderTicket = stringValue(payload.order_ticket ?? payload.orderTicket);
  const eventReason = stringValue(payload.event_reason ?? payload.eventReason);
  const occurredAt = new Date().toISOString();
  const idParts = [
    policyHash,
    eventType,
    blockingRule,
    symbol,
    orderTicket,
    occurredAt,
  ].filter(Boolean);

  return {
    accountId,
    blocking_rule: blockingRule,
    connectionKeyPreview: maskConnectionKey(connectionKey ?? ""),
    event_type: eventType,
    id: `local-riskguard:${idParts.join(":")}`,
    label: resolveLabel(eventType),
    occurred_at: occurredAt,
    policy_hash: policyHash,
    reason: resolveReason(eventType, eventReason),
    risk_status: stringValue(payload.risk_status ?? payload.riskStatus),
    tone: resolveTone(eventType, stringValue(payload.severity)),
  } satisfies StoredRiskGuardAlertEvent;
}

export function rememberLocalRiskGuardAlertEvent(
  event: StoredRiskGuardAlertEvent,
) {
  globalStore()[localStoreKey] = event;
}

export function readLocalRiskGuardAlertEvent(accountId?: string) {
  const event = globalStore()[localStoreKey] ?? null;
  if (!event) return null;
  if (accountId && event.accountId && event.accountId !== accountId) return null;
  return event;
}
