# KMFX Edge Design System v1

Estado: especificación base para nuevas fases de UI.  
Ámbito: vanilla HTML, ES modules y CSS. Sin React, Tailwind ni shadcn/ui runtime.  
Fuente visual actual: `styles-v2.css` como capa dominante, `styles.css` como legado aún activo.

## 0. External design references

KMFX Edge toma referencias externas, pero no depende de ellas en runtime.

- shadcn/ui es la referencia de modelo de componentes, tokens semánticos y composición. KMFX replica el patrón conceptual en vanilla CSS/JS, no instala ni ejecuta shadcn/ui.
- Apple Human Interface Guidelines es la referencia de claridad, jerarquía, accesibilidad, interacción predecible y reducción de carga cognitiva.
- KMFX añade la capa propia: semántica trading, lectura por evidencia y flujo Estado/Causa/Evidencia/Acción.

Regla principal: shadcn aporta consistencia de primitives, Apple HIG aporta calidad de interacción y KMFX aporta el criterio de producto.

## 1. Filosofía visual

KMFX Edge debe sentirse como una herramienta profesional de trading: oscura, precisa, calmada, densa pero legible. El producto no debe competir con los datos; debe ordenar la lectura para que el trader entienda en segundos qué está pasando y qué revisar.

Principio rector:

1. Data
2. Interpretación
3. Decisión
4. Acción

Cada sección reconstruida debe seguir el método KMFX:

1. Estado: qué está ocurriendo.
2. Causa: por qué ocurre.
3. Evidencia: qué datos lo demuestran.
4. Acción: qué proceso debe ejecutar el usuario.

La UI debe evitar paneles de métricas sin interpretación. Una métrica solo merece protagonismo si cambia una decisión.

### Qué debe transmitir KMFX

- Claridad Apple-like: jerarquía limpia, lectura rápida, superficies sin ruido.
- Restricción shadcn-like: componentes sobrios, bordes sutiles, foco en composición.
- Precisión trading: colores semánticos solo cuando aportan significado.
- Confianza: estados incompletos no deben sobrediagnosticar.
- Densidad útil: mucha información, pero agrupada por decisión y no por decoración.

### Qué debe evitar KMFX

- Colores decorativos sin significado.
- Glow, blur o sombras agresivas.
- Cards grandes que no contienen una decisión.
- KPIs apiladas sin una lectura de Estado/Causa.
- Textos inventando certeza cuando faltan datos.
- Clases one-off que duplican tokens existentes.
- CSS global amplio para arreglar un problema local.

### Apple HIG interpretation for KMFX

Apple HIG se interpreta en KMFX como reglas prácticas, no como estética superficial.

- La jerarquía clara va antes que la decoración.
- Tamaño, peso y color de texto deben indicar importancia.
- El color comunica estado, no adorno.
- El texto pequeño debe seguir siendo legible en dark mode.
- Los estados de foco deben ser visibles y consistentes.
- Los controles deben comportarse de forma predecible.
- El layout debe preservar escaneabilidad y reducir carga cognitiva.
- La motion debe explicar interacción, no decorar.
- Empty/error states deben decir el siguiente paso.
- La densidad trading está permitida solo si está agrupada por decisión.

### Apple HIG acceptance checklist

Antes de cerrar una fase visual, revisar:

- ¿El usuario entiende el estado de la sección en 3 segundos?
- ¿La decisión principal domina visualmente?
- ¿El dato secundario está suficientemente muted?
- ¿Las acciones son claras y orientadas a proceso?
- ¿Los focus states son visibles?
- ¿El contraste es aceptable para metadata y tablas?
- ¿El layout funciona en anchos estrechos?
- ¿Los estados incompletos están etiquetados como incompletos?
- ¿Los colores son semánticos?
- ¿No hay copy de asesoramiento financiero?

### shadcn + Apple + KMFX hierarchy

El sistema combinado se define así:

- shadcn/ui: tokens, primitives y consistencia de componentes.
- Apple HIG: claridad, jerarquía, calidad de interacción y accesibilidad.
- KMFX: semántica trading y flujo Estado/Causa/Evidencia/Acción.

## 2. Arquitectura visual actual

