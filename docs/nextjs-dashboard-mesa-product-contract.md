# KMFX Next.js Panel Product Contract

Estado: contrato de producto/UI para Dashboard Next.js
Ultima revision: 2026-05-16
Alcance: definir que debe solucionar `Panel`, que preguntas responde y como usar la informacion disponible de trades, cuentas, riesgo, bots/EAs, Darwinex, cuenta real/demo y funding.

## Objetivo

`Panel` es el command center del trader.

No debe competir con `Insights`, `RiskGuard`, `Prop Firms`, `Portfolio`, `Playbooks`, `Ejecucion`, `Trades`, `Calendario` o `Review`.

`Panel` no es un dashboard solo de fondeo.

Debe funcionar para:

- cuenta real MT5;
- cuenta demo;
- cuenta de fondeo/challenge;
- cuenta Darwinex o Darwinex Zero cuando se conecte via MT5/datos compatibles;
- cuenta operada manualmente;
- cuenta operada por bots/EAs;
- portfolio multi-cuenta.

Debe responder en menos de 10 segundos:

```text
Que pasa ahora?
Estoy en riesgo?
Que cuenta importa?
Que setup/simbolo esta moviendo el resultado?
Que tengo que revisar o hacer despues?
```

## Referentes de mercado revisados

Patrones utiles:

- TradeZella: dashboard con snapshot de PnL, win rate, metricas clave, multi-account y widgets configurables; tambien separa reports, tags, calendar, strategy y journal.
- TradesViz: custom dashboards, pivot/grid analytics, calendarios, objetivos, risk simulator y prop firm tracking.
- TraderSync: dashboard customizable con widgets, riesgo por trade y frontend responsive.
- Edgewonk: enfoque en decir que hacer despues, separando ganadores/perdedores, errores, disciplina y setups.
- Tradelio: foco en disciplina, patrones ganadores, errores repetidos, drawdown, win rate, profit factor y limites por cuenta.
- TradingNote: foco en revisar contexto, notas, resultados y comportamiento para mejorar decisiones, no en acumular comentario.

Implicacion para KMFX:

- no competir por cantidad infinita de widgets;
- ganar por lectura live MT5 + riesgo + bots/EAs + capital + funding + proceso;
- priorizar decision sobre exploracion.

## Modos de cuenta que Panel debe entender

## Cuenta real

Pregunta:

- Estoy protegiendo capital real y creciendo de forma sana?

Prioridad:

- equity real;
- PnL abierto/cerrado;
- drawdown;
- riesgo abierto;
- exposicion;
- consistencia;
- cuenta/broker/sync.

## Cuenta demo

Pregunta:

- Esta demo tiene utilidad de aprendizaje o solo ruido?

Prioridad:

- consistencia;
- reglas cumplidas;
- calidad de datos;
- comparacion con cuenta real si existe;
- evitar pintar conclusiones como capital real.

## Cuenta funding/challenge

Pregunta:

- Estoy mas cerca de pasar, cobrar o romper la cuenta?

Prioridad:

- stage;
- target progress;
- daily/max room;
- payout defense;
- recommended risk cap;
- link a `FundingJourney`.

## Darwinex / Darwinex Zero

Pregunta:

- Esta cuenta es invertible/escalable o solo rentable en bruto?

Prioridad:

- equity/balance/PnL;
- drawdown y estabilidad;
- consistencia;
- risk-adjusted performance;
- D-Score o metrica Darwinex si existe;
- capacidad/escala si existe;
- divergence entre retorno y riesgo.

Nota:

- si no hay metrica Darwinex oficial disponible, mostrar `No conectado` o `No disponible`, no inventar D-Score.

## Bots / EAs conectados a MT5

Pregunta:

- Que sistemas estan operando, estan sanos y cual esta aportando o empeorando capital?

Prioridad:

- trades por magic number/EA cuando exista;
- PnL por bot;
- open risk por bot;
- drawdown por bot;
- ultima actividad;
- errores o silencio operativo;
- manual vs automated split;
- bot dominante en profit/loss;
- riesgo de correlacion entre bots/simbolos.

Nota:

