# KMFX Edge Next.js Route Acceptance Gates

Estado: gates de aceptacion por ruta  
Ultima revision: 2026-05-26  
Alcance: definir cuando una ruta migrada a Next.js puede considerarse lista para uso interno, beta o posible cutover.

## Proposito

Una ruta no esta lista porque:

- se parece a la actual;
- usa componentes bonitos;
- o renderiza datos sin romper.

Esta lista cuando supera un gate funcional, visual, semantico y operativo.

Este documento define esos gates.

## Niveles de readiness

### `R0 - Spec only`

- existe definicion documental
- no hay implementacion

### `R1 - Scaffolded`

- la ruta existe en `apps/web-next`
- renderiza shell y placeholders validos

### `R2 - Read-only integrated`

- conecta datos reales o fixtures fieles
- renderiza estados correctos
- no depende de write flows

### `R3 - Product usable`

- sirve para trabajo diario real en su scope
- estados degradados correctos
- visual y semantica alineadas con KMFX

### `R4 - Cutover candidate`

- lista para beta controlada o sustitucion parcial
- QA y rollback pensados

## Corte V1 beta simple - 2026-05-26

Para no complicar la primera beta, el corte V1 solo considera activas estas rutas:

- `/dashboard`
- `/accounts`
- `/capital`
- `/analytics`
- `/analytics/daily`
- `/analytics/hourly`
- `/analytics/risk`
- `/trades`
- `/calendar`
- `/tools/calculator`
- `/study`
- `/settings`
- `/subscription`
- `/settings/subscription`

Las rutas avanzadas quedan cargables por URL directa, pero degradadas al estado comun `Proximamente` hasta cerrarlas en un chat dedicado:

- `/risk`
- `/journal`
- `/journal/review-queue`
- `/journal/entries`
- `/journal/ai-review`
- `/strategies`
- `/strategies/backtest-vs-real`
- `/strategies/portfolio`
- `/funding`
- `/funding/journeys`
- `/funding/accounts`
- `/funding/rules`
- `/funding/payouts`
- `/market`
- `/market/economic-calendar`
- `/execution`

Guardrails automatizados:

- `npm run validate:cascade` valida scope de migracion, navegacion, copy visible, selectores core, typecheck y lint sin servidor.
- `npm run test:smoke:routes` valida que las rutas V1 cargan y que las rutas avanzadas muestran `Proximamente` sin overlays visibles.
- `src/lib/domain/migration-scope.test.ts` impide meter runtime sensible o legacy en `apps/web-next`.

## Gate comun para cualquier ruta

Antes de llegar a `R4`, toda ruta debe cumplir:

- nombre canonico estable
- página App Router cubierta por título visible en `routeTitles`
- prioridad mobile explícita si aparece como ruta principal
- rutas admin fuera de navegación visible
- ownership de datos claro
- view model tipado
- desktop correcto
- mobile intencional
- dark mode correcto
- light mode no roto estructuralmente
- empty/loading/error/stale correctos
- sin imports de render legacy
- sin copy tecnico en modo usuario normal
- sin vocabulario interno o confuso para trader final (`mock`, `fixture`, `muestra`, `drena`, `tag`, `workspace`, estados internos)
- separadores compactos con `/`, no con punto medio
- copy visible cubierto por `src/lib/domain/visible-copy.test.ts` en paginas App Router, componentes de pantalla y selectores clave cuando toque una ruta core

## Rutas Wave 1

## `/dashboard`

Objetivo:

- command center real

Gate `R2`:

- muestra cuenta activa, KPIs core y chart principal
- usa `AccountSnapshot`, `ReportMetrics` y `RiskSnapshot`
- soporta fixture `account-live-happy`
- soporta fixture `account-live-no-report-metrics`
- soporta fixture `account-live-stale`
- `buildDashboardPerformance`, `buildDashboardAttentionItems`, atribución setup/símbolo/sesión y `resolveAccountMode` viven en dominio testeado

Gate `R3`:

- lectura clara en menos de 10 segundos
- no repite widgets sin decision
- freshness visible
- semantica de KPIs coincide con producto actual

Gate `R4`:

- comparativa visual y semantica frente a la ruta legacy
- sin perdida de contexto de cuenta
- smoke de datos live satisfactorio

## `/accounts`

Objetivo:

- control y contexto de cuentas

Gate `R2`:

