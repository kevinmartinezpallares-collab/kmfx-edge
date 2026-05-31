# KMFX Next.js - Section Shells Layout Contract

Estado: contrato visual/producto para aplicar a las secciones Next.js sin improvisar layouts.
Fecha: 2026-05-21

## Objetivo

KMFX Edge debe acercarse al patron Shaban/Efferd aportado por el usuario: dashboards oscuros, sobrios, densos pero claros, con una pieza principal dominante, una columna lateral util y muy poco ruido visual.

El objetivo no es copiar un dashboard SaaS de revenue. El objetivo es copiar su claridad:

- una sola historia por pantalla;
- pocas metricas visibles arriba;
- un grafico o tabla principal que domina;
- una columna lateral que decide o resume;
- bloques inferiores solo si aportan accion;
- cero cards dentro de cards;
- cero badges decorativos.

## Principio rector

Cada seccion debe responder una pregunta en menos de 5 segundos.

Si una pantalla necesita leer parrafos, comparar 10 cards o entender nombres raros, esta mal ordenada.

## Shell global

La shell global debe ser compartida por todas las rutas:

- Sidebar fija con grupos de navegacion estables.
- Topbar fija con buscador, acciones y cuenta activa.
- Bloque de usuario/suscripcion en sidebar, no inventado por seccion.
- Mismo ancho de contenido, mismos gutters y mismas reglas de scroll.
- Ninguna ruta debe crear su propia sidebar, topbar o cabecera visual incompatible.

Decision: no haremos una shell distinta para cada seccion. Haremos una shell global y varios "section shells" internos.

## Referencia TripleD Grid Generator

Fuente revisada: `https://ui.tripled.work/grid-generator`.

El generador aporta presets utiles para bloquear estructuras, no para copiar estilos completos. Los presets extraidos que encajan con KMFX son:

| Preset TripleD | Grid | Uso KMFX recomendado |
| --- | --- | --- |
| `Dashboard Pro` | 4 columnas x 4 filas | Panel, Portfolio, RiskGuard cuando hay KPI strip, pieza principal y rail lateral. |
| `App Interface` | 6 columnas x 4 filas | Rutas con navegacion/rail fuerte y una zona principal dominante. |
| `Content Hub` | 3 columnas x 5 filas | Insights resumen, biblioteca o secciones con varios bloques editoriales. |
| `Magazine Layout` | 4 columnas x 3 filas | Diario/Review cuando un bloque visual debe dominar y el resto acompana. |
| `Classic Bento` | 3 columnas x 3 filas | Home/overview simple, solo si no genera huecos negros. |
| `Portfolio Grid` | 5 columnas x 3 filas | Cuentas/Portfolio con entidad principal, metricas y detalle. |

Decision KMFX: usar estos presets como gramatica de layout. Cada seccion debe escoger un preset base y adaptarlo con datos reales, evitando mezcla arbitraria de cards.

Reglas derivadas:

- Una card no debe forzar altura si su contenido no la llena.
- Si una columna lateral crece, la columna principal debe tener contenido equivalente o la fila debe terminar antes.
- Si una tabla deja hueco inferior, debe reducir altura, no empujar contenido vacio.
- El grid debe resolver la pantalla completa, no solo el primer fold.
- En desktop, preferir `Dashboard Pro` o `App Interface`; en mobile, convertir a una sola columna con orden de decision primero.
- Los bloques deben tener area asignada antes de implementar contenido: `header`, `kpis`, `main`, `rail`, `secondary`, `footer`.

## Section Blueprint Matrix

