# KMFX Next.js Extraction Backlog

Status: active Next.js extraction backlog. Runtime changes live only in `apps/web-next`.
Last updated: 2026-05-19
Purpose: turn the current vanilla codebase into an ordered extraction backlog so the future Next.js migration can reuse logic without dragging legacy DOM rendering into the new app.

## Extraction strategy

Do not migrate page-by-page by copying HTML strings.

Instead:

1. extract contracts and typed data shapes;
2. extract pure domain logic and selectors;
3. isolate data clients/adapters;
4. rebuild UI in Next on top of those layers.

## Priority buckets

### Bucket A - Pure domain logic first

These are the best early extraction targets because they should become framework-agnostic.

- `utils.js`
- `risk-engine.js`
- `risk-alerts.js`
- `risk-selectors.js`
- `status-badges.js`
- `kmfx-integrity-check.js`
- `backend-model.js`

Planned destinations:

- `src/lib/domain/**`
- `src/lib/contracts/**`
- `src/features/risk/domain/**`

### Bucket B - Data adapters and sources

These enable typed read-only data flows in Next.

- `js/data/adapters/internal-model-adapter.js`
- `js/data/adapters/mock-account-adapter.js`
- `js/data/adapters/mt5-account-adapter.js`
- `js/data/sources/mock-workspace-source.js`
- `js/data/sources/mock-accounts-source.js`
- `accounts-live-snapshot.js`
- `api-config.js`
- `account-runtime.js`

Planned destinations:

- `src/lib/data/**`
- `src/lib/api/**`
- `src/features/accounts/domain/**`

### Bucket C - Shell and navigation logic

These should be reimplemented, but they still need to be studied and mapped.

- `navigation.js`
- `mobile-nav.js`
- `route-map.js`
- `sidebar-ui.js`
- `sidebar-vnext.js`
- `topbar-status.js`
- `store.js`

Rule:

- do not port these as-is;
- use them to define the Next shell behavior and route configuration.

### Bucket D - High-value page logic

These routes are the first serious read-only migration targets.

- `dashboard.js`
- `analytics.js`
- `risk.js`
- `connections.js`
- `accounts-ui.js`
- `calendar.js`
- `trades.js`

Rule:

- separate domain/model logic from render logic before reuse.

### Bucket E - Higher-coupling operational surfaces

These should migrate later because they are more coupled to forms, settings, or write-like behaviors.

- `discipline.js`
- `journal.js`
- `strategies.js`
- `funded.js`
- `portfolio.js`
- `market.js`
- `calculator.js`
- `glossary.js`
- `debug.js`

### Bucket F - Sensitive or frozen surfaces

These are intentionally not early migration targets.

- `auth-session.js`
- `auth-ui.js`
- `supabase-user-config.js`
- `billing-status.js`
- `connection-wizard.js`
- `modal-system.js`
- `toast.js`

Rule:

- wrap carefully later;
- do not rewrite them in the bootstrap phase.

## Detailed backlog

### Contracts and fixtures

- [x] Define `Account`
- [x] Define `WorkspaceState`
- [x] Define `RiskSnapshot`
- [x] Define `DashboardModel`
- [x] Capture a stable mock fixture
- [x] Capture a stable live snapshot fixture with sensitive data removed

### Domain extraction

- [x] Split `utils.js` into selectors, formatters, and chart helpers
- [x] Extract `risk-engine.js` into a typed domain module
- [x] Extract `risk-alerts.js`
- [x] Extract `risk-selectors.js`
- [x] Convert `status-badges.js` to metadata-only domain state
- [x] Convert `backend-model.js` to typed contracts
- [x] Add tests around critical read-only selectors

Extracted in `apps/web-next` so far:

- `accounts-selectors`
- `account-context`
- `analytics-selectors`
- `calendar-selectors` (dias, agregados, semanas, periodo activo, vista anual y detalle diario)
- `dashboard-selectors`
- `economic-calendar-selectors`
- `execution-selectors`
- `funding-selectors`
- `funding-journey-selectors` (journey dashboard, risk queue, account rows, rules overview and payouts overview)
- `journal-selectors`
- `lot-sizing`
- `market-selectors`
- `portfolio-selectors`
- `review-selectors`
- `risk-alerts`
- `risk-engine`
- `risk-selectors`
- `settings-selectors`
- `status-meta`
- `study-selectors`
- `strategies-selectors`
- `trades-selectors`

### Data extraction

- [x] Type mock workspace source
- [x] Type mock accounts source
- [ ] Extract internal model adapter
- [ ] Extract mock account adapter
- [ ] Extract MT5 account adapter
- [x] Wrap `api-config.js` as a Next-friendly env-based module
- [x] Wrap `accounts-live-snapshot.js` as a Next-safe read-only API layer
- [x] Isolate MT5 source config as typed read-only metadata
- [ ] Isolate account runtime helpers

### Shell analysis

- [x] Map current route names to future Next route segments
- [x] Map current account context behavior
- [x] Map current active-page logic to URL-driven routing
- [x] Define mobile navigation priorities
- [x] Define admin gating points in the new shell

### Route migration backlog

- [x] `/dashboard`
- [x] `/accounts`
- [x] `/risk`
- [x] `/analytics`
- [x] `/calendar`
- [x] `/trades`
- [x] `/journal`
- [x] `/strategies`
- [x] `/capital`
- [x] `/market`
- [x] `/settings`
- [x] `/debug`

## Modules to keep out of React copy-paste migration

These should not be imported directly into the new app if they still write DOM or carry legacy runtime assumptions.

- `dashboard.js`
- `risk.js`
- `analytics.js`
- `calendar.js`
- `trades.js`
- `discipline.js`
- `connections.js`
- `journal.js`
- `strategies.js`
- `funded.js`
- `portfolio.js`
- `market.js`
- `debug.js`

Use them only as source material until their pure logic has been separated.

## Suggested Wave 1 extraction order

1. `backend-model.js`
2. `utils.js`
3. `status-badges.js`
4. `risk-engine.js`
5. `risk-alerts.js`
6. `risk-selectors.js`
7. `js/data/adapters/internal-model-adapter.js`
8. `js/data/adapters/mock-account-adapter.js`
9. `js/data/adapters/mt5-account-adapter.js`
10. `api-config.js`
11. `accounts-live-snapshot.js`
12. `account-runtime.js`

## Acceptance rule

An extracted module is only considered ready when:

- it no longer depends on DOM APIs;
- it has a clear typed interface;
- it is reusable by a Next route without pulling legacy rendering code;
- it can be tested in isolation.