- lista cuentas reales con estados
- account switcher funcional
- gating por entitlements visible
- fixture `workspace-two-accounts-mixed`
- fixture `workspace-entitlement-limited`
- `getAccountsOverview` clasifica `ready`, `partial`, `stale` y `empty`
- payload sin cuentas no rompe el render ni crea una cuenta fantasma

Gate `R3`:

- distingue bien `active`, `pending`, `stale`, `revoked`, `plan_limited`
- no expone datos si el plan no permite live data
- detalle de cuenta claro

Gate `R4`:

- parity con ownership guard actual
- pruebas de cambio de cuenta y refresco sin inconsistencias

## `/risk`

Objetivo:

- cockpit de proteccion

Gate `R2`:

- consume `riskSnapshot.summary`, `status`, `policy`, `policy_evaluation`
- muestra estado operativo, drawdown, room diario, heat y riesgo abierto
- muestra gestion por cuenta y riesgo sugerido sin prometer aprobacion de fondeo
- muestra reglas configurables y riesgo por sesion como preparacion de politica
- fixture `risk-safe`
- fixture `risk-caution`
- fixture `risk-blocked`
- fixture `account-live-no-risk-snapshot`
- `getRiskGuardPosture` renderiza seguro sin cuentas, exposiciones ni limites

Gate `R3`:

- ninguna policy default aparece como limite real
- bloqueos y warnings son comprensibles
- faltas de datos degradan bien
- no se afirma bloqueo tecnico MT5 sin confirmacion del EA
- la pantalla evita matrices/analiticas secundarias si no ayudan a la decision diaria

Gate `R4`:

- parity semantica con Risk legacy
- validacion manual con snapshots live y stale

## `/analytics`

Objetivo:

- profundizar sin romper claridad
- nombre visible `Insights`

Gate `R2`:

- summary renderiza con operaciones y/o report metrics
- daily/hourly/risk subroutes existen
- fixture `trades-session-rich`
- fixture `trades-small-sample`
- `getAnalyticsReadiness` clasifica `empty`, `partial` y `ready`
- no confunde datos agregados con operaciones etiquetadas visibles
- contrato de producto en `docs/nextjs-insights-product-ui-contract.md`
- atribución de aportes/problemas, curva acumulada, dependencia de operaciones aisladas y subrutas daily/hourly usan `buildInsightAttribution`, `getAnalyticsDailyOverview` y `getAnalyticsHourlyOverview`, no agregados locales en UI

Gate `R3`:

- muestra confianza baja cuando toca
- no sobredimensiona datos insuficientes
- tabs y subroutes son coherentes
- no duplica Panel, Review ni Playbooks; deriva a cada ruta cuando toca
- `/analytics/risk` funciona como Control de Insights: no duplica RiskGuard y decide si la lectura se puede usar, vigilar o derivar

Gate `R4`:

- parity con surfaces analiticas actuales
- no genera contradicciones con Dashboard ni Risk

## Rutas Wave 2

## `/trades`

Gate `R2`:

- tabla base con operaciones agrupadas
- partial close grouping validado
- fixture `trades-partial-close-grouped`
- prioridad de review por operación sale de selector de dominio, no de lógica local de UI
- resumen de ledger, costes, cobertura de setup y concentracion salen de dominio testeado (`getTradesOverview`)

Gate `R3`:

- lectura de net/gross clara
- filtros basicos y columnas prioritarias correctas

## `/calendar`

Gate `R2`:

- calendario por `tradingDayKey`
- heat y actividad diarios correctos
- navegacion mensual sin depender de URL nueva
- color visual por dia positivo/negativo, manteniendo el numero legible
- `buildCalendarRows`, agregados mensual/anual y `buildCalendarMonthCells` viven en dominio testeado
- `getCalendarPeriodOverview` concentra periodo activo, semanas, vista anual, dia seleccionado y operaciones del dia fuera de la UI

Gate `R3`:

- lectura rapida y drill-down razonable
- vista anual con mini-calendarios por mes
- ventana de detalle al abrir un dia con operaciones, apertura/cierre y operaciones del dia
- grafica de rentabilidad acumulada con `liveline` o equivalente aceptado
- tabla de rentabilidad anual tipo KMFX Edge con cambio entre `$` y `%`

## `/journal`

Gate `R2`:

- cockpit read-only o mixed con entries reales/manuales
- review queue visible como concepto
- `buildReviewPriorityRows`, `getReviewReadiness` y `getReviewAction` viven en dominio testeado
- overview de journal y review IA heuristica salen de dominio testeado (`getJournalOverview`, `getJournalAiReviewOverview`)
- no llama LLM ni promete conclusiones IA reales en V1

