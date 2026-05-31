# KMFX Edge Product Strategy

Status: product strategy document
Last updated: 2026-05-14
Purpose: define the trader-first product strategy for KMFX Edge using the current product state, existing roadmaps, metric audits, and migration plans.

Related deep dives:

- `docs/funding-variable-risk-and-ea-strategy.md`
- `docs/prd-funding-risk-cockpit.md`
- `docs/prd-portfolio-policy-and-ea-export.md`
- `docs/domain-model-funding-portfolio-v1.md`
- `docs/policy-evaluation-contract-spec.md`

## Executive summary

KMFX Edge should not become "another trading dashboard with many widgets".

Its strongest product position is narrower and more valuable:

- a multi-account trading operating system;
- with real MT5-linked visibility;
- focused on risk, funding survival, strategy attribution, and review quality;
- built for traders who need to know what is happening now, what is dangerous now, and what is actually producing edge over time.

The product should answer three questions faster than anything else in the stack:

1. What is happening right now across my accounts?
2. How much risk am I carrying and how much room do I have left?
3. Which part of my process is producing edge and which part is leaking capital?

## Product thesis

The market is full of:

- journals that are mostly note-taking;
- dashboards that are mostly analytics theater;
- prop-firm tools that show rules but do not unify real execution, portfolio risk, and process review.

KMFX Edge can win by combining four things into one coherent product:

1. Live account state
2. Risk governance
3. Funding rule survival
4. Review and strategy attribution

If those four pillars are tightly connected, the product becomes operational, not decorative.

## Target user

Primary user:

- active discretionary or semi-systematic trader
- operates one or more MT5 accounts
- often mixes personal capital and prop/funding capital
- cares about survival, consistency, discipline, and account allocation

Secondary user:

- strategy-driven trader tracking setups across sessions and accounts
- trader managing multiple brokers, firms, or challenge phases

The product should not primarily optimize for:

- beginner education
- broker-style market browsing
- social/community trading
- signal-selling workflows

## Product positioning

### What KMFX Edge should be

- a trading desk
- a risk operating layer
- a funding control system
- a process review system

### What KMFX Edge should not be

- a generic backoffice SaaS
- a broker terminal replacement
- a charting platform
- a decorative analytics dashboard

## Core product pillars

## 1. Desk

Purpose:

- give the trader immediate operational awareness

Question answered:

- what is happening right now?

Must include:

- active account context
- equity, balance, floating PnL
- open risk
- daily drawdown usage
- connection/sync state
- urgent warnings
- recent operational drift

Success condition:

- the trader opens KMFX and understands the current situation in under 10 seconds

## 2. Risk

Purpose:

- make hidden danger visible before account damage happens

Question answered:

- how close am I to violating my own limits or a funding rule?

Must include:

- risk per trade
- total open heat
- daily and total drawdown
- exposure by symbol
- exposure by factor/currency
- risk of ruin / VaR / CVaR
- rule source and confidence

Success condition:

- no red state or limit state appears without clear origin, formula, and action path

## 3. Portfolio

Purpose:

- treat the trader as a manager of capital, not just a trader of isolated positions

Question answered:

- how is my capital allocated and where is real edge coming from?

Must include:

- multi-account overview
- personal vs funding account grouping
- capital allocation by account
- portfolio heat
- concentration by market/session/strategy
- net contribution by account and strategy

Success condition:

- the trader knows which account deserves capital and which account is dragging the portfolio

## 4. Funding

Purpose:

- turn prop-firm trading into a controlled system instead of a reactive survival game

Question answered:

- how far am I from failing or passing this account?

Must include:

- challenge phase / funded phase state
- remaining daily drawdown room
- remaining max drawdown room
- consistency constraints
- target progress
- payout cadence
- reset / continuation economics when relevant

Success condition:

- funding is not just a page; it becomes a real risk-governed operating mode

## 5. Strategy attribution

Purpose:

- identify true edge, not just aggregate PnL

Question answered:

- which setup actually works, in what context, and with what stability?

Must include:

- setup-level attribution
- session attribution
- symbol attribution
- backtest vs real comparison
- sample quality
- outlier dependency
- strategy load and allocation hints

Success condition:

- the trader can stop scaling noise and start scaling verified process

## 6. Review and execution quality

Purpose:

- make review actionable rather than archival

Question answered:

- what am I doing wrong in execution and process, and what should I review first?

Must include:

- review queue
- unreviewed trades
- rule violations
- recurring leaks
- manual notes and evidence
- execution quality metrics
- post-trade review flow

Success condition:

- Journal becomes the center of improvement, not a place where notes go to die

## Product hierarchy

The future product hierarchy should be:

### Tier A - Core

- Dashboard / Desk
- Accounts
- Risk
- Portfolio / Capital
- Journal

### Tier B - High-value secondary

- Analytics
- Strategies
- Funding
- Trades
- Calendar

### Tier C - Support

- Tools
- Study / glossary
- Settings
- Debug / admin

Rule:

- Tier A should carry the product.
- Tier B should deepen decisions.
- Tier C should support the workflow, not compete with it.

## Recommended route interpretation

### `/dashboard`

Role:

- command center

Should show:

- current account state
- urgent risk
- core KPIs
- hero chart
- watchlist or market pulse
- recent operational anomalies

Should not show:

- too many analytical subtabs
- educational explanations everywhere
- low-priority widgets

