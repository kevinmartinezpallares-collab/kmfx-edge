# KMFX Edge Next.js UI Reference Roadmap

Status: planning only. No runtime changes.
Last updated: 2026-05-14
Scope: define the visual and structural target for the future Next.js frontend without touching the current production app.

## Purpose

This document locks the future UI migration target before implementation starts, so the Next.js build does not drift into a generic dashboard or break the go-live track.

It complements, and does not replace:

- `docs/production-go-live-checklist.md`
- `docs/final-user-go-live-audit.md`
- `docs/nextjs-migration-blueprint.md`
- `docs/nextjs-master-migration-roadmap.md`

## Current rule

Until go-live is fully closed:

- do not replace the current vanilla runtime;
- do not mix critical production fixes with the Next.js migration track;
- do not modify billing, live MT5 flows, launcher behavior, or sensitive auth contracts as part of the UI migration.

## Locked visual references

### Primary code reference

Reference project:
`/Users/conlopuestoyaloloco/Desktop/tripled-trading-dashboard`

Local URL:
`http://localhost:3042/`

This project is not "inspiration only". It is the direct visual and structural reference for the future KMFX Next.js dashboard.

Files that must be reviewed before implementing:

- `src/components/trading/trading-dashboard.tsx`
- `src/app/page.tsx`
- `src/app/globals.css`
- `src/components/uitripled/`
- `src/components/ui/`

### External UI sources

Priority order for sourcing UI:

1. Efferd blocks for the shell/layout when compatible with the KMFX navigation model.
2. UI TripleD components when a polished component already exists and fits the product.
3. shadcn/ui primitives as the stable fallback.
4. KMFX custom domain components on top of shadcn, not raw ad-hoc markup.

## Current shell decision

Decision updated on 2026-05-18:

- the effective shell baseline is the KMFX-owned shell derived from the real `tripled-trading-dashboard` reference project;
- Efferd `app-shell-5` is no longer the active product baseline because it drifted too far from the desired trading-desk direction;
- Efferd blocks can still be evaluated for isolated surfaces, but they must not override the established KMFX IA, visual density, or route meaning.

Why the KMFX-owned shell:

- it matches the direct mockup/reference the user approved;
- it preserves the dark neutral, high-end trading workspace direction;
- it keeps the sidebar, topbar, account switcher, and dense route content aligned with the actual product;
- it avoids rebuilding around a third-party shell that would force us to undo route/content decisions later.

Fallback rule:

- do not reintroduce Efferd app-shell blocks unless a specific component solves a focused problem without changing the KMFX navigation model.

## Auth screen decision

Decision noted on 2026-05-18:

- Efferd `auth-13` is the preferred visual baseline for the future sign-in page.
- Source: `https://efferd.com/blocks/auth`
- Registry block: `@efferd/auth-13`

Why `auth-13`:

- minimal sign-in layout;
- logo header;
- clean fields;
- closer to KMFX's premium workspace direction than decorative auth blocks.

Implementation rule:

- do not connect or rewrite sensitive auth behavior during visual migration;
- use the block as the visual shell only after the auth/config wrapper is ready;
- preserve Supabase/auth contracts and security gates from the production roadmap.

## Efferd feature blocks decision

Decision noted on 2026-05-19:

- Efferd `features` blocks can be used as references for public/product explanation surfaces.
- Source: `https://efferd.com/blocks/features`
- Priority starts at `features-6` and later blocks, because they are more mature for premium product storytelling.

Usage rule:

- use these blocks for landing, onboarding, pricing, feature explanation, RiskGuard education, News Guard explanation, or post-login product tours;
- do not use feature blocks inside the live trading dashboard unless the block is reduced to a small, non-distracting product note.

## Bklit chart direction candidate

Decision noted on 2026-05-19:

- Bklit UI `mono` studio preset is approved as a candidate visual reference for chart-heavy analytical surfaces.
- Source: `https://ui.bklit.com/studio?preset=mono`
- Candidate component: `Composed Chart`
- Component docs: `https://ui.bklit.com/docs/components/composed-chart`

Why it fits KMFX:

- the `mono` preset is closer to the neutral, black/white institutional direction than colorful dashboard kits;
- `Composed Chart` can combine bars, lines, and areas on the same time axis;
- this is useful when one screen needs to compare result, activity, and risk without creating multiple separate widgets.

Recommended placements:

- `Insights / Horario`: bars for operations, line for PnL, optional area for win rate or expectancy;
- `Calendario`: bars for daily PnL, line for accumulated return, optional area for drawdown;
- `RiskGuard`: bars for open risk, line for drawdown, shaded area for alert/stop zones;
- `Panel`: only as one large period summary chart, never as a small decorative KPI chart.

Implementation rule:

- do not install or introduce Bklit globally until a route needs it and the visual result is reviewed;
- if adopted, wrap it behind KMFX chart components such as `SessionComposedChart`, `CalendarReturnChart`, or `RiskPressureChart`;
- keep colors neutral-first with semantic accents only for positive, negative, warning, and selected states;
- do not replace `liveline` hero charts where the live-line interaction is the main visual identity.

