# KMFX Edge Next.js V1 Beta Readiness Checklist

Estado: checklist operativa para beta Next V1  
Ultima revision: 2026-05-26  
Alcance: preparar `apps/web-next` para una beta simple sin mezclar auth, billing, launcher ni MT5 write-flows reales.

## Objetivo

La V1 beta debe sentirse clara y usable sin intentar cerrar todo KMFX Edge de golpe.

V1 no es el cutover final. Es una superficie Next paralela, read-only, con datos/fixtures fieles y rutas avanzadas degradadas de forma honesta.

## Rutas Activas V1

Estas rutas pueden pulirse y validarse como primera beta:

- `Panel`
- `Cuentas`
- `Portfolio`
- `Insights`
- `Trades`
- `Calendario`
- `Calculadora`
- `Biblioteca`
- `Ajustes`
- `Suscripcion`

## Rutas En Proximamente

Estas rutas no deben enseñar producto parcial hasta cerrarse en chat dedicado:

- `RiskGuard`
- `Review`
- `Playbooks`
- `Prop Firms`
- `Mercado`
- `Ejecucion`

## Criterios Tecnicos De Entrada

- [x] Next corre en paralelo dentro de `apps/web-next`.
- [x] App Router, TypeScript, Tailwind 4.3 y shadcn estan fijados.
- [x] `next@16.x` estable, sin canary.
- [x] Dev server por defecto usa webpack para evitar regresiones de memoria con Turbopack.
- [x] `npm run validate:cascade` disponible.
- [x] `npm run test:smoke:routes` disponible con servidor local activo y rutas admin bloqueadas por defecto.
- [x] `npm run qa:mobile:v1` disponible con servidor local activo para validar rutas V1 en movil y light/dark sin scroll horizontal de pagina.
- [x] `npm run qa:screenshots:v1` disponible con servidor local activo para revisar desktop/mobile y light/dark.
- [x] Guardrail de scope bloquea imports sensibles o legacy en runtime Next.
- [x] Guardrail de copy visible bloquea vocabulario interno y textos de plantilla.
- [x] Guardrail de copy visible bloquea promesas prematuras de tiempo real/live o bloqueo MT5 en UI V1.
- [x] Guardrail de tema valida tokens semanticos y charts `Liveline` con variante light/dark.
- [x] Guardrail de shell impide que la shell antigua de scaffold vuelva a colarse en runtime.
- [x] Guardrail de acciones V1 mantiene logout, launcher y acciones destructivas como UI preparada pero inerte.
- [x] Guardrail V1 valida rutas activas sin duplicar decision, origen/degradacion de datos y policies sin enforcement real.
- [x] Navegacion bloquea rutas avanzadas como `Proximamente`.
- [x] Rutas workspace renderizan dinamicamente para que un snapshot live read-only no quede congelado en build.
- [x] Cliente de snapshot live tiene timeout acotado y fallback a fixture redaccionada si la lectura falla.
- [x] Auditoria `qa:live:snapshot` disponible para comprobar shape, frescura y campos minimos de una cuenta real read-only sin imprimir identificadores completos.
- [x] La fixture por defecto mantiene Darwinex Zero 100K con 366 puntos de historico, 213 operaciones normalizadas, 148 dias operados y buckets horarios para revisar Panel, Calendario, Trades e Insights sin datos reales sensibles.

## Criterios De Producto V1

- [x] Cada ruta activa responde una pregunta clara del trader mediante `routeDecisionQuestions`.
- [x] Ninguna ruta activa duplica otra ruta sin aportar decision.
- [x] No hay cards dentro de cards salvo excepcion justificada.
- [x] No hay separadores/lineas decorativas que ensucien cards principales.
- [x] No hay badges que no indiquen estado real.
- [x] Numeros positivos/negativos usan el sistema semantico de color acordado.
- [x] Light mode no rompe contraste, charts ni modales principales en rutas V1.
- [x] Mobile no corta contenido clave ni genera scroll horizontal de pagina en rutas V1.
- [x] Las rutas avanzadas solo muestran `Proximamente` y siguiente paso.

