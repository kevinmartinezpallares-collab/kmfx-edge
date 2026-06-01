import unittest
from unittest.mock import patch

from account_service import AccountService
from account_store import SupabaseAccountStore, _projected_account_record


class MemorySupabaseAccountStore(SupabaseAccountStore):
    def __init__(self):
        super().__init__("https://example.supabase.co", "service-role-test")
        self.rows = []
        self.queries = []
        self.table_calls = []
        self.table_rows = {}

    def _request_table(self, table, method, *, query=None, payload=None, prefer="return=representation"):
        if table == self.table:
            return self._request(method, query=query, payload=payload, prefer=prefer)
        self.table_calls.append(
            {
                "table": table,
                "method": method,
                "query": dict(query or {}),
                "payload": payload,
                "prefer": prefer,
            }
        )
        if method == "GET":
            return self.table_rows.get(table, [])
        return []

    def _request(self, method, *, query=None, payload=None, prefer="return=representation"):
        if method == "GET":
            self.queries.append(dict(query or {}))
            rows = list(self.rows)
            user_filter = str((query or {}).get("user_id") or "")
            if user_filter.startswith("eq."):
                expected_user = user_filter.removeprefix("eq.")
                rows = [row for row in rows if row.get("user_id") == expected_user]
            account_id_filter = str((query or {}).get("account_id") or "")
            if account_id_filter.startswith("eq."):
                expected_account_id = account_id_filter.removeprefix("eq.")
                rows = [row for row in rows if row.get("account_id") == expected_account_id]
            key_hash_filter = str((query or {}).get("connection_key_hash") or "")
            if key_hash_filter.startswith("eq."):
                expected_hash = key_hash_filter.removeprefix("eq.")
                rows = [row for row in rows if row.get("connection_key_hash") == expected_hash]
            limit = int((query or {}).get("limit") or len(rows) or 0)
            return [{"record": row["record"]} for row in rows[:limit]]
        if method == "POST":
            for incoming in payload:
                existing = next((row for row in self.rows if row["account_id"] == incoming["account_id"]), None)
                if existing:
                    existing.update(incoming)
                else:
                    self.rows.append(dict(incoming))
            return []
        raise AssertionError(method)


