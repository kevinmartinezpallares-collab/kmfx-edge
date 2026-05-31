# KMFX Next.js Route Content Contract

Estado: activo  
Ultima revision: 2026-05-26  
Alcance: fijar el significado funcional de cada ruta Next para evitar deriva entre shell visual, mockup y roadmap de producto.

## Regla base

Cada ruta de `apps/web-next` debe responder a la pregunta que el roadmap le asigna.

No se permite:

- usar una ruta analitica como si fuera pantalla de mercado;
- usar una ruta de cuentas como si fuera capa de portfolio;
- arrastrar nombres del mockup cuando contradicen el significado del producto.

## Corte V1 beta simple

V1 prioriza un dashboard entendible y operativo, no profundidad completa en todas las areas.

Rutas activas en V1:

- `Panel`
- `Cuentas`
- `Portfolio`
- `Insights`
- `Trades`
- `Calendario`
- `Calculadora`
- `Biblioteca`
- `Ajustes`
- `Suscripcion`

Rutas avanzadas en `Proximamente` hasta trabajarlas por separado:

- `RiskGuard`
- `Review`
- `Playbooks`
- `Prop Firms`
- `Mercado`
- `Ejecucion`

Regla de contenido:

- una ruta activa V1 debe resolver una tarea clara en menos de unos segundos;
- cada ruta activa V1 debe tener su pregunta operativa sincronizada en `apps/web-next/src/lib/domain/navigation.ts` mediante `routeDecisionQuestions`;
- una ruta avanzada no debe enseñar contenido parcial ni prometer acciones reales;
- si una capacidad depende de auth, billing, launcher, MT5 write-flow o enforcement EA, queda fuera de V1 salvo wrapper seguro y documentado.

## Core loop

### `/dashboard`

Nombre visible:

- `Panel`

Rol:

- command center

Debe llevar:

- cuenta activa
- KPIs core
- riesgo urgente
- chart hero
- account context solo si cambia una decision
- trades recientes
- review queue
- calendar pulse

No debe llevar como foco principal:

- watchlist o market pulse estatico
- tarjetas especiales de funding/Darwinex/bot si no cambian una decision

### `/accounts`

Nombre visible:

- `Cuentas`

Rol:

- control y contexto de cuentas

Debe llevar:

- identidad de cuenta
- broker / server / login
- sync health
- plan / entitlement state
- grouping de cuentas live / funding / challenge cuando exista

No debe llevar como foco principal:

- asignacion de capital portfolio

### `/risk`

Nombre visible:

- `RiskGuard`

Rol:

- protection cockpit

Debe llevar:

- estado operativo de riesgo y accion recomendada
- drawdown usage
- room restante
- heat
- exposicion
- bloqueos/warnings en modo lectura
- reglas configurables sin prometer enforcement MT5
- riesgo por sesion y riesgo variable
- tabla de gestion por cuenta

### `/analytics`

Nombre visible:

- `Insights`

Rol:

- profundizar decisiones

Debe llevar:

- resumen de rendimiento
- atribución por setup, símbolo, sesión y día
- análisis diario, horario y de riesgo
- calidad de datos y confianza

No debe actuar como:

- pantalla principal de mercado

### `/trades`

Nombre visible:

- `Trades`

Rol:

- tabla operativa de operaciones

Estado actual:

- `R2 live`; ledger read-only con PnL neto, costes, cobertura de etiquetas, salidas parciales y prioridad de review por fila.

### `/journal`

Nombre visible:

- `Review`

Rol:

- review and improvement center; no es solo notas.

Debe llevar:

- review queue
- notas
- leaks
- execution quality

## Secondary routes

### `/calendar`

Rol:

- actividad y drill-down por dia

Objetivo final bloqueado:

- paridad funcional con el calendario de KMFX Edge
- lectura mensual y anual de PnL
- drill-down diario con apertura, cierre y detalle operativo

### `/strategies`

Nombre visible:

- `Playbooks`

Rol:

- edge attribution lab

