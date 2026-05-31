# KMFX Edge Next.js Insights Product UI Contract

Estado: contrato de producto alineado con la pasada visual de Insights  
Ultima revision: 2026-05-20  
Ruta Next: `/analytics`  
Nombre visible: `Insights`

## Decision

Insights se mantiene como ruta separada de Panel.

Panel responde que esta pasando ahora en la cuenta activa. Insights responde por que esta pasando y que patron merece atencion.

No se debe rehacer visualmente hasta revisar la seccion actual de KMFX Edge y decidir que piezas se copian casi tal cual.

## Preguntas Que Debe Responder

- ¿Que sesion, simbolo o dia funciona mejor y cual hay que revisar?
- ¿Que simbolo, sesion o dia empeora el resultado?
- ¿Estoy ganando por edge repetible o por pocas operaciones aisladas?
- ¿Hay datos suficientes para tomar una decision?
- ¿Que debo revisar antes de subir riesgo?
- ¿Que patrones debo llevar a Playbooks, Review o RiskGuard?

## V1

Bloques minimos:

- `InsightsHeader`: cuenta activa, periodo y fiabilidad de datos.
- `PerformanceSummary`: neto, operaciones, win rate, profit factor, expectativa y score si existe.
- `AttributionMatrix`: setup, simbolo, sesion y dia con resultado positivo/negativo.
- `BestWorstPanel`: mejor setup, peor setup, mejor dia, dia a revisar.
- `DataQuality`: cobertura de etiquetas, numero de operaciones y agrupaciones disponibles.
- `ActionableFindings`: 3-5 lecturas accionables conectadas con Review, Trades, Playbooks y RiskGuard.
- `InsightsControl`: decision rapida sobre si la lectura es usable, que la condiciona y a que ruta ir.

Subrutas actuales:

- `/analytics`: resumen ejecutivo.
- `/analytics/daily`: patrones por dia.
- `/analytics/hourly`: patrones por hora/sesion.
- `/analytics/risk`: Control de Insights. Comprueba si el resultado se puede interpretar con seguridad, que lo condiciona y si toca ir a RiskGuard, Diario u Horario.

## Fuentes De Datos

Ya disponibles:

- `workspace.trades[]`
- `workspace.analytics.performance`
- `workspace.analytics.daily`
- `workspace.analytics.hourly`
- `riskSnapshot`
- `getAnalyticsReadiness(workspace)`
- `buildStrategyRows(workspace)`
- `buildReviewPriorityRows(workspace)`

Pendiente:

- etiquetas completas de setup y error.
- MAE/MFE si se decide incorporarlo desde MT5.
- slippage/spread si el feed real lo trae.
- score versionado si se quiere explicar al usuario.

## Reglas De Producto

- No mostrar confianza alta si hay pocas operaciones.
- No convertir un setup en recomendacion de capital si hay pocas operaciones.
- No duplicar Panel con los mismos KPIs sin lectura nueva.
- No duplicar Review; Insights detecta patrones, Review abre trabajo de mejora.
- No duplicar Playbooks; Insights descubre candidatos, Playbooks documenta/valida reglas.
- No duplicar RiskGuard; Control de Insights no bloquea ni configura reglas, solo explica si la lectura es fiable y deriva a la ruta correcta.
- No usar colores decorativos. Verde/rojo solo para resultado; ambar para revisar; azul solo para lectura informativa si hace falta.

## Gates

R2:

- `getAnalyticsReadiness` clasifica `empty`, `partial` y `ready`.
- presenta datos disponibles sin inventar agrupaciones ni etiquetas.
- rutas `daily`, `hourly` y `risk` renderizan sin depender de write flows.

R3:

- copia o adapta la estructura de Insights legacy de KMFX Edge con el nuevo sistema visual.
- diferencia resultado positivo, resultado a revisar, datos insuficientes y accion sugerida.
- deriva claramente a Review, Trades, Playbooks y RiskGuard.

Fuera de V1:

- recomendaciones automaticas de subir capital.
- scoring opaco sin explicacion.
- correlacion estadistica avanzada sin datos suficientes.
- IA generativa como fuente primaria de decision.
