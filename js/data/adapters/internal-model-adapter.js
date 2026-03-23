import { buildDashboardModel } from "../../modules/utils.js";

export function createAccountRecord({
  id,
  name,
  broker,
  sourceType,
  payload,
  meta = {}
}) {
  const model = buildDashboardModel(payload);

  return {
    id,
    name: name || model.profile.desk || id,
    broker: broker || model.profile.broker || "Unknown broker",
    sourceType: sourceType || "unknown",
    meta,
    model,
    connection: {
      state: "disconnected",
      source: sourceType === "mt5" ? "mt5-ready" : "mock",
      lastSync: null,
      lastError: null,
      reconnectCount: 0,
      isSyncing: false,
      syncTick: 0,
      isAutoReconnectPending: false
    },
    compliance: {
      riskStatus: "ok",
      fundedStatus: "ok",
      messages: []
    }
  };
}
