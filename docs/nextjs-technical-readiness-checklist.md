# KMFX Next.js Technical Readiness Checklist

Estado: checklist tecnica de migracion segura  
Ultima revision: 2026-05-26  
Alcance: validar entorno, decisiones tecnicas y barreras de regresion durante la migracion paralela en `apps/web-next`.

## Proposito

Esta checklist evita que la migracion avance por intuicion visual sin una base tecnica verificable. Primero sirvio para arrancar `apps/web-next`; ahora tambien fija las barreras minimas para seguir iterando sin romper produccion ni introducir copy interna visible para el trader.

## Checklist

## Entorno base

- [x] Node.js disponible para `apps/web-next`
- [x] TypeScript disponible en `apps/web-next`
- [x] package manager de `apps/web-next` decidido
- [x] lockfile del repo entendido para no mezclar gestores sin querer

## Scaffold y estructura

- [x] decision confirmada: `apps/web-next`
- [x] decision confirmada: `src/app`
- [x] decision confirmada: App Router
- [x] decision confirmada: alias `@/*`

## Scripts esperados

- [x] `next dev` disponible sin tocar la app productiva
- [x] `next build` disponible
- [x] `next start` disponible

## Configuracion

- [x] no dependemos de configuracion custom de webpack para arrancar
- [x] si aparece config custom futura, se evaluara contra Turbopack y no se asumira compatibilidad
- [x] `next.config` se mantiene minima

## shadcn

- [x] `components.json` creado
- [x] `tailwind.cssVariables = true`
- [x] style base decidido
- [x] tema base neutral decidido
- [x] no se instala un preset sin revisar su encaje con KMFX

## Fuentes y theming

- [x] se aplicaron fixes de fuente post-scaffold
- [x] dark-first confirmado
- [ ] light mode como segunda pasada confirmado
- [x] tokens KMFX viven sobre `:root` y `.dark`

## Arquitectura server/client

- [x] regla confirmada: server-first por defecto
- [x] regla confirmada: `use client` solo donde haya necesidad real
- [x] regla confirmada: polling y browser APIs en hojas cliente acotadas

## Datos

- [x] data dictionary disponible
- [x] field source map disponible
- [x] fixture pack spec disponible
- [x] redaction policy disponible

## Barreras de regresion

- [x] tests unitarios de dominio activos con Vitest
- [x] `npm run lint` disponible para `apps/web-next`
- [x] `npm run typecheck` disponible para `apps/web-next`
- [x] `npm run validate` disponible para validar sin levantar servidor
- [x] `npm run validate:cascade` disponible para la bateria segura V1 sin levantar servidor
- [x] `npm run test:smoke:routes` disponible para validar rutas V1, rutas avanzadas degradadas y rutas admin bloqueadas con el servidor local activo
- [x] `npm run qa:mobile:v1` disponible para validar rutas V1 en viewport movil, dark/light, sin errores visibles ni scroll horizontal de pagina
- [x] `npm run qa:screenshots:v1` disponible para capturar rutas V1 en desktop/mobile y light/dark con servidor local activo
- [x] test de vocabulario visible en `src/lib/domain/visible-copy.test.ts`, con barrido automatico de componentes de pantalla
- [x] test de aislamiento de migracion en `src/lib/domain/migration-scope.test.ts` para bloquear imports/runtime sensibles en Next
- [x] test de contrato de tema en `src/lib/domain/theme-contract.test.ts`
- [x] test de contrato de tema protege tokens semanticos y charts `Liveline` en light/dark
- [x] test de contrato de stack/scripts en `src/lib/domain/package-contract.test.ts`
- [x] test de configuracion macro calendar en `src/lib/config/macro-calendar.test.ts`
- [x] test de fuente de datos por defecto en `src/lib/data/workspace-source-contract.test.ts`
- [x] test de fixture Darwinex 100K de 1 ano en `src/lib/data/live-snapshot-adapter.test.ts`
- [x] test de seguridad de acciones V1 en `src/lib/domain/action-safety-contract.test.ts`
- [x] test de contrato de shell en `src/lib/domain/shell-contract.test.ts`
- [x] test de readiness V1 en `src/lib/domain/v1-readiness-contract.test.ts` para decisiones de ruta, origen/degradacion de datos y policies sin enforcement real
- [x] navegacion/sidebar protegida contra labels legacy visibles
- [x] rutas App Router protegidas contra paginas sin titulo visible, prioridades mobile ausentes y rutas admin expuestas
- [ ] QA visual por ruta antes de cerrar R3/R4

