# KMFX Next.js Portfolio Product/UI Contract

Estado: contrato de producto/UI para `Portfolio`
Ultima revision: 2026-05-20
Alcance: definir que debe mostrar la seccion Portfolio, como debe organizarse la UI y que decisiones debe resolver para un trader multi-cuenta.

## Tesis

Portfolio no es una pagina de balance.

Portfolio es la sala de asignacion de capital:

```text
Que cuenta merece capital?
Que cuenta esta empeorando el resultado?
Donde tengo riesgo duplicado?
Que setup/bot/simbolo deberia escalar, pausar o aislar?
```

Debe convertir cuentas sueltas en un sistema operativo de capital.

## Pregunta principal

```text
Como esta distribuido mi capital, que esta aportando retorno y que riesgo agregado estoy cargando?
```

## No objetivos V1

- No sustituir `RiskGuard`.
- No sustituir `Edge`.
- No ser contabilidad general.
- No prometer routing/EA enforcement real antes de tener contrato implementado.
- No mezclar demo y real como si pesaran igual.
- No inventar correlacion estadistica si no hay muestra suficiente.

## Diferencia entre Desk, Portfolio y Edge

| Seccion | Pregunta | Horizonte |
| --- | --- | --- |
| `Desk` | Que pasa ahora? | inmediato |
| `Portfolio` | Donde esta asignado mi capital y que merece mas/menos peso? | semanal/mensual |
| `Edge` | Que setup/simbolo/sesion produce edge? | analitico |
| `RiskGuard` | Que me puede romper hoy? | proteccion |
| `Prop Firms` | Estoy cerca de pasar, cobrar o fallar? | funding lifecycle |

## Tipos de portfolio

Portfolio debe soportar:

- capital propio real;
- cuentas demo separadas como laboratorio;
- cuentas prop/funding;
- Darwinex/Darwinex Zero;
- bots/EAs agrupados por magic/expert;
- portfolios por estrategia;
- portfolios por objetivo: crecimiento, preservacion, payout, testing.

## Estructura de rutas

V1:

```text
/capital
```

V2 opcional:

```text
/capital/accounts
/capital/allocation
/capital/concentration
/capital/policy
/capital/export
```

Regla V1:

- no crear subrutas hasta que `Portfolio` tenga contenido real suficiente.
- usar tabs internas si hace falta separar lectura.

## Tabs internas recomendadas

```text
Overview
Accounts
Allocation
Concentration
Strategies
Policy
```

En español/product label:

```text
Resumen
Cuentas
Asignacion
Concentracion
Playbooks
Politica
```

## Mapa de pantalla V1

## A. Portfolio header

Pregunta:

- Que portfolio estoy viendo y cual es su mandato?

Debe mostrar:

- nombre del portfolio;
- objetivo: crecimiento, preservacion, payout, testing, Darwinex, bots;
- status: active, paused, requires_review;
- base currency;
- numero de cuentas;
- total equity;
- policy readiness.

Fuente:

- `Portfolio`;
- `PortfolioAccount`;
- accounts live snapshot.

UI:

- header compacto;
- selector de portfolio si hay varios;
- badge de status;
- badge de readiness.

CTA:

- editar portfolio/policy en V2.

## B. Portfolio KPI strip

Pregunta:

- Como esta el capital agregado?

KPIs V1:

- total equity;
- net PnL;
- net return;
- portfolio heat;
- max drawdown agregado;
- number of active accounts.

KPIs V2:

- contribution concentration;
- risk-adjusted return;
- volatility;
- correlation/crowding score;
- allocation drift;
- policy readiness.

Fuente:

- account snapshots;
- grouped trades;
- riskSnapshot;
- portfolio selectors.

UI:

- 5-6 metric cards max;
- cada metric card con tooltip corto;
- estado `insufficient sample` si no hay historia.

## C. Allocation map

Pregunta:

- Donde esta asignado mi capital?

Debe mostrar:

- allocation por cuenta;
- role por cuenta: lead, follower, own_capital, challenge, payout_protection, experimental;
- equity;
- risk budget;
- max heat;
- enabled/paused;
- source: explicit policy, funding profile, requires review.

UI recomendada:

- tabla densa como vista principal;
- barras horizontales para allocation;
- badges de role;
- status dot por sync/risk.

Columnas:

```text
Cuenta | Tipo | Rol | Equity | Allocation | Risk budget | Heat | Estado | Fuente policy
```