| Ruta | Shell base | Bloques obligatorios | Bloques opcionales | No hacer |
| --- | --- | --- | --- | --- |
| `Panel` | `Dashboard Pro` | Cuenta, 5 KPI separadas, curva equity/balance, estado operativo, operaciones recientes, noticias, insights rapidos | Timeline macro si hay datos | No repetir PnL/equity en 3 sitios; no mini charts decorativos. |
| `RiskGuard` | `App Interface` | Estado operativo, limites principales, curva DD/equity, reglas configurables, riesgo variable, pares/horarios | Eventos y auditoria | No prometer bloqueo MT5 si no hay EA; no usar badges decorativos. |
| `Insights resumen` | `Content Hub` | Win/loss visual, rendimiento por simbolo, rendimiento por sesion, timing/ventana | CTA a diario/horario/riesgo | No copiar Panel; no usar lenguaje raro como `muestra` o `drena`. |
| `Insights diario` | `Magazine Layout` | Mapa diario mensual, dias clave, lectura de revision | Tabla compacta de operaciones del dia | No mezclar con calendario operativo. |
| `Insights horario` | `Magazine Layout` | Mapa horario 24h full width, mejor ventana, hora a revisar, sesion dominante | Toggle `%/$` | No barras internas ilegibles ni rail lateral vacio. |
| `Calendario` | `Analysis Canvas` | Calendario full width, curva acumulada, tabla rentabilidad visible completa | Modal de dia | No scroll horizontal; no cards dentro de cards. |
| `Portfolio` | `Dashboard Pro` | Capital total, allocation, contribution, concentration, policy readiness | Strategy allocation | No pie chart como lectura principal. |
| `Cuentas` | `Portfolio Grid` | Selector de cuentas, card de cuenta, detalle de conexion, acciones | Estado launcher | No galeria que oculte cuentas si hay pocas. |

## Section Shell 1: Control Desk

Uso: `Panel`, `RiskGuard`, `Portfolio`.

Sirve para pantallas donde el trader necesita decidir rapido.

Estructura:

```text
Header compacto
KPI strip de 3-4 metricas maximo

Main grid
  Left: pieza principal dominante
  Right: rail de decision / estado / acciones

Bottom
  insight accionable o tabla principal, nunca ambos si compiten
```

Proporcion recomendada:

- Left content: 64-70% del ancho.
- Right rail: 300-420 px.
- KPI strip: una sola fila, no cards gigantes.
- Maximo visible sin scroll: 5 bloques reales.

Aplicacion a Panel:

- Pieza principal: curva de equity/balance.
- KPI strip: PnL neto, operaciones, win rate, profit factor.
- Right rail: estado operativo, riesgo actual, siguiente cosa a revisar.
- Bottom: operaciones recientes o resumen de Insights, no los dos con el mismo peso.

Aplicacion a RiskGuard:

- Pieza principal: drawdown/equity con zonas de riesgo.
- KPI strip: riesgo ajustado, exposicion abierta, modo de tamano, comisiones.
- Right rail: puedo operar, cuanto margen queda, que bloquea la cuenta.
- Bottom: reglas activas, pares/horarios, riesgo variable.

Aplicacion a Portfolio:

- Pieza principal: allocation/contribution table o curva de capital.
- KPI strip: capital total, cuentas conectadas, concentracion, heat.
- Right rail: cuenta que aporta, cuenta a revisar, duplicidad de riesgo.
- Bottom: allocation por estrategia/bot/cuenta.

## Section Shell 2: Analysis Canvas

Uso: `Insights`, `Diario`, `Horario`, `Riesgo de Insights`, `Calendario`.

Sirve para encontrar patrones, no para operar en vivo.

Estructura:

```text
Header compacto
3-4 KPIs especificos de esa subseccion

Visual principal full width
Lectura clave bajo el visual
Lista de dias/simbolos/horas solo si ayuda a actuar
```

Reglas:

- El visual principal ocupa todo el ancho cuando el analisis lo requiere.
- No colocar una columna lateral si deja huecos negros.
- No repetir el resumen de Panel.
- No usar texto largo donde una matriz, ranking o donut explica mejor.

Aplicacion a Diario:

- Visual principal: mapa diario mensual tipo KMFX.
- Debajo: dias clave y tabla de revision.
- No debe competir con calendario operativo.

Aplicacion a Horario:

- Visual principal: selector/mapa de 24 horas tipo KMFX.
- Debajo: mejor ventana, hora a revisar, sesion dominante.
- Nada de barras internas pequenas si dificultan lectura.

Aplicacion a Riesgo de Insights:

- Visual principal: distribucion de riesgo por dia/sesion/simbolo.
- Debajo: operaciones que explican la desviacion.
- Evitar copiar RiskGuard; aqui se analiza comportamiento pasado.

