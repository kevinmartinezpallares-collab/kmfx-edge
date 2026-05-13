import asyncio
import hashlib
import hmac
import json
import unittest
import os
import tempfile
import time
from types import SimpleNamespace
from unittest.mock import patch

from account_keys import hash_connection_key, mask_connection_key
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
        body_bytes: bytes | None = None,
    ):
        class RequestStub(SimpleNamespace):
            async def json(self_inner):
                return json_body if json_body is not None else {}

            async def body(self_inner):
                if body_bytes is not None:
                    return body_bytes
                return json.dumps(json_body if json_body is not None else {}).encode("utf-8")

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

    def test_production_admin_ids_include_owner_bridge(self) -> None:
        with patch.dict("os.environ", {"RENDER": "true", "KMFX_ENV": "production"}, clear=True):
            self.assertEqual(connector_api.DEFAULT_ADMIN_USER_IDS, connector_api.resolve_admin_user_ids())

    def test_default_admin_ids_can_be_disabled(self) -> None:
        with patch.dict("os.environ", {"KMFX_DISABLE_DEFAULT_ADMIN_IDS": "true"}, clear=True):
            self.assertEqual(set(), connector_api.resolve_admin_user_ids())

    def test_admin_ids_are_env_driven(self) -> None:
        with patch.dict("os.environ", {"KMFX_ADMIN_USER_IDS": "USER-A, user-b "}, clear=True):
            self.assertEqual({"user-a", "user-b", *connector_api.DEFAULT_ADMIN_USER_IDS}, connector_api.resolve_admin_user_ids())

    def test_default_admin_email_allows_owner_without_plan(self) -> None:
        request = self._request(headers={"authorization": "Bearer owner-token"})
        with patch.object(
            connector_api,
            "_resolve_verified_bearer_claims",
            return_value={
                "sub": "owner-user",
                "email": "kevinmartinezpallares@gmail.com",
                "app_metadata": {"plan": "free"},
                "user_metadata": {},
            },
        ):
            context = connector_api.build_admin_context(request)
            response = connector_api.connection_key_creation_denial(
                user_id="owner-user",
                context=context,
            )

        self.assertTrue(context["is_admin"])
        self.assertIsNone(response)

    def test_default_admin_emails_can_be_disabled(self) -> None:
        with patch.dict("os.environ", {"KMFX_DISABLE_DEFAULT_ADMIN_EMAILS": "true"}, clear=True):
            self.assertEqual(set(), connector_api.resolve_admin_emails())

    def test_feature_flags_disable_wins_over_enable(self) -> None:
        with patch.dict(
            os.environ,
            {"KMFX_ENABLE_EXPORTS": "true", "KMFX_DISABLE_EXPORTS": "true"},
            clear=True,
        ):
            self.assertFalse(connector_api.kmfx_feature_enabled("exports"))

    def test_feature_flags_accept_explicit_false(self) -> None:
        with patch.dict(os.environ, {"KMFX_FEATURE_BILLING": "false"}, clear=True):
            self.assertFalse(connector_api.kmfx_feature_enabled("billing"))

    def test_admin_emails_are_env_driven(self) -> None:
        with patch.dict("os.environ", {"KMFX_ADMIN_EMAILS": "ops@kmfxedge.com, owner@kmfxedge.com "}, clear=True):
            self.assertEqual(
                {"ops@kmfxedge.com", "owner@kmfxedge.com", *connector_api.DEFAULT_ADMIN_EMAILS},
                connector_api.resolve_admin_emails(),
            )

    def test_dev_admin_fallback_requires_explicit_opt_in(self) -> None:
        with patch.dict("os.environ", {"KMFX_ENV": "development"}, clear=True):
            self.assertEqual(connector_api.DEFAULT_ADMIN_USER_IDS, connector_api.resolve_admin_user_ids())
        with patch.dict(
            "os.environ",
            {"KMFX_ENV": "development", "KMFX_ENABLE_DEV_ADMIN_FALLBACK": "true"},
            clear=True,
        ):
            self.assertEqual({"local-dev-admin", *connector_api.DEFAULT_ADMIN_USER_IDS}, connector_api.resolve_admin_user_ids())

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
        with patch.object(connector_api, "emit_audit_event") as audit_mock:
            response = connector_api.query_connection_key_rejection_response("/api/mt5/policy", request)

        self.assertIsNotNone(response)
        self.assertEqual(400, response.status_code)
        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual("query_connection_key_not_allowed", body["reason"])
        self.assertNotIn("abcdef1234567890", response.body.decode("utf-8"))
        audit_mock.assert_called_once()
        self.assertEqual("mt5_sync_rejected", audit_mock.call_args.args[0])
        self.assertEqual("rejected", audit_mock.call_args.kwargs["status"])
        self.assertEqual(
            "query_connection_key_not_allowed",
            audit_mock.call_args.kwargs["details"]["reason"],
        )

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

    def test_audit_event_details_masks_connection_keys(self) -> None:
        raw_key = "abcdefghijklmnopqrstuvwxyz7890"
        details = connector_api.audit_event_details(
            {
                "connection_key": raw_key,
                "nested": {"api_key": raw_key, "login": "123456"},
            }
        )

        self.assertIn("abcdef...7890", details)
        self.assertIn("123456", details)
        self.assertNotIn(raw_key, details)

    def test_account_copy_key_audit_event_is_authenticated_and_masked(self) -> None:
        raw_key = "abcdefghijklmnopqrstuvwxyz7890"
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                created = connector_api.account_service.create_pending_account_with_key(
                    user_id="user-123",
                    alias="Cuenta MT5 EA",
                    connection_key=raw_key,
                    platform="mt5",
                    connection_mode="ea_direct",
                )
                request = self._request(
                    host="127.0.0.1",
                    headers={"x-kmfx-user-id": "user-123", "x-kmfx-user-email": "trader@example.com"},
                    json_body={"event": "copy_key", "source": "unit_test"},
                )
                with patch.object(connector_api.log, "info") as info_mock:
                    response = asyncio.run(connector_api.record_own_account_audit_event(created.account_id, request))
            finally:
                connector_api.account_service = previous_service

        body_text = response.body.decode("utf-8")
        body = json.loads(body_text)
        self.assertEqual(200, response.status_code)
        self.assertEqual("copy_key", body["event"])
        audit_calls = [
            call
            for call in info_mock.call_args_list
            if call.args and "[KMFX][AUDIT]" in str(call.args[0])
        ]
        self.assertEqual(1, len(audit_calls))
        audit_args = audit_calls[0].args
        self.assertEqual("copy_key", audit_args[1])
        self.assertEqual("user-123", audit_args[3])
        self.assertEqual(created.account_id, audit_args[4])
        self.assertIn("abcdef...7890", audit_args[-1])
        self.assertNotIn(raw_key, audit_args[-1])

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

    def test_mt5_sync_rejects_oversized_content_length_before_processing(self) -> None:
        request = self._request(headers={"content-length": "128"}, json_body={"unused": True})
        with patch.dict("os.environ", {"KMFX_MT5_SYNC_MAX_BODY_BYTES": "32"}, clear=False):
            response = asyncio.run(connector_api.mt5_sync(request))

        body_text = response.body.decode("utf-8")
        body = json.loads(body_text)
        self.assertEqual(413, response.status_code)
        self.assertEqual("payload_too_large", body["reason"])
        self.assertEqual(32, body["details"]["max_bytes"])
        self.assertEqual(128, body["details"]["actual_bytes"])
        self.assertNotIn("unused", body_text)

    def test_mt5_journal_rejects_oversized_body_without_echoing_payload(self) -> None:
        oversized_body = json.dumps({"batch_id": "batch-1", "events": ["secret-value"]}).encode("utf-8")
        request = self._request(body_bytes=oversized_body)
        with patch.dict("os.environ", {"KMFX_MT5_JOURNAL_MAX_BODY_BYTES": "24"}, clear=False):
            response = asyncio.run(connector_api.mt5_journal(request))

        body_text = response.body.decode("utf-8")
        body = json.loads(body_text)
        self.assertEqual(413, response.status_code)
        self.assertEqual("payload_too_large", body["reason"])
        self.assertEqual(24, body["details"]["max_bytes"])
        self.assertEqual(len(oversized_body), body["details"]["actual_bytes"])
        self.assertNotIn("secret-value", body_text)

    def test_mutation_json_payload_requires_object(self) -> None:
        request = self._request(
            host="127.0.0.1",
            headers={"x-kmfx-user-id": "user-invalid-payload"},
            json_body=["not", "an", "object"],
        )
        response = asyncio.run(connector_api.link_account(request))
        body = json.loads(response.body.decode("utf-8"))

        self.assertEqual(400, response.status_code)
        self.assertEqual("invalid_payload", body["reason"])
        self.assertEqual("json_object_required", body["details"]["problem"])

    def test_mutation_json_payload_rejects_oversized_body_without_echoing_payload(self) -> None:
        oversized_body = json.dumps({"label": "secret-value" * 20}).encode("utf-8")
        request = self._request(
            host="127.0.0.1",
            headers={"x-kmfx-user-id": "user-oversized-payload"},
            body_bytes=oversized_body,
        )
        with patch.dict("os.environ", {"KMFX_MUTATION_JSON_MAX_BODY_BYTES": "32"}, clear=False):
            response = asyncio.run(connector_api.link_account(request))

        body_text = response.body.decode("utf-8")
        body = json.loads(body_text)
        self.assertEqual(413, response.status_code)
        self.assertEqual("payload_too_large", body["reason"])
        self.assertEqual(32, body["details"]["max_bytes"])
        self.assertEqual(len(oversized_body), body["details"]["actual_bytes"])
        self.assertNotIn("secret-value", body_text)

    def test_billing_checkout_rejects_non_object_payload_before_stripe(self) -> None:
        request = self._request(
            headers={"authorization": "Bearer billing-invalid-payload-token"},
            json_body=["pro"],
        )
        with patch.object(connector_api, "stripe_api_request") as stripe_mock:
            response = asyncio.run(connector_api.billing_checkout(request))

        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(400, response.status_code)
        self.assertEqual("invalid_payload", body["reason"])
        stripe_mock.assert_not_called()

    def test_backtest_import_rejects_non_object_payload(self) -> None:
        request = self._request(json_body=["not", "an", "object"])
        response = asyncio.run(connector_api.import_mt5_strategy_tester_reports(request))
        body = json.loads(response.body.decode("utf-8"))

        self.assertEqual(400, response.status_code)
        self.assertEqual("invalid_payload", body["reason"])
        self.assertEqual("json_object_required", body["details"]["problem"])

    def test_backtest_import_rejects_oversized_body_without_echoing_payload(self) -> None:
        oversized_body = json.dumps({"content": "secret-value" * 20}).encode("utf-8")
        request = self._request(body_bytes=oversized_body)
        with patch.dict("os.environ", {"KMFX_BACKTEST_IMPORT_MAX_BODY_BYTES": "32"}, clear=False):
            response = asyncio.run(connector_api.import_mt5_strategy_tester_reports(request))

        body_text = response.body.decode("utf-8")
        body = json.loads(body_text)
        self.assertEqual(413, response.status_code)
        self.assertEqual("payload_too_large", body["reason"])
        self.assertEqual(32, body["details"]["max_bytes"])
        self.assertEqual(len(oversized_body), body["details"]["actual_bytes"])
        self.assertNotIn("secret-value", body_text)

    def test_link_account_returns_key_once_and_persists_only_hash(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            store_path = os.path.join(temp_dir, "accounts.json")
            connector_api.account_service = AccountService(JsonFileAccountStore(store_path))
            try:
                request = self._request(
                    host="127.0.0.1",
                    headers={"x-kmfx-user-id": "user-123"},
                    json_body={
                        "label": "Cuenta MT5 EA",
                        "alias": "Cuenta MT5 EA",
                        "platform": "mt5",
                        "connection_mode": "ea_direct",
                    },
                )

                with patch.dict("os.environ", {"KMFX_DEFAULT_CONNECTION_PLAN": "core"}, clear=False):
                    response = asyncio.run(connector_api.link_account(request))
                body = json.loads(response.body.decode("utf-8"))
                raw_key = body["connection_key"]

                self.assertEqual(200, response.status_code)
                self.assertTrue(raw_key)
                self.assertEqual(raw_key, body["direct_config"]["connection_key"])
                self.assertEqual(body["account_id"], body["account"]["account_id"])
                self.assertEqual("ea_direct", body["account"]["connection_mode"])

                with open(store_path, "r", encoding="utf-8") as handle:
                    persisted = json.load(handle)
                record = persisted["accounts"][0]
                self.assertEqual("", record["api_key"])
                self.assertEqual(hash_connection_key(raw_key), record["connection_key_hash"])
                self.assertEqual(mask_connection_key(raw_key), record["connection_key_preview"])
                self.assertNotIn(raw_key, json.dumps(persisted))

                list_response = asyncio.run(connector_api.list_accounts(request))
                list_body_text = list_response.body.decode("utf-8")
                list_body = json.loads(list_body_text)
                self.assertEqual("", list_body["accounts"][0]["connection_key"])
                self.assertTrue(list_body["accounts"][0]["has_connection_key"])
                self.assertEqual(mask_connection_key(raw_key), list_body["accounts"][0]["connection_key_preview"])
                self.assertNotIn(raw_key, list_body_text)
            finally:
                connector_api.account_service = previous_service

    def test_link_account_rejects_revoked_existing_key(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            store_path = os.path.join(temp_dir, "accounts.json")
            connector_api.account_service = AccountService(JsonFileAccountStore(store_path))
            try:
                created = connector_api.account_service.create_pending_account_with_key(
                    user_id="user-123",
                    alias="Cuenta MT5 EA",
                    connection_key="revoked-darwinex-key",
                    platform="mt5",
                    connection_mode="launcher",
                )
                revoked = connector_api.account_service.revoke_connection_key(
                    created.account_id,
                    reason="test",
                )
                self.assertIsNotNone(revoked)
                self.assertTrue(connector_api.account_service.is_connection_key_revoked_any_user("revoked-darwinex-key"))

                request = self._request(
                    host="127.0.0.1",
                    headers={"x-kmfx-user-id": "user-123"},
                    json_body={
                        "label": "Cuenta MT5 EA",
                        "alias": "Cuenta MT5 EA",
                        "platform": "mt5",
                        "connection_mode": "launcher",
                    },
                )

                with patch.dict("os.environ", {"KMFX_DEFAULT_CONNECTION_PLAN": "core"}, clear=False):
                    response = asyncio.run(connector_api.link_account(request))
                body = json.loads(response.body.decode("utf-8"))

                self.assertEqual(409, response.status_code)
                self.assertFalse(body["ok"])
                self.assertEqual("connection_key_revoked", body["reason"])
                self.assertEqual(created.account_id, body["details"]["account_id"])
                self.assertEqual(
                    mask_connection_key("revoked-darwinex-key"),
                    body["details"]["connection_key_preview"],
                )
                self.assertTrue(connector_api.account_service.is_connection_key_revoked_any_user("revoked-darwinex-key"))
                self.assertIsNone(
                    connector_api.account_service.get_account_by_api_key_any_user("revoked-darwinex-key")
                )
            finally:
                connector_api.account_service = previous_service

    def test_link_account_blocks_authenticated_free_live_key(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                request = self._request(
                    headers={"authorization": "Bearer free-token"},
                    json_body={
                        "label": "Cuenta MT5 EA",
                        "platform": "mt5",
                        "connection_mode": "ea_direct",
                    },
                )
                with patch.object(
                    connector_api,
                    "_resolve_verified_bearer_claims",
                    return_value={
                        "sub": "free-user",
                        "email": "free@example.com",
                        "app_metadata": {"plan": "free"},
                        "user_metadata": {},
                    },
                ):
                    response = asyncio.run(connector_api.link_account(request))
                body = json.loads(response.body.decode("utf-8"))
            finally:
                connector_api.account_service = previous_service

        self.assertEqual(403, response.status_code)
        self.assertEqual("entitlement_required", body["reason"])
        self.assertEqual("launcherConnection", body["details"]["entitlement"])

    def test_direct_link_registers_login_server_without_persisting_password(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            store_path = os.path.join(temp_dir, "accounts.json")
            connector_api.account_service = AccountService(JsonFileAccountStore(store_path))
            try:
                request = self._request(
                    host="127.0.0.1",
                    headers={"x-kmfx-user-id": "421e2f82-d3c9-4965-bda5-35d6e88cbd0f"},
                    json_body={
                        "label": "Cuenta MT5 Darwinex",
                        "platform": "mt5",
                        "connection_mode": "direct",
                        "login": "4000082126",
                        "server": "Darwinex-Live",
                        "password": "investor-secret",
                    },
                )

                response = asyncio.run(connector_api.link_account(request))
                body = json.loads(response.body.decode("utf-8"))
                self.assertEqual(200, response.status_code)
                self.assertTrue(body["is_admin"])
                self.assertEqual("direct", body["connection_mode"])
                self.assertEqual("direct", body["account"]["connection_mode"])
                self.assertEqual("4000082126", body["account"]["login"])
                self.assertEqual("Darwinex-Live", body["account"]["server"])
                self.assertFalse(body["direct_sync_available"])
                self.assertEqual("ea", body["sync_required"])

                list_response = asyncio.run(connector_api.list_accounts(request))
                list_body_text = list_response.body.decode("utf-8")
                list_body = json.loads(list_body_text)
                account = list_body["accounts"][0]
                self.assertEqual("direct", account["connection_mode"])
                self.assertEqual("4000082126", account["login"])
                self.assertEqual("Darwinex-Live", account["server"])
                self.assertNotIn("investor-secret", list_body_text)

                snapshot = connector_api.build_live_accounts_snapshot("421e2f82-d3c9-4965-bda5-35d6e88cbd0f")
                self.assertEqual(1, len(snapshot["accounts"]))
                self.assertEqual("mt5_direct_pending", snapshot["accounts"][0]["dashboard_payload"]["payloadSource"])
                self.assertEqual("pending_direct_backend", snapshot["accounts"][0]["dashboard_payload"]["data_status"])

                with open(store_path, "r", encoding="utf-8") as handle:
                    persisted_text = handle.read()
                self.assertNotIn("investor-secret", persisted_text)
            finally:
                connector_api.account_service = previous_service

    def test_direct_mt5_brokers_returns_server_catalog_for_authenticated_user(self) -> None:
        request = self._request(host="127.0.0.1", headers={"x-kmfx-user-id": "421e2f82-d3c9-4965-bda5-35d6e88cbd0f"})
        response = asyncio.run(connector_api.direct_mt5_brokers(request, q="Darwinex", limit=10))
        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(200, response.status_code)
        self.assertTrue(body["ok"])
        self.assertTrue(any(item["server"] == "Darwinex-Live" for item in body["servers"]))
        self.assertIn("provider", body)

    def test_direct_mt5_brokers_disabled_by_default_in_production(self) -> None:
        request = self._request(host="127.0.0.1", headers={"x-kmfx-user-id": "421e2f82-d3c9-4965-bda5-35d6e88cbd0f"})
        with patch.dict(os.environ, {"RENDER": "true", "KMFX_ENV": "production"}, clear=True):
            response = asyncio.run(connector_api.direct_mt5_brokers(request, q="Darwinex", limit=10))

        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(503, response.status_code)
        self.assertFalse(body["ok"])
        self.assertEqual("feature_disabled", body["reason"])
        self.assertEqual("direct_mt5", body["feature"])

    def test_direct_mt5_brokers_can_be_enabled_in_production(self) -> None:
        request = self._request(host="127.0.0.1", headers={"x-kmfx-user-id": "421e2f82-d3c9-4965-bda5-35d6e88cbd0f"})
        with patch.dict(
            os.environ,
            {"RENDER": "true", "KMFX_ENV": "production", "KMFX_ENABLE_DIRECT_MT5": "true"},
            clear=True,
        ):
            response = asyncio.run(connector_api.direct_mt5_brokers(request, q="Darwinex", limit=10))

        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(200, response.status_code)
        self.assertTrue(body["ok"])

    def test_direct_mt5_link_with_fixture_provider_ingests_live_payload(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            store_path = os.path.join(temp_dir, "accounts.json")
            connector_api.account_service = AccountService(JsonFileAccountStore(store_path))
            try:
                with patch.dict("os.environ", {"KMFX_DIRECT_MT5_PROVIDER": "fixture"}, clear=True):
                    request = self._request(
                        host="127.0.0.1",
                        headers={"x-kmfx-user-id": "421e2f82-d3c9-4965-bda5-35d6e88cbd0f"},
                        json_body={
                            "label": "Cuenta Direct Fixture",
                            "platform": "mt5",
                            "login": "52651704",
                            "server": "ICMarketsSC-Demo",
                            "password": "fixture-investor",
                        },
                    )

                    response = asyncio.run(connector_api.direct_mt5_link(request))
                    body = json.loads(response.body.decode("utf-8"))
                    self.assertEqual(200, response.status_code)
                    self.assertTrue(body["ok"])
                    self.assertTrue(body["direct_sync_available"])
                    self.assertEqual("", body["sync_required"])
                    self.assertEqual("direct", body["account"]["connection_mode"])
                    self.assertEqual("active", body["account"]["status"])

                    snapshot = connector_api.build_live_accounts_snapshot("421e2f82-d3c9-4965-bda5-35d6e88cbd0f")
                    self.assertEqual(1, len(snapshot["accounts"]))
                    payload = snapshot["accounts"][0]["dashboard_payload"]
                    self.assertEqual("mt5_direct_live", payload["payloadSource"])
                    self.assertEqual(2, len(payload["trades"]))
                    self.assertEqual("fixture", payload["directSync"]["provider"])

                    with open(store_path, "r", encoding="utf-8") as handle:
                        persisted_text = handle.read()
                    self.assertNotIn("fixture-investor", persisted_text)
            finally:
                connector_api.account_service = previous_service

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

    def test_free_plan_blocks_first_connection_key_for_onboarding(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                response = connector_api.connection_key_creation_denial(
                    user_id="user-123",
                    context={"is_admin": False, "app_metadata": {"plan": "free"}, "user_metadata": {}},
                )
            finally:
                connector_api.account_service = previous_service

        self.assertIsNotNone(response)
        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(403, response.status_code)
        self.assertEqual("entitlement_required", body["reason"])
        self.assertEqual("launcherConnection", body["details"]["entitlement"])

    def test_free_plan_blocks_second_connection_before_limit_check(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                connector_api.account_service.create_pending_account(user_id="user-123", alias="Primera")
                connector_api.account_service.create_pending_account(user_id="user-123", alias="Segunda")
                response = connector_api.connection_key_creation_denial(
                    user_id="user-123",
                    context={"is_admin": False, "app_metadata": {"plan": "free"}, "user_metadata": {}},
                )
            finally:
                connector_api.account_service = previous_service

        self.assertIsNotNone(response)
        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(403, response.status_code)
        self.assertEqual("entitlement_required", body["reason"])
        self.assertEqual("launcherConnection", body["details"]["entitlement"])

    def test_core_plan_limit_blocks_extra_connection(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                response = connector_api.connection_key_creation_denial(
                    user_id="user-123",
                    context={
                        "is_admin": False,
                        "app_metadata": {"plan": "core", "billing_status": "active"},
                        "user_metadata": {},
                    },
                    requested_slots=3,
                )
            finally:
                connector_api.account_service = previous_service

        self.assertIsNotNone(response)
        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(409, response.status_code)
        self.assertEqual("plan_limit_reached", body["reason"])
        self.assertEqual(2, body["details"]["connection_limit"])
        self.assertEqual("liveMt5Accounts", body["details"]["entitlement"])

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
        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(403, response.status_code)
        self.assertEqual("entitlement_required", body["reason"])
        self.assertEqual("launcherConnection", body["details"]["entitlement"])

    def test_user_metadata_plan_does_not_raise_connection_limit(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                response = connector_api.connection_key_creation_denial(
                    user_id="user-123",
                    context={
                        "is_admin": False,
                        "app_metadata": {"plan": "core", "billing_status": "active"},
                        "user_metadata": {"plan": "business", "kmfx_connection_limit": 99},
                    },
                    requested_slots=3,
                )
            finally:
                connector_api.account_service = previous_service

        self.assertIsNotNone(response)
        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(409, response.status_code)
        self.assertEqual("plan_limit_reached", body["reason"])
        self.assertEqual(2, body["details"]["connection_limit"])

    def test_user_metadata_mt5_disabled_does_not_block_key_creation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                response = connector_api.connection_key_creation_denial(
                    user_id="user-123",
                    context={
                        "is_admin": False,
                        "app_metadata": {"plan": "core", "billing_status": "active"},
                        "user_metadata": {"mt5_enabled": "false"},
                    },
                )
            finally:
                connector_api.account_service = previous_service

        self.assertIsNone(response)

    def test_verified_app_metadata_admin_bypasses_connection_limit(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                connector_api.account_service.create_pending_account(user_id="admin-user", alias="Primera")
                request = self._request(headers={"authorization": "Bearer verified-token"})
                with patch.object(
                    connector_api,
                    "_resolve_verified_bearer_claims",
                    return_value={
                        "sub": "admin-user",
                        "email": "admin@kmfxedge.com",
                        "app_metadata": {"role": "admin"},
                        "user_metadata": {"plan": "free"},
                    },
                ):
                    context = connector_api.build_admin_context(request)
                    response = connector_api.connection_key_creation_denial(
                        user_id="admin-user",
                        context=context,
                    )
            finally:
                connector_api.account_service = previous_service

        self.assertTrue(context["is_admin"])
        self.assertIsNone(response)

    def test_signed_bearer_uses_fresh_supabase_app_metadata_for_admin(self) -> None:
        request = self._request(headers={"authorization": "Bearer signed-token"})
        with patch.object(
            connector_api,
            "_resolve_signed_bearer_claims",
            return_value={
                "sub": "admin-user",
                "email": "admin@kmfxedge.com",
                "app_metadata": {"provider": "google"},
                "user_metadata": {},
            },
        ), patch.object(
            connector_api,
            "_resolve_supabase_user_claims",
            return_value={
                "sub": "admin-user",
                "email": "admin@kmfxedge.com",
                "app_metadata": {"provider": "google", "role": "admin", "kmfx_admin": True},
                "user_metadata": {},
            },
        ):
            context = connector_api.build_admin_context(request)

        self.assertTrue(context["is_admin"])
        self.assertEqual("admin", context["app_metadata"]["role"])

    def test_signed_bearer_uses_fresh_supabase_app_metadata_for_plan(self) -> None:
        request = self._request(headers={"authorization": "Bearer signed-token"})
        with patch.object(
            connector_api,
            "_resolve_signed_bearer_claims",
            return_value={
                "sub": "user-123",
                "email": "trader@example.com",
                "app_metadata": {"plan": "pro", "billing_status": "active"},
                "user_metadata": {},
            },
        ), patch.object(
            connector_api,
            "_resolve_supabase_user_claims",
            return_value={
                "sub": "user-123",
                "email": "trader@example.com",
                "app_metadata": {"plan": "free", "billing_status": "canceled"},
                "user_metadata": {},
            },
        ):
            context = connector_api.build_admin_context(request)

        self.assertFalse(context["is_admin"])
        self.assertEqual("free", context["app_metadata"]["plan"])
        self.assertEqual("canceled", context["app_metadata"]["billing_status"])

    def test_supabase_bearer_claims_cache_uses_configured_ttl(self) -> None:
        class FakeAuthResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self):
                return json.dumps(
                    {
                        "id": "user-123",
                        "email": "trader@example.com",
                        "app_metadata": {"plan": "pro"},
                        "user_metadata": {"name": "Trader"},
                    }
                ).encode("utf-8")

        request = self._request(headers={"authorization": "Bearer token-for-cache"})
        cache_key = hashlib.sha256("token-for-cache".encode("utf-8")).hexdigest()
        connector_api.VERIFIED_BEARER_CACHE.clear()
        try:
            with patch.object(connector_api, "SUPABASE_PROJECT_URL", "https://supabase.test"), patch.object(
                connector_api,
                "SUPABASE_ANON_KEY",
                "anon",
            ), patch.object(
                connector_api,
                "VERIFIED_BEARER_CACHE_TTL_SECONDS",
                300,
            ), patch.object(
                connector_api.urllib.request,
                "urlopen",
                return_value=FakeAuthResponse(),
            ) as urlopen, patch.object(
                connector_api.time,
                "time",
                side_effect=[1000, 1001],
            ):
                first = connector_api._resolve_supabase_user_claims(request)
                second = connector_api._resolve_supabase_user_claims(request)

            self.assertEqual(first, second)
            self.assertEqual("user-123", first["sub"])
            self.assertEqual(1, urlopen.call_count)
            self.assertEqual(1300, connector_api.VERIFIED_BEARER_CACHE[cache_key][0])
        finally:
            connector_api.VERIFIED_BEARER_CACHE.clear()

    def test_signed_bearer_sub_mismatch_fails_closed(self) -> None:
        request = self._request(headers={"authorization": "Bearer signed-token"})
        with patch.object(
            connector_api,
            "_resolve_signed_bearer_claims",
            return_value={
                "sub": "admin-user",
                "email": "admin@kmfxedge.com",
                "app_metadata": {"role": "admin"},
                "user_metadata": {},
            },
        ), patch.object(
            connector_api,
            "_resolve_supabase_user_claims",
            return_value={
                "sub": "different-user",
                "email": "admin@kmfxedge.com",
                "app_metadata": {"role": "admin"},
                "user_metadata": {},
            },
        ):
            context = connector_api.build_admin_context(request)

        self.assertFalse(context["is_admin"])
        self.assertEqual("", context["user_id"])
        self.assertEqual("", context["email"])
        self.assertEqual("", context["source"])

    def test_remote_user_headers_do_not_create_identity(self) -> None:
        request = self._request(
            host="203.0.113.10",
            headers={
                "x-kmfx-user-id": "admin-user",
                "x-kmfx-user-email": "admin@kmfxedge.com",
            },
        )
        with patch.object(connector_api, "_resolve_verified_bearer_claims", return_value={}):
            context = connector_api.build_admin_context(request)

        self.assertFalse(context["is_admin"])
        self.assertEqual("", context["user_id"])
        self.assertEqual("", context["email"])
        self.assertEqual("", context["source"])

    def test_local_user_headers_are_scoped_to_trusted_header_identity(self) -> None:
        request = self._request(
            host="127.0.0.1",
            headers={
                "x-kmfx-user-id": "launcher-user",
                "x-kmfx-user-email": "launcher@example.com",
            },
        )
        with patch.object(connector_api, "_resolve_verified_bearer_claims", return_value={}):
            context = connector_api.build_admin_context(request)

        self.assertFalse(context["is_admin"])
        self.assertEqual("launcher-user", context["user_id"])
        self.assertEqual("launcher@example.com", context["email"])
        self.assertEqual("trusted_header", context["source"])

    def test_admin_billing_status_gets_unlimited_effective_access(self) -> None:
        request = self._request(headers={"authorization": "Bearer verified-token"})
        with patch.object(
            connector_api,
            "_resolve_verified_bearer_claims",
            return_value={
                "sub": "admin-user",
                "email": "admin@kmfxedge.com",
                "app_metadata": {"role": "admin", "plan": "free", "billing_status": "unpaid"},
                "user_metadata": {},
            },
        ):
            response = asyncio.run(connector_api.billing_status(request))
        body = json.loads(response.body.decode("utf-8"))

        self.assertEqual(200, response.status_code)
        self.assertTrue(body["is_admin"])
        self.assertEqual("unlimited", body["billing"]["effectivePlan"])
        self.assertEqual("Edge Unlimited", body["billing"]["displayName"])
        self.assertEqual("active", body["billing"]["access"])
        self.assertEqual(connector_api.DEFAULT_CONNECTION_PLAN_LIMITS["admin"], body["limits"]["connectionKeyLimit"])
        self.assertFalse(body["entitlements"]["rawBridgeDebug"])

    def test_billing_status_anonymous_returns_free_limited_entitlements(self) -> None:
        response = asyncio.run(connector_api.billing_status(self._request()))
        body = json.loads(response.body.decode("utf-8"))

        self.assertEqual(200, response.status_code)
        self.assertTrue(body["auth_required"])
        self.assertEqual("anonymous", body["billing"]["status"])
        self.assertEqual("free", body["billing"]["effectivePlan"])
        self.assertEqual(0, body["entitlements"]["liveMt5Accounts"])
        self.assertFalse(body["entitlements"]["launcherConnection"])
        self.assertEqual(0, body["limits"]["connectionKeyLimit"])

    def test_billing_status_reads_plan_from_app_metadata_only(self) -> None:
        request = self._request(headers={"authorization": "Bearer verified-token"})
        with patch.object(
            connector_api,
            "_resolve_verified_bearer_claims",
            return_value={
                "sub": "user-123",
                "email": "user@example.com",
                "app_metadata": {"plan": "pro", "billing_status": "active"},
                "user_metadata": {"plan": "desk"},
            },
        ):
            response = asyncio.run(connector_api.billing_status(request))
        body = json.loads(response.body.decode("utf-8"))

        self.assertEqual(200, response.status_code)
        self.assertFalse(body["auth_required"])
        self.assertEqual("pro", body["billing"]["plan"])
        self.assertEqual("pro", body["billing"]["effectivePlan"])
        self.assertEqual("active", body["billing"]["status"])
        self.assertEqual(5, body["entitlements"]["liveMt5Accounts"])
        self.assertFalse(body["entitlements"]["rawBridgeDebug"])
        self.assertFalse(body["entitlements"]["teamWorkspace"])

    def test_billing_status_restricts_unpaid_to_free_entitlements(self) -> None:
        request = self._request(headers={"authorization": "Bearer verified-token"})
        with patch.object(
            connector_api,
            "_resolve_verified_bearer_claims",
            return_value={
                "sub": "user-123",
                "email": "user@example.com",
                "app_metadata": {"plan": "pro", "billing_status": "unpaid"},
                "user_metadata": {},
            },
        ):
            response = asyncio.run(connector_api.billing_status(request))
        body = json.loads(response.body.decode("utf-8"))

        self.assertEqual(200, response.status_code)
        self.assertEqual("pro", body["billing"]["plan"])
        self.assertEqual("free", body["billing"]["effectivePlan"])
        self.assertEqual("unpaid", body["billing"]["status"])
        self.assertEqual("restricted", body["billing"]["access"])
        self.assertEqual(0, body["entitlements"]["liveMt5Accounts"])
        self.assertFalse(body["entitlements"]["launcherConnection"])

    def test_accounts_snapshot_blocks_live_payload_without_mt5_entitlement(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                connector_api.account_service.link_connector_sync(
                    user_id="user-123",
                    account_info={
                        "broker": "IC Markets",
                        "platform": "mt5",
                        "login": "80571774",
                        "server": "ICMarketsSC-Demo",
                    },
                    payload={
                        "payloadSource": "mt5_sync_live",
                        "balance": 100000,
                        "equity": 100250,
                        "trades": [],
                        "positions": [],
                        "history": [],
                    },
                    api_key="snapshot-free-plan-key",
                )
                request = self._request(headers={"authorization": "Bearer verified-token"})
                with patch.object(
                    connector_api,
                    "_resolve_verified_bearer_claims",
                    return_value={
                        "sub": "user-123",
                        "email": "user@example.com",
                        "app_metadata": {"plan": "free", "billing_status": "free"},
                        "user_metadata": {},
                    },
                ):
                    response = asyncio.run(connector_api.accounts_snapshot(request))
            finally:
                connector_api.account_service = previous_service

        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(200, response.status_code)
        self.assertTrue(body["live_access_blocked"])
        self.assertEqual("entitlement_required", body["reason"])
        self.assertEqual([], body["accounts"])
        self.assertNotIn("100000", response.body.decode("utf-8"))

    def test_accounts_registry_scrubs_live_metrics_without_mt5_entitlement(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                connector_api.account_service.link_connector_sync(
                    user_id="user-123",
                    account_info={
                        "broker": "Darwinex",
                        "platform": "mt5",
                        "login": "4000082126",
                        "server": "Darwinex-Live",
                    },
                    payload={
                        "payloadSource": "mt5_sync_live",
                        "balance": 105552,
                        "equity": 105540,
                        "totalPnl": 3099,
                        "trades": [],
                        "positions": [],
                        "history": [],
                    },
                    api_key="registry-free-plan-key",
                )
                request = self._request(headers={"authorization": "Bearer verified-token"})
                with patch.object(
                    connector_api,
                    "_resolve_verified_bearer_claims",
                    return_value={
                        "sub": "user-123",
                        "email": "user@example.com",
                        "app_metadata": {"plan": "free", "billing_status": "free"},
                        "user_metadata": {},
                    },
                ):
                    response = asyncio.run(connector_api.list_accounts(request))
            finally:
                connector_api.account_service = previous_service

        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(200, response.status_code)
        self.assertTrue(body["live_access_blocked"])
        self.assertEqual("entitlement_required", body["reason"])
        self.assertEqual(1, len(body["accounts"]))
        account = body["accounts"][0]
        self.assertEqual("plan_limited", account["status"])
        self.assertTrue(account["billing_blocked"])
        self.assertNotIn("balance", account)
        self.assertNotIn("equity", account)
        self.assertNotIn("totalPnl", account)
        self.assertNotIn("105552", response.body.decode("utf-8"))
        self.assertNotIn("3099", response.body.decode("utf-8"))

    def test_admin_accounts_snapshot_bypasses_billing_restriction(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                connector_api.account_service.link_connector_sync(
                    user_id="admin-user",
                    account_info={
                        "broker": "Orion",
                        "platform": "mt5",
                        "login": "80571774",
                        "server": "OGMInternational-Server",
                    },
                    payload={
                        "payloadSource": "mt5_sync_live",
                        "balance": 4838,
                        "equity": 4838,
                        "trades": [],
                        "positions": [],
                        "history": [],
                    },
                    api_key="admin-live-snapshot-key",
                )
                request = self._request(headers={"authorization": "Bearer verified-token"})
                with patch.object(
                    connector_api,
                    "_resolve_verified_bearer_claims",
                    return_value={
                        "sub": "admin-user",
                        "email": "admin@kmfxedge.com",
                        "app_metadata": {"role": "admin", "plan": "free", "billing_status": "unpaid"},
                        "user_metadata": {},
                    },
                ):
                    response = asyncio.run(connector_api.accounts_snapshot(request))
            finally:
                connector_api.account_service = previous_service

        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(200, response.status_code)
        self.assertTrue(body["is_admin"])
        self.assertFalse(body.get("live_access_blocked", False))
        self.assertEqual(1, len(body["accounts"]))
        self.assertEqual("4838", str(body["accounts"][0]["dashboard_payload"]["balance"]))

    def test_accounts_summary_snapshot_uses_short_cache_without_caching_full_snapshot(self) -> None:
        request = self._request(headers={"authorization": "Bearer verified-token"})
        calls: list[bool] = []

        def fake_snapshot(user_id, allowed_connection_keys=None, *, summary_only=False):
            calls.append(summary_only)
            return {
                "accounts": [
                    {
                        "account_id": "acc-1",
                        "user_id": user_id,
                        "display_name": "IC Markets",
                        "dashboard_payload": {
                            "payloadShape": "summary" if summary_only else "full",
                            "balance": 100000,
                        },
                    }
                ],
                "active_account_id": "acc-1",
                "portfolio_risk": {},
                "snapshot_mode": "summary" if summary_only else "full",
                "updated_at": "2026-05-11T07:00:00Z",
            }

        connector_api.clear_accounts_summary_snapshot_cache()
        try:
            with patch.object(
                connector_api,
                "_resolve_verified_bearer_claims",
                return_value={
                    "sub": "admin-user",
                    "email": "admin@kmfxedge.com",
                    "app_metadata": {"role": "admin", "plan": "free", "billing_status": "unpaid"},
                    "user_metadata": {},
                },
            ), patch.object(connector_api, "build_live_accounts_snapshot", side_effect=fake_snapshot):
                first = asyncio.run(connector_api.accounts_snapshot(request, view="summary"))
                second = asyncio.run(connector_api.accounts_snapshot(request, view="summary"))
                full = asyncio.run(connector_api.accounts_snapshot(request, view="full"))
        finally:
            connector_api.clear_accounts_summary_snapshot_cache()

        self.assertEqual([True, False], calls)
        self.assertEqual("summary", json.loads(first.body.decode("utf-8"))["snapshot_mode"])
        self.assertEqual("summary", json.loads(second.body.decode("utf-8"))["snapshot_mode"])
        self.assertEqual("full", json.loads(full.body.decode("utf-8"))["snapshot_mode"])

    def test_billing_status_keeps_past_due_entitlements_with_attention_state(self) -> None:
        request = self._request(headers={"authorization": "Bearer verified-token"})
        with patch.object(
            connector_api,
            "_resolve_verified_bearer_claims",
            return_value={
                "sub": "user-123",
                "email": "user@example.com",
                "app_metadata": {"plan": "core", "billing_status": "past_due"},
                "user_metadata": {},
            },
        ):
            response = asyncio.run(connector_api.billing_status(request))
        body = json.loads(response.body.decode("utf-8"))

        self.assertEqual(200, response.status_code)
        self.assertEqual("core", body["billing"]["effectivePlan"])
        self.assertEqual("billing_attention", body["billing"]["access"])
        self.assertEqual(2, body["entitlements"]["liveMt5Accounts"])
        self.assertTrue(body["entitlements"]["launcherConnection"])

    def test_billing_checkout_creates_subscription_session(self) -> None:
        request = self._request(
            headers={"authorization": "Bearer billing-token"},
            json_body={"plan": "pro", "interval": "monthly"},
        )
        user_id = "11111111-1111-4111-8111-111111111111"
        with patch.object(
            connector_api,
            "_resolve_verified_bearer_claims",
            return_value={
                "sub": user_id,
                "email": "billing@example.com",
                "app_metadata": {"plan": "free"},
                "user_metadata": {},
            },
        ), patch.object(
            connector_api,
            "resolve_stripe_price_reference",
            return_value={"price_id": "price_pro_monthly", "lookup_key": "kmfx_pro_monthly"},
        ) as price_mock, patch.object(
            connector_api,
            "ensure_billing_customer",
            return_value="cus_123",
        ) as customer_mock, patch.object(
            connector_api,
            "stripe_api_request",
            return_value={"id": "cs_123", "url": "https://checkout.stripe.test/session"},
        ) as stripe_mock:
            response = asyncio.run(connector_api.billing_checkout(request))

        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(200, response.status_code)
        self.assertTrue(body["ok"])
        self.assertEqual("https://checkout.stripe.test/session", body["url"])
        price_mock.assert_called_once_with("pro", "monthly")
        customer_mock.assert_called_once()
        _, path, params = stripe_mock.call_args.args
        self.assertEqual("/checkout/sessions", path)
        self.assertEqual("subscription", params["mode"])
        self.assertEqual("cus_123", params["customer"])
        self.assertEqual("price_pro_monthly", params["line_items"][0]["price"])
        self.assertEqual(user_id, params["metadata"]["kmfx_user_id"])
        self.assertEqual(user_id, params["metadata"]["user_id"])
        self.assertEqual("pro", params["metadata"]["plan_key"])
        self.assertEqual("pro", params["subscription_data"]["metadata"]["kmfx_plan"])
        self.assertEqual("pro", params["subscription_data"]["metadata"]["plan_key"])
        self.assertEqual(7, params["subscription_data"]["trial_period_days"])
        self.assertEqual("if_required", params["payment_method_collection"])

    def test_billing_checkout_requires_authenticated_supabase_user(self) -> None:
        response = asyncio.run(connector_api.billing_checkout(self._request(json_body={"plan": "pro"})))
        body = json.loads(response.body.decode("utf-8"))

        self.assertEqual(401, response.status_code)
        self.assertEqual("auth_required", body["reason"])

    def test_billing_checkout_can_be_disabled_by_feature_flag(self) -> None:
        request = self._request(
            headers={"authorization": "Bearer billing-token"},
            json_body={"plan": "pro", "interval": "monthly"},
        )
        with patch.dict(os.environ, {"KMFX_DISABLE_BILLING": "true"}, clear=False), patch.object(
            connector_api,
            "_resolve_verified_bearer_claims",
            return_value={
                "sub": "11111111-1111-4111-8111-111111111111",
                "email": "billing@example.com",
                "app_metadata": {"plan": "free"},
                "user_metadata": {},
            },
        ), patch.object(connector_api, "stripe_api_request") as stripe_mock:
            response = asyncio.run(connector_api.billing_checkout(request))

        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(503, response.status_code)
        self.assertEqual("feature_disabled", body["reason"])
        self.assertEqual("billing", body["feature"])
        stripe_mock.assert_not_called()

    def test_billing_default_return_urls_open_subscription_tab(self) -> None:
        with patch.dict(
            os.environ,
            {
                "NEXT_PUBLIC_APP_URL": "https://kmfxedge.com",
                "BILLING_SUCCESS_PATH": "",
                "BILLING_CANCEL_PATH": "",
            },
            clear=False,
        ):
            self.assertEqual(
                "https://kmfxedge.com/ajustes?tab=subscription&checkout=success&session_id={CHECKOUT_SESSION_ID}",
                connector_api.billing_success_url(),
            )
            self.assertEqual(
                "https://kmfxedge.com/ajustes?tab=subscription&checkout=cancelled",
                connector_api.billing_cancel_url(),
            )

    def test_billing_checkout_rejects_external_return_urls(self) -> None:
        request = self._request(
            headers={"authorization": "Bearer billing-url-token"},
            json_body={
                "plan": "pro",
                "interval": "monthly",
                "success_url": "https://evil.example/steal",
                "cancel_url": "//evil.example/cancel",
            },
        )
        user_id = "33333333-3333-4333-8333-333333333333"
        with patch.dict(os.environ, {"NEXT_PUBLIC_APP_URL": "https://kmfxedge.com"}, clear=False), patch.object(
            connector_api,
            "_resolve_verified_bearer_claims",
            return_value={
                "sub": user_id,
                "email": "billing-url@example.com",
                "app_metadata": {"plan": "free"},
                "user_metadata": {},
            },
        ), patch.object(
            connector_api,
            "resolve_stripe_price_reference",
            return_value={"price_id": "price_pro_monthly", "lookup_key": "kmfx_pro_monthly"},
        ), patch.object(
            connector_api,
            "ensure_billing_customer",
            return_value="cus_url",
        ), patch.object(
            connector_api,
            "stripe_api_request",
            return_value={"id": "cs_url", "url": "https://checkout.stripe.test/session"},
        ) as stripe_mock:
            response = asyncio.run(connector_api.billing_checkout(request))

        self.assertEqual(200, response.status_code)
        _, _, params = stripe_mock.call_args.args
        self.assertEqual(
            "https://kmfxedge.com/ajustes?tab=subscription&checkout=success&session_id={CHECKOUT_SESSION_ID}",
            params["success_url"],
        )
        self.assertEqual("https://kmfxedge.com/ajustes?tab=subscription&checkout=cancelled", params["cancel_url"])

    def test_billing_checkout_accepts_unlimited_plan(self) -> None:
        request = self._request(
            headers={"authorization": "Bearer billing-token"},
            json_body={"plan": "unlimited", "interval": "yearly"},
        )
        user_id = "11111111-1111-4111-8111-111111111111"
        with patch.object(
            connector_api,
            "_resolve_verified_bearer_claims",
            return_value={
                "sub": user_id,
                "email": "billing@example.com",
                "app_metadata": {"plan": "free"},
                "user_metadata": {},
            },
        ), patch.object(
            connector_api,
            "resolve_stripe_price_reference",
            return_value={"price_id": "price_unlimited_yearly", "lookup_key": "kmfx_unlimited_yearly"},
        ) as price_mock, patch.object(
            connector_api,
            "ensure_billing_customer",
            return_value="cus_123",
        ), patch.object(
            connector_api,
            "stripe_api_request",
            return_value={"id": "cs_123", "url": "https://checkout.stripe.test/session"},
        ) as stripe_mock:
            response = asyncio.run(connector_api.billing_checkout(request))

        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(200, response.status_code)
        self.assertTrue(body["ok"])
        self.assertEqual("unlimited", body["plan"])
        self.assertEqual("yearly", body["interval"])
        price_mock.assert_called_once_with("unlimited", "yearly")
        _, _, params = stripe_mock.call_args.args
        self.assertEqual("unlimited", params["metadata"]["kmfx_plan"])
        self.assertEqual("unlimited", params["subscription_data"]["metadata"]["kmfx_plan"])

    def test_live_kmfx_price_ids_map_to_expected_plans(self) -> None:
        with patch.dict(
            os.environ,
            {
                "STRIPE_PRICE_CORE_MONTHLY": "price_1TUBYUEoC6e7wNItXEGCdVZ4",
                "STRIPE_PRICE_CORE_YEARLY": "price_1TUC1ZEoC6e7wNItpQF7UGPA",
                "STRIPE_PRICE_PRO_MONTHLY": "price_1TULXwEoC6e7wNItP3e4pCh4",
                "STRIPE_PRICE_PRO_YEARLY": "price_1TULY0EoC6e7wNItYVKQKHIi",
                "STRIPE_PRICE_UNLIMITED_MONTHLY": "price_1TUC5uEoC6e7wNItcPyjGy5Z",
                "STRIPE_PRICE_UNLIMITED_YEARLY": "price_1TUC65EoC6e7wNItBfoMCblt",
            },
        ):
            self.assertEqual(
                {"price_id": "price_1TUBYUEoC6e7wNItXEGCdVZ4", "lookup_key": ""},
                connector_api.resolve_stripe_price_reference("core", "monthly"),
            )
            self.assertEqual(
                "core",
                connector_api.stripe_plan_from_price({"id": "price_1TUC1ZEoC6e7wNItpQF7UGPA", "metadata": {}}),
            )
            self.assertEqual(
                "pro",
                connector_api.stripe_plan_from_price({"id": "price_1TULY0EoC6e7wNItYVKQKHIi", "metadata": {}}),
            )
            self.assertEqual(
                "unlimited",
                connector_api.stripe_plan_from_price({"id": "price_1TUC65EoC6e7wNItBfoMCblt", "metadata": {}}),
            )

    def test_billing_price_defaults_use_live_ids_until_lookup_keys_exist(self) -> None:
        empty_price_env = {
            name: ""
            for name in (
                "STRIPE_PRICE_CORE_MONTHLY",
                "STRIPE_PRICE_CORE_YEARLY",
                "STRIPE_PRICE_PRO_MONTHLY",
                "STRIPE_PRICE_PRO_YEARLY",
                "STRIPE_PRICE_UNLIMITED_MONTHLY",
                "STRIPE_PRICE_UNLIMITED_YEARLY",
                "KMFX_STRIPE_PRICE_CORE_MONTHLY",
                "KMFX_STRIPE_PRICE_CORE_YEARLY",
                "KMFX_STRIPE_PRICE_PRO_MONTHLY",
                "KMFX_STRIPE_PRICE_PRO_YEARLY",
                "KMFX_STRIPE_PRICE_UNLIMITED_MONTHLY",
                "KMFX_STRIPE_PRICE_UNLIMITED_YEARLY",
            )
        }
        with patch.dict(os.environ, empty_price_env, clear=False):
            self.assertEqual("price_1TUBYUEoC6e7wNItXEGCdVZ4", connector_api.billing_plan_price_reference("core", "monthly"))
            self.assertEqual("price_1TULXwEoC6e7wNItP3e4pCh4", connector_api.billing_plan_price_reference("pro", "monthly"))
            self.assertEqual(
                "price_1TUC65EoC6e7wNItBfoMCblt",
                connector_api.billing_plan_price_reference("unlimited", "yearly"),
            )

    def test_stripe_plan_from_price_accepts_plan_key_metadata(self) -> None:
        self.assertEqual(
            "core",
            connector_api.stripe_plan_from_price({"id": "price_unknown", "metadata": {"app": "kmfx_edge", "plan_key": "core"}}),
        )

    def test_stripe_subscription_row_accepts_generic_kmfx_metadata_contract(self) -> None:
        row = connector_api.stripe_subscription_to_billing_row(
            {
                "id": "sub_generic",
                "customer": "cus_generic",
                "status": "trialing",
                "metadata": {
                    "app": "kmfx_edge",
                    "user_id": "77777777-7777-4777-8777-777777777777",
                    "plan_key": "unlimited",
                },
                "items": {
                    "data": [
                        {
                            "price": {
                                "id": "price_generic",
                                "product": "prod_UT7nzmgj3Eg3Zv",
                                "metadata": {},
                            }
                        }
                    ]
                },
            }
        )

        self.assertEqual("77777777-7777-4777-8777-777777777777", row["user_id"])
        self.assertEqual("unlimited", row["plan_key"])
        self.assertEqual("trialing", row["status"])

    def test_billing_portal_creates_customer_portal_session(self) -> None:
        request = self._request(
            headers={"authorization": "Bearer billing-token"},
            json_body={"return_url": "https://kmfxedge.com/ajustes"},
        )
        user_id = "22222222-2222-4222-8222-222222222222"
        with patch.object(
            connector_api,
            "_resolve_verified_bearer_claims",
            return_value={
                "sub": user_id,
                "email": "billing@example.com",
                "app_metadata": {"plan": "pro"},
                "user_metadata": {},
            },
        ), patch.object(
            connector_api,
            "ensure_billing_customer",
            return_value="cus_456",
        ), patch.object(
            connector_api,
            "stripe_api_request",
            return_value={"id": "bps_123", "url": "https://billing.stripe.test/portal"},
        ) as stripe_mock:
            response = asyncio.run(connector_api.billing_portal(request))

        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(200, response.status_code)
        self.assertTrue(body["ok"])
        self.assertEqual("https://billing.stripe.test/portal", body["portal_url"])
        _, path, params = stripe_mock.call_args.args
        self.assertEqual("/billing_portal/sessions", path)
        self.assertEqual("cus_456", params["customer"])
        self.assertEqual("https://kmfxedge.com/ajustes", params["return_url"])

    def test_billing_portal_rejects_external_return_url(self) -> None:
        request = self._request(
            headers={"authorization": "Bearer billing-portal-url-token"},
            json_body={"return_url": "https://evil.example/portal"},
        )
        user_id = "44444444-4444-4444-8444-444444444444"
        with patch.dict(os.environ, {"NEXT_PUBLIC_APP_URL": "https://kmfxedge.com"}, clear=False), patch.object(
            connector_api,
            "_resolve_verified_bearer_claims",
            return_value={
                "sub": user_id,
                "email": "billing-portal-url@example.com",
                "app_metadata": {"plan": "pro"},
                "user_metadata": {},
            },
        ), patch.object(
            connector_api,
            "ensure_billing_customer",
            return_value="cus_portal_url",
        ), patch.object(
            connector_api,
            "stripe_api_request",
            return_value={"id": "bps_url", "url": "https://billing.stripe.test/portal"},
        ) as stripe_mock:
            response = asyncio.run(connector_api.billing_portal(request))

        self.assertEqual(200, response.status_code)
        _, path, params = stripe_mock.call_args.args
        self.assertEqual("/billing_portal/sessions", path)
        self.assertEqual("cus_portal_url", params["customer"])
        self.assertEqual("https://kmfxedge.com/ajustes", params["return_url"])

    def test_billing_event_reservation_stays_retryable_until_processed(self) -> None:
        event = {
            "id": "evt_retryable",
            "type": "customer.subscription.updated",
            "livemode": False,
            "data": {"object": {"id": "sub_retryable"}},
        }
        with patch.object(connector_api, "supabase_billing_event_state", return_value={}), patch.object(
            connector_api,
            "supabase_admin_request",
        ) as admin_mock:
            should_process = connector_api.record_billing_event_once(event)

        self.assertTrue(should_process)
        admin_mock.assert_called_once()
        method, path = admin_mock.call_args.args[:2]
        self.assertEqual("POST", method)
        self.assertEqual("/rest/v1/billing_events", path)
        payload = admin_mock.call_args.kwargs["payload"]
        self.assertEqual("evt_retryable", payload["stripe_event_id"])
        self.assertEqual("failed", payload["status"])
        self.assertEqual("processing_started", payload["error"])

    def test_billing_failed_event_can_retry_without_marking_processed_first(self) -> None:
        event = {
            "id": "evt_failed_retry",
            "type": "invoice.payment_failed",
            "livemode": True,
            "data": {"object": {"id": "in_failed"}},
        }
        with patch.object(connector_api, "supabase_billing_event_state", return_value={"status": "failed"}), patch.object(
            connector_api,
            "supabase_admin_request",
        ) as admin_mock:
            should_process = connector_api.record_billing_event_once(event)

        self.assertTrue(should_process)
        admin_mock.assert_called_once()
        method, path = admin_mock.call_args.args[:2]
        self.assertEqual("PATCH", method)
        self.assertEqual("/rest/v1/billing_events", path)
        payload = admin_mock.call_args.kwargs["payload"]
        self.assertEqual("failed", payload["status"])
        self.assertEqual("processing_started", payload["error"])

    def test_billing_event_currently_processing_is_not_started_twice(self) -> None:
        event = {
            "id": "evt_processing",
            "type": "customer.subscription.updated",
            "livemode": True,
            "data": {"object": {"id": "sub_processing"}},
        }
        state = {
            "status": "failed",
            "error": "processing_started",
            "processed_at": connector_api.now_iso(),
        }
        with patch.object(connector_api, "supabase_billing_event_state", return_value=state), patch.object(
            connector_api,
            "supabase_admin_request",
        ) as admin_mock:
            should_process = connector_api.record_billing_event_once(event)

        self.assertFalse(should_process)
        admin_mock.assert_not_called()

    def test_billing_processed_or_ignored_event_is_not_reprocessed(self) -> None:
        event = {"id": "evt_done", "type": "customer.subscription.updated", "data": {"object": {}}}
        for status in ("processed", "ignored"):
            with self.subTest(status=status), patch.object(
                connector_api,
                "supabase_billing_event_state",
                return_value={"status": status},
            ), patch.object(connector_api, "supabase_admin_request") as admin_mock:
                should_process = connector_api.record_billing_event_once(event)
                self.assertFalse(should_process)
                admin_mock.assert_not_called()

    def _stripe_signature_header(self, body: bytes, secret: str, timestamp: int | None = None) -> str:
        timestamp = timestamp or int(time.time())
        signed_payload = f"{timestamp}.".encode("utf-8") + body
        signature = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
        return f"t={timestamp},v1={signature}"

    def test_billing_webhook_verifies_signature_and_processes_once(self) -> None:
        secret = "whsec_test_secret"
        event = {
            "id": "evt_123",
            "type": "customer.subscription.updated",
            "livemode": False,
            "data": {
                "object": {
                    "id": "sub_123",
                    "customer": "cus_123",
                    "status": "active",
                    "metadata": {"kmfx_user_id": "33333333-3333-4333-8333-333333333333"},
                    "items": {"data": [{"price": {"id": "price_pro", "lookup_key": "kmfx_pro_monthly"}}]},
                }
            },
        }
        body_bytes = json.dumps(event, separators=(",", ":")).encode("utf-8")
        request = self._request(
            headers={"stripe-signature": self._stripe_signature_header(body_bytes, secret)},
            body_bytes=body_bytes,
        )
        with patch.dict(os.environ, {"STRIPE_WEBHOOK_SECRET": secret}), patch.object(
            connector_api,
            "record_billing_event_once",
            return_value=True,
        ) as record_mock, patch.object(
            connector_api,
            "process_stripe_billing_event",
            return_value={"user_id": "33333333-3333-4333-8333-333333333333", "plan": "pro", "status": "active"},
        ) as process_mock, patch.object(
            connector_api,
            "mark_billing_event_status",
        ) as mark_mock:
            response = asyncio.run(connector_api.billing_webhook(request))

        payload = json.loads(response.body.decode("utf-8"))
        self.assertEqual(200, response.status_code)
        self.assertTrue(payload["ok"])
        self.assertEqual("evt_123", payload["event_id"])
        record_mock.assert_called_once()
        process_mock.assert_called_once()
        mark_mock.assert_called_with("evt_123", "processed")

    def test_billing_webhook_rejects_invalid_signature(self) -> None:
        body_bytes = b'{"id":"evt_bad","type":"customer.updated","data":{"object":{}}}'
        request = self._request(headers={"stripe-signature": "t=1,v1=bad"}, body_bytes=body_bytes)
        with patch.dict(os.environ, {"STRIPE_WEBHOOK_SECRET": "whsec_test_secret"}):
            response = asyncio.run(connector_api.billing_webhook(request))
        payload = json.loads(response.body.decode("utf-8"))

        self.assertEqual(400, response.status_code)
        self.assertEqual("invalid_signature", payload["reason"])

    def test_billing_webhook_ignores_non_kmfx_subscription_events(self) -> None:
        secret = "whsec_test_secret"
        event = {
            "id": "evt_external",
            "type": "customer.subscription.updated",
            "livemode": True,
            "data": {
                "object": {
                    "id": "sub_external",
                    "customer": "cus_external",
                    "status": "active",
                    "metadata": {},
                    "items": {"data": [{"price": {"id": "price_external", "lookup_key": "external_monthly", "metadata": {}}}]},
                }
            },
        }
        body_bytes = json.dumps(event, separators=(",", ":")).encode("utf-8")
        request = self._request(
            headers={"stripe-signature": self._stripe_signature_header(body_bytes, secret)},
            body_bytes=body_bytes,
        )
        with patch.dict(os.environ, {"STRIPE_WEBHOOK_SECRET": secret}, clear=True), patch.object(
            connector_api,
            "record_billing_event_once",
            return_value=True,
        ), patch.object(connector_api, "sync_billing_subscription") as sync_mock, patch.object(
            connector_api,
            "mark_billing_event_status",
        ) as mark_mock:
            response = asyncio.run(connector_api.billing_webhook(request))

        payload = json.loads(response.body.decode("utf-8"))
        self.assertEqual(200, response.status_code)
        self.assertEqual({"ignored": "non_kmfx_subscription"}, payload["result"])
        sync_mock.assert_not_called()
        mark_mock.assert_called_with("evt_external", "ignored")

    def test_billing_webhook_ignores_generic_user_metadata_without_kmfx_product(self) -> None:
        secret = "whsec_test_secret"
        event = {
            "id": "evt_external_user_metadata",
            "type": "customer.subscription.updated",
            "livemode": True,
            "data": {
                "object": {
                    "id": "sub_external_user_metadata",
                    "customer": "cus_external",
                    "status": "active",
                    "metadata": {
                        "user_id": "33333333-3333-4333-8333-333333333333",
                        "plan_key": "pro",
                    },
                    "items": {
                        "data": [
                            {
                                "price": {
                                    "id": "price_external",
                                    "lookup_key": "external_monthly",
                                    "product": "prod_external",
                                    "metadata": {},
                                }
                            }
                        ]
                    },
                }
            },
        }
        body_bytes = json.dumps(event, separators=(",", ":")).encode("utf-8")
        request = self._request(
            headers={"stripe-signature": self._stripe_signature_header(body_bytes, secret)},
            body_bytes=body_bytes,
        )
        with patch.dict(os.environ, {"STRIPE_WEBHOOK_SECRET": secret}, clear=True), patch.object(
            connector_api,
            "record_billing_event_once",
            return_value=True,
        ), patch.object(connector_api, "sync_billing_subscription") as sync_mock, patch.object(
            connector_api,
            "mark_billing_event_status",
        ) as mark_mock:
            response = asyncio.run(connector_api.billing_webhook(request))

        payload = json.loads(response.body.decode("utf-8"))
        self.assertEqual(200, response.status_code)
        self.assertEqual({"ignored": "non_kmfx_subscription"}, payload["result"])
        sync_mock.assert_not_called()
        mark_mock.assert_called_with("evt_external_user_metadata", "ignored")

    def test_checkout_session_completed_sends_purchase_confirmation_without_breaking_access_sync(self) -> None:
        session = {
            "id": "cs_123",
            "livemode": True,
            "customer": "cus_123",
            "subscription": "sub_123",
            "customer_details": {"email": "buyer@example.com"},
            "client_reference_id": "55555555-5555-4555-8555-555555555555",
            "metadata": {
                "app": "kmfx_edge",
                "kmfx_user_id": "55555555-5555-4555-8555-555555555555",
                "kmfx_user_email": "buyer@example.com",
                "kmfx_plan": "unlimited",
                "kmfx_interval": "yearly",
            },
        }
        subscription = {
            "id": "sub_123",
            "customer": "cus_123",
            "status": "active",
            "metadata": {
                "kmfx_user_id": "55555555-5555-4555-8555-555555555555",
                "kmfx_user_email": "buyer@example.com",
                "kmfx_plan": "unlimited",
            },
            "items": {"data": [{"price": {"id": "price_unlimited", "lookup_key": "kmfx_unlimited_yearly"}}]},
        }
        with patch.object(connector_api, "supabase_upsert_billing_customer") as customer_mock, patch.object(
            connector_api,
            "fetch_stripe_subscription",
            return_value=subscription,
        ), patch.object(
            connector_api,
            "sync_billing_subscription",
            return_value={"user_id": "55555555-5555-4555-8555-555555555555", "plan": "unlimited", "status": "active"},
        ) as sync_mock, patch.object(
            connector_api,
            "send_purchase_confirmation_email",
            return_value={"sent": False, "reason": "email_not_configured"},
        ) as email_mock:
            result = connector_api.process_checkout_session_completed(session)

        customer_mock.assert_called_once()
        sync_mock.assert_called_once()
        email_mock.assert_called_once_with(email="buyer@example.com", plan="unlimited", interval="yearly")
        self.assertEqual({"sent": False, "reason": "email_not_configured"}, result["email"])

    def test_checkout_session_completed_ignores_generic_metadata_without_app(self) -> None:
        session = {
            "id": "cs_external",
            "livemode": True,
            "customer": "cus_external",
            "subscription": "sub_external",
            "customer_details": {"email": "buyer@example.com"},
            "client_reference_id": "55555555-5555-4555-8555-555555555555",
            "metadata": {
                "user_id": "55555555-5555-4555-8555-555555555555",
                "plan_key": "pro",
            },
        }
        with patch.object(connector_api, "fetch_stripe_subscription") as fetch_mock, patch.object(
            connector_api,
            "sync_billing_subscription",
        ) as sync_mock:
            result = connector_api.process_checkout_session_completed(session)

        self.assertEqual({"ignored": "non_kmfx_checkout_session"}, result)
        fetch_mock.assert_not_called()
        sync_mock.assert_not_called()

    def test_customer_updated_ignores_generic_metadata_without_kmfx_app(self) -> None:
        event = {
            "id": "evt_customer_external",
            "type": "customer.updated",
            "data": {
                "object": {
                    "id": "cus_external",
                    "email": "external@example.com",
                    "metadata": {
                        "user_id": "55555555-5555-4555-8555-555555555555",
                    },
                }
            },
        }
        with patch.object(connector_api, "supabase_upsert_billing_customer") as customer_mock:
            result = connector_api.process_stripe_billing_event(event)

        self.assertEqual({"ignored": "non_kmfx_customer"}, result)
        customer_mock.assert_not_called()

    def test_customer_updated_accepts_kmfx_app_metadata(self) -> None:
        event = {
            "id": "evt_customer_kmfx",
            "type": "customer.updated",
            "data": {
                "object": {
                    "id": "cus_kmfx",
                    "email": "buyer@example.com",
                    "livemode": True,
                    "metadata": {
                        "app": "kmfx_edge",
                        "kmfx_user_id": "55555555-5555-4555-8555-555555555555",
                    },
                }
            },
        }
        with patch.object(connector_api, "supabase_upsert_billing_customer") as customer_mock:
            result = connector_api.process_stripe_billing_event(event)

        self.assertEqual("55555555-5555-4555-8555-555555555555", result["user_id"])
        self.assertEqual("cus_kmfx", result["customer"])
        customer_mock.assert_called_once()

    def test_invoice_payment_failed_syncs_kmfx_subscription_state(self) -> None:
        invoice = {
            "id": "in_123",
            "subscription": "sub_123",
            "customer": "cus_123",
        }
        subscription = {
            "id": "sub_123",
            "customer": "cus_123",
            "status": "past_due",
            "metadata": {
                "app": "kmfx_edge",
                "user_id": "66666666-6666-4666-8666-666666666666",
                "kmfx_user_email": "pastdue@example.com",
                "plan_key": "pro",
            },
            "items": {"data": [{"price": {"id": "price_pro_monthly", "lookup_key": "kmfx_pro_monthly"}}]},
        }
        with patch.object(connector_api, "fetch_stripe_subscription", return_value=subscription) as fetch_mock, patch.object(
            connector_api,
            "sync_billing_subscription",
            return_value={"user_id": "66666666-6666-4666-8666-666666666666", "plan": "pro", "status": "past_due"},
        ) as sync_mock, patch.object(
            connector_api,
            "send_payment_failed_email",
            return_value={"sent": False, "reason": "email_not_configured"},
        ) as email_mock, patch.object(connector_api, "emit_audit_event") as audit_mock:
            result = connector_api.process_stripe_billing_event(
                {
                    "id": "evt_invoice_failed",
                    "type": "invoice.payment_failed",
                    "data": {"object": invoice},
                }
            )

        fetch_mock.assert_called_once_with("sub_123")
        sync_mock.assert_called_once_with(subscription)
        email_mock.assert_called_once_with(email="pastdue@example.com", plan="pro", event_id="evt_invoice_failed")
        self.assertEqual("invoice.payment_failed", result["invoice_event"])
        self.assertEqual("in_123", result["invoice_id"])
        self.assertEqual({"sent": False, "reason": "email_not_configured"}, result["email"])
        audit_mock.assert_called_once()
        self.assertEqual("billing_payment_failed", audit_mock.call_args.args[0])
        self.assertEqual("66666666-6666-4666-8666-666666666666", audit_mock.call_args.kwargs["user_id"])
        self.assertEqual("failed", audit_mock.call_args.kwargs["status"])
        self.assertEqual("invoice.payment_failed", audit_mock.call_args.kwargs["details"]["stripe_event_type"])

    def test_invoice_paid_syncs_kmfx_subscription_renewal_state(self) -> None:
        invoice = {
            "id": "in_renewal",
            "subscription": "sub_renewal",
            "customer": "cus_renewal",
        }
        subscription = {
            "id": "sub_renewal",
            "customer": "cus_renewal",
            "status": "active",
            "metadata": {
                "app": "kmfx_edge",
                "user_id": "77777777-7777-4777-8777-777777777777",
                "plan_key": "pro",
            },
            "items": {"data": [{"price": {"id": "price_pro_monthly", "lookup_key": "kmfx_pro_monthly"}}]},
        }
        with patch.object(connector_api, "fetch_stripe_subscription", return_value=subscription) as fetch_mock, patch.object(
            connector_api,
            "sync_billing_subscription",
            return_value={"user_id": "77777777-7777-4777-8777-777777777777", "plan": "pro", "status": "active"},
        ) as sync_mock:
            result = connector_api.process_stripe_billing_event(
                {
                    "id": "evt_invoice_paid",
                    "type": "invoice.paid",
                    "data": {"object": invoice},
                }
            )

        fetch_mock.assert_called_once_with("sub_renewal")
        sync_mock.assert_called_once_with(subscription)
        self.assertEqual("invoice.paid", result["invoice_event"])
        self.assertEqual("in_renewal", result["invoice_id"])

    def test_subscription_updated_plan_change_maps_to_new_entitlement(self) -> None:
        subscription = {
            "id": "sub_plan_change",
            "customer": "cus_plan_change",
            "status": "active",
            "metadata": {
                "kmfx_user_id": "88888888-8888-4888-8888-888888888888",
                "kmfx_user_email": "upgrade@example.com",
            },
            "items": {"data": [{"price": {"id": "price_unlimited_monthly", "lookup_key": "kmfx_unlimited_monthly"}}]},
        }
        with patch.object(connector_api, "supabase_upsert_billing_customer"), patch.object(
            connector_api,
            "supabase_upsert_billing_subscription",
        ) as subscription_mock, patch.object(
            connector_api,
            "supabase_update_auth_app_metadata",
        ) as metadata_mock, patch.object(connector_api, "emit_audit_event") as audit_mock:
            result = connector_api.process_stripe_billing_event(
                {
                    "id": "evt_subscription_updated",
                    "type": "customer.subscription.updated",
                    "data": {"object": subscription},
                }
            )

        self.assertEqual("unlimited", result["plan"])
        subscription_row = subscription_mock.call_args.args[0]
        self.assertEqual("unlimited", subscription_row["plan_key"])
        self.assertEqual("active", subscription_row["status"])
        metadata = metadata_mock.call_args.args[1]
        self.assertEqual("unlimited", metadata["kmfx_plan"])
        self.assertEqual("active", metadata["kmfx_billing_status"])
        audit_mock.assert_called_once()
        self.assertEqual("billing_plan_changed", audit_mock.call_args.args[0])
        self.assertEqual("88888888-8888-4888-8888-888888888888", audit_mock.call_args.kwargs["user_id"])
        self.assertEqual("active", audit_mock.call_args.kwargs["status"])
        self.assertEqual("customer.subscription.updated", audit_mock.call_args.kwargs["details"]["stripe_event_type"])

    def test_subscription_deleted_event_downgrades_app_metadata_to_free(self) -> None:
        subscription = {
            "id": "sub_cancelled",
            "customer": "cus_cancelled",
            "status": "canceled",
            "metadata": {
                "kmfx_user_id": "99999999-9999-4999-8999-999999999999",
                "kmfx_user_email": "cancelled@example.com",
                "plan_key": "pro",
            },
            "items": {"data": [{"price": {"id": "price_pro_monthly", "lookup_key": "kmfx_pro_monthly"}}]},
        }
        with patch.object(connector_api, "supabase_upsert_billing_customer"), patch.object(
            connector_api,
            "supabase_upsert_billing_subscription",
        ) as subscription_mock, patch.object(
            connector_api,
            "supabase_update_auth_app_metadata",
        ) as metadata_mock, patch.object(
            connector_api,
            "send_subscription_canceled_email",
            return_value={"sent": False, "reason": "email_not_configured"},
        ) as email_mock:
            result = connector_api.process_stripe_billing_event(
                {
                    "id": "evt_subscription_deleted",
                    "type": "customer.subscription.deleted",
                    "data": {"object": subscription},
                }
            )

        self.assertEqual("pro", result["plan"])
        self.assertEqual("canceled", result["status"])
        email_mock.assert_called_once_with(email="cancelled@example.com", plan="pro", event_id="evt_subscription_deleted")
        self.assertEqual({"sent": False, "reason": "email_not_configured"}, result["email"])
        subscription_row = subscription_mock.call_args.args[0]
        self.assertEqual("canceled", subscription_row["status"])
        self.assertFalse(subscription_row["is_current"])
        metadata = metadata_mock.call_args.args[1]
        self.assertEqual("free", metadata["kmfx_plan"])
        self.assertEqual("canceled", metadata["kmfx_billing_status"])

    def test_sync_subscription_updates_billing_tables_and_app_metadata(self) -> None:
        subscription = {
            "id": "sub_123",
            "customer": "cus_123",
            "status": "active",
            "current_period_start": 1770000000,
            "current_period_end": 1772600000,
            "cancel_at_period_end": False,
            "metadata": {
                "kmfx_user_id": "44444444-4444-4444-8444-444444444444",
                "kmfx_user_email": "pro@example.com",
            },
            "items": {
                "data": [
                    {
                        "price": {
                            "id": "price_pro_monthly",
                            "lookup_key": "kmfx_pro_monthly",
                            "product": "prod_pro",
                            "metadata": {},
                        }
                    }
                ]
            },
        }
        with patch.object(connector_api, "supabase_upsert_billing_customer") as customer_mock, patch.object(
            connector_api,
            "supabase_upsert_billing_subscription",
        ) as subscription_mock, patch.object(
            connector_api,
            "supabase_update_auth_app_metadata",
        ) as metadata_mock:
            result = connector_api.sync_billing_subscription(subscription)

        self.assertEqual("pro", result["plan"])
        customer_mock.assert_called_once()
        subscription_row = subscription_mock.call_args.args[0]
        self.assertEqual("pro", subscription_row["plan_key"])
        self.assertEqual("active", subscription_row["status"])
        metadata = metadata_mock.call_args.args[1]
        self.assertEqual("pro", metadata["kmfx_plan"])
        self.assertEqual("active", metadata["kmfx_billing_status"])
        self.assertEqual("sub_123", metadata["stripe_subscription_id"])

    def test_restricted_billing_blocks_connection_key_creation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                response = connector_api.connection_key_creation_denial(
                    user_id="user-123",
                    context={
                        "is_admin": False,
                        "app_metadata": {"plan": "pro", "billing_status": "unpaid"},
                        "user_metadata": {},
                    },
                )
            finally:
                connector_api.account_service = previous_service

        self.assertIsNotNone(response)
        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(402, response.status_code)
        self.assertEqual("billing_required", body["reason"])
        self.assertEqual("restricted", body["details"]["billing_access"])

    def test_past_due_billing_blocks_new_connection_keys(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                response = connector_api.connection_key_creation_denial(
                    user_id="user-123",
                    context={
                        "is_admin": False,
                        "app_metadata": {"plan": "core", "billing_status": "past_due"},
                        "user_metadata": {},
                    },
                )
            finally:
                connector_api.account_service = previous_service

        self.assertIsNotNone(response)
        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(402, response.status_code)
        self.assertEqual("billing_past_due", body["reason"])
        self.assertEqual("billing_attention", body["details"]["billing_access"])

    def test_user_plan_cannot_regenerate_stable_connection_key(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                account = connector_api.account_service.create_pending_account(
                    user_id="user-123",
                    alias="Cuenta MT5",
                    platform="mt5",
                    connection_mode="launcher",
                )
                request = self._request(headers={"authorization": "Bearer verified-token"})
                with patch.object(
                    connector_api,
                    "_resolve_verified_bearer_claims",
                    return_value={
                        "sub": "user-123",
                        "email": "user@example.com",
                        "app_metadata": {"plan": "pro", "billing_status": "active"},
                        "user_metadata": {},
                    },
                ):
                    response = asyncio.run(connector_api.regenerate_own_account_key(account.account_id, request))
            finally:
                connector_api.account_service = previous_service

        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(403, response.status_code)
        self.assertEqual("stable_key_recovery_required", body["reason"])

    def test_product_entitlement_helper_blocks_missing_export_entitlement(self) -> None:
        response = connector_api.product_entitlement_denial(
            context={
                "is_admin": False,
                "user_id": "user-123",
                "app_metadata": {"plan": "core", "billing_status": "active"},
                "user_metadata": {"plan": "desk"},
            },
            entitlement="exports",
        )

        self.assertIsNotNone(response)
        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(403, response.status_code)
        self.assertEqual("entitlement_required", body["reason"])
        self.assertEqual("exports", body["details"]["entitlement"])
        self.assertEqual("core", body["details"]["effective_plan"])

    def test_product_entitlement_helper_allows_admin_without_plan(self) -> None:
        response = connector_api.product_entitlement_denial(
            context={
                "is_admin": True,
                "user_id": "admin-user",
                "app_metadata": {"plan": "free"},
                "user_metadata": {},
            },
            entitlement="exports",
        )

        self.assertIsNone(response)

    def test_ai_evidence_export_endpoint_requires_export_entitlement(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                created = connector_api.account_service.ingest_account_snapshot(
                    user_id="user-123",
                    account_info={"login": "123456", "broker": "Broker", "server": "Broker-Live"},
                    connection_mode="ea_direct",
                    api_key="export-route-key",
                    payload={
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
                request = self._request(headers={"authorization": "Bearer export-token"})
                with patch.object(
                    connector_api,
                    "_resolve_verified_bearer_claims",
                    return_value={
                        "sub": "user-123",
                        "email": "user@example.com",
                        "app_metadata": {"plan": "core", "billing_status": "active"},
                        "user_metadata": {"plan": "desk"},
                    },
                ):
                    response = asyncio.run(
                        connector_api.account_ai_evidence_report(created.account_id, request, format="markdown")
                    )
            finally:
                connector_api.account_service = previous_service

        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(403, response.status_code)
        self.assertEqual("entitlement_required", body["reason"])
        self.assertEqual("exports", body["details"]["entitlement"])

    def test_ai_evidence_export_endpoint_can_be_disabled_by_feature_flag(self) -> None:
        request = self._request(headers={"authorization": "Bearer export-token"})
        with patch.dict(os.environ, {"KMFX_DISABLE_EXPORTS": "true"}, clear=False), patch.object(
            connector_api,
            "_resolve_verified_bearer_claims",
            return_value={
                "sub": "user-123",
                "email": "user@example.com",
                "app_metadata": {"plan": "pro", "billing_status": "active"},
                "user_metadata": {},
            },
        ):
            response = asyncio.run(connector_api.account_ai_evidence_report("acc-123", request, format="markdown"))

        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(503, response.status_code)
        self.assertEqual("feature_disabled", body["reason"])
        self.assertEqual("exports", body["feature"])

    def test_ai_evidence_export_endpoint_allows_pro_export_entitlement(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            try:
                created = connector_api.account_service.ingest_account_snapshot(
                    user_id="user-123",
                    account_info={"login": "123456", "broker": "Broker", "server": "Broker-Live"},
                    connection_mode="ea_direct",
                    api_key="export-route-key",
                    payload={
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
                request = self._request(headers={"authorization": "Bearer export-token"})
                with patch.object(
                    connector_api,
                    "_resolve_verified_bearer_claims",
                    return_value={
                        "sub": "user-123",
                        "email": "user@example.com",
                        "app_metadata": {"plan": "pro", "billing_status": "active"},
                        "user_metadata": {},
                    },
                ):
                    response = asyncio.run(
                        connector_api.account_ai_evidence_report(created.account_id, request, format="markdown")
                    )
            finally:
                connector_api.account_service = previous_service

        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(200, response.status_code)
        self.assertTrue(body["ok"])
        self.assertIn("markdown", body)

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

    def test_sensitive_rate_limit_is_per_identity_and_endpoint(self) -> None:
        connector_api.SENSITIVE_RATE_LIMIT_BUCKETS.clear()
        request = self._request(host="198.51.100.23")
        try:
            self.assertIsNone(
                connector_api.sensitive_rate_limit_response(
                    "/api/billing/checkout",
                    request,
                    user_id="user-rate-a",
                    limit=2,
                )
            )
            self.assertIsNone(
                connector_api.sensitive_rate_limit_response(
                    "/api/billing/checkout",
                    request,
                    user_id="user-rate-a",
                    limit=2,
                )
            )
            response = connector_api.sensitive_rate_limit_response(
                "/api/billing/checkout",
                request,
                user_id="user-rate-a",
                limit=2,
            )
            other_endpoint = connector_api.sensitive_rate_limit_response(
                "/api/billing/portal",
                request,
                user_id="user-rate-a",
                limit=2,
            )
            other_user = connector_api.sensitive_rate_limit_response(
                "/api/billing/checkout",
                request,
                user_id="user-rate-b",
                limit=2,
            )
        finally:
            connector_api.SENSITIVE_RATE_LIMIT_BUCKETS.clear()

        self.assertIsNotNone(response)
        self.assertEqual(429, response.status_code)
        body_text = response.body.decode("utf-8")
        body = json.loads(body_text)
        self.assertEqual("rate_limited", body["reason"])
        self.assertIn("Retry-After", response.headers)
        self.assertNotIn("user-rate-a", body_text)
        self.assertIsNone(other_endpoint)
        self.assertIsNone(other_user)

    def test_billing_checkout_rate_limit_blocks_second_stripe_session(self) -> None:
        connector_api.SENSITIVE_RATE_LIMIT_BUCKETS.clear()
        request = self._request(
            headers={"authorization": "Bearer billing-rate-token"},
            json_body={"plan": "pro", "interval": "monthly"},
        )
        user_id = "99999999-9999-4999-8999-999999999999"
        try:
            with patch.dict("os.environ", {"KMFX_RATE_LIMIT_BILLING_CHECKOUT_PER_MINUTE": "1"}, clear=False), patch.object(
                connector_api,
                "_resolve_verified_bearer_claims",
                return_value={
                    "sub": user_id,
                    "email": "billing-rate@example.com",
                    "app_metadata": {"plan": "free"},
                    "user_metadata": {},
                },
            ), patch.object(
                connector_api,
                "resolve_stripe_price_reference",
                return_value={"price_id": "price_pro_monthly", "lookup_key": "kmfx_pro_monthly"},
            ), patch.object(
                connector_api,
                "ensure_billing_customer",
                return_value="cus_rate",
            ), patch.object(
                connector_api,
                "stripe_api_request",
                return_value={"id": "cs_rate", "url": "https://checkout.stripe.test/rate"},
            ) as stripe_mock:
                first = asyncio.run(connector_api.billing_checkout(request))
                second = asyncio.run(connector_api.billing_checkout(request))
        finally:
            connector_api.SENSITIVE_RATE_LIMIT_BUCKETS.clear()

        self.assertEqual(200, first.status_code)
        self.assertEqual(429, second.status_code)
        self.assertEqual(1, stripe_mock.call_count)
        body = json.loads(second.body.decode("utf-8"))
        self.assertEqual("rate_limited", body["reason"])

    def test_link_account_rate_limit_blocks_extra_key_creation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_service = connector_api.account_service
            connector_api.account_service = AccountService(JsonFileAccountStore(os.path.join(temp_dir, "accounts.json")))
            connector_api.SENSITIVE_RATE_LIMIT_BUCKETS.clear()
            try:
                request = self._request(
                    host="127.0.0.1",
                    headers={"x-kmfx-user-id": "user-link-rate"},
                    json_body={
                        "label": "Cuenta MT5 EA",
                        "platform": "mt5",
                        "connection_mode": "ea_direct",
                    },
                )
                with patch.dict(
                    "os.environ",
                    {
                        "KMFX_DEFAULT_CONNECTION_PLAN": "core",
                        "KMFX_RATE_LIMIT_ACCOUNT_WRITE_PER_MINUTE": "1",
                    },
                    clear=False,
                ):
                    first = asyncio.run(connector_api.link_account(request))
                    second = asyncio.run(connector_api.link_account(request))
                account_count = len(connector_api.account_service.list_accounts("user-link-rate"))
            finally:
                connector_api.SENSITIVE_RATE_LIMIT_BUCKETS.clear()
                connector_api.account_service = previous_service

        self.assertEqual(200, first.status_code)
        self.assertEqual(429, second.status_code)
        self.assertEqual(1, account_count)
        self.assertEqual("rate_limited", json.loads(second.body.decode("utf-8"))["reason"])

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
                with patch.object(connector_api, "emit_audit_event") as audit_mock:
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
        audit_mock.assert_called_once()
        self.assertEqual("mt5_sync_rejected", audit_mock.call_args.args[0])
        self.assertEqual("rejected", audit_mock.call_args.kwargs["status"])
        self.assertEqual(created.account_id, audit_mock.call_args.kwargs["account_id"])
        self.assertEqual("revoked_connection_key", audit_mock.call_args.kwargs["details"]["reason"])

    def test_missing_connection_key_response_emits_audit_event(self) -> None:
        with patch.object(connector_api, "emit_audit_event") as audit_mock:
            response = connector_api.mt5_missing_connection_key_response(
                "/api/mt5/sync",
                sync_id="sync-missing-key",
            )

        body = json.loads(response.body.decode("utf-8"))
        self.assertEqual(401, response.status_code)
        self.assertEqual("missing_connection_key", body["reason"])
        audit_mock.assert_called_once()
        self.assertEqual("mt5_sync_rejected", audit_mock.call_args.args[0])
        self.assertEqual("rejected", audit_mock.call_args.kwargs["status"])
        self.assertEqual("missing_connection_key", audit_mock.call_args.kwargs["details"]["reason"])

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
