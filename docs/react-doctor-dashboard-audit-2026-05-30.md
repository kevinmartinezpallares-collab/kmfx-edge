# React Doctor dashboard audit - 2026-05-30

## Resultado

- App: `apps/web-next`
- Ruta verificada: `http://localhost:3000/dashboard`
- React Doctor inicial: `62 / 100`, `481 issues`
- React Doctor final: `97 / 100`, `110 issues`
- Estado final: `Great`
- Captura antes: `/tmp/kmfx-dashboard-before.png`
- Captura despues: `/tmp/kmfx-dashboard-react-doctor-149-wait.png`
- Captura antes de este pase: `/tmp/kmfx-dashboard-before-bar-chart-fix.png`
- Captura dashboard despues de este pase: `/tmp/kmfx-dashboard-after-account-route-fix.png`
- Captura dashboard despues de extraer logo: `/tmp/kmfx-dashboard-after-logo-extraction.png`
- Captura dashboard despues de extraer variantes UI: `/tmp/kmfx-dashboard-after-ui-variants-extraction.png`
- Captura dashboard despues de optimizar tooltip/error: `/tmp/kmfx-dashboard-after-tooltip-field-render-pass.png`
- Captura trades despues de reducers: `/tmp/kmfx-trades-after-ui-reducer-pass.png`
- Captura calendar despues de reducer: `/tmp/kmfx-calendar-after-ui-reducer-pass.png`
- Captura settings despues de reducer: `/tmp/kmfx-settings-after-ui-reducer-pass.png`
- Captura capital despues de reducer: `/tmp/kmfx-capital-after-ui-reducer-pass.png`
- Captura cuentas despues: `/tmp/kmfx-accounts-react-doctor-149.png`
- Captura cuentas despues de este pase: `/tmp/kmfx-accounts-after-rename-reducer.png`
- Captura cuentas despues de reducer UI: `/tmp/kmfx-accounts-after-ui-reducer-pass.png`
- Captura cuentas despues de mover comprobacion de plan a evento: `/tmp/kmfx-accounts-after-access-event-pass.png`
- Captura subscription despues de precargar plan desde server: `/tmp/kmfx-subscription-after-server-billing-plan.png`
- Captura settings/subscription despues de precargar plan desde server: `/tmp/kmfx-settings-subscription-after-server-billing-plan.png`
- Captura dashboard despues de mover billing gate al proxy: `/tmp/kmfx-dashboard-after-proxy-billing-gate.png`
- Captura analytics despues de diferir Recharts: `/tmp/kmfx-analytics-after-dynamic-cumulative-chart.png`
- Captura analytics detalle despues de diferir Recharts: `/tmp/kmfx-analytics-after-dynamic-cumulative-chart-detail.png`
- Captura analytics antes de diferir `ui/chart`: `/tmp/kmfx-analytics-before-ui-chart-dynamic.png`
- Captura analytics despues de diferir `ui/chart`: `/tmp/kmfx-analytics-after-ui-chart-dynamic.png`
- Captura dashboard antes de diferir `ui/chart`: `/tmp/kmfx-dashboard-before-ui-chart-dynamic.png`
- Captura dashboard despues de diferir `ui/chart`: `/tmp/kmfx-dashboard-after-ui-chart-dynamic.png`
- Captura dashboard con cuenta desde query tras quitar `useSearchParams` del shell: `/tmp/kmfx-dashboard-after-workspace-search-store.png`
- Captura dashboard tras cambiar cuenta desde el selector: `/tmp/kmfx-dashboard-after-workspace-account-switch.png`
- Captura login despues de leer `next` en server: `/tmp/kmfx-login-after-server-next-path.png`
- Captura cuentas antes de corregir medicion del carrusel: `/tmp/kmfx-accounts-after-scroll-width-store.png`
- Captura cuentas despues de corregir medicion del carrusel: `/tmp/kmfx-accounts-after-carousel-width-fix.png`
- Captura cuentas despues de usar flecha del carrusel: `/tmp/kmfx-accounts-after-carousel-arrow.png`
- Captura cuentas despues de estabilizar `AnimatedGradient`: `/tmp/kmfx-accounts-after-animated-gradient-ref.png`
- Captura trades despues de estabilizar animacion de barras: `/tmp/kmfx-trades-after-bar-animation-state.png`
- Captura login despues del cierre seguro: `/tmp/kmfx-login-after-closeout-safe-fixes.png`
- Captura analytics despues del cierre seguro: `/tmp/kmfx-analytics-after-closeout-safe-fixes.png`
- Captura trades despues del cierre seguro: `/tmp/kmfx-trades-after-closeout-safe-fixes.png`
- Captura calculadora despues: `/tmp/kmfx-calculator-react-doctor-149.png`

