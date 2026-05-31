# KMFX Edge Domain Model: Funding and Portfolio V1

Status: domain model specification
Last updated: 2026-05-14
Purpose: define the domain entities, relations, and canonical ownership boundaries for Funding Risk Cockpit and Portfolio Policy features.

## Summary

This document defines the minimum domain model needed to build:

- Funding Risk Cockpit
- Portfolio Policy
- EA export groundwork

It is intentionally aligned with the current KMFX live data contract where possible.

## Modeling principles

- `account` is the live execution identity
- `funding_profile` is the rule identity
- `portfolio` is the clustering identity
- `policy` is the decision layer
- `evaluation` is the computed state layer
- `recommendation` is the trader-facing action layer

Do not collapse all of this into one giant account object.

## Current contract anchors

Current live contract already exposes useful building blocks:

- `account_id`, `broker`, `platform`, `login`, `server`, `status`, `last_sync_at`
- `dashboard_payload`
- `reportMetrics`
- `riskSnapshot.summary`
- `riskSnapshot.status`
- `riskSnapshot.policy`
- `riskSnapshot.policy_evaluation`
- `riskSnapshot.symbol_exposure`
- `riskSnapshot.open_trade_risks`

Reference:

- `docs/production-readiness-audit.md`
- `js/data/adapters/mt5-account-adapter.js`
- `js/modules/risk-selectors.js`

## Entity map

## 1. TradingAccount

Canonical live account object.

Fields:

- `accountId`
- `userId`
- `displayName`
- `broker`
- `platform`
- `login`
- `server`
- `connectionMode`
- `connectionState`
- `status`
- `lastSyncAt`
- `baseCurrency`
- `startingBalance`
- `balance`
- `equity`
- `floatingPnl`
- `closedPnl`
- `totalPnl`
- `openPositionsCount`
- `sourceType`

Owns:

- live trading identity
- current balances/equity
- connection metadata

Does not own:

- funding rules
- portfolio policy
- advisory decisions

## 1A. FundingJourney

Canonical lifecycle object for a funding process.

It groups all accounts and phases that belong to the same purchased challenge or funded path.

Fields:

- `fundingJourneyId`
- `userId`
- `firmId`
- `firmName`
- `programId`
- `programName`
- `accountSize`
- `baseCurrency`
- `currentStage`
- `journeyStatus`
- `startedAt`
- `completedAt`
- `fundedAt`
- `closedAt`
- `failureReason`
- `notes`

Allowed `currentStage`:

- `phase_1`
- `phase_2`
- `funded`
- `closed`

Allowed `journeyStatus`:

- `active`
- `passed_phase_1`
- `passed_phase_2`
- `funded_active`
- `funded_closed`
- `failed`
- `cancelled`

Owns:

- lifecycle identity across phase changes
- continuity when MT5 login/account changes
- aggregate status and history

Does not own:

- live balances directly
- individual trade execution identity

## 1B. FundingStageAccount

Link between one `FundingJourney` stage and one `TradingAccount`.

Fields:

- `fundingStageAccountId`
- `fundingJourneyId`
- `accountId`
- `stage`
- `stageStatus`
- `startedAt`
- `endedAt`
- `startingBalance`
- `endingBalance`
- `startingEquity`
- `endingEquity`
- `profitAmount`
- `profitPct`
- `maxDrawdownAmount`
- `maxDrawdownPct`
- `tradeCount`
- `resultSnapshotId`
- `notes`

Allowed `stage`:

- `phase_1`
- `phase_2`
- `funded`

Allowed `stageStatus`:

- `pending`
- `active`
- `passed`
- `failed`
- `closed`

Owns:

- per-phase linkage to MT5 login/account
- phase result summary
- stage-level snapshot after completion

## 1C. FundingPayout

Ledger object for payout lifecycle.

Fields:

- `fundingPayoutId`
- `fundingJourneyId`
- `accountId`
- `requestedAt`
- `paidAt`
- `status`
- `grossAmount`
- `traderSplitAmount`
- `firmSplitAmount`
- `feesAmount`
- `netReceivedAmount`
- `currency`
- `method`
- `proofUrl`
- `notes`

Allowed `status`:

- `draft`
- `pending`
- `paid`
- `rejected`
- `cancelled`

Owns:

- payout request and payment state
- bruto/neto economics for funded accounts

## 1D. ManualFundingTransaction

Manual ledger entry for funding economics that are not trading PnL.

Fields:

- `manualFundingTransactionId`
- `fundingJourneyId`
- `accountId`
- `type`
- `occurredAt`
- `amount`
- `currency`
- `method`
- `status`
- `proofUrl`
- `notes`

Allowed `type`:

- `challenge_fee`
- `reset_fee`
- `refund`
- `commission`
- `manual_adjustment`

Owns:

- fees, resets, refunds and adjustments
- net profitability of funding activity

## 1E. FundingTimelineEvent

Append-only event used to reconstruct the journey.

Fields:

