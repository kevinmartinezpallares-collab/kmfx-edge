# KMFX Edge Dashboard Simplification Roadmap

Estado: notas de producto y roadmap visual.  
Alcance inmediato: desktop. Mobile queda fuera hasta nueva decision.  
Decision base: limpieza tactica ahora; rediseño grande con Next.js + shadcn/ui.

## Referencias guardadas

- Shadcn UI Kit classic dashboard: https://shadcnuikit.com/dashboard/default
- Shadcn Admin Dashboard Kit: https://shadcnuikit.com/admin-dashboard
- Referencia mobile de cards con sparklines tipo RevenueCat: usar como inspiracion futura para mobile, no para esta fase.
- Referencia KPI `Trade win %`: gauge semicircular + desglose wins / breakeven / losses como patron futuro de metricas explicables.
- Referencias visuales guardadas por usuario en Downloads (`IMG_2518.JPG`, `IMG_2519.JPG`, `IMG_2520.JPG`, `IMG_2521.JPG`, `IMG_2525.JPG`, `IMG_2525 2.JPG`, `IMG_2527.JPG`, `IMG_2528.JPG`, `IMG_2529.JPG`): objetivo de simpleza, claridad, sidebar limpia, cards con bordes finos, tablas legibles y dashboards oscuros/luminosos de alta densidad controlada.

## Principio de dashboard

KMFX Edge no necesita enseñar mas datos en el primer vistazo. Necesita ordenar los datos para que el trader entienda la cuenta en segundos:

1. Como va la cuenta.
2. Si esta ganando o perdiendo.
3. Si esta en riesgo.
4. Que debe revisar ahora.

La referencia shadcn importa por su limpieza: sidebar sobria, header simple, pocas cards arriba, grafico principal claro y tablas debajo. El objetivo no es copiar colores, sino copiar jerarquia.

## Nivel visual objetivo

Las nuevas referencias marcan el estandar visual que debe alcanzar KMFX Edge en Next:

- Sidebar sobria, con grupos claros, iconos finos y estados activos muy evidentes.
- Layout desktop amplio, sin sensacion de landing page.
- Superficies planas con border sutil; sombras muy suaves o inexistentes.
- Cards compactas, bien alineadas y con una sola responsabilidad.
- Tipografia precisa: titulos claros, metadata suave, numeros grandes solo donde aporten decision.
- Tablas limpias con buena altura de fila, filtros visibles y poca decoracion.
- Graficas grandes y respiradas, con ejes discretos, tooltips limpios y contraste contenido.
- Dark mode elegante: negro/gris profundo, bordes tenues, blanco roto, verdes/rojos solo para estado.
- Light mode elegante: fondo gris muy suave, cards blancas, bordes finos, contraste bajo pero legible.
- No usar glow decorativo, gradientes fuertes, orbes, hero sections ni cards apiladas sin necesidad.

Regla de producto: si una pantalla no se entiende en 5 segundos, esta demasiado cargada. Si parece una landing, esta demasiado promocional. Si parece una hoja de calculo, le falta jerarquia.

## Decision: ahora vs Next.js

### Ahora, en vanilla

Hacer una limpieza tactica del dashboard actual:

- Reducir protagonismo visual de secciones secundarias.
- Mantener 4 KPIs principales arriba.
- Hacer que las cards tengan labels, valores y metas mas escaneables.
- Añadir `?` explicativo en metricas clave con tooltip/popover simple.
- Ocultar o bajar prioridad a tablas de riesgo si no hay senal activa.
- Evitar rediseñar mobile.
- Evitar construir una nueva arquitectura de charts en vanilla.

### Despues, con Next.js

Hacer el rediseño real:

- App Router + layout desktop profesional.
- shadcn/ui para Card, Sidebar, Tooltip, Popover, Table, Tabs, Dialog y DropdownMenu.
- Recharts dentro de cards de metricas cuando aporte lectura real.
- TanStack Table para trades, exposicion y cuentas.
- Componentes de dominio: `MetricCard`, `RiskStatusBadge`, `ChartPanel`, `AccountSwitcher`, `PromoFloatingCard`.
- Sistema consistente de tooltips `?` para cada metrica.
- Dashboard desktop como primera pantalla migrada.

## Roadmap de ideas

### Progreso aplicado

- [x] Instalar skill oficial `shadcn/ui` en el proyecto para guiar componentes y patrones.
- [x] Detectar contexto shadcn actual: proyecto `Manual`, sin `components.json`; no instalar componentes React sobre la app legacy.
- [x] Añadir `?` explicativo en KPIs principales del Dashboard con patrón tipo Tooltip: trigger enfocable + contenido asociado.

### Fase 0: Limpieza tactica actual

Objetivo: que el dashboard actual sea mas claro sin rehacerlo entero.

- Primera fila: `Equity`, `PnL`, `Drawdown`, `Win Rate` o `Profit Factor`.
- Segunda zona: grafico `Equity / Balance`.
- Tercera zona: estado operativo y riesgo, solo con senales importantes.
- Tablas: operaciones recientes, exposicion y riesgo por posicion mas abajo.
- Copy mas corto: menos explicacion visible, mas tooltip contextual.
- Mantener desktop como unico objetivo.

### Fase 1: Preparar migracion Next

Objetivo: que el nuevo dashboard no copie el HTML legacy.

- Definir contrato de datos para dashboard.
- Extraer selectores puros para KPIs.
- Definir componentes shadcn esperados.
- Diseñar layout desktop antes de migrar otras paginas.

### Fase 2: Dashboard VNext

Objetivo: reconstruir el dashboard como panel profesional.

- Sidebar shadcn.
- Header con cuenta activa, estado de sync, rango temporal y accion principal.
- Grid superior de 4 metric cards.
- Chart principal de equity.
- Panel lateral de estado/riesgo.
- Tabla de operaciones recientes.
- Tooltips `?` en todas las metricas.
- Estados vacios y de conexion claros.

### Fase 3: Comercial y afiliados

Objetivo: monetizacion discreta sin romper la lectura.

- Popup flotante de descuentos para prop firms.
- Boton `X` para cerrar.
- CTA con enlace de afiliado.
- Persistencia de cierre por tiempo.
- Mostrar solo una promo a la vez.
- Ubicacion: inferior derecha en desktop.

### Fase 4: Mobile futuro

Objetivo: adaptar, no encoger.

- Cards tipo app financiera.
- Sparklines compactas.
- Bottom tabs.
- Gauge para win rate / riesgo.
- Popovers tactiles para explicaciones.

## Criterio para graficas en KPI/cards

No meter graficas pequenas solo porque quedan bonitas. Cada grafica debe responder una pregunta.

Buenas candidatas para Next:

- `Equity`: sparkline o mini area chart.
- `Drawdown`: barra/progress hacia limite.
- `Win Rate`: gauge o distribucion wins / breakeven / losses.
- `PnL`: tendencia por periodo.
- `Riesgo abierto`: progress contra politica.

Ahora, en vanilla, solo aplicar graficas a KPIs si ya existe el dato y no complica el render. En caso contrario, esperar a Next.
