const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 60000;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_SYNC_AGE_MINUTES = 10;
const MONEY_TOLERANCE = 0.01;
const PCT_TOLERANCE = 0.05;

function resolveBaseUrl() {
  const value =
    process.env.KMFX_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_KMFX_API_BASE_URL?.trim();

  if (!value) {
    throw new Error("Define KMFX_API_BASE_URL para auditar integridad live.");
  }

  return value.replace(/\/+$/, "");
}

function resolveTimeoutMs() {
  const parsed = Number(process.env.KMFX_SNAPSHOT_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;

  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(parsed)));
}

function resolveMaxSyncAgeMinutes() {
  const parsed = Number(process.env.KMFX_LIVE_MAX_SYNC_AGE_MINUTES);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_SYNC_AGE_MINUTES;

  return Math.max(1, Math.round(parsed));
}

function buildHeaders() {
  const headers = { Accept: "application/json" };
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

function numbersClose(left, right, tolerance = MONEY_TOLERANCE) {
  const leftNumber = toFiniteNumber(left);
  const rightNumber = toFiniteNumber(right);
  if (leftNumber === null || rightNumber === null) return false;

  return Math.abs(leftNumber - rightNumber) <= tolerance;
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

async function fetchSnapshot(view, { signal }) {
  const url = `${resolveBaseUrl()}/api/accounts/snapshot?view=${view}`;
  const response = await fetch(url, {
    headers: buildHeaders(),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Snapshot ${view} respondio con status ${response.status}.`);
  }

  return { url, snapshot: await response.json() };
}

function compareSummaryAndFull(summary, full, issues) {
  const summaryAccounts = Array.isArray(summary.accounts) ? summary.accounts : [];
  const fullAccounts = Array.isArray(full.accounts) ? full.accounts : [];

  if (summaryAccounts.length !== fullAccounts.length) {
    issues.push(
      `summary/full no tienen el mismo numero de cuentas (${summaryAccounts.length}/${fullAccounts.length}).`,
    );
    return;
  }

  summaryAccounts.forEach((summaryAccount, index) => {
    const fullAccount = fullAccounts[index] || {};
    const summaryPayload = summaryAccount.dashboard_payload || {};
    const fullPayload = fullAccount.dashboard_payload || {};
    const label = `Cuenta ${index + 1}`;

    if (String(summaryAccount.last_sync_at || "") !== String(fullAccount.last_sync_at || "")) {
      issues.push(`${label}: summary/full divergen en last_sync_at.`);
    }
    if (!numbersClose(summaryPayload.balance, fullPayload.balance)) {
      issues.push(`${label}: summary/full divergen en balance.`);
    }
    if (!numbersClose(summaryPayload.equity, fullPayload.equity)) {
      issues.push(`${label}: summary/full divergen en equity.`);
    }
  });
}

function auditAccount(account, index, { now, maxSyncAgeMinutes }) {
  const label = `Cuenta ${index + 1}`;
  const payload = account.dashboard_payload || {};
  const metrics = payload.reportMetrics || {};
  const riskSummary = payload.riskSnapshot?.summary || {};
  const issues = [];
  const warnings = [];
  const ageMinutes = getAgeMinutes(account.last_sync_at, now);
  const balance = toFiniteNumber(payload.balance);
  const equity = toFiniteNumber(payload.equity);
  const openPnl = toFiniteNumber(payload.openPnl) ?? 0;
  const closedPnl = toFiniteNumber(payload.closedPnl) ?? 0;
  const totalPnl = toFiniteNumber(payload.totalPnl);
  const openPositionsCount = toFiniteNumber(payload.openPositionsCount);
  const riskOpenPositionsCount = toFiniteNumber(riskSummary.open_positions_count);
  const trades = Array.isArray(payload.trades) ? payload.trades : [];
  const history = Array.isArray(payload.history) ? payload.history : [];
  const totalTrades = toFiniteNumber(metrics.totalTrades ?? payload.totalTrades);

  if (!payload || !Object.keys(payload).length) {
    issues.push(`${label}: falta dashboard_payload.`);
  }
  if (ageMinutes === null) {
    issues.push(`${label}: falta last_sync_at valido.`);
  } else if (ageMinutes > maxSyncAgeMinutes) {
    issues.push(`${label}: lectura desactualizada (${ageMinutes} min).`);
  }
  if (balance === null || balance <= 0) {
    issues.push(`${label}: balance no valido.`);
  }
  if (equity === null || equity <= 0) {
    issues.push(`${label}: equity no valido.`);
  }
  if ((!payload.reportMetrics || !Object.keys(metrics).length) && totalTrades === null) {
    issues.push(`${label}: faltan reportMetrics o totalTrades.`);
  }
  if (metrics.balance !== undefined && !numbersClose(metrics.balance, payload.balance)) {
    issues.push(`${label}: reportMetrics.balance no cuadra con payload.balance.`);
  }
  if (metrics.equity !== undefined && !numbersClose(metrics.equity, payload.equity)) {
    issues.push(`${label}: reportMetrics.equity no cuadra con payload.equity.`);
  }
  if (metrics.netProfit !== undefined && payload.closedPnl !== undefined && !numbersClose(metrics.netProfit, payload.closedPnl)) {
    issues.push(`${label}: reportMetrics.netProfit no cuadra con closedPnl.`);
  }
  if (totalPnl !== null && !numbersClose(totalPnl, openPnl + closedPnl)) {
    issues.push(`${label}: totalPnl no cuadra con openPnl + closedPnl.`);
  }
  if (metrics.totalTrades !== undefined) {
    if (totalTrades === null || totalTrades < 0 || !Number.isInteger(totalTrades)) {
      issues.push(`${label}: totalTrades no es un entero valido.`);
    }
  }
  if (totalTrades !== null && totalTrades > 0 && trades.length === 0) {
    issues.push(`${label}: reporta ${totalTrades} operaciones pero no trae trades detallados.`);
  }
  if (totalTrades !== null && totalTrades > 0 && history.length < 2) {
    issues.push(`${label}: reporta operaciones pero no trae historico suficiente.`);
  }
  if (trades.length > 0 && totalTrades !== null && trades.length > totalTrades) {
    warnings.push(`${label}: trae mas trades detallados que totalTrades.`);
  }
  if (metrics.winRate !== undefined || payload.winRate !== undefined) {
    const winRate = toFiniteNumber(metrics.winRate ?? payload.winRate);
    if (winRate === null || winRate < -PCT_TOLERANCE || winRate > 100 + PCT_TOLERANCE) {
      issues.push(`${label}: winRate fuera de rango.`);
    }
  }
  if (openPositionsCount !== null && riskOpenPositionsCount !== null && openPositionsCount !== riskOpenPositionsCount) {
    issues.push(`${label}: openPositionsCount no cuadra con riskSnapshot.`);
  }
  if (openPositionsCount === 0) {
    if (!numbersClose(riskSummary.total_open_risk_amount ?? 0, 0)) {
      issues.push(`${label}: riesgo abierto no es cero sin posiciones.`);
    }
    if (!numbersClose(riskSummary.total_open_risk_pct ?? 0, 0, PCT_TOLERANCE)) {
      issues.push(`${label}: riesgo abierto porcentual no es cero sin posiciones.`);
    }
  }
  if (Array.isArray(payload.syncIssues) && payload.syncIssues.length > 0) {
    warnings.push(`${label}: syncIssues presentes (${payload.syncIssues.length}).`);
  }
  if (payload.data_status || payload.dataStatus) {
    warnings.push(`${label}: data_status=${payload.data_status || payload.dataStatus}.`);
  }

  return {
    label,
    loginLabel: maskLogin(account.login),
    ageMinutes,
    balance,
    equity,
    status: String(account.status || ""),
    issues,
    warnings,
  };
}

function auditSnapshots(summary, full, now = new Date()) {
  const issues = [];
  const warnings = [];
  const summaryAccounts = Array.isArray(summary.accounts) ? summary.accounts : [];
  const accounts = Array.isArray(full.accounts) ? full.accounts : [];
  const maxSyncAgeMinutes = resolveMaxSyncAgeMinutes();

  if (!summaryAccounts.length) {
    issues.push("El snapshot summary no contiene cuentas.");
  }
  if (!accounts.length) {
    issues.push("El snapshot full no contiene cuentas.");
  }

  compareSummaryAndFull(summary, full, issues);

  const accountAudits = accounts.map((account, index) =>
    auditAccount(account, index, { now, maxSyncAgeMinutes }),
  );
  accountAudits.forEach((accountAudit) => {
    issues.push(...accountAudit.issues);
    warnings.push(...accountAudit.warnings);
  });

  return {
    status: issues.length ? "blocked" : warnings.length ? "partial" : "ready",
    maxSyncAgeMinutes,
    accountCount: accounts.length,
    accounts: accountAudits,
    issues,
    warnings,
  };
}

function printAudit({ summaryUrl, fullUrl, timeoutMs, audit }) {
  console.log("Live snapshot integrity");
  console.log(`Summary URL: ${summaryUrl}`);
  console.log(`Full URL: ${fullUrl}`);
  console.log(`Timeout: ${timeoutMs}ms`);
  console.log(`Max age: ${audit.maxSyncAgeMinutes}min`);
  console.log(`Estado: ${audit.status}`);
  console.log(`Cuentas: ${audit.accountCount}`);

  audit.accounts.forEach((account) => {
    const ageLabel = account.ageMinutes === null ? "sin lectura" : `${account.ageMinutes} min`;
    console.log(
      `- ${account.label} (${account.loginLabel}): ${account.status || "sin estado"}, ${ageLabel}, balance=${account.balance ?? "n/a"}, equity=${account.equity ?? "n/a"}`,
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
  const timeoutMs = resolveTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const [summaryResult, fullResult] = await Promise.all([
      fetchSnapshot("summary", { signal: controller.signal }),
      fetchSnapshot("full", { signal: controller.signal }),
    ]);
    const audit = auditSnapshots(summaryResult.snapshot, fullResult.snapshot);
    printAudit({
      summaryUrl: summaryResult.url,
      fullUrl: fullResult.url,
      timeoutMs,
      audit,
    });

    if (audit.status === "blocked") process.exit(1);
  } finally {
    clearTimeout(timeout);
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "No se pudo auditar integridad live.",
  );
  process.exit(1);
}
