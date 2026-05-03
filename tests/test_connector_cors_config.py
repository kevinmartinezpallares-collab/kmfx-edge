import unittest
import os
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

from account_service import AccountService
from account_store import JsonFileAccountStore
import kmfx_connector_api as connector_api


class ConnectorCorsConfigTests(unittest.TestCase):
    def _request(self, host: str = "203.0.113.10", headers: dict[str, str] | None = None):
        return SimpleNamespace(headers=headers or {}, client=SimpleNamespace(host=host))

    def test_default_cors_origins_are_real_kmfx_domains(self) -> None:
        self.assertIn("https://kmfxedge.com", connector_api.CORS_ALLOW_ORIGINS)
        self.assertIn("https://www.kmfxedge.com", connector_api.CORS_ALLOW_ORIGINS)
        self.assertIn("https://dashboard.kmfxedge.com", connector_api.CORS_ALLOW_ORIGINS)
        self.assertNotIn("*", connector_api.CORS_ALLOW_ORIGINS)

    def test_split_env_list_dedupes_and_ignores_wildcard(self) -> None:
        parsed = connector_api._split_env_list(
            " https://kmfxedge.com/ , *, https://kmfxedge.com, https://api.kmfxedge.com "
        )
        self.assertEqual(["https://kmfxedge.com", "https://api.kmfxedge.com"], parsed)

    def test_localhost_cors_is_regex_gated(self) -> None:
        self.assertNotIn("http://localhost:3000", connector_api.CORS_ALLOW_ORIGINS)
        if connector_api.CORS_ALLOW_ORIGIN_REGEX:
            self.assertIn("localhost", connector_api.CORS_ALLOW_ORIGIN_REGEX)

    def test_production_admin_ids_have_no_default_fallback(self) -> None:
        with patch.dict("os.environ", {"RENDER": "true", "KMFX_ENV": "production"}, clear=True):
            self.assertEqual(set(), connector_api.resolve_admin_user_ids())

    def test_admin_ids_are_env_driven(self) -> None:
        with patch.dict("os.environ", {"KMFX_ADMIN_USER_IDS": "USER-A, user-b "}, clear=True):
            self.assertEqual({"user-a", "user-b"}, connector_api.resolve_admin_user_ids())

    def test_dev_admin_fallback_requires_explicit_opt_in(self) -> None:
        with patch.dict("os.environ", {"KMFX_ENV": "development"}, clear=True):
            self.assertEqual(set(), connector_api.resolve_admin_user_ids())
        with patch.dict(
            "os.environ",
            {"KMFX_ENV": "development", "KMFX_ENABLE_DEV_ADMIN_FALLBACK": "true"},
            clear=True,
        ):
            self.assertEqual({"local-dev-admin"}, connector_api.resolve_admin_user_ids())

    def test_admin_launcher_key_mapping_is_env_driven(self) -> None:
        parsed = connector_api._parse_admin_launcher_connection_key_mappings(
            "user-a=KEY-1 KEY-2; user-b:key-3|key-4"
        )
        self.assertEqual({"key-1", "key-2"}, parsed["user-a"])
        self.assertEqual({"key-3", "key-4"}, parsed["user-b"])

    def test_connection_key_masking_keeps_only_small_edges(self) -> None:
        self.assertEqual("abcdef...7890", connector_api.mask_connection_key("abcdefghijklmnopqrstuvwxyz7890"))
        self.assertEqual("[masked]", connector_api.mask_connection_key("short"))

    def test_resolve_connection_key_prefers_header_and_accepts_legacy_header(self) -> None:
        request = self._request(headers={"x-kmfx-connection-key": " header-key "})
        self.assertEqual("header-key", connector_api.resolve_connection_key({"connection_key": "body-key"}, request))

        legacy_request = self._request(headers={"x-kmfx-api-key": " legacy-key "})
        self.assertEqual("legacy-key", connector_api.resolve_connection_key({}, legacy_request))

    def test_payload_without_connection_key_removes_legacy_secret_fields(self) -> None:
        cleaned = connector_api.payload_without_connection_key(
            {
                "connection_key": "modern",
                "KMFXApiKey": "legacy",
                "api_key": "api",
                "login": "123456",
            }
        )
        self.assertEqual({"login": "123456"}, cleaned)

    def test_no_key_mt5_ingest_is_rejected_for_remote_production(self) -> None:
        with patch.dict("os.environ", {"KMFX_ENV": "production"}, clear=True):
            self.assertFalse(connector_api._allow_no_key_mt5_ingest(self._request()))
            self.assertFalse(connector_api._allow_no_key_mt5_ingest(self._request(host="127.0.0.1")))

    def test_no_key_mt5_ingest_allows_local_dev_only_by_default(self) -> None:
        with patch.dict("os.environ", {"KMFX_ENV": "development"}, clear=True):
            self.assertTrue(connector_api._allow_no_key_mt5_ingest(self._request(host="127.0.0.1")))
            self.assertFalse(connector_api._allow_no_key_mt5_ingest(self._request()))

        with patch.dict("os.environ", {"KMFX_ENV": "development", "KMFX_ALLOW_NO_KEY_MT5_INGEST": "1"}, clear=True):
            self.assertTrue(connector_api._allow_no_key_mt5_ingest(self._request()))

    def test_public_connection_key_bootstrap_is_disabled_in_production(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                with patch.dict("os.environ", {"KMFX_ENV": "production"}, clear=True):
                    created = connector_api.bootstrap_account_for_sync(
                        "11111111-1111-4111-8111-111111111111",
                        {"login": "123456", "broker": "Broker"},
                    )
                self.assertIsNone(created)
                self.assertEqual([], connector_api.account_service.store.list_accounts())
            finally:
                connector_api.account_service = previous_service

    def test_connection_plan_limit_blocks_extra_free_connection(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                connector_api.account_service.create_pending_account(user_id="user-123", alias="Primera")
                response = connector_api.connection_key_creation_denial(
                    user_id="user-123",
                    context={"is_admin": False, "app_metadata": {"plan": "free"}, "user_metadata": {}},
                )
            finally:
                connector_api.account_service = previous_service

        self.assertIsNotNone(response)
        self.assertEqual(409, response.status_code)

    def test_connection_plan_limit_allows_admin(self) -> None:
        response = connector_api.connection_key_creation_denial(
            user_id="admin-user",
            context={"is_admin": True, "app_metadata": {"plan": "disabled"}, "user_metadata": {}},
        )
        self.assertIsNone(response)

    def test_connection_metadata_string_false_blocks_key_creation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                response = connector_api.connection_key_creation_denial(
                    user_id="user-123",
                    context={
                        "is_admin": False,
                        "app_metadata": {"plan": "pro", "mt5_enabled": "false"},
                        "user_metadata": {},
                    },
                )
            finally:
                connector_api.account_service = previous_service

        self.assertIsNotNone(response)
        self.assertEqual(403, response.status_code)

    def test_user_metadata_plan_does_not_raise_connection_limit(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                connector_api.account_service.create_pending_account(user_id="user-123", alias="Primera")
                response = connector_api.connection_key_creation_denial(
                    user_id="user-123",
                    context={
                        "is_admin": False,
                        "app_metadata": {},
                        "user_metadata": {"plan": "business", "kmfx_connection_limit": 99},
                    },
                )
            finally:
                connector_api.account_service = previous_service

        self.assertIsNotNone(response)
        self.assertEqual(409, response.status_code)

    def test_user_metadata_mt5_disabled_does_not_block_key_creation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                response = connector_api.connection_key_creation_denial(
                    user_id="user-123",
                    context={
                        "is_admin": False,
                        "app_metadata": {},
                        "user_metadata": {"mt5_enabled": "false"},
                    },
                )
            finally:
                connector_api.account_service = previous_service

        self.assertIsNone(response)

    def test_connection_key_rate_limit_is_per_key_and_endpoint(self) -> None:
        connector_api.CONNECTION_RATE_LIMIT_BUCKETS.clear()
        with patch.dict("os.environ", {"KMFX_CONNECTION_RATE_LIMIT_SYNC_PER_MINUTE": "2"}, clear=False):
            self.assertIsNone(connector_api.connection_key_rate_limit_response("/api/mt5/sync", "rate-key"))
            self.assertIsNone(connector_api.connection_key_rate_limit_response("/api/mt5/sync", "rate-key"))
            response = connector_api.connection_key_rate_limit_response("/api/mt5/sync", "rate-key")
        connector_api.CONNECTION_RATE_LIMIT_BUCKETS.clear()

        self.assertIsNotNone(response)
        self.assertEqual(429, response.status_code)


if __name__ == "__main__":
    unittest.main()
