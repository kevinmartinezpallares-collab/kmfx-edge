export type Mt5SourceStatus = "idle" | "connecting" | "connected" | "error";

export type Mt5SourceConfig = {
  sourceType: "mt5";
  endpoint: string | null;
  accountId: string | null;
  status: Mt5SourceStatus;
  lastSyncAt: string | null;
};

function normalizeStatus(value: unknown): Mt5SourceStatus {
  const normalized = String(value || "").trim().toLowerCase();

  if (
    normalized === "idle" ||
    normalized === "connecting" ||
    normalized === "connected" ||
    normalized === "error"
  ) {
    return normalized;
  }

  return "idle";
}

function normalizeNullableText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export function createMt5SourceConfig(
  config: Partial<Omit<Mt5SourceConfig, "sourceType" | "status">> & {
    status?: unknown;
  } = {},
): Mt5SourceConfig {
  return {
    sourceType: "mt5",
    endpoint: normalizeNullableText(config.endpoint),
    accountId: normalizeNullableText(config.accountId),
    status: normalizeStatus(config.status),
    lastSyncAt: normalizeNullableText(config.lastSyncAt),
  };
}
