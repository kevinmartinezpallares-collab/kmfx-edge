from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from launcher.config import LauncherConfig
from launcher.connector_installer import install_connector
from launcher.mt5_detector import MT5Installation


ROOT = Path(__file__).resolve().parents[1]


class LauncherConnectorInstallTests(unittest.TestCase):
    def test_installer_writes_connector_and_runtime_key_config(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_path = Path(temp_dir) / "Terminal"
            installation = MT5Installation(
                label="Test MT5",
                terminal_path="",
                data_path=str(data_path),
                experts_path=str(data_path / "MQL5" / "Experts"),
                presets_path=str(data_path / "Profiles" / "Presets"),
                platform_name="test",
            )
            config = LauncherConfig(connection_key="kmfx_test_key", local_host="127.0.0.1", local_port=8766)

            result = install_connector(installation, config)

            experts_path = data_path / "MQL5" / "Experts"
            files_path = data_path / "MQL5" / "Files"
            preset_path = data_path / "Profiles" / "Presets" / "KMFXConnector_Launcher.set"
            connection_config_path = files_path / "kmfx_connection.conf"

            self.assertTrue((experts_path / "KMFXConnector.ex5").is_file())
            self.assertTrue((experts_path / "KMFXConnector.mq5").is_file())
            self.assertEqual(str(connection_config_path), result["connection_config_path"])
            self.assertIn("KMFXConnector.ex5", result["copied_files"])

            connection_config = connection_config_path.read_text(encoding="utf-8")
            self.assertIn("connection_key=kmfx_test_key", connection_config)
            self.assertIn("backend_url=https://mt5-api.kmfxedge.com", connection_config)
            self.assertIn("launcher_url=http://127.0.0.1:8766", connection_config)

            preset = preset_path.read_text(encoding="utf-8")
            self.assertIn("KMFXKey=kmfx_test_key||0||0||0||N", preset)
            self.assertIn("KMFXBackendBaseUrl=https://mt5-api.kmfxedge.com||0||0||0||N", preset)
            self.assertIn("KMFXVerboseLog=false||0||0||0||N", preset)
            self.assertIn("KMFXEnableEnforce=false||0||0||0||N", preset)

    def test_ea_reads_launcher_connection_file_at_runtime(self) -> None:
        source = (ROOT / "KMFXConnector.mq5").read_text(encoding="utf-8")

        self.assertIn('#define KMFX_CONNECTION_CONFIG_FILE "kmfx_connection.conf"', source)
        self.assertIn("FileOpen(KMFX_CONNECTION_CONFIG_FILE,FILE_READ|FILE_TXT|FILE_ANSI)", source)
        self.assertIn('KMFXLoadConnectionConfigValue("connection_key")', source)
        self.assertIn("g_runtime_connection_key=KMFXLoadConnectionKeyFromFile()", source)
        self.assertIn("KMFXRefreshRuntimeConnectionConfig()", source)


if __name__ == "__main__":
    unittest.main()
