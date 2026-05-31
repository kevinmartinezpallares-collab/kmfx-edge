Quiero que al migrar KMFX a Next.js tomes como referencia directa este mockup ya creado:

Proyecto de referencia:
`/Users/conlopuestoyaloloco/Desktop/tripled-trading-dashboard`

URL local:
`http://localhost:3042/`

No lo uses solo como inspiracion: revisa el codigo real, especialmente:

- `src/components/trading/trading-dashboard.tsx`
- `src/app/page.tsx`
- `src/app/globals.css`
- `src/components/uitripled/`
- `src/components/ui/`

Quiero que el dashboard de KMFX mantenga esta misma direccion visual:

- Next.js App Router
- shadcn/ui
- componentes reales de UI TripleD
- charts con `liveline`
- modo dark
- tonos negros/grises, sin azules, verdes ni colores llamativos
- sidebar navegable
- secciones tipo Mesa, Mercados, Cartera, Riesgo, Estrategias y Diario
- estetica Apple/high-end, limpia, densa y profesional
- responsive desktop/mobile
- reemplazar los datos mock por datos reales de KMFX cuando existan

Importante:

- no copies cosas innecesarias;
- no rompas logica existente de KMFX;
- usa el mockup como destino visual y estructural, adaptandolo al proyecto real.

Antes de implementar:

1. abre el proyecto de referencia;
2. entiende su estructura;
3. explicame que partes vas a trasladar a KMFX;
4. separa claramente que sera referencia visual, que sera componente reutilizable y que no debe copiarse.

Fuentes de UI a priorizar:

1. Efferd para el app shell si encaja con KMFX.
2. UI TripleD para componentes reales ya resueltos.
3. shadcn/ui para los componentes base y fallback.

No mezcles esta migracion con fixes criticos de go-live.

## Bloque especial: Funding Journey

Cuando trabajes en `Fondeo`, no lo construyas como una lista plana de cuentas.

Lee primero:

- `docs/nextjs-funding-journey-ui-contract.md`
- `docs/nextjs-portfolio-product-ui-contract.md`
- `docs/prd-funding-risk-cockpit.md`
- `docs/domain-model-funding-portfolio-v1.md`
- `docs/kmfx-data-dictionary-v1.md`
- `docs/nextjs-route-content-contract.md`
- `docs/nextjs-route-acceptance-gates.md`

Objetivo:

- agrupar Fase 1, Fase 2 y Real/Funded bajo un mismo `FundingJourney`;
- conservar cuentas/logins historicos cuando cambia la fase;
- mostrar progreso, riesgo, trades, payouts, fees, resets, neto y timeline;
- separar PnL de trading de economia real de fondeo;
- no inventar reglas de firma cuando falte provenance.

Rutas objetivo:

- `/funding`
- `/funding/journeys`
- `/funding/journeys/[journeyId]`
- `/funding/accounts`
- `/funding/payouts`
- `/funding/rules`

Componentes esperados:

- `FundingKpiStrip`
- `FundingJourneyTable`
- `FundingPhaseStepper`
- `FundingStageSummaryGrid`
- `FundingPayoutLedger`
- `FundingRuleMatrix`
- `FundingTimeline`

Antes de implementar, dime que datos salen del live snapshot, que datos son fixture/manuales y que campos necesitan persistencia futura.
