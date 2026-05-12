from __future__ import annotations

import json
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class AuthSessionContractTests(unittest.TestCase):
    def run_node_contract(self) -> dict[str, object]:
        script = r"""
          const storage = new Map();
          globalThis.window = {
            location: {
              origin: "https://kmfxedge.test",
              pathname: "/dashboard",
              search: "",
              hash: "",
            },
            localStorage: {
              getItem: (key) => storage.get(key) ?? null,
              setItem: (key, value) => storage.set(key, String(value)),
              removeItem: (key) => storage.delete(key),
            },
            addEventListener() {},
            removeEventListener() {},
            setTimeout: globalThis.setTimeout,
            clearTimeout: globalThis.clearTimeout,
          };
          globalThis.localStorage = window.localStorage;
          globalThis.document = {
            addEventListener() {},
            removeEventListener() {},
            visibilityState: "visible",
          };
          Object.defineProperty(globalThis, "navigator", {
            value: { userAgent: "node-auth-contract" },
            configurable: true,
          });

          const store = {
            state: {
              auth: {
                status: "anonymous",
                provider: "local",
                session: { accessToken: null, refreshToken: null, expiresAt: null },
                user: {
                  id: "",
                  name: "",
                  email: "",
                  avatar: null,
                  initials: "",
                  provider: "local",
                  role: "user",
                  is_admin: false,
                },
                profile: {
                  discord: "",
                  defaultAccount: "",
                },
              },
              accounts: {},
              liveAccountIds: [],
              currentAccount: null,
              activeLiveAccountId: null,
            },
            listeners: [],
            getState() {
              return this.state;
            },
            setState(next) {
              this.state = typeof next === "function" ? next(this.state) : next;
              this.listeners.forEach((listener) => listener(this.state));
            },
            subscribe(listener) {
              this.listeners.push(listener);
              return () => {};
            },
          };

          globalThis.__kmfxSupabaseClient = {
            auth: {
              async getSession() {
                return {
                  data: {
                    session: {
                      access_token: "token",
                      refresh_token: "refresh",
                      expires_at: 4102444800,
                      user: {
                        id: "user-1",
                        email: "role@kmfxedge.test",
                        user_metadata: {
                          name: "Trader User",
                          role: "admin",
                        },
                        app_metadata: {
                          provider: "google",
                          role: "user",
                        },
                        identities: [],
                      },
                    },
                  },
                };
              },
              onAuthStateChange() {
                return { data: { subscription: { unsubscribe() {} } } };
              },
            },
          };

          const { initAuthSession } = await import("./js/modules/auth-session.js");
          initAuthSession(store);
          await new Promise((resolve) => setTimeout(resolve, 0));
          const auth = window.kmfxAuth.getSession();
          console.log(JSON.stringify({
            role: auth.user.role,
            provider: auth.user.provider,
            name: auth.user.name,
          }));
        """
        proc = subprocess.run(
            [
                "node",
                "--experimental-loader",
                "./tests/node-esm-loader.mjs",
                "--input-type=module",
                "-e",
                textwrap.dedent(script),
            ],
            cwd=ROOT,
            text=True,
            capture_output=True,
        )
        if proc.returncode != 0:
            self.fail(f"node auth contract failed\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}")
        return json.loads(proc.stdout.splitlines()[-1])

    def test_frontend_auth_role_comes_from_app_metadata(self) -> None:
        result = self.run_node_contract()
        self.assertEqual("user", result["role"])
        self.assertEqual("Trader User", result["name"])


if __name__ == "__main__":
    unittest.main()