## Resizable trading panel decision

Decision noted on 2026-05-19:

- `react-resizable-panels` is already installed and available through `components/ui/resizable.tsx`.
- A chart plus movable side panel fits KMFX, but not as a default `Panel` summary block in V1.

Recommended placement:

- `/market` for chart + market context;
- `/execution` for chart + pre-trade ticket or lot/risk calculator;
- future advanced workspace when MT5 write/enforcement flows are safe.

Do not place an order ticket in `Panel` until execution flows, guardrails, and MT5 write safety are explicitly in scope.

## Visual direction to preserve

The future KMFX dashboard should preserve these traits from the reference project:

- Next.js App Router structure
- shadcn/ui composition
- real UI TripleD components where useful
- `liveline` for premium lightweight charts where appropriate
- dark mode by default
- black, graphite, zinc, and neutral gray palette
- no blue-led, neon-green, or attention-seeking accents as the core theme
- navigable sidebar
- dense, high-end, Apple-like product presentation
- responsive desktop/mobile behavior
- calm motion, not decorative motion spam

## KMFX-specific adaptation rules

The reference project is a destination, not a blind copy.

Mandatory rules:

- do not port mock trading data into KMFX production code;
- do not copy sections that do not map to real KMFX product capabilities;
- do not rewrite stable domain logic only to match the mockup;
- do not replace current data contracts until the new route already renders the same real state safely;
- do not ship animated or premium surfaces if they reduce readability of trading metrics.

## What the reference project already proves

The local reference project already validates the stack and direction we want:

- Next.js 16 + React 19 + Tailwind 4
- shadcn-style `ui/` primitives
- custom `uitripled/` components layered on top
- `liveline` integrated in a real dashboard surface
- dark-mode token system in `src/app/globals.css`
- sidebar workspace layout with multiple trading sections

Concrete sections already present in the reference:

- Mesa
- Mercados
- Cartera
- Riesgo
- Estrategias
- Diario
- Componentes

## Parts to transfer from the reference project

These are the main ideas to carry into KMFX:

### 1. App shell

Transfer:

- sidebar-based workspace layout
- topbar with compact controls
- `SidebarProvider`, `Sidebar`, `SidebarInset`, `SidebarRail`
- desktop-first density with mobile-safe fallback

Adapt for KMFX:

- use KMFX route map and permissions
- preserve account switching and live-status context
- keep admin-only areas hidden behind KMFX entitlement rules

### 2. Dashboard composition

Transfer:

- cards with compact metadata
- split layout between primary chart and secondary panel
- resizable panels where they improve analysis density
- premium watchlist/table surfaces

Adapt for KMFX:

- replace mock order ticket and fake data blocks with real KMFX modules only when the route is ready
- map cards to real metrics from the current selectors and registries

### 3. Risk and analytics surfaces

Transfer:

- dense card grids
- progress and constraint panels
- chart-heavy sections with clear hierarchy
- subdued accent treatment

Adapt for KMFX:

- preserve metric authority, formula, confidence, and policy contract
- never style inferred/default policy as if it were a real user limit

### 4. Journal and strategy sections

Transfer:

- table-driven journal layout
- compact forms inside cards
- side panels for supporting actions

Adapt for KMFX:

- keep the real KMFX journal/disciplines workflows and backend contract
- do not flatten domain concepts into mock labels

### 5. TripleD micro-components

Promising candidates for evaluation:

- `command-palette-shadcnui.tsx`
- `shimmer-button-shadcnui.tsx`
- `ripple-click-button-shadcnui.tsx`
- `drag-to-confirm-slider-shadcnui.tsx`
- `reactive-background-grid-shadcnui.tsx`
- `spotlight-section-shadcnui.tsx`
- `animated-progress-shadcnui.tsx`
- `glass-wallet-card-shadcnui.tsx`

Adoption rule:

- adopt only components that strengthen clarity and product feel;
- reject components that look impressive but weaken trading readability or performance.

## Component sourcing policy

For each needed surface:

1. Check whether Efferd already provides the shell or layout block.
2. Check whether UI TripleD provides a real reusable component.
3. Fall back to shadcn primitives.
4. Wrap the result in KMFX domain components.

Never:

- build a styled `div` when a stable primitive exists;
- copy a third-party component without reviewing its accessibility and dependency cost;
- let external component naming become the KMFX product language.

## Planned route order

The migration should begin with routes that are visually important but operationally safer.

### Wave 1

- `/dashboard`
- `/accounts`
- `/risk`
- `/analytics`

Goal:

- read-only, visually complete, hooked to safe real data where already stable

### Wave 2

- `/calendar`
- `/trades`
- `/journal`
- `/strategies`
- `/capital`
- `/market`

Goal:

- preserve product structure and migrate richer surfaces after the shell and data adapters prove stable

