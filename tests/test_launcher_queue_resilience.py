from __future__ import annotations

import importlib
import os
import tempfile
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import patch

from launcher.backend_client import BackendResponse
from launcher.config import LauncherConfig


class SequencedBackend:
    def __init__(self, responses: list[BackendResponse]) -> None:
        self.responses = responses
        self.calls: list[dict[str, Any]] = []

    def _next_response(self, *, kind: str, payload: dict[str, Any], connection_key: str | None) -> BackendResponse:
        self.calls.append({"kind": kind, "payload": payload, "connection_key": connection_key})
        if self.responses:
            return self.responses.pop(0)
        return BackendResponse(
            ok=True,
            status_code=200,
            body={"ok": True, "disposition": "accepted"},
            method="POST",
            request_url=f"https://backend.test/{kind}",
            request_attempted=True,
        )

    def post_snapshot(self, payload: dict[str, Any], *, connection_key: str | None = None) -> BackendResponse:
        return self._next_response(kind="snapshot", payload=payload, connection_key=connection_key)

    def post_journal(self, payload: dict[str, Any], *, connection_key: str | None = None) -> BackendResponse:
        return self._next_response(kind="journal", payload=payload, connection_key=connection_key)

    def healthcheck(self) -> BackendResponse:
        return BackendResponse(ok=True, status_code=200, body={"ok": True})


