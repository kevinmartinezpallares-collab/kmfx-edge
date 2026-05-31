# KMFX Edge Policy Evaluation Contract Spec

Status: contract specification
Last updated: 2026-05-14
Purpose: define the canonical contract between live account data, policy inputs, evaluation outputs, and trader-facing recommendations for funding and portfolio risk features.

## Summary

This document defines the contract that should exist between:

- live account snapshot
- funding rules
- account or portfolio policy
- evaluation engine
- recommendation surfaces

It is designed to preserve compatibility with the current `riskSnapshot` direction while making future Next.js modules easier to type.

## Contract layers

## 1. Live account snapshot

Incoming factual state.

Minimum shape:

- `account`
- `positions[]`
- `trades[]`
- `reportMetrics`
- `riskSnapshot.summary`
- `riskSnapshot.status`
- `riskSnapshot.policy`
- `riskSnapshot.policy_evaluation`
- `symbolSpecs`

This layer contains facts, not advice.

## 2. Funding rules contract

Normalized per-account rule set.

```ts
type FundingRules = {
  firmId: string
  programId: string
  phaseId: string
  dailyLossLimitPct: number | null
  dailyLossLimitAmount: number | null
  maxLossLimitPct: number | null
  maxLossLimitAmount: number | null
  drawdownType: "static" | "trailing" | "daily_balance_or_equity" | "unknown"
  dailyReset: "server_time" | "local_time" | "unknown"
  floatingLossCounts: boolean
  consistencyRuleEnabled: boolean
  consistencyThresholdPct: number | null
  minimumTradingDays: number | null
  payoutCycleDays: number | null
  sourceUrl: string
  verified: boolean
  requiresReview: boolean
}
```

## 3. Policy input contract

Configurable account or portfolio policy.

```ts
type RiskPolicyInput = {
  scopeType: "account" | "portfolio" | "strategy"
  scopeId: string
  defaultRiskPerTradePct: number | null
  dailyDrawdownLimitPct: number | null
  maxDrawdownLimitPct: number | null
  portfolioHeatLimitPct: number | null
  maxVolume: number | null
  maxConcurrentPositions: number | null
  maxSymbolExposurePct: number | null
  maxFactorExposurePct: number | null
  allowedSessions: string[]
  allowedSymbols: string[]
  autoBlockEnabled: boolean
  playbookId: string | null
  policySource: "user" | "funding" | "account" | "backend" | "assumption" | "default"
}
```

## 4. Evaluation output contract

Machine-readable computed state.

```ts
type RiskEvaluationOutput = {
  asOf: string
  riskStatus: "ok" | "caution" | "danger" | "blocked" | "unavailable"
  severity: "info" | "warning" | "danger"
  reasonCode: string
  blockingRule: string | null
  enforcement: {
    allowNewTrades: boolean
    blockNewTrades: boolean
    reduceSize: boolean
    closePositionsRequired: boolean
  }
  room: {
    dailyRoomLeftAmount: number | null
    dailyRoomLeftPct: number | null
    overallRoomLeftAmount: number | null
    overallRoomLeftPct: number | null
  }
  heat: {
    totalOpenRiskAmount: number | null
    totalOpenRiskPct: number | null
    maxOpenTradeRiskPct: number | null
    portfolioHeatLimitPct: number | null
    heatUsageRatioPct: number | null
    distanceToHeatLimitPct: number | null
  }
  limitsStatus: Record<string, unknown>
  breaches: string[]
  warnings: string[]
  assumptions: string[]
  confidence: "low" | "medium" | "high"
}
```

## 5. Recommendation contract

Trader-facing guidance layer.

```ts
type RiskRecommendation = {
  asOf: string
  mode: "aggressive" | "standard" | "defensive" | "blocked"
  status: "safe" | "caution" | "blocked"
  maxRiskAllowedNowPct: number | null
  recommendedRiskNowPct: number | null
  maxAdditionalHeatPct: number | null
  maxConcurrentPositionsNow: number | null
  safeSizeBand: {
    minPct: number | null
    maxPct: number | null
  } | null
  nextTradeAdvisory: string
  blockedReasons: string[]
  assumptions: string[]
}
```

