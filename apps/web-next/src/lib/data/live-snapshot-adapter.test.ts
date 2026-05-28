import { afterEach, describe, expect, it, vi } from "vitest";

import type { RawLiveAccountsSnapshot } from "@/lib/contracts/live-snapshot";
import { createWorkspaceFromLiveSnapshot } from "@/lib/data/live-snapshot-adapter";
import fixtureSnapshot from "@/lib/data/fixtures/live-accounts-snapshot.fixture.json";
import { getAccountsOverview } from "@/lib/domain/accounts-selectors";

const partialCloseSnapshot = {
  accounts: [
    {
      account_id: "partial-close-account",
      display_name: "Partial Close Account",
      broker: "Darwinex",
      platform: "mt5",
      login: "10***01",
      server: "Darwinex-Live",
      status: "active",
      last_sync_at: "2026-05-22T16:30:00Z",
      is_default: true,
      dashboard_payload: {
        balance: 100000,
        equity: 100049.5,
        floatingPnl: 0,
        openPositionsCount: 0,
        reportMetrics: {
          netProfit: 49.5,
          grossProfit: 61.5,
          grossLoss: 0,
          profitFactor: 61.5,
          winRate: 100,
          totalTrades: 2,
        },
        trades: [
          {
            trade_id: "900003-a",
            position_id: "900003",
            symbol: "NAS100",
            direction: "buy",
            volume: 0.2,
            entry_price: 18490,
            exit_price: 18530,
            open_time: "2026-05-04T07:55:00.000Z",
            close_time: "2026-05-04T08:28:00.000Z",
            profit: 30,
            commission: -3,
            swap: 0,
            net: 27,
          },
          {
            trade_id: "900003-b",
            position_id: "900003",
            symbol: "NAS100",
            direction: "buy",
            volume: 0.2,
            entry_price: 18490,
            exit_price: 18555,
            open_time: "2026-05-04T07:55:00.000Z",
            close_time: "2026-05-04T09:12:00.000Z",
            profit: 31.5,
            commission: -9,
            swap: 0,
            net: 22.5,
          },
        ],
      },
    },
  ],
} satisfies RawLiveAccountsSnapshot;

