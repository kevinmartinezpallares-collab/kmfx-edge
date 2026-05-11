from __future__ import annotations

import unittest

from launcher import service
from launcher.app import KMFXApi
from launcher.backend_client import BackendResponse


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
        self.assertIn("Google", message)
        self.assertIn("kmfxedge.com", message)
        self.assertNotIn("servidor", message.lower())


if __name__ == "__main__":
    unittest.main()
