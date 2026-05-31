# KMFX Next.js Wave 1 UI Manifest

Status: planning only. No runtime changes.
Last updated: 2026-05-14
Purpose: define the exact UI building blocks approved for the first real Next.js implementation wave.

## Wave 1 scope

Wave 1 is about:

- establishing the shell;
- proving the visual direction;
- rendering the most important read-only routes;
- avoiding unnecessary component sprawl.

Wave 1 routes:

- `/dashboard`
- `/accounts`
- `/risk`
- `/analytics`
- `/analytics/daily`
- `/analytics/hourly`
- `/analytics/risk`

## App shell manifest

Chosen shell basis:

- Efferd `app-shell-5`

KMFX-owned shell components expected:

- `AppShell`
- `WorkspaceSidebar`
- `WorkspaceTopbar`
- `WorkspaceMobileNav`
- `WorkspaceStatusStrip`
- `WorkspaceUserMenu`
- `CommandEntry`

## shadcn component manifest

These should be considered the approved baseline primitives for Wave 1:

- `Sidebar`
- `Card`
- `Button`
- `Badge`
- `Table`
- `Tabs`
- `DropdownMenu`
- `Sheet`
- `Dialog`
- `Separator`
- `Skeleton`
- `Tooltip`
- `Input`
- `Select`
- `Field`
- `Textarea`
- `Slider`
- `Switch`
- `Progress`
- `Resizable`

## TripleD component manifest

### Approved for Wave 1

- `CommandPalette`
- `AnimatedProgress`
- `NativeCounterUp`
- `ShimmerButton`

### Approved only as implementation references

- `ReactiveBackgroundGrid`
- `SpotlightSection`
- `GlassWalletCard`

Meaning:

- study them for visual ideas if useful;
- do not make them default dependencies of core data surfaces yet.

### Not approved for Wave 1

- `AnimatedSidebar`
- `AnimatedTabs`
- `NotificationCenter`
- `CurrencyConverterCard`
- `DashboardShadcnUi`
- `StocksDashboardShadcnUi`
- `RippleClickButton`
- `DragToConfirmSlider`

## Chart manifest

Approved chart layer:

- `liveline`
- `recharts`

Preferred usage in Wave 1:

- `liveline` for hero chart and compact pulse/spark surfaces
- `recharts` only where a more conventional analytical chart is clearer

Rule:

- choose the renderer based on metric clarity, not novelty.

## Wave 1 route-to-component map

### `/dashboard`

Expected building blocks:

- `AppShell`
- `MetricCard`
- `ChartPanel`
- `NativeCounterUp`
- `AnimatedProgress`
- `Table`
- `Badge`
- `Resizable`
- `liveline`

### `/accounts`

Expected building blocks:

- `AppShell`
- `AccountIdentity`
- `DataFreshnessNotice`
- `Table`
- `Badge`
- `Card`

### `/risk`

Expected building blocks:

- `AppShell`
- `RiskStatusBadge`
- `AuthorityNotice`
- `ChartPanel`
- `Progress`
- `Table`
- `Badge`

### `/analytics`

Expected building blocks:

- `AppShell`
- `Tabs`
- `ChartPanel`
- `Table`
- `Badge`
- `Card`

## Motion manifest

Approved:

- subtle section transitions
- restrained count-up
- restrained progress animation
- limited shimmer CTA use

Not approved:

- motion-heavy buttons everywhere
- animated backgrounds under dense risk data
- playful click effects in core professional surfaces

## Color and token manifest

Approved:

- dark mode default
- neutral palette
- black, graphite, zinc, soft white hierarchy
- subtle border and separator system

Not approved:

- brand-led bright blue emphasis
- flashy green/red as permanent theme accents
- decorative gradients dominating the UI

## Review gates before implementation

- [ ] Every approved component maps to at least one Wave 1 route.
- [ ] No rejected component sneaks in “temporarily”.
- [ ] Motion remains secondary to readability.
- [ ] Chart choices are justified per surface.
- [ ] The shell remains the same across all Wave 1 routes.

## Acceptance rule

Wave 1 UI is correctly scoped only if:

- it already feels like KMFX;
- it does not require late-stage sensitive modules;
- it does not depend on decorative components to feel premium;
- it can grow route by route without redesigning the shell.
