import asyncio
import json
import unittest
import os
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

from account_service import AccountService
from account_store import JsonFileAccountStore
import kmfx_connector_api as connector_api


class ConnectorCorsConfigTests(unittest.TestCase):
    def _request(
        self,
        host: str = "203.0.113.10",
        headers: dict[str, str] | None = None,
        query_params: dict[str, str] | None = None,
        json_body: object | None = None,
    ):
        class RequestStub(SimpleNamespace):
            async def json(self_inner):
                return json_body if json_body is not None else {}

        return RequestStub(headers=headers or {}, query_params=query_params or {}, client=SimpleNamespace(host=host))

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

    def test_query_connection_key_rejected_by_default_without_echoing_raw_key(self) -> None:
        request = self._request(query_params={"connection_key": "abcdef1234567890"})
        response = connector_api.query_connection_key_rejection_response("/api/mt5/policy", request)

        self.assertIsNotNone(response)
        self.assertEqual(400, response.status_code)
        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual("query_connection_key_not_allowed", body["reason"])
        self.assertNotIn("abcdef1234567890", response.body.decode("utf-8"))

    def test_mt5_query_connection_key_routes_reject_before_processing(self) -> None:
        request = self._request(query_params={"api_key": "abcdef1234567890"})

        responses = [
            asyncio.run(connector_api.mt5_policy(request, login="123456")),
            asyncio.run(connector_api.mt5_sync(request)),
            asyncio.run(connector_api.mt5_journal(request)),
        ]

        for response in responses:
            body_text = response.body.decode("utf-8")
            body = json.loads(body_text)
            self.assertEqual(400, response.status_code)
            self.assertEqual("query_connection_key_not_allowed", body["reason"])
            self.assertNotIn("abcdef1234567890", body_text)

    def test_query_connection_key_compat_requires_explicit_non_production_flag(self) -> None:
        request = self._request(query_params={"KMFXApiKey": "abcdef1234567890"})
        with patch.dict("os.environ", {"KMFX_ENV": "development", "KMFX_ALLOW_QUERY_CONNECTION_KEY": "1"}, clear=True):
            self.assertIsNone(connector_api.query_connection_key_rejection_response("/api/mt5/policy", request))
            self.assertEqual("abcdef1234567890", connector_api.resolve_connection_key({}, request))

        with patch.dict("os.environ", {"KMFX_ENV": "production", "KMFX_ALLOW_QUERY_CONNECTION_KEY": "1"}, clear=True):
            response = connector_api.query_connection_key_rejection_response("/api/mt5/policy", request)
            self.assertIsNotNone(response)
            self.assertEqual(400, response.status_code)

    def test_redact_sensitive_data_masks_connection_keys_and_tokens(self) -> None:
        redacted = connector_api.redact_sensitive_data(
            {
                "connection_key": "abcdef1234567890",
                "nested": {"authorization": "Bearer secret-token", "login": "123456"},
            }
        )

        self.assertEqual("abcdef...7890", redacted["connection_key"])
        self.assertEqual("[masked]", redacted["nested"]["authorization"])
        self.assertEqual("123456", redacted["nested"]["login"])

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
        self.assertEqual("connection_key_rate_limited", json.loads(response.body.decode("utf-8"))["reason"])
        self.assertIn("Retry-After", response.headers)

    def test_connection_key_rate_limit_prunes_old_and_excess_buckets(self) -> None:
        connector_api.CONNECTION_RATE_LIMIT_BUCKETS.clear()
        connector_api.CONNECTION_RATE_LIMIT_BUCKETS.update(
            {
                "old": (0.0, 1),
                "recent-a": (1000.0, 1),
                "recent-b": (1001.0, 1),
                "recent-c": (1002.0, 1),
            }
        )

        connector_api.prune_connection_rate_limit_buckets(1002.0, max_buckets=2)
        keys = set(connector_api.CONNECTION_RATE_LIMIT_BUCKETS)
        connector_api.CONNECTION_RATE_LIMIT_BUCKETS.clear()

        self.assertEqual({"recent-b", "recent-c"}, keys)

    def test_revoked_connection_key_is_rejected_at_mt5_route_boundary(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            connector_api.CONNECTION_RATE_LIMIT_BUCKETS.clear()
            try:
                created = connector_api.account_service.create_pending_account_with_key(
                    user_id="user-123",
                    alias="Cuenta MT5",
                    connection_key="revoked-route-key",
                )
                self.assertIsNotNone(created)
                connector_api.account_service.revoke_connection_key(created.account_id, reason="test_revocation")
                request = self._request(
                    headers={"x-kmfx-connection-key": "revoked-route-key"},
                    json_body={
                        "sync_id": "revoked-route-sync",
                        "account": {
                            "login": "123456",
                            "broker": "Broker",
                            "server": "Broker-Live",
                            "balance": 1000,
                            "equity": 1000,
                        },
                        "positions": [],
                        "trades": [],
                    },
                )
                response = asyncio.run(connector_api.mt5_sync(request))
            finally:
                connector_api.CONNECTION_RATE_LIMIT_BUCKETS.clear()
                connector_api.account_service = previous_service

        body_text = response.body.decode("utf-8")
        body = json.loads(body_text)
        self.assertEqual(401, response.status_code)
        self.assertEqual("revoked_connection_key", body["reason"])
        self.assertNotIn("revoked-route-key", body_text)
        self.assertEqual("revoke...-key", body["details"]["connection_key"])

    def test_policy_route_rate_limits_valid_connection_key(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            connector_api.CONNECTION_RATE_LIMIT_BUCKETS.clear()
            try:
                connector_api.account_service.create_pending_account_with_key(
                    user_id="user-123",
                    alias="Cuenta MT5",
                    connection_key="policy-route-rate-key",
                )
                request = self._request(headers={"x-kmfx-connection-key": "policy-route-rate-key"})
                with patch.dict("os.environ", {"KMFX_CONNECTION_RATE_LIMIT_POLICY_PER_MINUTE": "1"}, clear=False):
                    first = asyncio.run(connector_api.mt5_policy(request, login="123456"))
                    second = asyncio.run(connector_api.mt5_policy(request, login="123456"))
            finally:
                connector_api.CONNECTION_RATE_LIMIT_BUCKETS.clear()
                connector_api.account_service = previous_service

        body_text = second.body.decode("utf-8")
        body = json.loads(body_text)
        self.assertEqual(200, first.status_code)
        self.assertEqual(429, second.status_code)
        self.assertEqual("connection_key_rate_limited", body["reason"])
        self.assertIn("Retry-After", second.headers)
        self.assertNotIn("policy-route-rate-key", body_text)


if __name__ == "__main__":
    unittest.main()
