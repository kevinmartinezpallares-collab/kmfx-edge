# KMFX Next.js Implementation Work Breakdown

Estado: backlog ejecutable de implementacion  
Ultima revision: 2026-05-26  
Alcance: desglosar las Fases 3 a 6 del roadmap maestro en lotes de trabajo pequeños, ordenados y ejecutables.

## Estado de ejecucion

- Bloque A: materialmente completo
- Bloque B: avanzado con contratos y adapters activos; siguen pendientes extracciones más profundas desde legacy
- Bloque C: materialmente completo en rutas core read-only
- Bloque D: parcial
- Bloque E: parcial
- Bloque F: avanzado y ya visible en varias rutas Wave 2 y Wave 3; `Trades`, `Review`, `Calendar` y `Portfolio` ya cierran un primer loop operativo desde `Panel`
- Bloque G: especificado para Funding Journey; pendiente de implementacion completa

## Avance aplicado 2026-05-16

- `Panel`: queda orientado a cuenta activa, curva equity/balance, contexto de cuenta, trades recientes, review y calendario.
- `Trades`: ledger read-only reforzado con PnL neto, costes, cobertura de etiquetas, salidas parciales y prioridad de review por fila.
- `Review`: la ruta deja de ser solo diario y funciona como cola accionable conectada al ledger.
- `Calendar`: mantiene mensual/anual/drill-down diario y enlaza hacia Trades y Review Queue.
- `Portfolio`: sustituye posiciones de prueba por exposición derivada de `risk.exposureBySymbol`.

## Avance aplicado 2026-05-19

- La navegación visible queda congelada por tests: `Operativa`, `Decisión` y `Sistema`.
- `Execution`, `Playbooks`, `Mercado` y `Calculadora` ya extraen selectores/logica reusable a dominio testeado.
- `Insights` queda documentado en `docs/nextjs-insights-product-ui-contract.md` para no tocar su visual hasta revisar KMFX Edge legacy.
- Se limpia copy visible en inglés/técnica de rutas read-only sin activar billing, auth, launcher ni enforcement MT5.

## Avance aplicado 2026-05-20

- `Insights`, `Review`, `Trades`, `Playbooks`, `Execution`, `Calculadora`, `Biblioteca`, `Panel` y `Calendario macro` quedan alineados con vocabulario visible sencillo: operaciones, etiquetas, PnL neto, presupuesto de riesgo y avisos macro.
- Se eliminan de contratos y selectores visibles términos técnicos anteriores cuando podían aparecer ante usuario.
- `Control de Insights` queda documentado como capa de interpretación, no como duplicado de RiskGuard.
- `npm run validate` queda como comando seguro para avanzar sin levantar servidor: tests, typecheck y lint.
- Se añaden contratos automatizados para stack, tema, navegación, copy visible y configuración de calendario macro.
- La barrera de copy visible cubre ahora paginas App Router del workspace, componentes de pantalla y selectores clave. Metadata y etiquetas de sincronizacion se normalizan a lenguaje de usuario.

## Avance aplicado 2026-05-26

- V1 queda simplificada para beta inicial: `Panel`, `Cuentas`, `Portfolio`, `Insights`, `Trades`, `Calendario`, `Calculadora`, `Biblioteca`, `Ajustes` y `Suscripcion`.
- `RiskGuard`, `Review`, `Playbooks`, `Prop Firms`, `Mercado` y `Ejecucion` quedan en `Proximamente` para evitar secciones complejas a medias en la primera version.
- Se refuerzan tests de navegacion para que las subrutas de modulos avanzados no puedan quedar habilitadas por accidente.
- La cobertura del smoke test queda alineada por test unitario con rutas V1 y rutas `Proximamente`, evitando listas divergentes.
- El placeholder compartido `Proximamente` expone `h1` para que cualquier ruta avanzada sea auditable por smoke test y no quede como pantalla sin heading.
- Se añade guardrail de aislamiento de migracion para bloquear imports sensibles de Supabase, Stripe, OpenAI, Node runtime y piezas legacy de Launcher/MT5 dentro de `apps/web-next`.
- `npm run validate:cascade` queda como comando unico para la bateria segura V1: scope de migracion, navegacion, copy visible, selectores core, typecheck y lint.
- Se refuerza copy visible del menu de usuario/login para bloquear texto heredado de plantillas en ingles o subtitulos internos.
- Se añade `docs/nextjs-v1-beta-readiness-checklist.md` para separar cierre V1, rutas en `Proximamente`, datos demo, QA visual y no-go de beta.
- `Cuentas` expone CTAs seguros de `Anadir cuenta` y `Abrir launcher` como UI preparatoria, sin persistencia sensible ni acciones MT5 reales.

## Cola visual pendiente

Esta cola no bloquea los guardrails tecnicos, pero no debe confundirse con cierre R3/R4:

- `Panel`: revisar densidad, huecos verticales, peso de KPIs y jerarquia del chart equity/balance.
- `Insights / Resumen`: mantener como resumen visual de Día, Horario y Riesgo; evitar duplicar Panel.
- `Insights / Día`: acercar mapa diario y lista de días clave al patrón KMFX Edge.
- `Insights / Horario`: cerrar mapa horario con selector visual y lectura inmediata.
- `Calendario`: optimizar responsive desktop estrecho y detalle diario sin cards anidadas.
- `RiskGuard`: conservar enfoque simple de centro de control, sin tablas ni barras excesivas.

## Proposito

El roadmap maestro dice que hacer y en que orden.

Este documento dice:

- que lote atacar primero
- que depende de que
- que entrega cada lote

## Reglas

- no tocar runtime actual
- un lote no abre otro frente si no deja una salida clara
- cada lote debe poder revisarse y validarse por si mismo