CTA:

- abrir cuenta en `/accounts`;
- revisar risk en `/risk`;
- revisar funding si cuenta es prop.

## D. Contribution panel

Pregunta:

- Que cuenta aporta y cual empeora capital?

Debe mostrar:

- contribution by account;
- net PnL by account;
- return by account;
- drawdown by account;
- trades by account;
- best contributor;
- biggest drag;
- account with best risk-adjusted performance.

UI recomendada:

- tabla rankeada;
- barras divergentes profit/loss;
- mini sparkline por cuenta si hay history;
- no usar pie chart como lectura principal.

Regla:

- ordenar por decision, no por nombre.
- default sort recomendado: `risk-adjusted contribution`, fallback `net PnL`.

## E. Concentration panel

Pregunta:

- Donde estoy demasiado cargado?

Debe mostrar concentracion por:

- simbolo;
- divisa/factor;
- setup/strategy;
- bot/EA;
- sesion;
- cuenta;
- funding firm si aplica.

Fuentes:

- risk exposure;
- positions;
- trades;
- magic/expert ids;
- setup tags.

UI recomendada:

- heatmap o matrix compacta;
- top 5 concentration cards;
- progress bars contra cap;
- `requires_review` si no hay tags/magic suficientes.

Ejemplos:

```text
XAUUSD concentra 42% del heat abierto.
Bot Orion aporta 61% del PnL pero 78% del DD.
London session produce 70% del beneficio neto.
```

## F. Account roles and mandate

Pregunta:

- Para que sirve cada cuenta?

Debe mostrar:

- lead account;
- follower accounts;
- funding/challenge accounts;
- payout-protection accounts;
- experimental accounts;
- Darwinex/investor-facing accounts;
- accounts requiring review.

UI:

- role board tipo lista por columnas;
- drag/drop futuro, no V1;
- badges claros.

No hacer:

- permitir reglas complejas sin persistencia segura.

## G. Strategy / bot allocation

Pregunta:

- Que setup, bot o EA merece capital?

Debe mostrar:

- setup/bot;
- accounts where allowed;
- performance;
- drawdown;
- calidad de datos;
- presupuesto de riesgo;
- estado: escalar, mantener, reducir, pausar o recopilar datos.

UI:

- table-first;
- decision badge;
- filter by account, setup, bot, symbol.

Relaciones:

- deep link a `/strategies`;
- deep link a `/execution` si hay degradacion operativa.

## H. Policy readiness

Pregunta:

- Esta listo este portfolio para operar con reglas claras?

Debe mostrar:

- cuentas con policy explicita;
- cuentas heredando funding profile;
- cuentas sin budget;
- missing risk caps;
- stale sync;
- plan-limited;
- export eligibility.

Fuente:

- `getPortfolioPolicyReadiness`;
- `PortfolioPolicy`;
- account states.

UI:

- checklist con blockers;
- readiness progress;
- alerts accionables.

Copy:

- `Faltan budgets de riesgo para 2 cuentas`
- `1 cuenta usa reglas funding como fallback`
- `No exportable todavia`

## I. Portfolio timeline / decisions

Pregunta:

- Que decisiones de capital he tomado y por que?

V1:

- no obligatorio.

V2:

- capital increased;
- account paused;
- strategy blocked;
- bot reduced;
- policy changed;
- payout protection activated.

UI:

- activity feed sobrio.

## J. Export / EA policy package

Pregunta:

- Puede este portfolio convertirse en reglas ejecutables?

V1:

- solo read-only readiness.

V2:

- package version;
- export mode;
- accounts included;
- emergency freeze rules;
- checksum;
- validation summary.

Regla:

- no mostrar boton de export real si no existe implementacion y seguridad.

## Layout recomendado desktop

```text
Header:
  Portfolio selector | objective | status | readiness

Row 1:
  KPI strip agregado

Main grid:
  Left 65%:
    Allocation map
    Contribution panel

  Right 35%:
    Concentration panel
    Policy readiness

Lower:
  Strategy / bot allocation
  Account roles
```

## Layout recomendado mobile

Orden:

```text
1. Portfolio header
2. Policy/risk alert si existe
3. KPI strip compacto
4. Allocation table compacta
5. Contribution rank
6. Concentration top 5
7. Strategy/bot allocation
8. Policy readiness
```

Regla:

- si portfolio heat o concentration supera limites, ese bloque sube arriba.

## Tabla de construccion

