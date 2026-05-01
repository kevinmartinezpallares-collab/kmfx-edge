# KMFX Edge Next.js Migration Blueprint

Estado: plan de arquitectura. No implementa cambios de runtime.  
Alcance: migracion futura de vanilla JS a Next.js App Router + shadcn/ui + criterio Apple HIG.  
Restriccion explicita: no tocar Stripe, Supabase ni billing en esta fase.

## Objetivo

Preparar una migracion incremental que permita construir una app Next.js en paralelo, preservar el proyecto vanilla actual y separar con claridad tres capas:

1. UI y rutas: Next.js App Router, layouts, paginas y componentes React.
2. Sistema visual: shadcn/ui como primitives reales, tokens KMFX y criterio Apple HIG para jerarquia, feedback, adaptabilidad y accesibilidad.
3. Data layer: adaptadores, selectores, calculos de riesgo, contratos de cuenta y clientes API sin dependencia de DOM.

El resultado esperado de la primera fase futura no es sustituir la app actual, sino levantar una superficie read-only viable que pueda coexistir con `index.html`, `app.js` y los modulos vanilla.

## No objetivos

- No migrar Stripe.
- No crear rutas `/api/billing/*`.
- No cambiar migraciones de Supabase.
- No modificar `js/lib/supabase.js`, `js/modules/supabase-user-config.js` ni documentos de billing.
- No reemplazar el launcher, MT5 bridge, FastAPI connector ni risk backend.
- No hacer cutover de usuarios.
- No reescribir todas las paginas en una sola fase.
- No copiar HTML string-rendered tal cual dentro de React.

## Fuentes y reglas externas usadas

- Next.js App Router: rutas por carpetas, `layout.tsx`, `page.tsx`, Server Components y Client Components.
- shadcn/ui: primitives instaladas como codigo local, composicion por `Sidebar`, `Card`, `Table`, `Tabs`, `Dialog`, `Field`, `Chart`, etc.
- Apple Human Interface Guidelines: jerarquia clara, agrupacion de informacion relacionada, feedback proporcionado a la importancia, adaptabilidad, safe areas y foco en contenido.
- Contrato interno actual: `docs/kmfx-design-system-v1.md`.

Referencias:

- https://nextjs.org/docs/app
- https://nextjs.org/docs/app/getting-started/layouts-and-pages
- https://nextjs.org/docs/app/getting-started/server-and-client-components
- https://ui.shadcn.com/docs/components/radix/sidebar
- https://ui.shadcn.com/docs/components/radix/field
- https://ui.shadcn.com/docs/components/base/chart
- https://developer.apple.com/design/human-interface-guidelines/
- https://developer.apple.com/design/human-interface-guidelines/layout
- https://developer.apple.com/design/human-interface-guidelines/feedback

## Inventario actual

### Entrypoints

| Area | Archivo actual | Rol |
| --- | --- | --- |
| Shell principal | `index.html` | Sidebar, topbar, secciones `page-*`, settings estatico, carga CSS y scripts CDN. |
| Bootstrap app | `app.js` | Crea store, inicializa auth, live snapshots, navegacion, paginas, settings y runtime. |
| Estilos | `styles.css`, `styles-v2.css` | Capa legacy + capa dominante KMFX/shadcn-inspired. |
| Design system | `docs/kmfx-design-system-v1.md` | Tokens, primitives vanilla y reglas visuales Apple/shadcn/KMFX. |
| Data mock/live | `js/data/**` | Fuentes mock, adaptadores MT5 y modelo interno. |
| API frontend | `js/modules/api-config.js` | Resuelve base URL local/produccion y endpoints de cuentas. |
| Auth/config | `js/modules/auth-session.js`, `js/modules/supabase-user-config.js`, `js/lib/supabase.js` | Sesion y preferencias. Congelar por ahora. |
| Backend connector | `kmfx_connector_api.py` | FastAPI: accounts, snapshots, MT5 sync, policy, journal. |
| Launcher | `launcher/**` | Servicio local, cola, auth y dispatch hacia backend. |
| Risk backend | `risk_*.py`, `mt5_risk_adapter.py`, `risk_orchestrator.py` | Calculo y persistencia de risk snapshots. |

### Forma de la app vanilla

La app actual funciona como SPA manual:

- `index.html` contiene todas las secciones como `<section id="page-dashboard">`, `<section id="page-risk">`, etc.
- `app.js` define `pageRenderers` y llama `renderX(root, state)` para la pagina activa.
- `store.js` guarda `accounts`, `workspace`, `ui`, `auth`, `liveAccountIds` y estado de boot.
- `navigation.js` cambia `state.ui.activePage` y alterna clases `.active`.
- Muchas paginas renderizan HTML strings y luego montan listeners o charts.
- Los charts dependen de `window.Chart` cargado por CDN.
- Settings todavia vive principalmente en `index.html` + `initSettings()` dentro de `app.js`.

Conclusion: la migracion debe partir por separar modelo/datos de render DOM. Intentar convertir todo con un codemod directo produciria componentes React fragiles.

## Rutas futuras de Next.js

Recomendacion: crear la app en paralelo, por ejemplo `apps/web-next`, usando App Router y route groups. El root de la app actual queda intacto.

```text
apps/web-next/
  src/
    app/
      layout.tsx
      globals.css
      page.tsx
      (workspace)/
        layout.tsx
        dashboard/page.tsx
        calendar/page.tsx
        trades/page.tsx
        strategies/page.tsx
        analytics/page.tsx
        analytics/daily/page.tsx
        analytics/hourly/page.tsx
        analytics/risk/page.tsx
        accounts/page.tsx
        capital/page.tsx
        funding/page.tsx
        execution/page.tsx
        risk/page.tsx
        tools/calculator/page.tsx
        journal/page.tsx
        market/page.tsx
        glossary/page.tsx
        settings/page.tsx
        settings/profile/page.tsx
        settings/preferences/page.tsx
        settings/trading/page.tsx
        settings/risk/page.tsx
        settings/connection/page.tsx
        debug/page.tsx
      api/
        README.md
```

`api/README.md` seria intencional al inicio: documenta que no se crean Route Handlers de billing ni proxies hasta que haya contrato. Si mas adelante hace falta un BFF, debe usar rutas con prefijo propio, por ejemplo `/api/kmfx/accounts/snapshot`, para no confundirlo con el FastAPI existente.

### Route mapping

| Next route | Nombre producto | Vanilla actual | Modulos que alimentan la ruta |
| --- | --- | --- | --- |
| `/` | Entrada | `dashboard` por defecto | Redirigir o renderizar alias de `/dashboard`. |
| `/dashboard` | Dashboard | `page-dashboard` | `dashboard.js`, `accounts-ui.js`, `risk-selectors.js`, `chart-system.js`, `utils.js`. |
| `/calendar` | Calendario | `page-calendar` | `calendar.js`, `chart-system.js`, `modal-system.js`, `utils.js`. |
| `/trades` | Operaciones | `page-trades` | `trades.js`, `modal-system.js`, `discipline.js` para post-trade intent, `utils.js`. |
| `/strategies` | Estrategias | `page-strategies` | `strategies.js`, `journal.js`, `modal-system.js`, `utils.js`. |
| `/analytics` | Insights resumen | `page-analytics`, tab `summary` | `analytics.js`, `chart-system.js`, `risk-alerts.js`, `admin-mode.js`. |
| `/analytics/daily` | Insights diario | tab `daily` | Misma fuente que `analytics.js`, separar selector diario. |
| `/analytics/hourly` | Insights hora | tab `hourly` | Misma fuente que `analytics.js`, separar selector horario. |
| `/analytics/risk` | Insights control | tab `risk` | `analytics.js`, `risk-alerts.js`, `risk-selectors.js`. |
| `/accounts` | Cuentas | `page-connections` | `connections.js`, `connection-wizard.js`, `accounts-live-snapshot.js`, `account-runtime.js`, `api-config.js`, `toast.js`. |
| `/capital` | Capital | `page-portfolio` | `portfolio.js`, `chart-system.js`, `utils.js`. |
| `/funding` | Funding | `page-funded` | `funded.js`, `modal-system.js`, `auth-session.js`, `utils.js`. |
| `/execution` | Ejecucion | `page-discipline` | `discipline.js`, post-trade tags localStorage, `utils.js`. |
| `/risk` | Risk Engine | `page-risk` | `risk.js`, `risk-selectors.js`, `risk-live-snapshot.js`, `risk-panel-components.js`, `admin-mode.js`. |
| `/tools/calculator` | Herramientas | `page-calculator` | `calculator.js`, `risk-engine.js`, `status-badges.js`, `utils.js`. |
| `/journal` | Diario | `page-journal` | `journal.js`, `modal-system.js`, `utils.js`. |
| `/market` | Mercado | `page-market` | `market.js`, `utils.js`. |
| `/glossary` | Glosario | `page-glossary` | `glossary.js`, `ui-primitives.js`. |
| `/settings` | Ajustes | `page-settings` | HTML en `index.html`, `initSettings()` en `app.js`, `supabase-user-config.js`, `auth-session.js`, `avatar-utils.js`. |
| `/debug` | Debug / Inspector | `page-debug` admin-only | `debug.js`, `admin-mode.js`, `status-badges.js`. |

