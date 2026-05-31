# KMFX Edge Master Roadmap de Migracion a Next.js

Estado: roadmap maestro de migracion  
Ultima revision: 2026-05-26  
Alcance: migracion completa de la app frontend actual a una app paralela en Next.js App Router, con control estricto para no romper produccion ni rehacer trabajo innecesariamente.

## Estado real al 2026-05-16

Situacion:

- `apps/web-next` ya existe y compila estable.
- el shell real ya no sigue `Efferd app-shell-5`; se consolidó una shell propia basada en `tripled-trading-dashboard` + `shadcn/ui` + `UI TripleD`.
- las rutas core y gran parte de las secundarias ya salieron del scaffold.
- el roadmap mantiene varias casillas abiertas a propósito porque `existir` no equivale todavía a `fase cerrada`.

Lectura correcta de este documento desde esta fecha:

- una casilla abierta puede significar:
  - la capacidad existe pero no ha alcanzado criterio de salida;
  - la ruta existe pero aún no tiene toda la profundidad funcional final;
  - la documentación del cierre de fase aún no se considera aprobada.

## Proposito

Este documento es la fuente de verdad de alto nivel para toda la migracion.

Su funcion no es sustituir los documentos tacticos ya creados, sino:

- ordenar toda la migracion de punta a punta;
- fijar el orden correcto de ejecucion;
- definir puertas de salida y criterios de no-avanzar;
- evitar que se mezclen frentes incompatibles;
- reducir retrabajo y decisiones reabiertas.

## Principio rector

La migracion no se hace para "pasar a Next".

Se hace para conseguir una app mejor:

- mas mantenible;
- mas tipada;
- mas clara visualmente;
- mas modular;
- mas segura para evolucionar;
- sin romper el flujo real actual de KMFX.

## Regla base

Hasta que la nueva app este validada:

- la app vanilla actual sigue siendo la superficie productiva;
- no se sustituye `index.html` ni `app.js`;
- no se mezclan hotfixes criticos de produccion con trabajo de migracion visual;
- no se cambia billing, auth sensible, launcher, bridge MT5 ni contratos criticos en fases tempranas.

## Objetivo final

Tener una app `apps/web-next` que:

- conviva en paralelo durante la migracion;
- use Next.js App Router + TypeScript + Tailwind 4 + shadcn/ui;
- implemente el shell propio KMFX basado en `tripled-trading-dashboard`, shadcn/ui y piezas Efferd solo cuando encajen como componentes aislados;
- preserve la logica y contratos validos de KMFX;
- migre primero las superficies read-only de mayor valor;
- permita un cutover gradual con paridad funcional y visual suficiente.

## Resultado final esperado

Cuando el roadmap se complete, deberiamos tener:

- shell nuevo y consistente;
- rutas core migradas;
- logica de dominio separada del render;
- contratos tipados;
- componentes de dominio reutilizables;
- mobile serio;
- dark-first estable;
- light mode planificado y no improvisado;
- funding, risk y portfolio integrados con sentido;
- posibilidad futura de `portfolio policy` y `EA export` sobre una base sana.

## Decisiones ya bloqueadas

- La migracion va en paralelo, no in-place.
- La nueva app vive en `apps/web-next`.
- Stack base: `Next.js App Router`, `TypeScript`, `Tailwind 4`, `shadcn/ui`.
- Shell visual efectiva: composicion propia basada en `tripled-trading-dashboard`, `shadcn/ui` y componentes `UI TripleD`.
- Fuente visual primaria de referencia: `tripled-trading-dashboard`.
- Dark-first como experiencia primaria.
- Light mode como segunda pasada disciplinada.
- No tocar billing/auth/launcher/MT5 sensible en fases tempranas.

## Documentos que ya soportan este roadmap

- `docs/nextjs-migration-blueprint.md`
- `docs/nextjs-ui-reference-roadmap.md`
- `docs/nextjs-bootstrap-checklist.md`
- `docs/nextjs-route-migration-matrix.md`
- `docs/nextjs-route-content-contract.md`
- `docs/nextjs-extraction-backlog.md`
- `docs/nextjs-shell-slot-map.md`
- `docs/nextjs-ui-component-inventory.md`
- `docs/nextjs-wave1-ui-manifest.md`
- `docs/nextjs-visual-token-spec.md`
- `docs/nextjs-mobile-responsive-spec.md`
- `docs/nextjs-light-mode-strategy.md`
- `docs/nextjs-scaffold-file-spec.md`
- `docs/nextjs-ownership-map.md`
- `docs/product-strategy-trader-first.md`
- `docs/funding-variable-risk-and-ea-strategy.md`
- `docs/prd-funding-risk-cockpit.md`
- `docs/nextjs-funding-journey-ui-contract.md`
- `docs/nextjs-insights-product-ui-contract.md`
- `docs/nextjs-economic-calendar-provider-strategy.md`
- `docs/macro-calendar.md`
- `docs/prd-portfolio-policy-and-ea-export.md`
- `docs/nextjs-portfolio-product-ui-contract.md`
- `docs/domain-model-funding-portfolio-v1.md`
- `docs/policy-evaluation-contract-spec.md`
- `docs/kmfx-data-dictionary-v1.md`
- `docs/kmfx-field-source-map-v1.md`
- `docs/kmfx-fixture-pack-spec-v1.md`
- `docs/nextjs-cross-route-dependency-map.md`
- `docs/nextjs-route-acceptance-gates.md`
- `docs/nextjs-data-adapter-safety-audit.md`
- `docs/nextjs-cutover-rollout-strategy.md`
- `docs/kmfx-fixture-redaction-policy.md`
- `docs/nextjs-bootstrap-execution-runbook.md`
- `docs/nextjs-official-guidance-notes.md`
- `docs/nextjs-implementation-work-breakdown.md`
- `docs/nextjs-migration-risk-register.md`
- `docs/nextjs-technical-readiness-checklist.md`
- `docs/nextjs-v1-beta-readiness-checklist.md`

