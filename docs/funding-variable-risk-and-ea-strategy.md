# KMFX Edge Funding Variable Risk and Portfolio EA Strategy

Status: concept and product strategy document
Last updated: 2026-05-14
Purpose: define how KMFX Edge should handle variable risk for prop/funding accounts and how portfolio definitions could evolve into exportable EA execution packages.

## Executive summary

Two high-value product directions fit KMFX Edge especially well:

1. funding-aware variable risk management
2. portfolio definitions that can eventually drive or export an EA

Both ideas are stronger than adding more generic dashboard widgets because they create real operating leverage:

- variable risk protects funded accounts from rule breaches
- portfolio-to-EA turns KMFX from a passive monitor into an execution control layer

## Why this matters for funding accounts

Prop and funding accounts are not managed well with a fixed "risk 1% every trade" mindset.

In practice, risk size should adapt to:

- remaining daily drawdown room
- remaining max drawdown room
- challenge phase vs funded phase
- account consistency constraints
- open heat already on the book
- correlation with existing positions
- strategy quality and recent execution state

This makes "variable risk" a natural product feature, not a nice-to-have.

## What "variable risk" should mean in KMFX

KMFX should not only show a trader the current risk.

It should also calculate a recommended risk envelope for the next trade or next set of trades.

That envelope should be driven by a rules engine:

- account rule profile
- live equity and balance
- floating PnL
- open risk
- day state
- strategy tag
- portfolio concentration

Output should not be one single number only.

It should produce:

- `max risk allowed now`
- `recommended risk now`
- `aggressive / standard / defensive` presets
- `max additional heat`
- `max size per symbol`
- `blocked` states when a trade should not be taken

## Recommended funding risk modes

### 1. Static mode

Simple fallback:

- fixed percent risk per trade
- optional daily cap

Useful for:

- small accounts
- users who want simplicity

### 2. Buffer-aware mode

Risk adapts to remaining rule room:

- larger room: normal risk
- shrinking room: reduced risk
- near rule breach: defensive or blocked

Useful for:

- challenge and funded prop accounts

### 3. Phase-aware mode

Risk adapts to account stage:

- challenge phase
- verification phase
- funded phase
- payout protection phase

Example logic:

- challenge phase may tolerate moderate push
- funded or pre-payout phase should usually prioritize survival

### 4. Portfolio-aware mode

Risk adapts not just to one account, but to the cluster:

- same setup already running elsewhere
- same symbol exposure elsewhere
- same USD factor risk elsewhere
- total portfolio heat already elevated

This is especially powerful for traders splitting the same idea across multiple funded accounts.

## What the dashboard should do

The dashboard should not place the burden on the user to mentally calculate these limits.

It should actively advise.

### Recommended dashboard surfaces

#### Funding Risk Panel

Should show:

- remaining daily loss room
- remaining max drawdown room
- open floating risk
- rule reset time
- current risk mode
- safe size range for next trade

#### Risk Advice Table

Should show row-level suggestions such as:

- account
- account type
- remaining daily room
- remaining overall room
- current open heat
- recommended max risk per next trade
- recommended max concurrent positions
- status: safe / caution / blocked

#### Scenario Table

Should answer:

- if the next trade loses, where does the account end up?
- if two correlated trades lose, where does the account end up?
- if open positions hit stop, can a new setup still be taken today?

This is where KMFX can become much more useful than a standard prop dashboard.

#### Preset Ladder

Show simple trader-facing options:

- defensive
- standard
- assertive

But each preset must still obey the hard constraints of the account rule engine.

## Recommended risk formulas and constraints

Product-wise, KMFX should support multiple constraints at once:

- max risk per trade
- max aggregate open heat
- max daily closed plus floating loss
- max symbol concentration
- max factor/currency concentration
- max strategy allocation
- reduced risk after X consecutive losses
- reduced risk after execution quality deterioration

The key idea:

The system should compute the final allowed risk as the minimum of all active constraints, not from one rule only.

In practical terms:

`allowed_risk_now = min(rule_room, portfolio_room, strategy_cap, symbol_cap, drawdown_cap, mode_cap)`

Then KMFX can derive:

- recommended lot size
- allowed stop-distance combinations
- whether pyramiding is allowed
- whether adding to an existing idea is allowed

## What to avoid

Avoid giving fake precision.

The product should not pretend to know the perfect risk number.

It should present:

- hard limits
- recommended envelopes
- assumptions behind the recommendation

Not:

- magical optimality
- black-box risk advice without explanation

## Product idea: funding playbooks

A very strong feature would be account-level playbooks:

- `FTMO conservative`
- `FTMO challenge push`
- `FundedNext payout protection`
- `Multi-account correlation discipline`

Each playbook would define:

- rule profile
- allowed sessions
- max open heat
- max setups at once
- risk ladder by day state
- freeze conditions

This can become a major product differentiator.

## Portfolio concept: what it should mean

The word "portfolio" in KMFX should not only mean a view of grouped accounts.

It should mean an executable allocation policy.

A portfolio should define:

- which accounts belong together
- what role each account has
- what strategies are allowed in that cluster
- what risk budget each account receives
- what symbols are allowed
- what correlation caps exist
- how trades are duplicated, split, or blocked across accounts

Examples:

- `Portfolio Alpha`: two personal accounts plus one challenge account
- `Portfolio Payout Defense`: only funded accounts near payout date
- `Portfolio London Trend`: accounts allowed to take only a specific strategy/session mix

## "Extract an EA": what it should really mean

The strongest interpretation is not "generate a fully autonomous black-box robot from scratch".

The strongest interpretation is:

- define portfolio rules in KMFX
- export an execution package
- attach that package to MT5 as an EA
- let the EA enforce sizing, routing, and guardrails

That is much more realistic and productizable.

## Recommended EA export models

### Model A. Risk Guardian EA

The simplest and most realistic first product.

The EA does not invent trades.

It only:

- validates whether a trade is allowed
- calculates lot size from KMFX rules
- blocks trades that exceed limits
- logs rule violations
- optionally syncs execution data back to KMFX

Best first step:

- highest value
- lowest strategic risk
- easiest to explain

### Model B. Semi-automatic Portfolio Router EA

The EA can receive a setup or signal and then decide:

- which account(s) may take it
- at what size
- whether it should be copied or split
- whether it breaches portfolio concentration

This is strong for multi-account funded traders.

### Model C. Strategy-bound Execution EA

The EA contains a specific strategy module plus KMFX risk policy.

This is possible, but should come later.

It requires much stronger testing, validation, and liability awareness.

## Recommendation: sequence these models

1. `Risk Guardian EA`
2. `Portfolio Router EA`
3. `Strategy-bound EA`

This sequence keeps the product grounded in risk control first.

## Feasibility notes from MetaTrader / MQL5

Based on official MQL5 documentation, several constraints matter:

- EAs are attached to a chart and receive `OnTick` events for the chart symbol.
- Multi-symbol logic is possible, but should usually rely on timer/event architecture plus explicit symbol queries.
- MQL5 supports external input parameters, but they are not ideal for large dynamic rule payloads.
- File access is sandboxed to terminal data folders / common files.
- `WebRequest()` exists, but it is synchronous, so careless heavy polling can stall execution.

This implies a strong product architecture choice:

### Best architecture for KMFX

- KMFX remains the source of truth for policy
- EA is a thin enforcement/execution layer
- configuration is delivered via small policy payloads, files, or carefully designed API sync

Not recommended:

- huge complex strategy logic embedded blindly into every EA export
- constant blocking network chatter from the terminal

## Recommended technical product architecture

### Layer 1. KMFX policy engine

Lives in KMFX backend / domain logic.

Owns:

- account rule templates
- portfolio policies
- risk mode calculations
- recommendation outputs

### Layer 2. EA policy package

Exportable payload containing:

- account identifier
- allowed symbols
- risk mode
- hard limits
- portfolio caps
- session rules
- strategy permissions

### Layer 3. MT5 EA runtime

Owns only:

- reading package/config
- validating trade eligibility
- computing lot size locally
- optionally routing trade
- returning telemetry

## Dashboard + EA product loop

The strongest loop would be:

1. trader sees account and portfolio state in KMFX
2. KMFX computes current risk envelope
3. trader edits portfolio or playbook rules
4. KMFX exports or syncs a policy package
5. EA enforces that package at execution time
6. telemetry returns to KMFX for audit and review

This creates a closed loop between analytics, risk, and execution.

## What should come first in product terms

If we prioritize value and realism:

### Phase 1

- dashboard funding advice
- variable risk engine
- account playbooks
- scenario tables

### Phase 2

- portfolio definitions
- allocation logic
- copy/split/block policy
- exportable policy package

### Phase 3

- Risk Guardian EA
- execution audit trail
- sync back into Journal and Risk

### Phase 4

- Portfolio Router EA
- strategy-bound exports where justified

## Final recommendation

Yes, KMFX should absolutely lean into variable risk for funded accounts.

That is one of the clearest places where the product can deliver trader value fast.

And yes, "portfolio to EA" is a promising direction, but it should be framed correctly:

- not as "instant AI robot generation"
- but as "policy-driven execution and risk enforcement"

That positioning is more realistic, more defensible, and much more aligned with what MT5 and prop-account traders actually need.

## Reference notes

Relevant official or public references reviewed for this document:

- MQL5 Expert Advisors / event model / network and file constraints:
  - https://www.mql5.com/en/docs/mql5_guide
  - https://www.mql5.com/en/docs/event_handlers/ontick
  - https://www.mql5.com/en/docs/event_handlers
  - https://www.mql5.com/en/docs/network/webrequest
  - https://www.mql5.com/en/docs/files
  - https://www.mql5.com/en/docs/basis/variables/inputvariables
  - https://www.mql5.com/en/articles/770
- Public prop-rule examples showing that drawdown logic varies by firm/model:
  - https://ftmo.com/en/trading-objectives/
  - https://help.fundednext.com/en/articles/9941519-daily-drawdown-limit-vs-overall-loss-limit
  - https://helpfutures.fundednext.com/en/articles/14282890-what-is-the-consistency-rule-in-the-fundednext-futures-rapid-challenge-and-fundednext-account

Related implementation docs:

- `docs/prd-funding-risk-cockpit.md`
- `docs/prd-portfolio-policy-and-ea-export.md`
- `docs/domain-model-funding-portfolio-v1.md`
- `docs/policy-evaluation-contract-spec.md`
