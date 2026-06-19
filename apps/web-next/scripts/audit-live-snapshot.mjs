const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 60000;
const DEFAULT_TIMEOUT_MS = 8000;

function resolveBaseUrl() {
  const value =
    process.env.KMFX_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_KMFX_API_BASE_URL?.trim();

  if (!value) {
    throw new Error(
      "Define KMFX_API_BASE_URL para auditar el snapshot live read-only.",
    );
  }

  return value.replace(/\/+$/, "");
}

function resolveTimeoutMs() {
  const parsed = Number(process.env.KMFX_SNAPSHOT_TIMEOUT_MS);

  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;

  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(parsed)));
}

function buildHeaders() {
  const headers = {
    Accept: "application/json",
  };
  const token = process.env.KMFX_PREVIEW_BEARER_TOKEN?.trim();
  const userEmail = process.env.KMFX_PREVIEW_USER_EMAIL?.trim();
  const userId = process.env.KMFX_PREVIEW_USER_ID?.trim();

  if (token) headers.Authorization = `Bearer ${token}`;
  if (userEmail) headers["X-KMFX-User-Email"] = userEmail;
  if (userId) headers["X-KMFX-User-Id"] = userId;

  return headers;
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getAgeMinutes(value, now) {
  const timestamp = new Date(String(value || "")).getTime();
  if (Number.isNaN(timestamp)) return null;

  return Math.max(0, Math.round((now.getTime() - timestamp) / 60000));
}

function maskLogin(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "Sin login";
  if (normalized.includes("***")) return normalized;
  if (normalized.length <= 4) return "***";

  return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
}

function resolveAccountStatus(account, now) {
  const rawStatus = String(account.status || "").trim().toLowerCase();
  if (rawStatus === "error") return "error";
  if (rawStatus === "linked" || rawStatus === "pending_link") return "pending";

  const ageMinutes = getAgeMinutes(account.last_sync_at, now);
  if (ageMinutes === null) return "pending";
  if (ageMinutes <= 5) return "connected";
  if (ageMinutes <= 20) return "warning";
  return "stale";
}

function auditSnapshot(snapshot, now = new Date()) {
  const rawAccounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
  const accounts = rawAccounts.map((account, index) => {
    const payload = account.dashboard_payload;
    const equity = toFiniteNumber(payload?.equity);
    const balance = toFiniteNumber(payload?.balance);

    return {
      label: `Cuenta ${index + 1}`,
      loginLabel: maskLogin(account.login),
      status: resolveAccountStatus(account, now),
      hasDashboardPayload: Boolean(payload),
      hasEquity:
        (equity !== null && equity > 0) || (balance !== null && balance > 0),
      hasReportMetrics: Boolean(payload?.reportMetrics),
      ageMinutes: getAgeMinutes(account.last_sync_at, now),
    };
  });
  const issues = [];
  const warnings = [];

  if (!accounts.length) issues.push("El snapshot no contiene cuentas.");

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

  if (accounts.length > 0 && readyAccountCount === 0) {
    issues.push("No hay ninguna cuenta lista para una prueba live read-only.");
  }

  return {
    status: issues.length > 0 ? "blocked" : warnings.length > 0 ? "partial" : "ready",
    accountCount: accounts.length,
    readyAccountCount,
    staleAccountCount: accounts.filter((account) => account.status === "stale").length,
    pendingAccountCount: accounts.filter((account) => account.status === "pending").length,
    errorAccountCount: accounts.filter((account) => account.status === "error").length,
    accounts,
    issues,
    warnings,
  };
}

async function fetchSnapshot() {
  const controller = new AbortController();
  const timeoutMs = resolveTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${resolveBaseUrl()}/api/accounts/snapshot?view=summary`;

  try {
    const response = await fetch(url, {
      headers: buildHeaders(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Snapshot respondio con status ${response.status}.`);
    }

    return {
      url,
      timeoutMs,
      snapshot: await response.json(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function printAudit({ url, timeoutMs, audit }) {
  console.log("Live snapshot readiness");
  console.log(`URL: ${url}`);
  console.log(`Timeout: ${timeoutMs}ms`);
  console.log(`Estado: ${audit.status}`);
  console.log(
    `Cuentas: ${audit.accountCount} total, ${audit.readyAccountCount} listas, ${audit.staleAccountCount} desactualizadas, ${audit.pendingAccountCount} pendientes, ${audit.errorAccountCount} con error`,
  );

  audit.accounts.forEach((account) => {
    const ageLabel =
      account.ageMinutes === null ? "sin lectura" : `${account.ageMinutes} min`;
    console.log(
      `- ${account.label} (${account.loginLabel}): ${account.status}, ${ageLabel}, payload=${account.hasDashboardPayload ? "si" : "no"}, equity=${account.hasEquity ? "si" : "no"}`,
    );
  });

  if (audit.warnings.length) {
    console.log("\nAvisos:");
    audit.warnings.forEach((warning) => console.log(`- ${warning}`));
  }

  if (audit.issues.length) {
    console.error("\nBloqueos:");
    audit.issues.forEach((issue) => console.error(`- ${issue}`));
  }
}

try {
  const result = await fetchSnapshot();
  const audit = auditSnapshot(result.snapshot);
  printAudit({ ...result, audit });

  if (audit.status === "blocked") process.exit(1);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "No se pudo auditar el snapshot live.",
  );
  process.exit(1);
}
