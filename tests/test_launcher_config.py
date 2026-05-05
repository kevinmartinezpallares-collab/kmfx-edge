import os
import unittest
from unittest.mock import patch

from launcher.config import LauncherConfig, launcher_debug_enabled


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


if __name__ == "__main__":
    unittest.main()