## Wave 1

- [x] rutas iniciales confirmadas:
  - `/dashboard`
  - `/accounts`
  - `/risk`
  - `/analytics`
- [x] shell slots confirmados
- [x] domain components iniciales confirmados

## Fuera de alcance inicial

- [x] billing fuera
- [x] auth sensible fuera
- [x] launcher fuera
- [x] MT5 write flows fuera
- [x] settings sensible fuera

## Criterio para seguir iterando

Seguimos avanzando una ruta o refactor cuando:

- tests, lint y typecheck pasan o el fallo queda documentado como previo/no relacionado
- la ruta no introduce copy tecnica visible
- la logica nueva vive en dominio cuando no sea puramente presentacional
- la app vanilla productiva no se toca
- no se abre billing, auth sensible, launcher ni write-flows MT5

## Modo cascada seguro V1

Este modo se usa cuando el objetivo es avanzar sin depender de decisiones visuales nuevas del usuario. No sustituye la revision visual por seccion, pero si evita romper rutas, introducir copy interna o mezclar scope avanzado con V1.

Alcance V1 permitido:

- `/dashboard`
- `/accounts`
- `/analytics`
- `/analytics/daily`
- `/analytics/hourly`
- `/analytics/risk`
- `/trades`
- `/calendar`
- `/capital`
- `/tools/calculator`
- `/study`
- `/settings`
- `/subscription`
- `/settings/subscription`

Rutas avanzadas que deben quedar como proximamente o degradadas hasta trabajarlas en su chat propio:

- `RiskGuard`
- `Prop Firms`
- `Review`
- `Playbooks`
- `Mercado`
- `Ejecucion`

Estas rutas deben cargar si se accede por URL directa, pero solo mostrando el estado comun de `Proximamente`; no deben renderizar contenido parcial de producto hasta que su seccion se cierre en un chat dedicado.

Checklist obligatorio antes de entregar una pasada de cascada:

```bash
cd apps/web-next
npm run validate:cascade
npm run test:smoke:routes
npm run qa:mobile:v1
npm run qa:screenshots:v1
```

Notas:

- `npm run test:smoke:routes` requiere servidor local activo en `http://localhost:3043` y valida rutas V1, estado `Proximamente` de rutas avanzadas y rutas admin bloqueadas por defecto.
- `npm run qa:mobile:v1` requiere servidor local activo en `http://localhost:3043` y valida rutas V1 en 390px para dark/light, runtime errors, `h1` visible y ausencia de scroll horizontal de pagina.
- `npm run qa:screenshots:v1` requiere servidor local activo en `http://localhost:3043` y genera evidencia visual en `output/playwright/v1-qa`.
- Si se usa otro puerto, ejecutar con `KMFX_SMOKE_BASE_URL=http://localhost:PORT npm run test:smoke:routes`.
- Para QA movil en otro puerto, ejecutar con `KMFX_QA_BASE_URL=http://localhost:PORT npm run qa:mobile:v1`.
- Para capturas en otro puerto, ejecutar con `KMFX_QA_BASE_URL=http://localhost:PORT npm run qa:screenshots:v1`.
- Si un fallo viene de cambios visuales en curso, no esconderlo con ajustes grandes: aislar ruta, documentar causa y corregir el minimo necesario.
- Si una ruta necesita decision de producto o visual, parar esa ruta y seguir con otra parte segura.

## Checkpoint cascada V1 - 2026-05-26

Estado:

- V1 activa mantiene el perimetro acordado: Panel, Cuentas, Portfolio, Insights, Trades, Calendario, Calculadora, Biblioteca, Ajustes y Suscripcion.
- Rutas avanzadas mantienen estado `Proximamente`: RiskGuard, Review, Playbooks, Prop Firms, Mercado y Ejecucion.
- Se corrigio el menu de usuario para que `Cerrar sesion` use tratamiento destructivo visible sin activar logout real adicional.
- Se preparo entrada UI para `Anadir cuenta` y `Abrir launcher` en Cuentas, sin guardar credenciales, abrir MT5 ni activar flujos sensibles.
- Se reforzo `visible-copy.test.ts` para bloquear regresiones de plantilla/login en shell y menu de usuario: `Acceso operativo`, `Centro operativo`, `Log out`, `Plan & Billing` y `Upgrade to Pro`.
- Se reforzo `visible-copy.test.ts` para bloquear promesas prematuras en UI V1: `Live account`, `Datos en vivo`, `tiempo real`, `real-time`, `bloquea MT5` y `bloquea nueva operativa`.
- Se reforzo `navigation.test.ts` para impedir que subrutas de modulos `Proximamente` queden habilitadas por accidente.
- Se añadio `routeDecisionQuestions` al contrato de navegacion para que cada ruta activa V1 mantenga una pregunta operativa explicita.
- Se alineo `test:smoke:routes` con el contrato de navegacion mediante test unitario para que V1, `Proximamente` y admin bloqueado no deriven.
- Se normalizo el placeholder comun `Proximamente` para exponer titulo principal `h1`, evitando rutas avanzadas sin heading visible en smoke/QA.
- Se añadio `migration-scope.test.ts` para impedir que el runtime Next importe Supabase/Stripe/OpenAI, modulos Node sensibles o piezas legacy de Launcher/MT5 por accidente.
- Se añadio `shell-contract.test.ts` para fijar el layout activo en `components/trading/workspace-shell` y evitar reintroducir shells antiguas de scaffold.
- Se añadio `action-safety-contract.test.ts` para asegurar que logout, launcher y acciones destructivas de cuenta sean tratamiento visual/preparatorio, no flujos reales activos en V1.
- Se añadio `v1-readiness-contract.test.ts` para asegurar que las rutas activas no dupliquen decision, que las metricas criticas tengan origen/degradacion visible y que los defaults de policy no parezcan incumplimientos reales ni enforcement MT5 activo.
- Se añadio `npm run validate:cascade` para ejecutar la bateria V1 segura sin recordar manualmente cada selector/test.
- Se añadio `npm run qa:mobile:v1` para validar todas las rutas V1 en movil, dark/light, sin depender de inspeccion manual ruta por ruta.
- Se añadio `npm run qa:screenshots:v1` para capturar todas las rutas V1 en desktop/mobile y light/dark sin abrir chats visuales gigantes.
- `validate:cascade` protege que `apps/web-next` siga usando la fixture redaccionada como fuente por defecto, con fallback seguro desde modo live.
- `validate:cascade` incluye la fixture Darwinex 100K de 1 ano para proteger Panel, Calendario, Trades e Insights contra regresiones de datos demo.

Validacion ejecutada:

```bash
cd apps/web-next
npm run validate:cascade
npm run test:smoke:routes
npm run qa:mobile:v1
npm run qa:screenshots:v1
```

Resultado:

- `17` archivos de test / `76` tests OK en la bateria de cascada.
- `typecheck` OK.
- `lint` OK.
- `test:smoke:routes` OK: `14` rutas V1, `16` rutas avanzadas y `1` ruta admin bloqueada por defecto.
- `qa:mobile:v1` OK: `14` rutas V1 validadas en dark/light sin errores visibles ni scroll horizontal de pagina; quedan avisos compactos solo en celdas densas de calendario/mapa horario.
- `qa:screenshots:v1` OK: `56` capturas V1 generadas en `output/playwright/v1-qa`.

Pendiente antes de cerrar R3/R4:

- QA visual final por ruta en chats separados.
- Confirmacion visual de light mode por seccion tras la pasada de charts.
- Mantener auth sensible, billing, launcher real y MT5 write-flows fuera de V1 hasta wrapper dedicado.

## Relacion con documentos existentes

- `docs/nextjs-official-guidance-notes.md`
- `docs/nextjs-bootstrap-execution-runbook.md`
- `docs/nextjs-master-migration-roadmap.md`