### `/capital`

Nombre visible:

- `Portfolio`

Rol:

- portfolio layer

Debe llevar:

- allocation
- contribution by account
- cross-account concentration
- capital efficiency
- exposure derivada de `risk.exposureBySymbol`
- account roles
- strategy/bot allocation
- policy readiness
- separacion real/demo/funding/Darwinex
- portfolio heat

No debe actuar como:

- una pagina de balance aislada
- una copia de `RiskGuard`
- una copia de `Insights`
- un editor de EA/export real antes de tener contrato implementado

Referencia obligatoria:

- `docs/nextjs-portfolio-product-ui-contract.md`

### `/market`

Nombre visible:

- `Mercado`

Rol:

- market pulse y contexto de simbolos
- calendario económico operativo y avisos macro read-only

Nota:

- el contenido de mercado vive aqui, no en `/analytics`
- `/market/economic-calendar` queda preparado para proveedor externo con provenance; no debe prometer bloqueo tecnico ni tiempo real hasta conectar fuente.

### `/tools/calculator`

Nombre visible:

- `Calculadora`

Rol:

- tooling seguro y sizing

Objetivo final bloqueado:

- calculadora de lotaje estilo Myfxbook
- sizing desde riesgo, cuenta, stop, par y conversiones
- sin depender de una UI basada en `symbol specs` como verdad principal

### `/study`

Nombre visible:

- `Biblioteca`

Rol:

- glosario operativo de metricas, formulas y contexto
- soporte para entender `RiskGuard`, `Insights`, `Review`, calendario y `Prop Firms`
- no debe competir con el panel ni convertirse en una pantalla de analitica paralela
- los terminos trader como `PnL`, `Win rate`, `Profit factor`, `Expectancy` y `Score` se mantienen en ingles

### `/settings`

Nombre visible:

- `Ajustes`

Rol:

- auth/config wrapper seguro
- lectura preparada de suscripcion y plan sin conectar billing real en la fase read-only
- superficie de control que separa areas activas, areas pospuestas y limites de migracion
- no debe activar login, billing, launcher, acciones MT5 ni preferencias persistidas sin wrapper dedicado

### `/funding`

Nombre visible:

- `Prop Firms`

Rol:

- funding journey cockpit

Debe llevar:

- overview agregado de fondeo;
- agrupacion de Fase 1, Fase 2 y Real/Funded bajo un mismo `FundingJourney`;
- progreso por fase;
- room diario y maximo por fase/cuenta;
- estado de payout defense cuando aplique;
- economia real de fondeo: payouts, fees, resets y neto;
- proxima accion operativa.

No debe actuar como:

- una lista plana de cuentas MT5 sin historia;
- una pantalla de reglas sueltas sin journey;
- contabilidad general fuera del scope de fondeo.

### `/funding/journeys`

Rol:

- listado de procesos completos de fondeo.

Debe llevar:

- firma/programa/tamano;
- estado actual;
- fase actual;
- resultado Fase 1;
- resultado Fase 2;
- estado Real/Funded;
- total payouts;
- fees/resets;
- neto real;
- max drawdown historico;
- proxima accion.

### `/funding/journeys/[journeyId]`

Rol:

- expediente completo del journey.

Debe llevar tabs internas:

- Resumen;
- Fase 1;
- Fase 2;
- Real;
- Trades;
- Riesgo;
- Payouts;
- Timeline;
- Notas.

### `/funding/accounts`

Rol:

- vista operativa de cuentas/logins individuales ligados a journeys.

Nota:

- esta ruta no reemplaza `Journeys`; sirve para inspeccionar cuentas activas e historicas.

### `/funding/payouts`

Rol:

- ledger de retiros, pagos manuales y economia real de fondeo.

Debe llevar:

- payouts solicitados;
- payouts pagados;
- challenge fees;
- reset fees;
- refunds;
- ajustes manuales;
- bruto, neto, metodo, estado y comprobante opcional.

### `/funding/rules`

Rol:

- reglas por firma/programa/fase con provenance.

Debe llevar:

- reglas verificadas;
- reglas manuales;
- overrides por cuenta;
- version/fuente;
- estado `requires_review` cuando no haya certeza.

Referencia obligatoria:

- `docs/nextjs-funding-journey-ui-contract.md`

## Decisión aplicada el 2026-05-15

Se corrige una deriva de la primera shell visual:

- `analytics` estaba actuando como `market`
- `accounts` estaba actuando como `capital`

Desde esta fecha:

- `analytics` vuelve a ser analytics
- `market` pasa a tener ruta propia
- `accounts` vuelve a ser contexto de cuentas
- `capital` pasa a tener ruta propia

Actualizacion posterior del mismo dia:

- `trades` pasa de scaffold puro a lectura `R2` sobre `trades[]`
- `analytics/daily` y `analytics/hourly` ya leen buckets derivados de `trades[]`
- `journal` ya usa operaciones recientes del snapshot como contexto de review
- `calendar` ya usa actividad por `tradingDayKey` y presión de review derivada de `trades[]`
- `calendar` ya incluye también resumen mensual/anual visible y drill-down diario con apertura/cierre y operativas del día
- `calendar` ya pasa a vista mensual navegable con selección de día, manteniendo resumen anual y drill-down operativo
- `calendar` ya enlaza hacia `Trades` y `Review Queue` para cerrar el loop diario
- `strategies` y sus subrutas ya leen atribución por setup real sin inventar baseline de backtest
- `journal/review-queue`, `journal/entries` y `journal/ai-review` ya salen del scaffold y usan `trades[]` como base operativa
- `market` ya toma símbolos, exposición y actividad desde `trades[]` y `risk.exposureBySymbol`
- `funding`, `funding/rules` y `funding/payouts` ya salen del scaffold con metadata funding explícita y rooms derivados del snapshot
- `funding` ya incorpora lectura de siguiente operación, presupuesto por cuenta y límite explícito por margen diario/máximo
- `execution` ya sale del scaffold con señales diagnósticas derivadas de `trades[]`, sin fingir MAE/MFE todavía
- `tools/calculator` ya sale del scaffold con presupuesto de riesgo por cuenta; el lotaje por símbolo real queda para la siguiente fase
- `tools/calculator` ya incorpora una primera calculadora FX estilo Myfxbook sobre equity, riesgo, stop y conversiones estándar; metales e índices quedan para una capa posterior
- `study` ya sale del scaffold como capa de apoyo para glosario, fórmulas y contexto, sin competir con el desk
- `capital` ya refuerza allocation, contribution, concentración y exposición desde `risk.exposureBySymbol`
- `capital` ya cruza también concentración visible por setup y símbolo dentro de los datos actuales
- `capital` ya añade `policy readiness` en modo read-only para preparar Portfolio Policy sin activar export ni EA
- `settings` ya sale del scaffold como wrapper seguro de estado/config, manteniendo fuera auth y write-flows sensibles
- `risk` ya incorpora lectura de protección por cuenta y foco de concentración dominante
- `funding/rules` ya expone límite de siguiente operación por cuenta y estado defensivo/bloqueado
- `funding/payouts` ya añade una primera capa de `payout defense`
- `market` ya no solo lista símbolos; añade lectura de símbolo caliente, símbolos en vigilancia y sesión dominante

Actualizacion del shell el 2026-05-15:

- la IA del sidebar queda bloqueada por capas y no se vuelve a improvisar por pantalla
- `Panel`, `Cuentas`, `RiskGuard`, `Portfolio` y `Review` quedan como capa `Operativa`
- `Insights`, `Trades`, `Calendario`, `Playbooks`, `Prop Firms`, `Mercado` y `Ejecución` quedan como capa `Decisión`
- `Calculadora`, `Biblioteca` y `Ajustes` quedan como `Sistema`
- las subrutas activas visibles del sidebar quedan fijadas para `analytics`, `journal`, `strategies`, `funding` y `tools`