- KMFXConnector es read-only sync. `Panel` puede diagnosticar bots/EAs por datos MT5, pero no debe prometer control/ejecucion automatica salvo que exista un contrato futuro de EA policy.

## Portfolio multi-cuenta

Pregunta:

- Que cuenta, estrategia o bot esta moviendo el resultado total?

Prioridad:

- equity total;
- contribution by account;
- heat agregado;
- funding vs own capital;
- real vs demo separado;
- top contributor;
- biggest drag.

Fuentes:

- `https://www.tradezella.com/trading-journal`
- `https://www.tradesviz.com/`
- `https://tradersync.com/features/`
- `https://edgewonk.com/features`
- `https://tradelio.co/es`
- `https://tradingnote.app/en/trading-journal/`

## Preguntas del Panel

## Mapa de pantalla recomendado

El Dashboard debe dividirse en bloques de decision, no en widgets decorativos.

Cada bloque debe tener:

- pregunta que responde;
- contenido visible;
- fuente de datos;
- estado degradado;
- CTA hacia la seccion profunda.

## A. Header operativo

Posicion:

- topbar fija del workspace.

Pregunta:

- Que cuenta estoy viendo y que tan fiable es el dato?

Debe mostrar:

- selector de cuenta;
- tipo de cuenta: real, demo, prop/funding, Darwinex, bot/EA, portfolio;
- broker/server/login;
- moneda base;
- ultima sync;
- estado de datos: live, partial, stale, empty;
- rango temporal.

Fuente:

- account identity;
- live snapshot;
- account store.

CTA:

- `/accounts`

No meter:

- KPIs de performance;
- explicaciones largas;
- marketing.

## B. Estado de cuenta

Posicion:

- primera fila, izquierda o full-width en mobile.

Pregunta:

- Como esta la cuenta ahora mismo?

Contenido:

- equity;
- balance;
- floating PnL;
- realized PnL periodo;
- margin/free margin;
- open positions count;
- connection/sync state.

Fuente:

- MT5 account snapshot;
- positions;
- reportMetrics cuando exista.

Estado degradado:

- `Sin primera sincronizacion`;
- `Sync atrasada`;
- `Datos parciales`.

CTA:

- `/accounts`

## C. KPI strip principal

Posicion:

- primera fila debajo/ junto al estado de cuenta.

Pregunta:

- Estoy rindiendo bien o mal?

KPIs V1:

- Net PnL;
- Net Return;
- Max Drawdown;
- Win Rate;
- Profit Factor neto;
- Trades del periodo.

KPIs V2 opcionales:

- Expectancy;
- Avg R;
- Sortino;
- Volatilidad;
- Recovery Factor;
- D-Score si Darwinex real lo aporta.

Fuente:

- grouped trades;
- reportMetrics;
- dashboard model;
- Darwinex metrics solo si llegan por contrato.

Regla:

- mostrar maximo 6 KPIs arriba;
- metricas avanzadas bajan a `Insights`, `RiskGuard` o `Portfolio`.

CTA:

- `/analytics`

## D. Chart principal

Posicion:

- centro visual del dashboard.

Pregunta:

- Como evoluciona mi cuenta?

Contenido:

- equity curve;
- balance curve;
- markers de dias/trades importantes si no satura;
- drawdown overlay opcional;
- rango 7D / 30D / YTD / All.

Fuente:

- equity history si existe;
- closed trades agrupados como fallback;
- account snapshot actual.

Estado degradado:

- `Historial insuficiente`;
- `Esperando cierres reales`;
- `Equity historica no disponible`.

CTA:

- `/calendar` para ver dias;
- `/analytics` para profundidad.

## E. Risk brief

Posicion:

- panel derecho alto en desktop;
- segundo bloque en mobile si hay warning.

Pregunta:

- Que me puede romper hoy?

Contenido:

- estado: safe, caution, danger, blocked;
- daily room left;
- max drawdown room;
- open heat;
- position with highest risk;
- symbol/factor concentration;
- `next trade allowed?`.

Fuente:

- riskSnapshot;
- positions;
- risk telemetry;
- policy/evaluation si existe.

