# KMFX Next.js Funding Journey UI Contract

Estado: contrato de producto/UI para implementacion Next.js
Ultima revision: 2026-05-16
Alcance: definir como se documenta, muestra y construye la experiencia de fondeo unificada en `apps/web-next`.

## Proposito

La seccion `Fondeo` no debe tratar Fase 1, Fase 2 y Real/Funded como cuentas sueltas.

Debe agruparlas en un `FundingJourney` para conservar toda la historia:

```text
Challenge / Fase 1 -> Verification / Fase 2 -> Real / Funded -> Payouts -> Historial
```

Esto evita perder data cuando una firma cambia el login MT5 entre fases.

## Pregunta principal

Cada vista de fondeo debe responder:

```text
Estoy mas cerca de pasar, cobrar o romper esta cuenta?
```

## Modelo mental

```text
FundingFirm
└─ FundingProgram
   └─ FundingJourney
      ├─ StageAccount: phase_1
      ├─ StageAccount: phase_2
      ├─ StageAccount: funded
      ├─ FundingRuleSet
      ├─ Trades
      ├─ RiskSnapshots
      ├─ Payouts
      ├─ ManualFundingTransactions
      └─ TimelineEvents
```

## Rutas Next objetivo

Sidebar visible:

```text
/funding
/funding/journeys
/funding/accounts
/funding/payouts
/funding/rules
```

Detalle de journey:

```text
/funding/journeys/[journeyId]
/funding/journeys/[journeyId]/phase-1
/funding/journeys/[journeyId]/phase-2
/funding/journeys/[journeyId]/funded
/funding/journeys/[journeyId]/trades
/funding/journeys/[journeyId]/risk
/funding/journeys/[journeyId]/payouts
/funding/journeys/[journeyId]/timeline
```

Regla de navegacion:

- La sidebar solo muestra rutas de nivel producto.
- Las fases de un journey se muestran como tabs internas o subnav dentro del detalle.
- No mostrar una fase como ruta visible si no tiene contenido propio.

## `/funding` Overview

Rol:

- cockpit agregado de fondeo.

Debe mostrar:

- capital fondeado total activo;
- cuentas en challenge;
- cuentas funded reales;
- payouts cobrados;
- payouts pendientes;
- fees/resets pagados;
- neto real de fondeo;
- cuentas cerca de pasar;
- cuentas cerca de breach;
- proxima fecha importante.

Componentes sugeridos:

- `FundingKpiStrip`
- `FundingJourneyStatusTable`
- `FundingRiskQueue`
- `FundingUpcomingEvents`
- `FundingNetResultCard`

## `/funding/journeys`

Rol:

- lista de procesos completos de fondeo, no lista de logins.

Cada row debe llevar:

- firma;
- programa;
- tamano;
- estado actual;
- fase actual;
- progreso total;
- resultado Fase 1;
- resultado Fase 2;
- estado Real/Funded;
- total payouts;
- fees/resets;
- neto;
- max drawdown historico;
- proxima accion.

Componentes sugeridos:

- `FundingJourneyTable`
- `FundingJourneyFilters`
- `FundingJourneyStateBadge`
- `FundingJourneyProgressRail`

## `/funding/journeys/[journeyId]`

Rol:

- expediente completo del journey.

Tabs internas:

```text
Resumen
Fase 1
Fase 2
Real
Trades
Riesgo
Payouts
Timeline
Notas
```

Resumen debe mostrar:

- firma/programa/tamano;
- fecha de inicio del proceso;
- estado actual;
- cuentas MT5 vinculadas por fase;
- resultado de cada fase;
- profit de cada fase;
- drawdown maximo por fase;
- trades por fase;
- payouts cobrados;
- fees/resets;
- neto real;
- recomendacion operativa actual.

Componentes sugeridos:

- `FundingJourneyHeader`
- `FundingPhaseStepper`
- `FundingStageSummaryGrid`
- `FundingJourneyEconomics`
- `FundingCurrentAdvicePanel`
- `FundingTimelinePreview`

## Fase 1 / Fase 2 / Real

Cada fase debe ser una vista propia cuando exista data.

Debe mostrar:

- cuenta MT5/login asociada;
- fechas de inicio/cierre;
- estado: active, passed, failed, closed, funded;
- profit target;
- progreso;
- daily drawdown room;
- max drawdown room;
- consistency;
- minimum trading days;
- trades;
- violaciones o warnings;
- snapshot de cierre si la fase ya termino.

En `Real/Funded`, ademas:

- payout cadence;
- proximo payout;
- profit disponible;
- payout defense mode;
- regla de split;
- riesgo recomendado hasta payout.

Componentes sugeridos:

- `FundingStageHeader`
- `FundingRuleRoomPanel`
- `FundingTargetProgress`
- `FundingStageTradeTable`
- `FundingStageRiskSummary`
- `FundingPayoutDefensePanel`

## `/funding/accounts`

Rol:

- vista operativa de cuentas/logins individuales.

No reemplaza `Journeys`.

Debe mostrar:

- login/accountId;
- journey asociado;
- fase;
- firma;
- estado;
- balance/equity;
- daily room;
- max room;
- sync health;
- si es cuenta historica o activa.

Componentes sugeridos:

- `FundingAccountTable`
- `FundingAccountLinkBadge`
- `FundingSyncHealthBadge`

## `/funding/payouts`

Rol:

- ledger de retiros, pagos manuales y economia real de fondeo.

Debe soportar entradas manuales:

```text
payout_received
payout_requested
challenge_fee
reset_fee
refund
commission
manual_adjustment
```

Campos minimos:

- journey;
- cuenta real/funded;
- firma;
- fecha solicitada;
- fecha pagada;
- importe bruto;
- split trader;
- split firma;
- fees;
- importe neto recibido;
- metodo: bank, crypto, Deel, Rise, other, manual;
- estado: draft, pending, paid, rejected, cancelled;
- comprobante opcional;
- notas.

Debe calcular:

- payouts cobrados;
- payouts pendientes;
- fees/resets;
- neto real;
- payout promedio;
- tiempo medio solicitud -> pago.

Componentes sugeridos:

- `FundingPayoutLedger`
- `FundingPayoutForm`
- `FundingEconomicsSummary`
- `FundingPayoutStatusBadge`

## `/funding/rules`

Rol:

- biblioteca de reglas por firma/programa/fase.

Debe mostrar reglas por:

- firma;
- programa;
- fase;
- cuenta concreta si hay override manual.

Debe separar:

- reglas verificadas;
- reglas manuales;
- reglas que requieren revision.

Componentes sugeridos:

- `FundingRuleMatrix`
- `FundingRuleSourceBadge`
- `FundingRuleVersionHistory`
- `FundingRuleOverrideForm`

## Estados obligatorios

Cada vista debe tener:

- loading;
- empty;
- partial;
- stale;
- error;
- requires_review.

No mostrar defaults como si fueran reglas reales de una firma.

## Fuentes de data

Read-only inicial:

- live snapshot MT5 para balances, equity, trades y risk rooms;
- fixtures anonimizados para journeys;
- entradas manuales locales/mock para payouts y fees.

Persistencia futura:

- `FundingJourney`
- `FundingStageAccount`
- `FundingPayout`
- `ManualFundingTransaction`
- `FundingTimelineEvent`
- `FundingRuleOverride`

## Criterio de aceptacion R2

- Fase 1, Fase 2 y Real se ven conectadas bajo un mismo journey.
- Una cuenta MT5 historica no desaparece cuando cambia el login de la fase siguiente.
- Payouts manuales y fees/resets se registran separados del PnL de trading.
- El overview muestra neto real de fondeo.
- La UI no confunde cuenta, fase y journey.

## Criterio de aceptacion R3

- Journey detail permite reconstruir toda la historia del proceso.
- Cada fase tiene progreso, resultado, riesgo y trades propios.
- `Payouts` calcula bruto, neto, fees y estado.
- `Rules` declara fuente/provenance y version de reglas.
- Hay fixtures para journey activo, journey passed, funded con payout, failed y manual payout.

## No objetivos V1

- ejecucion automatica;
- contabilidad completa fuera de fondeo;
- conciliacion bancaria automatica;
- marketplace de firmas;
- scraping automatico de reglas de firmas.
