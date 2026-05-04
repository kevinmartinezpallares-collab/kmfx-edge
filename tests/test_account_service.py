from __future__ import annotations

import json
import os
import tempfile
import unittest

from account_keys import hash_connection_key, mask_connection_key
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

    def test_create_pending_account_with_key_uses_requested_connection_key(self) -> None:
        created = self.service.create_pending_account_with_key(
            user_id="user-123",
            alias="Orion OGM MT5",
            connection_key="orion-launcher-key",
        )

        self.assertIsNotNone(created)
        self.assertEqual("orion-launcher-key", created.api_key)
        self.assertEqual("pending_link", created.status)
        registry = self.service.build_accounts_registry("user-123")
        self.assertEqual("", registry[0]["connection_key"])
        self.assertTrue(registry[0]["has_connection_key"])
        self.assertEqual(mask_connection_key("orion-launcher-key"), registry[0]["connection_key_preview"])

    def test_create_pending_account_can_store_direct_connection_mode(self) -> None:
        created = self.service.create_pending_account(
            user_id="user-123",
            alias="Cuenta directa",
            connection_mode="direct",
        )

        registry = self.service.build_accounts_registry("user-123")
        self.assertEqual(created.account_id, registry[0]["account_id"])
        self.assertEqual("direct", registry[0]["connection_mode"])
        self.assertEqual("", registry[0]["connection_key"])
        self.assertTrue(registry[0]["has_connection_key"])

    def test_create_pending_account_with_key_can_store_direct_connection_mode(self) -> None:
        created = self.service.create_pending_account_with_key(
            user_id="user-123",
            alias="Cuenta directa",
            connection_key="direct-key",
            connection_mode="direct",
        )

        registry = self.service.build_accounts_registry("user-123")
        self.assertIsNotNone(created)
        self.assertEqual("direct", registry[0]["connection_mode"])
        self.assertEqual("", registry[0]["connection_key"])
        self.assertTrue(registry[0]["has_connection_key"])

    def test_create_pending_account_with_key_archives_stale_pending_alias(self) -> None:
        stale = self.service.create_pending_account(
            user_id="user-123",
            alias="Orion OGM MT5",
        )

        created = self.service.create_pending_account_with_key(
            user_id="user-123",
            alias="Orion OGM MT5",
            connection_key="orion-installed-key",
        )

        registry = self.service.build_accounts_registry("user-123")
        self.assertEqual(1, len(registry))
        self.assertEqual(created.account_id, registry[0]["account_id"])
        self.assertEqual("", registry[0]["connection_key"])
        self.assertEqual(mask_connection_key("orion-installed-key"), registry[0]["connection_key_preview"])
        archived = self.service.store.list_accounts()[0]
        self.assertEqual(stale.account_id, archived.account_id)
        self.assertEqual("archived", archived.status)

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

    def test_revoke_connection_key_blocks_key_lookup_and_reuse(self) -> None:
        created = self.service.create_pending_account_with_key(
            user_id="user-123",
            alias="Cuenta MT5",
            connection_key="revoked-key",
        )

        revoked = self.service.revoke_connection_key(created.account_id, reason="security_rotation")

        self.assertIsNotNone(revoked)
        self.assertTrue(revoked.connection_key_revoked_at)
        self.assertEqual("security_rotation", revoked.connection_key_revocation_reason)
        self.assertIn(hash_connection_key("revoked-key"), revoked.revoked_connection_key_hashes)
        self.assertIsNone(self.service.get_account_by_api_key_any_user("revoked-key"))
        self.assertTrue(self.service.is_connection_key_revoked_any_user("revoked-key"))
        self.assertIsNone(
            self.service.create_pending_account_with_key(
                user_id="user-456",
                alias="Intento de reuso",
                connection_key="revoked-key",
            )
        )

    def test_regenerate_connection_key_tombstones_old_key(self) -> None:
        created = self.service.create_pending_account_with_key(
            user_id="user-123",
            alias="Cuenta MT5",
            connection_key="old-key",
        )

        regenerated = self.service.regenerate_connection_key(created.account_id)

        self.assertIsNotNone(regenerated)
        self.assertNotEqual("old-key", regenerated.api_key)
        self.assertIn(hash_connection_key("old-key"), regenerated.revoked_connection_key_hashes)
        self.assertTrue(self.service.is_connection_key_revoked_any_user("old-key"))
        self.assertIsNone(self.service.get_account_by_api_key_any_user("old-key"))
        self.assertIsNotNone(self.service.get_account_by_api_key_any_user(regenerated.api_key))

    def test_connection_keys_are_hashed_at_rest(self) -> None:
        created = self.service.create_pending_account_with_key(
            user_id="user-123",
            alias="Cuenta MT5",
            connection_key="persisted-secret-key",
        )

        with open(self.store_path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        record = payload["accounts"][0]

        self.assertEqual("", record["api_key"])
        self.assertEqual([], record["revoked_connection_keys"])
        self.assertEqual(hash_connection_key("persisted-secret-key"), record["connection_key_hash"])
        self.assertEqual(mask_connection_key("persisted-secret-key"), record["connection_key_preview"])
        self.assertNotIn("persisted-secret-key", json.dumps(payload))
        self.assertIsNotNone(self.service.get_account_by_api_key_any_user("persisted-secret-key"))
        self.assertEqual("persisted-secret-key", created.api_key)

    def test_connection_slot_count_ignores_archived_accounts(self) -> None:
        first = self.service.create_pending_account(user_id="user-123", alias="Primera")
        self.service.create_pending_account(user_id="user-123", alias="Segunda")

        self.assertEqual(2, self.service.connection_slot_count("user-123"))
        self.service.archive_account(first.account_id)
        self.assertEqual(1, self.service.connection_slot_count("user-123"))


if __name__ == "__main__":
    unittest.main()
