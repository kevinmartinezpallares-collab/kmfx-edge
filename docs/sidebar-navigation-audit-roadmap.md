# KMFX Edge Sidebar Navigation Audit Roadmap

Fecha: 2026-05-03
Estado: bloqueo de produccion antes de continuar mobile/responsive.

Actualizacion 2026-05-03: se aprueba recuperar subsecciones visibles en desktop solo cuando cada una tenga contenido y metricas propias. Mobile queda fuera de scope. Insights se mantiene como excepcion: sus tabs internas no se duplican en sidebar.

## Veredicto

La sidebar actual no debe pasar a produccion en este estado. Se han convertido tabs, bloques internos y rutas profundas en entradas visibles de sidebar sin garantizar que cada entrada tenga una vista distinta. El resultado es que varias subsecciones aparentan ser paginas separadas pero renderizan el mismo contenido, o duplican menus que ya existen dentro de la seccion.

Este documento corrige la propuesta de navegacion del roadmap anterior: las subsecciones solo deben aparecer en la sidebar cuando sean destinos reales, con contenido propio y sin duplicar controles internos.

## Regla de arquitectura

- Sidebar: solo areas principales del producto y, excepcionalmente, subsecciones reales de nivel producto.
- Tabs internas: modos de lectura dentro de una misma seccion, por ejemplo Resumen / Diario / Hora / Control en Insights.
- Rutas profundas: pueden existir para deep links, pero no por eso deben mostrarse en la sidebar.
- Entrada visible en sidebar: debe cumplir una de estas condiciones:
  - Tiene renderer propio y contenido claramente distinto.
  - Abre una seccion de producto separada, sin duplicar tabs internas.
  - Tiene un contrato de tab interno sincronizado con URL y un unico control visible, no sidebar + tab a la vez.

## Hallazgos

### P0 - La sidebar duplica menus internos

En `index.html` se muestran subsecciones visibles para Insights, Strategies, Funding, Risk Engine y Journal. Insights ya tiene su menu interno `analyticsTabs` con Resumen, Diario, Hora y Control, por lo que la sidebar esta duplicando ese mismo control.

Impacto: el usuario ve dos navegaciones para lo mismo y no queda claro si esta cambiando de pagina o de filtro interno.

### P0 - Hay subsecciones que pintan exactamente la misma vista

`app.js` resuelve varias subrutas hacia el renderer del padre mediante `parentPageForPage`. Journal, Risk, Funding y Strategies tienen subrutas en `route-map.js`, pero sus renderers principales no ramifican por `state.ui.activePage`.

Ejemplos:

- `journal`, `journal-review`, `journal-entries`, `journal-ai-review` acaban en `renderJournal`.
- `risk`, `risk-ruin-var`, `risk-monte-carlo`, `risk-exposure` acaban en `renderRisk`.
- `funded`, `funded-rules`, `funded-payouts` acaban en `renderFunded`.
- `strategies`, `strategies-backtest`, `strategies-portfolio` acaban en `renderStrategies` o parent mapping.

Impacto: la sidebar promete pantallas distintas, pero entrega el mismo cockpit completo.

### P1 - El modelo de rutas y el modelo de sidebar estan mezclados

`js/modules/route-map.js` define `PAGE_ROUTES`, `PAGE_PARENT`, `NAV_PARENT` y tabs de analytics. La sidebar en `index.html` y el menu mobile en `js/modules/mobile-nav.js` copian esas rutas como si todas fueran navegacion visible.

Impacto: cualquier ruta nueva tiende a aparecer como item visual aunque solo sea un deep link o un estado interno.

### P1 - Inconsistencia en Strategies Portfolio

`PAGE_PARENT` asigna `strategies-portfolio` a `portfolio`, pero `NAV_PARENT` lo asigna a `strategies`. Esto puede activar Strategies en sidebar mientras el panel real resuelto puede ser Capital/Portfolio.

Impacto: estado activo y contenido pueden no coincidir.

### P1 - Mobile replica el mismo error

`js/modules/mobile-nav.js` incluye subrutas para Insights, Strategies, Funding, Risk y Journal dentro del menu "Mas". Aunque el mobile responsive todavia no se haya trabajado visualmente, la arquitectura ya quedo contaminada con la misma duplicacion.

Impacto: si se empieza mobile sobre esta base, se consolidara una IA equivocada.

### P2 - La sidebar no esta alineada con un contrato shadcn limpio

El proyecto no usa shadcn como runtime, pero `docs/kmfx-design-system-v1.md` indica que KMFX replica sus patrones conceptualmente. La sidebar actual usa clases custom (`nav-subitems`, `nav-subitem-marker`) y overrides con alta especificidad. El problema principal no es solo visual: falta un modelo equivalente a `SidebarGroup`, `SidebarMenu`, `SidebarMenuButton` y `Collapsible` con semantica clara.

Impacto: cuesta mantener la sidebar, las subsecciones no tienen reglas consistentes y se vuelve facil duplicar contenido.

## Auditoria por seccion

