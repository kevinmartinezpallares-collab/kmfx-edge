# KMFX Next.js Ownership Map

Status: planning only. No runtime changes.
Last updated: 2026-05-14
Purpose: define responsibility boundaries for the future implementation so route, shell, and domain work can progress without stepping on each other.

## Why this matters

Even if one person implements most of the migration, a clear ownership map reduces confusion and keeps the architecture coherent.

It answers:

- which files belong to the shell;
- which files belong to shared contracts and adapters;
- which features own which route surfaces;
- where future parallel work could split safely.

## Ownership zones

### Zone A - App shell

Owns:

- `src/app/(workspace)/layout.tsx`
- `src/components/app/app-shell.tsx`
- `src/components/app/workspace-sidebar.tsx`
- `src/components/app/workspace-topbar.tsx`
- `src/components/app/workspace-status-strip.tsx`
- `src/components/app/workspace-mobile-nav.tsx`
- `src/components/app/workspace-user-menu.tsx`
- `src/components/app/command-entry.tsx`

Responsibilities:

- route-agnostic shell composition
- navigation presentation
- responsive shell behavior
- account/global context surfaces

Must not own:

- route-specific business logic
- MT5 normalization
- analytics or risk selectors

### Zone B - Shared contracts and data layer

Owns:

- `src/lib/contracts/**`
- `src/lib/data/**`
- `src/lib/api/**`
- `src/lib/domain/**`
- `src/lib/formatters/**`
- `fixtures/**`

Responsibilities:

- typed contracts
- adapters
- mock and redacted live fixtures
- shared selectors and formatters
- API client boundaries

Must not own:

- page layout decisions
- shell composition
- route presentation details

### Zone C - Dashboard feature

Owns:

- `src/features/dashboard/**`
- `src/app/(workspace)/dashboard/page.tsx`

Responsibilities:

- dashboard view-model contract
- dashboard section composition
- KPI panels
- hero chart + summary surfaces

Depends on:

- shell
- shared contracts
- shared selectors

### Zone D - Accounts feature

Owns:

- `src/features/accounts/**`
- `src/app/(workspace)/accounts/page.tsx`

Responsibilities:

- account identity display
- freshness and connection state display
- account list/read-only route behavior

Depends on:

- account runtime
- live snapshot client
- entitlement-aware read state

### Zone E - Risk feature

Owns:

- `src/features/risk/**`
- `src/app/(workspace)/risk/**`

Responsibilities:

- risk view-models
- exposure/readability surfaces
- risk-specific tables and summaries

Depends heavily on:

- risk selectors
- risk alerts
- risk snapshot contracts

### Zone F - Analytics feature

Owns:

- `src/features/analytics/**`
- `src/app/(workspace)/analytics/**`

Responsibilities:

- analytics route and subroutes
- tab-based analytical reading
- chart composition for daily/hourly/risk views

### Zone G - Secondary route features

Owns:

- `src/features/trades/**`
- `src/features/calendar/**`
- `src/features/journal/**`
- `src/features/strategies/**`
- `src/features/market/**`
- `src/features/capital/**`

Responsibilities:

- route-specific presentation after Wave 1

## Route ownership map

| Route | Primary owner | Secondary dependencies |
| --- | --- | --- |
| `/dashboard` | Dashboard feature | shell, selectors, account context, charts |
| `/accounts` | Accounts feature | shell, live snapshot client, account runtime |
| `/risk` | Risk feature | shell, risk selectors, risk snapshot contracts |
| `/analytics` | Analytics feature | shell, chart wrappers, analytics contracts |
| `/analytics/daily` | Analytics feature | analytics domain |
| `/analytics/hourly` | Analytics feature | analytics domain |
| `/analytics/risk` | Analytics feature + Risk dependency | risk selectors, analytics shell |
| `/trades` | Trades feature | shared contracts, later journal/discipline links |
| `/calendar` | Calendar feature | chart specs, date helpers |
| `/journal` | Journal feature | shared contracts, later settings/auth dependencies |
| `/strategies` | Strategies feature | backtest comparison data, shared contracts |
| `/capital` | Capital feature | accounts + portfolio data |
| `/market` | Market feature | shared formatters |
| `/execution` | Discipline/execution feature | interactive logic, later phase |
| `/tools/calculator` | Tools feature | risk-engine domain, formatters |
| `/funding` | Funding feature | funding contracts and summaries |
| `/settings` | Settings feature | auth/config layer, theme preference |
| `/debug` | Debug/admin feature | admin gating, diagnostic data |

## Shared ownership rules

### Shell can depend on

- route metadata
- current account summary
- user menu state
- mobile nav state

### Shell must not depend on

- dashboard-specific sections
- risk tables
- route-level feature state

### Features can depend on

- shell wrappers
- shared contracts
- shared adapters
- shared formatters

### Features must not depend on

- other features' internal components unless explicitly elevated to shared domain UI

## Safe parallelization guidance for later

If implementation is split in parallel later, the safest early division is:

- Worker A: shell and route scaffolding
- Worker B: shared contracts and fixtures
- Worker C: dashboard + analytics read-only surfaces
- Worker D: accounts + risk read-only surfaces

Because:

- write scopes are relatively separable
- they align with the Wave 1 route strategy

## Conflict prevention rules

- shell files are owned by the shell zone
- contracts/adapters live under shared layer only
- route page files should mostly compose feature components, not own deep logic
- any component reused by multiple features should be promoted to `src/components/domain`

## Acceptance checklist

- [ ] Every Wave 1 route has a clear primary owner.
- [ ] Shell files are separated from feature files.
- [ ] Shared contracts and adapters have a single clear home.
- [ ] Reusable components have a promotion path.
- [ ] Future parallel implementation can split without constant merge conflict.