describe("createWorkspaceFromLiveSnapshot", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the live fixture explicitly redacted", () => {
    const fixture = fixtureSnapshot as RawLiveAccountsSnapshot;

    expect(fixture.redaction).toMatchObject({
      redactionLevel: "synthetic",
      containsShiftedTimestamps: true,
      containsScaledFinancialValues: true,
    });
    expect(fixture.accounts?.every((account) => String(account.login).includes("***"))).toBe(
      true,
    );
  });

  it("normalises fixture accounts into the workspace contract", () => {
    const workspace = createWorkspaceFromLiveSnapshot(
      fixtureSnapshot as RawLiveAccountsSnapshot,
      "fixture",
    );

    expect(workspace.meta.sourceMode).toBe("fixture");
    expect(workspace.meta.sourceLabel).toBe("Lectura preparada");
    expect(workspace.activeAccountId).toBe("mt5-alpha-10000001");
    expect(workspace.accounts).toHaveLength(fixtureSnapshot.accounts.length);
    expect(workspace.dashboard.metrics.map((metric) => metric.id)).toEqual([
      "equity",
      "open-pnl",
      "daily-room",
      "open-heat",
    ]);
    expect(workspace.dashboard.pulseItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Origen",
          value: "Lectura preparada",
        }),
      ]),
    );
  });

  it("groups MT5 partial closes by position_id without duplicating trades", () => {
    const workspace = createWorkspaceFromLiveSnapshot(
      partialCloseSnapshot,
      "fixture",
    );
    const partialTrade = workspace.trades.find(
      (trade) => trade.positionId === "900003",
    );

    expect(workspace.trades).toHaveLength(1);
    expect(partialTrade).toBeDefined();
    expect(partialTrade?.symbol).toBe("NAS100");
    expect(partialTrade?.volume).toBe(0.4);
    expect(partialTrade?.netPnl).toBeCloseTo(49.5);
    expect(partialTrade?.executions).toHaveLength(2);
  });

  it("uses top-level MT5 metrics when merged live payloads omit reportMetrics", () => {
    const workspace = createWorkspaceFromLiveSnapshot(
      {
        accounts: [
          {
            account_id: "live-merged-account",
            display_name: "Cuenta Real MT5",
            broker: "Darwinex",
            login: "40***26",
            server: "Darwinex-Live",
            status: "active",
            last_sync_at: "2026-05-28T09:06:15Z",
            is_default: true,
            dashboard_payload: {
              balance: 105968.11,
              equity: 105968.11,
              closedPnl: 2151.12,
              totalPnl: 2151.12,
              totalTrades: 2,
              winRate: 50,
              history: [
                { timestamp: "2026-05-27T08:00:00Z", value: 105000 },
                { timestamp: "2026-05-28T09:00:00Z", value: 105968.11 },
              ],
              trades: [
                {
                  trade_id: "deal-1",
                  position_id: "pos-1",
                  symbol: "EURUSD",
                  type: "BUY",
                  volume: 0.1,
                  open_time: "2026-05-27T08:00:00Z",
                  time: "2026-05-27T09:00:00Z",
                  profit: 120,
                  commission: -5,
                  swap: 0,
                  net: 115,
                },
                {
                  trade_id: "deal-2",
                  position_id: "pos-2",
                  symbol: "XAUUSD",
                  type: "SELL",
                  volume: 0.1,
                  open_time: "2026-05-28T08:00:00Z",
                  time: "2026-05-28T09:00:00Z",
                  profit: -80,
                  commission: -3,
                  swap: 0,
                  net: -83,
                },
              ],
            },
          },
        ],
      },
      "live",
    );

    expect(workspace.trades).toHaveLength(2);
    expect(workspace.analytics.performance.totalTrades).toBe(2);
    expect(workspace.analytics.performance.winRatePct).toBe(50);
    expect(workspace.dashboard.pulseItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Trades cerrados", value: "2" }),
      ]),
    );
  });

  it("keeps the Darwinex fixture rich enough for one-year product review", () => {
    const fixture = fixtureSnapshot as RawLiveAccountsSnapshot;
    const activePayload = fixture.accounts?.[0]?.dashboard_payload;

    expect(fixture.accounts?.[0]?.display_name).toContain("Darwinex");
    expect(activePayload?.balance).toBeGreaterThan(100000);
    expect(activePayload?.history).toHaveLength(366);
    expect(activePayload?.history?.[0]?.timestamp).toBe("2025-05-23T00:00:00Z");
    expect(activePayload?.history?.at(-1)?.timestamp).toBe("2026-05-22T16:30:00Z");
    expect(activePayload?.trades).toHaveLength(213);
    expect(new Set(activePayload?.trades?.map((trade) => trade.symbol))).toEqual(
      new Set(["EURUSD", "NAS100", "USDCAD", "GBPUSD", "XAUUSD"]),
    );
  });

  it("builds daily and hourly buckets from the one-year close-time history", () => {
    const workspace = createWorkspaceFromLiveSnapshot(
      fixtureSnapshot as RawLiveAccountsSnapshot,
      "fixture",
    );

    expect(workspace.trades).toHaveLength(213);
    expect(workspace.analytics.daily).toHaveLength(148);
    expect(workspace.analytics.daily[0]?.tradingDayKey).toBe("2025-05-23");
    expect(workspace.analytics.daily.at(-1)?.tradingDayKey).toBe("2026-05-22");
    expect(workspace.analytics.hourly.map((hour) => hour.hour)).toEqual([
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
    ]);
  });

  it("propagates stale, pending and error account states from read-only MT5 snapshots", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-22T16:35:00Z"));

    const workspace = createWorkspaceFromLiveSnapshot(
      {
        accounts: [
          {
            account_id: "fresh",
            display_name: "Fresh Account",
            broker: "Darwinex",
            login: "10***01",
            server: "Darwinex-Live",
            status: "active",
            last_sync_at: "2026-05-22T16:32:00Z",
            is_default: true,
            dashboard_payload: {
              balance: 100000,
              equity: 100025,
              reportMetrics: { totalTrades: 0 },
            },
          },
          {
            account_id: "stale",
            display_name: "Stale Account",
            broker: "Darwinex",
            login: "10***02",
            server: "Darwinex-Live",
            status: "active",
            last_sync_at: "2026-05-22T16:00:00Z",
            dashboard_payload: {
              balance: 100000,
              equity: 99980,
              reportMetrics: { totalTrades: 0 },
            },
          },
          {
            account_id: "pending",
            display_name: "Pending Account",
            broker: "Darwinex",
            login: "10***03",
            server: "Darwinex-Live",
            status: "active",
            dashboard_payload: {
              balance: 100000,
              equity: 100000,
              reportMetrics: { totalTrades: 0 },
            },
          },
          {
            account_id: "errored",
            display_name: "Errored Account",
            broker: "Darwinex",
            login: "10***04",
            server: "Darwinex-Live",
            status: "error",
            last_sync_at: "2026-05-22T16:34:00Z",
            dashboard_payload: {
              balance: 100000,
              equity: 100000,
              reportMetrics: { totalTrades: 0 },
            },
          },
        ],
      },
      "live",
    );

    expect(
      workspace.accounts.map((account) => ({
        id: account.id,
        state: account.connectionState,
        tone: account.connectionTone,
      })),
    ).toEqual([
      { id: "fresh", state: "connected", tone: "connected" },
      { id: "stale", state: "stale", tone: "stale" },
      { id: "pending", state: "pending", tone: "warning" },
      { id: "errored", state: "error", tone: "danger" },
    ]);

    const overview = getAccountsOverview(workspace);

    expect(overview.status).toBe("partial");
    expect(overview.staleCount).toBe(2);
    expect(overview.attentionCount).toBe(3);
  });
});
