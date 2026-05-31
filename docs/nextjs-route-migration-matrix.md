# KMFX Next.js Route Migration Matrix

Status: planned and partially implemented in `apps/web-next`. No production runtime changes.
Last updated: 2026-05-20
Purpose: map the current routed surfaces of the vanilla app to the future Next.js app with priority, dependencies, and migration risk.

## Why this document exists

KMFX is not a single-screen migration. The current app has:

- canonical routes;
- aliases in Spanish and English;
- grouped navigation parents;
- subpages that currently share a parent surface;
- admin-only views;
- mobile navigation priorities that differ from desktop.

This matrix turns that into a practical migration sequence.

## Current routing source of truth

Current route behavior is defined primarily in:

- [route-map.js](/Users/conlopuestoyaloloco/Desktop/KMFX%20Edge/js/modules/route-map.js:1)
- [navigation.js](/Users/conlopuestoyaloloco/Desktop/KMFX%20Edge/js/modules/navigation.js:1)
- [mobile-nav.js](/Users/conlopuestoyaloloco/Desktop/KMFX%20Edge/js/modules/mobile-nav.js:1)
- [index.html](/Users/conlopuestoyaloloco/Desktop/KMFX%20Edge/index.html:153)

## Migration rules

- Preserve canonical product meaning, not necessarily every legacy alias.
- Use one clean canonical Next route per feature, and optionally support legacy redirects later.
- Do not carry `activePage` as the source of truth in Next; the URL becomes the page source.
- Keep admin-only visibility behind real permission logic.

## Route groups

### Core operating loop

- Dashboard
- Accounts
- Risk
- Analytics
- Trades
- Journal

### Secondary operating surfaces

- Calendar
- Strategies
- Capital
- Market
- Tools
- Settings

### Sensitive or gated surfaces

- Funding subpages
- Journal subpages
- Risk subpages
- Debug

## Canonical route matrix

