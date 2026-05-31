# KMFX Edge Field Source Map v1

Estado: mapa operativo de fuentes  
Ultima revision: 2026-05-14  
Alcance: traducir el diccionario de datos a una vista practica de ingestion, adaptacion, persistencia, derivacion y consumo por modulo.

## Proposito

El diccionario de datos define que significa cada campo.

Este documento responde otra pregunta:

- por donde entra ese dato;
- donde se transforma;
- donde se persiste;
- quien lo consume;
- y que fallback existe si falta.

Esto es clave para la migracion porque evita que una ruta Next invente su propia version del mismo dato.

## Leyenda

Columnas:

- `entrada`: punto en el que el dato aparece por primera vez
- `adaptacion`: capa que lo normaliza
- `persistencia`: donde queda guardado si aplica
- `derivacion`: donde se recalcula o completa
- `consumo principal`: modulos/rutas que dependen de el
- `fallback`: comportamiento si no llega completo

## 1. Cuenta e identidad

| Bloque / campo | Entrada | Adaptacion | Persistencia | Derivacion | Consumo principal | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| `accountId` | `/api/accounts/snapshot` | `mt5-account-adapter` | `trading_accounts` | no | Accounts, Dashboard, Risk, Capital | no hay |
| `userId` | backend account service | none frontend | `trading_accounts` | no | ownership guard, account isolation | bloquear acceso |
| `login` | EA payload | `mt5-account-adapter` | account record metadata/snapshot | no | Accounts, account identity, support flows | mostrar cuenta sin login solo en admin/dev |
| `broker` | EA payload | `mt5-account-adapter` | snapshot/account record | no | Accounts, Dashboard, shell context | `Unknown broker` |
| `server` | EA payload | `mt5-account-adapter` | snapshot/account record | no | Accounts, shell status, debug | vacio visible solo si falta |
| `platform` | EA payload / backend | `mt5-account-adapter` | account record | no | Accounts, adapters, diagnostics | asumir `mt5` solo como display, no como verdad oculta |
| `status` | backend account service | none frontend | `trading_accounts` | no | Accounts, gating, entitlement states | `pending`/unknown |
| `lastSyncAt` | backend snapshot envelope | `accounts-live-snapshot` | `trading_accounts.last_synced_at` | no | shell, Accounts, freshness notices | stale/pending copy |

## 2. Snapshot economico

| Bloque / campo | Entrada | Adaptacion | Persistencia | Derivacion | Consumo principal | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| `balance` | EA payload | `mt5-account-adapter` | snapshot payload | no | Dashboard, Accounts, Capital, Risk | no mostrar como live si falta |
| `equity` | EA payload | `mt5-account-adapter` | snapshot payload | no | Dashboard, Risk, Capital | no mostrar como live si falta |
| `floatingPnl` | EA payload | `mt5-account-adapter` | snapshot payload | parcial en adapter | Dashboard, Capital, Risk | derivar desde positions si consistente |
| `closedPnl` | backend snapshot if present | `mt5-account-adapter` | snapshot payload | `frontend_selector` | Dashboard, Capital | derivar desde trades cerrados |
| `totalPnl` | backend snapshot if present | `mt5-account-adapter` | snapshot payload | `frontend_selector` | Dashboard, Capital | `closed + floating` |
| `margin` | EA payload | `mt5-account-adapter` | snapshot payload | no | Accounts, Risk | esconder bloque si no existe |
| `freeMargin` | EA payload | `mt5-account-adapter` | snapshot payload | no | Accounts, Risk | esconder bloque si no existe |
| `marginLevel` | EA payload | `mt5-account-adapter` | snapshot payload | no | Accounts, Risk | `sin dato` |

## 3. Posiciones abiertas

| Bloque / campo | Entrada | Adaptacion | Persistencia | Derivacion | Consumo principal | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| `positions[]` | EA payload | `mt5-account-adapter` | snapshot payload | no | Dashboard, Risk, Capital | lista vacia |
| `positionId` | EA payload | `mt5-account-adapter` | snapshot payload | no | Risk, open risk, grouping | usar `ticket` si no hay |
| `symbol` | EA payload | `mt5-account-adapter` | snapshot payload | no | Risk, Dashboard, Tools | no hay |
| `volume` | EA payload | `mt5-account-adapter` | snapshot payload | no | Risk, positions, calculators | no hay |
| `sl/tp` | EA payload | `mt5-account-adapter` | snapshot payload | no | Risk, open_trade_risks | `0` no significa seguro; marcar `missing_stop_loss` |
| `profit` | EA payload | `mt5-account-adapter` | snapshot payload | no | Dashboard, Capital, Risk | `0` solo si realmente viene `0` |

## 4. Trades cerrados

