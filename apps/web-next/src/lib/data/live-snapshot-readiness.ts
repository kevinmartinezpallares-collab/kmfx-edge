import type {
  RawLiveAccountsSnapshot,
  RawLiveSnapshotAccount,
} from "@/lib/contracts/live-snapshot";

export type LiveSnapshotAccountReadiness = {
  label: string;
  loginLabel: string;
  status: "connected" | "warning" | "stale" | "pending" | "error";
  hasDashboardPayload: boolean;
  hasEquity: boolean;
  hasReportMetrics: boolean;
  ageMinutes: number | null;
};

export type LiveSnapshotReadinessAudit = {
  status: "ready" | "partial" | "blocked";
  accountCount: number;
  readyAccountCount: number;
  staleAccountCount: number;
  pendingAccountCount: number;
  errorAccountCount: number;
  accounts: LiveSnapshotAccountReadiness[];
  issues: string[];
  warnings: string[];
};

function toFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getAgeMinutes(value: unknown, now: Date) {
  const timestamp = new Date(String(value || "")).getTime();
  if (Number.isNaN(timestamp)) return null;

  return Math.max(0, Math.round((now.getTime() - timestamp) / 60000));
}

function maskLogin(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "Sin login";
  if (normalized.includes("***")) return normalized;
  if (normalized.length <= 4) return "***";

  return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
}

function resolveAccountStatus(
  account: RawLiveSnapshotAccount,
  now: Date,
): LiveSnapshotAccountReadiness["status"] {
  const rawStatus = String(account.status || "").trim().toLowerCase();
  if (rawStatus === "error") return "error";
  if (rawStatus === "linked" || rawStatus === "pending_link") return "pending";

  const ageMinutes = getAgeMinutes(account.last_sync_at, now);
  if (ageMinutes === null) return "pending";
  if (ageMinutes <= 5) return "connected";
  if (ageMinutes <= 20) return "warning";
  return "stale";
}

function auditAccount(
  account: RawLiveSnapshotAccount,
  index: number,
  now: Date,
): LiveSnapshotAccountReadiness {
  const payload = account.dashboard_payload;
  const equity = toFiniteNumber(payload?.equity);
  const balance = toFiniteNumber(payload?.balance);
  const hasEquity =
    (equity !== null && equity > 0) || (balance !== null && balance > 0);

  return {
    label: `Cuenta ${index + 1}`,
    loginLabel: maskLogin(account.login),
    status: resolveAccountStatus(account, now),
    hasDashboardPayload: Boolean(payload),
    hasEquity,
    hasReportMetrics: Boolean(payload?.reportMetrics),
    ageMinutes: getAgeMinutes(account.last_sync_at, now),
  };
}

export function auditLiveSnapshotReadiness(
  snapshot: RawLiveAccountsSnapshot,
  now = new Date(),
): LiveSnapshotReadinessAudit {
  const rawAccounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
  const accounts = rawAccounts.map((account, index) =>
    auditAccount(account, index, now),
  );
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!accounts.length) {
    issues.push("El snapshot no contiene cuentas.");
  }

  accounts.forEach((account) => {
    if (!account.hasDashboardPayload) {
      issues.push(`${account.label}: falta dashboard_payload.`);
    }
    if (!account.hasEquity) {
      issues.push(`${account.label}: falta equity o balance valido.`);
    }
    if (!account.hasReportMetrics) {
      warnings.push(`${account.label}: faltan reportMetrics.`);
    }
    if (account.status === "stale") {
      warnings.push(`${account.label}: lectura desactualizada.`);
    }
    if (account.status === "pending") {
      warnings.push(`${account.label}: lectura pendiente.`);
    }
    if (account.status === "error") {
      warnings.push(`${account.label}: estado de conexion en error.`);
    }
  });

  const readyAccountCount = accounts.filter(
    (account) =>
      (account.status === "connected" || account.status === "warning") &&
      account.hasDashboardPayload &&
      account.hasEquity,
  ).length;
  const staleAccountCount = accounts.filter((account) => account.status === "stale")
    .length;
  const pendingAccountCount = accounts.filter((account) => account.status === "pending")
    .length;
  const errorAccountCount = accounts.filter((account) => account.status === "error")
    .length;

  if (accounts.length > 0 && readyAccountCount === 0) {
    issues.push("No hay ninguna cuenta lista para una prueba beta read-only.");
  }

  return {
    status: issues.length > 0 ? "blocked" : warnings.length > 0 ? "partial" : "ready",
    accountCount: accounts.length,
    readyAccountCount,
    staleAccountCount,
    pendingAccountCount,
    errorAccountCount,
    accounts,
    issues,
    warnings,
  };
}
