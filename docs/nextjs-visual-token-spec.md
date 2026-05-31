# KMFX Next.js Visual Token Spec

Status: planning only. No runtime changes.
Last updated: 2026-05-14
Purpose: define the intended visual token system for the future Next.js app so implementation does not drift between the current KMFX CSS and the TripleD reference.

## Primary references

- [styles-v2.css](/Users/conlopuestoyaloloco/Desktop/KMFX%20Edge/styles-v2.css:1)
- [styles.css](/Users/conlopuestoyaloloco/Desktop/KMFX%20Edge/styles.css:1)
- [globals.css](/Users/conlopuestoyaloloco/Desktop/tripled-trading-dashboard/src/app/globals.css:1)

## Core direction

The future Next app should combine:

- the stronger neutral dark palette of the TripleD reference;
- the semantic clarity already present in KMFX dark mode;
- a calmer, less blue-driven visual language than the current legacy theme.

## Design goals

- dark mode by default
- high-end desktop trading workspace feel
- neutral black/graphite/zinc foundation
- very restrained accents
- strong information hierarchy
- low visual noise

## Theme stance

### Keep

- KMFX dark-first orientation
- semantic distinction between positive, negative, and warning states
- compact spacing and dense information surfaces
- border-led separation rather than heavy shadowing

### Reduce

- always-on blue emphasis from the legacy palette
- bright chart focus colors as dominant visual anchors
- glossy or decorative gradients on core data views

### Avoid

- consumer-app colorfulness
- neon accents
- mixed visual idioms between pages

## Foundation token model

The Next app should use shadcn-style semantic tokens as the main contract.

Primary semantic tokens:

- `--background`
- `--foreground`
- `--card`
- `--card-foreground`
- `--popover`
- `--popover-foreground`
- `--primary`
- `--primary-foreground`
- `--secondary`
- `--secondary-foreground`
- `--muted`
- `--muted-foreground`
- `--accent`
- `--accent-foreground`
- `--destructive`
- `--border`
- `--input`
- `--ring`
- `--sidebar`
- `--sidebar-foreground`
- `--sidebar-primary`
- `--sidebar-primary-foreground`
- `--sidebar-accent`
- `--sidebar-accent-foreground`
- `--sidebar-border`
- `--sidebar-ring`

## Color strategy

### Backgrounds

Preferred hierarchy:

- app background: near-black
- sidebar: slightly differentiated graphite
- cards: elevated but still dark
- secondary panels: one step above card or background depending on density

Intended feel:

- dark, crisp, restrained, editorial

### Text

Preferred hierarchy:

- primary text: soft white
- secondary text: medium neutral
- muted/supporting text: dim neutral
- disabled/low-priority text: low-contrast neutral

Rule:

- text hierarchy should do more work than accent color.

### Accent

The accent should not behave like the dominant brand color in every component.

Recommended role for `primary`:

- used for selected highlights
- used for limited active states
- used for carefully chosen CTA emphasis

Not recommended:

- strong blue on every active row, badge, border, or chart

### Semantic success/failure/warning

Allowed:

- green for positive states
- red for negative states
- amber/warning for caution states

Rule:

- these should remain semantic feedback colors, not structural theme colors.

## Proposed dark token behavior

### Dark base

Target feel is closer to the TripleD reference than to the lighter or bluer legacy layers.

Desired relationships:

- `background` darker than current `card`
- `card` readable but not floating too brightly
- `sidebar` slightly differentiated from the main content
- `border` subtle and soft

### Neutral chart tokens

Charts should default to neutral grayscale hierarchy unless a semantic reason requires color.

Preferred chart behavior:

- neutral grid
- neutral axis labels
- neutral line hierarchy
- color only when encoding meaning

## Radius and shape

Current signals:

- KMFX already uses generous but not exaggerated radii
- TripleD reference uses refined rounded surfaces

Recommended direction:

- keep `--radius` around the current moderate range
- cards and shell surfaces should feel premium but not playful
- avoid over-rounding dense tables and professional panels

Interpretation:

- slightly softened rectangles
- not pill-heavy everywhere

## Shadow policy

Preferred:

- minimal shadows
- more reliance on border, contrast, and layered surfaces

Use shadows only for:

- overlays
- floating panels
- selective emphasis

Do not use:

- strong card drop-shadows across the whole dashboard

## Border policy

Borders are a major part of the new look.

Preferred:

- soft borders
- subtle separation
- consistent contrast

Recommended use:

- cards
- tables
- sidebar groups
- inputs
- topbar separators

## Motion policy

Visual tokens and motion should work together.

Preferred:

- short durations
- calm easing
- subtle route transitions
- restrained shimmer

Avoid:

- motion as ornament
- multiple competing animated surfaces on one screen

## Typography stance

The reference stack uses Geist and a clean modern feel.

Recommended:

- Geist Sans for interface text
- Geist Mono for metrics, IDs, timestamps, and technical values

Rule:

- typography should feel premium and precise, not generic SaaS.

## Shell-specific tokens

The shell should have dedicated sidebar semantics.

Important shell tokens:

- `--sidebar`
- `--sidebar-foreground`
- `--sidebar-accent`
- `--sidebar-accent-foreground`
- `--sidebar-border`
- `--sidebar-ring`

Shell rule:

- sidebar must be distinct, but not dramatically louder than the route body.

## Token migration policy

When implementation starts:

1. port semantic intent, not one-to-one raw variables from legacy CSS;
2. use shadcn semantic tokens as the new contract;
3. keep a small KMFX-specific extension layer only where necessary;
4. avoid carrying forward every old alias from `styles.css`.

## What to preserve from current KMFX CSS

Preserve conceptually:

- compact spacing scale
- dark layers
- semantic positive/negative/warning colors
- control heights appropriate for dense workflows
- restrained shadows

## What to inherit from the TripleD reference

Preserve conceptually:

- neutralized dark palette
- stronger sidebar token system
- quieter accent usage
- premium card and surface balance
- consistent shadcn-compatible semantic token model

## What to intentionally leave behind

- legacy always-blue emphasis
- light-theme-first assumptions from older CSS
- duplicated alias sprawl where multiple variables mean almost the same thing
- decorative effects that are not justified by information hierarchy

## Acceptance checklist

- [ ] The Next app has one clear dark token system.
- [ ] Accent color is restrained.
- [ ] Positive/negative/warning remain semantic, not thematic.
- [ ] Sidebar tokens are explicitly separated from content tokens.
- [ ] Chart defaults do not become overly colorful.
- [ ] The resulting UI feels closer to a premium trading desk than to a generic dashboard.