| Current page key | Current canonical route | Future Next route | Current parent/nav parent | Primary source modules | Priority | Risk | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `dashboard` | `/dashboard` | `/dashboard` | self | `dashboard.js`, `accounts-ui.js`, `utils.js`, `dashboard-professional-kpis.js`, `chart-system.js` | Wave 1 | High | Visual flagship route; read-only first. |
| `analytics` | `/insights` | `/analytics` | self | `analytics.js`, `risk-alerts.js`, `chart-system.js` | Wave 1 | High | Use canonical `/analytics`; legacy `/insights` can redirect later. |
| `analytics-daily` | `/insights/diario` | `/analytics/daily` | `analytics` | `analytics.js` | Wave 1 | Medium | Good candidate for nested route under analytics. |
| `analytics-hourly` | `/insights/horario` | `/analytics/hourly` | `analytics` | `analytics.js` | Wave 1 | Medium | Same data family as analytics summary. |
| `analytics-risk` | `/insights/riesgo` | `/analytics/risk` | `analytics` | `analytics.js`, `risk-alerts.js`, `risk-selectors.js` | Wave 1 | Medium/high | Keep close to risk domain logic. |
| `connections` | `/cuentas` | `/accounts` | self | `connections.js`, `accounts-live-snapshot.js`, `account-runtime.js`, `api-config.js` | Wave 1 | High | Important because it sits near live account context and entitlement actions. |
| `risk` | `/risk-engine` | `/risk` | self | `risk.js`, `risk-selectors.js`, `risk-live-snapshot.js`, `risk-panel-components.js` | Wave 1 | High | Must protect clarity; no decorative overload. |
| `trades` | `/operaciones` | `/trades` | self | `trades.js`, `discipline.js`, `modal-system.js` | Wave 2 | Medium/high | Start read-only table/list first. |
| `calendar` | `/calendario` | `/calendar` | self | `calendar.js`, `chart-system.js`, `utils.js` | Wave 2 | Medium/high | Grid-heavy; benefits from route after shell stabilizes. |
| `journal` | `/journal` | `/journal` | self | `journal.js`, `utils.js`, `modal-system.js` | Wave 2 | Medium/high | Core route, but more coupled than dashboard/risk/accounts. |
| `journal-review` | `/journal/review-queue` | `/journal/review-queue` | `journal` | `journal.js` | Wave 3 | Medium | Good nested route under journal. |
| `journal-entries` | `/journal/entradas` | `/journal/entries` | `journal` | `journal.js` | Wave 3 | Medium | Canonical English path is cleaner for Next. |
| `journal-ai-review` | `/journal/ai-review` | `/journal/ai-review` | `journal` | `journal.js` | Wave 3 | Medium | Keep as explicit nested route if retained in product. |
| `strategies` | `/estrategias` | `/strategies` | self | `strategies.js`, `backtest-real.js`, `journal.js` | Wave 2 | High | Large analytical surface; split by subroutes. |
| `strategies-backtest` | `/estrategias/backtest-vs-real` | `/strategies/backtest-vs-real` | `strategies` | `strategies.js`, `backtest-real.js` | Wave 2 | Medium/high | Natural nested route. |
| `strategies-portfolio` | `/estrategias/portafolios` | `/strategies/portfolio` | `strategies` | `strategies.js` | Wave 2 | Medium/high | Canonical singular English path is acceptable. |
| `portfolio` | `/capital` | `/capital` | self | `portfolio.js`, `utils.js`, `chart-system.js` | Wave 2 | Medium/high | Capital and account surfaces should stay visually aligned. |
| `market` | `/market` | `/market` | self | `market.js`, `utils.js` | Wave 2 | Medium | Fairly isolated compared with risk/accounts. |
| `discipline` | `/ejecucion` | `/execution` | self | `discipline.js`, `loadPostTradeTags`, `openPostTradeModal` | Wave 3 | High | Heavier interactive logic; not an early bootstrap route. |
| `calculator` | `/herramientas` | `/tools/calculator` | self | `calculator.js`, `risk-engine.js`, `status-badges.js` | Wave 3 | Medium | Better nested under tools in Next. |
| `funded` | `/funding` | `/funding` | self | `funded.js`, `funding-journeys.js`, `funding-ledger.js`, `funding-rules.js` | Wave 3 | Medium/high | Keep after core routes. |
| `funding-journeys` | n/a | `/funding/journeys` | `funding` | future `funding-journeys` domain | Wave 3 | Medium/high | Groups Phase 1, Phase 2 and Funded/Real under one journey. |
| `funding-journey-detail` | n/a | `/funding/journeys/[journeyId]` | `funding` | future `funding-journeys` domain | Wave 3 | High | Full history: phases, accounts, trades, risk, payouts and timeline. |
| `funding-accounts` | n/a | `/funding/accounts` | `funding` | `connections.js`, future funding account links | Wave 3 | Medium | Operational list of individual MT5 logins linked to journeys. |
| `funded-rules` | `/funding/reglas` | `/funding/rules` | `funded` | `funded.js`, `funding-rules.js` | Wave 3 | Medium | Nested route. |
| `funded-payouts` | `/funding/payouts` | `/funding/payouts` | `funded` | `funded.js`, `funding-ledger.js` | Wave 3 | Medium | Nested route. |
| `glossary` | `/estudio` | `/study` | self | `glossary.js`, `ui-primitives.js` | Wave 3 | Low/medium | Mostly informational surface. |
| `settings` | `/ajustes` | `/settings` | self | `app.js:initSettings`, `supabase-user-config.js`, `auth-session.js`, `avatar-utils.js` | Wave 3 | High | Sensitive because settings are partly hardcoded + auth/config coupled. |
| `debug` | `/debug` | `/debug` | self | `debug.js`, `admin-mode.js` | Wave 3 | Medium/high | Admin-only; only after entitlement wrapping is solid. |

