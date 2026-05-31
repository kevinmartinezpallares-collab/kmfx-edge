# KMFX Next.js - Shaban/Efferd Dashboard Pattern Notes

Estado: referencia visual/producto para evolucionar Panel, RiskGuard e Insights sin copiar literalmente.
Fecha: 2026-05-20

Contrato operativo relacionado: `docs/nextjs-section-shells-layout-contract.md`.

Decision 2026-05-21: la referencia Shaban/Efferd queda bloqueada como gramatica visual de KMFX Next.js. No se copia el contenido SaaS, se traduce su estructura: pieza principal dominante, rail lateral util, KPI strip compacto, bloques inferiores accionables y cero cards dentro de cards.

## Fuentes revisadas

- Captura aportada por el usuario del dashboard de Shaban/Efferd.
- Tweet de X aportado por el usuario. X no expone contenido util sin sesion/JS, por lo que la lectura se basa en la captura.
- Efferd publico: `https://efferd.com/`
- 21st Efferd community: `https://21st.dev/community/efferd`

## Lectura de la referencia

El dashboard funciona por cinco decisiones:

1. Una sola pantalla de control, no una coleccion de widgets.
2. El grafico principal domina el centro y explica la tendencia.
3. La columna derecha resume estado, composicion y detalle accionable.
4. Las metricas superiores son pequenas, separadas por lineas y sin card pesada.
5. Los bloques inferiores responden preguntas concretas, no repiten KPIs.

El resultado se siente premium porque:

- hay mucha separacion estructural, pero no huecos sin funcion;
- las cards no compiten entre si;
- los charts tienen geometria propia, no todos son barras/progress;
- casi todo es neutral, el color aparece solo para delta/estado;
- la tipografia y el borde hacen mas trabajo que el color.

## Traduccion a KMFX

KMFX no debe copiar datos SaaS como revenue, orders o budget. Debe traducir el patron a trading:

| Patron Shaban/Efferd | Traduccion KMFX |
| --- | --- |
| Main revenue chart | Curva de equity/balance o drawdown segun seccion |
| Top mini metrics | PnL neto, trades, win rate, profit factor, riesgo usado |
| Right segmented arc | Score, risk usage, guard state o win/loss |
| Active customers meter | Cuentas conectadas, reglas activas o operaciones permitidas |
| Budget usage bar | Margen diario, riesgo abierto, allocation o heat |
| AI insight block | Insight operativo accionable, corto y visual |
| Tax/payment detail | Detalle de cuenta, regla, payout o bloqueo pendiente |

## Principios que debemos adoptar

### 1. Una card, una pregunta

Cada bloque debe responder una sola pregunta:

- Panel: como va mi cuenta ahora?
- RiskGuard: puedo operar o debo parar?
- Insights: donde gano, donde fallo y que debo revisar?
- Calendario: que dias/sesiones explican el resultado?
- Portfolio: que cuenta aporta riesgo o capital?

Si un bloque responde tres preguntas, hay que separarlo o eliminarlo.

### 2. Grafico correcto por tipo de dato

No usar barras para todo.

| Dato | Visual recomendado |
| --- | --- |
| Equity / balance | Area chart grande estilo Liveline |
| Drawdown | Underwater/area con zonas de limite |
| Win/loss | Donut segmentado tipo KMFX actual |
| Score / uso de riesgo | Segmented arc Efferd-style |
| Riesgo usado vs limite | Barra horizontal dividida por zonas |
| Distribucion por hora | Selector/heatmap de 24h tipo KMFX, no barras internas pequenas |
| Sesiones/simbolos | Ranking con barras horizontales densas |
| Reglas activas | Tabla compacta con switch, estado y accion futura |
| Noticias | Timeline/lista de eventos, no chart |

### 3. Jerarquia recomendada para RiskGuard

RiskGuard debe pasar a este orden:

1. Estado operativo: Seguro / Precaucion / Peligro / Bloqueado.
2. Decision inmediata: abrir, reducir, cerrar o esperar.
3. Curva de drawdown/equity con zonas de riesgo.
4. Reglas activas con switch: riesgo por operacion, DD diario, no SL, horarios, pares, noticias.
5. Control de operativa: pares, horarios, volumen, operaciones por dia.
6. Riesgo variable: tabla simple para fondeo/cuentas reales.
7. Alertas y eventos: solo si hay algo que actuar.
8. Detalle avanzado: correlacion, costes, historial de violaciones.