Nota: `talent.js` existe pero no esta registrado en `pageRenderers` ni en el nav principal. Mantenerlo fuera de la primera ruta Next hasta decidir si vuelve como `/progress` o se integra en `/execution`.

## Layout y navegacion

### App shell

Destino recomendado:

```text
src/app/(workspace)/layout.tsx
src/components/app/app-sidebar.tsx
src/components/app/app-topbar.tsx
src/components/app/mobile-tab-bar.tsx
src/components/app/account-switcher.tsx
```

Mapeo:

| Vanilla | Next/shadcn |
| --- | --- |
| `.app-shell`, `.sidebar`, `.main-panel` en `index.html` | `SidebarProvider`, `Sidebar`, `SidebarInset`, `AppShell`. |
| `navigation.js` | `next/link`, `usePathname()`, nav config tipada. |
| `mobile-nav.js` | `MobileTabBar` custom con `Button`, `Sheet` o `Drawer` para "Mas". |
| `sidebar-ui.js` | `AccountSwitcher`, `UserMenu`, `DropdownMenu`, `Avatar`, `Badge`. |
| `topbar-status.js` | `AppTopbar`, `Breadcrumb`, status badges y sync readout. |
| `sidebar-vnext.js` | Sidebar shadcn controlado, `SidebarRail`, preferencia persistida. |

Regla Apple HIG: la navegacion debe mantener jerarquia reconocible entre desktop y mobile. En desktop sidebar; en mobile tab bar primaria + sheet/drawer para secciones secundarias.

## Componentes a migrar a shadcn

| Familia actual | shadcn/base futura | Notas de migracion |
| --- | --- | --- |
| `.kmfx-ui-button`, `.btn-primary`, `.btn-secondary` | `Button` | Variants KMFX sobre semantic tokens; iconos como componentes, no SVG inline repetido. |
| `.kmfx-ui-card`, `.tl-section-card`, `.widget-card` | `Card` | Usar `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`. |
| `.kmfx-ui-kpi`, `.tl-kpi-card` | `Card` + `Badge` + `Progress` | Crear `MetricCard` propio compuesto con shadcn. |
| `.kmfx-ui-badge`, `.meta-badge`, status badges | `Badge` | Variants `profit`, `loss`, `risk`, `funded`, `neutral`. |
| `.kmfx-ui-table`, `.table-wrap` | `Table` | Trades, risk exposure, accounts, strategy rankings. |
| `.tl-tab`, `.tl-tab-bar` | `Tabs` o `ToggleGroup` | `Tabs` para paginas con paneles; `ToggleGroup` para filtros cortos. |
| `modal-system.js` | `Dialog`, `AlertDialog`, `Sheet`, `Drawer` | Separar confirmaciones destructivas de paneles de detalle. |
| `toast.js` | `sonner` | Mantener mensajes de sync, copy, save y errores. |
| Settings forms | `Field`, `FieldGroup`, `Input`, `Select`, `Checkbox`, `Switch`, `Slider` | Migrar despues de congelar contrato de auth/config. |
| Account wizard | `Dialog` o `Sheet` + `Field` | No tocar endpoints al inicio. |
| Calendar cells | Custom `CalendarGrid` + `Button`, `Tooltip`, `Badge` | shadcn no reemplaza la logica de calendario. |
| Charts `chart-system.js` | shadcn `Chart` + Recharts | Mantener specs como data layer; migracion visual por chart, no global. |
| Empty/loading/error HTML | `Empty`, `Skeleton`, `Alert`, `Progress` | Estados explicitos, con copy de siguiente paso. |
| Auth overlay | `Dialog`/custom auth shell | Supabase auth queda como dependencia congelada. |

## Componentes custom que deben existir encima de shadcn

shadcn no debe convertirse en la arquitectura de producto. Crear componentes de dominio:

- `PageHeader`
- `MetricCard`
- `DecisionLayer`
- `PnlText`
- `RiskStatusBadge`
- `AuthorityNotice`
- `AccountIdentity`
- `AccountSwitcher`
- `ChartPanel`
- `DataFreshnessNotice`
- `AdminTracePanel`
- `PostTradeReviewDialog`
- `FundingPhaseCard`
- `RiskLimitBar`