## Cambios aplicados sin intencion visual

- Se corrigieron botones sin `type`, labels/aria-labels y roles accesibles donde era directo y de bajo riesgo.
- Se estabilizaron valores de contexto y handlers para reducir renders y resuscripciones.
- Se cambio el cierre de sesion de `GET` a `POST`, manteniendo el flujo visual desde el menu.
- Se agrego metadata a paginas de Next.js para mejorar SEO/documentacion de rutas.
- Se sustituyeron mutaciones de arrays con `.sort()` por `.toSorted()` donde era seguro.
- Se aplicaron shorthands de Tailwind equivalentes en clases de tamano/padding.
- Se paralelizo trabajo independiente en el endpoint de restauracion de clave.
- Se movieron formateadores `Intl`, paletas, mapas y listas literales a scope de modulo o caches estables.
- Se combinaron iteraciones de datos (`filter().map()`, `map().filter()`) en selectors y charts donde era equivalente.
- Se evito un reset de estado en efecto dentro del slider de cuentas usando remount por `key` al cambiar de cuenta.
- Se migro el runtime de animacion a `motion/react` con `LazyMotion` global y `m as motion`, manteniendo los mismos props JSX de animacion.
- Se elimino la dependencia directa de `framer-motion`; queda `motion` como runtime declarado.
- Se eliminaron dependencias directas no importadas: `@visx/gradient`, `@visx/pattern` y `d3-array`.
- Se actualizaron hooks/contextos hacia APIs de React 19 (`React.use`, `useSyncExternalStore`) donde era directo y sin cambio visual.
- Se ajustaron keys, semantica de breadcrumb/fallback WebGL y un listener de shortcuts sin cambiar layout.
- Se retiro la dependencia directa `next-themes`, ya que el tema lo resuelve `components/app/theme-provider`.
- Se movio `createNotchPath` fuera del render del gauge y se retiraron efectos de montaje en portales de charts usando `useClientReady`.
- Se reemplazo `dangerouslySetInnerHTML` en chart styles por contenido de `<style>` generado como texto React.
- Se estabilizaron keys internas de barras, slices y slider thumbs para evitar depender directamente del indice.
- Se extrajo la navegacion del sidebar a un componente dedicado, sin cambiar markup visible.
- Se agrupo el estado del conversor de divisas y del calculador de lotaje con `useReducer`, manteniendo los mismos controles y textos visibles.
- Se redujo estado React innecesario en Turnstile guardando el token de captcha en ref y limpiando listeners/widget ids de forma mas acotada.
- Se eliminaron exports muertos confirmados por busqueda global en logo, badge y animacion de charts, sin borrar componentes usados.
- Se elimino un ajuste de estado sincronico en effect en la curva del panel, derivando la ventana efectiva durante render.
- Se agrego etiqueta accesible al boton real de cerrar sesion renderizado dentro del menu.
- Se mantuvo el cache de formateadores de moneda y se retiro el `new` redundante en `Intl.NumberFormat`.
- Se movieron constantes de theming/formato de charts a modulos no-React (`chart-theme`, `pie-theme`, `chart-stat-flow-format`) para mejorar Fast Refresh sin cambiar valores visuales.
- Se paralelizo el parseo de parametros/body en `PATCH /api/kmfx/accounts/[accountId]`, manteniendo la misma respuesta y contrato.
- Se agrupo el estado del dialogo de renombrado de cuentas con `useReducer`, manteniendo el mismo modal y controles visibles.
- Se extrajeron `LogoMark` y `LogoWordmark` a archivos de componente dedicados, manteniendo la API desde `@/components/logo` y las mismas clases/asset visuales.
- Se movieron `buttonVariants`, `toggleVariants` y `tabsListVariants` a modulos no-React para mejorar Fast Refresh sin cambiar clases ni componentes visibles.
- Se elimino trabajo de render innecesario en tooltip de charts y errores de field, manteniendo el mismo JSX resultante cuando hay contenido visible.
- Se acoto la limpieza de Turnstile para no tocar el ref del widget durante cleanup.
- Se retiro `autoFocus` de la command palette para eliminar el foco automatico al abrirla.
- Se asociaron labels de filtros en Trades con ids estables de sus controles.
- Se agruparon los flags de visibilidad de `SegmentLabel` en un objeto `display`, manteniendo el mismo render de FunnelChart.
- Se agrupo el estado local de `AuthPage` con `useReducer`, manteniendo textos, inputs y flujo de acceso.
- Se agrupo el estado local de filtros, paginacion, rango de grafico y seleccion en Trades con `useReducer`, manteniendo el mismo comportamiento de filtros y tabla.
- Se agrupo el estado local de vista/valor/mes/dia seleccionado en Calendar con `useReducer`, manteniendo los mismos controles y seleccion visible.
- Se agrupo el estado local de perfil/drafts/dialogos/status en Settings con `useReducer`, sin tocar el flujo de billing/subscription.
- Se agrupo el estado local de periodo/comparativa/unidad/mes/dia en Capital con `useReducer`, manteniendo los mismos toggles y calendario.
- Se agrupo el estado local del modal de cuentas, pasos, mensajes de enlace, comprobacion de plan y estado de copiado con `useReducer`, manteniendo las llamadas API y redirects en el mismo flujo.
- Se movio la comprobacion de plan de `AccountsReferenceSection` desde `useEffect` al evento de apertura del modal, manteniendo abort al cerrar/desmontar y el mismo redirect a login cuando la API responde `401`.
- Se precargo el plan de billing para `SubscriptionReferenceSection` desde paginas server (`/subscription` y `/settings/subscription`), eliminando el fetch inicial en effect y conservando el fallback cuando el backend no responde.
- Se movio el gating global de billing del `WorkspaceShell` cliente al `proxy`, evitando fetch/redirect post-render en el dashboard y manteniendo navegacion permisiva si billing status no esta disponible.
- Se difirio la carga de `recharts` en Analytics: `reference-sections.tsx` ya no importa la libreria pesada al cargar el modulo y `AnalyticsCumulativeChart` la carga con `React.lazy` solo cuando el chart se monta. En `/analytics` no hay cambio visual esperado porque `PerformanceReferenceSection` no esta montada en esa ruta.
- Se difirio tambien la carga de `recharts` en `src/components/ui/chart.tsx`, manteniendo la API `ChartContainer`, `ChartTooltip` y `ChartLegend` con wrappers lazy y sin cambiar clases ni estilos visibles.
- Se cambio `ReactiveBackgroundGrid` de `div role="button"` a `<button type="button">` con estilos nativos neutralizados; el componente sigue sin estar montado en rutas actuales.
- Se elimino `useSearchParams` de `AuthPage`: `/login` resuelve `next` en la pagina server, lo sanea como ruta interna y lo pasa como prop al formulario.
- Se elimino `useSearchParams` de `WorkspaceShell`, `WorkspaceSidebar` y `AccountSwitcher` mediante una suscripcion local a `window.location.search` con `useSyncExternalStore`; la notificacion de cambios de `history` se difiere a microtask para evitar actualizaciones durante fases internas de React.
- Se corrigio el selector de cuenta del header usando `onClick` en los items de Base UI; antes `onSelect` no actualizaba la URL al escoger otra cuenta.
- Se reemplazo la medicion de ancho del carrusel de cuentas basada en `setState` dentro de `useEffect` por una suscripcion con `useSyncExternalStore`, `ResizeObserver` y `MutationObserver`.
- Cambio visual/funcional menor en `/accounts`: el viewport del carrusel ahora usa `w-full`, lo que permite que las flechas desplacen tarjetas en vez de quedar sin movimiento.
- Se alineo el working tree local con `origin/codex/next-beta-readiness`: quedan incorporados los fixes moviles de sidebar, Trades y mapa diario de Analytics que ya estaban en la beta remota.
- Se estabilizo `AnimatedGradient` para no reiniciar WebGL ante cambios de config: el loop lee los parametros desde un ref actualizado en efecto, manteniendo el mismo fallback si WebGL falla.
- Se cambio el estado de replay de `BarChart` a una clave de animacion ajustada durante render y un unico timer de finalizacion, manteniendo el replay cuando cambian `animationDuration` o `revealSignature`.
- Se separaron subcomponentes de `InputGroup` y `Resizable` en archivos dedicados, manteniendo las mismas clases y exportaciones publicas desde sus modulos originales.
- Se retiraron `role="group"` de wrappers visuales sin nombre accesible en `Field`/`InputGroup` y se cambio el gauge CSS de Analytics a `<figure aria-label>` con `m-0`.
- Se renombro el writer del token Turnstile de `setCaptchaToken` a `writeCaptchaToken`, aclarando que no dispara render y eliminando el falso positivo de cascada de estado.
- Se eliminaron copias accidentales untracked con sufijo ` 2` que eran identicas a sus originales y contaminaban React Doctor como archivos no usados.
- Cambio visible menor: `Calculando tipo de cambio...` ahora usa el caracter tipografico `…`.
- Cambio visual de microanimacion: entradas con `scale: 0` pasan a iniciar desde `scale: 0.95` con opacidad, para evitar apariciones desde un punto.