## Reglas de ejecucion

1. No se implementa una fase sin haber cerrado la puerta de salida de la anterior.
2. No se migra una ruta metiendo directamente HTML legacy dentro de React.
3. No se importa un modulo legacy que escriba DOM dentro de `apps/web-next`.
4. No se cambia un contrato live sin fixture, test y validacion de impacto.
5. No se construye una pantalla nueva sin decidir antes:
   - datos
   - ownership
   - responsividad
   - estado empty/loading/error/stale
6. No se da por migrado un modulo solo porque "se ve parecido".
7. No se hace cutover por entusiasmo visual; se hace por paridad y seguridad.

## Anti-patrones explicitos

- mezclar migracion Next con fixes urgentes de go-live
- copiar render strings a JSX
- rehacer backend porque "ahora usamos Next"
- traer componentes premium sin encaje funcional
- abrir mobile y desktop en paralelo sin jerarquia
- tocar settings/auth antes de tener wrappers compatibles
- intentar migrar todas las rutas a la vez
- introducir defaults de policy como si fueran reglas reales del usuario

## Estructura del programa de migracion

La migracion se divide en 11 fases.

## Fase 0 - Gate de Produccion y Congelacion de Riesgo

Objetivo:

- asegurarnos de que el track Next no interfiere con el cierre y estabilidad del producto actual.

Checklist:

- [x] Revisar `docs/production-go-live-checklist.md` y `docs/final-user-go-live-audit.md`.
- [x] Confirmar que los pendientes de go-live criticos no se mezclan con la migracion.
- [x] Definir que tipos de cambios pueden entrar en paralelo y cuales quedan congelados.
- [x] Acordar que billing, auth sensible, launcher y MT5 write-flows quedan fuera de early migration.

Nota 2026-05-26:

- `production-go-live-checklist` y `final-user-go-live-audit` mantienen tareas reales de produccion pendientes, sobre todo usuario normal, billing live controlado, Launcher/EA y smoke MT5.
- El track Next V1 solo puede avanzar en UI/read-only, documentacion, fixtures, tests, contratos y rutas degradadas; cualquier cambio de auth, billing, launcher o MT5 write-flow queda congelado hasta wrapper dedicado.

Criterio de salida:

- existe un limite claro entre mantenimiento productivo y trabajo de migracion.

## Fase 1 - Bloqueo de Estrategia y Arquitectura

Objetivo:

- cerrar la direccion del producto y de la arquitectura antes de escribir codigo nuevo.

Checklist:

- [x] Bloquear el shell objetivo.
- [x] Bloquear la direccion visual.
- [x] Bloquear la estrategia dark-first.
- [x] Bloquear la estrategia mobile seria.
- [x] Bloquear el orden de rutas por waves.
- [x] Bloquear la estrategia trader-first para Desk, Risk, Funding, Portfolio y Journal.
- [x] Bloquear el enfoque de variable risk y `portfolio -> EA`.
- [ ] Revisar y aprobar este roadmap maestro como referencia principal.

Criterio de salida:

- no quedan dudas grandes sobre stack, shell, orden de migracion ni direccion de producto.

## Fase 2 - Bloqueo de Contratos y Modelo de Dominio

Objetivo:

- evitar reescribir pantallas sobre contratos ambiguos o cambiantes.

Checklist:

- [x] Definir contratos live actuales relevantes.
- [x] Definir inventario de tipos y fixtures objetivo.
- [x] Definir modelo de dominio para funding y portfolio.
- [x] Definir contrato de policy/evaluation/recommendation.
- [x] Crear primer diccionario de datos maestro en `docs/kmfx-data-dictionary-v1.md`.
- [x] Crear mapa operativo de fuentes en `docs/kmfx-field-source-map-v1.md`.
- [x] Definir primer `fixture pack spec` en `docs/kmfx-fixture-pack-spec-v1.md`.
- [x] Cerrar diccionario de datos campo a campo para:
  - cuentas
  - trades
  - positions
  - reportMetrics
  - riskSnapshot
  - funding profiles
  - portfolio policies