- `fundingTimelineEventId`
- `fundingJourneyId`
- `accountId`
- `eventType`
- `occurredAt`
- `title`
- `description`
- `metadata`

Example `eventType` values:

- `challenge_purchased`
- `stage_started`
- `account_linked`
- `stage_passed`
- `stage_failed`
- `funded_account_received`
- `payout_requested`
- `payout_paid`
- `reset_purchased`
- `manual_note_added`

Owns:

- human-readable lifecycle history
- audit trail for phase/account transitions

## 2. FundingProfile

Rule identity attached to an account when it belongs to a challenge or funded program.

Fields:

- `fundingProfileId`
- `accountId`
- `firmId`
- `firmName`
- `programId`
- `programName`
- `phaseId`
- `phaseName`
- `accountSize`
- `drawdownType`
- `dailyResetMode`
- `ruleVersionLabel`
- `sourceUrl`
- `verified`
- `requiresReview`
- `notes`

Owns:

- firm/program/phase context
- provenance of rules

Relation:

- belongs to one `TradingAccount`
- may also be attached through `FundingStageAccount` when the account is part of a `FundingJourney`

## 3. FundingRuleSet

Normalized rule payload used by the policy engine.

Fields:

- `dailyLossLimitPct`
- `dailyLossLimitAmount`
- `dailyLossBasis`
- `maxLossLimitPct`
- `maxLossLimitAmount`
- `maxLossBasis`
- `trailingLossEnabled`
- `floatingLossCounts`
- `consistencyRuleEnabled`
- `consistencyThresholdPct`
- `minimumTradingDays`
- `payoutCycleDays`
- `profitTargetPct`
- `ruleTimezone`
- `resetTime`

Owns:

- machine-usable rule definitions

## 4. RiskPolicy

Trader or system-configured policy layer.

Fields:

- `riskPolicyId`
- `scopeType`
- `scopeId`
- `version`
- `defaultRiskPerTradePct`
- `dailyDrawdownLimitPct`
- `maxDrawdownLimitPct`
- `portfolioHeatLimitPct`
- `maxVolume`
- `allowedSessions`
- `allowedSymbols`
- `autoBlockEnabled`
- `maxConcurrentPositions`
- `maxSymbolExposurePct`
- `maxFactorExposurePct`
- `reduceAfterConsecutiveLosses`
- `reduceAfterExecutionDeterioration`
- `playbookId`
- `policySource`

Allowed scope:

- account
- portfolio
- strategy

## 5. RiskPlaybook

Reusable policy posture template.

Fields:

- `playbookId`
- `name`
- `mode`
- `description`
- `riskCapPct`
- `heatCapPct`
- `maxConcurrentPositions`
- `freezeOnDailyRoomPct`
- `freezeOnOverallRoomPct`
- `reduceAtLossStreak`
- `reduceAtPayoutWindow`
- `priority`

Example modes:

- defensive
- standard
- assertive
- payout_defense
- challenge_push

## 6. RiskEvaluation

Computed state for one account at one moment.

Fields:

- `evaluationId`
- `accountId`
- `asOf`
- `riskStatus`
- `severity`
- `reasonCode`
- `blockingRule`
- `allowNewTrades`
- `blockNewTrades`
- `reduceSize`
- `closePositionsRequired`
- `dailyRoomLeftAmount`
- `dailyRoomLeftPct`
- `overallRoomLeftAmount`
- `overallRoomLeftPct`
- `openHeatAmount`
- `openHeatPct`
- `heatUsageRatioPct`
- `maxOpenTradeRiskPct`
- `portfolioHeatLimitPct`
- `distanceToHeatLimitPct`
- `policyBreaches[]`
- `policyWarnings[]`
- `evaluationConfidence`

Owns:

- computed account state
- enforcement state
- explainable flags

## 7. RiskRecommendation

Trader-facing advice derived from evaluation.

Fields:

- `recommendationId`
- `accountId`
- `asOf`
- `mode`
- `status`
- `maxRiskAllowedNowPct`
- `recommendedRiskNowPct`
- `maxAdditionalHeatPct`
- `maxConcurrentPositionsNow`
- `safeSizeBand`
- `nextTradeAdvisory`
- `assumptions[]`
- `blockedReasons[]`

This should be separate from raw evaluation because advice can be simpler than the full calculation graph.

## 8. PositionRisk

Open-position risk leaf node.

Fields:

- `accountId`
- `positionId`
- `symbol`
- `side`
- `volume`
- `entryPrice`
- `currentPrice`
- `stopLossPrice`
- `takeProfitPrice`
- `riskAmount`
- `riskPct`
- `profit`
- `hasBoundedRisk`
- `strategyTag`

Maps well to current `open_trade_risks`.

## 9. SymbolExposure

Per-symbol concentration node.

Fields:

- `accountId`
- `symbol`
- `netExposureAmount`
- `grossExposureAmount`
- `openRiskAmount`
- `openRiskPct`
- `positionCount`
- `concentrationTone`
- `pressureLabel`

Maps well to current `symbol_exposure`.

