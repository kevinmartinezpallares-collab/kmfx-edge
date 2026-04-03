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
        self.assertEqual("connected", snapshot["accounts"][0]["status"])
        self.assertEqual("IC Markets", snapshot["accounts"][0]["broker"])

    def test_set_default_account_switches_single_default(self) -> None:
        first = self.service.create_account(
            user_id="local",
            broker="Broker A",
            platform="mt5",
            login="111",
            server="A",
            connection_mode="bridge",
            is_default=True,
        )
        second = self.service.create_account(
            user_id="local",
            broker="Broker B",
            platform="mt5",
            login="222",
            server="B",
            connection_mode="bridge",
        )
        self.service.set_default_account("local", second.account_id)
        accounts = self.service.list_accounts("local")
        default_ids = [account.account_id for account in accounts if account.is_default]
        self.assertEqual([second.account_id], default_ids)
        self.assertNotEqual(first.account_id, default_ids[0])


if __name__ == "__main__":
    unittest.main()
