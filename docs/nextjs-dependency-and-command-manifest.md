# KMFX Next.js Dependency And Command Manifest

Status: active baseline for `apps/web-next`.
Last updated: 2026-05-20
Purpose: define the exact package, registry, and command baseline for the current `apps/web-next` setup.

## Intent

When the implementation phase begins, we should not have to rediscover:

- which dependencies are part of the approved baseline;
- which shadcn style and registry settings match the chosen visual direction;
- which commands to run first;
- which packages are required by Wave 1 versus optional later.

This document is the execution recipe.

## Reference stack already validated

The local reference project confirms a working baseline for the chosen direction:

- [components.json](/Users/conlopuestoyaloloco/Desktop/tripled-trading-dashboard/components.json:1)
- [package.json](/Users/conlopuestoyaloloco/Desktop/tripled-trading-dashboard/package.json:1)

Important validated choices:

- shadcn style: `base-nova`
- base color: `neutral`
- icon library: `lucide`
- CSS variables: enabled
- RSC: enabled
- UI TripleD registry: `@uitripled`

## Dependency groups

### Group A - Core framework

Required:

- `next`
- `react`
- `react-dom`
- `typescript`
- `tailwindcss`
- `@tailwindcss/postcss`
- `eslint`
- `eslint-config-next`

### Group B - shadcn baseline

Required:

- `shadcn`
- `class-variance-authority`
- `clsx`
- `tailwind-merge`
- `tw-animate-css`
- `lucide-react`

### Group C - Approved Wave 1 UX dependencies

Required:

- `framer-motion`
- `liveline`
- `recharts`
- `react-resizable-panels`
- `sonner`
- `next-themes`

### Group D - Optional later-only dependencies

Only add if justified later:

- any extra charting library beyond `liveline` and `recharts`
- any notification/event package beyond `sonner`
- any heavy animation helper beyond `framer-motion`

Rule:

- do not bloat Wave 1 with speculative packages.

## Approved shadcn configuration baseline

The future `apps/web-next/components.json` should aim for:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-nova",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "rtl": false,
  "menuColor": "default",
  "menuAccent": "subtle",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "registries": {
    "@uitripled": "https://ui.tripled.work/r/{name}.json"
  }
}
```

Notes:

- this matches the reference project closely enough to preserve the visual direction;
- any deviation should be intentional and documented.

## Future command recipe

### 1. Scaffold the sidecar app

```bash
npx create-next-app@latest apps/web-next --yes --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --use-npm
```

### 2. Enter the app

```bash
cd apps/web-next
```

### 3. Initialize shadcn

Preferred baseline:

```bash
npx shadcn@latest init --defaults
```

If we need to verify values interactively:

```bash
npx shadcn@latest init
```

### 4. Install Wave 1 dependencies

```bash
npm install framer-motion liveline recharts react-resizable-panels sonner next-themes
```

### 5. Add the baseline shadcn components

```bash
npx shadcn@latest add sidebar card button badge table tabs dropdown-menu sheet dialog separator skeleton tooltip input select field textarea slider switch progress resizable
```

### 6. Add approved UI TripleD components for Wave 1

These are the first candidates currently approved on paper:

```bash
npx shadcn@latest add @uitripled/command-palette-shadcnui
npx shadcn@latest add @uitripled/animated-progress-shadcnui
npx shadcn@latest add @uitripled/native-counter-up-carbon
npx shadcn@latest add @uitripled/shimmer-button-shadcnui
```

## Wave 1 command boundaries

## Safe validation command

Use this before opening preview or doing broad visual QA:

```bash
cd apps/web-next
npm run validate
```

This runs:

- `npm run test`
- `npm run typecheck`
- `npm run lint`

Rule:

- do not start `next dev` just to validate code or contracts;
- use preview only for route-specific visual checks;
- default preview command must stay on webpack: `npm run dev` = `next dev --webpack`;
- Turbopack is allowed only as an explicit diagnostic command: `npm run dev:turbo`.

This is covered by `apps/web-next/src/lib/domain/package-contract.test.ts` to avoid reintroducing the memory-heavy preview path by accident.

## Wave 1 command boundaries

Allowed in the first Next pass:

- scaffold app
- initialize shadcn
- install approved dependencies
- add approved shell and UI primitives
- add approved TripleD components
- configure tokens, globals, and app shell files

Not allowed in the first Next pass:

- billing route implementation
- launcher/EA changes
- MT5 operational rewrites
- Supabase auth rewrites
- production cutover

## Component add policy

Before each future `shadcn add`:

1. confirm the component is in the approved manifest or explicitly justified;
2. confirm it improves a real route;
3. avoid adding showcase-only components just because they look good.

## Approved Wave 1 UI TripleD imports

Approved:

- `@uitripled/command-palette-shadcnui`
- `@uitripled/animated-progress-shadcnui`
- `@uitripled/native-counter-up-carbon`
- `@uitripled/shimmer-button-shadcnui`

Deferred:

- `@uitripled/drag-to-confirm-slider-shadcnui`
- `@uitripled/spotlight-section-shadcnui`
- `@uitripled/reactive-background-grid-shadcnui`
- `@uitripled/glass-wallet-card-shadcnui`
- `@uitripled/ripple-click-button-shadcnui`

Rejected for Wave 1:

- `@uitripled/currency-converter-card-shadcnui`
- `@uitripled/animated-sidebar-shadcnui`
- `@uitripled/animated-tabs-shadcnui`
- `@uitripled/notification-center-shadcnui`
- `@uitripled/dashboard-shadcnui`
- `@uitripled/stocks-dashboard-shadcnui`

## Required post-add review

After adding any third-party shadcn or registry component:

- verify imports use the project aliases;
- verify accessibility requirements are still met;
- verify the component does not override the KMFX visual system in inconsistent ways;
- verify it does not introduce unnecessary dependencies;
- verify it still fits the dark neutral palette.

## Package lock discipline

When implementation starts:

- add dependencies intentionally;
- document why each non-default package exists;
- do not let the app inherit every package from the reference project just because it is available there.

## Acceptance checklist

- [ ] The dependency baseline is explicit.
- [ ] The shadcn configuration baseline is explicit.
- [ ] The UI TripleD registry is documented.
- [ ] The first component add commands are defined.
- [ ] Wave 1 package scope is restrained.
- [ ] The future setup does not depend on memory or guesswork.