class SupabaseAccountStoreTests(unittest.TestCase):
    def test_timeout_is_short_and_configurable_for_render_health_resilience(self):
        with patch.dict("os.environ", {"KMFX_SUPABASE_ACCOUNT_STORE_TIMEOUT_SECONDS": "1.5"}, clear=False):
            store = SupabaseAccountStore("https://example.supabase.co", "service-role-test")

        self.assertEqual(1.5, store.timeout_seconds)

    def test_connection_key_survives_service_recreation_as_hash(self):
        store = MemorySupabaseAccountStore()
        service = AccountService(store)
        created = service.create_pending_account_with_key(
            user_id="user-123",
            alias="Orion OGM MT5",
            connection_key="kmfx-secret-key",
        )

        self.assertIsNotNone(created)
        self.assertNotIn("kmfx-secret-key", str(store.rows))

        restarted_service = AccountService(store)
        store.queries.clear()
        matched = restarted_service.get_account_by_api_key_any_user("kmfx-secret-key")

        self.assertIsNotNone(matched)
        self.assertEqual(created.account_id, matched.account_id)
        self.assertEqual("user-123", matched.user_id)
        self.assertEqual("eq." + created.connection_key_hash, store.queries[0]["connection_key_hash"])
        self.assertEqual("1", store.queries[0]["limit"])

    def test_user_account_listing_filters_in_supabase_query(self):
        store = MemorySupabaseAccountStore()
        service = AccountService(store)
        mine = service.create_pending_account_with_key(
            user_id="user-123",
            alias="Mine",
            connection_key="mine-key",
        )
        service.create_pending_account_with_key(
            user_id="other-user",
            alias="Other",
            connection_key="other-key",
        )

        store.queries.clear()
        accounts = service.list_accounts("user-123")

        self.assertEqual([mine.account_id], [account.account_id for account in accounts])
        self.assertEqual("eq.user-123", store.queries[0]["user_id"])

    def test_mt5_sync_uses_user_filtered_registry_for_supabase_store(self):
        store = MemorySupabaseAccountStore()
        service = AccountService(store)
        pending = service.create_pending_account_with_key(
            user_id="user-123",
            alias="IC Markets",
            connection_key="ic-key",
        )
        service.create_pending_account_with_key(
            user_id="other-user",
            alias="Other",
            connection_key="other-key",
        )

        store.queries.clear()
        synced = service.ingest_account_snapshot(
            user_id="user-123",
            account_info={
                "broker": "IC Markets",
                "platform": "mt5",
                "login": "52651704",
                "server": "ICMarketsSC-Demo",
            },
            connection_mode="connector",
            payload={"balance": 1000, "equity": 1000},
            account_id=pending.account_id,
            api_key="ic-key",
        )

        self.assertEqual(pending.account_id, synced.account_id)
        self.assertEqual("active", synced.status)
        self.assertEqual("eq.user-123", store.queries[0]["user_id"])
        self.assertFalse(any("limit" in query and query.get("limit") == "10000" for query in store.queries))

    def test_policy_access_fetches_single_account_for_supabase_store(self):
        store = MemorySupabaseAccountStore()
        service = AccountService(store)
        pending = service.create_pending_account_with_key(
            user_id="user-123",
            alias="Orion OGM MT5",
            connection_key="orion-key",
        )

        store.queries.clear()
        linked = service.record_policy_access(pending.account_id)

        self.assertIsNotNone(linked)
        self.assertEqual("linked", linked.status)
        self.assertEqual("eq." + pending.account_id, store.queries[0]["account_id"])
        self.assertEqual("1", store.queries[0]["limit"])

    def test_mt5_sync_writes_normalized_tables_without_full_payload_storage(self):
        store = MemorySupabaseAccountStore()
        service = AccountService(store)
        pending = service.create_pending_account_with_key(
            user_id="user-123",
            alias="IC Markets",
            connection_key="ic-key",
        )
        store.table_calls.clear()

        synced = service.ingest_account_snapshot(
            user_id="user-123",
            account_info={
                "broker": "IC Markets",
                "platform": "mt5",
                "login": "52651704",
                "server": "ICMarketsSC-Demo",
            },
            connection_mode="connector",
            payload={
                "balance": 1000,
                "equity": 1010,
                "positions": [{"ticket": "p-1", "symbol": "EURUSD", "type": "BUY", "volume": 0.1, "profit": 10}],
                "trades": [{"trade_id": "t-1", "ticket": "t-1", "symbol": "EURUSD", "profit": 25, "time": "2026-05-25T08:00:00Z"}],
                "history": [{"timestamp": "2026-05-25T08:00:00Z", "value": 1010}],
            },
            account_id=pending.account_id,
            api_key="ic-key",
        )

        self.assertEqual("storage-summary", synced.latest_payload["payloadShape"])
        self.assertNotIn("trades", synced.latest_payload)
        self.assertNotIn("history", synced.latest_payload)
        tables = [call["table"] for call in store.table_calls]
        self.assertIn("mt5_account_positions", tables)
        self.assertIn("mt5_account_trades", tables)
        self.assertIn("mt5_equity_points", tables)
        trade_post = next(call for call in store.table_calls if call["table"] == "mt5_account_trades" and call["method"] == "POST")
        self.assertEqual("account_id,trade_key", trade_post["query"]["on_conflict"])
        self.assertEqual("t-1", trade_post["payload"][0]["trade_key"])

    def test_lightweight_sync_preserves_previous_full_history_metrics(self):
        store = MemorySupabaseAccountStore()
        service = AccountService(store)
        pending = service.create_pending_account_with_key(
            user_id="user-123",
            alias="Darwinex",
            connection_key="darwinex-key",
        )

        full = service.ingest_account_snapshot(
            user_id="user-123",
            account_info={
                "broker": "Darwinex",
                "platform": "mt5",
                "login": "4000082126",
                "server": "Darwinex-Live",
            },
            connection_mode="connector",
            payload={
                "payload_mode": "full",
                "historyBootstrapFull": True,
                "balance": 100000,
                "equity": 106000,
                "trades": [
                    {"trade_id": f"t-{index}", "ticket": f"t-{index}", "symbol": "XAUUSD", "profit": 10, "time": "2026-05-25T08:00:00Z"}
                    for index in range(285)
                ],
                "reportMetrics": {"totalTrades": 285, "netProfit": 6000, "winRate": 55},
            },
            account_id=pending.account_id,
            api_key="darwinex-key",
        )
        self.assertEqual(285, full.latest_payload["reportMetrics"]["totalTrades"])

        lightweight = service.ingest_account_snapshot(
            user_id="user-123",
            account_info={
                "broker": "Darwinex",
                "platform": "mt5",
                "login": "4000082126",
                "server": "Darwinex-Live",
            },
            connection_mode="connector",
            payload={
                "payload_mode": "lightweight",
                "historyBootstrapFull": False,
                "balance": 100000,
                "equity": 106250,
                "trades": [
                    {"trade_id": f"latest-{index}", "ticket": f"latest-{index}", "symbol": "XAUUSD", "profit": 5, "time": "2026-05-26T08:00:00Z"}
                    for index in range(20)
                ],
                "reportMetrics": {"totalTrades": 20, "netProfit": 100, "winRate": 50},
            },
            account_id=pending.account_id,
            api_key="darwinex-key",
        )

        self.assertEqual(285, lightweight.latest_payload["totalTrades"])
        self.assertEqual(285, lightweight.latest_payload["tradesCount"])
        self.assertEqual(285, lightweight.latest_payload["reportMetrics"]["totalTrades"])
        self.assertEqual(6000, lightweight.latest_payload["reportMetrics"]["netProfit"])
        self.assertEqual("preserved_full_metrics_after_lightweight_sync", lightweight.latest_payload["historyCompleteness"])

    def test_mt5_dot_timestamp_history_points_are_normalized(self):
        store = MemorySupabaseAccountStore()
        service = AccountService(store)

        service.ingest_account_snapshot(
            user_id="user-123",
            account_info={
                "broker": "Darwinex",
                "platform": "mt5",
                "login": "4000082126",
                "server": "Darwinex-Live",
            },
            connection_mode="connector",
            payload={
                "balance": 100000,
                "equity": 100125,
                "history": [{"timestamp": "2026.05.28 09:00:00", "value": 100125}],
            },
            api_key="darwinex-key",
        )

        equity_post = next(
            call for call in store.table_calls if call["table"] == "mt5_equity_points" and call["method"] == "POST"
        )
        self.assertEqual("2026-05-28T09:00:00+00:00", equity_post["payload"][0]["point_time"])

    def test_duplicate_history_timestamps_are_made_unique_before_upsert(self):
        store = MemorySupabaseAccountStore()
        service = AccountService(store)

        service.ingest_account_snapshot(
            user_id="user-123",
            account_info={
                "broker": "IC Markets",
                "platform": "mt5",
                "login": "52651704",
                "server": "ICMarketsSC-Demo",
            },
            connection_mode="connector",
            payload={
                "balance": 144976.82,
                "equity": 144900.43,
                "history": [
                    {"timestamp": "2026.05.28 16:53:02", "value": 144976.82},
                    {"timestamp": "2026.05.28 16:53:02", "value": 144900.43},
                ],
            },
            api_key="ic-key",
        )

        equity_post = next(
            call for call in store.table_calls if call["table"] == "mt5_equity_points" and call["method"] == "POST"
        )
        point_times = [row["point_time"] for row in equity_post["payload"]]
        self.assertEqual(
            ["2026-05-28T16:53:02+00:00", "2026-05-28T16:53:03+00:00"],
            point_times,
        )

    def test_full_snapshot_hydrates_compact_registry_from_normalized_tables(self):
        store = MemorySupabaseAccountStore()
        service = AccountService(store)
        synced = service.ingest_account_snapshot(
            user_id="user-123",
            account_info={
                "broker": "IC Markets",
                "platform": "mt5",
                "login": "52651704",
                "server": "ICMarketsSC-Demo",
            },
            connection_mode="connector",
            payload={
                "balance": 1000,
                "equity": 1010,
                "positions": [],
                "trades": [{"trade_id": "t-1", "ticket": "t-1", "symbol": "EURUSD", "profit": 25, "time": "2026-05-25T08:00:00Z"}],
                "history": [{"timestamp": "2026-05-25T08:00:00Z", "value": 1010}],
            },
            api_key="ic-key",
        )
        self.assertEqual("storage-summary", synced.latest_payload["payloadShape"])

        store.table_rows = {
            "mt5_account_positions": [],
            "mt5_account_trades": [
                {
                    "trade_key": "t-1",
                    "ticket": "t-1",
                    "symbol": "EURUSD",
                    "side": "BUY",
                    "profit": 25,
                    "net": 25,
                    "close_time": "2026-05-25T08:00:00Z",
                }
            ],
            "mt5_equity_points": [
                {
                    "point_time": "2026-05-25T08:00:00Z",
                    "value": 1010,
                    "source": "mt5_sync",
                }
            ],
        }

        snapshot = service.build_accounts_snapshot("user-123", summary_only=False)
        payload = snapshot["accounts"][0]["dashboard_payload"]

        self.assertEqual("storage-summary", payload["payloadShape"])
        self.assertEqual("t-1", payload["trades"][0]["trade_id"])
        self.assertEqual(1010, payload["history"][0]["value"])

        equity_get = next(
            call for call in store.table_calls if call["table"] == "mt5_equity_points" and call["method"] == "GET"
        )
        self.assertEqual("2000", equity_get["query"]["limit"])

    def test_projected_summary_preserves_report_metrics(self):
        record = _projected_account_record(
            {
                "account_id": "acc-1",
                "user_id": "user-123",
                "status": "active",
                "payload_balance": "100000",
                "payload_equity": "100250",
                "payload_total_trades": "20",
                "payload_win_rate": "40",
                "payload_report_metrics": {
                    "totalTrades": 20,
                    "winRate": 40,
                    "netProfit": 2151.12,
                },
            }
        )

        payload = record["latest_payload"]
        self.assertEqual("summary", payload["payloadShape"])
        self.assertEqual("20", payload["totalTrades"])
        self.assertEqual("40", payload["winRate"])
        self.assertEqual(2151.12, payload["reportMetrics"]["netProfit"])


if __name__ == "__main__":
    unittest.main()