## Canonical evaluation flow

1. ingest live account facts
2. resolve funding rules
3. resolve active policy
4. resolve active playbook
5. compute active caps
6. evaluate breaches and warnings
7. produce recommendation

## Active caps model

Evaluation should compute multiple caps independently:

- rule room cap
- playbook cap
- open heat cap
- symbol cap
- factor cap
- volume cap
- session cap
- execution deterioration cap

Then derive:

`final_allowed_risk = min(all_non_null_caps)`

This matches the product direction already discussed.

## Mapping to current `riskSnapshot`

Current snapshot already carries useful equivalents:

- `riskSnapshot.summary.total_open_risk_pct`
- `riskSnapshot.summary.max_risk_per_trade_pct`
- `riskSnapshot.summary.portfolio_heat_limit_pct`
- `riskSnapshot.status.risk_status`
- `riskSnapshot.status.severity`
- `riskSnapshot.status.enforcement`
- `riskSnapshot.policy`
- `riskSnapshot.policy_evaluation.breaches`
- `riskSnapshot.policy_evaluation.warnings`

Recommended future shape:

- keep `riskSnapshot` as the transport payload
- make the above interfaces the typed domain adapters in Next

## Portfolio policy contract

For multi-account routing and future EA export:

```ts
type PortfolioPolicy = {
  portfolioId: string
  accounts: Array<{
    accountId: string
    role: string
    riskBudgetPct: number | null
    maxHeatPct: number | null
    enabled: boolean
  }>
  strategyPermissions: Array<{
    strategyId: string
    permission: "allowed" | "limited" | "blocked"
    riskCapPct: number | null
    allowedSessions: string[]
    allowedSymbols: string[]
  }>
  routing: {
    copyMode: "none" | "copy_all" | "copy_selected"
    splitMode: "none" | "equal" | "weighted"
    maxAccountsPerIdea: number | null
    preferSafestAccount: boolean
    blockOnCorrelation: boolean
    blockOnHeat: boolean
    blockOnFundingDanger: boolean
  }
}
```

## EA package contract

Initial safe target:

```ts
type EAPolicyPackage = {
  packageId: string
  version: string
  generatedAt: string
  exportMode: "risk_guardian" | "portfolio_router" | "strategy_bound"
  portfolioPolicy: PortfolioPolicy
  emergencyFreeze: {
    enabled: boolean
    freezeOnBlockedStatus: boolean
    freezeOnDailyRoomBelowPct: number | null
    freezeOnOverallRoomBelowPct: number | null
  }
}
```

## Validation rules

- no default policy may create breach on its own
- all computed breaches must identify source
- all recommendations must expose assumptions
- unbounded risk must not be rendered as zero risk
- missing rule provenance must set `requiresReview`

These match earlier metric and risk audit decisions.

## Suggested adapter ownership

- backend transport adapters:
  - normalize raw MT5 and backend payloads
- funding adapters:
  - map preset firms/programs into `FundingRules`
- risk domain:
  - compute `RiskEvaluationOutput`
- recommendation domain:
  - reduce evaluation into trader-facing `RiskRecommendation`
- portfolio domain:
  - evaluate cross-account policy
- ea domain:
  - serialize `EAPolicyPackage`

## EA export safety boundary

For the Next.js migration, `EAPolicyPackage` is contract groundwork only.

It must not trigger a real export, sync, file write, launcher action, MT5 bridge command, or EA enforcement flow until:

- portfolio policy provenance is explicit;
- risk evaluation has source-aware breaches/warnings;
- package validation produces a deterministic pass/fail result;
- rollback and audit telemetry are defined;
- the user explicitly enters a future export center flow.

Until then, UI may show `policy readiness`, but not an active export button.

## Related docs

- `docs/domain-model-funding-portfolio-v1.md`
- `docs/prd-funding-risk-cockpit.md`
- `docs/prd-portfolio-policy-and-ea-export.md`
- `docs/metrics-audit-roadmap.md`
