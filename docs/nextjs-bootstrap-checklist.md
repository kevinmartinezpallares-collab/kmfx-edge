# KMFX Next.js Bootstrap Checklist

Status: planning only. No runtime changes.
Last updated: 2026-05-14
Purpose: define the exact bootstrap sequence for `apps/web-next` before implementation starts.

## Goal

Create a parallel Next.js app that:

- lives outside the current vanilla runtime;
- uses App Router;
- uses shadcn/ui as the baseline component system;
- supports the chosen Efferd `app-shell-5` direction;
- is ready to receive KMFX domain/data logic in later phases.

## Ground rules

- do not modify the current root runtime;
- do not move or rewrite current production entrypoints;
- do not introduce live billing/auth/MT5 changes in the bootstrap phase;
- keep the new app isolated under `apps/web-next`.

## Target stack

Recommended baseline:

- Next.js 16
- React 19.2.4+
- TypeScript 5
- Tailwind CSS 4
- shadcn CLI
- lucide-react
- framer-motion
- liveline
- recharts
- sonner
- react-resizable-panels
- next-themes

Reference package baseline already validated in the local TripleD project:

- [package.json](/Users/conlopuestoyaloloco/Desktop/tripled-trading-dashboard/package.json:1)

## Scaffold commands

These commands are the intended baseline when implementation begins.

### 1. Create the app

```bash
npx create-next-app@latest apps/web-next --yes --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --use-npm
```

Notes:

- `--yes` avoids interactive prompts in non-interactive shells.
- We create the app in a sidecar folder, not in the repo root.

### 2. Initialize shadcn

```bash
cd apps/web-next
npx shadcn@latest init --defaults
```

If we need tighter control during setup:

```bash
npx shadcn@latest init
```

## Required post-scaffold fixes

Tailwind 4 + shadcn requires two important fixes after bootstrap.

### Fix 1: literal font names in `globals.css`

Do not keep a circular `--font-sans: var(--font-sans)` token.

Use literal font names in the `@theme inline` block instead.

### Fix 2: font variables on `<html>`, not `<body>`

Move the font variable classes to the `<html>` element in `layout.tsx`.

## Initial dependency set

Expected core dependencies:

- `framer-motion`
- `liveline`
- `recharts`
- `next-themes`
- `react-resizable-panels`
- `sonner`
- `class-variance-authority`
- `clsx`
- `tailwind-merge`
- `lucide-react`
- `tw-animate-css`

If shadcn or Efferd components require more, document them before installing.

## First shadcn component set

Recommended initial baseline for `apps/web-next`:

- `sidebar`
- `card`
- `button`
- `badge`
- `table`
- `tabs`
- `dropdown-menu`
- `sheet`
- `dialog`
- `separator`
- `skeleton`
- `tooltip`
- `input`
- `select`
- `field`
- `textarea`
- `slider`
- `switch`
- `progress`
- `resizable`

## Proposed folder structure

```text
apps/web-next/
  src/
    app/
      (workspace)/
        dashboard/page.tsx
        accounts/page.tsx
        risk/page.tsx
        analytics/page.tsx
      layout.tsx
      page.tsx
      globals.css
    components/
      app/
      charts/
      domain/
      ui/
      uitripled/
    features/
      accounts/
      analytics/
      dashboard/
      risk/
    lib/
      api/
      contracts/
      data/
      domain/
      formatters/
      store/
```

## Bootstrap file checklist

### Required immediately

- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/globals.css`
- `src/app/(workspace)/layout.tsx`
- `src/app/(workspace)/dashboard/page.tsx`
- `src/app/(workspace)/accounts/page.tsx`
- `src/app/(workspace)/risk/page.tsx`
- `src/app/(workspace)/analytics/page.tsx`

### App shell files

- `src/components/app/app-shell.tsx`
- `src/components/app/workspace-sidebar.tsx`
- `src/components/app/workspace-topbar.tsx`
- `src/components/app/workspace-mobile-nav.tsx`
- `src/components/app/command-entry.tsx`

### Core domain UI files

- `src/components/domain/metric-card.tsx`
- `src/components/domain/chart-panel.tsx`
- `src/components/domain/account-identity.tsx`
- `src/components/domain/risk-status-badge.tsx`
- `src/components/domain/data-freshness-notice.tsx`

## Bootstrap visual rules

- default to dark mode
- use neutral graphite/zinc palette
- keep borders soft and consistent
- avoid bright blue/green accents as primary theme colors
- prefer dense but readable layouts
- use motion sparingly

## Bootstrap acceptance criteria

- [ ] `apps/web-next` exists as an isolated app
- [ ] Next boots independently of the vanilla runtime
- [ ] shadcn is initialized correctly
- [ ] font/token fixes are applied for Tailwind 4
- [ ] `app-shell-5` structure is represented in the app shell
- [ ] `/dashboard`, `/accounts`, `/risk`, `/analytics` routes exist as placeholders or read-only shells
- [ ] no imports from DOM-writing vanilla modules
- [ ] no billing/auth/live MT5 behavior changed

## Things explicitly out of scope

- replacing `index.html`
- replacing `app.js`
- moving the live app to Next
- billing route handlers
- Stripe work
- launcher/EA changes
- Supabase auth rewrites
- production deploy cutover