### `/accounts`

Role:

- account control and context

Should show:

- account identity
- broker/server/login context
- sync health
- plan or entitlement state
- grouping by real/demo/funding/challenge

### `/risk`

Role:

- protection cockpit

Should show:

- rule usage
- exposure
- open heat
- risk state by account
- probability and tail-risk summaries

### `/capital`

Role:

- portfolio layer

Should show:

- allocation
- cross-account concentration
- capital efficiency
- contribution by account

### `/funding`

Role:

- prop-firm operating center

Should show:

- phase state
- buffers
- consistency constraints
- payout path
- challenge economics

### `/strategies`

Role:

- edge attribution lab

Should show:

- setup performance
- sample quality
- real vs backtest
- capital suitability

### `/journal`

Role:

- review and improvement center

Should show:

- review queue
- leaks
- notes
- execution quality
- evidence

## What should be improved from the current product

## 1. Stronger portfolio layer

Current gap:

- capital/account views exist, but the portfolio operating model can be much stronger

Improve by adding:

- multi-account grouping
- personal vs funding grouping
- exposure by factor/currency
- concentration warnings
- account contribution ranking
- capital allocation suggestions clearly marked as guidance

## 2. Stronger funding engine

Current gap:

- funding exists, but it should feel more like a specialized operating mode

Improve by adding:

- firm-specific rule templates
- phase-aware buffers
- challenge survival panel
- payout planning
- reset economics
- pass probability and scenario analysis with explicit assumptions

## 3. Stronger execution quality layer

Current gap:

- performance is visible, but execution quality can become much more diagnostic

Improve by adding:

- MAE / MFE
- entry efficiency
- exit efficiency
- slippage/spread awareness where available
- hold-time quality
- rule-compliance breakdown

## 4. Stronger strategy attribution

Current gap:

- strategy tracking exists, but should be more decisive

Improve by adding:

- setup stability bands
- outlier dependency
- sample strength
- real-vs-backtest degradation
- strategy suitability per account type

## 5. Tighter review workflow

Current gap:

- journal is improving, but should become even more operational

Improve by adding:

- review priority scoring
- recurring leak detection
- pre/post trade linkage
- evidence attachment structure
- weekly review summary

## What should be reduced or removed

### Reduce

- decorative widgets that do not improve a decision
- repeated KPI surfaces across Dashboard, Analytics, and Risk
- overly promotional or landing-like layout patterns
- low-signal panels in the main dashboard viewport

### Remove from priority

- features that exist mainly to look advanced
- extra mobile complexity before core mobile flows are clear
- generic market modules if they do not help execution, risk, or review

## What I would add as a trader

If I were using this product seriously, I would want:

### Real-time decision layer

- remaining daily loss room
- remaining max drawdown room
- open heat by account
- exposure by symbol and by factor
- stale/live state clarity

### Portfolio management layer

- which account deserves more capital
- which account should be paused
- whether I am unintentionally stacking the same risk

### Funding control layer

- exact prop-rule buffer
- probability of survival or pass
- consistency rule pressure
- payout readiness

### Strategy truth layer

- which setup actually has edge net of costs
- where it works best
- where performance is unstable
- what part of the equity curve depends on outliers

### Review layer

- what I must review today
- where I broke process
- what repeated error is costing me most

## What data would still be especially valuable

Even with the current product direction, the highest-value extra data would be:

- planned risk before entry
- clean setup tagging
- MAE / MFE per trade
- spread or execution cost context
- exposure by factor/currency
- exact prop-firm rule metadata
- better context for why a trade existed
- session and regime context

## Product moat

KMFX Edge's moat should not be "prettier charts".

The moat should be:

- live MT5-linked realism
- funding-aware risk control
- multi-account portfolio visibility
- process review tied to execution and capital
- a product language built around trader decisions, not dashboard aesthetics

## Business implication

This product strategy supports a clean plan ladder:

### Lower tier

- one or two live accounts
- dashboard
- core risk
- basic review

### Mid tier

- more accounts
- funding
- advanced analytics
- strategies

### Higher tier

- multi-account desk
- deeper risk and portfolio controls
- richer review and advanced allocation logic

The important point:

- premium should come from operational advantage, not from cosmetic gating.

## Product roadmap recommendation

### Phase A - Strengthen the core operating loop

Focus:

- Dashboard
- Accounts
- Risk
- Journal

Goal:

- make KMFX indispensable intraday

### Phase B - Strengthen portfolio and funding differentiation

Focus:

- Capital / portfolio
- Funding
- multi-account risk

Goal:

- make KMFX harder to replace for traders running multiple accounts or prop capital

### Phase C - Deepen edge attribution

Focus:

- Strategies
- Backtest vs Real
- execution quality
- review scoring

Goal:

- help the trader scale what works and cut what does not

### Phase D - Polish distribution layers

Focus:

- Next.js shell
- mobile-serious UX
- light mode support
- settings completeness

Goal:

- make the product easier to live in daily without changing its core value proposition

## Final recommendation

KMFX Edge should be built as:

- a live trading desk
- a risk and funding operating system
- a portfolio-aware review platform

The product wins if it helps a trader:

- avoid account damage
- survive prop rules
- identify real edge
- allocate capital better
- improve execution quality over time

If it does those five things clearly, the product becomes materially valuable.

If it drifts into generic dashboards, it loses its edge.