## Verificacion

- `npm run lint`: OK
- `npm run typecheck`: OK
- `npm run build`: OK
- `npm run test -- action-safety-contract`: OK
- `npm run test -- funding review risk liveline trades`: OK, `8` archivos y `33` tests
- `npx react-doctor@latest`: `97 / 100`, `110 issues`
- `npx react-doctor@latest --verbose --diff`: `99 / 100`, `16 issues`
- Browser/Playwright local: `http://localhost:3000/dashboard` carga con titulo `KMFX Edge`, contenido de `Panel` visible y sin error de aplicacion.
- Playwright local: captura dashboard posterior tomada tras esperar `h1`, SVG de liveline y `6000ms` extra para evitar capturas borrosas o a medio cargar.
- Playwright local: captura posterior a la extraccion del logo tomada con `Panel` visible, SVG de liveline visible y `6000ms` extra; sin error de aplicacion.
- Playwright local: captura posterior a la extraccion de variantes UI tomada con `Panel` visible, SVG de liveline visible y `6000ms` extra; sin error de aplicacion.
- Playwright local: captura posterior a la optimizacion de tooltip/error tomada con `Panel` visible, SVG de liveline visible y `6000ms` extra; sin error de aplicacion.
- Playwright local: `http://localhost:3000/trades` carga con titulo `Trades / KMFX Edge`, contenido de `Trades` visible, ids de filtros presentes y sin error de aplicacion.
- Playwright local: `http://localhost:3000/calendar` carga con contenido de Calendario visible, sin error de aplicacion y captura posterior tomada tras espera extra.
- Playwright local: `http://localhost:3000/settings` carga con contenido de Settings visible, sin error de aplicacion y captura posterior tomada tras espera extra.
- Playwright local: `http://localhost:3000/capital` carga con heading `Portfolio`, sin skeletons/`aria-busy` tras `5000ms` y captura posterior tomada.
- Browser/Playwright local: `http://localhost:3000/accounts` carga con titulo `Cuentas / KMFX Edge`, contenido de `Cuentas` visible y sin error de aplicacion.
- Playwright local: el dialogo de `Renombrar cuenta` abre correctamente desde acciones de cuenta y conserva el valor visible inicial.
- Playwright local: `http://localhost:3000/accounts` abre el dialogo `Añadir cuenta`, muestra el paso `Elige cómo conectar`, no deja skeletons tras `5000ms` y captura posterior tomada.
- Playwright local: despues de mover la comprobacion de plan al evento de apertura, `http://localhost:3000/accounts` sigue abriendo `Añadir cuenta`, muestra el paso `Elige cómo conectar`, mensaje de plan y `0` loading markers tras `5000ms`.
- Playwright local: `http://localhost:3000/subscription` y `http://localhost:3000/settings/subscription` cargan con contenido de suscripcion/plan visible y `0` loading markers tras `5000ms`.
- Playwright local: `http://localhost:3000/dashboard` sigue cargando el panel, no redirige cuando billing status local no esta disponible y queda con `0` loading markers tras `6000ms`.
- Browser in-app: `http://localhost:3000/analytics` carga con titulo `Insights / KMFX Edge`, contenido visible tras `7500ms` y sin logs `error`/`warn`. Se reciclo un `next-server` local en `3000` que estaba escuchando pero no respondia antes de tomar la captura.
- Browser in-app: se verifico que `PerformanceReferenceSection`/`Rendimiento acumulado` no esta montado en `/analytics`; por eso el cambio de Recharts no debe modificar el aspecto actual de esa ruta.
- Browser in-app: intento de captura posterior para `ui/chart` bloqueado por `ERR_BLOCKED_BY_CLIENT`; se uso Playwright local como fallback.
- Playwright local: `http://localhost:3000/analytics` y `http://localhost:3000/dashboard` cargan tras `8000ms`, mantienen contenido visible y solo muestran warnings preexistentes de preload de fuentes.
- Playwright local: `http://localhost:3000/login?next=/analytics` carga tras `8000ms`; el formulario de acceso se mantiene visualmente correcto y conserva el parametro `next` saneado desde server.
- Playwright local: `http://localhost:3000/dashboard?account=mt5-beta-20000002` carga FTMO desde query, y al elegir `Darwinex Zero 100K` desde el selector cambia a `?account=mt5-alpha-10000001` sin errores de aplicacion; solo quedan warnings preexistentes de preload de fuentes.
- Browser in-app: `http://localhost:3000/accounts` carga con titulo `Cuentas / KMFX Edge`, contenido visible tras `8000ms`, sin logs `error`/`warn`, y la flecha `Ver cuentas siguientes` desplaza el carrusel hasta las ultimas cuentas.
- Browser in-app: tras estabilizar `AnimatedGradient` y `BarChart`, `http://localhost:3000/accounts` y `http://localhost:3000/trades` cargan tras `8500ms`, sin overlays ni logs `error`/`warn`.
- Browser in-app: tras separar componentes base y ajustar semantica, `http://localhost:3000/login?next=/dashboard`, `/analytics` y `/trades` cargan tras `8500ms`, sin overlays ni logs `error`/`warn`.
- Browser/Playwright local: `http://localhost:3000/tools/calculator` carga con titulo `KMFX Edge`, contenido de `Calculadora / Lotaje` visible, sin error de aplicacion, y el input `Risk %` acepta `0.50`.