- [x] Marcar para cada campo:
  - fuente
  - tipo
  - ownership
  - si es editable o derivado
  - refresh
  - sensibilidad

Criterio de salida:

- el equipo puede construir rutas nuevas sin inventar estructura de datos sobre la marcha.

## Fase 3 - Preparacion del Entorno y Scaffold

Objetivo:

- crear `apps/web-next` sin tocar el runtime actual.

Checklist:

- [x] Crear `apps/web-next` con `create-next-app --yes`.
- [x] Inicializar `shadcn`.
- [x] Aplicar fixes de fuentes/Tailwind 4 descritos en el bootstrap checklist.
- [x] Instalar dependencias base aprobadas.
- [x] Crear el arbol de carpetas objetivo.
- [x] Dejar las rutas base placeholder:
  - `/dashboard`
  - `/accounts`
  - `/risk`
  - `/analytics`
- [x] Confirmar que la nueva app arranca de forma aislada.
- [x] Confirmar que no importa codigo legacy de render DOM.

Criterio de salida:

- la nueva app existe, compila y tiene un esqueleto limpio sobre el que empezar.

## Fase 4 - Extraccion de Capas Reutilizables

Objetivo:

- mover la logica util fuera del runtime legacy sin acarrear el render viejo.

Checklist:

- [x] Extraer contratos tipados.
- [x] Extraer selectores/formatters puros desde `utils.js`.
- [x] Extraer `risk-engine.js`.
- [x] Extraer `risk-alerts.js`.
- [x] Extraer `risk-selectors.js`.
- [x] Extraer metadata de estados.
- [x] Extraer adapters mock/live.
- [x] Aislar config API para uso Next.
- [x] Aislar polling/read-only live snapshot client.
- [x] Añadir tests unitarios y de contrato sobre lo extraido.

Regla:

- ningun modulo se considera extraido si aun depende de DOM, `window` legacy o side effects de render.

Nota de estado:

- 2026-05-16: creada primera red de tests de dominio en `apps/web-next` con `vitest` para formatters/selectores base, Funding Cockpit, Portfolio Policy readiness, RiskGuard selectors/alerts/engine, API config Next y adapter live/fixture. Esto no activa enforcement real ni write-flows; solo deja la capa read-only preparada.

Criterio de salida:

- existe una capa `lib/` y `features/**/domain` reutilizable por las primeras rutas Next.

## Fase 5 - Construccion del Shell Maestro

Objetivo:

- construir la infraestructura de experiencia antes de migrar muchas pantallas.

Checklist:

- [x] Implementar `WorkspaceSidebar`.
- [x] Implementar `WorkspaceTopbar`.
- [x] Implementar superficies de estado del shell.
- [x] Implementar `WorkspaceMobileNav`.
- [x] Implementar `WorkspaceUserMenu` con patron shadcn `sidebar-07`.
- [x] Implementar `command entry`.
- [x] Consolidar shell visual propia alineada con `tripled-trading-dashboard`.
- [x] Integrar tokens visuales KMFX.
- [x] Validar dark mode base.
- [x] Validar mobile shell base.

Criterio de salida:

- `/dashboard`, `/accounts`, `/risk` y `/analytics` viven dentro de un shell coherente y estable.

Nota de estado:

- 2026-05-19: el menu de usuario incluye acceso read-only a `Suscripcion y plan`; esto no activa billing real ni portal de pagos dentro de Next.
- 2026-05-20: las superficies de estado del shell quedan en sidebar/topbar con copy de usuario (`Datos`, `Riesgo usado`, cuenta activa) y sin `Fixture`, `Mock`, `Wave`, `Freshness` o `Sync` visibles.
- 2026-05-20: se añade `theme-contract.test.ts` para proteger imports Tailwind/shadcn, variante dark y tokens base `:root`/`.dark` antes de la pasada seria de light mode.
- 2026-05-26: `theme-contract.test.ts` entra en `validate:cascade` y protege tokens semanticos/charts `Liveline` para light/dark; Panel, Portfolio y Calendario deben seguir usando `theme` dinamico y colores por CSS variables.
- 2026-05-20: se añade `package-contract.test.ts` para congelar la base aprobada: Next 16 estable, React 19 alineado, `eslint-config-next` compatible, Tailwind 4.3, script `npm run validate` y preview por defecto con webpack para evitar regresiones de memoria con Turbopack.
- 2026-05-20: calendario macro queda protegido por `macro-calendar.test.ts`: default TradingView sin coste, feature flag publica para desactivar y fallback seguro si se configura un proveedor no soportado.
- 2026-05-20: `docs/nextjs-implementation-work-breakdown.md` separa cola visual pendiente de guardrails tecnicos para no cerrar Panel, Insights, Calendario o RiskGuard antes de la revision visual/producto correspondiente.

## Fase 6 - Wave 1: Rutas Core Read-Only

