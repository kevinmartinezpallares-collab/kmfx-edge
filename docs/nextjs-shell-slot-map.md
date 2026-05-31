# KMFX Next.js Shell Slot Map

Status: planning only. No runtime changes.
Last updated: 2026-05-19
Purpose: map the KMFX-owned shell layout model to the real KMFX product structure.

## Chosen shell

- KMFX-owned shell based on `tripled-trading-dashboard`, shadcn/ui, UI TripleD, and selected Efferd/shadcn patterns.

## Shell intent

The shell should feel like a premium trading workspace, not a generic SaaS admin panel. Efferd `app-shell-5` is no longer the active shell baseline; useful pieces can still be adapted in isolation.

That means:

- navigation must be fast and dense;
- account context must always feel present;
- live/sync state must be visible without overpowering metrics;
- mobile must remain usable without cloning the desktop chrome.

## Primary shell slots

The future shell should be decomposed into these KMFX-owned slots:

- `WorkspaceSidebar`
- `WorkspaceTopbar`
- `WorkspaceContent`
- `WorkspaceStatusStrip`
- `WorkspaceMobileNav`
- `WorkspaceUserMenu`

## Sidebar map

### Sidebar header

Recommended contents:

- KMFX brand mark
- environment label if needed
- current workspace/product label

Avoid:

- marketing copy
- decorative badges that do not communicate product state

### Sidebar primary navigation

Suggested primary group:

- `Dashboard`
- `Risk`
- `Accounts`
- `Analytics`
- `Trades`
- `Journal`

These are the highest-value working surfaces and should stay easy to reach.

### Sidebar secondary navigation

Suggested secondary group:

- `Calendar`
- `Strategies`
- `Capital`
- `Market`
- `Tools`
- `Settings`

These routes are still important, but they are less critical than the core operating loop.

### Sidebar gated/admin navigation

Only show when entitled:

- `Debug`
- admin-only diagnostics
- raw bridge inspection

Rule:

- admin visibility must come from real KMFX permission logic, never from visual-only conditions.

### Sidebar footer

Recommended contents:

- compact sync action or status CTA
- account context summary
- user menu trigger

Do not place:

- dense settings forms
- billing-heavy controls
- noisy promotional blocks

## Topbar map

### Left zone

Recommended contents:

- breadcrumb or section title
- optional account label
- optional freshness/status indicator

### Center zone

Recommended contents:

- command/search entry point

Use cases:

- jump to route
- search symbol
- switch account
- open quick actions

### Right zone

Recommended contents:

- notifications only if backed by a real KMFX event model
- account switcher or account identity chip
- user menu

Avoid:

- generic vanity widgets
- placeholder counters

## Status strip map

`app-shell-5` suggests a workspace with strip-like secondary status surfaces. For KMFX, that strip should be restrained and meaningful.

Possible uses:

- last sync time
- active account
- broker/server summary
- risk state summary
- plan/access state when relevant

Avoid:

- fake “latest changes” rows with no real data source
- duplicated metrics already shown in the route body

## Mobile behavior

Desktop and mobile should not be literal clones.

### Mobile shell strategy

- keep the current route content central
- collapse secondary navigation into drawer/sheet
- keep topbar compact
- preserve quick access to dashboard, risk, accounts, and journal

### Mobile priority routes

The easiest routes to keep one-tap reachable on mobile:

- `Dashboard`
- `Risk`
- `Accounts`
- `Journal`

Everything else can live behind a sheet or more-menu pattern.

### Mobile anti-patterns

Avoid:

- overstuffed topbars
- desktop-width breadcrumbs consuming space
- always-on decorative status strips

## Wave 1 shell-route pairing

When the Next app begins, the shell should first support these routes cleanly:

- `/dashboard`
- `/accounts`
- `/risk`
- `/analytics`

The shell is acceptable only if these four routes already feel coherent inside it.

## Route-to-shell behavior notes

### `/dashboard`

Should emphasize:

- hero chart area
- account context
- watchlist or market pulse
- compact KPIs

### `/accounts`

Should emphasize:

- active account identity
- broker/server/login context
- connection state
- entitlement-aware actions

### `/risk`

Should emphasize:

- constraint readability
- exposure grouping
- warning hierarchy
- zero decorative interference

### `/analytics`

Should emphasize:

- tabs or segmented views
- dense but calm charting surfaces
- comparison layouts

## Command palette role

The command-style affordance from the earlier Efferd review is still a good fit for KMFX.

Planned uses:

- navigate to routes
- find symbols
- switch account
- open key panels
- trigger safe read-only shortcuts

Not for Wave 1:

- destructive actions
- write flows that need domain confirmation

## Acceptance checklist

- [ ] Sidebar supports KMFX route hierarchy cleanly.
- [ ] Topbar stays compact and high-signal.
- [ ] Account context is visible without dominating the UI.
- [ ] Risk-critical pages are not visually diluted by shell chrome.
- [ ] Mobile still prioritizes the operating loop.
- [ ] Admin-only routes remain properly gated.
- [ ] Shell language feels like KMFX, not like a pasted third-party demo.
