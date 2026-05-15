import unittest
from unittest.mock import patch

from account_service import AccountService
from account_store import SupabaseAccountStore


class MemorySupabaseAccountStore(SupabaseAccountStore):
    def __init__(self):
        super().__init__("https://example.supabase.co", "service-role-test")
        self.rows = []
        self.queries = []

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


if __name__ == "__main__":
    unittest.main()