Nota 2026-05-26:

- `npm run qa:screenshots:v1` genero 56 capturas en dark/light y desktop/mobile sin runtime errors.
- `npm run qa:mobile:v1` valido 14 rutas V1 en dark/light sin warnings.
- `npm run test:smoke:routes` valido 14 rutas V1, 16 rutas avanzadas y 1 ruta admin.
- Pasada visual transversal aplicada: se eliminaron separadores decorativos en resumenes principales, modales y secciones V1, y los estados profit/loss usan tokens semanticos en lugar de colores hardcodeados.
- Se mantienen lineas estructurales solo en tablas, calendarios y matrices donde ayudan a leer filas/columnas.

Nota 2026-05-27:

- `src/app/(workspace)/layout.tsx` queda en `force-dynamic` para permitir pruebas con `KMFX_WAVE1_SOURCE=live` sin prerenderizar fixtures.
- `accounts-snapshot-client` usa timeout configurable (`KMFX_SNAPSHOT_TIMEOUT_MS`, 8s por defecto, 1s-60s acotado) y `workspace-source` mantiene fallback a fixture redaccionada.
- `live-snapshot-adapter` propaga cuentas MT5 `stale`, `pending` y `error` a `connectionState` y `connectionTone` para evitar que una lectura vieja aparezca como conectada en selectores.
- `npm run qa:live:snapshot` exige `KMFX_API_BASE_URL`, usa solo GET contra `/api/accounts/snapshot?view=summary`, resume cuentas por indice y enmascara login para preparar la primera prueba beta con cuenta real.
- `docs/nextjs-live-account-beta-runbook.md` fija el orden de prueba con cuenta real read-only, criterios go/stop y evidencia minima sin tocar flujos sensibles.

## Criterios De Datos V1

- [x] Hay fixtures redaccionados para trabajar sin datos reales sensibles.
- [x] Las cuentas/trades/calendario/portfolio/insights usan selectores de dominio testeados.
- [x] Las fixtures demo de 1 ano se validan contra Panel, Calendario, Trades e Insights.
- [x] Las metricas criticas muestran origen o degradan si falta dato.
- [x] Ningun default de policy aparece como incumplimiento real.
- [x] No se promete tiempo real si no hay fuente live conectada.

## Criterios De Seguridad Y Alcance

- [x] Auth sensible fuera de V1.
- [x] Billing real fuera de V1 salvo wrapper visual/read-only.
- [x] Launcher fuera de V1 salvo CTA visual sin accion destructiva.
- [x] MT5 write-flows fuera de V1.
- [x] Enforcement EA fuera de V1.
- [x] Ninguna accion destructiva queda activa sin confirmacion y permisos.
- [x] Los botones preparatorios deben indicar estado o no ejecutar si la accion real no esta lista.

## Validacion Obligatoria Antes De Entregar Una Pasada

```bash
cd apps/web-next
npm run validate:cascade
```

Si hay servidor local activo:

```bash
npm run test:smoke:routes
npm run qa:mobile:v1
npm run qa:screenshots:v1
```

## Validacion Visual Por Chat De Seccion

Cada chat de seccion debe cerrar:

- objetivo de la seccion;
- bloques visibles finales;
- estados vacio/parcial/listo;
- desktop;
- mobile;
- sin scroll horizontal de pagina;
- dark mode;
- light mode;
- copy visible;
- interacciones basicas;
- screenshot o evidencia de preview.

## No-Go Para Beta

No avanzar a beta si:

- una ruta V1 muestra runtime error o pantalla en blanco;
- aparece copy interna como `mock`, `fixture`, `muestra`, `workspace`, `drena` o textos de plantilla;
- una ruta avanzada enseña contenido parcial no revisado;
- una accion parece real pero no esta conectada;
- la shell activa vuelve a mostrar textos o componentes de scaffold antiguos;
- hay contradicciones entre Panel, Calendario, Trades e Insights;
- light mode rompe charts o modales principales;
- se toca auth, billing, launcher o MT5 sin wrapper y aprobacion dedicada.
