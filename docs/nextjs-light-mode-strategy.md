# KMFX Next.js Light Mode Strategy

Status: planning only. No runtime changes.
Last updated: 2026-05-14
Purpose: define how light mode should be treated in the future Next.js app without weakening the dark-first trading experience.

## Important clarification

The current TripleD reference stack appears to support both light and dark token layers at the CSS level, because:

- `src/app/globals.css` defines `:root` tokens and `.dark` tokens
- the token system is semantically structured for both modes

However, the current reference layout forces dark mode explicitly:

- [layout.tsx](/Users/conlopuestoyaloloco/Desktop/tripled-trading-dashboard/src/app/layout.tsx:26)

That means:

- light mode is structurally possible;
- light mode is not currently the active runtime mode in the reference project;
- we should not assume the reference has a fully productized theme toggle out of the box.

## KMFX position

KMFX should be dark-first.

That means:

- dark mode is the primary design target;
- all Wave 1 route QA should be done in dark first;
- light mode should exist as a secondary supported theme, not as the main visual identity.

## Why dark-first remains correct

- trading dashboards benefit from lower glare and stronger focus in dense data views
- the chosen shell, TripleD reference, and visual direction are all optimized around dark surfaces
- the premium, high-end desk feeling is stronger in dark mode for this product

## Why still document light mode

Even if dark is primary, light mode still matters for:

- daytime use
- some users' accessibility and comfort preferences
- future product completeness
- legal/help/settings surfaces where users may prefer a lighter reading mode

## Theme policy

### Wave 1

- dark mode: fully supported
- light mode: structurally planned, visually documented, not required to lead implementation

### Wave 2+

- light mode becomes a supported polish target after the dark-first routes are visually stable

## Theme architecture recommendation

When implementation starts:

1. use semantic shadcn tokens for both `:root` and `.dark`
2. keep dark as the default active class
3. introduce theme switching only after the shell and core routes are stable
4. use `next-themes` when the theme toggle is actually implemented

## Light mode quality bar

Light mode should not be:

- a cheap inversion of dark colors
- high-glare white slabs
- over-blue because the old palette leaks back in

Light mode should be:

- soft off-white or light neutral
- low-glare
- border-led and premium
- typographically strong
- less saturated than the legacy light theme

## Light mode visual direction

### Backgrounds

Preferred:

- soft light gray or warm-neutral near-white
- slightly differentiated sidebar and card surfaces

Avoid:

- bright pure white everywhere
- strong blue-tinted surfaces

### Text

Preferred:

- dark neutral text
- medium-muted secondary text
- low-contrast support text with good readability

### Accent

Preferred:

- restrained, low-saturation accent usage

Avoid:

- bright SaaS blue becoming the visual backbone of the product

### Semantic colors

Keep:

- green/red/amber for meaning

Rule:

- semantic colors should remain semantic in light mode too, not become decorative branding.

## Route expectations for light mode

### Wave 1 routes

For early implementation, light mode on these routes can be considered secondary:

- `/dashboard`
- `/accounts`
- `/risk`
- `/analytics`

Meaning:

- they should not break if light mode is toggled later;
- but they do not have to be polished before dark-mode parity is proven.

### Wave 2 and later

When light mode is actively polished, review especially:

- tables
- charts
- subtle borders
- muted text contrast
- hover/active states

## Theme toggle policy

Do not add a theme toggle immediately just because the token system allows it.

Only add it when:

- dark mode is already stable
- the light token set has been reviewed page by page
- settings architecture is ready to persist user preference safely

## Settings integration policy

When light mode eventually becomes user-configurable:

- store theme preference through the future typed settings layer
- keep SSR/client hydration behavior consistent
- avoid flash-of-wrong-theme during load

## Testing checklist for light mode later

- [ ] contrast remains strong on cards, tables, and dense panels
- [ ] sidebar remains clearly separated from content
- [ ] charts remain readable without relying on dark backgrounds
- [ ] semantic colors do not overpower the layout
- [ ] hover/active states remain visible but restrained
- [ ] legal/help/settings reading surfaces feel comfortable

## Final stance

Light mode should exist.

But:

- it is not the product-defining target;
- it should not delay the dark-first migration;
- it should be added as a disciplined second pass, not as a simultaneous design burden in Wave 1.
