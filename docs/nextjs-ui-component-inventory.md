# KMFX Next.js UI Component Inventory

Status: planning only. No runtime changes.
Last updated: 2026-05-14
Purpose: classify which external UI pieces should be transferred into the future KMFX Next.js app, and how.

## Source priority

1. Efferd `app-shell-5` for the workspace shell.
2. UI TripleD for selected premium components and patterns.
3. shadcn/ui primitives as the default stable base.
4. KMFX domain components built on top.

## Shell decision

Chosen shell:

- Efferd `app-shell-5`

Fallback only if needed:

- Efferd `app-shell-2`

Why:

- `app-shell-5` is the closest fit to a premium trading workspace with denser navigation and command-surface affordances.

## TripleD dashboard structure to transfer

Directly useful structural ideas from the reference dashboard:

- sidebar workspace layout
- compact topbar
- section-based desk navigation
- dense card grids
- primary chart + secondary analysis panel split
- table-first market and journal surfaces
- subdued dark palette with neutral tokens
- controlled motion during section transitions

These map well to the future KMFX routes:

- `Mesa` -> `/dashboard`
- `Mercados` -> `/market`
- `Cartera` -> `/capital` and part of `/accounts`
- `Riesgo` -> `/risk`
- `Estrategias` -> `/strategies`
- `Diario` -> `/journal`

## UI TripleD component classification

### Adopt with high confidence

These components fit the product direction and can improve quality without distorting the domain.

- `command-palette-shadcnui.tsx`
  Reason: useful for quick navigation, symbol search, account switching, and power-user flows.
- `animated-progress-shadcnui.tsx`
  Reason: safe pattern for visualizing limits, exposure, completion, or allocation states.
- `native-counter-up-carbon.tsx`
  Reason: good fit for key metrics if motion is subtle and respects reduced-motion settings.
- `shimmer-button-shadcnui.tsx`
  Reason: acceptable for premium CTAs if used sparingly in non-critical flows.

### Adopt with adaptation

These are promising, but should be changed before entering KMFX.

- `drag-to-confirm-slider-shadcnui.tsx`
  Adaptation: use only for high-intent confirmations such as risky actions or publish/rebalance style flows, not for routine navigation.
- `spotlight-section-shadcnui.tsx`
  Adaptation: use only in hero-like or contextual emphasis surfaces, not behind dense metric panels.
- `reactive-background-grid-shadcnui.tsx`
  Adaptation: use as an optional visual layer in selected analysis panels, not as a default background for core data surfaces.
- `glass-wallet-card-shadcnui.tsx`
  Adaptation: useful as a visual study for premium cards, but should be translated into KMFX card patterns instead of copied literally.
- `ripple-click-button-shadcnui.tsx`
  Adaptation: only if the interaction remains calm and does not feel playful or consumer-like.

### Reject for core KMFX product

These should not be part of the first serious KMFX migration surface.

- `currency-converter-card-shadcnui.tsx`
  Reason: not aligned with the main KMFX product scope right now.
- `animated-sidebar-shadcnui.tsx`
  Reason: the project already has a stronger sidebar direction via Efferd + shadcn sidebar primitives.
- `animated-tabs-shadcnui.tsx`
  Reason: the effect is not necessary; standard shadcn tabs are cleaner for a data-heavy trading app.
- `notification-center-shadcnui.tsx`
  Reason: not wrong in itself, but should not be adopted before KMFX defines its real event model and notification contract.
- `dashboard-shadcnui.tsx`
  Reason: generic dashboard sample, not a strong fit versus the custom trading reference dashboard.
- `stocks-dashboard-shadcnui.tsx`
  Reason: generic showcase/demo, not a direct KMFX product surface.

## shadcn baseline components to rely on

These should be treated as the default stable layer for KMFX Next:

- `sidebar`
- `card`
- `table`
- `tabs`
- `badge`
- `button`
- `input`
- `select`
- `field`
- `textarea`
- `slider`
- `switch`
- `dropdown-menu`
- `sheet`
- `dialog`
- `separator`
- `skeleton`
- `tooltip`
- `progress`
- `resizable`

