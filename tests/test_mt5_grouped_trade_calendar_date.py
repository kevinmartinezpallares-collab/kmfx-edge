from __future__ import annotations

import json
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class Mt5GroupedTradeCalendarDateTests(unittest.TestCase):
    def run_node(self, ordering: str, scenario: str = "cross-day") -> dict:
        script = f"""
          import fs from "node:fs";

          let source = fs.readFileSync("./js/data/adapters/mt5-account-adapter.js", "utf8");
          source = source
            .replace(/^import .*$/gm, "")
            .replace(/export function /g, "function ");
          eval(`${{source}}\\nglobalThis.__mt5AdapterHooks = {{ normalizeTrades }};`);
          const hooks = globalThis.__mt5AdapterHooks;

          const scenarios = {{}};

          scenarios["cross-day"] = () => {{
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
            swap: -1,
            fees: -2,
          }};

            const finalDayB = {{
            trade_id: "7002",
            ticket: "7002",
            position_id: "xau-cross-day-1",
            symbol: "XAUUSD",
            type: "SELL",
            volume: 0.20,
            price: 2361.30,
            open_price: 2339.00,
            open_time: "2026.05.01 22:15:00",
            close_time: "2026.05.02 00:25:00",
            time: "2026.05.02 00:25:00",
            profit: 90,
            commission: -3,
            swap: -2,
            fees: -1,
          }};
            return [partialDayA, finalDayB];
          }};

          scenarios["same-day"] = () => ([
            {{
              trade_id: "8001",
              ticket: "8001",
              position_id: "xau-same-day-1",
              symbol: "XAUUSD",
              type: "SELL",
              volume: 0.25,
              price: 2347.20,
              open_price: 2338.00,
              open_time: "2026.05.03 09:10:00",
              close_time: "2026.05.03 10:00:00",
              time: "2026.05.03 10:00:00",
              profit: 80,
              commission: -2,
              swap: 0,
            }},
            {{
              trade_id: "8002",
              ticket: "8002",
              position_id: "xau-same-day-1",
              symbol: "XAUUSD",
              type: "SELL",
              volume: 0.35,
              price: 2351.50,
              open_price: 2338.00,
              open_time: "2026.05.03 09:10:00",
              close_time: "2026.05.03 11:30:00",
              time: "2026.05.03 11:30:00",
              profit: 120,
              commission: -3,
              swap: -1,
            }},
          ]);

          scenarios["mixed"] = () => ([
            {{
              trade_id: "8101",
              ticket: "8101",
              position_id: "xau-mixed-1",
              symbol: "XAUUSD",
              type: "SELL",
              volume: 0.40,
              price: 2350.00,
              open_price: 2340.00,
              open_time: "2026.05.04 08:00:00",
              close_time: "2026.05.04 09:00:00",
              time: "2026.05.04 09:00:00",
              profit: 100,
              commission: -4,
              swap: 0,
            }},
            {{
              trade_id: "8102",
              ticket: "8102",
              position_id: "xau-mixed-1",
              symbol: "XAUUSD",
              type: "SELL",
              volume: 0.30,
              price: 2335.00,
              open_price: 2340.00,
              open_time: "2026.05.04 08:00:00",
              close_time: "2026.05.04 10:15:00",
              time: "2026.05.04 10:15:00",
              profit: -40,
              commission: -3,
              swap: -1,
            }},
          ]);

          scenarios["fallback-order"] = () => ([
            {{
              trade_id: "",
              ticket: "",
              order: "order-fallback-1",
              symbol: "XAUUSD",
              type: "SELL",
              volume: 0.10,
              price: 2350,
              open_price: 2340,
              open_time: "2026.05.05 08:00:00",
              close_time: "2026.05.05 09:00:00",
              time: "2026.05.05 09:00:00",
              profit: 20,
              commission: -1,
              swap: 0,
            }},
            {{
              trade_id: "",
              ticket: "",
              order: "order-fallback-1",
              symbol: "XAUUSD",
              type: "SELL",
              volume: 0.20,
              price: 2355,
              open_price: 2340,
              open_time: "2026.05.05 08:00:00",
              close_time: "2026.05.05 09:30:00",
              time: "2026.05.05 09:30:00",
              profit: 30,
              commission: -1,
              swap: 0,
            }},
          ]);

          scenarios["distinct-without-position"] = () => ([
            {{
              trade_id: "solo-1",
              ticket: "solo-1",
              symbol: "XAUUSD",
              type: "SELL",
              volume: 0.10,
              price: 2350,
              open_price: 2340,
              open_time: "2026.05.06 08:00:00",
              close_time: "2026.05.06 09:00:00",
              time: "2026.05.06 09:00:00",
              profit: 20,
              commission: -1,
              swap: 0,
            }},
            {{
              trade_id: "solo-2",
              ticket: "solo-2",
              symbol: "XAUUSD",
              type: "SELL",
              volume: 0.20,
              price: 2355,
              open_price: 2340,
              open_time: "2026.05.06 08:00:00",
              close_time: "2026.05.06 09:30:00",
              time: "2026.05.06 09:30:00",
              profit: 30,
              commission: -1,
              swap: 0,
            }},
          ]);

          scenarios["duplicate"] = () => ([
            {{
              trade_id: "dup-1",
              ticket: "dup-1",
              position_id: "xau-duplicate-1",
              symbol: "XAUUSD",
              type: "SELL",
              volume: 0.10,
              price: 2350,
              open_price: 2340,
              open_time: "2026.05.07 08:00:00",
              close_time: "2026.05.07 09:00:00",
              time: "2026.05.07 09:00:00",
              profit: 20,
              commission: -1,
              swap: 0,
            }},
            {{
              trade_id: "dup-1",
              ticket: "dup-1",
              position_id: "xau-duplicate-1",
              symbol: "XAUUSD",
              type: "SELL",
              volume: 0.10,
              price: 2350,
              open_price: 2340,
              open_time: "2026.05.07 08:00:00",
              close_time: "2026.05.07 09:00:00",
              time: "2026.05.07 09:00:00",
              profit: 20,
              commission: -1,
              swap: 0,
            }},
          ]);

          const sourceTrades = scenarios["{scenario}"]();
          const trades = "{ordering}" === "newest-first"
            ? [...sourceTrades].reverse()
            : sourceTrades;

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
            grossProfit: groupedTrade.grossProfit,
            profit: groupedTrade.profit,
            commission: groupedTrade.commission,
            swap: groupedTrade.swap,
            fees: groupedTrade.fees,
            volume: groupedTrade.volume,
            entry: groupedTrade.entry,
            exit: groupedTrade.exit,
            openTime: groupedTrade.openTime,
            durationMin: groupedTrade.durationMin,
            side: groupedTrade.side,
            partialCount: groupedTrade.partialCount,
            executionCount: groupedTrade.executions.length,
            executionCloseTimes: groupedTrade.executions.map((execution) => execution.closeTime),
            executions: groupedTrade.executions.map((execution) => ({{
              closeTime: execution.closeTime,
              volume: execution.volume,
              exit: execution.exit,
              pnl: execution.pnl,
              commission: execution.commission,
              swap: execution.swap,
              fees: execution.fees,
              cumulativePnl: execution.cumulativePnl,
            }})),
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
        self.assertAlmostEqual(result["pnl"], 197)
        self.assertAlmostEqual(result["net"], 197)
        self.assertAlmostEqual(result["grossProfit"], 210)
        self.assertAlmostEqual(result["profit"], 210)
        self.assertAlmostEqual(result["commission"], -7)
        self.assertAlmostEqual(result["swap"], -3)
        self.assertAlmostEqual(result["fees"], -3)
        self.assertAlmostEqual(result["volume"], 0.5)
        self.assertAlmostEqual(result["entry"], 2338.7)
        self.assertAlmostEqual(result["exit"], 2355.78)
        self.assertTrue(result["openTime"].startswith("2026-05-01T22:15:00"))
        self.assertEqual(result["durationMin"], 130)
        self.assertEqual(result["partialCount"], 2)
        self.assertEqual(result["executionCount"], 2)
        self.assertEqual(
            result["executionCloseTimes"],
            ["2026-05-01T23:40:00.000Z", "2026-05-02T00:25:00.000Z"],
        )
        self.assertEqual([execution["cumulativePnl"] for execution in result["executions"]], [113, 197])
        self.assertEqual(result["dayA"], None)
        self.assertEqual(result["dayB"], {"pnl": 197, "trades": 1})

    def test_grouped_xau_partial_close_uses_final_day_newest_first(self) -> None:
        self.assert_grouped_xau_trade_uses_final_close_day(self.run_node("newest-first"))

    def test_grouped_xau_partial_close_uses_final_day_oldest_first(self) -> None:
        self.assert_grouped_xau_trade_uses_final_close_day(self.run_node("oldest-first"))

    def test_same_day_partial_closes_group_once_with_total_volume_and_fees(self) -> None:
        result = self.run_node("oldest-first", "same-day")

        self.assertEqual(result["tradeCount"], 1)
        self.assertEqual(result["tradingDayKey"], "2026-05-03")
        self.assertAlmostEqual(result["pnl"], 194)
        self.assertAlmostEqual(result["net"], 194)
        self.assertAlmostEqual(result["grossProfit"], 200)
        self.assertAlmostEqual(result["commission"], -5)
        self.assertAlmostEqual(result["swap"], -1)
        self.assertAlmostEqual(result["volume"], 0.60)
        self.assertEqual(result["partialCount"], 2)
        self.assertEqual(result["executionCount"], 2)
        self.assertEqual([execution["cumulativePnl"] for execution in result["executions"]], [78, 194])

    def test_mixed_profit_loss_partials_classify_by_total_net(self) -> None:
        result = self.run_node("oldest-first", "mixed")

        self.assertEqual(result["tradeCount"], 1)
        self.assertGreater(result["net"], 0)
        self.assertAlmostEqual(result["pnl"], 52)
        self.assertAlmostEqual(result["grossProfit"], 100)
        self.assertAlmostEqual(result["profit"], 60)
        self.assertAlmostEqual(result["commission"], -7)
        self.assertAlmostEqual(result["swap"], -1)
        self.assertEqual([execution["pnl"] for execution in result["executions"]], [96, -44])
        self.assertEqual([execution["cumulativePnl"] for execution in result["executions"]], [96, 52])

    def test_missing_position_id_falls_back_to_shared_order_when_present(self) -> None:
        result = self.run_node("oldest-first", "fallback-order")

        self.assertEqual(result["tradeCount"], 1)
        self.assertAlmostEqual(result["pnl"], 48)
        self.assertAlmostEqual(result["volume"], 0.30)
        self.assertEqual(result["partialCount"], 2)

    def test_missing_position_id_does_not_group_distinct_ticket_trades(self) -> None:
        result = self.run_node("oldest-first", "distinct-without-position")

        self.assertEqual(result["tradeCount"], 2)

    def test_duplicate_close_deal_id_is_counted_once(self) -> None:
        result = self.run_node("oldest-first", "duplicate")

        self.assertEqual(result["tradeCount"], 1)
        self.assertAlmostEqual(result["pnl"], 19)
        self.assertAlmostEqual(result["commission"], -1)
        self.assertAlmostEqual(result["volume"], 0.10)
        self.assertEqual(result["partialCount"], 1)


if __name__ == "__main__":
    unittest.main()