Estado degradado:

- `Riesgo pendiente`;
- `SL ausente`;
- `Datos insuficientes`;
- `Politica no definida`.

CTA:

- `/risk`

## F. Account context

Posicion:

- integrado en Header operativo, Estado de cuenta o Risk brief.

Pregunta:

- Hay algo del tipo de cuenta que cambia como debo interpretar el dato?

Regla principal:

- Panel no debe crear una tarjeta especial solo porque la cuenta sea real, demo, funding, Darwinex o bot/EA.
- Panel muestra siempre la cuenta activa y sus datos reales disponibles.
- El contexto por tipo de cuenta solo aparece si cambia una decision operativa: riesgo, revision, payout, sincronizacion, capital o calidad de muestra.
- Si el contexto no cambia una decision, vive como badge, nota compacta o CTA hacia la ruta profunda.

Contextos permitidos en V1:

- `Funding`: mostrar fase, payout o regla solo si hay journey vinculado, warning, deadline o proximo payout.
- `Darwinex`: mostrar metrica oficial solo si llega por contrato; si no, marcar `Metrica Darwinex no disponible`.
- `Bot/EA`: mostrar diagnostico solo si existe `magic`, `expert`, `strategyId` o clasificacion equivalente fiable.
- `Real`: enfatizar capital real, riesgo abierto y drawdown solo si aporta contexto adicional al estado/riesgo.
- `Demo`: marcar que la lectura es de aprendizaje y no mezclar con capital real.
- `Portfolio`: mostrar cuenta dominante o heat agregado solo si Panel esta en modo multi-cuenta.

Destinos:

- Funding -> `/funding/journeys`
- Darwinex -> `/capital` o `/analytics`
- Bot/EA -> `/strategies` o `/execution`
- Real/demo -> `/accounts`, `/risk`, `/analytics`
- Portfolio -> `/capital`

## G. Recent trades

Posicion:

- debajo del chart principal.

Pregunta:

- Que operaciones explican el movimiento?

Contenido:

- ultimos trades cerrados;
- posiciones abiertas opcionalmente arriba;
- symbol;
- side;
- size;
- net PnL;
- close time;
- setup/tag si existe;
- magic/expert si existe;
- review status.

Fuente:

- closed trades/deals;
- open positions;
- grouped partials;
- manual tags/journal.

CTA:

- `/trades`
- `/journal/review-queue`

## H. Insights rápidos

Posicion:

- bloque inferior o lateral bajo Recent trades.

Pregunta:

- Que patron esta funcionando y cual hay que revisar?

Contenido:

- top setup;
- worst setup;
- top symbol;
- worst symbol;
- best session;
- worst session;
- dependencia de operaciones aisladas;
- calidad de datos.

Fuente:

- trades;
- etiquetas;
- strategy labels;
- sessions/time buckets.

Estado degradado:

- `Etiquetas pendientes`;
- `Datos insuficientes`;
- `Sin setups clasificados`.

CTA:

- `/analytics`
- `/strategies`

## I. Review queue

Posicion:

- panel derecho bajo context brief o bloque inferior.

Pregunta:

- Que debo revisar para mejorar?

Contenido:

- trades sin review;
- peor trade pendiente;
- errores repetidos;
- dia con mayor drift;
- nota/siguiente accion.

Fuente:

- journal;
- trades;
- execution tags;
- review status.

CTA:

- `/journal/review-queue`

## J. Upcoming / calendar pulse

Posicion:

- bloque compacto inferior.

Pregunta:

- Que evento temporal importa?

Contenido:

- proximo payout si funding;
- cierre de fase/challenge si existe;
- semana/mes actual PnL;
- dias de mayor actividad;
- dia pendiente de review.

Fuente:

- calendar aggregation;
- funding journey;
- journal/review.

CTA:

- `/calendar`
- `/funding/payouts`

## Orden de prioridad

Si no cabe todo, priorizar:

```text
1. Header operativo
2. Estado de cuenta
3. Risk brief
4. KPI strip
5. Chart principal
6. Account context solo si cambia una decision
7. Recent trades
8. Review queue
9. Insights rápidos
10. Calendar pulse
```