## Bloque A - Scaffold y shell base

### A1. Scaffold limpio

Entregables:

- `apps/web-next`
- TypeScript
- Tailwind 4
- ESLint
- App Router

Dependencias:

- ninguna

### A2. shadcn init

Entregables:

- `components.json`
- `ui/` base
- alias verificados

Depende de:

- A1

### A3. Fixes de fuentes y tokens

Entregables:

- `globals.css` corregido
- layout con variables en `<html>`

Depende de:

- A2

### A4. Dependencias baseline

Entregables:

- `recharts`
- `liveline`
- `framer-motion`
- `next-themes`
- `react-resizable-panels`
- `sonner`

Depende de:

- A1

### A5. Shell skeleton

Entregables:

- `WorkspaceSidebar`
- `WorkspaceTopbar`
- `WorkspaceMobileNav`
- `WorkspaceStatusStrip`

Depende de:

- A2
- A3

## Bloque B - Capa de contratos y adapters

### B1. Contratos base

Entregables:

- `account.ts`
- `workspace-state.ts`
- `live-snapshot.ts`
- `risk.ts`

Depende de:

- documentación actual

### B2. Adapter de snapshot live

Entregables:

- cliente typed de `/api/accounts/snapshot`
- normalizacion de respuestas y errores

Depende de:

- B1

### B3. Adapter MT5 tipado

Entregables:

- normalizacion de account
- positions
- trades
- reportMetrics
- riskSnapshot

Depende de:

- B1

### B4. Selectores puros iniciales

Entregables:

- formatters
- account selectors
- risk selectors base

Depende de:

- B3

## Bloque C - Wave 1 shell + rutas core

### C1. `/dashboard` placeholder estructural

Entregables:

- shell completo
- hero layout
- cards skeleton

Depende de:

- A5

### C2. `/accounts` placeholder estructural

### C3. `/risk` placeholder estructural

### C4. `/analytics` placeholder estructural

Todas dependen de:

- A5

### C5. Integracion live read-only en `/accounts`

Entregables:

- lista real de cuentas
- estados live/stale/pending/limited

Depende de:

- B2
- B3

### C6. Integracion live read-only en `/dashboard`

Entregables:

- KPIs core
- chart principal
- estado de cuenta activa

Depende de:

- B3
- B4

### C7. Integracion live read-only en `/risk`

Entregables:

- summary
- status
- exposure
- open trade risks

Depende de:

- B3
- B4

### C8. Integracion read-only en `/analytics`

Entregables:

- summary
- daily
- hourly
- risk

Depende de:

- B3
- B4

## Bloque G - Funding Journey

### G1. Contratos Funding Journey

Entregables:

- `FundingJourney`
- `FundingStageAccount`
- `FundingPayout`
- `ManualFundingTransaction`
- `FundingTimelineEvent`

Depende de:

- `docs/nextjs-funding-journey-ui-contract.md`
- `docs/domain-model-funding-portfolio-v1.md`

### G2. Fixtures Funding Journey

Entregables:

- journey activo en Fase 1
- journey con Fase 1/Fase 2 pasadas
- funded con payout recibido
- journey fallado
- payout manual y reset fee

Depende de:

- G1

### G3. Rutas Funding

Entregables:

- `/funding`
- `/funding/journeys`
- `/funding/journeys/[journeyId]`
- `/funding/accounts`
- `/funding/payouts`
- `/funding/rules`

Depende de:

- G1
- G2

### G4. Componentes Funding

Entregables:

- `FundingKpiStrip`
- `FundingJourneyTable`
- `FundingPhaseStepper`
- `FundingStageSummaryGrid`
- `FundingPayoutLedger`
- `FundingRuleMatrix`
- `FundingTimeline`

Depende de:

- G3

## Bloque D - Componentes de dominio Wave 1

### D1. `MetricCard`
### D2. `ChartPanel`
### D3. `AccountIdentity`
### D4. `RiskStatusBadge`
### D5. `DataFreshnessNotice`
### D6. `AuthorityNotice`

Dependencias:

- A5
- B4

## Bloque E - Estados degradados y QA base

### E1. empty/loading/error/stale states por ruta
### E2. fixture wiring
### E3. screenshots desktop/mobile
### E4. light-mode non-break verification

Dependencias:

- C5 a C8
- D1 a D6

## Bloque F - Preparacion Wave 2

### F1. trade grouping utilities
### F2. calendar day aggregation

Estado:

- Implementado en `apps/web-next` como calendario mensual navegable, vista anual, tabla de rentabilidad, `$/%`, curva acumulada y detalle diario.
- Pendiente de validacion visual con servidor local cuando sea seguro levantarlo.

### F3. journal data boundaries
### F4. strategies attribution boundaries
### F5. capital/portfolio aggregation boundaries

Dependencias:

- B3
- B4
- E1

## Orden recomendado de ejecucion

1. A1
2. A2
3. A3
4. A4
5. A5
6. B1
7. B2
8. B3
9. B4
10. C1-C4
11. D1-D6
12. C5-C8
13. E1-E4
14. F1-F5
15. G1-G4

## Gate de salida de Fase 3

- Bloque A completo

## Gate de salida de Fase 4

- Bloques B completos

## Gate de salida de Fase 5

- shell base estable

## Gate de salida de Fase 6

- Bloques C, D y E completos con rutas core en `R2/R3`

## Relacion con documentos existentes

- `docs/nextjs-master-migration-roadmap.md`
- `docs/nextjs-bootstrap-execution-runbook.md`
- `docs/nextjs-route-acceptance-gates.md`
- `docs/nextjs-official-guidance-notes.md`
- `docs/nextjs-funding-journey-ui-contract.md`
