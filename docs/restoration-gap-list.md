# KMFX Edge Restoration Gap List

## Scope of comparison

Reference audited from the original dashboard bundle preserved in `files.zip`:

- `kmfx-edge.html` inside `files.zip`

Current clean baseline preserves the visual identity and now includes the full page surface:

- Dashboard
- Analytics
- Risk
- Trades
- Calendar
- Connections
- Calculator
- Journal
- Strategies
- Funded
- Market
- Talent
- Portfolio
- Glossary
- Debug
- Settings

## Missing functional blocks

### Account and workspace management

- Add-account flow from the original banner
- Challenge / funded account creation modal
- Richer account management actions
- Account-level connection diagnostics

### Journal and strategy tooling

- Legacy modal presentation for journal actions
- Strategy modal parity and full legacy lifecycle details

### Funding / portfolio / talent tooling

- Deeper challenge-progress workflows from the original
- Legacy funded-account creation/editing flows

### Connection and debug tooling

- RAW EA vs dashboard comparison tables
- Monthly bridge debug breakdown
- Bridge-driven debug refresh actions

### Utility pages

- Full calculator parity including richer instrument spec widgets and original warning treatments
- Full glossary/detail parity
- Deeper market page parity

## Missing metric blocks or parity details inside restored areas

These pages exist in the clean baseline, but still do not fully match the original density:

### Dashboard

- Original banner management actions
- Some icon-led KPI treatments from the legacy layout
- Finer-grained recent-trade presentation parity
- Some original micro-badges and hover detail treatments

### Analytics

- Full legacy visual density for hero cards and bar-chart variants
- Additional legacy score rows and micro-breakdowns
- Exact iconography parity in section headers and KPI cards

### Risk

- Config-driven risk editing flows that existed around risk configuration
- Risk configuration modal integration
- Some original status panels and granular monitor controls

### Trades

- Deeper execution controls, actions, and legacy row-level affordances
- Full parity with all original trade review micro-details

### Calendar

- Legacy `PnL calendar` naming and full navigation/detail parity
- Deeper per-day interactions

### Settings

- Richer legacy settings profile block
- Avatar/profile card parity
- More complete preference controls from the original single-file app

## Missing visual-detail parity items

- Inline SVG icon coverage across more cards and headers
- Original modal system styling and overlays
- Mobile bottom navigation and “Más secciones” menu
- Original page-header icon treatments
- Legacy micro-interactions on certain list rows and cards
- Some denser spacing rhythms from the original one-file dashboard

## Missing interactions

- Modal open/close flows for journal, strategy, risk config, and challenge accounts
- Mobile bottom-nav navigation model
- Add/manage account actions from the original dashboard
- Legacy page-specific button actions and utility shortcuts
- Debug actions and manual refresh tools

## Explicitly deferred until MT5 phase

- WebSocket / bridge / backend connectivity
- Live account synchronization
- MT5 connection status and reconnect behavior
- Raw MT5 payload diagnostics in the UI