## KMFX domain components that should exist above the UI layer

Do not expose third-party component names as product architecture. Build KMFX-specific components such as:

- `AppShell`
- `WorkspaceSidebar`
- `WorkspaceTopbar`
- `MetricCard`
- `AccountSwitcher`
- `RiskStatusBadge`
- `DecisionLayer`
- `ChartPanel`
- `MarketPulseTable`
- `ExposurePanel`
- `StrategyHealthCard`
- `JournalEntryPanel`
- `DataFreshnessNotice`
- `AuthorityNotice`

## Liveline usage policy

`liveline` is approved as a chart candidate, but with limits.

Use it first for:

- hero chart areas
- compact sparkline-like market pulse widgets
- strategy/session comparison surfaces

Do not use it blindly for:

- every chart in the app
- places where current KMFX chart semantics require a different representation
- views where motion makes risk interpretation harder

## Bklit chart candidates

Bklit UI is not part of the runtime yet. It is saved as a candidate source for analytical chart components where shadcn/Recharts or `liveline` do not express the data clearly enough.

Reference:

- Studio preset: `https://ui.bklit.com/studio?preset=mono`
- Composed Chart docs: `https://ui.bklit.com/docs/components/composed-chart`

### Candidate: `Composed Chart`

Use when a route needs multiple related series on one shared time axis:

- bars + line + area;
- operations + PnL + win rate;
- daily PnL + accumulated return + drawdown;
- open risk + drawdown + risk zones.

Best-fit KMFX routes:

- `/analytics/hourly` for operations by hour/session against PnL;
- `/calendar` for daily result plus accumulated return;
- `/risk` for risk pressure against drawdown;
- `/dashboard` only if used as a single large period-summary chart.

Adoption rules:

- do not use it for small KPI cards;
- do not add color-heavy presets;
- prefer the `mono` aesthetic and map accents to KMFX semantic colors;
- wrap any adopted chart in KMFX-specific chart components instead of exposing Bklit naming in product code;
- keep `liveline` for primary live/hero chart identity unless `Composed Chart` clearly communicates more.

## Motion policy

Approved motion characteristics:

- short section transitions
- subtle progress/count-up feedback
- restrained shimmer on selected calls to action
- optional spotlight treatment in presentation layers

Avoid:

- motion on every metric card
- decorative animation on primary risk metrics
- backgrounds or hover effects that compete with data reading

## First-pass implementation inventory

### Efferd

- [x] Shell baseline chosen: `app-shell-5`
- [ ] Review which sub-elements of the shell should be kept, simplified, or removed for KMFX
- [ ] Map shell slots to KMFX: nav, account context, sync status, user menu, mobile drawer

### UI TripleD

- [x] Reference project reviewed
- [x] Candidate component list reviewed
- [ ] Build final approved import list for the first Next route set
- [ ] Decide which components will be copied as code, reimplemented, or only used as visual references

### shadcn/ui

- [ ] Confirm the exact component set to initialize on `apps/web-next`
- [ ] Confirm any extra dependencies required by adopted TripleD components

## Recommended first-pass approved set

If implementation started today, the initial approved set would be:

- Efferd `app-shell-5`
- shadcn `sidebar`, `card`, `table`, `tabs`, `badge`, `progress`, `dialog`, `sheet`, `select`, `field`, `button`
- TripleD `command-palette`
- TripleD `animated-progress`
- TripleD `native-counter-up`
- TripleD `shimmer-button`
- `liveline`

The following would stay out of Wave 1 unless a strong product reason appears:

- `glass-wallet-card`
- `reactive-background-grid`
- `spotlight-section`
- `drag-to-confirm-slider`
- `ripple-click-button`

## Acceptance rule

A component should be approved only if it does at least one of these:

- improves hierarchy;
- improves speed of interpretation;
- improves perceived quality without reducing clarity;
- matches a real KMFX product behavior.

If it is only decorative, it should stay out.
