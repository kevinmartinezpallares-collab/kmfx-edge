# KMFX Next.js Scaffold File Spec

Status: planning only. No runtime changes.
Last updated: 2026-05-14
Purpose: define the intended file tree and responsibility boundaries for the future `apps/web-next` implementation.

## Goal

When implementation starts, the new app should not grow organically without structure.

This document fixes:

- where each concern should live;
- which files exist in Wave 1;
- which folders own shell, routes, domain UI, contracts, adapters, and fixtures.

## Design principles

- route files stay thin
- shell components stay reusable and route-agnostic
- domain logic lives outside component folders
- contracts and fixtures are first-class
- no DOM-writing legacy module should be imported into route components

## Top-level target tree

```text
apps/web-next/
  package.json
  tsconfig.json
  next.config.ts
  eslint.config.mjs
  components.json
  src/
    app/
    components/
    features/
    lib/
    hooks/
  fixtures/
```

## `src/app` responsibilities

### Purpose

- App Router entrypoints
- layout composition
- route-level orchestration
- route-local loading/error boundaries

### Target tree

```text
src/app/
  layout.tsx
  page.tsx
  globals.css
  (workspace)/
    layout.tsx
    dashboard/
      page.tsx
      loading.tsx
      error.tsx
    accounts/
      page.tsx
      loading.tsx
      error.tsx
    risk/
      page.tsx
      loading.tsx
      error.tsx
    analytics/
      page.tsx
      daily/page.tsx
      hourly/page.tsx
      risk/page.tsx
    trades/
      page.tsx
    calendar/
      page.tsx
    journal/
      page.tsx
      review-queue/page.tsx
      entries/page.tsx
      ai-review/page.tsx
    strategies/
      page.tsx
      backtest-vs-real/page.tsx
      portfolio/page.tsx
    capital/
      page.tsx
    market/
      page.tsx
    execution/
      page.tsx
    tools/
      calculator/page.tsx
    funding/
      journeys/
        [journeyId]/
          page.tsx
          phase-1/page.tsx
          phase-2/page.tsx
          funded/page.tsx
          trades/page.tsx
          risk/page.tsx
          payouts/page.tsx
          timeline/page.tsx
        page.tsx
      accounts/page.tsx
      page.tsx
      rules/page.tsx
      payouts/page.tsx
    study/
      page.tsx
    settings/
      page.tsx
    debug/
      page.tsx
```

### File responsibilities

- `layout.tsx`
  App-wide fonts, theme root, providers
- `page.tsx`
  redirect or landing behavior
- `(workspace)/layout.tsx`
  app shell composition for authenticated/product surfaces
- route `page.tsx`
  minimal orchestration of data + section component
- route `loading.tsx`
  route-specific skeletons
- route `error.tsx`
  route-specific failure UI

## `src/components` responsibilities

### Purpose

- reusable UI pieces
- route-agnostic app shell pieces
- domain-oriented presentational components

### Target tree

```text
src/components/
  app/
    app-shell.tsx
    workspace-sidebar.tsx
    workspace-topbar.tsx
    workspace-status-strip.tsx
    workspace-mobile-nav.tsx
    workspace-user-menu.tsx
    command-entry.tsx
  domain/
    metric-card.tsx
    chart-panel.tsx
    account-identity.tsx
    data-freshness-notice.tsx
    authority-notice.tsx
    risk-status-badge.tsx
    market-pulse-table.tsx
    exposure-panel.tsx
  charts/
    liveline-chart.tsx
    sparkline-chart.tsx
    analytics-line-chart.tsx
  ui/
    ...
  uitripled/
    command-palette.tsx
    animated-progress.tsx
    native-counter-up.tsx
    shimmer-button.tsx
```

### Folder rules

- `app/` owns shell-level structure
- `domain/` owns KMFX-specific presentational vocabulary
- `charts/` owns rendering wrappers around chart libraries
- `ui/` holds baseline shadcn primitives
- `uitripled/` holds approved imported/adapted TripleD components

## `src/features` responsibilities

### Purpose

