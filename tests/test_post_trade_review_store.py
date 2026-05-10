import unittest

from post_trade_review_store import JsonFilePostTradeReviewStore, SupabasePostTradeReviewStore, normalize_review_record


class MemorySupabasePostTradeReviewStore(SupabasePostTradeReviewStore):
    def __init__(self):
        super().__init__("https://example.supabase.co", "service-role-test")
        self.rows = []

    def _request(self, method, *, query=None, payload=None, prefer="return=representation"):
        if method == "GET":
            user_filter = str((query or {}).get("user_id") or "").replace("eq.", "", 1)
            account_filter = str((query or {}).get("account_id") or "").replace("eq.", "", 1)
            return [
                row
                for row in self.rows
                if row["user_id"] == user_filter and (not account_filter or row["account_id"] == account_filter)
            ]
        if method == "POST":
            incoming = dict(payload)
            existing = next(
                (
                    row
                    for row in self.rows
                    if row["user_id"] == incoming["user_id"]
                    and row["account_id"] == incoming["account_id"]
                    and row["trade_id"] == incoming["trade_id"]
                ),
                None,
            )
            if existing:
                existing.update(incoming)
            else:
                self.rows.append(incoming)
            return []
        raise AssertionError(method)


class PostTradeReviewStoreTests(unittest.TestCase):
    def test_normalize_review_record_keeps_safe_fields_only(self):
        record = normalize_review_record(
            {
                "tradeId": "ticket-1",
                "answers": {"validSetup": True},
                "customAnswers": {"setup": "OB"},
                "note": "x" * 3000,
                "status": "ignored",
            }
        )

        self.assertEqual(record["tradeId"], "ticket-1")
        self.assertEqual(record["validSetup"], True)
        self.assertEqual(record["customAnswers"]["setup"], "OB")
        self.assertLessEqual(len(record["note"]), 2000)
        self.assertNotIn("status", record)

    def test_supabase_store_scopes_reviews_by_user_and_account(self):
        store = MemorySupabasePostTradeReviewStore()
        store.upsert_review(user_id="user-a", account_id="account-1", trade_id="trade-1", record={"validSetup": True})
        store.upsert_review(user_id="user-b", account_id="account-1", trade_id="trade-1", record={"validSetup": False})
        store.upsert_review(user_id="user-a", account_id="account-2", trade_id="trade-2", record={"validSetup": True})

        rows = store.list_reviews(user_id="user-a", account_id="account-1")

        self.assertEqual(1, len(rows))
        self.assertEqual("user-a", rows[0]["user_id"])
        self.assertEqual("account-1", rows[0]["account_id"])
        self.assertEqual("trade-1", rows[0]["trade_id"])

    def test_json_store_upserts_without_cross_account_leak(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmpdir:
            store = JsonFilePostTradeReviewStore(str(Path(tmpdir) / "reviews.json"))
            store.upsert_review(user_id="user-a", account_id="account-1", trade_id="trade-1", record={"note": "one"})
            store.upsert_review(user_id="user-a", account_id="account-2", trade_id="trade-1", record={"note": "two"})

            rows = store.list_reviews(user_id="user-a", account_id="account-1")

        self.assertEqual(1, len(rows))
        self.assertEqual("one", rows[0]["record"]["note"])


if __name__ == "__main__":
    unittest.main()
