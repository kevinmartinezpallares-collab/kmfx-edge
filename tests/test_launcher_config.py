import os
import sys
import unittest
from unittest.mock import patch

from launcher.config import (
    LOCAL_BACKEND_BASE_URL,
    PRODUCTION_BACKEND_BASE_URL,
    LauncherConfig,
    launcher_debug_enabled,
    resolve_backend_base_url,
)


class LauncherConfigTests(unittest.TestCase):
    def test_debug_is_disabled_by_default_even_for_legacy_config(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(launcher_debug_enabled(False))
            self.assertFalse(launcher_debug_enabled(True))
            config = LauncherConfig(debug=True).ensure_runtime_values()
            self.assertFalse(config.debug)

    def test_debug_requires_explicit_environment_opt_in(self):
        with patch.dict(os.environ, {"KMFX_LAUNCHER_DEBUG": "1"}, clear=True):
            self.assertTrue(launcher_debug_enabled(False))
            config = LauncherConfig(debug=False).ensure_runtime_values()
            self.assertTrue(config.debug)

    def test_source_runtime_defaults_to_local_backend(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(LOCAL_BACKEND_BASE_URL, resolve_backend_base_url(""))

    def test_production_runtime_defaults_to_render_backend(self):
        with patch.dict(os.environ, {"KMFX_ENV": "production"}, clear=True):
            self.assertEqual(PRODUCTION_BACKEND_BASE_URL, resolve_backend_base_url(""))

    def test_production_runtime_migrates_legacy_local_backend(self):
        with patch.dict(os.environ, {"KMFX_ENV": "production"}, clear=True):
            self.assertEqual(PRODUCTION_BACKEND_BASE_URL, resolve_backend_base_url(LOCAL_BACKEND_BASE_URL))

    def test_packaged_runtime_defaults_to_render_backend(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(sys, "frozen", True, create=True):
            self.assertEqual(PRODUCTION_BACKEND_BASE_URL, resolve_backend_base_url(""))

    def test_explicit_backend_preserved(self):
        with patch.dict(os.environ, {"KMFX_ENV": "production"}, clear=True):
            self.assertEqual("https://api.example.com", resolve_backend_base_url("https://api.example.com/"))

    def test_backend_environment_override_wins(self):
        with patch.dict(os.environ, {"KMFX_BACKEND_BASE_URL": "https://override.example.com/"}, clear=True):
            self.assertEqual("https://override.example.com", resolve_backend_base_url(LOCAL_BACKEND_BASE_URL))


if __name__ == "__main__":
    unittest.main()
