export function createMt5SourceConfig(config = {}) {
  return {
    sourceType: "mt5",
    endpoint: config.endpoint || null,
    accountId: config.accountId || null,
    status: config.status || "idle",
    lastSyncAt: config.lastSyncAt || null
  };
}
