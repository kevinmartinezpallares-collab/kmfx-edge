# MT5 Data Contract v1

## Purpose

This document is the v1 contract between the MT5 EA, backend ingest layer, frontend adapter, and KMFX Edge dashboard before packaging the EA for users.

The contract freezes the expected read-only connector payload and the frontend semantics already implemented for MT5 normalization, partial-close grouping, close-date Calendar grouping, and accounting timezone handling.

Do not change runtime behavior to match this document without a focused implementation phase and regression tests.

## Transport Rules

- `connection_key` must not be sent in URL or query string.
- Supported key transport:
  - `X-KMFX-Connection-Key` request header.
  - Body field only for compatibility with existing bridge/launcher paths.
- Backend routes must reject query-string keys in normal production operation.
- Logs must mask connection keys, API keys, tokens, passwords, and secrets.
- Persisted account/dashboard payloads must not contain full connection keys.
- Account ownership and user scoping are resolved by backend/account service, not by frontend inference.

## Payload Blocks

### A. Metadata

Blocking for production connector:

| Field | Type | Notes |
|---|---|---|
| `type` | string | Expected `kmfx_connector_sync`. |
| `connector_version` | string | EA/connector version, for compatibility gates. |
| `mode` | string | Current connector mode. Public connector should be read-only semantics. |
| `sync_id` | string | Idempotency key for backend duplicate detection. |
| `timestamp` | string | MT5/server timestamp string. |
| `timestamp_unix` | number | Unix seconds. Preferred for canonical UTC conversion. |

Optional/enhanced:

| Field | Type | Notes |
|---|---|---|
| `capabilities` | object | Future explicit capability flags. |

### B. Account Identity

Blocking for production connector:

| Field | Type | Notes |
|---|---|---|
| `account.login` or root `login` | string/number | Required for MT5 identity. |
| `account.name` | string | Display label if broker exposes it. |
| `account.broker` / company | string | Broker/company name. |
| `account.server` | string | MT5 server. |
| `platform` | string | Expected `mt5`, backend may derive. |
| `account.currency` | string | Account currency. |

Optional/enhanced:

| Field | Type | Notes |
|---|---|---|
| `account.leverage` | string/number | Used for account context. |
| `account.account_type` | string | Demo/live/real if broker exposes it. |

### C. Account Snapshot

Blocking for production connector:

| Field | Type | Notes |
|---|---|---|
| `account.balance` | number | Current balance. |
| `account.equity` | number | Current equity. |
| `account.margin` | number | Used by account/risk panels. |
| `account.free_margin` | number | Used by account/risk panels. |
| `account.margin_level` | number | Margin health. |
| `floating_pnl` / `account.profit` | number | Open/floating P&L. |
| `account.currency` | string | Account currency. |

Optional/enhanced:

| Field | Type | Notes |
|---|---|---|
| `daily_start_equity` | number | Daily drawdown basis. |
| `daily_peak_equity` | number | Daily intraday peak. |
| `equity_peak` | number | Total drawdown peak. |
| `daily_dd_pct` | number | EA-side telemetry. |
| `total_dd_pct` | number | EA-side telemetry. |
| `closedPnl` | number | Backend/frontend can derive from trades. |

### D. Open Positions

Blocking for production connector:

| Field | Type | Notes |
|---|---|---|
| `ticket` | string/number | Position ticket. |
| `position_id` | string/number | Stable position grouping key when available. |
| `symbol` | string | Broker symbol, including suffix. |
| `type` / `side` | string | `BUY` or `SELL`. |
| `volume` | number | Current open volume. |
| `price_open` | number | Entry/open price. |
| `price_current` | number | Current price. |
| `sl` | number | Stop loss, `0` if absent. |
| `tp` | number | Take profit, `0` if absent. |
| `time` | string | Open timestamp. |
| `time_unix` | number | Open unix seconds, preferred. |
| `profit` / `floating_pnl` | number | Floating result. |

Optional/enhanced:

| Field | Type | Notes |
|---|---|---|
| `swap` | number | Position swap where available. |
| `risk_amount` | number | EA-estimated open risk. |
| `risk_pct` | number | EA-estimated account risk percentage. |
| `strategy_tag` / `comment` | string | MT5 comment or strategy tag. |
| `magic` | string/number | EA magic number if available. |

### E. Closed Trades / Deals

Current model sends one close deal per row. Frontend groups rows into one UI trade by `position_id` when available.

Blocking for production connector:

| Field | Type | Notes |
|---|---|---|
| `trade_id` | string | Deal/trade row id. |
| `ticket` | string/number | MT5 deal ticket. |
| `position_id` | string/number | Primary grouping key for partial closes. |
| `symbol` | string | Broker symbol. |
| `type` | string | MT5 deal side. |
| `direction` | string | Original/open position direction when available. |
| `volume` | number | Closed volume for this deal. |
| `open_price` | number | Entry price from matching entry deal. |
| `price` / `exit_price` | number | Close/exit price. |
| `open_time` | string | Entry/open timestamp. |
| `time` / `close_time` | string | Close timestamp. |
| `open_time_unix` | number | Open unix seconds, preferred. |
| `time_unix` / `close_time_unix` | number | Close unix seconds, preferred. |
| `profit` | number | Gross deal result. |
| `commission` | number | Total allocated commission. |
| `swap` | number | Total allocated swap. |
| `net` | number | `profit + commission + swap + fees/dividend` if available. |

Optional/enhanced:

| Field | Type | Notes |
|---|---|---|
| `order_id` | string/number | MT5 order id if available. |
| `deal_id` | string/number | Explicit deal id if different from ticket. |
| `comment` | string | Cleaned MT5 comment. |
| `strategy_tag` | string | Strategy/setup label. |
| `magic` | string/number | EA magic number if available. |

### F. Partials / Executions

Current connector contract:

- One close deal is sent per row.
- Frontend adapter groups rows by `position_id`.
- One MT5 position should become one grouped UI trade.
- Partial close executions remain visible in `trade.partials` and `trade.executions`.
- Cumulative P&L may remain frontend-derived.

Each close deal must preserve:

| Field | Required | Notes |
|---|---:|---|
| `ticket` / deal id | Yes | Unique execution identity. |
| `position_id` | Yes when MT5 provides it | Primary grouping key. |
| `time` / `time_unix` | Yes | Close timestamp. Unix wins. |
| `volume` | Yes | Partial closed volume. |
| `price` | Yes | Partial close price. |
| `profit` | Yes | Gross result. |
| `commission` | Yes | Fees for this partial allocation. |
| `swap` | Yes | Swap for this partial allocation. |
| `net` | Yes | Net result for this partial. |

### G. Symbol Specs

Blocking for production connector where broker exposes the symbol:

| Field | Type | Notes |
|---|---|---|
| `symbol` | string | Exact broker symbol. |
| `digits` | number | Broker precision. |
| `point` | number | Symbol point. |
| `tickSize` | number | Tick size. |
| `tickValue` | number | Tick value. |
| `tickValueProfit` | number | Profit tick value. |
| `tickValueLoss` | number | Loss tick value. |
| `contractSize` | number | Contract size. |
| `volumeMin` | number | Minimum volume. |
| `volumeMax` | number | Maximum volume. |
| `volumeStep` | number | Volume step. |
| `currencyProfit` | string | Profit currency. |
| `currencyMargin` | string | Margin currency. |
| `tradeCalcMode` | string/number | MT5 calculation mode. |
| `spread` | number | Current/broker spread value. |
| `accountCurrency` | string | Account currency context. |

### H. Risk Telemetry, Read-Only

Optional/enhanced for read-only connector:

| Field | Notes |
|---|---|
| Open risk / `risk_amount` | Can be sent per position. |
| Open risk % / `risk_pct` | Can be sent per position. |
| Daily drawdown | `daily_dd_pct`, `daily_start_equity`, `daily_peak_equity`. |
| Total drawdown | `total_dd_pct`, `equity_peak`. |
| Policy hash received | Telemetry only unless RiskGuard is enabled. |
| Last policy received/applied | Telemetry only unless RiskGuard is enabled. |
| MT5 limit states | Optional EA telemetry. |

### I. Capabilities

Future capability block should use explicit booleans:

```json
{
  "supports_symbol_specs": true,
  "supports_partials": true,
  "supports_unix_timestamps": true,
  "supports_risk_telemetry": true,
  "supports_policy_receive": false,
  "supports_active_enforcement": false,
  "supports_journal_batches": true
}
```

For public `KMFXConnector`, `supports_active_enforcement` must be `false`.

## Section Dependency Matrix

| Section | Blocks Used | Required | Optional/Enhanced | Fallback/Inferred |
|---|---|---|---|---|
| Dashboard | Account snapshot, positions, trades, history, report metrics, risk snapshot | balance, equity, floating P&L, trades | reportMetrics, riskSnapshot, symbolSpecs | frontend model derives totals/dayStats if metrics absent |
| Cuentas | Metadata, account identity, latest sync, key status | login, broker, server, account id | connector version, last policy | backend account store |
| Capital | Account snapshot, positions, trades | balance, equity, open positions, closed P&L | history, drawdown | frontend model aggregation |
| Operaciones | Closed trades/deals, partials/executions | trade rows with symbol, volume, time, P&L | SL/TP, setup, comment, magic | grouped adapter model |
| Calendario | Closed trades/deals, date keys | close time/unix, net P&L | monthKey, partial detail | `tradingDayKey` from final close date |
| Funding | Linked account snapshot and model totals | balance, equity, open/closed P&L | trades/dayStats | local journey/ledger data remains separate |
| Herramientas | Symbol specs, account currency | symbol, tick/point/volume specs for broker-specific precision | risk snapshot specs | static FX/XAU fallback, clearly not broker-exact |
| Ejecución | Grouped trades, timestamps, tags | stable trade id, close/open time, P&L | setup/comment, SL/TP | local/manual tags and inferred compliance |
| Risk Engine | Account snapshot, positions, symbol specs, risk telemetry | equity, positions, SL, volume, symbol | policy snapshot, open risk telemetry | backend/frontend risk metrics |
| Analytics | Trades, dayStats, hours/weekdays/sessions | grouped trades with close time and P&L | risk snapshot | model-derived buckets |

## Required, Optional, Inferred

Blocking required for production connector:

- Secure key transport.
- Metadata: `type`, `connector_version`, `sync_id`, timestamps.
- Account identity: `login`, broker/company, server, currency.
- Account snapshot: balance, equity, margin/free margin, floating P&L.
- Positions: ticket/position id, symbol, side, volume, prices, SL/TP, open time/unix, floating P&L.
- Closed deals: ticket/trade id, position id, symbol, side/direction, volume, entry/exit price, open/close timestamps/unix, profit, commission, swap, net.
- Symbol specs for active/recent/common symbols where broker provides them.

Optional/enhanced:

- Magic, order id, explicit deal id, account type, detailed policy telemetry, journal metadata.

Inferred/fallback:

- Grouped UI trade from deal rows.
- Partials/executions arrays.
- Cumulative partial P&L.
- Session/hour/day analytics.
- Calendar/dayStats keys when missing.
- Closed P&L/report metrics if not sent explicitly.

## Date/Time Rules

- Preserve raw MT5 timestamps where available.
- Prefer unix timestamp fields over broker-time strings.
- Canonical frontend timestamps are ISO UTC internally.
- Default accounting timezone is `Europe/Andorra`.
- Calendar realized P&L uses final/latest close date.
- Cross-day partial closes are grouped as one UI trade on the final close day.
- Open/activity date is separate from realized close date.
- Browser local timezone must not silently change accounting day keys.
