# KMFX Edge Fixture Pack Spec v1

Estado: especificacion de fixtures  
Ultima revision: 2026-05-14  
Alcance: definir el pack de fixtures que debe existir antes y durante la migracion a Next.js para evitar desarrollo y QA a ciegas.

## Proposito

Los fixtures no son un extra.

En esta migracion son la red de seguridad que evita:

- cambiar contratos sin enterarnos;
- romper estados degradados;
- maquillar una pantalla solo con happy path;
- y reescribir selectores porque cada ruta esperaba un shape distinto.

## Objetivos del pack

El pack debe cubrir:

- contratos live minimos
- rutas core de Wave 1
- estados buenos y malos
- funding/risk/portfolio futuro
- mobile y desktop con datos consistentes

## Principios

- siempre anonimizados
- siempre tipables
- siempre versionables
- un fixture debe representar una historia de producto, no solo un blob tecnico

## Familias de fixtures

## 1. Account snapshot fixtures

### `account-live-happy`

Caso:

- una cuenta MT5 completa
- snapshot fresco
- posiciones abiertas
- trades cerrados
- `reportMetrics`
- `riskSnapshot`
- historico anual suficiente para validar Panel, Calendario, Insights y Portfolio sin inventar datos por componente

Uso:

- Dashboard
- Accounts
- Risk
- Analytics

Implementacion actual:

- `apps/web-next/src/lib/data/fixtures/live-accounts-snapshot.fixture.json`
- cuenta principal: Darwinex Zero 100K
- base inicial: 100k
- historico: 366 puntos entre 2025-05-23 y 2026-05-22
- operaciones cerradas: 213
- simbolos cubiertos: EURUSD, NAS100, USDCAD, GBPUSD y XAUUSD
- validado por `src/lib/data/live-snapshot-adapter.test.ts`

### `account-live-stale`

Caso:

- cuenta conocida
- ultimo sync antiguo
- datos parciales o congelados

Uso:

- freshness notices
- shell state
- Accounts status

### `account-live-no-risk-snapshot`

Caso:

- cuenta con snapshot economico y trades
- sin `riskSnapshot`

Uso:

- degraded Risk state
- Dashboard fallback logic

### `account-live-no-report-metrics`

Caso:

- cuenta con trades e historial
- sin `reportMetrics`

Uso:

- derivacion frontend
- confidence labels

### `account-live-empty-trades`

Caso:

- cuenta conectada
- sin operaciones cerradas suficientes

Uso:

- empty states
- early account onboarding

### `account-live-missing-stop-loss`

Caso:

- posiciones abiertas sin SL
- `risk_state = missing_stop_loss` o equivalente

Uso:

- Risk warnings
- no false zero-risk rendering

## 2. Multi-account fixtures

### `workspace-two-accounts-mixed`

Caso:

- una cuenta con datos live fuertes
- otra cuenta stale o parcial

Uso:

- Accounts list
- account switching
- shell context

### `workspace-multi-account-portfolio-heat`

Caso:

- varias cuentas
- exposicion correlacionada
- heat agregado alto

Uso:

- Capital
- future portfolio/risk cockpit

### `workspace-entitlement-limited`

Caso:

- usuario autenticado
- cuenta registrada
- acceso MT5 restringido por plan

Uso:

- gating
- scrub states
- no-data exposure

## 3. Trade set fixtures

### `trades-partial-close-grouped`

Caso:

- un trade con varias ejecuciones/parciales

Uso:

- adapter grouping
- Trades route
- Calendar aggregation

### `trades-session-rich`

Caso:

- muestra suficiente por Asia/London/New York

Uso:

- Analytics hourly/session views

### `trades-small-sample`

Caso:

- menos de 30 trades

Uso:

- confidence labels
- no-overclaim stats

### `trades-cost-heavy`

Caso:

- comisiones y swaps relevantes

Uso:

- net vs gross validation
- profit factor truthfulness

## 4. Risk fixtures

### `risk-safe`

Caso:

- policy evaluation sin breaches
- riesgo contenido

Uso:

- normal route rendering

### `risk-caution`

Caso:

- warning por drawdown o heat alto

Uso:

- intermediate severity
- recommendation layer

### `risk-blocked`

Caso:

- breach real
- `block_new_trades = true`

Uso:

- blocked UI
- shell status strip
- future funding cockpit

### `risk-unavailable`

Caso:

- payload sin suficiente informacion

Uso:

- degraded Risk route

## 5. Funding fixtures

### `funding-challenge-linked`

Caso:

- cuenta challenge vinculada
- perfil de firma/programa/fase
- room suficiente

Uso:

- Funding route
- future funding cockpit

### `funding-near-daily-limit`

Caso:

- DD diario cerca de romperse

Uso:

- variable risk
- scenario table

### `funding-payout-protection`

Caso:

- cuenta funded
- cerca de payout
- modo defensivo recomendado

Uso:

- playbooks
- recommendation layer

### `funding-requires-review`

Caso:

- reglas de firma no verificadas

Uso:

- source provenance UI
- no false certainty

## 6. Portfolio fixtures

### `portfolio-basic`

Caso:

- portfolio con dos cuentas
- roles simples

Uso:

- portfolio detail

### `portfolio-routing-blocked`

Caso:

- misma idea no debe duplicarse por correlacion/heat

Uso:

- future routing policy UX

### `portfolio-risk-guardian-export`

Caso:

- policy package listo para `risk_guardian`

Uso:

- future EA export center

## 7. Shell and preference fixtures

### `shell-dark-default`

Caso:

- theme dark
- route `/dashboard`
- cuenta activa live

Uso:

- shell baseline

### `shell-mobile-risk-priority`

Caso:

- viewport mobile
- route `/risk`
- topbar compact

Uso:

- responsive QA

### `shell-light-non-broken`

Caso:

- light theme tokens activos

Uso:

- structural non-regression only in early waves

## Fixture metadata contract

Cada fixture deberia declarar:

- `fixtureId`
- `version`
- `story`
- `sourceFamily`
- `coversRoutes[]`
- `coversStates[]`
- `containsLiveLikeFinancialData`
- `redactionNotes`

## Suggested file organization

```text
fixtures/
  accounts/
    account-live-happy.json
    account-live-stale.json
    account-live-no-risk-snapshot.json
  trades/
    trades-partial-close-grouped.json
    trades-small-sample.json
  risk/
    risk-safe.json
    risk-caution.json
    risk-blocked.json
  funding/
    funding-challenge-linked.json
    funding-near-daily-limit.json
  portfolio/
    portfolio-basic.json
    portfolio-routing-blocked.json
  shell/
    shell-dark-default.json
```

## QA matrix by wave

## Wave 1 required fixtures

- `account-live-happy`
- `account-live-stale`
- `account-live-no-risk-snapshot`
- `account-live-no-report-metrics`
- `account-live-missing-stop-loss`
- `workspace-two-accounts-mixed`
- `trades-partial-close-grouped`
- `risk-safe`
- `risk-caution`
- `risk-blocked`

## Wave 2 required fixtures

- `trades-session-rich`
- `trades-small-sample`
- `trades-cost-heavy`
- `workspace-multi-account-portfolio-heat`

## Wave 3+ required fixtures

- `funding-challenge-linked`
- `funding-near-daily-limit`
- `funding-payout-protection`
- `funding-requires-review`
- `portfolio-basic`
- `portfolio-routing-blocked`
- `portfolio-risk-guardian-export`

## Acceptance criteria

- cada fixture cubre una historia util de producto
- los fixtures de riesgo y funding nunca pintan defaults como reglas reales
- existen fixtures de datos incompletos, no solo happy path
- el pack permite validar desktop y mobile
- el pack permite validar dark y no-rotura estructural en light
- si un fixture crece de mini-caso a caso anual, los tests deben validar el nuevo contrato en vez de mantener expectations antiguas

## Relacion con documentos existentes

- `docs/kmfx-data-dictionary-v1.md`
- `docs/kmfx-field-source-map-v1.md`
- `docs/nextjs-types-and-fixtures-inventory.md`
- `docs/nextjs-master-migration-roadmap.md`