Regla:

- si hay estado `danger` o `blocked`, Risk brief sube visualmente por encima del chart.
- si la cuenta es funding cerca de payout/breach, el contexto funding sube por encima de Insights rápidos.
- si hay bot/EA en alerta fiable, el contexto bot/EA aparece antes que Review queue.

## Tabla de construccion

| Bloque | Pregunta | Mostrar | Fuente | Destino |
| --- | --- | --- | --- | --- |
| Header operativo | Que cuenta miro? | cuenta, tipo, broker, sync, periodo | account store + snapshot | `/accounts` |
| Estado de cuenta | Como esta ahora? | equity, balance, floating, margin, open positions | MT5 snapshot + positions | `/accounts` |
| KPI strip | Estoy rindiendo? | Net PnL, return, DD, WR, PF, trades | reportMetrics + trades | `/analytics` |
| Chart principal | Como evoluciona? | equity/balance curve, drawdown overlay | equity history + trades | `/calendar`, `/analytics` |
| Risk brief | Que me puede romper? | daily room, max room, heat, exposure, block state | riskSnapshot + positions | `/risk` |
| Account context | Que cambia por tipo de cuenta? | badge, alerta o CTA contextual solo si cambia una decision | account metadata + derived models | ruta profunda contextual |
| Recent trades | Que movio la cuenta? | ultimas operaciones, posiciones abiertas, setup, magic, review | trades + positions + etiquetas | `/trades` |
| Insights rápidos | Que patron funciona/falla? | setup, symbol, session, operaciones aisladas, calidad de datos | trades + etiquetas | `/analytics`, `/strategies` |
| Review queue | Que debo revisar? | pending reviews, worst trade, repeated errors | journal + trades | `/journal/review-queue` |
| Calendar pulse | Que fecha importa? | payout, phase deadline, week/month PnL, review day | calendar + funding + journal | `/calendar` |

## Variantes por tipo de cuenta

| Tipo de cuenta | Como afecta al Panel | Que enfatiza | Que NO hacer |
| --- | --- | --- | --- |
| Real | Contexto inline | capital real, DD, riesgo por trade, consistencia | mezclar con demo |
| Demo | Contexto inline | aprendizaje, consistencia, muestra, comparacion | tratar como capital real |
| Funding/Challenge | Alerta/CTA si hay journey, regla, payout o breach | fase, target, room, payout defense | separar fases como cuentas sueltas |
| Darwinex | Estado oficial si existe, fallback transparente si no | estabilidad, risk-adjusted return, D-Score si existe | inventar metricas oficiales |
| Bot/EA | Diagnostico read-only si hay identificador fiable | magic/expert, PnL por bot, riesgo, silencio | prometer control si solo hay sync |
| Portfolio | Modo multi-cuenta si esta seleccionado | contribution, heat agregado, cuenta dominante | esconder cuentas con drag |

## Decision sobre subsecciones del Dashboard

`Panel` no debe tener subrutas propias en V1.

La pantalla se compone de modulos, y cada modulo deriva a su ruta profunda:

```text
Risk brief       -> RiskGuard
Funding context  -> Prop Firms
Bot/EA context   -> Playbooks / Ejecucion
Trades table     -> Trades
Insights rápidos -> Insights / Playbooks
Review queue     -> Review
Calendar pulse   -> Calendario
Portfolio context -> Portfolio
```

Subrutas de dashboard solo se permitirian en una V2 si el usuario necesita layouts guardados:

```text
/dashboard/live
/dashboard/review
/dashboard/automation
```

No crear esas rutas ahora.

## Layout recomendado desktop

```text
Topbar:
  cuenta activa | periodo | sync | command/search

Row 1:
  Account state + KPI strip

Main grid:
  Left 2/3:
    Equity / Balance chart
    Recent trades table

  Right 1/3:
    Risk brief
    Account context solo si cambia una decision
    Review queue

Lower:
  Insights rápidos
  Upcoming calendar/events if available
```

## Layout recomendado mobile

Orden:

```text
1. Account state
2. Risk brief
3. KPI strip compacta
4. Equity chart
5. Account context solo si cambia una decision
6. Review queue
7. Recent trades
```

Regla:

- en mobile el riesgo va antes que el chart si hay warning/caution.

## Datos disponibles y enfoque

## Desde live snapshot / MT5

Usar para:

- balance/equity/floating PnL;
- positions;
- trades;
- reportMetrics;
- riskSnapshot;
- account sync/identity;
- magic number / expert id cuando exista;
- account type demo/live/real si el broker lo expone;
- broker/server/login para detectar Darwinex/Darwinex Zero cuando aplique.

## Derivado desde trades

Usar para:

- win rate;
- net PnL por dia;
- session/day/hour analytics;
- setup/symbol contribution;
- unreviewed trades;
- streaks;
- dependencia de operaciones aisladas;
- calidad de datos.

## Desde risk engine

Usar para:

- daily room;
- max drawdown room;
- open heat;
- exposure;
- policy warnings;
- block/caution/safe state.

## Desde funding journey

Usar para:

- current stage;
- phase progress;
- payout defense;
- recommended risk cap;
- journey link.

## Desde bots/EAs

Usar para:

- magic number;
- expert/EA name si existe;
- strategy id si existe;
- robotCount/reportMetrics si existe;
- bot-level PnL derivado por trades;
- bot-level risk derivado por posiciones.

Si no hay identificador fiable, agrupar como:

- `Manual / Unknown`

## Desde Darwinex

Usar para:

- broker/server/account metadata;
- D-Score o metrica oficial solo si llega por contrato;
- retorno/drawdown/risk-adjusted metrics internos claramente marcados como no oficiales si no hay metrica Darwinex por contrato;
- estado `No disponible` si la integracion no entrega ese dato.

## Estados obligatorios

`Panel` debe soportar:

- no account connected;
- connected but no trades;
- live partial;
- stale sync;
- mock/fixture;
- funding rules require review;
- real account connected;
- demo account connected;
- Darwinex account without official Darwinex metrics;
- bot trades without reliable magic/expert id;
- automation silent/stale;
- risk blocked;
- insufficient sample.

## Que NO debe hacer Panel

- No meter 50 widgets configurables en V1.
- No duplicar toda la tabla de analytics.
- No convertir funding en una subtabla plana.
- No convertir bots/EAs en promesas de ejecucion si solo hay sync read-only.
- No mezclar demo y real como si tuvieran el mismo peso economico.
- No inventar metricas Darwinex oficiales si no llegan por contrato.
- No esconder riesgos rojos bajo graficas bonitas.
- No mostrar precision falsa si falta historico.
- No usar IA narrativa como sustituto de estados calculados.

## Componentes esperados

```text
MesaAccountHeader
MesaKpiStrip
MesaEquityChart
MesaRiskBrief
MesaAccountContext
MesaRecentTradesTable
MesaEdgeSnapshot
MesaReviewQueue
MesaActionRail
```

Primitives:

- `Card`
- `Table`
- `Badge`
- `Progress`
- `Tooltip`
- `Tabs` solo si hay vistas secundarias reales
- `Skeleton`
- `Alert`

## Gate R2

- El trader entiende estado, resultado y riesgo en 10 segundos.
- Riesgo urgente y sync state son visibles.
- Operaciones recientes explican el movimiento.
- Hay CTAs claros hacia RiskGuard, Trades, Insights, Review, Prop Firms, Playbooks, Portfolio y Calendario.
- Cuenta real, demo, funding, Darwinex y bots/EAs se distinguen sin convertir Panel en una pagina especifica de ese modo.
- Estados empty/stale/partial no parecen datos reales.

## Gate R3

- Insights rápidos deriva de operaciones reales.
- Account context enlaza con `FundingJourney` cuando existe un proceso de Prop Firms vinculado.
- Account context deriva bots/EAs desde magic/expert id cuando existe.
- Account context no inventa metricas oficiales Darwinex ausentes.
- Review queue usa operaciones pendientes reales.
- Calidad de datos y dependencia de operaciones aisladas evitan conclusiones falsas.
- Mobile prioriza riesgo cuando hay warning.
