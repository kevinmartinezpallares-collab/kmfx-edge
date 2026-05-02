import unittest
from types import SimpleNamespace
from unittest.mock import patch

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


if __name__ == "__main__":
    unittest.main()