## Section Shell 3: Policy Control

Uso: reglas de RiskGuard, ajustes, cuentas, prop firms.

Sirve para configurar, no para leer mercado.

Estructura:

```text
Estado actual
Tabla de reglas
Controles editables
Provenance / nota de enforcement
```

Reglas:

- Cada regla editable debe tener: nombre, valor, switch, accion futura y estado.
- Si algo aun no bloquea MT5, debe decirlo claramente.
- Los controles pueden estar activos visualmente, pero no deben prometer enforcement real sin EA.
- Usar separadores internos, no cards dentro de cards.

Ejemplos de reglas:

- Riesgo maximo por operacion.
- Perdida diaria.
- Drawdown total.
- Maximo de operaciones por dia.
- Maximo de riesgo abierto.
- Bloqueo tras perdidas consecutivas.
- Cooldown.
- Operar solo pares permitidos.
- Bloquear pares concretos.
- Horarios permitidos.
- No operar sin stop loss.
- Noticias de alto impacto.
- Control por magic/expert id cuando exista.

## Section Shell 4: Ledger

Uso: `Trades`, `Review`, `Journal`, historiales y registros.

Sirve para consultar, filtrar y abrir detalle.

Estructura:

```text
Header + filtros
Tabla/lista principal
Detalle inline o rail solo al seleccionar
Acciones secundarias abajo o en menu
```

Reglas:

- La tabla/lista es la pieza principal.
- No duplicar graficas si la pregunta es de registro.
- No mostrar rail vacio.

## Presupuesto de bloques

Limite por pantalla:

- 1 pieza principal dominante.
- 3-4 KPIs maximo arriba.
- 1 rail lateral si aporta decision real.
- 1 bloque inferior accionable.
- 1 tabla/lista si es necesaria.

Si una seccion necesita mas de 6 bloques, debe dividirse en subsecciones o usar progressive disclosure.

## Reglas visuales duras

No hacer:

- Cards dentro de cards.
- Badges sin informacion accionable.
- Dots decorativos junto a cada titulo.
- Bordes verdes/rojos completos en cards.
- Graficas pequenas decorativas.
- Parrafos largos en la zona principal.
- Repetir equity, balance, PnL o win rate en tres bloques distintos.
- Usar palabras como `muestra`, `drena`, `mock`, `fixture`, `wave` de cara al usuario.

Hacer:

- Usar color solo para valor, estado o peligro.
- Usar separadores, alineacion y peso tipografico antes que mas cards.
- Dejar el grafico principal respirar.
- Reducir texto visible a frases operativas.
- Mantener nombres de trading reconocibles: `PnL`, `win rate`, `score`, `profit factor`, `drawdown`.
- Usar `/` para separar conceptos cortos, no puntos medios.

## Eleccion de visual por dato

| Dato | Visual recomendado |
| --- | --- |
| Equity / balance | Area/line grande estilo Liveline |
| Drawdown | Underwater chart o line/area con zonas |
| Win/loss | Donut KMFX o segmented radial |
| Score | Segmented arc monocromo |
| Profit factor | Gauge/radial solo si aporta referencia |
| Riesgo usado | Barra por zonas o segmented meter |
| Sesion | Ranking horizontal o mapa horario |
| Simbolo | Ranking horizontal, mejor fila con gris sutil |
| Horario | Mapa 24h tipo KMFX |
| Calendario | Grid mensual/anual, no lista plana |
| Reglas | Tabla compacta con switches |
| Noticias | Timeline/lista de eventos |

## Sistema de graficos

Los graficos son parte del lenguaje de producto, no decoracion. Antes de introducir un chart hay que poder completar esta frase:

```text
Este grafico ayuda al trader a decidir/ver _______ en menos de 5 segundos.
```

Si no se puede completar, el grafico no entra.

### Familias permitidas

1. `Liveline-style area/line`

Uso:

- curva de equity/balance;
- curva de drawdown;
- PnL acumulado;
- mercado/precio cuando sea lectura temporal.

Reglas:

- debe ocupar un bloque principal o una mini zona muy clara;
- punto final visible y, si procede, pulso suave;
- grid discreto;
- tooltip limpio;
- sin color fuerte salvo estado positivo/negativo.

2. `Donut win/loss KMFX`

Uso:

- distribucion win/loss;
- lectura de win rate cuando se acompana de ganadoras/perdedoras;
- resumen de calidad de operaciones.

Reglas:

- mejor que un radial generico para win rate;
- debe mostrar el porcentaje central y desglose legible;
- no usarlo para profit factor si no ayuda a entenderlo.

3. `Segmented arc Efferd/Bklit`

Uso:

- score;
- uso de riesgo;
- cumplimiento de reglas;
- nivel de proteccion RiskGuard.

Reglas:

- paleta monocroma por defecto;
- color solo si el estado exige warning/danger;
- no usarlo para todo: maximo uno por pantalla o rail.

4. `Segmented meter horizontal`

Uso:

- margen diario;
- exposicion usada;
- presupuesto de riesgo;
- allocation simple.

Reglas:

- bueno para comparar partes de un total;
- etiquetas arriba o abajo, nunca encima de la barra si no cabe;
- no repetir si ya hay un arc para el mismo dato.

5. `Ranking bars`

Uso:

- simbolos;
- sesiones;
- setups si existen;
- cuentas con mayor impacto.

Reglas:

- barras horizontales densas;
- mejor elemento resaltado con gris sutil, no verde brillante;
- PnL positivo/negativo solo en el numero;
- sin badges salvo estado real.

6. `Temporal heatmap / selector`

Uso:

- mapa horario;
- calendario mensual/anual;
- dias clave.

Reglas:

- el contenedor del selector debe envolver perfectamente las celdas;
- no mezclar barras internas pequenas si rompen la lectura;
- se permite intensidad de fondo por resultado, con contraste sobrio.

### Graficos por seccion

Panel:

- Principal: equity/balance Liveline-style.
- KPI `PnL neto`: mini area solo si no compite con la curva principal.
- KPI `Operaciones`: distribucion simple win/loss o barra segmentada.
- KPI `Win rate`: donut KMFX si hay espacio; si no, numero + wins/losses.
- KPI `Profit factor`: numero dominante y referencia textual; usar gauge solo si se define umbral.

RiskGuard:

- Principal: drawdown/equity con zonas de riesgo.
- Right rail: segmented arc para estado de proteccion o margen.
- Reglas: tabla, no graficos.
- Riesgo variable: tabla compacta y, si aporta, segmented meter por escenario.

Insights resumen:

- Principal: resumen visual de win/loss, simbolo y sesion.
- Diario: mapa diario.
- Horario: mapa 24h.
- Riesgo: distribucion de riesgo/comportamiento, no duplicar RiskGuard.

Portfolio:

- Principal: allocation/contribution table.
- Apoyo: segmented meter o ranking bars.
- Evitar pie chart como lectura principal.

## Definition of Done visual

Una seccion no se considera cerrada hasta cumplir:

- Se entiende en 5 segundos.
- No hay huecos negros sin funcion.
- No hay cards anidadas.
- No hay badges decorativos.
- No hay metricas repetidas sin motivo.
- El bloque principal es obvio al hacer squint test.
- Desktop no corta contenido en Mac.
- Mobile no pierde funciones criticas.
- Si hay UI nueva, se valida con captura o preview.

## Definition of Done tecnica

Antes de entregar cambios de UI:

- `npm run typecheck`
- `npm run lint`
- Ruta abierta en preview o validada por `curl -I`.
- Si hay interaccion: probar click/menu/toggle.
- Si hay cambio sensible: documentar limitacion y no prometer comportamiento que no existe.

## Orden de aplicacion

1. Panel: limpiar huecos, reducir repeticion y consolidar el patron Control Desk.
2. RiskGuard: convertirlo en verdadero centro de control con visual principal, rail de decision y reglas claras.
3. Insights: aplicar Analysis Canvas a Resumen, Diario, Horario y Riesgo.
4. Portfolio/Cuentas: mantener cards utiles, pero sin sobrecargar.
5. Settings/Auth/Marketing: usar Efferd blocks solo cuando encajen con esta shell global.
