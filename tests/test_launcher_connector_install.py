from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from launcher.config import LauncherConfig

from launcher.connector_installer import ConnectorInstallError, install_connector
from launcher.mt5_detector import MT5Installation


ROOT = Path(__file__).resolve().parents[1]


class LauncherConnectorInstallTests(unittest.TestCase):
    def test_installer_writes_connector_without_persisting_connection_key(self) -> None:
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
            advisors_path = experts_path / "Advisors"
            files_path = data_path / "MQL5" / "Files"
            preset_path = data_path / "Profiles" / "Presets" / "KMFXConnector_Launcher.set"
            connection_config_path = files_path / "kmfx_connection.conf"
            safety_notice_path = files_path / "KMFX_READ_ONLY_NOTICE.txt"

            self.assertTrue((advisors_path / "KMFXConnector.ex5").is_file())
            self.assertTrue((advisors_path / "KMFXConnector.mq5").is_file())
            self.assertEqual(str(connection_config_path), result["connection_config_path"])
            self.assertEqual(str(safety_notice_path), result["safety_notice_path"])
            self.assertIn("KMFXConnector.ex5", result["copied_files"])

            connection_config = connection_config_path.read_text(encoding="utf-8")
            self.assertIn("backend_url=https://mt5-api.kmfxedge.com", connection_config)
            self.assertIn("launcher_url=http://127.0.0.1:8766", connection_config)
            self.assertNotIn("connection_key=", connection_config)

            preset = preset_path.read_text(encoding="utf-8")
            self.assertIn("KMFXKey=||0||0||0||N", preset)
            self.assertIn("KMFXApiKey=||0||0||0||N", preset)
            self.assertIn("connection_key=||0||0||0||N", preset)
            self.assertIn("KMFXBackendBaseUrl=https://mt5-api.kmfxedge.com||0||0||0||N", preset)
            self.assertIn("KMFXWebTimeoutMs=5000||0||0||0||N", preset)
            self.assertIn("KMFXClosedDealsLimit=100||0||0||0||N", preset)
            self.assertIn("KMFXHistoryPointsLimit=120||0||0||0||N", preset)
            self.assertIn("KMFXHistoryLookbackDays=365||0||0||0||N", preset)
            self.assertIn("KMFXVerboseLog=false||0||0||0||N", preset)
            self.assertIn("KMFXEnableEnforce=false||0||0||0||N", preset)

            notice = safety_notice_path.read_text(encoding="utf-8")
            self.assertIn("read-only data sync", notice)
            self.assertIn("does not open, modify, block, copy, or close trades", notice)
            self.assertIn("KMFXEnableEnforce=false", notice)
            self.assertIn("Connection key installed: none", notice)
            self.assertIn("Paste the KMFXKey manually in the EA inputs", notice)

    def test_installer_requires_compiled_ex5_binary(self) -> None:
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
            config = LauncherConfig(connection_key="kmfx_test_key")

            with patch("launcher.connector_installer.connector_sources", return_value=[ROOT / "KMFXConnector.mq5"]):
                with self.assertRaises(ConnectorInstallError):
                    install_connector(installation, config)

    def test_installer_prefers_existing_lowercase_wine_presets_folder(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_path = Path(temp_dir) / "Terminal"
            lowercase_presets = data_path / "profiles" / "Presets"
            lowercase_presets.mkdir(parents=True)
            installation = MT5Installation(
                label="Test MT5",
                terminal_path="",
                data_path=str(data_path),
                experts_path=str(data_path / "MQL5" / "Experts"),
                presets_path=str(data_path / "Profiles" / "Presets"),
                platform_name="test",
            )
            config = LauncherConfig(connection_key="kmfx_test_key")

            result = install_connector(installation, config)

            self.assertEqual(str(lowercase_presets / "KMFXConnector_Launcher.set"), result["preset_path"])
            self.assertTrue((lowercase_presets / "KMFXConnector_Launcher.set").is_file())

    def test_ea_reads_launcher_runtime_file_but_ignores_launcher_keys(self) -> None:
        source = (ROOT / "KMFXConnector.mq5").read_text(encoding="utf-8")

        self.assertIn('#define KMFX_CONNECTION_CONFIG_FILE "kmfx_connection.conf"', source)
        self.assertIn("FileOpen(KMFX_CONNECTION_CONFIG_FILE,FILE_READ|FILE_TXT|FILE_ANSI)", source)
        self.assertIn('KMFXLoadConnectionConfigValue("connection_key")', source)
        self.assertIn('PrintFormat("[KMFX][INIT][KEY_SOURCE] source=file_ignored key=%s"', source)
        self.assertIn('PrintFormat("[KMFX][RUNTIME][KEY_IGNORED] source=file key=%s"', source)
        self.assertIn("KMFXRefreshRuntimeConnectionConfig()", source)

    def test_ea_exposes_explicit_read_only_notice_for_prop_accounts(self) -> None:
        source = (ROOT / "KMFXConnector.mq5").read_text(encoding="utf-8")

        self.assertIn("KMFX Edge | SOLO LECTURA", source)
        self.assertIn("No permite que KMFX gestione esta cuenta desde el EA.", source)
        self.assertIn("KMFXRenderChartSafetyNotice()", source)
        self.assertIn('Comment(KMFXReadOnlyChartNotice())', source)

    def test_ea_refreshes_runtime_config_without_importing_launcher_key_after_backend_reject(self) -> None:
        source = (ROOT / "KMFXConnector.mq5").read_text(encoding="utf-8")

        self.assertIn("bool KMFXBackendRejectSuggestsKeyReload", source)
        self.assertIn("bool KMFXForceReloadConnectionConfig", source)
        self.assertIn("revoked_connection_key", source)
        self.assertIn("unknown_connection_key", source)
        self.assertIn("missing_connection_key", source)
        self.assertIn('KMFXForceReloadConnectionConfig("sync:"+backend_reason)', source)
        self.assertIn('KMFXForceReloadConnectionConfig("journal:"+backend_reason)', source)
        self.assertIn('KMFXForceReloadConnectionConfig("policy:"+backend_reason)', source)
        self.assertIn("(now-g_last_connection_config_file_check_at)<5", source)
        self.assertIn('PrintFormat("[KMFX][RUNTIME][CONFIG_REFRESH] context=%s key_source=input_only"', source)

    def test_ea_marks_one_time_history_bootstrap_and_then_returns_to_light_sync(self) -> None:
        source = (ROOT / "KMFXConnector.mq5").read_text(encoding="utf-8")

        self.assertIn('bool full_history_sync=!KMFXHasCompletedHistoryBootstrap();', source)
        self.assertIn('datetime sync_from_time=0;', source)
        self.assertIn('if(!full_history_sync)', source)
        self.assertIn('sync_from_time=KMFXHistoryFromTime();', source)
        self.assertIn('json+="\\"historyBootstrapFull\\":"+KMFXBoolJson(full_history_sync)+",";', source)
        self.assertIn('KMFXMarkHistoryBootstrapComplete();', source)
        self.assertIn('string KMFXHistoryBootstrapFileName()', source)
        self.assertIn('KMFXConnectionKeyValue()', source)

    def test_launcher_health_is_local_and_backend_health_is_cached(self) -> None:
        source = (ROOT / "launcher" / "service.py").read_text(encoding="utf-8")

        self.assertIn("KMFX_BACKEND_HEALTH_TTL_SECONDS = 60.0", source)
        self.assertIn("def backend_health_status", source)
        self.assertIn("return json_response(", source)
        self.assertIn('"service_running": True', source)
        self.assertIn("backend_health = self.backend_health_status()", source)


if __name__ == "__main__":
    unittest.main()
