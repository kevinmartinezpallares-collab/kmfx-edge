import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


class AccountsLiveSnapshotContractTests(unittest.TestCase):
    def test_live_snapshot_polling_backs_off_to_reduce_supabase_egress(self) -> None:
        source = read_text("js/modules/accounts-live-snapshot.js")

        self.assertIn("function resolveAccountsHttpPollIntervalMs", source)
        self.assertIn('document.visibilityState === "hidden"', source)
        self.assertIn("if (isHidden) return isLocal ? 15000 : 60000", source)
        self.assertIn("return hasOpenPositions ? 8000 : 30000", source)
        self.assertIn("isHidden: isDocumentHidden()", source)
        self.assertNotIn("return hasOpenPositions ? 3000 : 15000", source)


if __name__ == "__main__":
    unittest.main()
