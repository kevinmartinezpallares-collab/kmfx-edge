# Funding Firm Rules Sourcebook

Verified date: 2026-06-05

## Purpose

Funding rules must be source-backed before RiskGuard or any funding surface treats them as account policy.

If a connected account is a funded, challenge, evaluation, instant-funded, or allocation account, KMFX must resolve rules from the exact firm, program, phase, account size, platform/server time, and source version. Do not infer firm rules from generic prop-firm defaults.

## Product Rule

For a funded account, the active rule set is:

1. User/account-specific override with provenance.
2. Verified firm/program/phase rule set.
3. Imported backend `fundingProfile` only when it carries the same program and phase metadata.
4. `requires_review` when any key field is missing.

Never use a fallback limit as confirmed firm policy. A default such as 3% daily loss can be shown only as a suggested monitor boundary with visible provenance.

## Required Rule Fields

Each rule set needs:

- `firmId`
- `firmName`
- `programId`
- `programName`
- `phaseId`: `phase_1`, `phase_2`, `funded`, or a future explicit stage
- `accountSize`
- `currency`
- `profitTargetPct`
- `dailyLossLimitPct`
- `dailyLossBaseline`: initial balance, day-opening balance, day-opening equity, higher of opening balance/equity, or previous-day close balance/equity
- `dailyResetTime`
- `dailyResetTimezone`
- `floatingLossCounts`
- `maxLossLimitPct`
- `maxLossType`: static, trailing equity, trailing balance, trailing lock, daily recalculated high-water
- `maxLossBaseline`
- `minimumTradingDays`
- `minimumTrades`
- `bestDayRulePct`
- `consistencyThresholdPct`
- `newsRule`
- `weekendHoldingRule`
- `maxRiskPerTradePct`
- `stopLossRequired`
- `payoutCycleDays`
- `sourceUrl`
- `sourceLabel`
- `verifiedAt`
- `requiresReview`

## Source Priority

Use official documentation first:

1. Firm help center, official terms, official challenge pages, or dashboard-exported rules.
2. Official PDF terms when help-center pages are incomplete.
3. Third-party summaries only as discovery hints, never as verified policy.

If official docs disagree, prefer the more specific document in this order:

1. Program-specific page.
2. Account-stage-specific page.
3. Current terms and conditions.
4. Generic FAQ.

## Firm Findings

### FTMO

Official sources:

- https://ftmo.com/en/trading-objectives/

Known current structures:

- FTMO Challenge 1-Step:
  - Profit target: 10%.
  - Daily loss: 3% of initial simulated capital.
  - Daily baseline: account balance recorded at 00:00 CE(S)T minus daily loss amount.
  - Floating P/L counts because the rule is based on equity.
  - Maximum loss: 10% of initial simulated capital, but recalculated against the highest account balance at 00:00 CE(S)T or initial capital, whichever is higher. This is a daily high-water style rule, not a simple static floor.
  - Best Day Rule: 50%.
  - Funded/account stage: no profit target, drawdown objectives remain.
- FTMO Challenge 2-Step:
  - Phase 1 target: 10%.
  - Verification target: 5%.
  - Daily loss: 5% of initial simulated capital.
  - Daily reset: 00:00 CE(S)T.
  - Floating P/L counts because the rule is based on equity.
  - Maximum loss: 10% static from initial simulated capital.
  - Minimum trading days: 4 for both evaluation phases.
  - Funded/account stage: no profit target, drawdown objectives remain.

Implementation notes:

- Do not collapse FTMO 1-Step and 2-Step into one rule profile.
- FTMO 1-Step max loss needs high-water midnight balance logic.
- FTMO daily loss uses balance at reset minus a fixed amount based on initial capital.

### The5ers

Official sources:

- https://help.the5ers.com/what-are-the-general-rules-for-the-high-stakes-program/
- https://help.the5ers.com/what-is-the-drawdown-rule-for-high-stakes/
- https://help.the5ers.com/what-is-the-maximum-loss-and-the-maximum-daily-loss-in-the-high-stakes-program/

Known current structure:

- High Stakes is a 2-step evaluation.
- New High Stakes:
  - Phase 1 target: 10%.
  - Phase 2 target: 5%.
  - Minimum profitable trading days: 3.
- Classic High Stakes:
  - Phase 1 target: 8%.
  - Phase 2 target: 5%.
  - Minimum profitable trading days: 3.
- Daily drawdown: 5% from the higher of previous-day closing equity or balance at 00:00 server time.
- Maximum loss: 10% of initial balance, absolute drawdown.
- Inactivity: 30 consecutive days without trading activity.

Implementation notes:

- The daily baseline is not simply initial balance.
- Use previous-day close balance/equity high baseline.
- Distinguish New High Stakes from Classic High Stakes.

### The Funding Pips

Official sources:

- https://help.fundingpips.com/hc/en-us/articles/34501697434385-1-Step-Model
- https://help.fundingpips.com/hc/en-us/articles/34501809112081-2-Step-Standard
- https://help.fundingpips.com/hc/en-us/articles/44559256768529-Understanding-Trading-Mechanics

Known current structure:

- 1-Step Model:
  - Profit target: 10%.
  - Minimum trading days: 3.
  - Daily loss: 3%.
  - Daily baseline: higher of opening balance or opening equity.
  - Reset: 00:00 platform time, documented as UTC+3 in the model page.
  - Floating losses count.
  - Maximum loss: 6% below starting account size; balance or equity cannot fall below that floor.
  - Risk per trade idea applies to Master only, not evaluation.
  - A touched daily/max loss limit is a breach even if the trade later recovers.
- 2-Step Standard:
  - Phase 1 target: 8% or 10%, depending on selected option.
  - Phase 2 target: 5%.
  - Minimum trading days: 3 per phase.
  - Daily loss: 5%.
  - Daily baseline: higher of opening balance or opening equity.
  - Reset: 00:00 platform time, documented as UTC+3.
  - Floating losses count.
  - Maximum loss: 10% below starting account size; balance or equity cannot touch that floor.
  - Risk per trade idea applies to Master only, not evaluation.
- Master stage:
  - Risk per trade idea applies on Master.
  - Source docs define 3% below $50K and 2% at $50K and above.
  - On Demand reward requires 35% consistency and minimum 2% profit.

Implementation notes:

- The Funding Pips daily loss must evaluate intraday equity touches, not only closed PnL.
- Master Account rules differ from evaluation rules.
- Phase 1 of 2-Step Standard cannot be inferred unless the account metadata says whether the selected target is 8% or 10%.

### Orion Funded

Official sources:

- https://www.orionfunded.com/faq/programs/daily-loss
- https://www.orionfunded.com/faq/programs/max-drawdown
- https://www.orionfunded.com/faq/programs/profit-targets
- https://www.orionfunded.com/docs/terms-and-conditions.pdf

Known current structure:

- Daily loss:
  - Orion Zero: 3%.
  - Orion Lite: 3%.
  - Orion Standard: 3%.
  - Orion Standard Swing: 5%.
  - Orion Select: 5%.
  - Daily cap is fixed and calculated from the starting balance for that account.
- Profit targets:
  - Orion Zero: no target, instant funded access.
  - Orion Lite: 10%.
  - Orion Standard: 6% / 6%.
  - Orion Standard Swing: 8% / 5%.
  - Orion Select: 5% / 5% / 5%.
- Max drawdown types:
  - Static: Orion Standard, Standard Swing, Select.
  - Trailing equity: Orion Lite.
  - Trailing lock: Orion Zero.
  - The official drawdown examples place the floor 6% below starting balance.
- Trader account/funded stage: no minimum profit target; stay inside risk rules.

Implementation notes:

- Orion requires program-specific drawdown type.
- Do not treat all Orion accounts as static.
- Orion Zero is instant-funded and needs trailing-lock handling.

### FundedNext

Official sources:

- https://help.fundednext.com/en/articles/8019915-what-is-the-maximum-loss-limit
- https://help.fundednext.com/es/articles/8019436-que-reglas-debo-seguir-en-el-evaluation-challenge

Known current structure:

- Evaluation Challenge:
  - Daily loss: 5% of initial account balance.
  - Overall loss: 10% of initial account balance; balance/equity cannot drop below 90% during the journey.
  - Minimum activity: 5 individual and separate trades; no minimum trading-day rule on the Evaluation FundedNext Account.
- Maximum loss by plan:
  - Evaluation, Express, Stellar 2-Step: 10%.
  - Stellar 1-Step: 6%.
  - Stellar Lite: 8%.
- FundedNext no longer offers Express and Evaluation to new clients effective 2025-03-18, but existing clients may still have them.

Implementation notes:

- Program availability is time/version dependent.
- Existing client legacy programs must be allowed only when the account metadata proves it.

### Darwinex Zero

Official sources:

- https://darwinexzero.document360.io/docs/es/que-es-darwinex-zero
- https://darwinexzero.document360.io/docs/es/darwinia-gold
- https://help.darwinex.com/es/darwinia-rating

Known current structure:

- Darwinex Zero is not a conventional fixed challenge model.
- The product creates/uses a DARWIN track record and monthly allocation programs.
- DarwinIA GOLD eligibility requires a track record longer than 8 months plus return/drawdown conditions, for example 1-year return greater than 20% and return/drawdown greater than 2.5.
- DarwinIA rating includes return and max drawdown over recent calendar periods.

Implementation notes:

- Do not map Darwinex Zero to FTMO-style daily/max loss rules unless a specific account contract provides those fields.
- Darwinex Zero should be modeled as an allocation/track-record program with rating and return/drawdown eligibility, not a generic “challenge”.
- Current fixture metadata using `account_type: challenge` for Darwinex Zero should require review unless a concrete Darwinex Zero program model is attached.

### WSF / WSFunded

Official sources:

- https://wsfmarkets.com/funded/en/faq/
- https://faq.wsfunded.com/en/articles/10719192-instant-standard
- https://wsfunded.com/faq/

Known current structures:

- Instant Standard:
  - Daily loss: 3%.
  - Daily reset: 00:00 UTC.
  - Daily baseline: equity if there is an open position, otherwise closed balance at the start of the day.
  - Maximum total loss: 6% trailing in one official FAQ source; another WSFunded source describes Instant Standard as 3% daily and trailing drawdown. This needs program/source reconciliation.
- Instant Pro:
  - Daily loss: 3%.
  - Maximum total drawdown: 5% trailing.
  - Max risk per trading idea: 1% of initial balance.
- Wall Street 2-phase models:
  - Some official FAQ entries list 5% daily, 8% or 10% static max drawdown, 10% / 5% targets depending on plan, and mandatory SL within two minutes.

Implementation notes:

- WSF has multiple domains/pages and potentially inconsistent wording. Treat as `requires_review` unless program ID and source URL match exactly.
- Stop-loss requirement can be a rule field, but must not become a dashboard enforcement claim.

### Blue Guardian

Official sources:

- https://help.blueguardian.com/en/articles/14062468-3-step
- https://help.blueguardian.com/en/collections/9988078-account-rules

Known current structure:

- 3 Step:
  - Profit target: 6% on all phases.
  - Daily loss: 4% of initial account balance.
  - Daily reset: 5pm EST.
  - Daily baseline: higher of account balance or equity at reset.
  - Maximum overall drawdown: static; example page states 8% of initial balance.

Implementation notes:

- Blue Guardian has many account types. Only 3 Step is verified here.
- Other Blue Guardian programs require official program-specific extraction before use.

### Alpha Capital Group

Official sources:

- https://alphacapitalgroup.uk/posts/alpha-capital-rules-explained-drawdown-profit-targets-daily-loss-and-evaluation-rules-2026
- https://alphacapitalgroup.uk/static/media/Alpha%20Capital%20Group%20-%20Terms%20and%20Conditions.1138e1cc33686773e244.pdf

Known current structure:

- Alpha One is described in official terms as a 1-step evaluation.
- Phase 1 profit target: 10%.
- The official terms mention max daily drawdown calculated over highest end-of-day balance or equity, but program-specific values must be extracted from the active terms/table before use.
- Qualified Account/funded stage has 0% profit target.
- Payout-related rules can include a Best Day Rule and minimum gross profit requirement depending on payout mode.

Implementation notes:

- Mark rule percentages as `requires_review` until exact program table values are extracted from the official terms for the selected account.

### E8 Markets

Official source status:

- Public search did not surface a stable official rules page with complete current program values during this pass.
- Third-party sources mention multiple E8 programs and consistency rules, but these are not sufficient for verified policy.

Implementation notes:

- E8 must remain `requires_review` until official program rules or dashboard-exported rules are available.
- Do not use third-party percentages as enforced rules.

### MyFundedFX / MyFundedFutures

Official source status:

- Public search surfaced mostly third-party summaries and community posts during this pass.

Implementation notes:

- Keep as `requires_review` until official account rules are provided.
- Futures programs often use different drawdown mechanics from CFD/MT5 prop firms; do not mix futures and MT5 funding logic.

## RiskGuard / Funding Integration Requirements

When RiskGuard eventually becomes usable for funded accounts:

- It must show the matched firm, program, phase, source URL, and verified date.
- It must show `requires_review` when firm/program/phase is unknown.
- It must separate:
  - evaluation pass rules,
  - funded payout rules,
  - conduct rules,
  - technical enforcement state.
- It must calculate daily loss from the firm-specific baseline, not from generic daily PnL.
- It must evaluate open equity/floating losses when the firm counts equity.
- It must distinguish static, trailing, trailing-lock, and high-water drawdown.
- It must never say a rule is enforced in MT5 unless EA acknowledgement proves it.

## Minimum Test Fixtures

Before enabling rule logic in UI, tests should cover:

- FTMO 1-Step high-water max loss.
- FTMO 2-Step static max loss.
- The5ers High Stakes previous-day balance/equity daily baseline.
- FundingPips opening balance/equity daily baseline and intraday touched breach.
- Orion Standard static drawdown.
- Orion Lite trailing equity drawdown.
- Orion Zero trailing-lock drawdown.
- FundedNext legacy Evaluation vs Stellar 1-Step/Stellar Lite.
- Darwinex Zero `requires_review` when no allocation model is attached.
- WSF source conflict requiring review.