Gate `R3`:

- la ruta ayuda a revisar, no solo a listar notas
- estados `empty`, `clean` y `needs_review` son explícitos

## `/strategies`

Gate `R2`:

- surfaces base de strategy list y attribution
- integra backtest-vs-real donde exista
- `buildStrategyRows` y `getStrategiesReadiness` viven en dominio testeado
- las operaciones sin setup degradan la lectura a `partial`, no se esconden ni se convierten en edge real

Gate `R3`:

- atribución de edge y calidad de datos entendibles
- no convierte pocas operaciones en recomendación de capital sin aviso

## `/capital`

Gate `R2`:

- agrega varias cuentas sin romper semantica
- fixture `workspace-multi-account-portfolio-heat`
- allocation y contribution por cuenta
- real/demo/funding/Darwinex/bots se distinguen
- policy readiness muestra blockers
- `getPortfolioPolicyReadiness` bloquea export/readiness si no hay cuentas
- `getPortfolioOverview` concentra allocation, contribution, capital curve, concentración y blockers de policy fuera de la UI
- no activa export real de EA ni routing automatico

Gate `R3`:

- ya se siente como portfolio layer real
- concentration cruza cuenta, simbolo, setup y bot cuando hay datos
- strategy/bot allocation permite decidir scale/keep/reduce/pause
- incluye lectura read-only de policy readiness sin exportar ni aplicar reglas
- diferencia señal derivada de datos actuales de policy versionada pendiente
- muestra estados `empty`, `partial` o `requires_review` sin inventar policy readiness

## `/market`

Gate `R2`:

- muestra simbolos activos derivados de trades y exposicion disponible
- identifica simbolo caliente, simbolos en vigilancia y sesion dominante
- `buildMarketRows` y `getMarketReadiness` viven en dominio testeado
- usa chart principal con `liveline` o componente equivalente aprobado
- no intenta reemplazar TradingView ni inventa precios live si no hay proveedor conectado

Gate `R3`:

- ayuda a decidir que simbolo merece atencion antes de operar
- deriva correctamente hacia Trades, RiskGuard y Calendario economico
- distingue contexto operativo de senal de trading
- estados sin trades o sin exposicion degradan sin ruido

## `/market/economic-calendar`

Gate `R2`:

- ruta existe bajo Mercado como subruta, no como bloque pesado del Panel
- muestra agenda economica, impacto, moneda, simbolos afectados y ventana de proteccion
- muestra calendario macro read-only con avisos previstos
- deja claro que el proveedor de datos esta pendiente si no hay fuente conectada
- agenda, simbolos vigilados y avisos macro salen de dominio testeado (`getEconomicCalendarOverview`)
- configuracion de proveedor/feature flag cubierta por `macro-calendar.test.ts`

Gate `R3`:

- no depende de scraping ni de datos sin provenance
- no promete tiempo real, bloqueo tecnico ni enforcement de MT5 sin fuente y EA confirmados
- permite conectar avisos 30/15/5 min y derivar recomendaciones a RiskGuard
- separa eventos informativos de eventos que realmente afectan a la cuenta activa

## `/execution`

Gate `R2`:

- diagnostico read-only de calidad de ejecución basado en operaciones cerradas
- `getExecutionQuality` vive en dominio testeado
- distingue `empty`, `partial` y `ready` sin bloquear el render
- no finge MAE/MFE, slippage ni spread si el feed no lo trae

Gate `R3`:

- conecta los hints con Review, Trades y Playbooks sin duplicar esas pantallas
- prioriza salidas parciales, duración, etiquetas y pérdidas rápidas como señales accionables
- muestra claramente que la capa avanzada depende de datos de ejecucion reales

## Rutas Wave 3

## `/funding`

Gate `R2`:

- detalle de cuenta funding y reglas visibles
- `FundingJourney` agrupa Fase 1, Fase 2 y Real/Funded
- overview muestra capital fondeado, cuentas activas, payouts, fees/resets y neto real
- overview, cola de riesgo y conteos `nearPass/nearBreach` salen de dominio testeado, no de calculos locales de UI
- fixture `funding-challenge-linked`
- fixture `funding-requires-review`

Gate `R3`:

- room, phase y provenance claros
- journey detail permite reconstruir la historia completa del examen a la cuenta real
- payouts manuales y costes no se mezclan con PnL de trading

## `/funding/journeys`

Gate `R2`:

