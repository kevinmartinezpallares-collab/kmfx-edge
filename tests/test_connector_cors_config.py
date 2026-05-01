import unittest

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


if __name__ == "__main__":
    unittest.main()