## Legacy alias policy

The current app supports many aliases. Example families:

- `/insights`, `/analytics`, `/analisis`
- `/risk-engine`, `/risk`
- `/cuentas`, `/accounts`, `/connections`
- `/estrategias`, `/strategies`
- `/ajustes`, `/settings`

Recommendation:

- choose one canonical Next route per feature;
- optionally add redirects later for the most important legacy aliases;
- do not preserve every alias during Wave 1.

## Recommended canonical Next routes

These are the preferred clean routes for the new app:

- `/dashboard`
- `/analytics`
- `/analytics/daily`
- `/analytics/hourly`
- `/analytics/risk`
- `/accounts`
- `/risk`
- `/trades`
- `/calendar`
- `/journal`
- `/journal/review-queue`
- `/journal/entries`
- `/journal/ai-review`
- `/strategies`
- `/strategies/backtest-vs-real`
- `/strategies/portfolio`
- `/capital`
- `/market`
- `/execution`
- `/tools/calculator`
- `/funding`
- `/funding/journeys`
- `/funding/journeys/[journeyId]`
- `/funding/accounts`
- `/funding/rules`
- `/funding/payouts`
- `/study`
- `/settings`
- `/debug`

## Mobile navigation implications

The current retired mobile nav still shows the intended product priorities clearly:

- `dashboard`
- `calendar`
- `trades`
- `analytics`

And the “more” surface elevates:

- `strategies`
- `journal`
- `risk`

Recommendation for the future Next mobile shell:

- keep one-tap access to `dashboard`, `risk`, `accounts`, and one of `journal` or `analytics`;
- move the rest behind a controlled sheet/drawer pattern.

## Priority by migration wave

### Wave 1

- `/dashboard`
- `/accounts`
- `/risk`
- `/analytics`
- `/analytics/daily`
- `/analytics/hourly`
- `/analytics/risk`

Reason:

- these routes define the product feel fastest and justify the new shell.

### Wave 2

- `/trades`
- `/calendar`
- `/journal`
- `/strategies`
- `/strategies/backtest-vs-real`
- `/strategies/portfolio`
- `/capital`
- `/market`

Reason:

- richer operating surfaces, but they should follow after shell and data extraction prove stable.

### Wave 3

- `/journal/review-queue`
- `/journal/entries`
- `/journal/ai-review`
- `/execution`
- `/tools/calculator`
- `/funding`
- `/funding/journeys`
- `/funding/journeys/[journeyId]`
- `/funding/accounts`
- `/funding/rules`
- `/funding/payouts`
- `/study`
- `/settings`
- `/debug`

Reason:

- these are either more specialized, more coupled to current implementation details, or more sensitive.

## High-risk route notes

### `/dashboard`

Risk factors:

- depends on many selectors and cross-surface account context;
- likely mixes visual rendering with derived business logic.

Migration posture:

- rebuild visually in Next;
- feed it through extracted typed domain/model layers.

### `/accounts`

Risk factors:

- connection state, live snapshot behavior, and entitlement-aware controls.

Migration posture:

- start read-only;
- keep live actions out until the client layer is safely wrapped.

### `/risk`

Risk factors:

- complex metric interpretation;
- high user impact if hierarchy or meaning is degraded.

Migration posture:

- prioritize semantic fidelity over visual flourish.

### `/settings`

Risk factors:

- currently partly lives in `index.html` and `app.js`;
- coupled with auth/profile/preferences persistence.

Migration posture:

- keep it late;
- migrate after the compatible config/auth wrapper exists.

## Acceptance checklist

- [x] Every current canonical route has a planned Next target.
- [x] Nested subpages are mapped intentionally, not accidentally flattened.
- [x] Wave 1 routes match the shell and data strategy.
- [x] Settings and admin remain late-stage migrations.
- [x] Mobile route priorities are explicit.
- [x] Legacy aliases are treated as redirects, not as first-class implementation burden.
