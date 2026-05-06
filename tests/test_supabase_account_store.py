import unittest

from account_service import AccountService
from account_store import SupabaseAccountStore


class MemorySupabaseAccountStore(SupabaseAccountStore):
    def __init__(self):
        super().__init__("https://example.supabase.co", "service-role-test")
        self.rows = []

    def _request(self, method, *, query=None, payload=None, prefer="return=representation"):
        if method == "GET":
            return [{"record": row["record"]} for row in self.rows]
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
        matched = restarted_service.get_account_by_api_key_any_user("kmfx-secret-key")

        self.assertIsNotNone(matched)
        self.assertEqual(created.account_id, matched.account_id)
        self.assertEqual("user-123", matched.user_id)


if __name__ == "__main__":
    unittest.main()
