import unittest
from unittest.mock import patch

import kmfx_connector_api as connector_api


class ConnectorCorsConfigTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
