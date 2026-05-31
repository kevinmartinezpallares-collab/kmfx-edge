# KMFX Next.js Mobile Responsive Spec

Status: planning only. No runtime changes.
Last updated: 2026-05-14
Purpose: define how the future Next.js app should behave as a responsive mobile-first-capable product without degrading the desktop trading workspace.

## Goal

The future app should work like a serious mobile product, not like a desktop dashboard squeezed into a narrow viewport.

That means:

- responsive from the start
- app-like shell behavior
- clear mobile priorities
- route layouts that intentionally recompose for smaller screens

## Reference signals already observed

The TripleD reference already shows useful responsive patterns:

- desktop shell with `SidebarProvider` and `SidebarInset`
- sticky topbar
- desktop-only resizable split panels
- mobile fallback layouts using `xl:hidden`
- scroll container sized with `100svh`

Relevant source points:

- [layout.tsx](/Users/conlopuestoyaloloco/Desktop/tripled-trading-dashboard/src/app/layout.tsx:26)
- [trading-dashboard.tsx](/Users/conlopuestoyaloloco/Desktop/tripled-trading-dashboard/src/components/trading/trading-dashboard.tsx:662)
- [trading-dashboard.tsx](/Users/conlopuestoyaloloco/Desktop/tripled-trading-dashboard/src/components/trading/trading-dashboard.tsx:695)
- [trading-dashboard.tsx](/Users/conlopuestoyaloloco/Desktop/tripled-trading-dashboard/src/components/trading/trading-dashboard.tsx:1331)

## Core mobile philosophy

### Desktop

Desktop is the richest workspace:

- denser layouts
- sidebar always available
- split panels
- richer comparative surfaces

### Mobile

Mobile is not a degraded copy.

It should be:

- focused
- route-prioritized
- one-handed where possible
- legible at a glance
- respectful of vertical scrolling patterns

## Shell behavior on mobile

### Sidebar

Desktop:

- persistent sidebar

Mobile:

- sidebar becomes sheet/drawer
- open on demand
- no permanent left rail

### Topbar

Desktop:

- title, actions, user/account context

Mobile:

- compact title
- one primary trigger for nav or command
- only the highest-signal actions visible

### Status strip

Desktop:

- can show compact state and context

Mobile:

- keep only the most important state
- remove redundant status noise

## Mobile route priorities

The mobile shell should optimize first for:

- `/dashboard`
- `/risk`
- `/accounts`
- `/journal`

Secondarily:

- `/analytics`
- `/trades`
- `/calendar`

Lower mobile priority:

- `/funding`
- `/debug`
- `/study`
- advanced strategy/funding subpages

## Layout rules

### Cards

On mobile:

- one-column by default
- tighter padding than desktop
- preserve hierarchy, not all desktop density

### Tables

Do not blindly render wide tables full-width on small screens.

Preferred options:

- prioritize a subset of columns
- stack critical facts
- allow contained horizontal scrolling only when necessary

### Split panels

Desktop-only where useful.

On mobile:

- convert split panels to vertical stacked sections
- maintain reading order by importance

### Charts

On mobile:

- keep hero charts
- reduce peripheral chart duplication
- preserve clarity over density

## Responsive breakpoints philosophy

Do not optimize only for one breakpoint.

Think in these bands:

- phone portrait
- phone landscape
- tablet portrait
- tablet landscape / small laptop
- desktop
- wide desktop

## Mobile navigation model

Recommended structure:

- top-left or topbar trigger for main nav
- optional bottom quick nav only if it remains calm and essential
- command/search entry should remain reachable

Preferred one-tap destinations:

- Dashboard
- Risk
- Accounts
- Journal or Analytics

## Safe-area and viewport rules

Important for app-like behavior:

- use `svh`/modern viewport sizing carefully
- respect iOS safe areas
- avoid content hidden behind browser UI
- avoid fixed bottom elements that collide with gestures

## Scroll behavior

Preferred:

- one main vertical scroll container per route
- sticky topbar when useful
- no nested scrolling unless strongly justified

Avoid:

- multiple competing scroll regions on mobile
- tiny scrollable panes inside cards

## Touch target rules

On mobile:

- all primary interactive elements should be comfortably tappable
- dense desktop controls must be simplified if needed
- dropdowns and sheets must be touch-friendly

## Mobile-specific route guidance

### `/dashboard`

Should become:

- hero metrics
- main chart
- one or two secondary sections

Should not become:

- a dense control room with too many simultaneous panels

### `/accounts`

Should become:

- account identity
- connection state
- freshness
- simple account list/status surfaces

### `/risk`

Should become:

- high-clarity warnings
- exposure summary
- concise metric blocks

### `/analytics`

Should become:

- tab-led reading
- one primary chart at a time
- reduced multi-panel competition

## Theme and mobile relationship

Dark mode should remain the primary mobile experience too.

Reason:

- better perceived polish
- lower glare
- more aligned with the chosen KMFX desk identity

## PWA/app-like quality bar

The app should feel capable of becoming a strong mobile web-app surface.

That means:

- stable shell
- safe viewport handling
- strong touch targets
- coherent navigation
- no desktop-only assumptions in route structure

## Responsive review checklist

- [ ] Sidebar collapses cleanly into a mobile sheet/drawer
- [ ] Topbar stays compact on narrow screens
- [ ] Core routes remain readable as one-column flows
- [ ] Desktop split panels collapse into sensible stacked order
- [ ] Tables degrade intentionally, not accidentally
- [ ] Charts remain readable on small screens
- [ ] No essential action becomes too small to tap
- [ ] Scroll behavior remains simple
- [ ] The product still feels premium on mobile

## Final stance

The future Next app should be:

- desktop-strong
- mobile-serious
- responsive by design

Not:

- desktop-only
- mobile-afterthought
- a generic responsive admin template
