# KMFX Edge PRD: Funding Risk Cockpit

Status: product requirements document
Last updated: 2026-05-14
Purpose: define the functional product specification for a funding-aware risk cockpit in KMFX Edge.

## Summary

The Funding Risk Cockpit is the operating center for traders managing challenge and funded accounts under firm-specific rules.

Its purpose is not just to display metrics.

Its purpose is to help the trader avoid breach, size the next trade correctly, and understand what room is left before taking action.

## Core user problem

Funded-account traders usually fail not because they lack charts or data.

They fail because they do not have a live decision layer that answers:

- how much room is left today
- how much total room is left
- whether the next trade is acceptable
- whether open exposure is already too high
- whether the current account state calls for aggressive, normal, or defensive risk

## Product goal

Turn funding risk management into an actionable operating workflow.

The cockpit should make the trader feel:

- protected
- informed
- constrained when necessary
- clear about what can be traded next

## Success criteria

Primary success:

- trader can understand funded-account risk state in under 10 seconds
- trader can see recommended max risk for the next trade without manual calculation
- trader can identify whether an account is safe, caution, or blocked

Secondary success:

- trader can compare multiple funded accounts side by side
- trader can simulate simple next-trade scenarios
- trader can switch risk playbooks without confusion

## In-scope

- funding account overview
- firm/model-specific rule profile
- daily loss room
- overall/max drawdown room
- open heat and floating risk
- risk mode calculation
- safe size recommendation
- account-level scenario table
- playbook system
- warnings and freeze states

## Out of scope for V1

- fully automated execution
- direct order placement from cockpit
- strategy generation
- AI narrative explanations beyond short reasoning
- firm onboarding marketplace

## Primary users

- prop-firm challenge trader
- funded trader protecting payout
- multi-account trader operating several funded accounts at once

## User jobs

1. Before placing a trade, the trader wants to know whether the account can safely take more risk.
2. During the session, the trader wants to know whether open heat or floating loss is nearing a rule limit.
3. Across accounts, the trader wants to know which funded account is safest to use next.
4. Near payout or after a drawdown event, the trader wants the system to shift to a more defensive operating mode.

## Core concepts

### Funding journey

A complete lifecycle for one purchased challenge or funded path.

It links:

- Challenge / Phase 1
- Verification / Phase 2
- Real / Funded
- payouts
- fees and resets
- timeline events

This is required because prop firms often issue a different MT5 login for each phase. KMFX must preserve the full story instead of treating each login as an isolated account.

### Funding account

An account with:

- firm
- model
- phase
- starting balance
- current balance
- current equity
- rule profile

### Rule profile

Defines:

- daily drawdown rule
- overall/max drawdown rule
- consistency rule if applicable
- payout cadence if relevant
- minimum trading day logic if relevant
- trailing/static behavior if relevant
- timezone / reset clock

### Risk playbook

A named configuration layer defining:

- default risk posture
- max risk per trade
- max open heat
- max concurrent positions
- reduction rules
- freeze rules

### Risk mode

Calculated live state:

- aggressive
- standard
- defensive
- blocked

Risk mode is not chosen only by the user.

It is also constrained by real account state.

## Functional requirements

## 0. Funding journey continuity

The system must group related phase accounts under one journey.

A journey must show:

- firm and program
- account size
- current stage
- Phase 1 result
- Phase 2 result
- Real/Funded state
- linked account/login per stage
- total trades by stage
- profit by stage
- max drawdown by stage
- payouts received
- fees/resets paid
- net real funding result
- timeline of lifecycle events

The user must be able to understand the entire path from initial challenge to funded payout without losing historical data when the account login changes.

## 1. Funding account list

The system must show a list of funded/challenge accounts with:

- account name
- firm and model
- phase
- current balance
- current equity
- daily room left
- overall room left
- open heat
- current risk mode
- status badge

## 2. Rule profile display

The system must show the active rule profile with:

- rule names
- formula source
- reset time
- whether floating loss counts
- whether trailing logic applies

The user should not be forced to remember firm rules manually.

## 3. Risk advice engine

The system must compute:

- max risk allowed now
- recommended next-trade risk
- max additional heat
- max concurrent positions allowed now
- whether new exposure is blocked

These outputs should be based on the minimum active constraint.

## 4. Scenario analysis

The cockpit must provide simple scenarios such as:

- next trade loses full planned risk
- next two correlated trades lose
- current open trades hit stop
- floating loss expands by a configurable amount

Each scenario should show:

- resulting equity
- resulting rule room
- resulting account state
- whether breach occurs

## 5. Playbooks

The product must support named playbooks such as:

- challenge push
- conservative funded
- payout defense
- reset recovery

Each playbook should define:

- max risk per trade
- max heat
- max concurrent positions
- reduction thresholds
- freeze conditions

## 6. Warnings and freeze states

The system must support clear states:

- safe
- caution
- danger
- blocked

Blocked means KMFX should explicitly state that no additional risk is recommended.

## 7. Multi-account comparison

The user must be able to compare accounts and understand:

- which account has most room
- which account is closest to rule breach
- which account is best suited for the next setup

## 8. Payout and manual payment ledger

The system must let the user record funding economics manually.

Supported ledger entries:

- payout requested
- payout received
- challenge fee
- reset fee
- refund
- commission
- manual adjustment

Each entry must support:

- journey
- account
- firm
- date
- gross amount
- net amount
- method
- status
- optional proof/reference
- notes

Funding economics must not be merged into trading PnL. The product should calculate both trading performance and real funding net result.

## Non-functional requirements

- dashboard load should feel immediate
- calculations should be deterministic and explainable
- all recommendations must show short assumption text
- visual hierarchy must privilege room left, heat, and mode over secondary stats
- mobile view must preserve safety-critical surfaces

## Data requirements

Minimum required inputs:

- account metadata
- balance
- equity
- floating PnL
- closed PnL today
- open risk estimate
- account classification
- rule template parameters

High-value additional inputs:

- strategy tag per trade
- symbol concentration
- factor/currency concentration
- session state
- payout date or payout cycle

## Main screens

## A. Funding overview

Top goals:

- compare funded accounts
- identify danger quickly
- see next-trade room

Core surfaces:

- summary header
- account risk table
- state badges
- reset clock

## B. Account detail

Top goals:

- understand one account deeply
- inspect constraints and scenario outcomes

Core surfaces:

- rule profile card
- room gauges/bars
- playbook selector
- scenario table
- recent warning log

## C. Playbook editor

Top goals:

- define how the system should adapt risk

Core surfaces:

- posture selector
- thresholds
- heat caps
- freeze conditions
- explanation preview

## Recommendation algorithm shape

The final recommended next-trade risk should be constrained by:

- daily room cap
- overall room cap
- playbook cap
- open heat cap
- symbol concentration cap
- factor concentration cap
- recent loss reduction cap

Conceptual formula:

`recommended_risk_now = min(all_active_caps) * safety_modifier`

Where the safety modifier is lower when:

- payout is near
- recent losses accumulate
- execution quality deteriorates
- concentration increases

## UX principles

- explain short, not long
- show hard limits before smart suggestions
- use tables for cross-account decisions
- use scenarios for clarity, not for theatrics
- never hide a blocked state behind pretty visuals

## Risks

- false precision if formulas look more exact than inputs justify
- over-complexity if too many firm-specific variants appear at once
- user distrust if recommendations are not explainable

## Phasing

### Phase 1

- funded account list
- rule profile templates
- room left calculations
- risk mode state
- next-trade recommendation

### Phase 2

- playbooks
- scenario table
- comparison ranking

### Phase 3

- deeper concentration logic
- payout protection mode
- execution-quality-aware reductions

## Open questions for later implementation

- how much of open risk can be derived reliably from current KMFX data
- whether firm templates should be fully prebuilt or user-editable
- whether consistency rules should be generic or firm-specific first

## Related docs

- `docs/product-strategy-trader-first.md`
- `docs/funding-variable-risk-and-ea-strategy.md`
- `docs/domain-model-funding-portfolio-v1.md`
- `docs/policy-evaluation-contract-spec.md`