| Bloque / campo | Entrada | Adaptacion | Persistencia | Derivacion | Consumo principal | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| `trades[] raw deals` | EA payload | `mt5-account-adapter` | snapshot payload | no | Trades, Calendar, Analytics, Journal context | lista vacia |
| `tradeId grouped` | `frontend_adapter` | `mt5-account-adapter` | no persistir como source of truth | si | Trades UI, Analytics, Calendar | agrupacion por `ticket` si falta `position_id` |
| `openTime/closeTime` | EA payload | `mt5-account-adapter` | snapshot payload | no | Trades, Calendar, Analytics | usar unix si existe |
| `netPnl` | EA payload + adapter | `mt5-account-adapter` | snapshot payload parcial | si | Trades, Analytics, Calendar | sumar profit + commission + swap + fees |
| `session` | EA payload or inferred | `mt5-account-adapter` | no requerido | si | Analytics, Journal, Strategy attribution | inferir por hora UTC |
| `tradingDayKey/monthKey` | none raw | `mt5-account-adapter` | no | si | Calendar, Analytics | derivar de `closeTime` |

## 5. Curva e historial

| Bloque / campo | Entrada | Adaptacion | Persistencia | Derivacion | Consumo principal | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| `history[]` | backend snapshot / EA-reported history | `mt5-account-adapter` | snapshot payload | no | Dashboard hero chart, Capital evolution | sintetico balance/equity solo como ultimo fallback |
| `equityCurve[]` | internal model | internal adapter | no | si | Capital, Dashboard | usar `history[]` preferente |

## 6. ReportMetrics

| Bloque / campo | Entrada | Adaptacion | Persistencia | Derivacion | Consumo principal | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| `reportMetrics` | backend risk/report engine | `mt5-account-adapter.normalizeReportMetrics` | snapshot payload | no | Dashboard, Analytics, Capital | frontend derives from trades |
| `profitFactorBasis` | backend risk/report engine | normalizeReportMetrics | snapshot payload | no | Dashboard KPI interpretation | mark as `legacy` if unclear |
| `drawdownPct` | backend risk/report engine | normalizeReportMetrics | snapshot payload | no | Dashboard, Capital | derive partial DD if possible |

## 7. RiskSnapshot

| Bloque / campo | Entrada | Adaptacion | Persistencia | Derivacion | Consumo principal | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| `riskSnapshot.summary` | backend risk engine | none/light adapter | snapshot payload | no | Risk, Dashboard, Analytics-risk | degraded state |
| `riskSnapshot.status` | backend risk engine | none/light adapter | snapshot payload | no | Risk, shell status, warnings | degraded state |
| `riskSnapshot.policy` | backend risk engine | selectors | snapshot payload | no | Risk policy panel, future funding cockpit | read-only / no-policy state |
| `riskSnapshot.policy_evaluation` | backend risk engine | selectors | snapshot payload | no | Risk, future recommendation layer | warnings unavailable |
| `symbol_exposure` | backend risk engine | selectors | snapshot payload | no | Risk, Portfolio future | empty exposure state |
| `open_trade_risks` | backend risk engine | selectors | snapshot payload | no | Risk, future sizing advice | empty / unknown bounded risk |

## 8. Funding

| Bloque / campo | Entrada | Adaptacion | Persistencia | Derivacion | Consumo principal | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| `funding preset firm/program/phase` | local preset registry | `funding-rules.js` | workspace/manual or future backend | no | Funding route, future cockpit | editable/manual preset |
| `fundedAccounts workspace` | workspace manual | store/workspace layer | local persistence today | partial | Funding route | empty challenge state |
| `funding ledger/journey` | workspace manual | feature-specific modules | local persistence today | partial | Funding payouts, journeys | empty state |
| `FundingJourney.firm/program/size` | manual setup / future funding journey store | funding domain adapter | future `funding_journeys` | no | Prop Firms overview, Journeys, Payouts, Rules | show `requires_review`; do not infer firm rules |
| `FundingJourney.currentStage/status` | journey store + linked stage accounts | funding journey selector | future `funding_journeys` | yes from stage states | Prop Firms overview, journey table, Desk account context when decision-relevant | partial journey with explicit missing stage |
| `FundingStageAccount.accountId/stage` | user link or imported account metadata | funding stage adapter | future `funding_stage_accounts` | no | Journeys, Funding Accounts, Rules, RiskGuard funding context | stage shown as unlinked, not hidden |
| `FundingStageAccount.profit/drawdown/trades` | MT5 trades + risk snapshot + manual close snapshot | stage result selector | future stage result snapshot | yes | Journeys, Rules, Payout defense, Calendar drill-down by account | `requires_review` if stage/account link missing |
| `FundingRuleSet` | preset registry or manual override | funding rule resolver | future rules/overrides store | no | Funding Rules, RiskGuard, calculator next-risk cap | rule source badge; `requires_review` if provenance missing |
| `FundingPayout` | manual entry | payout ledger adapter | future `funding_payouts` | partial net calculations | Funding Payouts, overview economics | empty ledger; never mix with trading PnL |
| `ManualFundingTransaction` | manual entry | funding ledger adapter | future `manual_funding_transactions` | partial net impact | Funding Payouts, net funding result | explicit zero only when user entered zero |
| `FundingTimelineEvent` | stage transitions + ledger events + manual notes | funding timeline selector | future append-only timeline | yes | Journey detail, audit/history | timeline unavailable state |