Estos componentes usan shadcn por dentro, pero exponen lenguaje KMFX.

## Data layer que debe quedarse fuera de UI

Mover o convertir a TypeScript puro antes de reescribir paginas grandes.

### Capa domain/selectors

| Fuente actual | Destino recomendado | Mantener como |
| --- | --- | --- |
| `utils.js` | `src/lib/domain/account-selectors.ts`, `src/lib/formatters.ts`, `src/lib/chart-geometry.ts` | Selectores y formatters puros. |
| `risk-engine.js` | `src/features/risk/domain/risk-engine.ts` | Calculo frontend puro. |
| `risk-alerts.js` | `src/features/risk/domain/risk-alerts.ts` | Selectores/derivaciones puras. |
| `risk-selectors.js` | `src/features/risk/domain/risk-selectors.ts` | Selectores puros sobre `WorkspaceState`. |
| `status-badges.js` | `src/lib/domain/status-meta.ts` | Metadata de estado, no JSX. |
| `kmfx-integrity-check.js` | `src/lib/domain/integrity-check.ts` | Validacion/diagnostico puro. |
| `backend-model.js` | `src/lib/contracts/backend-model.ts` | Contratos de persistencia. No activar writes nuevos. |

### Capa data sources/adapters

| Fuente actual | Destino recomendado | Nota |
| --- | --- | --- |
| `js/data/sources/mock-workspace-source.js` | `src/lib/data/mock-workspace.ts` | Seed demo typed. |
| `js/data/sources/mock-accounts-source.js` | `src/lib/data/mock-accounts.ts` | Seed account typed. |
| `js/data/adapters/internal-model-adapter.js` | `src/lib/data/adapters/internal-model-adapter.ts` | Normalizacion compartida. |
| `js/data/adapters/mock-account-adapter.js` | `src/lib/data/adapters/mock-account-adapter.ts` | Demo/mock. |
| `js/data/adapters/mt5-account-adapter.js` | `src/lib/data/adapters/mt5-account-adapter.ts` | Critico para live snapshots; migrar con tests. |
| `accounts-live-snapshot.js` | `src/lib/api/accounts-live-snapshot-client.ts` | Client-side fetch/polling, auth headers, isolation. |
| `api-config.js` | `src/lib/api/kmfx-api-config.ts` | Usar env vars Next, sin hardcodear en componentes. |
| `account-runtime.js` | `src/features/accounts/domain/account-runtime.ts` | Runtime client, compliance derivada. |

### Store futuro

La primera fase puede usar una store client-only equivalente, pero tipada:

```text
src/lib/store/workspace-store.ts
src/lib/store/preferences-store.ts
```

Reglas:

- Server Components por defecto para layouts simples y shell estatico.
- Client Components solo donde haya `useState`, `useEffect`, `localStorage`, `window`, polling, charts o eventos.
- Mantener `localStorage` detras de helpers seguros.
- No inicializar Supabase, SDKs o clientes con env en module scope si pasan por server/runtime Next.
- No mezclar datos server con estado UI como `activePage`; la URL debe ser la fuente para pagina activa.

## Logica que NO debe migrar como componente

- `buildDashboardModel`, `resolveAccountDataAuthority`, `selectCurrentModel`.
- Adaptadores MT5/mock/internal.
- Risk calculations y risk selectors.
- API URL resolution y auth header construction.
- Account ownership/isolation logic.
- Persistence de preferencias.
- Chart specs: deben ser datos (`kind`, `points`, `tone`, `axis`) antes de JSX.
- Backend persistence mapping.

## Orden recomendado de migracion

### Fase 0: Preparacion documental y contratos

Estado actual: este blueprint.

Entregables futuros:

- Inventario de tipos `Account`, `WorkspaceState`, `DashboardModel`, `RiskSnapshot`.
- Snapshot JSON real y mock fijados como fixtures.
- Lista de componentes shadcn inicial.
- Decision sobre carpeta paralela: recomendado `apps/web-next`.

### Fase 1: Sidecar Next sin romper vanilla

Objetivo: levantar una app Next aislada con shell, rutas y mock data.

Incluye:

- Crear `apps/web-next`.
- Instalar Next, TypeScript, Tailwind, shadcn, lucide y Recharts.
- Copiar assets necesarios desde `assets/logos`.
- Portar tokens semanticos de `styles-v2.css` a `globals.css`.
- Crear `AppShell`, `Sidebar`, `Topbar`, mobile nav y route config.
- Renderizar `/dashboard`, `/calendar`, `/trades`, `/analytics`, `/risk` como skeleton/read-only con datos mock typed.

No incluye:

- Live MT5.
- Supabase writes.
- Billing.
- Stripe.
- Cutover.

Criterio de exito:

- `index.html` actual sigue funcionando igual.
- Next corre en otro puerto/carpeta.
- Las rutas principales existen.
- La navegacion de Next no depende de `state.ui.activePage`.
- El shell usa shadcn primitives reales.
- No hay import desde modulos vanilla que escriban DOM.

### Fase 2: Data layer typed

Objetivo: extraer logica sin UI.

Orden:

1. Tipos y fixtures.
2. Adaptadores mock/internal.
3. `mt5-account-adapter`.
4. Account selectors y formatters.
5. Risk selectors y risk alerts.
6. Chart specs como objetos typed.
7. Tests unitarios para adaptadores y selectores.

Esta fase reduce riesgo antes de tocar paginas densas.

### Fase 3: Shell y navegacion completa

Migrar:

- Sidebar desktop.
- Mobile nav.
- Topbar/status.
- Account switcher.
- User menu.
- Admin gating visual.
- Loading/error boundaries por segmento.

shadcn base:

- `Sidebar`
- `Button`
- `DropdownMenu`
- `Avatar`
- `Badge`
- `Separator`
- `Tooltip`
- `Sheet` o `Drawer`
- `Skeleton`

### Fase 4: Paginas core read-only

Orden recomendado:

1. `/dashboard`: alto valor, usa muchos selectores, pero puede empezar read-only.
2. `/accounts`: necesario para leer estado live despues, pero sin mutaciones admin al inicio.
3. `/risk`: depende de risk selectors y panel components.
4. `/trades`: tabla + post-trade intent, primero sin modal avanzado.
5. `/calendar`: grid y charts.
6. `/analytics`: tabs/rutas y charts.

### Fase 5: Paginas operativas

Orden recomendado:

1. `/capital`
2. `/funding`
3. `/execution`
4. `/tools/calculator`
5. `/journal`
6. `/strategies`
7. `/settings`
8. `/debug`

Razon: varias tienen formularios, localStorage, modales y reglas de negocio mas acopladas.

### Fase 6: Live data bridge

Solo despues de tener data layer typed.

Incluye:

- Cliente para `/api/accounts/snapshot`.
- Cliente para `/accounts`.
- Auth headers compatibles con lo existente.
- Polling y freshness state.
- Isolation de cuentas live vs mock.
- Fallback a mock cuando no hay auth/live access.

No incluir billing.

### Fase 7: Cutover controlado

Opciones:

- Mantener vanilla como fallback publico y Next como beta.
- Servir Next en subruta o subdominio temporal.
- Cuando haya paridad, mover entrada principal.

Antes del cutover:

- Auditoria visual desktop/mobile.
- Tests de selectores y adaptadores.
- Verificacion de auth y live snapshot.
- Verificacion de no regresion del launcher.
- Plan de rollback.

## Riesgos principales

| Riesgo | Impacto | Mitigacion |
| --- | --- | --- |
| HTML string rendering mezclado con logica | Alto | Extraer data/selectors primero; reescribir React por dominio, no por copiar strings. |
| `window`, `document`, `localStorage` en modulos compartidos | Alto | Aislar en Client Components y helpers client-only. |
| Chart.js CDN + plugins custom | Medio/alto | Migrar chart por chart; mantener specs, cambiar renderer despues. |
| CSS global enorme | Alto | Portar tokens, no reglas globales legacy; crear componentes con shadcn y CSS scoped. |
| Auth/Supabase acoplado a UI settings | Alto | Congelar; solo envolver despues con cliente compatible. |
| Live account isolation | Alto | Mantener tests/fixtures para usuario anonimo, usuario normal y admin. |
| API base local/produccion | Medio | Centralizar env y no hardcodear en componentes. |
| Admin mode | Medio | Gating en ruta y UI; evitar mostrar debug a usuarios normales. |
| Billing docs/migrations cercanos | Medio | Excluir explicitamente `supabase/migrations/*billing*`, docs billing y rutas billing. |
| App Router Server/Client boundaries | Medio | Server por defecto; client solo en interactividad. No SDKs en module scope server. |
| Mobile HIG/safe areas | Medio | Test mobile temprano, safe-area padding y tab bar estable. |
| Cutover prematuro | Alto | Sidecar hasta tener paridad de rutas y data contracts. |

