# KMFX Edge Next Dashboard

Next.js production dashboard for KMFX Edge. Public access uses normal Supabase Auth sign-up/sign-in, while billing writes, MT5 write-flows, Launcher mutations, RiskGuard enforcement and EA export stay behind their dedicated backend contracts.

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

## Live Snapshot Access

Use server-only env vars for live reads:

```bash
KMFX_WAVE1_SOURCE=live
KMFX_API_BASE_URL=https://kmfx-edge-api.onrender.com
KMFX_SNAPSHOT_TIMEOUT_MS=60000
KMFX_PREVIEW_BEARER_TOKEN=...
KMFX_PREVIEW_USER_EMAIL=...
KMFX_PREVIEW_USER_ID=...
```

Do not expose preview bearer, service role keys, Render tokens, or Cloudflare tokens as `NEXT_PUBLIC_*`.

For normal user auth, enable Supabase mode and public Supabase client config:

```bash
KMFX_NEXT_AUTH_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY is accepted only as legacy fallback.
```

When `KMFX_NEXT_AUTH_MODE=supabase` is active, live snapshots use the authenticated user's Supabase JWT and disable process-level snapshot caching to avoid cross-user data reuse.

Authenticated route handlers live under `/api/kmfx/*`. They proxy to the existing backend with the authenticated Supabase JWT; Next does not call Stripe directly, generate KMFXKeys, talk to MT5, or store billing/account secrets.

## Internal Strategy Lab

`/strategy-lab` is hidden from navigation and returns 404 unless all server-side gates pass:

```bash
KMFX_ENABLE_GENETIC_LAB=1
KMFX_NEXT_AUTH_MODE=supabase
KMFX_GENETIC_OWNER_EMAIL=admin@gmail.com
# or KMFX_ADMIN_EMAILS=admin@gmail.com,other-admin@gmail.com
```

Use a real admin Gmail in Vercel/local env. Do not publish these values as `NEXT_PUBLIC_*`.

## Vercel Production Setup

Use the `apps/web-next` Vercel project as the production Next.js surface for `kmfxedge.com`. Do not deploy from the legacy root project.

Recommended gates before inviting users:

```bash
npm run preflight:production
npm run preflight:full
npm run monitor:production
npm run validate:cascade
npm run build
```

`--scope platform` checks public surface, Worker CORS, local scripts and hosting safety without requiring a fresh MT5 account snapshot. `--scope full` also requires a ready live account snapshot. `--scope student` keeps launch rehearsal blocked until user isolation, billing rehearsal, Launcher flow and MT5 reconciliation are explicitly confirmed.