| Bloque | Pregunta | Mostrar | Fuente | Destino |
| --- | --- | --- | --- | --- |
| Header | Que portfolio es? | objective, status, equity, readiness | Portfolio + accounts | V2 editor |
| KPI strip | Como va el capital agregado? | equity, PnL, return, heat, DD | snapshot + trades + risk | `Desk`, `RiskGuard` |
| Allocation map | Donde esta el capital? | account allocation, roles, budgets | PortfolioAccount + accounts | `/accounts` |
| Contribution | Quien aporta y quien resta? | PnL, return, DD by account | trades + account snapshots | `/analytics` |
| Concentration | Donde hay exceso? | symbol, strategy, bot, session, firm | risk + trades + etiquetas | `/risk`, `/strategies` |
| Roles | Para que sirve cada cuenta? | lead/follower/testing/funding/Darwinex | PortfolioAccount | `/accounts` |
| Strategy/bot allocation | Que merece capital? | setup/bot status, budget, decision | trades + magic + etiquetas de estrategia | `/strategies` |
| Policy readiness | Esta listo para reglas? | blockers, readiness, export eligible | portfolio-selectors | V2 policy |
| Timeline | Que decisiones se tomaron? | policy/account events | future audit store | V2 |
| Export package | Puede ejecutarse? | package, mode, checksum | EAPolicyPackage | V2/V3 |

## Estados obligatorios

Portfolio debe soportar:

- no accounts;
- one account only;
- multi-account but no portfolio policy;
- stale account;
- demo account mixed with real;
- funding account without journey;
- Darwinex without official metric;
- bot trades without magic/expert id;
- sample insufficient;
- plan-limited;
- requires_review.

## Copy esperado

Buenas frases:

```text
Portfolio sin politica explicita
2 cuentas requieren budget de riesgo
XAUUSD domina el heat abierto
Orion aporta retorno, pero concentra drawdown
Cuenta demo separada de capital real
No hay muestra suficiente para decidir allocation
```

Evitar:

```text
Portfolio optimizado
Correlacion confirmada
Export listo
D-Score calculado
```

si no hay datos/contrato que lo sostenga.

## Componentes esperados

```text
PortfolioHeader
PortfolioKpiStrip
PortfolioAllocationTable
PortfolioContributionRank
PortfolioConcentrationPanel
PortfolioRoleBoard
PortfolioStrategyAllocationTable
PortfolioPolicyReadiness
PortfolioDecisionFeed
PortfolioExportReadiness
```

Primitives:

- `Card`
- `Table`
- `Badge`
- `Progress`
- `Tabs`
- `Tooltip`
- `Alert`
- `Select`
- `Skeleton`

## UI principles

- Table-first para cuentas, budgets y contribution.
- Barras horizontales para allocation/concentration.
- Heatmap solo cuando hay matriz real.
- Pie charts solo como apoyo, nunca como lectura principal.
- No meter cards dentro de cards.
- Mostrar estado y fuente de reglas cerca de cada decision.
- Usar color como semantica: profit, loss, risk, warning, disabled.
- En desktop, priorizar densidad legible.
- En mobile, priorizar alertas y tablas compactas.

## V1 recomendado

Construir:

```text
PortfolioHeader
PortfolioKpiStrip
Allocation map
Contribution panel
Concentration panel
Policy readiness
Strategy/bot allocation read-only
```

No construir todavia:

```text
Policy editor completo
Export real de EA package
Drag/drop de cuentas
Correlacion estadistica compleja
Routing automatico
```

## Gate R2

- Portfolio muestra equity agregado, cuentas, allocation y contribution.
- Real/demo/funding/Darwinex/bots se distinguen.
- Concentration muestra top risks sin inventar correlacion.
- Policy readiness muestra blockers.
- No hay promesa de export real.

## Gate R3

- Strategy/bot allocation permite decidir scale/keep/reduce/pause.
- Contribution usa metricas netas y drawdown.
- Concentration cruza cuenta, simbolo, setup y bot cuando hay datos.
- Portfolio se siente como mandato operativo, no como reporte pasivo.

## Relacion con otros docs

- `docs/prd-portfolio-policy-and-ea-export.md`
- `docs/domain-model-funding-portfolio-v1.md`
- `docs/nextjs-dashboard-mesa-product-contract.md`
- `docs/nextjs-route-content-contract.md`
- `docs/nextjs-route-acceptance-gates.md`