| Seccion | Estado actual | Correccion recomendada |
| --- | --- | --- |
| Insights | Sidebar duplicaba Resumen / Diario / Horario / Riesgo, que ya existen como tabs internas. | Mantener solo `Insights` en sidebar. Conservar tabs internas y rutas profundas si sincronizan tab. |
| Journal | Sidebar mostraba Cockpit / Review Queue / Entradas / AI Review, pero todas renderizaban el mismo Journal completo. | Mantener `Journal` como cockpit y mostrar subsecciones solo para Review Queue, Entradas y AI Review con contenido propio. |
| Risk Engine | Sidebar mostraba Risk Cockpit / Ruin-VaR / Monte Carlo / Exposicion, pero renderizaba el mismo Risk Engine. | Mantener `Risk Engine` como cockpit y separar Ruin / VaR, Monte Carlo y Exposicion en vistas propias. |
| Funding | Sidebar mostraba Challenges / Reglas / Payouts, pero renderizaba la misma pantalla Funding. | Mantener `Funding` como Challenges y separar Reglas y Payouts en vistas propias. |
| Strategies | Sidebar mostraba Strategy Lab / Backtest vs Real / Portafolios, pero el renderer era una sola pantalla y Portfolio tenia parent inconsistente. | Mantener `Estrategias` como Strategy Lab y separar Backtest vs Real y Portafolios con metricas propias. |
| Mobile Nav | Repite todas las subrutas en "Mas". | Congelar mobile y hacer que replique solo el modelo limpio de sidebar. |

## Roadmap de correccion

### Fase 0 - Contencion

Objetivo: impedir que la navegacion incorrecta avance a produccion aceptada.

- Congelar cualquier trabajo de responsive/mobile hasta corregir sidebar.
- Tratar la navegacion con subsecciones visibles como no aprobada.
- No tocar visuales internos de secciones ya terminadas.
- Hacer hotfix sobre main o branch dedicada con scope solo navegacion/rutas.

Criterio de salida: acuerdo de que el siguiente cambio es una limpieza de IA, no una fase mobile.

### Fase 1 - Contrato de navegacion

Objetivo: separar rutas, sidebar y tabs internas.

- Crear o consolidar un modelo tipo `SIDEBAR_NAV_CONFIG` con solo items visibles.
- Crear un modelo separado tipo `SECTION_TABS_CONFIG` para tabs internas.
- Documentar que una ruta profunda no se muestra en sidebar salvo que sea vista real.
- Corregir `strategies-portfolio` para que no tenga parent contradictorio.

Criterio de salida: existe una fuente de verdad para sidebar y otra para estados internos.

### Fase 2 - Limpieza de sidebar desktop

Objetivo: quitar duplicacion visible sin cambiar el aspecto de las secciones.

- Eliminar de `index.html` solo las subsecciones que dupliquen tabs internas o paginas padre.
- Mantener Insights sin subitems porque ya tiene tabs internas.
- Permitir subitems desktop para Strategies, Funding, Risk y Journal si cada subitem renderiza una vista propia.
- Ajustar `js/modules/navigation.js` para que el estado activo marque solo el item padre.
- Retirar logica especifica de subitems en la sidebar si queda muerta.

Criterio de salida: la sidebar desktop no muestra tabs internas ni subrutas falsas.

### Fase 3 - Rutas profundas y tabs internas

Objetivo: conservar deep links solo donde aportan valor.

- Insights: mantener `/insights/diario`, `/insights/horario`, `/insights/riesgo` porque si sincronizan tabs internas.
- Journal: decidir entre canonicalizar `/journal/review-queue`, `/journal/entradas`, `/journal/ai-review` a `/journal`, o implementar tabs internas reales dentro de Journal.
- Risk: canonicalizar subrutas a `/risk-engine` hasta que existan vistas separadas reales.
- Funding: canonicalizar subrutas a `/funding` o mapearlas a tabs internas dentro de Funding.
- Strategies: decidir si Backtest vs Real queda como bloque interno o tab real; Portafolios no debe vivir bajo Estrategias si realmente es Capital.

Criterio de salida: ninguna URL visible o accesible promete una vista que no existe.

### Fase 4 - Sidebar estilo shadcn/KMFX

Objetivo: hacer que la sidebar se comporte como un componente shadcn conceptual sin cambiar la identidad visual KMFX.

- Renombrar/ordenar clases hacia primitives claras: provider, sidebar, group, group label, menu, menu button.
- Mantener tokens KMFX existentes y radios sobrios.
- Evitar marcadores custom de subseccion si no hay subsecciones reales.
- Revisar foco, aria-current y estados colapsados.

Criterio de salida: sidebar limpia, predecible, tokenizada y sin overrides innecesarios ligados a subitems eliminados.

### Fase 5 - Mobile realineado

Objetivo: que mobile no replique la IA rota.

- Fuera de scope en esta correccion por decision de producto.
- No tocar mobile hasta iniciar la fase responsive dedicada.
- Cuando se retome mobile, validar si debe copiar desktop o usar una IA propia adaptada.

Criterio de salida: desktop corregido sin cambios mobile.

### Fase 6 - Tests y smoke

Objetivo: evitar que vuelva a pasar.

- Añadir un test o script estatico que falle si aparecen `.nav-subitems` no aprobados.
- Añadir asercion de rutas: toda pagina visible en sidebar debe tener renderer propio o contrato de tab interno.
- Smoke manual: Insights, Journal, Risk, Funding y Strategies no deben mostrar duplicacion en sidebar.
- Ejecutar checks existentes antes de push.

Criterio de salida: build/test verde y navegacion aprobada visualmente antes de retomar mobile.

## Criterios de aceptacion

- La sidebar no muestra Resumen / Diario / Hora / Control de Insights.
- Journal no muestra Cockpit / Review Queue / Entradas / AI Review en sidebar si no son vistas reales.
- Risk Engine no muestra Ruin / VaR / Monte Carlo / Exposicion en sidebar si no son vistas reales.
- Funding no muestra Reglas / Payouts en sidebar si no son vistas reales.
- Strategies no muestra Portafolios bajo Estrategias si el contenido pertenece a Capital.
- Mobile queda sin tocar en esta fase.
- Las secciones existentes conservan su visual actual.
- No se retoma responsive/mobile hasta cerrar esta correccion.