- listado de journeys con firma, programa, tamano, fase actual y estado
- cada journey muestra resultado de Fase 1, Fase 2 y Real/Funded si existe

Gate `R3`:

- filtros por firma, fase, estado, payout y resultado
- neto real calculado desde payouts menos fees/resets

## `/funding/journeys/[journeyId]`

Gate `R2`:

- tabs internas: Resumen, Fase 1, Fase 2, Real, Trades, Riesgo, Payouts, Timeline
- cada fase visible tiene cuenta/login, progreso, resultado, trades y snapshot de riesgo

Gate `R3`:

- timeline reconstruye eventos principales sin perder cuentas historicas
- Real/Funded muestra payout defense y proxima accion

## `/funding/accounts`

Gate `R2`:

- tabla de logins/cuentas ligada a journey y fase
- diferencia cuentas activas e historicas
- las filas de cuentas salen de `getFundingAccountRows`

Gate `R3`:

- sync health y room actual visibles para cuentas activas

## `/funding/payouts`

Gate `R2`:

- ledger de payouts y pagos manuales
- soporta payout recibido, payout solicitado, fee challenge, reset, refund y ajuste manual
- payouts, fees/resets, neto real y modo defensivo salen de `getFundingPayoutsOverview`

Gate `R3`:

- calcula bruto, neto, fees, estado y tiempo solicitud -> pago

## `/funding/rules`

Gate `R2`:

- reglas por firma/programa/fase
- provenance y version visibles
- filas, conteos y notas de reglas salen de `getFundingRulesOverview`

Gate `R3`:

- overrides manuales por cuenta y estado `requires_review`

## `/settings`

Gate `R2`:

- solo cuando exista wrapper seguro de auth/config
- puede mostrar estado read-only de suscripcion/plan si no invoca billing real
- resumen de ajustes vive en dominio testeado (`getSettingsOverview`)
- explicita que login, billing, launcher, acciones MT5 y preferencias persistidas siguen pospuestos

Gate `R3`:

- persistencia fiable
- sin flashes o estados ambiguos
- billing/auth solo pueden activarse con wrapper dedicado, provenance y rollback claro

## `/study`

Gate `R2`:

- Biblioteca visible como apoyo de metricas, formulas y contexto operativo
- glosario y contexto salen de dominio testeado (`getStudyOverview`)
- no duplica `Insights`, `Review`, calendario ni `RiskGuard`
- conserva terminos trader (`PnL`, `Win rate`, `Profit factor`, `Expectancy`, `Score`) cuando son nombres estandar

Gate `R3`:

- enlaza formulas con datos reales y source/provenance cuando aplique
- permite ampliar contenido sin meter ruido en el panel principal

## `/tools/calculator`

Gate `R2`:

- calculadora de lotaje FX estilo Myfxbook visible sin tocar ejecucion real
- formula y conversion FX viven en dominio testeado (`calculateFxLotSize`)
- resumen de cuentas, presupuesto de riesgo, límite externo y mayor margen salen de dominio testeado (`getLotSizingOverview`)
- aplica límite de fondeo cuando existe, sin convertirlo en regla oficial de firma
- cuentas sin fondeo no reciben límite externo falso ni margen diario inventado
- distingue alcance actual de FX majors/cruces frente a indices, metales o CFDs pendientes

Gate `R3`:

- soporta presets por cuenta/politica cuando exista persistencia segura
- documenta claramente fuente de precios/conversion si deja de usar tabla estatica
- no envia ordenes ni modifica riesgo real hasta que exista EA/policy package validado

## `/debug`

Gate `R2`:

- visible solo con gating real
- por defecto devuelve 404 si `KMFX_ENABLE_DEBUG_ROUTE` no esta activado

Gate `R3`:

- util sin contaminar experiencia normal
- sin enlaces visibles en la sidebar trader

## Gate de rollback

Una ruta solo puede pasar a beta/cutover si:

- puede convivir con la legacy
- su fallo no bloquea otras rutas
- rollback a legacy es simple

## Evidencia minima por ruta

Cada ruta candidata a `R4` debe tener:

- fixture coverage minimo
- screenshots desktop
- screenshots mobile
- lista de estados cubiertos
- lista de dependencias de datos
- decision explicita de lo que queda fuera

## Relacion con documentos existentes

- `docs/nextjs-route-migration-matrix.md`
- `docs/kmfx-fixture-pack-spec-v1.md`
- `docs/nextjs-master-migration-roadmap.md`
