import { afterEach, describe, expect, it, vi } from "vitest";

import type { RawLiveAccountsSnapshot } from "@/lib/contracts/live-snapshot";
import { createWorkspaceFromLiveSnapshot } from "@/lib/data/live-snapshot-adapter";
import fixtureSnapshot from "@/lib/data/fixtures/live-accounts-snapshot.fixture.json";
import marketingSnapshot from "@/lib/data/fixtures/marketing-accounts-snapshot.fixture.json";
import { getAccountsOverview } from "@/lib/domain/accounts-selectors";
import { resolveFundingRuleForAccount } from "@/lib/domain/funding-rule-catalog";
import { countClosedTradeExecutions } from "@/lib/domain/trades-selectors";

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

  it("keeps authenticated users without accounts on a real empty workspace", () => {
    const workspace = createWorkspaceFromLiveSnapshot({ accounts: [] }, "live");

    expect(workspace.meta).toEqual({
      sourceLabel: "Sin cuentas conectadas",
      sourceMode: "live",
    });
    expect(workspace.activeAccountId).toBe("");
    expect(workspace.accounts).toEqual([]);
    expect(workspace.trades).toEqual([]);
    expect(workspace.dashboard.title).toBe("Panel operativo");
    expect(workspace.dashboard.metrics.map((metric) => metric.id)).toEqual([
      "equity",
      "open-pnl",
      "daily-room",
      "open-heat",
    ]);
  });

  it("carries live auth identity into workspace metadata", () => {
    const workspace = createWorkspaceFromLiveSnapshot(
      {
        accounts: [],
        auth_email: "kevinmartinezpallares@hotmail.com",
        is_admin: false,
      },
      "live",
    );

    expect(workspace.meta).toMatchObject({
      userEmail: "kevinmartinezpallares@hotmail.com",
      userRoleLabel: "Usuario",
    });
  });

  it("replaces pending MT5 placeholder labels with broker identity after sync", () => {
    const workspace = createWorkspaceFromLiveSnapshot(
      {
        accounts: [
          {
            account_id: "pending-darwinex",
            display_name: "Nueva cuenta MT5",
            broker: "Tradeslide Trading Tech Limited",
            login: "4000082126",
            server: "Darwinex-Live",
            status: "active",
            last_sync_at: "2026-05-30T14:30:00Z",
            dashboard_payload: {
              accountName: "Nueva cuenta MT5",
              balance: 100000,
              broker: "Tradeslide Trading Tech Limited",
              equity: 106286,
              server: "Darwinex-Live",
            },
          },
        ],
      },
      "fixture",
    );

    expect(workspace.accounts[0]?.label).toBe("Darwinex MT5");
  });

  it("identifies The Funding Pips exam metadata from connected account labels", () => {
    const workspace = createWorkspaceFromLiveSnapshot(
      {
        accounts: [
          {
            account_id: "tfp-step-2",
            display_name: "The Funding Pips 100K 2-Step Standard Step 2",
            broker: "The Funding Pips",
            login: "77***02",
            server: "TFP-Server01",
            status: "active",
            last_sync_at: "2026-05-30T14:30:00Z",
            dashboard_payload: {
              balance: 100000,
              equity: 100000,
              riskSnapshot: {
                policy: {
                  daily_dd_limit_pct: 5,
                  max_dd_limit_pct: 10,
                  portfolio_heat_limit_pct: 5,
                },
                summary: {
                  daily_drawdown_pct: 0,
                  distance_to_daily_dd_limit_pct: 5,
                  max_drawdown_limit_pct: 10,
                  peak_to_equity_drawdown_pct: 0,
                  portfolio_heat_limit_pct: 5,
                  total_open_risk_pct: 0,
                },
              },
            },
          },
        ],
      },
      "live",
    );

    const account = workspace.accounts[0]!;

    expect(account.funding).toMatchObject({
      accountMode: "evaluation",
      firm: "The Funding Pips",
      objectivePct: 5,
      phaseLabel: "Step 2",
      playbookLabel: "2 Step Standard",
    });
    expect(resolveFundingRuleForAccount(account)).toMatchObject({
      status: "verified",
    });
  });

  it("identifies The5ers High Stakes phase 1 when target is present in the account name", () => {
    const workspace = createWorkspaceFromLiveSnapshot(
      {
        accounts: [
          {
            account_id: "the5ers-high-stakes",
            display_name: "The5ers High Stakes 100K Phase 1 10%",
            broker: "The5ers",
            login: "88***10",
            server: "The5ers-Demo",
            status: "active",
            last_sync_at: "2026-05-30T14:30:00Z",
            dashboard_payload: {
              balance: 100000,
              equity: 100000,
              riskSnapshot: {
                policy: {
                  daily_dd_limit_pct: 5,
                  max_dd_limit_pct: 10,
                  portfolio_heat_limit_pct: 5,
                },
              },
            },
          },
        ],
      },
      "live",
    );

    const account = workspace.accounts[0]!;

    expect(account.funding).toMatchObject({
      accountMode: "challenge",
      firm: "The5ers",
      objectivePct: 10,
      phaseLabel: "Fase 1",
      playbookLabel: "High Stakes",
    });
    expect(resolveFundingRuleForAccount(account)).toMatchObject({
      status: "verified",
    });
  });

  it("does not classify a normal Darwinex MT5 account as Darwinex Zero", () => {
    const workspace = createWorkspaceFromLiveSnapshot(
      {
        accounts: [
          {
            account_id: "darwinex-live-normal",
            display_name: "Darwinex MT5",
            broker: "Darwinex",
            login: "40***26",
            server: "Darwinex-Live",
            status: "active",
            last_sync_at: "2026-05-30T14:30:00Z",
            dashboard_payload: {
              balance: 100000,
              equity: 100000,
            },
          },
        ],
      },
      "live",
    );

    expect(workspace.accounts[0]?.isFunded).toBe(false);
    expect(workspace.accounts[0]?.funding).toBeUndefined();
  });

  it("backfills short equity history with older MT5 closes for portfolio timelines", () => {
    const workspace = createWorkspaceFromLiveSnapshot(
      {
        accounts: [
          {
            account_id: "darwinex-live",
            display_name: "Darwinex MT5",
            broker: "Tradeslide Trading Tech Limited",
            login: "4000082126",
            server: "Darwinex-Live",
            status: "active",
            last_sync_at: "2026-05-30T14:30:00Z",
            dashboard_payload: {
              balance: 106000,
              equity: 106000,
              history: [
                { timestamp: "2026-03-22T08:00:00Z", value: 103500 },
                { timestamp: "2026-05-30T14:30:00Z", value: 106000 },
              ],
              trades: [
                {
                  trade_id: "jan-close-1",
                  position_id: "jan-position-1",
                  symbol: "XAUUSD",
                  direction: "buy",
                  open_time: "2026-01-12T08:00:00Z",
                  close_time: "2026-01-12T09:00:00Z",
                  net: 1000,
                },
                {
                  trade_id: "feb-close-1",
                  position_id: "feb-position-1",
                  symbol: "XAUUSD",
                  direction: "sell",
                  open_time: "2026-02-10T08:00:00Z",
                  close_time: "2026-02-10T09:00:00Z",
                  net: -500,
                },
              ],
            },
          },
        ],
      },
      "live",
    );

    const history = workspace.accounts[0]?.equityHistory ?? [];

    expect(history.at(0)?.timestamp).toBe("2026-01-12T08:59:00.000Z");
    expect(history.at(0)?.value).toBe(103000);
    expect(history.some((point) => point.timestamp === "2026-03-22T08:00:00Z")).toBe(
      true,
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

  it("counts MT5 closes consistently for any active connected account", () => {
    const workspace = createWorkspaceFromLiveSnapshot(
      {
        accounts: [
          {
            account_id: "darwinex-live",
            display_name: "Cuenta Real MT5",
            broker: "Tradeslide Trading Tech Limited",
            login: "40***26",
            server: "Darwinex-Live",
            status: "active",
            last_sync_at: "2026-05-28T09:00:00Z",
            is_default: true,
            dashboard_payload: {
              balance: 100000,
              equity: 100250,
              reportMetrics: { totalTrades: 1, winRate: 100 },
              trades: [
                {
                  trade_id: "darwinex-close-1",
                  position_id: "darwinex-position-1",
                  symbol: "XAUUSD",
                  direction: "buy",
                  volume: 0.1,
                  open_time: "2026-05-27T09:00:00Z",
                  close_time: "2026-05-27T10:00:00Z",
                  net: 250,
                },
              ],
            },
          },
          {
            account_id: "ic-markets-live",
            display_name: "IC Markets MT5",
            broker: "Raw Trading Ltd",
            login: "52***04",
            server: "ICMarketsSC",
            status: "active",
            last_sync_at: "2026-05-28T09:00:00Z",
            dashboard_payload: {
              balance: 140000,
              equity: 139950,
              reportMetrics: { totalTrades: 3, winRate: 67 },
              trades: [
                {
                  trade_id: "ic-close-1a",
                  position_id: "ic-position-1",
                  symbol: "EURUSD",
                  direction: "sell",
                  volume: 0.2,
                  open_time: "2026-05-27T09:00:00Z",
                  close_time: "2026-05-27T10:00:00Z",
                  net: 40,
                },
                {
                  trade_id: "ic-close-1b",
                  position_id: "ic-position-1",
                  symbol: "EURUSD",
                  direction: "sell",
                  volume: 0.1,
                  open_time: "2026-05-27T09:00:00Z",
                  close_time: "2026-05-27T10:05:00Z",
                  net: 10,
                },
                {
                  trade_id: "ic-close-2",
                  position_id: "ic-position-2",
                  symbol: "XAUUSD",
                  direction: "buy",
                  volume: 0.1,
                  open_time: "2026-05-27T11:00:00Z",
                  close_time: "2026-05-27T12:00:00Z",
                  net: -100,
                },
              ],
            },
          },
        ],
      },
      "live",
      "ic-markets-live",
    );

    expect(workspace.activeAccountId).toBe("ic-markets-live");
    expect(workspace.trades).toHaveLength(2);
    expect(countClosedTradeExecutions(workspace.trades)).toBe(3);
    expect(workspace.analytics.daily[0]?.trades).toBe(3);
    expect(workspace.analytics.performance.totalTrades).toBe(3);
    expect(workspace.dashboard.pulseItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Trades cerrados", value: "3" }),
      ]),
    );
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
    expect(workspace.accounts[0]?.equityHistory).toEqual([
      { label: "27 may", value: 105000, timestamp: "2026-05-27T08:00:00Z" },
      { label: "28 may", value: 105968.11, timestamp: "2026-05-28T09:00:00Z" },
    ]);
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

  it("keeps the owner marketing fixture rich enough for public dashboard captures", () => {
    const fixture = marketingSnapshot as RawLiveAccountsSnapshot;
    const accounts = fixture.accounts ?? [];
    const totals = accounts.map((account) =>
      Number(account.dashboard_payload?.totalPnl ?? 0),
    );

    expect(fixture.auth_email).toBe("kevinmartinezpallares@gmail.com");
    expect(accounts).toHaveLength(7);
    expect(accounts.map((account) => account.display_name)).toEqual([
      "Darwinex Zero 100K",
      "IC Markets Real",
      "FTMO Fase 1 100K",
      "The5ers Fase 2 100K",
      "Orion Funded 50K",
      "Pepperstone Demo 10K",
      "Funding Pips Funded 200K",
    ]);
    expect(totals.some((value) => value > 0)).toBe(true);
    expect(totals.some((value) => value < 0)).toBe(true);
    expect(
      accounts.reduce(
        (sum, account) => sum + (account.dashboard_payload?.trades?.length ?? 0),
        0,
      ),
    ).toBeGreaterThan(600);

    const workspace = createWorkspaceFromLiveSnapshot(fixture, "fixture");

    expect(workspace.accounts).toHaveLength(7);
    expect(workspace.accounts[0]?.label).toBe("Darwinex Zero 100K");
    expect(workspace.trades.length).toBeGreaterThan(100);
    expect(workspace.analytics.performance.totalTrades).toBeGreaterThan(100);
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