## 10. Portfolio

Cluster of accounts under one operating policy.

Fields:

- `portfolioId`
- `userId`
- `name`
- `description`
- `objective`
- `status`
- `baseCurrency`
- `createdAt`
- `updatedAt`

## 11. PortfolioAccount

Join entity between portfolio and trading account.

Fields:

- `portfolioAccountId`
- `portfolioId`
- `accountId`
- `role`
- `priority`
- `riskBudgetPct`
- `maxHeatPct`
- `enabled`

Role examples:

- lead
- follower
- challenge
- payout_protection
- experimental

## 12. StrategyProfile

Canonical strategy/setup identity.

Fields:

- `strategyId`
- `name`
- `shortCode`
- `category`
- `timeframe`
- `sessionBias`
- `defaultSymbols`
- `active`

## 13. PortfolioStrategyPolicy

Per-portfolio strategy permission layer.

Fields:

- `portfolioStrategyPolicyId`
- `portfolioId`
- `strategyId`
- `permission`
- `priority`
- `riskCapPct`
- `maxConcurrentTrades`
- `allowedSessions`
- `allowedSymbols`

Permissions:

- allowed
- limited
- blocked

## 14. RoutingPolicy

Rules for distributing or blocking trade ideas across accounts.

Fields:

- `routingPolicyId`
- `portfolioId`
- `copyMode`
- `splitMode`
- `maxAccountsPerIdea`
- `preferSafestAccount`
- `blockOnCorrelation`
- `blockOnHeat`
- `blockOnFundingDanger`
- `allowFollowerAccounts`

## 15. EAPolicyPackage

Exportable machine-readable policy artifact.

Fields:

- `packageId`
- `portfolioId`
- `version`
- `targetRuntime`
- `exportMode`
- `generatedAt`
- `checksum`
- `accounts[]`
- `strategyPermissions[]`
- `riskCaps`
- `routingRules`
- `freezeRules`

Export modes:

- risk_guardian
- portfolio_router
- strategy_bound

## 16. RiskScenario

Reusable simulated outcome for the cockpit.

Fields:

- `scenarioId`
- `accountId`
- `scenarioType`
- `inputRiskPct`
- `inputTradesCount`
- `inputCorrelationMode`
- `resultingEquity`
- `resultingDailyRoomPct`
- `resultingOverallRoomPct`
- `breach`
- `breachReason`

Scenario types:

- next_trade_loss
- two_trade_loss
- open_positions_stop
- floating_loss_expansion

## Relationship map

- one `TradingAccount` may have zero or one `FundingProfile`
- one `FundingProfile` has one `FundingRuleSet`
- one `TradingAccount` has zero or one active `RiskPolicy`
- one `RiskPolicy` may reference zero or one `RiskPlaybook`
- one `TradingAccount` has many `PositionRisk`
- one `TradingAccount` has many `SymbolExposure`
- one `TradingAccount` has many `RiskEvaluation` over time
- one `RiskEvaluation` may produce one `RiskRecommendation`
- one `Portfolio` has many `PortfolioAccount`
- one `Portfolio` has many `PortfolioStrategyPolicy`
- one `Portfolio` has one active `RoutingPolicy`
- one `Portfolio` may produce many `EAPolicyPackage` versions

## Canonical ownership boundaries

## Account layer

Owns:

- live sync
- positions
- trades
- balances
- MT5 identity

## Funding layer

Owns:

- prop-firm program
- phase
- rule provenance
- normalized funding rules

## Policy layer

Owns:

- trader preferences
- playbooks
- caps
- permissions
- freezes

## Evaluation layer

Owns:

- current constrained state
- breaches
- warnings
- advisories

## Portfolio layer

Owns:

- account grouping
- account roles
- strategy permissions
- routing logic

## Suggested TypeScript file map

- `src/features/accounts/domain/account.ts`
- `src/features/funding/domain/funding-profile.ts`
- `src/features/funding/domain/funding-rules.ts`
- `src/features/risk/domain/risk-policy.ts`
- `src/features/risk/domain/risk-evaluation.ts`
- `src/features/risk/domain/risk-recommendation.ts`
- `src/features/risk/domain/position-risk.ts`
- `src/features/risk/domain/symbol-exposure.ts`
- `src/features/portfolio/domain/portfolio.ts`
- `src/features/portfolio/domain/portfolio-account.ts`
- `src/features/portfolio/domain/portfolio-strategy-policy.ts`
- `src/features/portfolio/domain/routing-policy.ts`
- `src/features/ea/domain/ea-policy-package.ts`

## Implementation notes

- `FundingProfile` and `FundingRuleSet` should be cached and versioned
- `RiskEvaluation` should be recomputable and not manually edited
- `RiskRecommendation` can be ephemeral
- `EAPolicyPackage` must be versioned and auditable

## Related docs

- `docs/prd-funding-risk-cockpit.md`
- `docs/prd-portfolio-policy-and-ea-export.md`
- `docs/funding-variable-risk-and-ea-strategy.md`
