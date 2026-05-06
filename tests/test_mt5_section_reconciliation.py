from __future__ import annotations

import json
import os
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class Mt5SectionReconciliationTests(unittest.TestCase):
    def run_node(self, script: str, *, timezone: str = "America/Los_Angeles") -> dict:
        loader = """
          import fs from "node:fs";

          function loadSource(path) {
            return fs.readFileSync(path, "utf8")
              .replace(/^import .*$/gm, "")
              .replace(/export function /g, "function ")
              .replace(/export const /g, "const ");
          }

          eval(`${loadSource("./js/data/adapters/mt5-account-adapter.js")}\\nglobalThis.__mt5AdapterHooks = { normalizeTrades };`);
          eval(`${loadSource("./js/modules/utils.js")}\\nglobalThis.__utilsHooks = { getAccountingDayKey, getAccountingMonthKey, getAccountingHour, getAccountingWeekdayIndex, buildDashboardModel };`);

          const getAccountingDayKey = globalThis.__utilsHooks.getAccountingDayKey;
          const getAccountingMonthKey = globalThis.__utilsHooks.getAccountingMonthKey;
          const getAccountingHour = globalThis.__utilsHooks.getAccountingHour;
          const getAccountingWeekdayIndex = globalThis.__utilsHooks.getAccountingWeekdayIndex;

          eval(`${loadSource("./js/modules/calendar.js")}\\nglobalThis.__calendarHooks = { getCalendarTradeDayKey };`);
          eval(`${loadSource("./js/modules/analytics.js")}\\nglobalThis.__analyticsHooks = { getTradeRealizedDayKey };`);
          eval(`${loadSource("./js/modules/discipline.js")}\\nglobalThis.__disciplineHooks = { groupTradesByDay };`);

          const adapter = globalThis.__mt5AdapterHooks;
          const utils = globalThis.__utilsHooks;
          const calendar = globalThis.__calendarHooks;
          const analytics = globalThis.__analyticsHooks;
          const discipline = globalThis.__disciplineHooks;

          function buildXauPartialModel() {
            const trades = adapter.normalizeTrades([
              {
                trade_id: "xau-partial-a",
                ticket: "xau-partial-a",
                position_id: "xau-cross-day-position",
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
                trade_id: "xau-partial-b",
                ticket: "xau-partial-b",
                position_id: "xau-cross-day-position",
                symbol: "XAUUSD",
                type: "SELL",
                volume: 0.3,
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
            return { trades, model };
          }
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

    def test_calendar_dashboard_analytics_and_discipline_share_close_day(self) -> None:
        result = self.run_node(
            """
            const { trades, model } = buildXauPartialModel();
            const trade = model.trades[0];
            const calendarDayA = model.trades.filter((item) => calendar.getCalendarTradeDayKey(item) === "2026-05-01");
            const calendarDayB = model.trades.filter((item) => calendar.getCalendarTradeDayKey(item) === "2026-05-02");
            const dayAStats = model.dayStats.find((day) => day.key === "2026-05-01");
            const dayBStats = model.dayStats.find((day) => day.key === "2026-05-02");
            const analyticsDayB = model.trades.filter((item) => analytics.getTradeRealizedDayKey(item) === "2026-05-02");
            const disciplineDayMap = discipline.groupTradesByDay(model.trades);
            const disciplineDayA = disciplineDayMap.get("2026-05-01");
            const disciplineDayB = disciplineDayMap.get("2026-05-02");
            console.log(JSON.stringify({
              normalizedTrades: trades.length,
              operacionesRows: model.trades.length,
              partialCount: trade.partialCount,
              executionCount: trade.executions.length,
              calendarDayATrades: calendarDayA.length,
              calendarDayBTrades: calendarDayB.length,
              dayAPnl: dayAStats?.pnl || 0,
              dayATrades: dayAStats?.trades || 0,
              dayBPnl: dayBStats?.pnl || 0,
              dayBTrades: dayBStats?.trades || 0,
              dashboardTotalPnl: model.totals.pnl,
              analyticsDayBTrades: analyticsDayB.length,
              disciplineDayATrades: disciplineDayA?.trades.length || 0,
              disciplineDayBTrades: disciplineDayB?.trades.length || 0,
            }));
            """
        )

        self.assertEqual(result["normalizedTrades"], 1)
        self.assertEqual(result["operacionesRows"], 1)
        self.assertEqual(result["partialCount"], 2)
        self.assertEqual(result["executionCount"], 2)
        self.assertEqual(result["calendarDayATrades"], 0)
        self.assertEqual(result["calendarDayBTrades"], 1)
        self.assertEqual(result["dayAPnl"], 0)
        self.assertEqual(result["dayATrades"], 0)
        self.assertAlmostEqual(result["dayBPnl"], 57)
        self.assertEqual(result["dayBTrades"], 1)
        self.assertAlmostEqual(result["dashboardTotalPnl"], 57)
        self.assertEqual(result["analyticsDayBTrades"], 1)
        self.assertEqual(result["disciplineDayATrades"], 0)
        self.assertEqual(result["disciplineDayBTrades"], 1)

    def test_section_day_keys_do_not_depend_on_browser_timezone(self) -> None:
        result = self.run_node(
            """
            const { model } = buildXauPartialModel();
            const trade = model.trades[0];
            console.log(JSON.stringify({
              tradeDay: trade.tradingDayKey,
              calendarDay: calendar.getCalendarTradeDayKey(trade),
              analyticsDay: analytics.getTradeRealizedDayKey(trade),
              disciplineDay: [...discipline.groupTradesByDay(model.trades).keys()][0],
              accountingHour: utils.getAccountingHour(trade.when),
              browserHour: trade.when.getHours(),
            }));
            """,
            timezone="Pacific/Honolulu",
        )

        self.assertEqual(result["tradeDay"], "2026-05-02")
        self.assertEqual(result["calendarDay"], "2026-05-02")
        self.assertEqual(result["analyticsDay"], "2026-05-02")
        self.assertEqual(result["disciplineDay"], "2026-05-02")
        self.assertEqual(result["accountingHour"], 0)
        self.assertNotEqual(result["browserHour"], result["accountingHour"])


if __name__ == "__main__":
    unittest.main()