### Wave 3

- `/settings`
- gated admin/debug routes
- advanced interaction panels

Goal:

- migrate sensitive preference/auth and privileged surfaces only after the base app is stable

## Pre-implementation checklist

- [x] Confirm there is a direct code reference project for the future UI.
- [x] Confirm the reference project runs locally on `http://localhost:3042/`.
- [x] Confirm the reference uses Next.js App Router.
- [x] Confirm the reference uses shadcn-style UI primitives.
- [x] Confirm the reference includes real TripleD custom components.
- [x] Confirm the reference includes `liveline`.
- [x] Choose shell baseline: KMFX-owned shell based on `tripled-trading-dashboard`.
- [ ] Inventory which Efferd components are worth porting as isolated blocks.
- [ ] Inventory which UI TripleD components should be adopted, adapted, or rejected.
- [ ] Map KMFX current route tree to the future Next route tree one by one.
- [ ] Split current vanilla modules into domain/data/UI migration buckets.
- [ ] Define the first read-only route to ship in the Next app.

## Implementation roadmap

### Phase A - Design lock

- [x] Freeze the visual source hierarchy: KMFX-owned shell -> TripleD components -> shadcn fallback -> Efferd isolated blocks when approved.
- [x] Retire `app-shell-5` as active shell baseline after visual review.
- [ ] Document approved palette, spacing density, radius, borders, and motion rules.
- [ ] Define which TripleD effects are premium enough to keep and which should be dropped.

Exit criteria:

- the migration team can build without re-debating the visual direction on every route.

### Phase B - Next foundation

- [ ] Create `apps/web-next`.
- [ ] Scaffold Next App Router with TypeScript, Tailwind 4, ESLint.
- [ ] Initialize shadcn/ui correctly for the new app.
- [ ] Apply the required font/token fixes for Tailwind 4 + shadcn.
- [ ] Add base dependencies needed by the locked direction.
- [ ] Create `globals.css` tokens for KMFX dark mode.

Exit criteria:

- a blank but production-shaped Next app exists without touching the current runtime.

### Phase C - Shell and navigation

- [x] Implement the chosen shell.
- [x] Build KMFX sidebar config from the real route model.
- [x] Add topbar, breadcrumb/status area, and mobile navigation strategy.
- [x] Preserve account context and entitlement-aware nav visibility.
- [ ] Validate desktop and mobile navigation before route migration.

Current shell notes:

- user menu follows the shadcn `sidebar-07` pattern;
- subscription/plan appears as a read-only settings surface only;
- no billing route handlers or payment portal integration are part of this pass.

Exit criteria:

- the app shell feels like the future product before route content is migrated.

### Phase D - Domain extraction

- [ ] Move reusable selectors/formatters into typed domain modules.
- [ ] Isolate live snapshot client/config from DOM-bound rendering code.
- [ ] Define safe read-only adapters for dashboard/risk/accounts.
- [ ] Add tests around critical selectors before UI reuse.

Exit criteria:

- real KMFX data can feed new routes without porting legacy HTML rendering.

### Phase E - First routes

- [ ] Implement `/dashboard` as the first visual flagship route.
- [ ] Port watchlist, metric cards, main chart area, and account summary using real KMFX data where stable.
- [ ] Implement `/accounts` read-only.
- [ ] Implement `/risk` read-only.
- [ ] Implement `/analytics` read-only.

Exit criteria:

- KMFX has a credible Next.js read-only workspace that already matches the intended design language.

### Phase F - Secondary routes

- [ ] Migrate journal, strategies, calendar, trades, capital, and market.
- [ ] Replace mock controls with real flows only when the domain contract is already understood.
- [ ] Keep component quality consistent with the shell.

Exit criteria:

- the product feels cohesive, not like a shell plus leftover pages.

### Phase G - Sensitive surfaces

- [ ] Migrate settings with care.
- [ ] Reconnect auth/config surfaces without rewriting their contracts prematurely.
- [ ] Migrate admin/debug views behind the proper gates.

Exit criteria:

- all user-visible routes are ready without destabilizing auth, billing, or operations.

## Constraints that remain in force

- No Stripe rewrite in the UI migration phase.
- No new billing route handlers as part of the first Next pass.
- No launcher/EA workflow redesign inside the migration.
- No direct changes to MT5 operational flows for visual reasons.
- No cutover until the Next app has a route-by-route acceptance checklist.

## Handoff requirement for any future migration chat

Before implementation starts, the migration chat must first:

1. open the reference project;
2. explain which parts will be transferred to KMFX;
3. justify which parts will be adapted or rejected;
4. confirm that real KMFX logic will not be broken to imitate the mockup.

## Acceptance standard for the future Next UI

The migration is on the right path only if:

- it visibly matches the premium dark trading desk direction;
- it feels denser and cleaner than the current vanilla app;
- it preserves real KMFX product logic;
- it does not contaminate the go-live track;
- it remains maintainable without cloning third-party markup blindly.