### Archivos base

- `styles.css`: capa legacy con tokens light/dark, aliases antiguos, layouts base, shell, cards, tablas y muchos estilos históricos.
- `styles-v2.css`: capa visual dominante. Define tokens KMFX dark, puente semántico shadcn-inspired, primitivas `.kmfx-ui-*`, overrides premium y estilos scoped por sección.
- `index.html`: carga `styles.css` y luego `styles-v2.css`. Contiene app shell, sidebar, main panel y algunos estilos inline legacy para light mode.
- `js/modules/ui-primitives.js`: helpers HTML para `pageHeaderMarkup()`, `pnlTextMarkup()` y `pnlBadgeMarkup()`.

### Base existente encontrada

- Tokens legacy: `--layer-*`, `--text-*`, `--border-*`, `--accent`, `--positive`, `--negative`, `--warning`.
- Tokens KMFX: `--kmfx-page-bg`, `--kmfx-card-bg`, `--kmfx-gap-*`, `--kmfx-title-size`, `--kmfx-card-radius`.
- Puente semántico: `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--muted`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`.
- Trading tokens: `--profit`, `--loss`, `--breakeven`, `--risk`, `--drawdown`, `--equity`, `--funded`.
- Chart tokens: `--chart-1` a `--chart-5`, `--chart-grid`, `--chart-axis`, `--chart-tooltip`, `--chart-tooltip-border`.
- Primitivas nuevas: `.kmfx-ui-card`, `.kmfx-ui-kpi`, `.kmfx-ui-button`, `.kmfx-ui-badge`, `.kmfx-ui-pnl`, `.kmfx-ui-table`, `.kmfx-ui-dialog`, `.kmfx-ui-page-header`, `.kmfx-ui-filter-bar`, `.kmfx-ui-input`, `.kmfx-ui-select`, empty/loading/error states.
- Clases legacy aún activas: `.tl-section-card`, `.widget-card`, `.tl-kpi-card`, `.table-wrap`, `.ui-badge`, `.modal-card`, `.modal-overlay`, `.calendar-screen__header`.

### shadcn/ui parity contract

KMFX primitives deben mapear mentalmente a componentes shadcn-style, aunque la implementación sea vanilla:

| Referencia shadcn/ui | KMFX actual/futuro |
| --- | --- |
| Card | `.kmfx-ui-card` |
| Button | `.kmfx-ui-button` |
| Badge | `.kmfx-ui-badge` |
| Table | `.kmfx-ui-table` |
| Dialog | `.kmfx-ui-dialog` |
| Input | `.kmfx-ui-input` |
| Select | `.kmfx-ui-select` |
| Tabs / Toggle Group | futura `.kmfx-ui-segmented` o `.kmfx-ui-tabs` |
| Tooltip | futura `.kmfx-ui-tooltip` |
| Popover / Dropdown | futura `.kmfx-ui-popover` |
| ScrollArea | futura `.kmfx-ui-scroll-area` |
| Chart | futura `.kmfx-ui-chart-card` |
| Sidebar | futuro contrato de tokens sidebar |

Regla clara: nueva UI debe usar tokens semánticos y primitives antes que inventar estilos visuales page-specific.

## 3. Token contract

Los tokens oficiales para nuevas implementaciones son los semánticos de `styles-v2.css`. Los tokens legacy pueden seguir existiendo, pero nuevas fases deben preferir esta capa.

### Required shadcn-compatible tokens

Estos nombres deben existir o mapearse a tokens KMFX existentes. En vanilla CSS deben resolver a valores CSS válidos, no a tuplas HSL dependientes de Tailwind.

Base tokens requeridos:

- `--background`
- `--foreground`
- `--card`
- `--card-foreground`
- `--popover`
- `--popover-foreground`
- `--primary`
- `--primary-foreground`
- `--secondary`
- `--secondary-foreground`
- `--muted`
- `--muted-foreground`
- `--accent`
- `--accent-foreground`
- `--destructive`
- `--destructive-foreground`
- `--border`
- `--input`
- `--ring`
- `--radius`

Chart tokens requeridos:

- `--chart-1`
- `--chart-2`
- `--chart-3`
- `--chart-4`
- `--chart-5`

Sidebar tokens para compatibilidad futura:

- `--sidebar`
- `--sidebar-foreground`
- `--sidebar-primary`
- `--sidebar-primary-foreground`
- `--sidebar-accent`
- `--sidebar-accent-foreground`
- `--sidebar-border`
- `--sidebar-ring`

Estos tokens pueden mapear a `--layer-*`, `--text-*`, `--border-*`, `--accent` y tokens trading existentes. No implican migrar a shadcn runtime.

### Base UI

| Token | Uso |
| --- | --- |
| `--background` | Fondo de página/app. |
| `--foreground` | Texto principal. |
| `--card` | Superficie base de cards. |
| `--card-foreground` | Texto principal dentro de cards. |
| `--popover` | Superficie elevada de dialog/popover. |
| `--popover-foreground` | Texto dentro de popovers/dialogs. |
| `--primary` | Acción primaria y foco azul KMFX. |
| `--primary-foreground` | Texto sobre primary. |
| `--secondary` | Superficie/control secundario. |
| `--secondary-foreground` | Texto sobre secondary. |
| `--muted` | Superficie de bajo énfasis. |
| `--muted-foreground` | Texto terciario/metadatos. |
| `--accent` | Acento principal KMFX, usado para foco analítico y acciones. |
| `--accent-foreground` | Texto sobre superficies accent. |
| `--destructive` | Error o acción destructiva. |
| `--destructive-foreground` | Texto sobre destructive. |
| `--border` | Borde estándar. |
| `--input` | Borde de input/select. |
| `--ring` | Focus visible. |
| `--radius` | Radio base para primitives. |

Regla: no usar hex directo en componentes nuevos si existe token semántico equivalente.

### Surfaces

| Token | Uso |
| --- | --- |
| `--surface-page` | Lienzo general. |
| `--surface-card` | Card estándar. |
| `--surface-card-hover` | Hover sobrio de card/control. |
| `--surface-elevated` | Dialogs, popovers, paneles flotantes. |
| `--surface-overlay` | Overlay modal sin blur agresivo. |

Jerarquía recomendada:

- Page: `--surface-page`
- Section/Card: `--card` o `--surface-card`
- Inner block: `--muted` con borde sutil
- Overlay/Dialog: `--surface-overlay` + `--popover`

### Trading

| Token | Uso |
| --- | --- |
| `--profit` | P&L positivo, cumplimiento bueno, mejora. |
| `--profit-muted` | Fondo suave de estado positivo. |
| `--loss` | P&L negativo, error, incumplimiento. |
| `--loss-muted` | Fondo suave de estado negativo. |
| `--breakeven` | Cero, neutral económico. |
| `--risk` | Advertencia, presión, revisión pendiente. |
| `--risk-muted` | Fondo suave de warning. |
| `--drawdown` | Drawdown y pérdida de control. |
| `--equity` | Equity, cuenta, foco analítico azul. |
| `--funded` | Funding, estado premium/violeta. |

Regla: profit/loss nunca deben usarse como decoración. Solo expresan resultado, validez o presión real.

### Charts

| Token | Uso |
| --- | --- |
| `--chart-1` | Serie profit/compliance principal. |
| `--chart-2` | Serie equity/accent. |
| `--chart-3` | Serie risk/warning. |
| `--chart-4` | Serie loss/drawdown. |
| `--chart-5` | Serie funded/secondary accent. |
| `--chart-grid` | Grid sutil. |
| `--chart-axis` | Texto/ejes. |
| `--chart-tooltip` | Fondo tooltip. |
| `--chart-tooltip-border` | Borde tooltip. |

Charts deben parecer shadcn charts adaptado a KMFX: compactos, tooltip oscuro, leyenda discreta, grid mínimo y sin saturación excesiva.

### Typography

Fuente oficial:

```css
Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", sans-serif
```

Escala oficial:

| Rol | Tamaño | Peso | Uso |
| --- | ---: | ---: | --- |
| Page eyebrow | 10-11px | 800 | Label uppercase con tracking alto. |
| Page title | 32-34px | 760-780 | Título principal de sección. |
| Page description | 14-15px | 400-500 | Subtítulo contextual. |
| Section/Card title | 16-18px | 650-750 | Títulos de cards principales. |
| Decision title | 14-16px | 650-750 | Estado/Causa/Acción. |
| KPI label | 10-11px | 700-800 | Uppercase, muted. |
| KPI value | 28-34px | 650-760 | Tabular nums. |
| Body | 13-14px | 400-500 | Copy normal. |
| Metadata | 11-12px | 500-650 | Tiempo, filtros, contexto. |
| Table header | 9-10px | 800 | Uppercase. |
| Table text | 12-13px | 500-650 | Dense readable. |
| Badge text | 9-10px | 750-800 | Uppercase compact. |

Regla: no introducir tamaños arbitrarios nuevos salvo necesidad justificada. Si hace falta una excepción, documentarla en CSS scoped.

### Spacing

Escala recomendada:

| Token conceptual | Valor |
| --- | ---: |
| Micro gap | 4px |
| Small gap | 8px |
| Control gap | 10px |
| Card gap | 12-16px |
| Section gap | 20-24px |
| Page gap | 28px |
| Card padding compact | 14-16px |
| Card padding standard | 20-24px |
| Dialog padding | 24px |
| Table cell padding | 10-14px |
| Table row height | 44-52px |

Regla: una sección reconstruida debe usar una grilla clara y repetir gaps. No mezclar `10px`, `13px`, `17px`, `22px` sin razón.

### Radius

| Token | Uso |
| --- | --- |
| `--radius-sm` | Inputs, botones compactos. |
| `--radius-md` | Cards pequeñas, inner blocks. |
| `--radius-lg` | Cards principales. |
| `--radius-xl` | Shells, dialogs, paneles grandes. |
| `--control-radius-pill` | Pills, badges, segmented controls. |

Contrato visual:

- Control: 8px
- Card compacta: 12px
- Card principal: 16px
- Shell/modal: 18-24px
- Pill: 999px

### Motion

| Token/concepto | Valor |
| --- | --- |
| Fast | 140-160ms |
| Medium | 200-220ms |
| Easing | `cubic-bezier(0.16, 1, 0.3, 1)` cuando aplique |

Reglas:

- Hover debe ser sutil: cambio de background/border/color.
- Evitar transform grande, bounce, glow y blur.
- Siempre respetar `prefers-reduced-motion`.
- Motion debe explicar interacción, no decorar.

## 4. Component contracts

### PageHeader

Primitive: `pageHeaderMarkup()` + `.kmfx-ui-page-header`.

Uso:

- Una sola vez al inicio de cada sección.
- Eyebrow corto.
- Título claro.
- Descripción orientada a decisión.
- Acciones a la derecha si existen.

No incluir KPIs ni filtros dentro del header salvo acciones directas.

### SectionCard

Primitive recomendada: `.kmfx-ui-card`.

Estructura:

- Header con título/subtítulo si la card contiene análisis.
- Content con evidencia.
- Footer solo para acciones o resumen.

Uso:

- Agrupar una unidad de lectura.
- No crear cards anidadas salvo que el bloque interno cambie jerarquía.

### DecisionCard

Card orientada a Estado/Causa/Acción.

Debe contener:

- Label pequeño.
- Título interpretativo.
- Copy breve.
- Badge/tone si hay estado.

No debe parecer una KPI. La decisión manda; la métrica apoya.

### KpiCard

Primitive: `.kmfx-ui-kpi`.

Uso permitido:

- Mostrar número clave que el usuario ya entiende.
- Apoyar una decisión ya enmarcada por un DecisionLayer.

No usar KPIs para sustituir interpretación. Si hay más de 4 KPIs, probablemente falta jerarquía.

### MetricCard

Card secundaria de métrica contextual.

Contrato:

- Label muted.
- Valor tabular.
- Meta de contexto.
- Sin iconografía decorativa salvo semántica.

### DataTable

Primitive: `.kmfx-ui-table-wrap` + `.kmfx-ui-table`.

Contrato:

- Header uppercase 9-10px.
- Números alineados derecha.
- P&L con `pnlTextMarkup()`.
- Filas densas pero clicables.
- Hover sutil.

La tabla debe ser evidencia, no el primer mensaje de la página.

### Badge

Primitive: `.kmfx-ui-badge`.

Tones oficiales:

- `neutral`
- `profit`
- `loss`
- `warning`
- `risk`
- `info`
- `funded`

Badges deben ser cortos: 1-3 palabras.

### PnlText

Helper: `pnlTextMarkup()`.

Reglas:

- Usar para P&L textual.
- Mantener formato existente si viene de helper financiero.
- Signo explícito si el contexto compara resultado.
- No usar clases legacy nuevas como `green`/`red` en implementaciones nuevas.

### PnlBadge

Helper: `pnlBadgeMarkup()`.

Uso:

- Resumen compacto.
- Estados de trade o celda.
- No sustituye a P&L principal grande.

### Button

Primitive: `.kmfx-ui-button`.

Variants:

- `primary`: acción principal.
- `secondary`: acción secundaria visible.
- `ghost`: acción de bajo énfasis.
- `destructive`: eliminar/cancelar destructivo.

Regla: foco visible obligatorio; no eliminar outline sin reemplazo.

### Input / Select

Primitives: `.kmfx-ui-input`, `.kmfx-ui-select`, `.kmfx-ui-field`.

Contrato:

- Altura estándar 44px.
- Focus ring semántico.
- Placeholder muted.
- Nunca azul permanente por focus residual.

### FilterBar

Primitive: `.kmfx-ui-filter-bar`.

Uso:

- Filtros que cambian muestra.
- Debe indicar claramente qué universo de datos se está leyendo.

### Dialog

Primitives: `.kmfx-ui-dialog-overlay`, `.kmfx-ui-dialog`.

Contrato:

- Overlay propio, sin modificar `body`, `main`, `sidebar` ni `app-shell`.
- Header/footer visibles cuando el contenido scrollea.
- Cerrar con X, Escape y click fuera cuando no sea acción crítica.
- Dialog para tareas; AlertDialog solo para confirmaciones destructivas.

### EmptyState / LoadingState / ErrorState

Primitives:

- `.kmfx-ui-empty-state`
- `.kmfx-ui-loading-state`
- `.kmfx-ui-error-state`

Contrato:

- Texto útil.
- Próxima acción clara.
- No culpar al usuario.
- No llenar el espacio con ruido visual.

### DecisionLayer / TruthSummary

Componente de producto KMFX.

Debe mapear siempre:

1. Estado
2. Causa
3. Evidencia
4. Acción

Contrato:

- Aparece cerca del inicio de la sección.
- Interpreta la muestra activa.
- Declara incertidumbre si faltan datos.
- Usa P&L, tags, reglas o riesgo como evidencia, no como decoración.
- Acciones deben ser de proceso, no consejos financieros.

Ejemplo de tono:

- Bueno: "Completa 8 tags pendientes antes de sacar conclusiones."
- Malo: "Debes operar EURUSD mañana."

## 5. Page-level structure rules

Orden recomendado para secciones reconstruidas:

1. PageHeader
2. DecisionLayer / TruthSummary
3. KPI row si es necesaria
4. Main evidence area
5. Table/detail/drill-down
6. Secondary analysis
7. Empty states

### Cuándo usar KPIs

Usar KPIs cuando:

- El usuario necesita cuantificar el estado.
- El KPI está conectado con una acción.
- Hay 3-5 como máximo en la primera lectura.

Evitar KPIs cuando:

- Repiten datos ya visibles.
- No cambian una decisión.
- Fuerzan una card alta sin contenido.

### Cuándo usar charts

Usar charts cuando:

- Hay evolución, distribución o comparación temporal.
- La visualización reduce carga cognitiva.
- El tooltip aporta evidencia concreta.

Evitar charts cuando:

- Hay menos datos que una tabla simple.
- El eje/leyenda requiere demasiado esfuerzo.
- Se usa color por decoración.

### Cuándo usar tablas

Usar tablas cuando:

- El usuario necesita auditar registros.
- La tabla es evidencia de una decisión superior.
- Hay filtros claros y filas escaneables.

Evitar tablas como primer bloque si la página debe responder "qué hago ahora".

### Datos incompletos

Regla de no sobrediagnóstico:

- Si faltan tags, no inferir violaciones.
- Si hay baja cobertura, mostrar "pendiente" o "parcial".
- Si una métrica viene de fallback, etiquetarla como parcial.
- Si no hay datos suficientes, decirlo explícitamente y sugerir cómo obtener evidencia.

## 6. Trading visual semantics

### P&L

- Positivo: `--profit`
- Negativo: `--loss`
- Cero/breakeven: `--breakeven`
- Formato tabular.
- Signo explícito cuando compare resultado: `+$120`, `-$90`, `$0`.

### Estados de reglas/etiquetas

| Estado | Visual | Copy |
| --- | --- | --- |
| `valid` | profit suave | "Válido", "Cumple" |
| `invalid` | loss suave | "Incumplido", "Revisión" |
| `pending` | risk/warning suave | "Pendiente", "Revisión pendiente" |
| `untagged` | neutral/muted | "Sin etiqueta", "Sin evidencia" |
| `partial` | risk/warning | "Parcial" |

### Riesgo

| Estado | Uso |
| --- | --- |
| Seguro | Profit, pero sobrio. |
| Watch | Risk/warning. |
| Breach | Loss/drawdown. |
| Blocked | Loss + copy clara de bloqueo. |

### Drawdown

Drawdown usa `--drawdown` y debe tener jerarquía mayor que P&L diario si amenaza la cuenta.

### Copy de acciones

Las acciones deben ser de proceso:

- "Completa tags pendientes."
- "Revisa los trades donde falló Setup válido."
- "Reduce exposición hasta recuperar cumplimiento." Solo si lo pide la regla interna de riesgo.

No escribir asesoramiento financiero:

- No "compra/vende".
- No "opera este par".
- No "recupera pérdidas".

## 7. Rules for future Codex prompts

Para cualquier fase futura:

- Usar KMFX Design System v1 como fuente de verdad.
- No inventar tokens nuevos si existe uno compatible.
- No crear CSS global amplio para arreglar un problema local.
- Preferir `.kmfx-ui-*` primitives.
- Añadir CSS scoped con prefijo de sección.
- Preservar comportamiento y layout salvo que el prompt pida cambiarlo.
- Una sección por fase.
- No tocar archivos no relacionados.
- No tocar cálculos salvo petición explícita.
- No escribir en storage salvo petición explícita.
- No tocar bridge, EA, WebSocket, auth o routing salvo fase específica.
- Mantener copy en español en UI de producto.
- Estados incompletos deben declararse como incompletos.
- Trading colors solo para significado trading.
- No introducir React, Tailwind ni shadcn runtime.
- Si se usa un patrón shadcn, replicar composición visual en vanilla.

### Mandatory Codex prompt block

Bloque reutilizable para futuras tareas:

```text
Use KMFX Design System v1.
Use shadcn-compatible semantic tokens.
Follow Apple HIG clarity, hierarchy and accessibility.
Do not invent one-off styles.
Prefer .kmfx-ui-* primitives.
Add scoped CSS only with section prefix.
Do not use color decoratively.
Do not overdiagnose incomplete data.
Keep copy in Spanish.
One section per phase.
No unrelated files.
```

### Future Next.js migration note

Si KMFX migra a Next.js, las primitives vanilla deben mapearse a componentes React reales sin replantear la dirección visual.

Componentes objetivo:

- `KpiCard`
- `SectionCard`
- `DecisionLayer`
- `DataTable`
- `PnlText`
- `Badge`
- `Dialog`
- `ChartCard`

El objetivo de este documento es que una migración futura no rediseñe de cero: los tokens, jerarquías, tonos, estados y copy rules ya deben estar decididos.

## 8. Implementation gap list

### Tokens missing or inconsistent

- `styles.css` y `styles-v2.css` definen paletas y radios distintos; `styles-v2.css` debe ser fuente para nuevas fases.
- `--text-3` aparece en overrides legacy, pero no está definido de forma clara en el token bridge.
- Faltan tokens sidebar shadcn-compatible: `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring`.
- Existen aliases duplicados para `--primary`, `--accent`, `--green`, `--red`, `--gold`.
- Faltan tokens explícitos de table row height y z-index scale.
- Falta contrato oficial de alpha para `profit-muted`, `loss-muted`, `risk-muted` en charts y badges legacy.

### Primitives missing

- Segmented control / Tabs primitive.
- Tooltip primitive.
- Popover/dropdown primitive.
- ScrollArea primitive para panels con scroll interno.
- ChartCard primitive con header, body, legend y fallback.
- DecisionLayer primitive formal (`.kmfx-ui-decision-layer`) si se repite en más secciones.
- TradeRow / TradeTruthIndicator primitive para fases de Operaciones.

### Old classes to migrate later

- `.tl-section-card` -> `.kmfx-ui-card` o SectionCard scoped.
- `.tl-kpi-card` / `.widget-card--kpi` -> `.kmfx-ui-kpi`.
- `.table-wrap` -> `.kmfx-ui-table-wrap`.
- `.ui-badge` -> `.kmfx-ui-badge`.
- `.modal-card` / `.modal-overlay` -> `.kmfx-ui-dialog`.
- `.calendar-screen__header` legacy page headers -> `pageHeaderMarkup()`.
- `metric-positive`, `metric-negative`, `green`, `red` -> `pnlTextMarkup()` / semantic tones.

### Risky legacy overrides

- Hay múltiples bloques con `!important` en `styles-v2.css`, especialmente en Ejecución.
- Existen estilos `:has()` para modales/cards que pueden afectar navegadores o especificidad.
- `index.html` contiene un `<style>` inline legacy para light mode.
- Scrollbars y modal overflow tienen overrides específicos por sección.

### Recommended DS-2 tasks

1. Añadir tokens faltantes: `--text-3`, `--z-*`, `--table-row-height-*`, `--duration-*`, `--ease-*`.
2. Añadir tokens sidebar shadcn-compatible y mapearlos al sidebar actual sin cambiar navegación.
3. Añadir primitives: segmented control, tooltip, popover, scroll area, chart card.
4. Crear `.kmfx-ui-decision-layer` a partir de `trades-truth`.
5. Migrar una sola sección legacy card/KPI a primitives como piloto.
6. Crear guía de migración de clases legacy a `.kmfx-ui-*`.
7. Normalizar `styles.css` vs `styles-v2.css` sin borrar legacy.

### DS-2 implementation note

DS-2 implementa en `styles-v2.css` los tokens sidebar shadcn-compatible, `--text-3`, aliases de texto, escala z-index, tokens de row/table density, tokens de duration/easing y primitives futuras para segmented/tabs, tooltip, popover/dropdown, scroll area, chart card y decision layer. Estas clases son additive y no migran secciones existentes todavía.

### DS-3 implementation note

DS-3 añade helpers de markup en `js/modules/ui-primitives.js` para SectionCard, KpiCard, DecisionLayer, Badge (`kmfxBadgeMarkup` para evitar conflicto con `status-badges.js`), EmptyState y ChartCard. Estos helpers devuelven HTML vanilla usando `.kmfx-ui-*`, escapan texto plano y solo aceptan HTML intencional mediante props `*Html`. No migran secciones existentes todavía.

### DS-3.1 implementation note

DS-3.1 amplía `kpiCardMarkup()` con estructura premium vanilla compatible con dashboards shadcn/TripleD-like: `iconHtml`, `badgeHtml`, `valueHtml`, `trend`, `trendTone`, `trendHtml`, `mediaHtml` y `headerHtml`. El primitive `.kmfx-ui-kpi` ahora soporta top area, icon marker, trend badge y body jerárquico sin migrar páginas ni introducir runtime React/Tailwind/shadcn.

## 9. Validation checklist for future phases

- Branch y working tree verificados antes de editar.
- Solo archivos permitidos cambiados.
- `git diff --check` limpio.
- `node --check` para JS modificado.
- No cambios de cálculo si no se pidieron.
- No storage writes nuevos si no se pidieron.
- No CSS global sin scope.
- Estados incompletos visibles como incompletos.
- P&L renderizado con primitive cuando aplique.
- UI mantiene lectura en 3 segundos.