## 9. Portfolio

| Bloque / campo | Entrada | Adaptacion | Persistencia | Derivacion | Consumo principal | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| `workspace.portfolio.allocations` | workspace manual | store sanitizer | local persistence today | no | Capital legacy, future portfolio | empty allocations |
| `workspace.portfolio.mandates` | workspace manual | store sanitizer | local persistence today | no | Capital legacy, future portfolio policy | empty mandates |
| `portfolio policy` future | portfolio policy store | future domain adapter | future backend/store | no | Portfolio Policy, EA export | not available |
| `Portfolio` | user-created portfolio store | portfolio domain adapter | future `portfolios` | no | Portfolio, Desk context, future policy editor | read-only aggregate from accounts until created |
| `PortfolioAccount.role/budget` | user policy setup | portfolio account adapter | future `portfolio_accounts` | no | Portfolio, RiskGuard, future routing | show `policy missing`; do not invent role |
| `RiskPolicy` | backend risk engine / user policy setup | risk policy adapter | future policy store | no | RiskGuard, Funding Rules, Portfolio Policy | safest read-only state |
| `RiskEvaluation` | backend risk engine | risk evaluation adapter | snapshot payload / future evaluations | no | RiskGuard, Desk attention, Funding Cockpit | degraded state with no recommendation |
| `RiskRecommendation` | frontend selector over evaluation | recommendation selector | no source of truth | yes | RiskGuard, calculator sizing advice, Funding next trade posture | advisory unavailable; never block silently from UI-only default |
| `EAPolicyPackage` | explicit export action | package builder | future package/export ledger | yes | future EA export center only | disabled until policy has provenance and validation |

## 10. Journal y Strategies

| Bloque / campo | Entrada | Adaptacion | Persistencia | Derivacion | Consumo principal | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| `journal.entries` | workspace manual | store sanitizer | local persistence today | no | Journal | empty journal |
| `journal review tags` | backend/manual hybrid | discipline/journal modules | backend per user for post-trade; local elsewhere | partial | Journal, Execution | partial review state |
| `strategies.items/backtests` | workspace manual/import | store sanitizer | local persistence today | no | Strategies | import prompt |

## 11. Preferences y shell state

| Bloque / campo | Entrada | Adaptacion | Persistencia | Derivacion | Consumo principal | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| `theme` | local persisted prefs | store hydrate | localStorage / future preferences table | no | shell, theming | default |
| `activePage` | route today | navigation/store | localStorage today | yes in Next replaced by URL | shell | default `/dashboard` |
| `analyticsTab` | route/ui today | store hydrate | localStorage | yes | analytics route | `summary` |
| `preferredLiveAccountId` | user interaction | store persist | localStorage today | no | account switching | first owned live account |

## 12. Billing and entitlements

| Bloque / campo | Entrada | Adaptacion | Persistencia | Derivacion | Consumo principal | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| `billing.plan/access/status` | backend billing API | store billing layer | backend billing | no | gating, Accounts, shell | anonymous/demo |
| `entitlements.*` | backend billing API | store billing layer | backend billing | no | gating of routes/actions | safest restrictive state |

## Ingestion pipeline resumen

Ruta actual recomendada para datos live:

1. EA envia payload MT5
2. backend valida ownership y persiste snapshot
3. `/api/accounts/snapshot` expone version segura
4. `accounts-live-snapshot.js` hace polling y gating
5. `mt5-account-adapter.js` normaliza cuentas, posiciones, trades y metrics
6. selectores/risk-selectors consumen la forma adaptada
7. modulos UI renderizan

Ruta futura en Next:

1. live snapshot client typed
2. typed adapters
3. domain selectors
4. route-level view models
5. domain components

## Fallback policy

Reglas:

- si falta un dato factual live, no inventarlo como si fuese real
- si hay derivacion, debe quedar clara su naturaleza
- si el fallback cambia la confianza, la UI debe degradarse
- si el acceso no esta autorizado, ocultar datos antes de derivar nada

## Prioridad de extraccion derivada

Primero:

- `accounts-live-snapshot.js`
- `mt5-account-adapter.js`
- `risk-selectors.js`
- `backend-model.js`
- `store.js` solo como fuente semantica, no como codigo a portar tal cual

Despues:

- funding preset normalization
- portfolio workspace normalization
- journal/strategies local persistence model

## Relacion con documentos existentes

- `docs/kmfx-data-dictionary-v1.md`
- `docs/mt5-data-contract-v1.md`
- `docs/live-data-section-matrix.md`
- `docs/nextjs-extraction-backlog.md`
- `docs/nextjs-master-migration-roadmap.md`