Objetivo:

- migrar las superficies de mayor valor y menor riesgo operativo de escritura.

Rutas:

- `/dashboard`
- `/accounts`
- `/risk`
- `/analytics`
- `/analytics/daily`
- `/analytics/hourly`
- `/analytics/risk`

Checklist:

- [x] Implementar layout y composicion visual de cada ruta.
- [x] Conectar con adaptadores y contratos tipados.
- [x] Crear componentes de dominio:
  - `MetricCard`
  - `ChartPanel`
  - `RiskStatusBadge`
  - `AccountIdentity`
  - `DataFreshnessNotice`
  - `AuthorityNotice`
- [ ] Validar estados:
  - loading
  - empty
  - stale
  - partial
  - error
- [x] Confirmar que los KPIs no cambian de significado respecto al producto actual.
- [ ] Confirmar que no se han colado defaults o inferencias como reglas reales.
- [x] QA visual desktop.
- [x] QA visual mobile.

Nota de estado:

- 2026-05-16: `/accounts` ya usa selector de dominio `getAccountsOverview` y view-model propio para cuenta activa, sync/plan health, tipo de cuenta y resumen operativo. Falta QA de estados degradados con fixtures especificos antes de cerrar `stale/partial/error`.
- 2026-05-19: se añade contrato de tests para congelar IA/sidebar visible (`Operativa`, `Decisión`, `Sistema`) y evitar regresiones de labels como `Desk`, `Edge` o nombres de scaffold. También se limpia copy visible de migración (`Wave`, `Fixture`, `Mock`) en shell, command palette, metadata, Insights y origen de datos.
- 2026-05-19: `getAccountsOverview` ya distingue `empty`, `stale`, `partial` y `ready` desde dominio, con tests para payload vacío y sync degradado. Esto avanza el gate de estados de `/accounts`, aunque todavía falta QA visual por ruta antes de cerrar toda la casilla.
- 2026-05-19: `getActiveAccount` queda null-safe y testeado para payload sin cuentas; el status strip muestra `Sin datos` en vez de asumir una cuenta inexistente.
- 2026-05-19: `RiskGuard` y `Portfolio` añaden tests de estados degradados: RiskGuard renderiza seguro sin cuentas/exposiciones/límites, y Portfolio bloquea export/readiness si no hay cuentas aunque exista una policy vacía.
- 2026-05-19: se añade `getAnalyticsReadiness` para clasificar Insights como `empty`, `partial` o `ready`, distinguiendo datos visibles, buckets diarios/horarios y métricas agregadas sin inventar confianza estadística.
- 2026-05-19: Insights daily/hourly extrae `getAnalyticsDailyOverview` y `getAnalyticsHourlyOverview` a dominio testeado para mejor/peor día, media de actividad, mejor hora y sesión dominante sin cálculos locales en UI.
- 2026-05-19: Insights mueve `buildInsightAttribution` a dominio testeado para qué aporta, qué empeora el resultado, top símbolo/sesión, cola de review, curva acumulada y dependencia de operaciones aisladas sin mezclarlo en el render.
- 2026-05-19: `PortfolioPolicyReadiness` expone `status` (`empty`, `partial`, `requires_review`, `ready`) para que `/capital` pueda degradar de forma explícita sin activar export ni routing real.
- 2026-05-19: se limpian restos visibles de copy tecnica en Funding, Ajustes, Estrategias y Estudio (`requires_review`, `routing`, `Baseline`, `Expectancy`) manteniendo las keys internas solo en lógica.
- 2026-05-19: Funding Cockpit expone `status` (`empty`, `partial`, `requires_review`, `ready`) y separa labels visibles en español de estados internos, evitando que `requires_review` o provenance tecnica aparezcan como copy de usuario.
- 2026-05-19: Review/Journal extrae `buildReviewPriorityRows`, `getReviewReadiness` y `getReviewAction` a dominio testeado; la UI deja de calcular prioridades de review dentro del componente.
- 2026-05-19: Execution extrae `getExecutionQuality` a dominio testeado para duración media, cobertura de etiquetas, salidas parciales, pérdidas rápidas y peor sesión sin fingir MAE/MFE.
- 2026-05-19: Playbooks/Estrategias extrae `buildStrategyRows` y `getStrategiesReadiness` a dominio testeado; la UI deja de inventar atribución dentro del render y degrada a `partial` si faltan setups o datos suficientes.
- 2026-05-19: Calculadora extrae `calculateFxLotSize`, conversion FX, parsing numerico y `getLotSizingOverview` a dominio testeado; la UI conserva el comportamiento pero distingue cuentas sin fondeo de caps externos reales y deja claro que indices/metales/CFDs requieren contrato propio antes de prometer sizing real.
- 2026-05-19: Mercado extrae `buildMarketRows` y `getMarketReadiness` a dominio testeado para unir trades cerrados y exposicion abierta sin fingir precios live ni proveedor conectado.
- 2026-05-19: Ajustes extrae `getSettingsOverview` a dominio testeado para mostrar cuentas, plan, areas activas y areas pospuestas sin abrir login, billing, launcher ni acciones MT5.
- 2026-05-19: Biblioteca extrae `getStudyOverview` a dominio testeado para mantener glosario, formulas y contexto sin duplicar Insights, Review, calendario ni RiskGuard.
- 2026-05-19: Calendario economico añade contrato normalizado (`economic-calendar`) y extrae `getEconomicCalendarOverview` a dominio testeado para preparar avisos macro baratos/read-only con proveedor pendiente, sin scraping ni promesas de tiempo real.
- 2026-05-19: Trades extrae `getTradesOverview` a dominio testeado para ledger, costes, cobertura de setup, review score y concentracion por simbolo/sesion.
- 2026-05-19: Journal extrae `getJournalOverview` y `getJournalAiReviewOverview` a dominio testeado para review, entradas y heuristicas sin activar LLM ni conclusiones IA reales.
- 2026-05-19: Calendario extrae `buildCalendarRows`, agregados mensual/anual, agrupacion de trades por dia y `buildCalendarMonthCells` a dominio testeado. La ruta queda preparada para refinamiento visual posterior sin tocar la logica.
- 2026-05-19: Calendario extrae `getCalendarPeriodOverview`, semanas del mes, mini-calendarios anuales, seleccion de dia y operaciones del dia a dominio testeado para evitar que la UI vuelva a recalcular el periodo activo.
- 2026-05-19: `status-badges.js` queda convertido en `status-meta` para Next: solo metadatos tipados de conexion, riesgo, fondeo y fuente workspace, sin HTML ni clases legacy.
- 2026-05-20: se normaliza vocabulario visible y documentación de contrato para evitar regresiones de copy: operaciones, etiquetas, PnL neto, datos insuficientes, presupuesto de riesgo, avisos macro y `Control de Insights`. Se eliminan de la guía de UI términos técnicos anteriores cuando podían llegar al usuario.
- 2026-05-20: se añade barrera de regresion de copy visible en `apps/web-next/src/lib/domain/visible-copy.test.ts` para bloquear terminos internos o confusos antes de que lleguen a Panel, Insights, Calendario, Cuentas, RiskGuard o Portfolio. El test barre automaticamente paginas App Router del workspace, componentes de pantalla y selectores clave, incluyendo separadores compactos con `/` y no con punto medio.
- 2026-05-20: metadata y labels de sincronizacion quedan normalizados a vocabulario de usuario (`Panel`, `Sin sincronizar`, `Sincronizacion pendiente`) para evitar que `Workspace` o `Sync` vuelvan a aparecer como copy visible.
- 2026-05-26: V1 queda acotada para beta simple con `Panel`, `Cuentas`, `Portfolio`, `Insights`, `Trades`, `Calendario`, `Calculadora`, `Biblioteca`, `Ajustes` y `Suscripcion`; `RiskGuard`, `Review`, `Playbooks`, `Prop Firms`, `Mercado` y `Ejecucion` quedan bloqueadas como `Proximamente` hasta cerrarse por chat/seccion. La bateria de cascada valida navegacion, copy visible, aislamiento de migracion, selectores, typecheck, lint y smoke routes; `npm run validate:cascade` queda como comando unico sin servidor para los checks seguros; el placeholder comun `Proximamente` queda con heading principal para que todas las rutas avanzadas sean auditables.
- 2026-05-26: `validate:cascade` queda ampliado con contrato de fuente de datos y fixture Darwinex Zero 100K de 1 ano, para proteger que Panel, Calendario, Trades e Insights sigan probandose con datos demo ricos sin tocar datos reales ni depender de servidor.
- 2026-05-26: `validate:cascade` incorpora contrato de seguridad de acciones para impedir activacion accidental de logout real, launcher MT5 o eliminacion de cuentas durante V1; las acciones preparatorias quedan pendientes/inertes hasta integracion dedicada.
- 2026-05-26: `test:smoke:routes` valida tambien rutas admin bloqueadas por defecto (`/debug` -> 404), evitando que diagnostico interno quede accesible durante la beta V1.
- 2026-05-26: `validate:cascade` incorpora contrato de shell para fijar el runtime en `components/trading/workspace-shell`, bloquear reintroduccion de shells scaffold antiguas y endurecer copy visible contra `Sincronizacion`, `Sincronizar`, `Latencia`, `Snapshot MT5` y `KMFX Edge Lab`.
- 2026-05-26: navegacion incorpora `routeDecisionQuestions` testeado para que cada ruta activa V1 responda una pregunta operativa clara y no derive a contenido duplicado o dificil de entender.
- 2026-05-26: copy visible V1 bloquea promesas prematuras de live/tiempo real o bloqueo MT5 (`Live account`, `Datos en vivo`, `bloquea MT5`, `bloquea nueva operativa`); UI queda en `Lectura MT5`, `Lectura segura` o recomendacion hasta conectar fuente/EA reales.
- 2026-05-26: `validate:cascade` incorpora `v1-readiness-contract`: rutas activas sin decision duplicada, metricas criticas con origen/degradacion visible y defaults de policy tratados como controles preparados, no como incumplimientos reales ni enforcement MT5 activo.
- 2026-05-19: fuente mock de cuentas queda tipada en `mock-accounts-source`, con clones defensivos y lookup por cuenta para evitar mutar fixtures durante la migracion.
- 2026-05-19: se reconcilia el backlog: `api-config.js` ya existe como `kmfx-api-config` y `accounts-live-snapshot.js` como `accounts-snapshot-client`, ambos en modo read-only/Next-safe y sin tocar auth/billing.
- 2026-05-19: shell/IA ya tiene mapeo de rutas a App Router cubierto por tests de `navigation`, incluyendo labels visibles acordados y bloqueo de copy legacy en navegación.
- 2026-05-19: `account-context` centraliza cuenta activa, opciones de selector, fallback seguro, estados de conexión e iniciales para topbar/sidebar; la topbar deja de mostrar `Live account` fijo y usa la cuenta activa.
- 2026-05-19: navegación activa queda URL-driven con `isNavigationHrefActive` y `resolveRouteTitle`, cubriendo subrutas, query/hash y fallback de títulos sin depender de estado local legacy.
- 2026-05-19: navegación mobile y gating admin quedan declarados en dominio (`getMobileNavigationPlan`, `getRouteAccessLevel`), sin ocultar rutas todavía ni tocar permisos reales.
- 2026-05-20: `navigation.test` valida cobertura bidireccional ruta/página, títulos visibles, prioridades mobile explícitas y que rutas admin no se cuelen en navegación visible.
- 2026-05-19: `mt5-source-config` aísla configuración read-only de fuente MT5 con normalización segura, sin iniciar conexiones ni mutar runtime.
- 2026-05-19: se añade `docs/nextjs-data-adapter-safety-audit.md` para bloquear ports peligrosos de `internal-model-adapter`, `mock-account-adapter`, `mt5-account-adapter` y `account-runtime` sin gates de paridad/redaccion.
- 2026-05-19: fixture live queda marcada con metadata de redaccion y logins enmascarados; los tests verifican que conserva shape MT5 sin exponer identificadores reales.
- 2026-05-19: Panel extrae `buildDashboardPerformance`, `buildDashboardAttentionItems`, atribución por setup/símbolo/sesión, `resolveAccountMode` y labels de riesgo a dominio testeado. El render mantiene el mismo aspecto mientras la lectura diaria queda más verificable.