class LauncherQueueResilienceTests(unittest.TestCase):
    def runtime_with_backend(self, backend: SequencedBackend, temp_dir: str):
        env = {
            "KMFX_LAUNCHER_HOME": temp_dir,
            "KMFX_BRIDGE_CONFIG_PATH": str(Path(temp_dir) / "bridge.json"),
            "KMFX_ENV": "test",
        }
        patcher = patch.dict(os.environ, env)
        patcher.start()
        self.addCleanup(patcher.stop)
        service = importlib.import_module("launcher.service")
        config = LauncherConfig(
            backend_base_url="https://backend.test",
            backend_timeout_seconds=1,
            service_retry_interval_seconds=1,
            max_queue_size=10,
            max_attempts=3,
        ).ensure_runtime_values()
        runtime = service.LauncherServiceRuntime(config)
        runtime.backend = backend
        self.addCleanup(runtime.stop)
        return runtime

    def test_snapshot_backend_outage_stays_queued_with_connection_key(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            backend = SequencedBackend(
                [
                    BackendResponse(
                        ok=False,
                        status_code=0,
                        body={},
                        error="backend offline",
                        method="POST",
                        request_url="https://backend.test/api/mt5/sync",
                        request_attempted=True,
                    )
                ]
            )
            runtime = self.runtime_with_backend(backend, temp_dir)
            item = runtime.build_queue_item(
                "snapshot",
                "sync-queued",
                "key:abc123",
                {"sync_id": "sync-queued", "account": {"login": "52651704"}, "equity": 1000},
                connection_key="kmfx_live_key",
            )

            runtime.store.enqueue("snapshot", item, runtime.config.max_queue_size)
            result = runtime.try_dispatch_immediately("snapshot", "sync-queued")
            queued = runtime.store.find_queue_item("snapshot", "sync-queued")

        self.assertFalse(result["delivered"])
        self.assertEqual("queued", result["disposition"])
        self.assertIsNotNone(queued)
        self.assertEqual(1, queued["attempts"])
        self.assertEqual("queued", queued["status"])
        self.assertEqual("kmfx_live_key", queued["connection_key"])
        self.assertEqual("backend offline", queued["last_error"])
        self.assertEqual("kmfx_live_key", backend.calls[0]["connection_key"])

    def test_snapshot_queue_drains_and_records_receipt_after_backend_recovers(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            backend = SequencedBackend(
                [
                    BackendResponse(
                        ok=False,
                        status_code=503,
                        body={"ok": False, "reason": "maintenance"},
                        error="HTTP Error 503",
                        method="POST",
                        request_url="https://backend.test/api/mt5/sync",
                        request_attempted=True,
                    ),
                    BackendResponse(
                        ok=True,
                        status_code=202,
                        body={"ok": True, "disposition": "accepted", "sync_id": "sync-recovered"},
                        method="POST",
                        request_url="https://backend.test/api/mt5/sync",
                        request_attempted=True,
                    ),
                ]
            )
            runtime = self.runtime_with_backend(backend, temp_dir)
            item = runtime.build_queue_item(
                "snapshot",
                "sync-recovered",
                "key:recovered",
                {"sync_id": "sync-recovered", "account": {"login": "4000082126"}, "equity": 105541},
                connection_key="kmfx_recovered_key",
            )

            runtime.store.enqueue("snapshot", item, runtime.config.max_queue_size)
            first_result = runtime.try_dispatch_immediately("snapshot", "sync-recovered")
            runtime.store.update_queue_item("snapshot", "sync-recovered", next_retry_at="1970-01-01T00:00:00+00:00")
            runtime.process_due_queue()
            receipt = runtime.store.find_receipt("snapshot", "sync-recovered")
            snapshot = runtime.store.snapshot()

        self.assertEqual("queued", first_result["disposition"])
        self.assertEqual(0, runtime.store.queue_depth("snapshot"))
        self.assertIsNotNone(receipt)
        self.assertEqual("accepted", receipt["disposition"])
        self.assertEqual("accepted", snapshot["last_sync"]["status"])
        self.assertEqual("", snapshot["last_backend_error"])
        self.assertEqual(2, len(backend.calls))
        self.assertEqual(["kmfx_recovered_key", "kmfx_recovered_key"], [call["connection_key"] for call in backend.calls])

    def test_journal_queue_drains_after_backend_recovers(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            backend = SequencedBackend(
                [
                    BackendResponse(
                        ok=False,
                        status_code=0,
                        body={},
                        error="timeout",
                        method="POST",
                        request_url="https://backend.test/api/mt5/journal",
                        request_attempted=True,
                    ),
                    BackendResponse(
                        ok=True,
                        status_code=200,
                        body={"ok": True, "disposition": "accepted", "batch_id": "journal-recovered"},
                        method="POST",
                        request_url="https://backend.test/api/mt5/journal",
                        request_attempted=True,
                    ),
                ]
            )
            runtime = self.runtime_with_backend(backend, temp_dir)
            item = runtime.build_queue_item(
                "journal",
                "journal-recovered",
                "key:journal",
                {"batch_id": "journal-recovered", "events": [{"message": "closed trade"}]},
                connection_key="kmfx_journal_key",
            )

            runtime.store.enqueue("journal", item, runtime.config.max_queue_size)
            first_result = runtime.try_dispatch_immediately("journal", "journal-recovered")
            runtime.store.update_queue_item("journal", "journal-recovered", next_retry_at="1970-01-01T00:00:00+00:00")
            runtime.process_due_queue()
            receipt = runtime.store.find_receipt("journal", "journal-recovered")

        self.assertEqual("queued", first_result["disposition"])
        self.assertEqual(0, runtime.store.queue_depth("journal"))
        self.assertIsNotNone(receipt)
        self.assertEqual("accepted", receipt["disposition"])
        self.assertEqual(2, len(backend.calls))

    def test_permanent_backend_outage_drops_after_configured_attempt_limit(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            backend = SequencedBackend(
                [
                    BackendResponse(
                        ok=False,
                        status_code=503,
                        body={"ok": False},
                        error="HTTP Error 503",
                        method="POST",
                        request_url="https://backend.test/api/mt5/sync",
                        request_attempted=True,
                    )
                    for _ in range(4)
                ]
            )
            runtime = self.runtime_with_backend(backend, temp_dir)
            item = runtime.build_queue_item(
                "snapshot",
                "sync-dropped",
                "key:dropped",
                {"sync_id": "sync-dropped", "account": {"login": "80571774"}},
                connection_key="kmfx_drop_key",
            )
            runtime.store.enqueue("snapshot", item, runtime.config.max_queue_size)

            for _ in range(4):
                runtime.store.update_queue_item("snapshot", "sync-dropped", next_retry_at="1970-01-01T00:00:00+00:00")
                runtime.process_due_queue()

            receipt = runtime.store.find_receipt("snapshot", "sync-dropped")

        self.assertEqual(0, runtime.store.queue_depth("snapshot"))
        self.assertIsNotNone(receipt)
        self.assertEqual("dropped", receipt["disposition"])
        self.assertEqual(4, len(backend.calls))


if __name__ == "__main__":
    unittest.main()
