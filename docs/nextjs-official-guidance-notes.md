# KMFX Next.js Official Guidance Notes

Estado: notas de documentacion oficial  
Ultima revision: 2026-05-14  
Alcance: resumen operativo de la documentacion oficial relevante para la migracion de KMFX a Next.js App Router.

## Proposito

Este documento no sustituye la documentacion oficial.

La condensa para nuestro caso concreto:

- una SPA legacy/manual
- migracion incremental
- nueva app paralela en App Router
- fuerte uso de shell, data-heavy routes y componentes interactivos

## Fuentes oficiales revisadas

Next.js:

- [Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages)
- [Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)
- [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [How to build single-page applications with Next.js](https://nextjs.org/docs/app/guides/single-page-applications)
- [Caching](https://nextjs.org/docs/app/getting-started/caching)
- [How to upgrade to version 16](https://nextjs.org/docs/app/guides/upgrading/version-16)

shadcn/ui:

- [Next.js installation](https://ui.shadcn.com/docs/installation/next)
- [Theming](https://ui.shadcn.com/docs/theming)
- [Sidebar](https://ui.shadcn.com/docs/components/radix/sidebar)
- [Dark Mode](https://ui.shadcn.com/docs/dark-mode)

React:

- [`'use client'`](https://react.dev/reference/rsc/use-client)

## Conclusiones oficiales aplicadas a KMFX

## 1. Next.js si soporta migracion incremental desde una SPA

La guia oficial de SPAs deja claro que una SPA existente puede migrarse a Next.js sin reescribir todo de golpe.

Aplicacion a KMFX:

- la estrategia de `apps/web-next` en paralelo es correcta
- no necesitamos big bang
- podemos mantener comportamiento SPA donde tenga sentido mientras ganamos App Router

## 2. App Router debe ser la base

Next.js recomienda App Router como modelo moderno con:

- layouts anidados
- rutas por ficheros
- Server Components por defecto
- mejor composicion

Aplicacion a KMFX:

- mantener `src/app`
- usar route groups para el workspace
- usar layouts para shell persistente en lugar de reconstruir nav por ruta

## 3. `layout.tsx` y `page.tsx` son el eje real de la arquitectura

Oficialmente:

- `page` expone la ruta
- `layout` comparte UI y preserva estado entre navegaciones

Aplicacion a KMFX:

- el shell tiene que vivir en layouts, no repetido en cada pagina
- `WorkspaceSidebar`, `WorkspaceTopbar` y `WorkspaceMobileNav` deben colgar del layout del grupo `(workspace)`

## 4. Server Components por defecto, Client Components solo donde aporten

Next.js y React remarcan que:

- layouts/pages son Server Components por defecto
- `use client` se usa solo cuando hay estado, eventos o APIs de navegador

Aplicacion a KMFX:

- las rutas base pueden nacer server-first
- charts, polling, localStorage, drawers interactivos, command palette y tablas avanzadas irán en Client Components
- hay que empujar `use client` hacia abajo del arbol

## 5. `use client` arrastra dependencias transitivas

La doc oficial de React deja claro que marcar un modulo con `'use client'` marca tambien su subarbol de dependencias como client-rendered.

Aplicacion a KMFX:

- no poner `'use client'` en layouts grandes sin necesidad
- separar componentes interactivos de view-models y helpers puros
- evitar que un helper compartido quede accidentalmente en el bundle cliente por importarlo desde un client file

## 6. KMFX debe usar una frontera estricta server/client

La doc oficial de Next recuerda que hay errores claros cuando un modulo se usa en el entorno equivocado.

Aplicacion a KMFX:

- contratos, formatters y selectores puros deben ser environment-agnostic
- polling, `window`, `localStorage`, listeners y charts solo en client files
- si hace falta, usar `server-only` o `client-only` semantica y estructura para evitar mezclas

## 7. Estructura de proyecto: `src/` y colocation son compatibles con nuestra estrategia

La doc oficial de project structure confirma:

- `src/` es soportado
- podemos colocar codigo por feature fuera de `app`
- una carpeta no expone ruta hasta que tenga `page.tsx` o `route.ts`

Aplicacion a KMFX:

- mantener `src/app` para rutas
- colocar `features`, `components`, `lib`, `contracts` y `domain` fuera de `app`
- usar route groups como `(workspace)`

## 8. Next 16 introduce condiciones concretas que afectan el scaffold

La guia de upgrade a v16 indica:

- Node.js minimo `20.9+`
- TypeScript minimo `5.1+`
- Turbopack es default en `dev` y `build`

Aplicacion a KMFX:

- no debemos asumir scripts con `--turbopack`
- el scaffold y CI futuros tienen que ser compatibles con Node 20.9+
- si hubiese config custom de webpack, habria que revisarla antes de build default, pero idealmente evitamos esa deuda

Nota operativa:

- aunque `Turbopack` es el default oficial en `dev`, si el entorno local entra en corrupciones repetidas de `.next/dev` o errores de manifests/runtime temporales, KMFX puede fijar `webpack` como modo estable de desarrollo y dejar `Turbopack` como script opt-in de prueba.

## 9. Caching en Next 16 hay que usarlo con intencion

La doc actual aclara:

- `fetch` no esta cacheado por defecto
- `use cache` cachea componentes/funciones
- datos frescos deben ir por request-time + `Suspense`

Aplicacion a KMFX:

- para Dashboard/Risk live no deberiamos empezar cacheando a ciegas
- las primeras rutas live deben preferir datos frescos y degradacion correcta
- Cache Components no debe ser requisito de Wave 1

## 10. Streaming con `Suspense` es preferible a hacks de loading manual cuando haya async server work

La documentacion oficial recomienda:

- usar `Suspense` para contenido async fresco
- fallback primero, contenido real despues

Aplicacion a KMFX:

- podemos usar `loading.tsx` y boundaries por segmento
- para paneles pesados o secundarios, `Suspense` encaja bien
- no hace falta convertir toda una ruta en client-only para mostrar loading

## 11. Next soporta shallow routing SPA-like con `pushState`/`replaceState`

La guia SPA explica que `window.history.pushState` y `replaceState` integran con el router y con `usePathname`/`useSearchParams`.

Aplicacion a KMFX:

- esto nos sirve para transiciones URL-stateful finas
- pero la regla base sigue siendo que la URL debe ser la fuente de verdad, no `activePage` en store

## 12. shadcn en Next recomienda usar `create-next-app` defaults

La guia oficial de shadcn para Next indica:

- si creas el proyecto con defaults recomendados de `create-next-app`, puedes saltarte parte de la configuracion manual
- alias `@/*` y Tailwind deben quedar correctos

Aplicacion a KMFX:

- el scaffold previsto en `apps/web-next` esta alineado con la guia oficial
- conviene no inventar alias raros en la primera fase

## 13. shadcn recomienda tokens CSS semanticos

La documentacion de theming recomienda:

- tokens CSS variables
- `:root` y `.dark`
- `@theme inline` para exponer tokens

Aplicacion a KMFX:

- nuestra estrategia de tokens KMFX es correcta
- debemos seguir con tokens semanticos, no clases raw de color
- los tokens custom de risk/funding/warning pueden agregarse de forma oficial

## 14. El `Sidebar` oficial de shadcn encaja muy bien con nuestro shell

La documentacion de `Sidebar` confirma:

- `SidebarProvider`
- `SidebarHeader`
- `SidebarFooter`
- `SidebarContent`
- `SidebarRail`
- `SidebarInset`
- `SidebarTrigger`

Aplicacion a KMFX:

- el mapping actual de shell slots es correcto
- no hace falta inventar una sidebar desde cero
- las activaciones pueden montarse con `asChild` sobre `Link`

## 15. Dark mode en shadcn no debe improvisarse

La doc oficial de dark mode existe como capa separada y la de theming deja claro el modelo por tokens.

Aplicacion a KMFX:

- dark-first esta alineado con la infraestructura oficial
- theme toggle puede esperar
- light mode debe ser una segunda pasada con tokens ya estructurados

## Implicaciones directas para la implementacion

### Lo que haremos

- App Router puro
- layout persistente para shell
- `src/` structure
- componentes server-first
- `use client` solo en hojas interactivas
- adapters y domain logic fuera de `app`
- no depender de Cache Components en Wave 1
- shadcn sidebar/tokens como base real

### Lo que evitaremos

- meter `'use client'` arriba de todo
- cachear datos live por reflejo
- copiar SPA state viejo como fuente primaria
- traer config compleja de bundler innecesaria
- convertir la shell en una mega Client Component si no hace falta

## Reglas derivadas para KMFX

1. Toda ruta nueva parte como Server Component salvo necesidad clara de client.
2. Todo polling o uso de `window` vive en Client Components acotados.
3. El shell vive en layouts.
4. La URL manda sobre `activePage`.
5. Cache y revalidation se introducen despues de validar lectura live.
6. `shadcn` se usa de forma idiomatica, no como markup cosmetico.
7. Los tokens KMFX deben colgar del sistema oficial de variables.

## Siguientes pasos documentales que salen de estas notas

- backlog ejecutable de Fase 3 a Fase 6
- risk register de migracion basado en estas reglas oficiales
- checklist tecnico del scaffold real

## Nota final

Estas notas no sustituyen verificar la documentacion oficial el dia de implementar.

Pero si fijan una base mucho mas fiable para que la migracion no arranque con supuestos viejos o patrones incorrectos.
