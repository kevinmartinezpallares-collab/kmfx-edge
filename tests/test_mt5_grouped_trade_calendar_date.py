from __future__ import annotations

import json
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class Mt5GroupedTradeCalendarDateTests(unittest.TestCase):
    def run_node(self, ordering: str) -> dict:
        script = f"""
          import fs from "node:fs";

          let source = fs.readFileSync("./js/data/adapters/mt5-account-adapter.js", "utf8");
          source = source
            .replace(/^import .*$/gm, "")
            .replace(/export function /g, "function ");
          eval(`${{source}}\\nglobalThis.__mt5AdapterHooks = {{ normalizeTrades }};`);
          const hooks = globalThis.__mt5AdapterHooks;

          const partialDayA = {{
            trade_id: "7001",
            ticket: "7001",
            position_id: "xau-cross-day-1",
            symbol: "XAUUSD",
            type: "SELL",
            volume: 0.30,
            price: 2352.10,
            open_price: 2338.50,
            open_time: "2026.05.01 22:15:00",
            close_time: "2026.05.01 23:40:00",
            time: "2026.05.01 23:40:00",
            profit: 120,
            commission: -4,
            swap: 0,
            net: 116,
          }};

          const finalDayB = {{
            trade_id: "7002",
            ticket: "7002",
            position_id: "xau-cross-day-1",
            symbol: "XAUUSD",
            type: "SELL",
            volume: 0.20,
            price: 2361.30,
            open_price: 2338.50,
            open_time: "2026.05.01 22:15:00",
            close_time: "2026.05.02 00:25:00",
            time: "2026.05.02 00:25:00",
            profit: 90,
            commission: -3,
            swap: 0,
            net: 87,
          }};

          const trades = "{ordering}" === "newest-first"
            ? [finalDayB, partialDayA]
            : [partialDayA, finalDayB];

          const normalizedTrades = hooks.normalizeTrades(trades);
          const groupedTrade = normalizedTrades[0];
          const dayBuckets = normalizedTrades.reduce((map, trade) => {{
            const bucket = map.get(trade.tradingDayKey) || {{ pnl: 0, trades: 0 }};
            bucket.pnl += Number(trade.net || trade.pnl || 0);
            bucket.trades += 1;
            map.set(trade.tradingDayKey, bucket);
            return map;
          }}, new Map());
          const dayA = dayBuckets.get("2026-05-01") || null;
          const dayB = dayBuckets.get("2026-05-02") || null;

          console.log(JSON.stringify({{
            tradeCount: normalizedTrades.length,
            id: groupedTrade.id,
            symbol: groupedTrade.symbol,
            closeTime: groupedTrade.closeTime,
            date: groupedTrade.date,
            when: groupedTrade.when.toISOString(),
            tradingDayKey: groupedTrade.tradingDayKey,
            monthKey: groupedTrade.monthKey,
            pnl: groupedTrade.pnl,
            net: groupedTrade.net,
            partialCount: groupedTrade.partialCount,
            executionCount: groupedTrade.executions.length,
            executionCloseTimes: groupedTrade.executions.map((execution) => execution.closeTime),
            dayA: dayA ? {{ pnl: dayA.pnl, trades: dayA.trades }} : null,
            dayB: dayB ? {{ pnl: dayB.pnl, trades: dayB.trades }} : null,
          }}));
        """
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", textwrap.dedent(script)],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        return json.loads(proc.stdout.strip().splitlines()[-1])

    def assert_grouped_xau_trade_uses_final_close_day(self, result: dict) -> None:
        self.assertEqual(result["tradeCount"], 1)
        self.assertEqual(result["symbol"], "XAUUSD")
        self.assertTrue(result["closeTime"].startswith("2026-05-02T00:25:00"))
        self.assertEqual(result["date"], result["closeTime"])
        self.assertTrue(result["when"].startswith("2026-05-02T00:25:00"))
        self.assertEqual(result["tradingDayKey"], "2026-05-02")
        self.assertEqual(result["monthKey"], "2026-05")
        self.assertAlmostEqual(result["pnl"], 203)
        self.assertAlmostEqual(result["net"], 203)
        self.assertEqual(result["partialCount"], 2)
        self.assertEqual(result["executionCount"], 2)
        self.assertEqual(result["dayA"], None)
        self.assertEqual(result["dayB"], {"pnl": 203, "trades": 1})

    def test_grouped_xau_partial_close_uses_final_day_newest_first(self) -> None:
        self.assert_grouped_xau_trade_uses_final_close_day(self.run_node("newest-first"))

    def test_grouped_xau_partial_close_uses_final_day_oldest_first(self) -> None:
        self.assert_grouped_xau_trade_uses_final_close_day(self.run_node("oldest-first"))


if __name__ == "__main__":
    unittest.main()