## Dependencias previas a implementacion

- Confirmar carpeta sidecar: recomendado `apps/web-next`.
- Confirmar package manager.
- Definir version base de Next/shadcn en el momento de scaffold.
- Decidir si `analytics` mantiene tabs por URL o query param. Recomendado URL por deep-linking.
- Crear fixtures de snapshot live y mock.
- Crear una tabla de tipos principales.
- Elegir estrategia de charts: Recharts/shadcn como destino, Chart.js solo si hay bloqueo visual.
- Definir si se hara BFF Next o consumo directo del FastAPI existente. Recomendado consumo directo al inicio.

## Primera fase viable sin romper el proyecto actual

La primera fase viable debe ser pequena y aislada:

1. Crear sidecar Next en `apps/web-next`.
2. Copiar solo assets necesarios.
3. Portar tokens KMFX esenciales.
4. Instalar shadcn primitives minimas:
   - `button`
   - `card`
   - `badge`
   - `sidebar`
   - `dropdown-menu`
   - `avatar`
   - `separator`
   - `tabs`
   - `table`
   - `skeleton`
   - `alert`
   - `sheet`
   - `tooltip`
5. Crear route config y app shell.
6. Crear data mock typed local.
7. Renderizar Dashboard read-only con 3-5 componentes:
   - account identity
   - KPI strip
   - risk status card
   - equity/chart placeholder
   - freshness/authority notice
8. Dejar vanilla intacto.

Gate de cierre:

- La app vanilla sigue abriendo desde `index.html`.
- No hay cambios en `supabase/`, `docs/billing-*`, `docs/stripe-*` ni `js/lib/supabase.js`.
- Next no necesita credenciales para renderizar mock.
- El dashboard Next no escribe datos.
- La navegacion Next usa rutas reales.
- El codigo nuevo no importa renderers vanilla que hacen `root.innerHTML`.

## Reglas visuales para la migracion

- Preservar el metodo KMFX: Estado, Causa, Evidencia, Accion.
- Usar color solo con semantica: profit, loss, risk, drawdown, equity, funded.
- Evitar cards sin decision.
- Dar feedback proporcional: sync status pasivo; errores y acciones destructivas con `Alert`/`AlertDialog`.
- Mantener foco visible y navegacion por teclado.
- Mobile: respetar safe areas y evitar controles criticos solo abajo si quedan ocultos por browser chrome.
- Evitar layouts de marketing; KMFX es herramienta operativa.
- Usar `Card` para unidades repetibles, no para envolver secciones enteras dentro de otras cards.
- Preferir tablas y listas densas para trading sobre grids decorativos.

## Reglas tecnicas para la migracion

- App Router, no Pages Router.
- URL como fuente de pagina activa.
- Server Components por defecto; Client Components en charts, forms, polling, localStorage, dialogs y nav interactiva.
- shadcn components como codigo local; no crear clones manuales si existe primitive.
- Tokens semanticos en `globals.css`.
- No usar `space-x-*` / `space-y-*` en nuevas clases shadcn; usar `gap-*`.
- Forms con `FieldGroup`/`Field`.
- Dialog/Sheet/Drawer siempre con title accesible.
- Charts como componentes typed y no dependientes de `window.Chart` a largo plazo.
- SDKs y clientes externos con lazy init cuando entren en Next server/runtime.
- Tests unitarios para cualquier selector/adaptador migrado.

## Archivos que no deben tocarse en fase 1

- `supabase/migrations/**`
- `docs/billing-subscription-blueprint.md`
- `docs/billing-implementation-checklist.md`
- `docs/billing-env-vars.md`
- `docs/stripe-product-catalog.md`
- `js/lib/supabase.js`
- `js/modules/supabase-user-config.js`
- `kmfx_connector_api.py` salvo contrato API explicito posterior
- `launcher/**` salvo contrato launcher explicito posterior

## Decision recomendada

La migracion debe empezar como sidecar Next + shadcn, no como reemplazo in-place. El primer slice debe ser `AppShell + Dashboard read-only + mock typed data`, porque valida rutas, tokens, shadcn, Apple-like hierarchy y data boundaries sin tocar billing ni live sync.

Despues de esa prueba, migrar el data layer y las paginas por dominio. El proyecto actual puede seguir funcionando mientras Next gana paridad.