La suite completa de tests sigue bloqueada por una regla preexistente de migracion que detecta `KMFXConnector` en `src/components/trading/accounts/reference-section.tsx`. Ese archivo ya estaba modificado fuera de este pase, asi que no se revirtio ni se mezclo con el trabajo de React Doctor.

## Recomendaciones pendientes

- `deslop/unused-file` y `deslop/unused-export`: no borrar todavia. Hay componentes y exports que pueden pertenecer al roadmap del dashboard o a migraciones en curso.
- `react-doctor/use-lazy-motion`: aplicado. La familia de avisos desaparecio.
- `no-adjust-state-on-prop-change`: aplicado en el slider de cuentas, `AnimatedGradient` y `BarChart`; ya no aparece en el diff de React Doctor.
- `bar-chart`: el primer intento rapido se revirtio porque bajo React Doctor a `87 / 100`; el pase final usa estado de replay con clave y mantiene QA visual en `/trades`.
- `no-multi-comp`: aplicado en `logo.tsx`, `input-group` y `resizable`; ya no aparece en el diff de React Doctor.
- `only-export-components`: aplicado en `button`, `tabs` y `toggle`; quedan las variantes en modulos dedicados.
- `rerender-memo-before-early-return`: aplicado en `ui/chart` y `ui/field`.
- `exhaustive-deps`: aplicado en `auth-page` quitando el toque del ref durante cleanup.
- `no-autofocus`: aplicado en `command-palette`.
- `no-many-boolean-props`: aplicado en `funnel-chart` agrupando flags internos en `display`.
- `label-has-associated-control`: se corrigieron labels concretos de filtros en Trades; React Doctor mantiene un aviso en el componente base `label.tsx`, tratado como pendiente de revision/manual porque el componente generico puede usarse correctamente con `htmlFor`.
- `prefer-useReducer`: aplicado en `auth-page`, `trades/reference-section`, `calendar/reference-section`, `settings/reference-sections`, `capital/reference-section` y `accounts/reference-section`.
- `nextjs-no-use-search-params-without-suspense`: aplicado en `auth-page` y `workspace-shell`, leyendo `next` desde `/login` server y observando `location.search` en el shell cliente.
- `prefer-tag-over-role`: aplicado en wrappers genericos y gauge CSS; ya no aparece en el diff de React Doctor.
- `no-cascading-set-state`: el aviso de Turnstile se elimino renombrando el writer de token, que solo actualiza un ref y no es setState.
- `accounts/reference-section`: aplicado `prefer-useReducer`, y retirada la comprobacion de billing desde `useEffect`; sus avisos de `no-fetch-in-effect` y `nextjs-no-client-side-redirect` ya no aparecen en el diff de React Doctor.
- `settings/reference-sections`: eliminado el `fetch` inicial en effect para leer billing status dentro de `SubscriptionReferenceSection`; el plan inicial llega desde server y los eventos de Checkout/Portal siguen en cliente.
- `workspace-shell`: eliminado el fetch/redirect global desde effect. El `proxy` comprueba billing antes de pintar rutas workspace, excluye `/subscription`, `/settings/subscription` y `?demo=1`, y no bloquea si billing status esta temporalmente no disponible.
- `prefer-dynamic-import`: aplicado para los imports directos de `recharts` dentro de Analytics y `src/components/ui/chart.tsx`; ya no aparece en el diff de React Doctor.
- `no-danger` en `src/components/ui/chart.tsx`: aplicado sin cambiar el CSS resultante.
- `js-hoist-intl`: aplicado. El formatter de moneda mantiene cache por divisa/decimales.
- `deslop/unused-dependency`: las dependencias directas detectadas en este pase ya se retiraron; revisar nuevas alertas solo si React Doctor detecta imports reales o dependencias directas futuras.

## Observacion adicional

Durante la verificacion local, `/api/kmfx/billing/status` devolvio `500`. Por el codigo actual, en desarrollo la API backend cae por defecto en `http://127.0.0.1:8000`; si ese backend no esta levantado o no hay sesion/configuracion valida, el fallo es esperable. Recomendacion: distinguir error de backend no disponible y devolver un estado controlado para que la UI no dependa de un `500` en local.
