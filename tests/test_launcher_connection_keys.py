from __future__ import annotations

import os
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from launcher.backend_client import BackendClient, BackendResponse
from launcher.connection_keys import clean_connection_key, payload_connection_key, resolve_effective_connection_key
from launcher.config import LauncherConfig, mask_connection_key, save_config
from launcher.app import KMFXApi, _friendly_mt5_identity_label, _generic_mt5_label
from launcher.mt5_detector import MT5Installation, _should_descend
from launcher.state_store import LauncherStateStore


class RecordingBackendClient(BackendClient):
    def __init__(self) -> None:
        super().__init__(LauncherConfig())
        self.calls: list[dict[str, object]] = []

    def _request(self, method, path, payload=None, query=None, connection_key=None):  # type: ignore[override]
        self.calls.append(
            {
                "method": method,
                "path": path,
                "payload": payload,
                "query": query,
                "connection_key": connection_key,
            }
        )
        return BackendResponse(ok=True, status_code=200, body={})


class ExpiredThenFreshBackend:
    def __init__(self, config: LauncherConfig) -> None:
        self.config = config
        self.link_calls = 0
        self.refresh_calls = 0

    def link_account(
        self,
        *,
        user_id: str = "",
        label: str = "",
        account_id: str = "",
        connection_key: str | None = None,
    ) -> BackendResponse:
        self.link_calls += 1
        if self.link_calls == 1:
            return BackendResponse(ok=False, status_code=401, body={"reason": "auth_required"})
        return BackendResponse(ok=True, status_code=200, body={"connection_key": connection_key or "new-key"})

    def refresh_auth_session(self, *, refresh_token: str) -> BackendResponse:
        self.refresh_calls += 1
        return BackendResponse(
            ok=True,
            status_code=200,
            body={
                "access_token": "fresh-access-token",
                "refresh_token": refresh_token,
                "expires_in": 3600,
                "user": {"id": "user-1", "email": "kevin@example.test", "user_metadata": {"name": "Kevin"}},
            },
        )


class RejectedRefreshBackend:
    def __init__(self, config: LauncherConfig) -> None:
        self.config = config
        self.refresh_calls = 0

    def refresh_auth_session(self, *, refresh_token: str) -> BackendResponse:
        self.refresh_calls += 1
        return BackendResponse(ok=False, status_code=401, body={"reason": "invalid_refresh_token"})


class RegistryBackend:
    def __init__(self, config: LauncherConfig, accounts: list[dict[str, object]]) -> None:
        self.config = config
        self.accounts = accounts

    def get_accounts_registry(self) -> BackendResponse:
        return BackendResponse(ok=True, status_code=200, body={"accounts": self.accounts})


class RegistryBackendWithLinkTrap(RegistryBackend):
    def __init__(self, config: LauncherConfig, accounts: list[dict[str, object]]) -> None:
        super().__init__(config, accounts)
        self.link_calls = 0

    def link_account(
        self,
        *,
        user_id: str = "",
        label: str = "",
        account_id: str = "",
        connection_key: str | None = None,
    ) -> BackendResponse:
        self.link_calls += 1
        return BackendResponse(ok=False, status_code=500, body={"reason": "unexpected_link"})


class RevokedThenFreshBackend:
    def __init__(self, config: LauncherConfig) -> None:
        self.config = config
        self.connection_keys: list[str] = []

    def link_account(
        self,
        *,
        user_id: str = "",
        label: str = "",
        account_id: str = "",
        connection_key: str | None = None,
    ) -> BackendResponse:
        key = str(connection_key or "")
        self.connection_keys.append(key)
        if key:
            return BackendResponse(ok=False, status_code=409, body={"reason": "connection_key_not_available"})
        return BackendResponse(
            ok=True,
            status_code=200,
            body={
                "account_id": "fresh-account",
                "connection_key": "fresh-key",
                "status": "pending_link",
                "alias": label,
            },
        )


class SameKeyThenRotatedBackend:
    def __init__(self, config: LauncherConfig) -> None:
        self.config = config
        self.link_calls = 0
        self.regenerate_calls = 0

    def link_account(
        self,
        *,
        user_id: str = "",
        label: str = "",
        account_id: str = "",
        connection_key: str | None = None,
    ) -> BackendResponse:
        self.link_calls += 1
        return BackendResponse(
            ok=True,
            status_code=200,
            body={
                "account_id": account_id or "darwinex-account",
                "connection_key": "stale-key",
                "status": "active",
                "alias": label,
            },
        )

    def regenerate_account_key(self, *, account_id: str) -> BackendResponse:
        self.regenerate_calls += 1
        return BackendResponse(
            ok=True,
            status_code=200,
            body={
                "account_id": account_id,
                "connection_key": "fresh-key",
                "status": "pending_link",
            },
        )


class RegistryThenRegeneratedBackend:
    def __init__(self, config: LauncherConfig, accounts: list[dict[str, object]]) -> None:
        self.config = config
        self.accounts = accounts
        self.link_calls = 0
        self.regenerate_calls = 0

    def get_accounts_registry(self) -> BackendResponse:
        return BackendResponse(ok=True, status_code=200, body={"accounts": self.accounts})

    def link_account(
        self,
        *,
        user_id: str = "",
        label: str = "",
        account_id: str = "",
        connection_key: str | None = None,
    ) -> BackendResponse:
        self.link_calls += 1
        return BackendResponse(ok=False, status_code=409, body={"reason": "connection_revoked"})

    def regenerate_account_key(self, *, account_id: str) -> BackendResponse:
        self.regenerate_calls += 1
        return BackendResponse(
            ok=True,
            status_code=200,
            body={
                "account_id": account_id,
                "connection_key": "fresh-darwinex-key",
                "status": "pending_link",
                "alias": "Darwinex MT5",
            },
        )

    def get_account_key(self, *, account_id: str) -> BackendResponse:
        account = next(
            (
                item
                for item in self.accounts
                if str(item.get("account_id") or "").strip() == str(account_id or "").strip()
            ),
            None,
        )
        if not account:
            return BackendResponse(ok=False, status_code=404, body={"reason": "account_not_found"})
        connection_key = str(account.get("connection_key") or "darwinex-stable-key").strip()
        return BackendResponse(
            ok=True,
            status_code=200,
            body={
                "ok": True,
                "account_id": account_id,
                "connection_key": connection_key,
                "connection_key_preview": mask_connection_key(connection_key),
            },
        )


