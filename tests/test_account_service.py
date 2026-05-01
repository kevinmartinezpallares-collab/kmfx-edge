from __future__ import annotations

import os
import tempfile
import unittest

from account_service import AccountService
from account_store import JsonFileAccountStore


class AccountServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.store_path = os.path.join(self.temp_dir.name, "accounts.json")
        self.service = AccountService(JsonFileAccountStore(self.store_path))

    def test_create_and_list_accounts(self) -> None:
        created = self.service.create_account(
            user_id="local",
            broker="Darwinex",
            platform="mt5",
            login="12345678",
            server="Darwinex-Live",
            connection_mode="connector",
            is_default=True,
        )
        accounts = self.service.list_accounts("local")
        self.assertEqual(1, len(accounts))
        self.assertEqual(created.account_id, accounts[0].account_id)
        self.assertTrue(accounts[0].is_default)

    def test_ingest_account_snapshot_updates_real_state(self) -> None:
        ingested = self.service.ingest_account_snapshot(
            user_id="local",
            account_info={
                "login": 998877,
                "broker": "IC Markets",
                "server": "ICM-Live02",
            },
            connection_mode="bridge",
            payload={"balance": 100000, "equity": 100250},
        )
        snapshot = self.service.build_accounts_snapshot("local")
        self.assertEqual(ingested.account_id, snapshot["active_account_id"])
        self.assertEqual("active", snapshot["accounts"][0]["status"])
        self.assertEqual("IC Markets", snapshot["accounts"][0]["broker"])

    def test_set_default_account_switches_single_default(self) -> None:
        first = self.service.ingest_account_snapshot(
            user_id="local",
            account_info={
                "broker": "Broker A",
                "platform": "mt5",
                "login": "111",
                "server": "A",
            },
            connection_mode="bridge",
            payload={"balance": 100000, "equity": 100000},
        )
        second = self.service.ingest_account_snapshot(
            user_id="local",
            account_info={
                "broker": "Broker B",
                "platform": "mt5",
                "login": "222",
                "server": "B",
            },
            connection_mode="bridge",
            payload={"balance": 100000, "equity": 100000},
            make_default_if_first=False,
        )
        self.service.set_default_account("local", second.account_id)
        accounts = self.service.list_accounts("local")
        default_ids = [account.account_id for account in accounts if account.is_default]
        self.assertEqual([second.account_id], default_ids)
        self.assertNotEqual(first.account_id, default_ids[0])

    def test_claim_account_by_api_key_moves_local_launcher_account_to_user(self) -> None:
        local = self.service.ingest_account_snapshot(
            user_id="local",
            account_info={
                "broker": "Broker A",
                "platform": "mt5",
                "login": "111",
                "server": "A",
            },
            connection_mode="connector",
            payload={"balance": 100000, "equity": 100500},
            api_key="launcher-key",
        )

        claimed = self.service.claim_account_by_api_key(
            user_id="user-123",
            api_key="launcher-key",
            alias="KMFX Connector MT5",
        )

        self.assertIsNotNone(claimed)
        self.assertEqual(local.account_id, claimed.account_id)
        self.assertEqual("user-123", claimed.user_id)
        self.assertEqual("launcher-key", claimed.api_key)
        self.assertEqual("active", claimed.status)
        snapshot = self.service.build_accounts_snapshot("user-123")
        self.assertEqual(local.account_id, snapshot["active_account_id"])
        self.assertEqual(100500, snapshot["accounts"][0]["dashboard_payload"]["equity"])
        self.assertEqual([], self.service.list_accounts("local"))

    def test_claim_account_by_api_key_rejects_account_owned_by_another_user(self) -> None:
        self.service.create_pending_account_with_key(
            user_id="other-user",
            alias="Existing user",
            connection_key="owned-key",
        )

        with self.assertRaisesRegex(ValueError, "connection_key_already_linked"):
            self.service.claim_account_by_api_key(
                user_id="user-123",
                api_key="owned-key",
                alias="KMFX Connector MT5",
            )

        owner_account = self.service.get_account_by_api_key(user_id="other-user", api_key="owned-key")
        self.assertIsNotNone(owner_account)


if __name__ == "__main__":
    unittest.main()
