# KMFX Next.js Types And Fixtures Inventory

Status: live in `apps/web-next` for Wave 1 contracts and fixture adapter.
Last updated: 2026-05-24
Purpose: define the first typed contracts and fixture families needed for the future Next.js extraction.

## Why this matters

The future Next app should not be fed by loosely shaped objects coming straight from legacy modules.

Before serious UI migration, we need:

- stable contracts;
- typed fixture families;
- clear boundaries between persistence records, live snapshots, account runtime, and derived view models.

## Runtime status in `apps/web-next`

Implemented files:

- `src/lib/contracts/live-snapshot.ts`
- `src/lib/contracts/account.ts`
- `src/lib/contracts/trade.ts`
- `src/lib/contracts/risk.ts`
- `src/lib/contracts/workspace-state.ts`
- `src/lib/data/live-snapshot-adapter.ts`
- `src/lib/data/fixtures/live-accounts-snapshot.fixture.json`

Current live-like fixture:

- Darwinex Zero 100K as default account.
- 100k starting point with synthetic, redacted financial history.
- 366 equity/balance points from 2025-05-23 to 2026-05-22.
- 213 closed operations across EURUSD, NAS100, USDCAD, GBPUSD and XAUUSD.
- `reportMetrics` and `riskSnapshot` included.
- Partial-close grouping remains validated with a dedicated inline fixture in `src/lib/data/live-snapshot-adapter.test.ts`.

Validation command:

```bash
cd apps/web-next
npm run test -- live-snapshot-adapter
```

## Main source files reviewed

- [backend-model.js](/Users/conlopuestoyaloloco/Desktop/KMFX%20Edge/js/modules/backend-model.js:1)
- [internal-model-adapter.js](/Users/conlopuestoyaloloco/Desktop/KMFX%20Edge/js/data/adapters/internal-model-adapter.js:1)
- [mt5-account-adapter.js](/Users/conlopuestoyaloloco/Desktop/KMFX%20Edge/js/data/adapters/mt5-account-adapter.js:1)
- [store.js](/Users/conlopuestoyaloloco/Desktop/KMFX%20Edge/js/modules/store.js:1)

## Contract layers

The future typed model should be split into four layers.

### 1. Persistence contracts

These mirror backend records and should stay close to storage semantics.

Suggested files:

- `src/lib/contracts/backend-records.ts`
- `src/lib/contracts/backend-entities.ts`

### 2. Transport and live snapshot contracts

These describe API payloads and MT5-derived normalized payloads before UI shaping.

Suggested files:

- `src/lib/contracts/live-snapshot.ts`
- `src/lib/contracts/mt5-transport.ts`

### 3. Domain state contracts

These describe the client-side state and business objects used across features.

Suggested files:

- `src/lib/contracts/account.ts`
- `src/lib/contracts/workspace-state.ts`
- `src/lib/contracts/account-runtime.ts`
- `src/features/risk/contracts/risk.ts`

### 4. Derived view-model contracts

These are the shapes that feed pages and components.

Suggested files:

- `src/features/dashboard/contracts/dashboard-model.ts`
- `src/features/risk/contracts/risk-view-model.ts`
- `src/features/analytics/contracts/analytics-view-model.ts`

## First-pass type inventory

### `BackendEntityMap`

Purpose:

- typed representation of backend entity definitions currently described in `BACKEND_ENTITIES`.

Main source:

- [backend-model.js](/Users/conlopuestoyaloloco/Desktop/KMFX%20Edge/js/modules/backend-model.js:3)

### `UserRecord`

Representative fields:

- `id`
- `email`
- `auth_provider`
- `auth_provider_user_id`
- `created_at`
- `updated_at`
- `last_login_at`

### `UserProfileRecord`

Representative fields:

- `id`
- `display_name`
- `email`
- `avatar_url`
- `avatar_initials`
- `discord`
- `default_account_id`
- `created_at`
- `updated_at`

### `UserPreferencesRecord`

Representative fields:

- `user_id`
- `theme`
- `visual_density`
- `default_landing_page`
- `default_account_id`
- `base_currency`
- `timezone`
- `favorite_pairs`
- `trading_style`
- `primary_session`
- `chart_preference`
- `show_advanced_metrics`
- `show_risk_alerts`
- `bridge_url`
- `refresh_interval`

### `TradingAccountRecord`

Representative fields:

- `id`
- `user_id`
- `external_account_id`
- `broker_name`
- `platform_type`
- `source_type`
- `account_name`
- `account_type`
- `base_currency`
- `is_default`
- `is_archived`
- `connection_status`
- `metadata`
- `last_synced_at`

### `RiskRuleRecord`

Representative fields:

- `user_id`
- `trading_account_id`
- `alert_drawdown`
- `alert_streaks`
- `alert_win_rate`
- `alert_overtrading`
- `risk_guidance_enabled`
- `auto_block_opt_in`
- `default_risk`
- `daily_drawdown_limit`
- `max_drawdown_limit`
- `max_trade_risk_percent`
- `metadata`

### `DashboardObjectiveRecord`

Representative fields:

- `id`
- `user_id`
- `trading_account_id`
- `metric_key`
- `label`
- `target_value`
- `comparison_mode`
- `timeframe`
- `is_active`
- `metadata`

## Domain types for the Next app

### `AccountConnectionState`

Purpose:

- represent normalized connection/runtime status in the frontend.

Likely fields:

- `state`
- `connected`
- `source`
- `lastSync`
- `lastError`
- `reconnectCount`
- `isSyncing`
- `syncTick`
- `isAutoReconnectPending`

Main sources:

- [internal-model-adapter.js](/Users/conlopuestoyaloloco/Desktop/KMFX%20Edge/js/data/adapters/internal-model-adapter.js:21)
- [store.js](/Users/conlopuestoyaloloco/Desktop/KMFX%20Edge/js/modules/store.js:192)

### `AccountComplianceState`

Likely fields:

- `riskStatus`
- `fundedStatus`
- `messages`

### `TradingAccount`

Purpose:

- normalized frontend account object used across routes.

Likely fields:

- `id`
- `name`
- `broker`
- `sourceType`
- `meta`
- `model`
- `connection`
- `compliance`
- account identity fields such as `login`, `platform`, `currency`, `mode`

Main sources:

- [internal-model-adapter.js](/Users/conlopuestoyaloloco/Desktop/KMFX%20Edge/js/data/adapters/internal-model-adapter.js:3)
- [mt5-account-adapter.js](/Users/conlopuestoyaloloco/Desktop/KMFX%20Edge/js/data/adapters/mt5-account-adapter.js:1)

### `WorkspaceState`

Purpose:

- typed replacement for the broad legacy store payload.

Likely top-level sections:

- `connections`
- `calculator`
- `journal`
- `strategies`
- `fundedAccounts`
- `market`
- `talent`
- `portfolio`
- `glossary`
- `debug`

Main source:

- [store.js](/Users/conlopuestoyaloloco/Desktop/KMFX%20Edge/js/modules/store.js:135)

### `UiState`

Likely fields:

- `activePage`
- `analyticsTab`
- `theme`

Note:

- in Next this should be minimized because route selection moves to the URL.

### `BillingState`

Purpose:

- represent entitlement and plan state separately from view code.

Likely fields:

- `loading`
- `loadedAt`
- `error`
- `authRequired`
- `billing`
- `entitlements`
- `limits`
- `isAdmin`
- `source`

Main source:

- [store.js](/Users/conlopuestoyaloloco/Desktop/KMFX%20Edge/js/modules/store.js:30)

### `Mt5TradeDeal`

Purpose:

- normalized atomic trade/deal unit before aggregation.

Likely fields:

- `id`
- `parentId`
- `date`
- `closeTime`
- `closeTimeUnix`
- `openTimeUnix`
- `tradingDayKey`
- `openDayKey`
- `monthKey`
- `symbol`
- `side`
- `technicalSide`
- `pnl`
- `net`
- `grossProfit`
- `profit`
- `commission`
- `swap`
- `dividend`
- `fees`
- `rMultiple`
- `setup`
- `session`
- `durationMin`
- `volume`
- `entryPrice`
- `exitPrice`

Main source:

- [mt5-account-adapter.js](/Users/conlopuestoyaloloco/Desktop/KMFX%20Edge/js/data/adapters/mt5-account-adapter.js:202)

### `RiskSnapshot`

Purpose:

- portable typed shape for risk-related live or derived state.

Likely families of fields:

- exposure totals
- drawdown metrics
- open trade risk rows
- symbol exposure rows
- ladder or policy progression
- freshness and last-sync metadata

Main sources:

- `risk-live-snapshot.js`
- `risk-selectors.js`
- `risk-panel-components.js`

### `DashboardModel`

Purpose:

- derived shape used by dashboard surfaces, independent of DOM rendering.

Likely families of fields:

- profile
- performance KPIs
- chart series/specs
- account summary
- watchlist or market pulse sections
- authority/freshness metadata

Main sources:

- `buildDashboardModel` in `utils.js`
- `dashboard.js`

## Fixture families required

### 1. Minimal mock workspace fixture

Purpose:

- power the first read-only routes before live integration.

Suggested file:

- `fixtures/mock/workspace-minimal.json`

### 2. Rich mock workspace fixture

Purpose:

- exercise dense surfaces such as dashboard, risk, analytics, and journal.

Suggested file:

- `fixtures/mock/workspace-rich.json`

### 3. Normalized MT5 account fixture

Purpose:

- validate typed account and trade normalization without live calls.

Suggested file:

- `fixtures/live/mt5-account-normalized.json`

### 4. Live snapshot redacted fixture

Purpose:

- test real-shape rendering while protecting sensitive user data.

Suggested file:

- `fixtures/live/live-snapshot-redacted.json`

### 5. Risk snapshot fixture

Purpose:

- validate risk route rendering and selector behavior.

Suggested file:

- `fixtures/live/risk-snapshot-redacted.json`

### 6. Billing/entitlements fixture

Purpose:

- test gated UI behavior without touching live billing.

Suggested file:

- `fixtures/mock/billing-entitlements.json`

## Suggested extraction order for types

1. `UserRecord`
2. `UserProfileRecord`
3. `UserPreferencesRecord`
4. `TradingAccountRecord`
5. `TradingAccount`
6. `AccountConnectionState`
7. `AccountComplianceState`
8. `WorkspaceState`
9. `Mt5TradeDeal`
10. `RiskSnapshot`
11. `DashboardModel`
12. `BillingState`

## Typing rules

- separate persistence records from frontend domain objects;
- prefer explicit unions for route/tab/status values;
- treat large numeric identifiers as strings when the current contract already does so;
- keep timestamp fields as ISO strings at the contract edge;
- keep redacted fixtures alongside real-shape expectations.

## Acceptance checklist

- [ ] The first typed contracts are named and scoped.
- [ ] Fixture families exist on paper before extraction starts.
- [ ] Persistence records are separated from domain objects.
- [ ] Risk and dashboard derived models are treated as separate typed layers.
- [ ] No route implementation has to invent its own ad-hoc object shape.