Puerta de salida:

- las 4 superficies core se sienten producto real, no mockup.
- no requieren todavia write flows para ser utiles.

## Fase 7 - Wave 2: Rutas Operativas Secundarias

Objetivo:

- ampliar la nueva app a las superficies operativas de segundo nivel una vez probado el shell y la capa de datos.

Rutas:

- `/trades`
- `/calendar`
- `/journal`
- `/strategies`
- `/strategies/backtest-vs-real`
- `/strategies/portfolio`
- `/capital`
- `/market`

Checklist:

- [x] Migrar `trades` en modo table-first.
- [x] Migrar `calendar` con jerarquia clara, no como grid caotico.
- [x] Migrar `journal` con foco en review y no solo notas.
- [x] Migrar `strategies` con atribucion util, no teatro visual.
- [x] Migrar `capital` como capa portfolio real y alineada con PRD.
- [x] Validar dependencias cruzadas entre rutas.
- [ ] Revisar si algun concepto debe fusionarse o simplificarse antes de seguir.

Nota de estado:

- `capital` ya superó el scaffold y soporta allocation, contribution, concentración, exposición derivada de `risk.exposureBySymbol` y preparación read-only de policy.
- 2026-05-19: `/capital` extrae `getPortfolioOverview` a dominio testeado para allocation, contribution, curva de capital, concentración, policy blockers y strategy policy rows sin recalcularlo en el TSX.
- `market` ya superó el scaffold y soporta contexto operativo por símbolo.
- `calendar` ya incorpora navegacion mensual, vista anual, detalle diario, curva acumulada y tabla de rentabilidad `$`/`%` alineada con KMFX Edge.
- 2026-05-19: `/calendar` mueve el periodo activo completo a `getCalendarPeriodOverview`, dejando el componente centrado en render y controles.
- `trades`, `calendar` y `journal/review` ya forman un primer loop operativo desde `Desk`.
- las dependencias cruzadas quedan fijadas en `docs/nextjs-cross-route-dependency-map.md`; queda pendiente QA visual/funcional por ruta.

