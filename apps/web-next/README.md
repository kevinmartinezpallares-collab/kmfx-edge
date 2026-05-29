# KMFX Edge Next Dashboard

Next.js beta dashboard for the KMFX Edge migration. The default V1 path remains read-only. A guarded Supabase-auth path can be enabled for student beta validation; billing writes, MT5 write-flows, Launcher mutations, RiskGuard enforcement and EA export still stay behind their dedicated backend contracts.

## Local Commands

```bash
npm ci
npm run dev
npm run validate:cascade
npm run build
```

Route smoke and mobile QA need a running server:

```bash
npm run start -- --hostname 127.0.0.1 --port 3051
KMFX_SMOKE_BASE_URL=http://127.0.0.1:3051 npm run test:smoke:routes
KMFX_QA_BASE_URL=http://127.0.0.1:3051 npm run qa:mobile:v1
```

## Live Snapshot Beta

Use server-only env vars for beta live reads:

```bash
KMFX_WAVE1_SOURCE=live
KMFX_API_BASE_URL=https://kmfx-edge-api.onrender.com
KMFX_SNAPSHOT_TIMEOUT_MS=60000
KMFX_PREVIEW_BEARER_TOKEN=...
KMFX_PREVIEW_USER_EMAIL=...
KMFX_PREVIEW_USER_ID=...
```

Do not expose preview bearer, service role keys, Render tokens, or Cloudflare tokens as `NEXT_PUBLIC_*`.

For student beta auth, enable the dedicated mode and public Supabase client config:

```bash
KMFX_NEXT_AUTH_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY is accepted only as legacy fallback.
```

When `KMFX_NEXT_AUTH_MODE=supabase` is active, live snapshots use the authenticated user's Supabase JWT and disable process-level snapshot caching to avoid cross-user data reuse.

Billing routes for the student beta live under `/api/kmfx/billing/*`. They proxy to the existing backend with the authenticated Supabase JWT; Next does not call Stripe directly and must not store billing secrets.

## Vercel Beta Setup

Create a separate Vercel project for beta. Use `apps/web-next` as the root directory and `beta.kmfxedge.com` as the beta domain. Do not deploy this app over the existing legacy `kmfx-edge` production project.

Recommended gates before inviting users:

```bash
python3 ../../scripts/next_beta_preflight.py --scope platform
python3 ../../scripts/next_beta_preflight.py --scope full
python3 ../../scripts/next_beta_preflight.py --scope student
npm run validate:cascade
npm run build
```

`--scope platform` checks public surface, Worker CORS, local scripts and hosting safety without requiring a fresh MT5 account snapshot. `--scope full` also requires a ready live account snapshot. `--scope student` keeps the beta blocked until user isolation, billing rehearsal, Launcher flow and MT5 reconciliation are explicitly confirmed.
