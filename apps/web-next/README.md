# KMFX Edge Next Dashboard

Next.js beta dashboard for the KMFX Edge migration. This app is read-only for V1 beta: no real auth rollout, billing writes, MT5 write-flows, launcher actions, RiskGuard enforcement, or EA export.

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

## Vercel Beta Setup

Create a separate Vercel project for beta. Use `apps/web-next` as the root directory and `beta.kmfxedge.com` as the beta domain. Do not deploy this app over the existing legacy `kmfx-edge` production project.

Recommended gates before inviting users:

```bash
python3 ../../scripts/next_beta_preflight.py
npm run validate:cascade
npm run build
```