Puerta de salida:

- el usuario ya puede vivir gran parte de su flujo diario dentro de la nueva app.

## Fase 8 - Wave 3: Superficies Sensibles y Especializadas

Objetivo:

- migrar lo mas acoplado, sensible o especializado cuando la base ya es fiable.

Rutas:

- `/journal/review-queue`
- `/journal/entries`
- `/journal/ai-review`
- `/execution`
- `/tools/calculator`
- `/funding`
- `/funding/rules`
- `/funding/payouts`
- `/study`
- `/settings`
- `/debug`

Checklist:

- [ ] Migrar Funding alineado con el `Funding Risk Cockpit`.
- [x] Migrar `execution` sin romper workflows de post-trade review.
- [x] Migrar `settings` solo cuando exista wrapper seguro para auth/config.
- [x] Migrar `debug` con gating real.
- [x] Validar que study/glossary soporta las metricas y formulas actuales.

Nota de estado:

- `funding`, `funding/rules`, `funding/payouts`, `execution`, `tools/calculator`, `study` y `settings` ya existen como superficies Next útiles.
- `risk` y `funding` ya están entrando en modo cockpit, aunque sin cerrar todavía el alcance final de PRD.
- 2026-05-16: Funding ya extrae `FundingJourney` y `FundingRiskQueue` a selectores de dominio testeados. El overview usa fees/reset conocidos por `fundingProfile` como fallback si aun no existe ledger manual, sin inventar payouts ni reglas de firma.
- 2026-05-19: Funding subroutes dejan de calcular cuentas, reglas y payouts dentro del TSX. `getFundingJourneyDashboard`, `getFundingAccountRows`, `getFundingRulesOverview` y `getFundingPayoutsOverview` cubren las vistas read-only con tests, manteniendo payouts/costes separados del PnL de trading y labels visibles separados de keys internas.
- `debug` queda gated por `KMFX_ENABLE_DEBUG_ROUTE=1` y devuelve 404 por defecto.
- varias casillas siguen abiertas porque aún falta profundidad funcional, no porque la ruta siga en scaffold.