class LauncherConnectionKeyTests(unittest.TestCase):
    def test_explicit_connection_key_wins_over_bridge_key(self) -> None:
        key, source = resolve_effective_connection_key(
            explicit_key=" explicit-key ",
            bridge_key="bridge-key",
        )

        self.assertEqual("explicit-key", key)
        self.assertEqual("explicit", source)

    def test_bridge_key_is_fallback_when_payload_has_no_key(self) -> None:
        key, source = resolve_effective_connection_key(
            explicit_key="",
            bridge_key=" bridge-key ",
        )

        self.assertEqual("bridge-key", key)
        self.assertEqual("bridge", source)

    def test_empty_keys_return_empty_resolution(self) -> None:
        self.assertEqual(("", ""), resolve_effective_connection_key())

    def test_clean_connection_key_normalizes_missing_values(self) -> None:
        self.assertEqual("", clean_connection_key(None))
        self.assertEqual("abc", clean_connection_key(" abc "))

    def test_payload_connection_key_reads_modern_or_legacy_fields(self) -> None:
        self.assertEqual("modern", payload_connection_key({"connection_key": " modern "}))
        self.assertEqual("legacy", payload_connection_key({"KMFXApiKey": " legacy "}))
        self.assertEqual("", payload_connection_key({"connection_key": ""}))
        self.assertEqual("", payload_connection_key(None))

    def test_policy_request_sends_key_as_header_argument_not_query(self) -> None:
        client = RecordingBackendClient()
        client.get_policy(login="123456", connection_key="abcdef1234567890")

        self.assertEqual(
            {
                "method": "GET",
                "path": "/api/mt5/policy",
                "payload": None,
                "query": {"login": "123456"},
                "connection_key": "abcdef1234567890",
            },
            client.calls[0],
        )

    def test_snapshot_request_strips_connection_key_from_body(self) -> None:
        client = RecordingBackendClient()
        client.post_snapshot({"connection_key": "abcdef1234567890", "login": "123456"})

        self.assertEqual({"login": "123456"}, client.calls[0]["payload"])
        self.assertEqual("abcdef1234567890", client.calls[0]["connection_key"])

    def test_safe_url_masks_legacy_connection_key_query(self) -> None:
        client = BackendClient(LauncherConfig())
        safe_url = client._safe_url("https://api.example.test/api/mt5/policy?login=123&connection_key=abcdef1234567890")
        self.assertNotIn("abcdef1234567890", safe_url)
        self.assertIn("connection_key=abcdef...7890", safe_url)

    def test_launcher_state_store_keeps_local_account_connection_keys_by_account(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                store = LauncherStateStore()
                store.save_account_connection(
                    {
                        "account_id": "account-1",
                        "label": "Orion MT5",
                        "connection_key": "first-local-key",
                    }
                )
                store.save_account_connection(
                    {
                        "account_id": "account-1",
                        "label": "Orion MT5",
                        "connection_key": "rotated-local-key",
                    }
                )

                connections = store.list_account_connections()

        self.assertEqual(1, len(connections))
        self.assertEqual("account-1", connections[0]["account_id"])
        self.assertEqual("", connections[0]["connection_key"])

    def test_launcher_state_store_can_prune_remote_deleted_connections(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                store = LauncherStateStore()
                store.save_account_connection({"account_id": "keep", "connection_key": "keep-key"})
                store.save_account_connection({"account_id": "deleted", "connection_key": "deleted-key"})

                store.retain_account_connections({"keep"})
                connections = store.list_account_connections()

        self.assertEqual(["keep"], [item["account_id"] for item in connections])

    def test_launcher_connection_labels_prefer_broker_identity_over_technical_names(self) -> None:
        self.assertTrue(_generic_mt5_label("net.metaquotes.wine.metatrader5 MetaTrader 5"))
        self.assertEqual(
            "Darwinex MT5",
            _friendly_mt5_identity_label(
                broker="Tradeslide Trading Tech Limited",
                server="Darwinex-Live",
                login="4000082126",
            ),
        )
        self.assertEqual(
            "Orion OGM MT5",
            _friendly_mt5_identity_label(
                broker="OGM International Ltd.",
                server="OGMInternational-Server",
                login="80571774",
            ),
        )

    def test_launcher_installation_label_uses_recent_mt5_logs_for_generic_prefixes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_path = Path(temp_dir) / "net.metaquotes.wine.metatrader5" / "drive_c" / "Program Files" / "MetaTrader 5"
            logs_dir = data_path / "logs"
            logs_dir.mkdir(parents=True)
            log_text = (
                "'4000082126': authorized on Darwinex-Live through Access Server EU\n"
                "'4000082126': terminal synchronized with Tradeslide Trading Tech Limited: 0 positions\n"
            )
            (logs_dir / "20260509.log").write_bytes(log_text.encode("utf-16le"))

            api = object.__new__(KMFXApi)
            installation = MT5Installation(
                "mac · net.metaquotes.wine.metatrader5 · MetaTrader 5",
                "",
                str(data_path),
                str(data_path / "MQL5" / "Experts"),
                "",
                "mac",
            )

            label = api.installation_display_label(installation, {})

        self.assertEqual("Darwinex MT5 · 4000082126", label)

    def test_launcher_installation_label_keeps_renamed_prefixes_readable(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_path = Path(temp_dir) / "KMFX_MT5_IcMarkets" / "drive_c" / "Program Files" / "MetaTrader 5"

            api = object.__new__(KMFXApi)
            installation = MT5Installation(
                "mac · KMFX_MT5_IcMarkets · MetaTrader 5",
                "",
                str(data_path),
                str(data_path / "MQL5" / "Experts"),
                "",
                "mac",
            )

            label = api.installation_display_label(installation, {})

        self.assertEqual("IC Markets MT5", label)

    def test_launcher_installation_label_recognizes_ftmo_prefix(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_path = Path(temp_dir) / "KMFX_MT5_FTMO" / "drive_c" / "Program Files" / "MetaTrader 5"

            api = object.__new__(KMFXApi)
            installation = MT5Installation(
                "mac · KMFX_MT5_FTMO · MetaTrader 5",
                "",
                str(data_path),
                str(data_path / "MQL5" / "Experts"),
                "",
                "mac",
            )

            label = api.installation_display_label(installation, {})

        self.assertEqual("FTMO MT5", label)

    def test_launcher_create_mt5_instance_is_mac_only(self) -> None:
        api = object.__new__(KMFXApi)
        api._lock = threading.RLock()
        api.get_session = lambda: {"authenticated": True}

        with patch("launcher.app.is_supported_mt5_instance_creation_platform", return_value=False):
            result = api.create_mt5_instance("FTMO100k")

        self.assertFalse(result["ok"])
        self.assertIn("En Windows instala MT5 manualmente", result["message"])

    def test_launcher_create_mt5_instance_selects_created_installation(self) -> None:
        config = LauncherConfig(
            auth_access_token="access-token",
            auth_user_id="user-1",
            auth_email="kevin@example.test",
            backend_token="access-token",
        )
        api = object.__new__(KMFXApi)
        api.config = config
        api._lock = threading.RLock()
        api.logger = __import__("logging").getLogger("kmfx_launcher_test")
        api.get_session = lambda: {"authenticated": True}
        api.refresh_installations = lambda: []
        api.get_installations = lambda: [{"label": "MT5-FTMO100k"}]
        api.get_status = lambda: {"connector_installed": True}

        created = {
            "name": "MT5-FTMO100k",
            "terminal_path": "/tmp/MT5-FTMO100k/terminal64.exe",
            "data_path": "/tmp/MT5-FTMO100k",
            "experts_path": "/tmp/MT5-FTMO100k/MQL5/Experts",
        }

        with (
            patch("launcher.app.is_supported_mt5_instance_creation_platform", return_value=True),
            patch("launcher.app.create_mac_mt5_instance", return_value=created) as create_instance,
            patch("launcher.app.save_config") as save_config_mock,
        ):
            result = api.create_mt5_instance("FTMO100k")

        self.assertTrue(result["ok"])
        create_instance.assert_called_once()
        self.assertEqual("MT5-FTMO100k", create_instance.call_args.args[0])
        self.assertEqual("/tmp/MT5-FTMO100k/terminal64.exe", api.config.selected_mt5_terminal_path)
        self.assertEqual("/tmp/MT5-FTMO100k", api.config.selected_mt5_data_path)
        self.assertEqual("/tmp/MT5-FTMO100k/MQL5/Experts", api.config.selected_mt5_experts_path)
        self.assertEqual(created, result["instance"])
        save_config_mock.assert_called_once_with(config)

    def test_launcher_detector_skips_old_backup_and_tradelio_folders(self) -> None:
        self.assertFalse(_should_descend(Path("/tmp/tradelio-launcher")))
        self.assertFalse(_should_descend(Path("/tmp/KMFX_MT5_Funded_BROKEN_BACKUP")))
        self.assertTrue(_should_descend(Path("/tmp/KMFX_MT5_Darwinex")))

    def test_launcher_get_account_connections_does_not_resurrect_deleted_cached_accounts(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                config = LauncherConfig(
                    auth_access_token="access-token",
                    auth_user_id="user-1",
                    auth_email="kevin@example.test",
                    backend_token="access-token",
                )
                save_config(config)
                store = LauncherStateStore()
                store.save_account_connection(
                    {"account_id": "active-account", "label": "Orion OGM MT5", "connection_key": "active-key"}
                )
                store.save_account_connection(
                    {"account_id": "deleted-account", "label": "Cuenta MT5", "connection_key": "deleted-key"}
                )

                api = object.__new__(KMFXApi)
                api.config = config
                api.backend = RegistryBackend(
                    config,
                    [
                        {
                            "account_id": "active-account",
                            "alias": "net.metaquotes.wine.metatrader5 MetaTrader 5",
                            "broker": "Tradeslide Trading Tech Limited",
                            "server": "Darwinex-Live",
                            "login": "4000082126",
                            "status": "active",
                        }
                    ],
                )
                api.store = store
                api.installations = []
                api._lock = threading.RLock()
                api._last_account_connections = []
                api._last_installed_link_sync_at = time.time()
                api.config.connection_key = ""

                connections = api.get_account_connections()
                cached_after_sync = store.list_account_connections()

        self.assertEqual(1, len(connections))
        self.assertEqual("active-account", connections[0]["account_id"])
        self.assertEqual("Darwinex MT5", connections[0]["label"])
        self.assertEqual(["active-account"], [item["account_id"] for item in cached_after_sync])

    def test_launcher_does_not_hydrate_stale_cached_key_over_server_preview(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                config = LauncherConfig(
                    auth_access_token="access-token",
                    auth_user_id="user-1",
                    auth_email="kevin@example.test",
                    backend_token="access-token",
                )
                save_config(config)
                store = LauncherStateStore()
                store.save_account_connection(
                    {"account_id": "darwinex-account", "label": "Darwinex MT5", "connection_key": "stale-local-key"}
                )
                server_key = "server-canonical-key"

                api = object.__new__(KMFXApi)
                api.config = config
                api.backend = RegistryBackend(
                    config,
                    [
                        {
                            "account_id": "darwinex-account",
                            "alias": "Darwinex MT5",
                            "broker": "Tradeslide Trading Tech Limited",
                            "server": "Darwinex-Live",
                            "login": "4000082126",
                            "status": "active",
                            "connection_key_preview": mask_connection_key(server_key),
                            "has_connection_key": True,
                        }
                    ],
                )
                api.store = store
                api.installations = []
                api._lock = threading.RLock()
                api._last_account_connections = []
                api._last_installed_link_sync_at = time.time()
                api.config.connection_key = ""
                api.get_session = lambda: {"authenticated": True}
                api.ensure_installed_account_links = lambda force=False: None

                connections = api.get_account_connections()

        self.assertEqual(1, len(connections))
        account = connections[0]
        self.assertEqual("", account["connection_key"])
        self.assertEqual(mask_connection_key(server_key), account["connection_key_masked"])
        self.assertEqual(mask_connection_key(server_key), account["server_connection_key_masked"])
        self.assertEqual("", account["local_connection_key_masked"])
        self.assertFalse(account["connection_key_mismatch"])
        self.assertFalse(account["can_copy_connection_key"])

    def test_launcher_hydrates_cached_key_only_when_it_matches_server_preview(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                config = LauncherConfig(
                    auth_access_token="access-token",
                    auth_user_id="user-1",
                    auth_email="kevin@example.test",
                    backend_token="access-token",
                )
                save_config(config)
                store = LauncherStateStore()
                server_key = "server-canonical-key"
                store.save_account_connection(
                    {"account_id": "darwinex-account", "label": "Darwinex MT5", "connection_key": server_key}
                )

                api = object.__new__(KMFXApi)
                api.config = config
                api.backend = RegistryBackend(
                    config,
                    [
                        {
                            "account_id": "darwinex-account",
                            "alias": "Darwinex MT5",
                            "broker": "Tradeslide Trading Tech Limited",
                            "server": "Darwinex-Live",
                            "login": "4000082126",
                            "status": "active",
                            "connection_key_preview": mask_connection_key(server_key),
                            "has_connection_key": True,
                        }
                    ],
                )
                api.store = store
                api.installations = []
                api._lock = threading.RLock()
                api._last_account_connections = []
                api._last_installed_link_sync_at = time.time()
                api.config.connection_key = ""
                api.get_session = lambda: {"authenticated": True}
                api.ensure_installed_account_links = lambda force=False: None

                connections = api.get_account_connections()

        self.assertEqual(1, len(connections))
        account = connections[0]
        self.assertEqual("", account["connection_key"])
        self.assertEqual(mask_connection_key(server_key), account["connection_key_masked"])
        self.assertFalse(account["connection_key_mismatch"])
        self.assertFalse(account["can_copy_connection_key"])

    def test_launcher_does_not_auto_link_unknown_installed_local_keys(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                root = Path(temp_dir) / "Darwinex"
                experts_path = root / "MQL5" / "Experts"
                files_path = root / "MQL5" / "Files"
                files_path.mkdir(parents=True)
                experts_path.mkdir(parents=True)
                (files_path / "kmfx_connection.conf").write_text(
                    "connection_key=stale-local-key\n",
                    encoding="utf-8",
                )

                config = LauncherConfig(
                    auth_access_token="access-token",
                    auth_user_id="user-1",
                    auth_email="kevin@example.test",
                    backend_token="access-token",
                )
                save_config(config)

                backend = RegistryBackendWithLinkTrap(config, [])
                api = object.__new__(KMFXApi)
                api.config = config
                api.backend = backend
                api.store = LauncherStateStore()
                api.logger = __import__("logging").getLogger("kmfx_launcher_test")
                api.installations = [
                    MT5Installation("Darwinex", "", str(root), str(experts_path), "", "test")
                ]
                api._last_installed_link_sync_at = 0

                api.ensure_installed_account_links(force=True)
                cached = api.store.list_account_connections()

        self.assertEqual(0, backend.link_calls)
        self.assertEqual([], cached)

    def test_launcher_install_connector_replaces_stale_local_key_with_dashboard_key_by_identity(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                root = Path(temp_dir) / "Darwinex"
                experts_path = root / "MQL5" / "Experts"
                files_path = root / "MQL5" / "Files"
                logs_path = root / "logs"
                files_path.mkdir(parents=True)
                experts_path.mkdir(parents=True)
                logs_path.mkdir(parents=True)
                (files_path / "kmfx_connection.conf").write_text(
                    "connection_key=old-local-key\n",
                    encoding="utf-8",
                )
                (logs_path / "20260511.log").write_bytes(
                    (
                        "'4000082126': authorized on Darwinex-Live through Access Server EU\n"
                        "'4000082126': terminal synchronized with Tradeslide Trading Tech Limited: 0 positions\n"
                    ).encode("utf-16le")
                )

                config = LauncherConfig(
                    auth_access_token="access-token",
                    auth_refresh_token="refresh-token",
                    auth_expires_at=int(time.time()) + 3600,
                    auth_user_id="user-1",
                    auth_email="kevin@example.test",
                    backend_token="access-token",
                )
                save_config(config)

                backend = RegistryBackendWithLinkTrap(
                    config,
                    [
                        {
                            "account_id": "darwinex-account",
                            "alias": "Darwinex MT5",
                            "broker": "Tradeslide Trading Tech Limited",
                            "server": "Darwinex-Live",
                            "login": "4000082126",
                            "status": "active",
                            "connection_key": "dashboard-stable-key",
                            "connection_key_masked": mask_connection_key("dashboard-stable-key"),
                        }
                    ],
                )
                api = object.__new__(KMFXApi)
                api.config = config
                api.backend = backend
                api.store = LauncherStateStore()
                api.logger = __import__("logging").getLogger("kmfx_launcher_test")
                api._lock = threading.RLock()
                api.installations = [
                    MT5Installation("Darwinex", "", str(root), str(experts_path), "", "test")
                ]
                api._last_account_connections = []
                api._last_installed_link_sync_at = time.time()
                api.get_session = lambda: {"authenticated": True}
                api.refresh_installations = lambda: api.installations
                api.ensure_installed_account_links = lambda force=False: None
                api.get_status = lambda: {}
                api.get_installations = lambda: []

                captured: dict[str, str] = {}

                def fake_install_connector(_installation: MT5Installation, install_config: LauncherConfig) -> dict[str, object]:
                    captured["connection_key"] = install_config.connection_key
                    return {"ok": True}

                with patch("launcher.app.install_connector", fake_install_connector):
                    result = api.install_connector("Darwinex")

        self.assertTrue(result["ok"])
        self.assertEqual(0, backend.link_calls)
        self.assertEqual("", captured["connection_key"])

    def test_launcher_install_connector_does_not_create_dashboard_key(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                root = Path(temp_dir) / "CleanMT5"
                experts_path = root / "MQL5" / "Experts"
                experts_path.mkdir(parents=True)

                config = LauncherConfig(
                    auth_access_token="access-token",
                    auth_refresh_token="refresh-token",
                    auth_expires_at=int(time.time()) + 3600,
                    auth_user_id="user-1",
                    auth_email="kevin@example.test",
                    backend_token="access-token",
                )
                save_config(config)

                backend = RegistryBackendWithLinkTrap(config, [])
                api = object.__new__(KMFXApi)
                api.config = config
                api.backend = backend
                api.store = LauncherStateStore()
                api.logger = __import__("logging").getLogger("kmfx_launcher_test")
                api._lock = threading.RLock()
                api.installations = [
                    MT5Installation("MetaTrader 5", "", str(root), str(experts_path), "", "test")
                ]
                api._last_account_connections = []
                api._last_installed_link_sync_at = time.time()
                api.get_session = lambda: {"authenticated": True}
                api.get_account_connections = lambda: []
                api.refresh_installations = lambda: api.installations
                api.ensure_installed_account_links = lambda force=False: None
                api.get_installations = lambda: []

                captured: dict[str, str] = {}

                def fake_install_connector(_installation: MT5Installation, install_config: LauncherConfig) -> dict[str, object]:
                    captured["connection_key"] = install_config.connection_key
                    return {"ok": True}

                with patch("launcher.app.install_connector", fake_install_connector):
                    result = api.install_connector("MetaTrader 5")

        self.assertTrue(result["ok"])
        self.assertEqual(0, backend.link_calls)
        self.assertEqual("", captured["connection_key"])
        self.assertIn("Conector instalado", result["message"])

    def test_launcher_link_account_refreshes_and_retries_after_401(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                config = LauncherConfig(
                    auth_access_token="expired-access-token",
                    auth_refresh_token="refresh-token",
                    auth_expires_at=int(time.time()) + 3600,
                    auth_user_id="user-1",
                    auth_email="kevin@example.test",
                    backend_token="expired-access-token",
                )
                save_config(config)
                api = object.__new__(KMFXApi)
                api.config = config
                api.backend = ExpiredThenFreshBackend(config)
                api.logger = __import__("logging").getLogger("kmfx_launcher_test")

                response = api.link_account_with_session(user_id="user-1", label="Orion", connection_key="local-key")

        self.assertTrue(response.ok)
        self.assertEqual(2, api.backend.link_calls)
        self.assertEqual(1, api.backend.refresh_calls)
        self.assertEqual("fresh-access-token", api.config.backend_token)

    def test_launcher_get_session_refreshes_expired_saved_token(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                config = LauncherConfig(
                    auth_access_token="expired-access-token",
                    auth_refresh_token="refresh-token",
                    auth_expires_at=int(time.time()) - 10,
                    auth_user_id="user-1",
                    auth_email="kevin@example.test",
                    backend_token="expired-access-token",
                )
                save_config(config)
                api = object.__new__(KMFXApi)
                api.config = config
                api.backend = ExpiredThenFreshBackend(config)
                api.logger = __import__("logging").getLogger("kmfx_launcher_test")

                session = api.get_session()

        self.assertTrue(session["authenticated"])
        self.assertEqual("fresh-access-token", api.config.backend_token)
        self.assertEqual(1, api.backend.refresh_calls)

    def test_launcher_get_session_clears_rejected_expired_token(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                config = LauncherConfig(
                    auth_access_token="expired-access-token",
                    auth_refresh_token="refresh-token",
                    auth_expires_at=int(time.time()) - 10,
                    auth_user_id="user-1",
                    auth_email="kevin@example.test",
                    backend_token="expired-access-token",
                )
                save_config(config)
                api = object.__new__(KMFXApi)
                api.config = config
                api.backend = RejectedRefreshBackend(config)
                api.logger = __import__("logging").getLogger("kmfx_launcher_test")

                session = api.get_session()

        self.assertFalse(session["authenticated"])
        self.assertEqual("", api.config.backend_token)
        self.assertEqual(1, api.backend.refresh_calls)

    def test_launcher_clears_legacy_saved_key_on_login(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                config = LauncherConfig(
                    auth_access_token="access-token",
                    auth_refresh_token="refresh-token",
                    auth_expires_at=int(time.time()) + 3600,
                    auth_user_id="user-1",
                    auth_email="kevin@example.test",
                    backend_token="access-token",
                    connection_key="revoked-key",
                    connection_key_user_id="user-1",
                )
                save_config(config)

                api = object.__new__(KMFXApi)
                api.config = config
                api.backend = RevokedThenFreshBackend(config)
                api.store = LauncherStateStore()
                api.logger = __import__("logging").getLogger("kmfx_launcher_test")
                api.fetch_json = lambda _path: {}

                result = api.ensure_remote_account_link()

        self.assertTrue(result["ok"])
        self.assertEqual([], api.backend.connection_keys)
        self.assertEqual("", api.config.connection_key)
        self.assertEqual("", api.config.connection_key_user_id)

    def test_launcher_login_does_not_create_generic_mt5_account_without_local_key(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                config = LauncherConfig(
                    auth_access_token="access-token",
                    auth_refresh_token="refresh-token",
                    auth_expires_at=int(time.time()) + 3600,
                    auth_user_id="user-1",
                    auth_email="kevin@example.test",
                    backend_token="access-token",
                )
                save_config(config)

                api = object.__new__(KMFXApi)
                api.config = config
                api.backend = RegistryBackendWithLinkTrap(config, [])
                api.store = LauncherStateStore()
                api.logger = __import__("logging").getLogger("kmfx_launcher_test")
                api.fetch_json = lambda _path: {}

                result = api.ensure_remote_account_link()

        self.assertTrue(result["ok"])
        self.assertEqual(0, api.backend.link_calls)
        self.assertEqual("", api.config.connection_key)

    def test_launcher_install_does_not_rotate_revoked_installed_key_before_writing(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                root = Path(temp_dir) / "Darwinex"
                experts_path = root / "MQL5" / "Experts"
                files_path = root / "MQL5" / "Files"
                files_path.mkdir(parents=True)
                experts_path.mkdir(parents=True)
                (files_path / "kmfx_connection.conf").write_text("connection_key=revoked-key\n", encoding="utf-8")

                config = LauncherConfig(
                    auth_access_token="access-token",
                    auth_refresh_token="refresh-token",
                    auth_expires_at=int(time.time()) + 3600,
                    auth_user_id="user-1",
                    auth_email="kevin@example.test",
                    backend_token="access-token",
                )
                save_config(config)

                api = object.__new__(KMFXApi)
                api.config = config
                api.backend = RevokedThenFreshBackend(config)
                api.store = LauncherStateStore()
                api.logger = __import__("logging").getLogger("kmfx_launcher_test")
                api._lock = threading.RLock()
                api.installations = [
                    MT5Installation(
                        "Darwinex",
                        "",
                        str(root),
                        str(experts_path),
                        "",
                        "test",
                    )
                ]
                api.refresh_installations = lambda: api.installations
                api.get_status = lambda: {}
                api.get_installations = lambda: []
                api.get_account_connections = lambda: []
                api.ensure_installed_account_links = lambda force=False: None
                api.get_installations = lambda: []

                captured: dict[str, str] = {}

                def fake_install_connector(_installation: MT5Installation, install_config: LauncherConfig) -> dict[str, object]:
                    captured["connection_key"] = install_config.connection_key
                    return {"ok": True}

                with patch("launcher.app.install_connector", fake_install_connector):
                    result = api.install_connector("Darwinex")

        self.assertTrue(result["ok"])
        self.assertEqual([], api.backend.connection_keys)
        self.assertEqual("", captured["connection_key"])
        self.assertIn("Conector instalado", result["message"])

    def test_launcher_repair_account_prefers_identity_match_over_selected_installation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                root = Path(temp_dir)
                darwinex = root / "Darwinex"
                orion = root / "Orion"
                for data_path in (darwinex, orion):
                    (data_path / "MQL5" / "Experts").mkdir(parents=True)
                    (data_path / "MQL5" / "Files").mkdir(parents=True)
                    (data_path / "logs").mkdir(parents=True)
                (darwinex / "MQL5" / "Files" / "kmfx_connection.conf").write_text(
                    "connection_key=darwinex-stable-key\n",
                    encoding="utf-8",
                )
                (orion / "MQL5" / "Files" / "kmfx_connection.conf").write_text(
                    "connection_key=orion-key\n",
                    encoding="utf-8",
                )
                (darwinex / "logs" / "20260511.log").write_bytes(
                    (
                        "'4000082126': authorized on Darwinex-Live through Access Server EU\n"
                        "'4000082126': terminal synchronized with Tradeslide Trading Tech Limited: 0 positions\n"
                    ).encode("utf-16le")
                )
                (orion / "logs" / "20260511.log").write_bytes(
                    (
                        "'80571774': authorized on OGMInternational-Server through Access Server EU\n"
                        "'80571774': terminal synchronized with OGM International Ltd.: 0 positions\n"
                    ).encode("utf-16le")
                )

                config = LauncherConfig(
                    auth_access_token="access-token",
                    auth_refresh_token="refresh-token",
                    auth_expires_at=int(time.time()) + 3600,
                    auth_user_id="user-1",
                    auth_email="kevin@example.test",
                    backend_token="access-token",
                )
                save_config(config)

                api = object.__new__(KMFXApi)
                api.config = config
                api.backend = object()
                api.store = LauncherStateStore()
                api.logger = __import__("logging").getLogger("kmfx_launcher_test")
                api._lock = threading.RLock()
                api.installations = [
                    MT5Installation("Darwinex", "", str(darwinex), str(darwinex / "MQL5" / "Experts"), "", "test"),
                    MT5Installation("Orion", "", str(orion), str(orion / "MQL5" / "Experts"), "", "test"),
                ]
                api.get_session = lambda: {"authenticated": True}
                api.account_connection_by_id = lambda _account_id: {
                    "account_id": "darwinex-account",
                    "label": "Darwinex MT5",
                    "broker": "Tradeslide Trading Tech Limited",
                    "server": "Darwinex-Live",
                    "login": "4000082126",
                    "connection_key": "darwinex-stable-key",
                }
                api.refresh_installations = lambda: api.installations
                api.ensure_installed_account_links = lambda force=False: None
                api.get_status = lambda: {}
                api.get_installations = lambda: []
                api.get_account_connections = lambda: []

                captured: dict[str, str] = {}

                def fake_install_connector(installation: MT5Installation, install_config: LauncherConfig) -> dict[str, object]:
                    captured["label"] = installation.label
                    captured["connection_key"] = install_config.connection_key
                    return {"ok": True}

                with patch("launcher.app.install_connector", fake_install_connector):
                    result = api.install_connector_for_connection("darwinex-account", "Orion")

        self.assertTrue(result["ok"])
        self.assertEqual("Darwinex", captured["label"])
        self.assertEqual("", captured["connection_key"])

    def test_launcher_reinstall_account_reuses_canonical_installed_key(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                root = Path(temp_dir) / "Darwinex"
                experts_path = root / "MQL5" / "Experts"
                files_path = root / "MQL5" / "Files"
                files_path.mkdir(parents=True)
                experts_path.mkdir(parents=True)
                (files_path / "kmfx_connection.conf").write_text("connection_key=stale-key\n", encoding="utf-8")

                config = LauncherConfig(
                    auth_access_token="access-token",
                    auth_refresh_token="refresh-token",
                    auth_expires_at=int(time.time()) + 3600,
                    auth_user_id="user-1",
                    auth_email="kevin@example.test",
                    backend_token="access-token",
                )
                save_config(config)

                api = object.__new__(KMFXApi)
                api.config = config
                api.backend = SameKeyThenRotatedBackend(config)
                api.store = LauncherStateStore()
                api.logger = __import__("logging").getLogger("kmfx_launcher_test")
                api._lock = threading.RLock()
                api.installations = [
                    MT5Installation("Darwinex", "", str(root), str(experts_path), "", "test")
                ]
                api.get_session = lambda: {"authenticated": True}
                api.account_connection_by_id = lambda _account_id: {
                    "account_id": "darwinex-account",
                    "label": "Darwinex MT5",
                    "connection_key": "stale-key",
                }
                api.refresh_installations = lambda: api.installations
                api.ensure_installed_account_links = lambda force=False: None
                api.get_status = lambda: {}
                api.get_installations = lambda: []
                api.get_account_connections = lambda: []

                captured: dict[str, str] = {}

                def fake_install_connector(_installation: MT5Installation, install_config: LauncherConfig) -> dict[str, object]:
                    captured["connection_key"] = install_config.connection_key
                    return {"ok": True}

                with patch("launcher.app.install_connector", fake_install_connector):
                    result = api.install_connector_for_connection("darwinex-account")

        self.assertTrue(result["ok"])
        self.assertEqual(0, api.backend.link_calls)
        self.assertEqual(0, api.backend.regenerate_calls)
        self.assertEqual("", captured["connection_key"])

    def test_launcher_reinstall_connector_reuses_installed_key_from_remote_preview(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                root = Path(temp_dir) / "Darwinex"
                experts_path = root / "MQL5" / "Experts"
                files_path = root / "MQL5" / "Files"
                files_path.mkdir(parents=True)
                experts_path.mkdir(parents=True)
                revoked_key = "old-revoked-darwinex-key"
                (files_path / "kmfx_connection.conf").write_text(f"connection_key={revoked_key}\n", encoding="utf-8")

                config = LauncherConfig(
                    auth_access_token="access-token",
                    auth_refresh_token="refresh-token",
                    auth_expires_at=int(time.time()) + 3600,
                    auth_user_id="user-1",
                    auth_email="kevin@example.test",
                    backend_token="access-token",
                )
                save_config(config)

                api = object.__new__(KMFXApi)
                api.config = config
                api.backend = RegistryThenRegeneratedBackend(
                    config,
                    [
                        {
                            "account_id": "darwinex-account",
                            "alias": "Darwinex MT5",
                            "broker": "Tradeslide Trading Tech Limited",
                            "server": "Darwinex-Live",
                            "login": "4000082126",
                            "status": "pending_link",
                            "connection_key_masked": mask_connection_key(revoked_key),
                        }
                    ],
                )
                api.store = LauncherStateStore()
                api.logger = __import__("logging").getLogger("kmfx_launcher_test")
                api._lock = threading.RLock()
                api.installations = [
                    MT5Installation("Darwinex", "", str(root), str(experts_path), "", "test")
                ]
                api._last_account_connections = []
                api._last_installed_link_sync_at = time.time()
                api.config.connection_key = ""
                api.get_session = lambda: {"authenticated": True}
                api.refresh_installations = lambda: api.installations
                api.ensure_installed_account_links = lambda force=False: None
                api.get_status = lambda: {}
                api.get_installations = lambda: []

                captured: dict[str, str] = {}

                def fake_install_connector(installation: MT5Installation, install_config: LauncherConfig) -> dict[str, object]:
                    captured["label"] = installation.label
                    captured["connection_key"] = install_config.connection_key
                    return {"ok": True}

                with patch("launcher.app.install_connector", fake_install_connector):
                    result = api.repair_connector("Darwinex")

        self.assertTrue(result["ok"])
        self.assertEqual("Darwinex", captured["label"])
        self.assertEqual("", captured["connection_key"])
        self.assertEqual(0, api.backend.regenerate_calls)

    def test_launcher_reinstall_connector_resolves_account_by_mt5_identity_with_stable_key(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                root = Path(temp_dir) / "Darwinex"
                experts_path = root / "MQL5" / "Experts"
                files_path = root / "MQL5" / "Files"
                logs_path = root / "logs"
                files_path.mkdir(parents=True)
                experts_path.mkdir(parents=True)
                logs_path.mkdir(parents=True)
                (files_path / "kmfx_connection.conf").write_text(
                    "connection_key=unlisted-local-key\n",
                    encoding="utf-8",
                )
                (logs_path / "20260511.log").write_bytes(
                    (
                        "'4000082126': authorized on Darwinex-Live through Access Server EU\n"
                        "'4000082126': terminal synchronized with Tradeslide Trading Tech Limited: 0 positions\n"
                    ).encode("utf-16le")
                )

                config = LauncherConfig(
                    auth_access_token="access-token",
                    auth_refresh_token="refresh-token",
                    auth_expires_at=int(time.time()) + 3600,
                    auth_user_id="user-1",
                    auth_email="kevin@example.test",
                    backend_token="access-token",
                )
                save_config(config)

                api = object.__new__(KMFXApi)
                api.config = config
                api.backend = RegistryThenRegeneratedBackend(
                    config,
                    [
                        {
                            "account_id": "darwinex-account",
                            "alias": "Darwinex MT5",
                            "broker": "Tradeslide Trading Tech Limited",
                            "server": "Darwinex-Live",
                            "login": "4000082126",
                            "status": "pending_link",
                            "connection_key": "darwinex-stable-key",
                            "connection_key_masked": mask_connection_key("darwinex-stable-key"),
                        }
                    ],
                )
                api.store = LauncherStateStore()
                api.logger = __import__("logging").getLogger("kmfx_launcher_test")
                api._lock = threading.RLock()
                api.installations = [
                    MT5Installation("Darwinex", "", str(root), str(experts_path), "", "test")
                ]
                api._last_account_connections = []
                api._last_installed_link_sync_at = time.time()
                api.config.connection_key = ""
                api.get_session = lambda: {"authenticated": True}
                api.refresh_installations = lambda: api.installations
                api.ensure_installed_account_links = lambda force=False: None
                api.get_status = lambda: {}
                api.get_installations = lambda: []

                captured: dict[str, str] = {}

                def fake_install_connector(_installation: MT5Installation, install_config: LauncherConfig) -> dict[str, object]:
                    captured["connection_key"] = install_config.connection_key
                    return {"ok": True}

                with patch("launcher.app.install_connector", fake_install_connector):
                    result = api.repair_connector("Darwinex")

        self.assertTrue(result["ok"])
        self.assertEqual("", captured["connection_key"])
        self.assertEqual(0, api.backend.regenerate_calls)

    def test_launcher_reinstall_connector_fetches_existing_raw_key_without_regeneration(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                root = Path(temp_dir) / "Darwinex"
                experts_path = root / "MQL5" / "Experts"
                logs_path = root / "logs"
                experts_path.mkdir(parents=True)
                logs_path.mkdir(parents=True)
                (logs_path / "20260511.log").write_bytes(
                    (
                        "'4000082126': authorized on Darwinex-Live through Access Server EU\n"
                        "'4000082126': terminal synchronized with Tradeslide Trading Tech Limited: 0 positions\n"
                    ).encode("utf-16le")
                )

                config = LauncherConfig(
                    auth_access_token="access-token",
                    auth_refresh_token="refresh-token",
                    auth_expires_at=int(time.time()) + 3600,
                    auth_user_id="user-1",
                    auth_email="kevin@example.test",
                    backend_token="access-token",
                )
                save_config(config)

                api = object.__new__(KMFXApi)
                api.config = config
                api.backend = RegistryThenRegeneratedBackend(
                    config,
                    [
                        {
                            "account_id": "darwinex-account",
                            "alias": "Darwinex MT5",
                            "broker": "Tradeslide Trading Tech Limited",
                            "server": "Darwinex-Live",
                            "login": "4000082126",
                            "status": "pending_link",
                            "has_connection_key": True,
                            "connection_key_masked": mask_connection_key("darwinex-stable-key"),
                        }
                    ],
                )
                api.store = LauncherStateStore()
                api.logger = __import__("logging").getLogger("kmfx_launcher_test")
                api._lock = threading.RLock()
                api.installations = [
                    MT5Installation("Darwinex", "", str(root), str(experts_path), "", "test")
                ]
                api._last_account_connections = []
                api._last_installed_link_sync_at = time.time()
                api.config.connection_key = ""
                api.get_session = lambda: {"authenticated": True}
                api.refresh_installations = lambda: api.installations
                api.ensure_installed_account_links = lambda force=False: None
                api.get_status = lambda: {}
                api.get_installations = lambda: []
                api.get_account_connections = lambda: []

                captured: dict[str, str] = {}

                def fake_install_connector(_installation: MT5Installation, install_config: LauncherConfig) -> dict[str, object]:
                    captured["connection_key"] = install_config.connection_key
                    return {"ok": True}

                with patch("launcher.app.install_connector", fake_install_connector):
                    result = api.repair_connector("Darwinex")

        self.assertTrue(result["ok"])
        self.assertEqual("", captured["connection_key"])
        self.assertEqual(0, api.backend.regenerate_calls)

    def test_launcher_reinstall_fetches_current_dashboard_key_when_registry_marks_old_key_revoked(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                root = Path(temp_dir) / "Darwinex"
                experts_path = root / "MQL5" / "Experts"
                files_path = root / "MQL5" / "Files"
                logs_path = root / "logs"
                files_path.mkdir(parents=True)
                experts_path.mkdir(parents=True)
                logs_path.mkdir(parents=True)
                (files_path / "kmfx_connection.conf").write_text(
                    "connection_key=old-revoked-key\n",
                    encoding="utf-8",
                )
                (logs_path / "20260511.log").write_bytes(
                    (
                        "'4000082126': authorized on Darwinex-Live through Access Server EU\n"
                        "'4000082126': terminal synchronized with Tradeslide Trading Tech Limited: 0 positions\n"
                    ).encode("utf-16le")
                )

                config = LauncherConfig(
                    auth_access_token="access-token",
                    auth_refresh_token="refresh-token",
                    auth_expires_at=int(time.time()) + 3600,
                    auth_user_id="user-1",
                    auth_email="kevin@example.test",
                    backend_token="access-token",
                )
                save_config(config)

                api = object.__new__(KMFXApi)
                api.config = config
                api.backend = RegistryThenRegeneratedBackend(
                    config,
                    [
                        {
                            "account_id": "darwinex-account",
                            "alias": "Darwinex MT5",
                            "broker": "Tradeslide Trading Tech Limited",
                            "server": "Darwinex-Live",
                            "login": "4000082126",
                            "status": "active",
                            "has_connection_key": True,
                            "connection_key_masked": mask_connection_key("old-revoked-key"),
                            "connection_key_revoked": True,
                        }
                    ],
                )
                api.store = LauncherStateStore()
                api.logger = __import__("logging").getLogger("kmfx_launcher_test")
                api._lock = threading.RLock()
                api.installations = [
                    MT5Installation("Darwinex", "", str(root), str(experts_path), "", "test")
                ]
                api._last_account_connections = []
                api._last_installed_link_sync_at = time.time()
                api.config.connection_key = ""
                api.get_session = lambda: {"authenticated": True}
                api.refresh_installations = lambda: api.installations
                api.ensure_installed_account_links = lambda force=False: None
                api.get_status = lambda: {}
                api.get_installations = lambda: []

                captured: dict[str, str] = {}

                def fake_install_connector(_installation: MT5Installation, install_config: LauncherConfig) -> dict[str, object]:
                    captured["connection_key"] = install_config.connection_key
                    return {"ok": True}

                with patch("launcher.app.install_connector", fake_install_connector):
                    result = api.repair_connector("Darwinex")

        self.assertTrue(result["ok"])
        self.assertEqual("", captured["connection_key"])
        self.assertEqual(0, api.backend.regenerate_calls)

    def test_launcher_ui_uses_reinstall_copy_for_existing_connector(self) -> None:
        ui_source = (Path(__file__).resolve().parents[1] / "launcher" / "ui" / "app.js").read_text(encoding="utf-8")
        ui_html = (Path(__file__).resolve().parents[1] / "launcher" / "ui" / "index.html").read_text(encoding="utf-8")

        self.assertNotIn('"repair_connector"', ui_source)
        self.assertIn("Boolean(state.status?.connector_installed)", ui_source)
        self.assertIn('performAction("install_connector", installed ? "Conector reinstalado." : "Conector instalado."', ui_source)
        self.assertIn('installed ? "Reinstalar" : "Instalar"', ui_source)
        self.assertIn('performAction("refresh", "Cuentas actualizadas.")', ui_source)
        self.assertEqual(1, ui_source.count('id="selected-installation"'))
        self.assertNotIn('performAction("create_account_connection"', ui_source)
        self.assertNotIn("Añadir cuenta MT5", ui_html)
        self.assertNotIn("Reparar conector", ui_source)
        self.assertNotIn("Copiar key", ui_source)
        self.assertIn("El EA es solo lectura: no abre, cierra ni modifica operaciones", ui_html)
        self.assertIn("modo solo lectura", ui_source)
        self.assertIn("el EA no gestiona órdenes", ui_source)
        self.assertIn('id="create-instance-form"', ui_html)
        self.assertIn('callApi("create_mt5_instance", name)', ui_source)
        self.assertIn("En Mac crea una instancia separada con el conector instalado", ui_html)

    def test_launcher_detects_shared_installed_connection_keys(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            first = root / "Darwinex"
            second = root / "Orion"
            for data_path in (first, second):
                config_path = data_path / "MQL5" / "Files" / "kmfx_connection.conf"
                config_path.parent.mkdir(parents=True)
                config_path.write_text("connection_key=shared-key\n", encoding="utf-8")

            api = object.__new__(KMFXApi)
            api.installations = [
                MT5Installation("Darwinex", "", str(first), str(first / "MQL5" / "Experts"), "", "test"),
                MT5Installation("Orion", "", str(second), str(second / "MQL5" / "Experts"), "", "test"),
            ]

            self.assertEqual({"shared-key": 2}, api.installed_key_occurrences())
            self.assertTrue(api.installation_has_shared_connection_key(api.installations[0]))


if __name__ == "__main__":
    unittest.main()
