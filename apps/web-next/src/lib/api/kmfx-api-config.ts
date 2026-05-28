const PRODUCTION_API_BASE_URL = "https://kmfx-edge-api.onrender.com";
const DEFAULT_SNAPSHOT_TIMEOUT_MS = 8_000;
const MIN_SNAPSHOT_TIMEOUT_MS = 1_000;
const MAX_SNAPSHOT_TIMEOUT_MS = 60_000;

export type SnapshotView = "full" | "summary";

function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function resolveKmfxApiBaseUrl() {
  const explicit =
    process.env.KMFX_API_BASE_URL ?? process.env.NEXT_PUBLIC_KMFX_API_BASE_URL;

  if (explicit && explicit.trim()) {
    return trimTrailingSlash(explicit);
  }

  return process.env.NODE_ENV === "development"
    ? "http://127.0.0.1:8000"
    : PRODUCTION_API_BASE_URL;
}

export function buildKmfxApiUrl(pathname: string) {
  const baseUrl = resolveKmfxApiBaseUrl();
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${baseUrl}${normalizedPath}`;
}

export function resolveKmfxAccountsSnapshotUrl({
  view = "full",
}: {
  view?: SnapshotView;
} = {}) {
  const query = view === "summary" ? "?view=summary" : "";
  return buildKmfxApiUrl(`/api/accounts/snapshot${query}`);
}

export function resolveKmfxSnapshotTimeoutMs() {
  const parsed = Number(process.env.KMFX_SNAPSHOT_TIMEOUT_MS);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SNAPSHOT_TIMEOUT_MS;
  }

  return Math.min(
    MAX_SNAPSHOT_TIMEOUT_MS,
    Math.max(MIN_SNAPSHOT_TIMEOUT_MS, Math.round(parsed)),
  );
}
