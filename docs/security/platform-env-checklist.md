# KMFX Edge platform security checklist

SEC-FIX-4 checklist for platform-owned settings. This file contains no secret
values and should be used as a deployment/review guide after pushing repo-owned
header and CORS changes.

## Environment variable classification

| Variable | Public frontend allowed? | Backend only? | Expected platform | Rotate if found elsewhere? |
| --- | --- | --- | --- | --- |
| `SUPABASE_URL` | Yes | No | Vercel/frontend config, Render backend | No, but verify project URL is expected |
| `SUPABASE_ANON_KEY` | Yes | No | Vercel/frontend config, Render backend if needed | No, but prefer current publishable key naming when migrated |
| `SUPABASE_PUBLISHABLE_KEY` | Yes | No | Vercel/frontend config, Render backend if needed | No |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Yes | Render backend only, never Vercel/client code | Yes |
| `SUPABASE_JWT_SECRET` | No | Yes | Render backend only if JWT verification uses it | Yes |
| `TURNSTILE_SITE_KEY` | Yes | No | Vercel/frontend config, Supabase CAPTCHA config | No |
| `TURNSTILE_SECRET_KEY` | No | Yes | Supabase Auth CAPTCHA settings or Render backend only | Yes |
| `ADMIN_USER_IDS` | No | Yes | Render backend only | Rotate/review admin IDs if exposed with access context |
| `KMFX_ADMIN_LAUNCHER_CONNECTION_KEYS` | No | Yes | Render backend only | Yes |
| `DATABASE_URL` | No | Yes | Render/backend database integration only | Yes |
| `DISCORD_WEBHOOK_URL` | No | Yes | Render/backend or GitHub Actions secret only | Yes |
| `OPENAI_API_KEY` | No | Yes | Backend or GitHub Actions secret only | Yes |
| `RENDER_API_KEY` / Render tokens | No | Yes | Local password manager or CI secret only | Yes |
| `VERCEL_TOKEN` / Vercel tokens | No | Yes | Local password manager or CI secret only | Yes |
| `GITHUB_TOKEN` / PATs | No | Yes | GitHub Actions generated token or scoped secret only | Yes |
| `CLOUDFLARE_API_TOKEN` | No | Yes | Local password manager or CI secret only | Yes |

## Vercel manual checks

- Project: `kmfx-edge`; production branch: `main`.
- Verify frontend env vars only contain public values: Supabase URL, Supabase
  anon/publishable key, Turnstile site key, public API base URL.
- Confirm backend-only secrets are absent from Vercel: service role key, JWT
  secret, Turnstile secret, database URL, Discord/OpenAI/API tokens, launcher
  connection keys.
- Enable preview deployment protection for non-production branches if sensitive
  user state is reachable.
- Confirm domains: `kmfxedge.com`, `www.kmfxedge.com`,
  `dashboard.kmfxedge.com`.
- After deployment, verify live headers include CSP, HSTS,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and
  frame protection.
- Investigate and remove any platform-level `Access-Control-Allow-Origin: *`
  header for frontend HTML responses unless there is a documented need.

## Render manual checks

- Confirm backend secrets exist only in Render environment variables.
- Confirm no Render logs print service role keys, JWT secrets, Turnstile
  secrets, connection keys, authorization headers, or raw sync payloads.
- Confirm CORS env does not use `*` in production.
- Deploy the latest commit after SEC-FIX-4 and verify health endpoints do not
  expose environment, account, or registry details.
- Review service access/team members and remove stale collaborators.

## Supabase manual checks

- Store plan, MT5 permission, and connection-limit decisions in
  `app_metadata` only. Do not read `user_metadata` for authorization decisions.
- Keep `user_metadata` for profile/display data only because users can update
  it through normal Auth flows.
- Review admin/service-role access after billing or plan automation changes.
- Confirm triggers and security-definer functions have explicit `search_path`
  and restricted execute grants.
- Review Supabase-managed default privileges for `supabase_admin`; if they
  cannot be altered by migration role, avoid creating public RPC functions as
  that owner and revoke direct client grants immediately after creation.

## Cloudflare manual checks

- Deploy the updated `kmfx-mt5-api-proxy` Worker.
- Confirm Worker CORS only returns `Access-Control-Allow-Origin` for approved
  KMFX origins.
- Confirm requests without an `Origin` header still work for MT5/server-to-
  server clients.
- Confirm localhost origins are accepted only when testing a local/preview
  Worker host, not on the public `mt5-api.kmfxedge.com` endpoint.
- Confirm Turnstile widget domains: `kmfxedge.com`, `www.kmfxedge.com`,
  `dashboard.kmfxedge.com`, and localhost only for development.
- Review Turnstile analytics for invalid token spikes and rotate the secret if
  exposure is suspected.
- Review DNS records for stale API, WebSocket, tunnel, or development domains.

## GitHub manual checks

- Enable branch protection on `main` with required reviews/checks and no force
  pushes.
- Enable secret scanning and push protection.
- Keep Actions workflow permissions least-privilege.
- Review deploy keys, webhooks, GitHub Apps, collaborators, and environment
  secrets after each external security review.