- feature-specific contracts
- feature-specific selectors and view-model builders
- route section components that belong to one feature

### Target tree

```text
src/features/
  dashboard/
    contracts/
    domain/
    components/
  accounts/
    contracts/
    domain/
    components/
  risk/
    contracts/
    domain/
    components/
  analytics/
    contracts/
    domain/
    components/
  trades/
    contracts/
    domain/
    components/
  calendar/
    contracts/
    domain/
    components/
  journal/
    contracts/
    domain/
    components/
  strategies/
    contracts/
    domain/
    components/
```

### Feature rules

- feature `contracts/` define feature-local typed shapes
- feature `domain/` holds pure feature logic
- feature `components/` holds route section components owned by that feature

## `src/lib` responsibilities

### Purpose

- shared contracts
- data adapters
- API clients
- framework-agnostic helpers
- store and preferences infrastructure

### Target tree

```text
src/lib/
  api/
    kmfx-api-config.ts
    accounts-live-snapshot-client.ts
  contracts/
    backend-records.ts
    backend-entities.ts
    account.ts
    workspace-state.ts
    account-runtime.ts
    live-snapshot.ts
    mt5-transport.ts
    billing-state.ts
  data/
    adapters/
      internal-model-adapter.ts
      mock-account-adapter.ts
      mt5-account-adapter.ts
    sources/
      mock-workspace.ts
      mock-accounts.ts
  domain/
    account-selectors.ts
    status-meta.ts
    integrity-check.ts
    chart-geometry.ts
  formatters/
    money.ts
    date.ts
    percent.ts
  store/
    workspace-store.ts
    preferences-store.ts
  utils.ts
```

### Lib rules

- `lib/contracts` must not contain JSX
- `lib/data` should stay testable without React
- `lib/api` should isolate client/server boundaries clearly
- `lib/store` should not recreate legacy `activePage` routing assumptions

## `src/hooks` responsibilities

### Purpose

- genuinely reusable client-side hooks
- no feature dumping ground

### Likely hooks

- `use-command-palette.ts`
- `use-current-account.ts`
- `use-data-freshness.ts`
- `use-mobile-nav.ts`
- `use-theme-preference.ts`

## `fixtures` responsibilities

### Purpose

- stable typed payloads for development and tests

### Target tree

```text
fixtures/
  mock/
    workspace-minimal.json
    workspace-rich.json
    billing-entitlements.json
  live/
    live-snapshot-redacted.json
    mt5-account-normalized.json
    risk-snapshot-redacted.json
```

## Wave 1 required files

These should exist before deeper route work starts:

- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/app/(workspace)/layout.tsx`
- `src/app/(workspace)/dashboard/page.tsx`
- `src/app/(workspace)/accounts/page.tsx`
- `src/app/(workspace)/risk/page.tsx`
- `src/app/(workspace)/analytics/page.tsx`
- `src/components/app/app-shell.tsx`
- `src/components/app/workspace-sidebar.tsx`
- `src/components/app/workspace-topbar.tsx`
- `src/components/app/workspace-mobile-nav.tsx`
- `src/components/app/command-entry.tsx`
- `src/components/domain/metric-card.tsx`
- `src/components/domain/chart-panel.tsx`
- `src/components/domain/account-identity.tsx`
- `src/components/domain/risk-status-badge.tsx`
- `src/components/domain/data-freshness-notice.tsx`
- `src/lib/contracts/account.ts`
- `src/lib/contracts/workspace-state.ts`
- `src/lib/data/sources/mock-workspace.ts`
- `src/lib/data/sources/mock-accounts.ts`

## Anti-patterns to avoid

- putting selectors inside route files
- putting adapters inside component folders
- putting shell code inside feature folders
- using one giant `types.ts` for the whole app
- recreating legacy DOM rendering patterns inside React

## Acceptance checklist

- [ ] Every major concern has a stable home.
- [ ] Route files stay thin.
- [ ] Shell code is separated from feature code.
- [ ] Contracts, adapters, and fixtures are first-class.
- [ ] Wave 1 can start without inventing structure during implementation.
