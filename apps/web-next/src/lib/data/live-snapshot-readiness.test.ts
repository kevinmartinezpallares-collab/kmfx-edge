import { describe, expect, it } from "vitest";

import type { RawLiveAccountsSnapshot } from "@/lib/contracts/live-snapshot";
import { auditLiveSnapshotReadiness } from "@/lib/data/live-snapshot-readiness";

const now = new Date("2026-05-27T10:00:00Z");

describe("auditLiveSnapshotReadiness", () => {
  it("accepts a fresh read-only account without exposing raw account identifiers", () => {
    const audit = auditLiveSnapshotReadiness(
      {
        accounts: [
          {
            account_id: "real-account-id-that-must-not-leak",
            login: "12345678",
            status: "active",
            last_sync_at: "2026-05-27T09:57:00Z",
            dashboard_payload: {
              balance: 100000,
              equity: 100120,
              reportMetrics: {
                totalTrades: 12,
              },
            },
          },
        ],
      } satisfies RawLiveAccountsSnapshot,
      now,
    );

    expect(audit.status).toBe("ready");
    expect(audit.readyAccountCount).toBe(1);
    expect(audit.accounts[0]).toMatchObject({
      label: "Cuenta 1",
      loginLabel: "12***78",
      status: "connected",
      hasDashboardPayload: true,
      hasEquity: true,
      hasReportMetrics: true,
    });
    expect(JSON.stringify(audit)).not.toContain("real-account-id-that-must-not-leak");
    expect(JSON.stringify(audit)).not.toContain("12345678");
  });

  it("marks stale and pending accounts as partial when at least one account is usable", () => {
    const audit = auditLiveSnapshotReadiness(
      {
        accounts: [
          {
            login: "10***01",
            status: "active",
            last_sync_at: "2026-05-27T09:57:00Z",
            dashboard_payload: {
              balance: 100000,
              equity: 100010,
              reportMetrics: { totalTrades: 0 },
            },
          },
          {
            login: "20***02",
            status: "active",
            last_sync_at: "2026-05-27T09:20:00Z",
            dashboard_payload: {
              balance: 100000,
              equity: 99980,
            },
          },
          {
            login: "30***03",
            status: "pending_link",
            dashboard_payload: {
              balance: 100000,
              equity: 100000,
            },
          },
        ],
      } satisfies RawLiveAccountsSnapshot,
      now,
    );

    expect(audit.status).toBe("partial");
    expect(audit.readyAccountCount).toBe(1);
    expect(audit.staleAccountCount).toBe(1);
    expect(audit.pendingAccountCount).toBe(1);
    expect(audit.issues).toEqual([]);
    expect(audit.warnings).toEqual(
      expect.arrayContaining([
        "Cuenta 2: lectura desactualizada.",
        "Cuenta 2: faltan reportMetrics.",
        "Cuenta 3: lectura pendiente.",
      ]),
    );
  });

  it("blocks live account testing when no account has usable equity payload", () => {
    const audit = auditLiveSnapshotReadiness(
      {
        accounts: [
          {
            login: "40***04",
            status: "error",
            last_sync_at: "2026-05-27T09:59:00Z",
          },
        ],
      } satisfies RawLiveAccountsSnapshot,
      now,
    );

    expect(audit.status).toBe("blocked");
    expect(audit.readyAccountCount).toBe(0);
    expect(audit.issues).toEqual([
      "Cuenta 1: falta dashboard_payload.",
      "Cuenta 1: falta equity o balance valido.",
      "No hay ninguna cuenta lista para una prueba live read-only.",
    ]);
  });

  it("blocks empty snapshots", () => {
    const audit = auditLiveSnapshotReadiness({}, now);

    expect(audit.status).toBe("blocked");
    expect(audit.accountCount).toBe(0);
    expect(audit.issues).toEqual(["El snapshot no contiene cuentas."]);
  });
});
