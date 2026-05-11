import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


class AccountsLiveSnapshotContractTests(unittest.TestCase):
    def test_live_snapshot_polling_backs_off_to_reduce_supabase_egress(self) -> None:
        source = read_text("js/modules/accounts-live-snapshot.js")
        api_config = read_text("js/modules/api-config.js")
        backend = read_text("kmfx_connector_api.py")
        account_service = read_text("account_service.py")
        account_store = read_text("account_store.py")

        self.assertIn("function resolveAccountsHttpPollIntervalMs", source)
        self.assertIn("function resolveAccountsFullSnapshotRefreshMs", source)
        self.assertIn('pollHttpSnapshot({ view: shouldUseFullSnapshot() ? "full" : "summary" })', source)
        self.assertIn('resolveAccountsSnapshotUrl({ view: normalizedView })', source)
        self.assertIn("mergeSummaryPayloadWithPrevious", source)
        self.assertIn('document.visibilityState === "hidden"', source)
        self.assertIn("if (isHidden) return isLocal ? 15000 : 60000", source)
        self.assertIn("return hasOpenPositions ? 8000 : 30000", source)
        self.assertIn("isHidden: isDocumentHidden()", source)
        self.assertIn('?view=summary', api_config)
        self.assertIn('view: str = Query("full", pattern="^(full|summary)$")', backend)
        self.assertIn("summary_only = normalized_view == \"summary\"", backend)
        self.assertIn("build_accounts_registry(user_id, summary_only=summary_only)", backend)
        self.assertIn('def build_accounts_registry(self, user_id: str = "local", *, summary_only: bool = False)', account_service)
        self.assertIn("list_account_summaries_for_user", account_store)
        self.assertIn("SUMMARY_SELECT", account_store)
        self.assertIn("payload_positions:record->latest_payload->positions", account_store)
        self.assertNotIn("return hasOpenPositions ? 3000 : 15000", source)


if __name__ == "__main__":
    unittest.main()
