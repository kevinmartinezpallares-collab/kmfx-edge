from __future__ import annotations

import json
import os
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class Mt5TimezoneContractTests(unittest.TestCase):
    def run_node(self, script: str, *, timezone: str = "America/Los_Angeles") -> dict:
        loader = """
          import fs from "node:fs";

          let adapterSource = fs.readFileSync("./js/data/adapters/mt5-account-adapter.js", "utf8");
          adapterSource = adapterSource
            .replace(/^import .*$/gm, "")
            .replace(/export function /g, "function ");
          eval(`${adapterSource}\\nglobalThis.__mt5AdapterHooks = { normalizeTrades };`);

          let utilsSource = fs.readFileSync("./js/modules/utils.js", "utf8");
          utilsSource = utilsSource
            .replace(/^import .*$/gm, "")
            .replace(/export function /g, "function ");
          eval(`${utilsSource}\\nglobalThis.__utilsHooks = { getAccountingDayKey, getAccountingMonthKey, buildDashboardModel };`);

          const adapter = globalThis.__mt5AdapterHooks;
          const utils = globalThis.__utilsHooks;
        """
        env = {**os.environ, "TZ": timezone}
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", textwrap.dedent(loader + script)],
            cwd=ROOT,
            env=env,
            text=True,
            capture_output=True,
            check=True,
        )
        return json.loads(proc.stdout.strip().splitlines()[-1])

    def test_accounting_day_uses_europe_andorra_not_browser_timezone(self) -> None:
        result = self.run_node(
            """
            const trades = adapter.normalizeTrades([{
              trade_id: "tz-1",
              ticket: "tz-1",
              position_id: "tz-position-1",
              symbol: "XAUUSD",
              type: "SELL",
              volume: 0.1,
              open_time_unix: 1777669200,
              time_unix: 1777674600,
              open_time: "2026.05.01 20:00:00",
              time: "2026.05.01 10:00:00",
              profit: 50,
              commission: 0,
              swap: 0,
            }]);
            const trade = trades[0];
            console.log(JSON.stringify({
              closeTime: trade.closeTime,
              tradingDayKey: trade.tradingDayKey,
              monthKey: trade.monthKey,
              helperDay: utils.getAccountingDayKey("2026-05-01T22:30:00.000Z"),
              helperMonth: utils.getAccountingMonthKey("2026-05-01T22:30:00.000Z"),
            }));
            """
        )

        self.assertEqual(result["closeTime"], "2026-05-01T22:30:00.000Z")
        self.assertEqual(result["tradingDayKey"], "2026-05-02")
        self.assertEqual(result["monthKey"], "2026-05")
        self.assertEqual(result["helperDay"], "2026-05-02")
        self.assertEqual(result["helperMonth"], "2026-05")

    def test_unix_timestamp_wins_over_ambiguous_mt5_string(self) -> None:
        result = self.run_node(
            """
            const trade = adapter.normalizeTrades([{
              trade_id: "unix-wins",
              ticket: "unix-wins",
              position_id: "unix-wins-position",
              symbol: "XAUUSD",
              type: "SELL",
              volume: 0.1,
              open_time: "2026.05.01 08:00:00",
              open_time_unix: 1777622400,
              time: "2026.05.01 10:00:00",
              time_unix: 1777761000,
              profit: 10,
              commission: 0,
              swap: 0,
            }])[0];
            console.log(JSON.stringify({
              openTime: trade.openTime,
              closeTime: trade.closeTime,
              tradingDayKey: trade.tradingDayKey,
            }));
            """
        )

        self.assertEqual(result["openTime"], "2026-05-01T08:00:00.000Z")
        self.assertEqual(result["closeTime"], "2026-05-02T22:30:00.000Z")
        self.assertEqual(result["tradingDayKey"], "2026-05-03")

    def test_audusd_buy_pips_are_calculated_from_entry_and_exit_prices(self) -> None:
        result = self.run_node(
            """
            const trade = adapter.normalizeTrades([{
              trade_id: "3153889450",
              ticket: "3153889450",
              position_id: "3153889450",
              symbol: "AUDUSD",
              type: "SELL",
              volume: 6,
              open_price: 0.71226,
              price: 0.71125,
              open_time: "2026.05.19 11:09:04",
              close_time: "2026.05.19 12:15:34",
              time: "2026.05.19 12:15:34",
              profit: -606,
              commission: -21.35,
              swap: 0,
            }])[0];
            console.log(JSON.stringify({
              side: trade.side,
              entry: trade.entry,
              exit: trade.exit,
              pips: trade.pips,
              pnl: trade.pnl,
            }));
            """
        )

        self.assertEqual(result["side"], "BUY")
        self.assertAlmostEqual(result["entry"], 0.71226)
        self.assertAlmostEqual(result["exit"], 0.71125)
        self.assertAlmostEqual(result["pips"], -10.1)
        self.assertAlmostEqual(result["pnl"], -627.35)

    def test_cross_day_partial_uses_final_close_accounting_day(self) -> None:
        result = self.run_node(
            """
            const trade = adapter.normalizeTrades([
              {
                trade_id: "partial-a",
                ticket: "partial-a",
                position_id: "partial-position",
                symbol: "XAUUSD",
                type: "SELL",
                volume: 0.2,
                open_time_unix: 1777658400,
                time_unix: 1777665600,
                profit: 20,
                commission: -1,
                swap: 0,
              },
              {
                trade_id: "partial-b",
                ticket: "partial-b",
                position_id: "partial-position",
                symbol: "XAUUSD",
                type: "SELL",
                volume: 0.3,
                open_time_unix: 1777658400,
                time_unix: 1777674600,
                profit: 40,
                commission: -2,
                swap: 0,
              },
            ])[0];
            console.log(JSON.stringify({
              tradeCount: 1,
              closeTime: trade.closeTime,
              tradingDayKey: trade.tradingDayKey,
              partialCount: trade.partialCount,
              net: trade.net,
            }));
            """
        )

        self.assertEqual(result["closeTime"], "2026-05-01T22:30:00.000Z")
        self.assertEqual(result["tradingDayKey"], "2026-05-02")
        self.assertEqual(result["partialCount"], 2)
        self.assertAlmostEqual(result["net"], 57)

    def test_month_boundary_uses_accounting_month(self) -> None:
        result = self.run_node(
            """
            const trade = adapter.normalizeTrades([{
              trade_id: "month-boundary",
              ticket: "month-boundary",
              position_id: "month-boundary-position",
              symbol: "XAUUSD",
              type: "SELL",
              volume: 0.1,
              open_time_unix: 1777582800,
              time_unix: 1777588200,
              profit: 25,
              commission: 0,
              swap: 0,
            }])[0];
            console.log(JSON.stringify({
              closeTime: trade.closeTime,
              tradingDayKey: trade.tradingDayKey,
              monthKey: trade.monthKey,
            }));
            """
        )

        self.assertEqual(result["closeTime"], "2026-04-30T22:30:00.000Z")
        self.assertEqual(result["tradingDayKey"], "2026-05-01")
        self.assertEqual(result["monthKey"], "2026-05")

    def test_minimal_model_daystats_count_grouped_trade_once(self) -> None:
        result = self.run_node(
            """
            const trades = adapter.normalizeTrades([
              {
                trade_id: "model-a",
                ticket: "model-a",
                position_id: "model-position",
                symbol: "XAUUSD",
                type: "SELL",
                volume: 0.1,
                open_time_unix: 1777658400,
                time_unix: 1777665600,
                profit: 20,
                commission: -1,
                swap: 0,
              },
              {
                trade_id: "model-b",
                ticket: "model-b",
                position_id: "model-position",
                symbol: "XAUUSD",
                type: "SELL",
                volume: 0.2,
                open_time_unix: 1777658400,
                time_unix: 1777674600,
                profit: 40,
                commission: -2,
                swap: 0,
              },
            ]);
            const model = utils.buildDashboardModel({
              profile: { payloadSource: "mt5_sync_live" },
              account: { balance: 10000, equity: 10000, openPnl: 0, closedPnl: 57, totalPnl: 57 },
              positions: [],
              trades,
              history: [],
            });
            const day = model.dayStats.find((entry) => entry.key === "2026-05-02");
            console.log(JSON.stringify({
              trades: model.trades.length,
              dayPnl: day?.pnl,
              dayTrades: day?.trades,
              totalPnl: model.totals.pnl,
            }));
            """
        )

        self.assertEqual(result["trades"], 1)
        self.assertEqual(result["dayTrades"], 1)
        self.assertAlmostEqual(result["dayPnl"], 57)
        self.assertAlmostEqual(result["totalPnl"], 57)

    def test_calendar_cell_label_uses_accounting_day_key_not_browser_timezone(self) -> None:
        result = self.run_node(
            """
            let calendarSource = fs.readFileSync("./js/modules/calendar.js", "utf8");
            calendarSource = calendarSource
              .replace(/^import .*$/gm, "")
              .replace(/export function /g, "function ");
            calendarSource = `const getAccountingDayKey = globalThis.__utilsHooks.getAccountingDayKey; const getAccountingMonthKey = globalThis.__utilsHooks.getAccountingMonthKey;\\n${calendarSource}`;
            eval(`${calendarSource}\\nglobalThis.__calendarHooks = { buildMonthView, calendarDayNumber, formatCalendarDayKeyLong };`);

            const month = globalThis.__calendarHooks.buildMonthView([
              { key: "2026-05-19", pnl: 1940, trades: 3 }
            ], "2026-05");
            const tradedCell = month.cells.find((cell) => cell.trades === 3);

            console.log(JSON.stringify({
              key: tradedCell.key,
              visibleDay: globalThis.__calendarHooks.calendarDayNumber(tradedCell.key),
              title: globalThis.__calendarHooks.formatCalendarDayKeyLong(tradedCell.key),
            }));
            """,
            timezone="Asia/Tokyo",
        )

        self.assertEqual(result["key"], "2026-05-19")
        self.assertEqual(result["visibleDay"], 19)
        self.assertEqual(result["title"], "martes, 19 de mayo de 2026")


if __name__ == "__main__":
    unittest.main()