Puerta de salida:

- la nueva app cubre practicamente todo el producto visible.

## Fase 9 - Producto Diferencial V2 sobre Base Next

Objetivo:

- aprovechar la nueva arquitectura para construir mejor producto, no solo nueva UI.

Bloques:

- Funding variable risk
- Funding playbooks
- Funding Risk Cockpit
- Portfolio Policy
- Portfolio routing
- EA policy export groundwork

Checklist:

- [x] Implementar contratos `FundingProfile` y `FundingRuleSet`.
- [x] Implementar contratos `RiskPolicy`, `RiskEvaluation`, `RiskRecommendation`.
- [x] Implementar contratos `Portfolio`, `PortfolioAccount`, `RoutingPolicy`.
- [ ] Implementar PRD de funding cockpit.
- [ ] Implementar PRD de portfolio policy.
- [x] Diseñar contrato `EAPolicyPackage` versionado sin activar export real.

Nota de estado:

- Los contratos viven en `apps/web-next/src/lib/contracts/` y estan conectados de forma opcional a `WorkspaceState`.
- Los selectores read-only de Funding y Portfolio ya estan integrados y cubiertos por tests unitarios basicos; Funding Journey/Risk Queue, cuentas, reglas, payouts y Portfolio Overview ya salen de dominio puro. Faltan persistencia/editor/evaluation engine antes de considerar PRD implementado.
- Las capas de persistencia, editor, evaluation engine, routing real y export EA siguen fuera hasta su fase.
- `EAPolicyPackage` existe solo como contrato; la frontera de seguridad queda documentada en `docs/policy-evaluation-contract-spec.md`.

Puerta de salida:

- KMFX ya no solo se ve mejor; piensa mejor como producto para traders.

## Fase 10 - QA Integral, Paridad y Go/No-Go de Cutover

Objetivo:

- decidir con criterio si una ruta o modulo puede pasar a ser principal.

Checklist:

- [ ] QA funcional por ruta.
- [ ] QA visual desktop.
- [ ] QA visual mobile.
- [ ] QA de stale/live/partial/error.
- [ ] QA de accesibilidad base.
- [ ] QA de performance inicial.
- [ ] Validar paridad de significado entre app actual y app Next.
- [ ] Confirmar que billing/auth/MT5 no se han visto afectados.
- [ ] Confirmar que settings y flows sensibles tienen persistencia segura.

Nota operativa:

- 2026-05-16: evitar barridos locales de muchas rutas seguidas en `next dev`; se observo reinicio por memoria al compilar rutas pesadas en rafaga. Para seguir seguro, validar primero con tests/lint/tsc y abrir preview por ruta concreta.
- 2026-05-20: `apps/web-next` incorpora `npm run validate` como primera linea de trabajo seguro (`test` + `typecheck` + `lint`) antes de levantar preview o hacer QA visual. El comando `dev` queda fijado a webpack y Turbopack queda solo como comando explicito de diagnostico.

Go/No-Go por ruta:

- una ruta solo puede ser candidata a cutover si:
  - es funcionalmente util
  - no empeora comprension
  - no depende de hacks del runtime viejo
  - tiene estados degradados correctos
  - no abre regresiones de permisos o datos

## Fase 11 - Cutover Gradual y Retirada Legacy

