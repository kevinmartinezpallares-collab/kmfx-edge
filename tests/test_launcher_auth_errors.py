from __future__ import annotations

import json
import unittest
from pathlib import Path
from unittest.mock import patch

from launcher import service
from launcher.app import KMFXApi
from launcher.backend_client import BackendClient, BackendResponse
from launcher.config import LauncherConfig

ROOT = Path(__file__).resolve().parents[1]


class LauncherAuthErrorTests(unittest.TestCase):
    def test_pywebview_auth_message_explains_supabase_captcha_rejection(self) -> None:
        api = object.__new__(KMFXApi)
        response = BackendResponse(
            ok=False,
            status_code=400,
            body={
                "error_code": "captcha_failed",
                "msg": "captcha protection: request disallowed (no captcha_token found)",
            },
        )

        message = api._auth_error_message(response)

        self.assertIn("anti-bots", message)
        self.assertIn("Reintenta", message)
        self.assertIn("Google", message)
        self.assertIn("kmfxedge.com", message)
        self.assertNotIn("servidor", message.lower())

    def test_service_auth_message_explains_supabase_captcha_rejection(self) -> None:
        runtime = object.__new__(service.LauncherServiceRuntime)
        response = BackendResponse(
            ok=False,
            status_code=400,
            body={
                "error_code": "captcha_failed",
                "msg": "captcha protection: request disallowed (no captcha_token found)",
            },
        )

        message = runtime.auth_error_message(response)

        self.assertIn("anti-bots", message)
        self.assertIn("Reintenta", message)
        self.assertIn("Google", message)
        self.assertIn("kmfxedge.com", message)
        self.assertNotIn("servidor", message.lower())

    def test_backend_client_password_login_includes_turnstile_token_when_present(self) -> None:
        config = LauncherConfig()
        client = BackendClient(config)
        recorded: dict[str, object] = {}

        class _Response:
            status = 200

            def read(self) -> bytes:
                return b'{"access_token":"token","refresh_token":"refresh","user":{"id":"user-1","email":"demo@example.com"}}'

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        def fake_urlopen(request, timeout=0):
            recorded["url"] = request.full_url
            recorded["payload"] = json.loads(request.data.decode("utf-8"))
            return _Response()

        with patch("urllib.request.urlopen", side_effect=fake_urlopen):
            response = client.sign_in_with_password(
                email="demo@example.com",
                password="secret-pass",
                captcha_token="turnstile-token",
            )

        self.assertTrue(response.ok)
        self.assertEqual(
            {
                "email": "demo@example.com",
                "password": "secret-pass",
                "gotrue_meta_security": {"captcha_token": "turnstile-token"},
            },
            recorded["payload"],
        )

    def test_launcher_ui_uses_secure_browser_handoff_for_email_login(self) -> None:
        html = (ROOT / "launcher" / "ui" / "index.html").read_text(encoding="utf-8")
        app_js = (ROOT / "launcher" / "ui" / "app.js").read_text(encoding="utf-8")
        app_py = (ROOT / "launcher" / "app.py").read_text(encoding="utf-8")
        service_py = (ROOT / "launcher" / "service.py").read_text(encoding="utf-8")
        dashboard_app = (ROOT / "app.js").read_text(encoding="utf-8")
        auth_ui = (ROOT / "js" / "modules" / "auth-ui.js").read_text(encoding="utf-8")

        self.assertIn("vuelve al launcher automáticamente", html)
        self.assertNotIn('id="login-password"', html)
        self.assertIn('callApi("open_browser_signin", email)', app_js)
        self.assertIn("startOAuthPolling()", app_js)
        self.assertIn("def open_browser_signin", app_py)
        self.assertIn('"/auth/browser/start"', service_py)
        self.assertIn('"/auth/handoff"', service_py)
        self.assertIn("function initLauncherAuthBridge()", dashboard_app)
        self.assertIn("window.location.replace(handoffUrl);", dashboard_app)
        self.assertIn('launcherAuthParams.get("launcher_auth") === "1"', auth_ui)


if __name__ == "__main__":
    unittest.main()