Lo menos urgente debe quedar abajo o colapsado. El trader no debe leer una pagina larga antes de saber si puede operar.

### 4. Cards y layout

Usar un layout parecido al screenshot:

```text
Header compacto con cuenta/rango

Fila superior:
  3-4 metricas pequenas sin card pesada

Centro:
  grafico principal grande

Derecha:
  arc/score + mini meter + detalle accionable

Inferior:
  insight corto + regla/uso relevante
```

Aplicacion concreta:

- Panel: grafico equity/balance ocupa el centro, columna derecha con score/win rate/riesgo.
- RiskGuard: curva de drawdown ocupa el centro, columna derecha con estado + margen diario + accion.
- Insights diario/horario/riesgo: grafico principal de cada subseccion ocupa ancho completo; summaries debajo.

### 5. Color

Mantener neutral como base.

Usar color solo para:

- positivo/negativo en PnL;
- warning/danger en riesgo;
- activo/inactivo en reglas;
- punto final o delta en charts.

Evitar:

- bordes verdes completos;
- glows;
- cards teñidas si el dato no lo pide;
- todos los numeros positivos en verde si no son accionables.

### 6. Copy

La referencia usa poco texto. KMFX debe hacer igual:

- no explicar metodologia en la card principal;
- no usar terminos raros;
- no repetir el titulo en la descripcion;
- cada subtitulo debe decir para que sirve el bloque.

Ejemplos buenos:

```text
Puedo operar?
Riesgo usado
Margen diario
Pares permitidos
Horarios permitidos
Reglas activas
Dia a revisar
```

Ejemplos a evitar:

```text
Lectura narrativa
Muestra
Drena
Friccion
Contexto operacional extendido
```

## Componentes reutilizables recomendados

Ya existen en el proyecto y se deben consolidar:

- `EfferdSegmentedArc`: para Score, uso de riesgo o estado global.
- `EfferdSegmentedMeter`: para uso de reglas, cuentas activas o margen.
- `MetricCard`: para KPIs compactas, no cards gigantes.
- `LiveMarketChart`/Liveline-style chart: para equity/balance/drawdown.
- Donut win/loss tipo KMFX: para distribucion de aciertos/perdidas.
- Ranking bars: para sesion, simbolo, horario.

Faltan como abstracciones:

- `DashboardStatStrip`: metricas superiores sin card pesada.
- `DecisionPanel`: estado + accion + permitido.
- `RiskRuleTable`: reglas con switch, estado, accion futura y origen.
- `PolicySymbolList`: pares permitidos con añadir/quitar/bloquear.
- `RiskZoneChart`: drawdown con zona segura/reducida/bloqueada.

## Prioridad de aplicacion

### P1 RiskGuard

Es donde mas valor tiene esta referencia.

Cambios recomendados:

- mover la curva de riesgo arriba;
- usar columna derecha fija para estado/decision;
- compactar reglas en tabla;
- hacer `Pares permitidos`, `Horarios`, `Volumen` como controles claros;
- bajar correlacion y costes a detalle secundario.

### P2 Panel

Cambios recomendados:

- fila superior de metricas mas ligera;
- chart principal mas dominante;
- score/win rate en columna derecha;
- quitar repeticion de equity/balance/PnL.

### P3 Insights

Cambios recomendados:

- cada subseccion debe tener un grafico principal claro;
- resumen arriba con 3-4 KPIs;
- ranking debajo;
- menos texto y mas visual.

## No hacer

- No copiar dashboards SaaS con datos de ecommerce.
- No convertir RiskGuard en un panel de marketing.
- No meter 10 graficas pequenas por estetica.
- No usar componentes Efferd si el dato no encaja.
- No prometer bloqueo real MT5 hasta tener EA confirmado.

## Decision

Adoptar la filosofia Shaban/Efferd:

```text
menos cards,
mas jerarquia,
un grafico principal,
columna de decision,
detalle solo cuando aporta accion.
```

Este patron debe guiar la proxima pasada visual de RiskGuard y luego Panel/Insights.