Objetivo:

- sustituir con cuidado, no con un big bang.

Estrategia:

- primero convivir;
- luego desviar trafico interno o beta;
- luego hacer cutover por rutas o por shell;
- solo despues retirar piezas legacy.

Checklist:

- [ ] Definir estrategia de entrada a la nueva app:
  - subruta
  - subdominio
  - feature flag
  - rol/admin/beta users
- [ ] Definir redirects y alias legacy minimos.
- [ ] Validar observabilidad del nuevo frontend.
- [ ] Confirmar rollback simple.
- [ ] Hacer lanzamiento controlado.
- [ ] Monitorizar errores y feedback.
- [ ] Retirar solo lo que ya no sea necesario.
- [ ] Archivar o congelar modulos legacy retirados.

Regla:

- no borrar una superficie legacy hasta que la nueva equivalent haya probado estabilidad.

## Workstreams paralelos permitidos

Estos frentes si pueden avanzar en paralelo cuando no bloquean el camino critico:

- documentacion
- fixtures anonimizados
- tests de contratos
- inventario de componentes
- QA visual specs
- data dictionary
- product specs
- token system y theming specs

## Workstreams que no deben adelantarse sin base

- settings completos
- toggles de tema persistidos
- automation/EA export real
- acciones de escritura delicadas
- cambios de auth y billing por comodidad del nuevo shell

## Orden correcto para no rehacer 20 veces

Orden obligatorio:

1. estrategia
2. contratos
3. scaffold
4. extraccion de logica
5. shell
6. wave 1
7. wave 2
8. wave 3
9. producto diferencial
10. cutover

No invertir este orden salvo incidencia muy justificada.

## Criterios de calidad por fase

Cada fase debe cerrar con:

- documentos actualizados
- checklist actualizada
- contratos claros
- tests o fixtures cuando toque
- decision explicita de lo que queda fuera

## Criterios de calidad por ruta

Cada ruta migrada debe tener:

- nombre canonico claro
- datos con ownership claro
- layout desktop correcto
- comportamiento mobile intencional
- dark mode correcto
- light mode no roto estructuralmente
- estados empty/loading/error/stale
- componentes de dominio en vez de markup ad-hoc

## Criterios de calidad por componente

Cada componente nuevo debe:

- apoyarse primero en shadcn o primitives fiables
- usar tokens semanticos
- evitar colores o motion arbitrarios
- exponer lenguaje KMFX, no lenguaje del proveedor del bloque

## Matriz de riesgo

Riesgo alto:

- `/dashboard`
- `/accounts`
- `/risk`
- `/settings`
- cualquier flujo que mezcle live data + permisos + configuracion

Riesgo medio:

- `/analytics`
- `/journal`
- `/strategies`
- `/funding`
- `/capital`

Riesgo mas bajo:

- `/study`
- `/market`
- partes informativas del shell

## Gate de "paramos y revisamos"

Hay que parar y revisar si ocurre cualquiera de estas:

- la nueva app necesita importar render legacy para avanzar
- aparecen contratos ambiguos o cambiantes en mitad de una ruta
- una ruta nueva requiere tocar billing/auth/launcher sin estar previsto
- el shell se ve premium pero empeora legibilidad operativa
- mobile empieza a forzar compromisos malos para desktop
- ya no esta claro que se esta construyendo primero y por que

## Checklist maestro resumido

- [x] Arquitectura base decidida
- [x] Shell objetivo decidido
- [x] Direccion visual decidida
- [x] Rutas y waves definidos
- [x] PRDs de funding y portfolio definidos
- [x] Modelo de dominio inicial definido
- [x] Contrato policy/evaluation definido
- [ ] Roadmap maestro aprobado
- [ ] Data dictionary cerrado y aprobado
- [ ] Field source map cerrado y aprobado
- [ ] Fixture pack aprobado
- [ ] Fixture redaction policy aprobada
- [ ] Route acceptance gates aprobados
- [ ] Cutover strategy aprobada
- [ ] Official guidance notes revisadas
- [ ] Implementation work breakdown aprobado
- [ ] Migration risk register aprobado
- [ ] Technical readiness checklist aprobada
- [ ] `apps/web-next` scaffolded
- [ ] Capa domain reusable extraida
- [ ] Shell nuevo construido
- [ ] Wave 1 migrada
- [ ] Wave 2 migrada
- [ ] Wave 3 migrada
- [ ] Diferenciales productizados sobre Next
- [ ] QA integral pasada
- [ ] Cutover definido
- [ ] Legacy retirado con seguridad

## Recomendacion final

La migracion debe ejecutarse como una serie de reemplazos deliberados y reversibles, no como una reescritura emocional.

Si mantenemos:

- contratos primero,
- shell despues,
- rutas por waves,
- y cutover solo cuando haya paridad suficiente,

entonces evitaremos justo lo que mas queremos evitar:

- romper produccion,
- mezclar capas,
- y rehacer el mismo trabajo varias veces.
