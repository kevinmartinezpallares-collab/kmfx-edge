# Hoja de Ruta de Producción de KMFX Edge

Fecha de auditoría: 2026-05-01 09:45 CEST  
Objetivo: terminar el camino mínimo a producción lo antes posible, sin esperar a la migración completa a Next.js.

## Resumen Ejecutivo

KMFX Edge ya está parcialmente en producción:

- Web app: `dashboard.kmfxedge.com` responde 200 a través de Vercel.
- Vercel: el proyecto `kmfx-edge` tiene el último despliegue de producción en estado `READY`.
- Backend API: `https://kmfx-edge-api.onrender.com/health` responde 200 y reporta el commit `e61ae4c`.
- GitHub: el repo está conectado a Vercel y despliega desde `main`.
- Supabase: el proyecto `KMFX` está activo, las migraciones de billing están aplicadas y las tablas públicas inspeccionadas tienen RLS activo.
- Tests locales: la suite Python pasa con 24 tests OK.

La ruta más rápida no es reconstruir todo. Lo más sensato es lanzar el MVP con la app vanilla actual en Vercel, el backend FastAPI en Render, Supabase Auth y Stripe Billing implementado en el backend. La migración a Next.js debe quedar como pista posterior al lanzamiento.

## Estado Verificado

### Repo Local

- Rama actual: `main`.
- Commit inspeccionado: `e61ae4cf25d9bc07d77486e78c0aa1be1f9ee173`.
- El árbol estaba limpio al auditar.
- Tests ejecutados: `python3 -m unittest discover -s tests` -> 24 tests OK.
- La app actual es estática/vanilla: no hay `package.json` ni runtime Next.js en la raíz.
- No se encontraron workflows `.github` localmente.

### Vercel

- Equipo: `kevinmartinezpallares-1079's projects`.
- Proyecto: `kmfx-edge`.
- Framework: `null`; Vercel está sirviendo salida estática, no una app Next.js.
- Último deployment inspeccionado: `dpl_7Fk1nf8vJjqXarfz18NHhZQcqU6x`, estado `READY`, commit `e61ae4c`.
- Dominios actuales:
  - `dashboard.kmfxedge.com`
  - `kmfx-edge.vercel.app`
  - aliases de rama/preview
- Los logs de build muestran que no hay build real de app; el despliegue completa como estático.

### Backend Render

- Base URL de producción usada por el frontend: `https://kmfx-edge-api.onrender.com`.
- `/health` responde OK y coincide con el commit desplegado.
- `/api/accounts/snapshot` sin autenticación devuelve cuentas vacías con `auth_required: true`.
- `/api/mt5/policy` rechaza correctamente una petición sin identidad.
- El backend ya tiene endpoints reales para cuentas, link del launcher, sync MT5, journal MT5, policy MT5, snapshots y operaciones admin.

### Supabase

- Proyecto: `KMFX`, ref `uuhiqreifisppqkawzif`, región `eu-west-1`, estado `ACTIVE_HEALTHY`.
- Migraciones remotas:
  - `billing_subscriptions`
  - `billing_advisor_fixes`
- Todas las tablas públicas inspeccionadas tienen RLS activo:
  - `billing_customers`
  - `billing_events`
  - `billing_subscriptions`
  - `calculator_presets`
  - `dashboard_objectives`
  - `plan_entitlements`
  - `risk_rules`
  - `user_preferences`
  - `user_profiles`
- `plan_entitlements` está sembrada para `free`, `core`, `pro` y `desk`.

### Stripe

- Cuenta conectada: `Kevinmartinezfx`.
- Productos: ninguno.
- Prices: ninguno.
- Suscripciones: ninguna.
- Hay clientes antiguos en Stripe, pero todavía no existe catálogo KMFX.
- Conclusión: Stripe aún no está listo para billing self-service.

### GitHub

- Repositorio: `kevinmartinezpallares-collab/kmfx-edge`.
- PRs abiertos encontrados: ninguno.
- Issues abiertos encontrados: ninguno.
- Workflow runs para el último commit: ninguno.
- Conclusión: todavía no hay una capa visible de CI/release management.

## Decisión de Dominio y Marca

Objetivo de producción: que el usuario vea **KMFX Edge como producto propio**, no como una mezcla de subdominios técnicos.

### Dominio público recomendado

- Dominio principal de la app: `https://kmfxedge.com`.
- Redirección permanente:
  - `https://dashboard.kmfxedge.com` -> `https://kmfxedge.com`
  - `https://www.kmfxedge.com` -> `https://kmfxedge.com`
- API pública:
  - `https://api.kmfxedge.com` -> backend Render
- Auth/OAuth, si Supabase y el plan lo permiten:
  - `https://auth.kmfxedge.com` o auth bajo dominio propio

Nota: en este roadmap asumo `kmfxedge.com`. Si se quiere usar literalmente `kmfedge.com`, hay que comprobar disponibilidad, propiedad y branding antes de cambiarlo.

### Limpieza de URLs visibles

Hay que eliminar o reducir URLs técnicas visibles para el usuario:

- Reemplazar `dashboard.kmfxedge.com` por `kmfxedge.com` en código, docs, Vercel y Supabase.
- Reemplazar `kmfx-edge-api.onrender.com` por `api.kmfxedge.com` en runtime de producción.
- Evitar que el login con Google muestre `uuhiqreifisppqkawzif.supabase.co` cuando sea posible.
- Configurar marca, nombre de app, dominio autorizado y pantalla de consentimiento en Google Cloud.
- Configurar Site URL y Redirect URLs en Supabase apuntando a `https://kmfxedge.com`.
- Revisar si hace falta dominio personalizado de Supabase/Auth para que el flujo OAuth no enseñe el dominio Supabase.

Archivos locales donde ya se detectaron URLs a cambiar:

- `js/modules/auth-session.js`: `resolveOAuthRedirectUrl()` devuelve `https://dashboard.kmfxedge.com`.
- `launcher/app.py`: `DASHBOARD_RECOVERY_URL` usa `https://dashboard.kmfxedge.com?auth=recovery`.
- `launcher/backend_client.py`: OAuth del launcher construye URL sobre `https://uuhiqreifisppqkawzif.supabase.co/auth/v1`.
- `js/lib/supabase.js`: cliente Supabase apunta al dominio Supabase público.
- `kmfx_connector_api.py`: backend verifica usuario contra el proyecto Supabase.
- `docs/billing-env-vars.md`: `NEXT_PUBLIC_APP_URL` aún está pensado para local/Next futuro.
- `start_kmfx.sh`: ya menciona `kmfxedge.com/kmfx-edge.html` y `wss://ws.kmfxedge.com`, hay que reconciliarlo con la arquitectura real.

## Bloqueadores de Producción

### P0 - Bloquea producción pública o de pago

- Las decisiones de pricing no están cerradas: moneda, precios Core/Pro, anual, trial, grace period y modelo Desk.
- No existe catálogo Stripe: producto, prices, lookup keys, portal y webhook.
- No existen endpoints de billing en el runtime actual.
- La app Vercel actual es estática, así que Checkout server-side y webhooks Stripe no pueden vivir ahí todavía.
- Los permisos de producto aún no están completamente gobernados por entitlements.
- La emisión de connection keys debe depender de auth y `launcherConnection`.
- El número de cuentas MT5 live debe limitarse por `liveMt5Accounts`.
- Debug/admin/raw bridge deben estar protegidos también en backend.
- CORS del backend es permisivo y debe cerrarse antes de un lanzamiento amplio.
- Los IDs/admin fallback y mappings de launcher deben quedar controlados por env vars, no por hardcodes.
- El dominio canónico debe cambiarse a `https://kmfxedge.com`.
- Google OAuth debe dejar de enseñar marcas o dominios técnicos siempre que sea posible.

### P1 - Bloquea un lanzamiento tranquilo

- No hay GitHub Actions CI para tests.
- No hay smoke/e2e test del flujo auth -> link cuenta -> launcher -> sync -> dashboard.
- No hay QA visual/mobile automatizada sobre el dashboard desplegado.
- Render tiene healthcheck, pero no hay plan documentado de uptime/alertas.
- La API sigue en dominio `onrender.com`; debería pasar a `api.kmfxedge.com`.
- Falta documentar config real de Vercel aunque la raíz siga estática.
- Las páginas legales existen, pero hay que revisar suscripción, retención, cancelación, refunds y disclaimers de riesgo.
- Falta revisar emails, recovery links, redirects OAuth y mensajes de error para que todo apunte a `kmfxedge.com`.

### P2 - Puede esperar a después del primer lanzamiento

- Migración completa a Next.js + shadcn.
- Paridad visual completa con `docs/restoration-gap-list.md`.
- Pulido total de instaladores desktop.
- Firma y notarización macOS con Developer ID.
- Instalador y code signing Windows.
- Desk/team workspace.
- Observabilidad avanzada.

## Estrategia de Lanzamiento Más Rápida

### Recomendación

Lanzar en dos pistas:

1. MVP de producción: app vanilla actual + FastAPI en Render + Supabase Auth + Stripe Billing en FastAPI.
2. Modernización post-lanzamiento: migración sidecar a Next.js según `docs/nextjs-migration-blueprint.md`.

No conviene bloquear el primer lanzamiento por Next.js. El backend ya existe, está desplegado y puede recibir webhooks Stripe de forma segura. Más adelante, si se hace el cutover a Next.js, billing puede moverse o quedar en un backend dedicado.

### Scope del primer producto

Lanzar:

- Dashboard autenticado.
- Link de cuenta y conexión del launcher.
- Sync MT5, journal sync y policy retrieval.
- Vistas core de dashboard, riesgo y cuentas.
- Stripe Checkout y Customer Portal.
- Entitlements para launcher, cuentas live, debug, export y features avanzadas.
- Flujos admin de soporte para inspección de cuenta y regeneración de keys.
- Terms, privacy, refunds y disclaimer de riesgo.
- Dominio raíz `kmfxedge.com` como experiencia principal.

Dejar fuera del primer lanzamiento:

- Migración completa a Next.js.
- Paridad total de todos los modales legacy.
- Desk self-service.
- Team workspaces.
- Instaladores firmados como requisito duro.
- Exports avanzados si no están protegidos y probados.

## Fase 0 - Decisiones de Negocio, Mismo Día

Responsable: producto/negocio.

- [ ] Confirmar modo de lanzamiento: beta gratuita, beta de pago o público de pago.
- [ ] Confirmar dominio canónico: `kmfxedge.com`.
- [ ] Confirmar qué pasa con `dashboard.kmfxedge.com`: redirección 301 o alias temporal.
- [ ] Confirmar moneda: USD, EUR o ambas.
- [ ] Confirmar precio mensual Core.
- [ ] Confirmar precio anual Core o descuento anual.
- [ ] Confirmar precio mensual Pro.
- [ ] Confirmar precio anual Pro o descuento anual.
- [ ] Decidir si habrá trial.
- [ ] Decidir si el trial requiere tarjeta.
- [ ] Decidir grace period para `past_due`.
- [ ] Decidir si Desk es privado/contact-only en el lanzamiento.
- [ ] Decidir comportamiento de retención cuando el usuario baja de plan.
- [ ] Confirmar política de refunds/cancelación.
- [ ] Confirmar canal de soporte.

Criterio de salida:

- Pricing final suficiente para crear productos y prices Stripe en test mode.
- No queda una ambigüedad de negocio bloqueando ingeniería.

## Fase 1 - Dominio, Marca y OAuth, 1 Día

Responsable: frontend/backend/infra.

- [ ] Añadir `kmfxedge.com` como dominio principal en Vercel.
- [ ] Configurar `www.kmfxedge.com` como redirect al dominio raíz.
- [ ] Redirigir `dashboard.kmfxedge.com` a `kmfxedge.com`.
- [ ] Actualizar `resolveOAuthRedirectUrl()` en `js/modules/auth-session.js` a `https://kmfxedge.com`.
- [ ] Actualizar `DASHBOARD_RECOVERY_URL` en `launcher/app.py`.
- [ ] Revisar todos los links de recovery/password reset/email.
- [ ] Configurar Supabase Auth Site URL: `https://kmfxedge.com`.
- [ ] Configurar Supabase Auth Redirect URLs:
  - `https://kmfxedge.com`
  - `https://kmfxedge.com/*`
  - URLs locales de desarrollo
  - callback local del launcher si sigue aplicando
- [ ] Configurar Google Cloud OAuth consent screen:
  - App name: `KMFX Edge`
  - Authorized domain: `kmfxedge.com`
  - Privacy Policy URL
  - Terms URL
  - Support email
- [ ] Revisar Authorized redirect URIs del provider Google usado por Supabase.
- [ ] Evaluar dominio personalizado de Supabase/Auth para evitar mostrar `supabase.co` en el flujo OAuth.
- [ ] Si no se puede ocultar `supabase.co` por plan/arquitectura, documentarlo como deuda de branding y minimizarlo en el resto del flujo.
- [ ] Actualizar manifest, favicons, start_url y links públicos para usar `kmfxedge.com`.

Criterio de salida:

- El usuario entra por `https://kmfxedge.com`.
- Google login vuelve a `https://kmfxedge.com`.
- Recovery/password reset vuelve a `https://kmfxedge.com`.
- El subdominio `dashboard` ya no es la URL principal del producto.

## Fase 2 - Hardening de Producción, 1-2 Días

Responsable: backend/frontend.

- [ ] Mover admin user IDs y admin launcher key mapping completamente a env vars de Render.
- [ ] Eliminar o desactivar fallback hardcoded de admin launcher en producción.
- [ ] Restringir CORS del backend a orígenes reales:
  - `https://kmfxedge.com`
  - `https://www.kmfxedge.com`, solo si no redirige antes de tocar API
  - `https://dashboard.kmfxedge.com`, solo durante transición
  - orígenes locales solo en dev
- [ ] Confirmar ruta de verificación JWT de Supabase en producción.
- [ ] Añadir `SUPABASE_JWT_SECRET` o documentar el uso intencional de verificación vía Supabase Auth.
- [ ] Añadir `SUPABASE_SERVICE_ROLE_KEY` solo en backend server para writes de billing.
- [ ] Garantizar que ningún secreto server-side es legible por el navegador.
- [ ] Mantener la publishable key de Supabase en frontend solo si es intencional.
- [ ] Añadir manejo de errores para auth required, plan bloqueado, límite de cuentas y backend unavailable.
- [ ] Confirmar que usuarios no autenticados no pueden crear/linkear cuentas.
- [ ] Confirmar que endpoints admin devuelven 403 para usuarios no-admin verificados.
- [ ] Crear `api.kmfxedge.com` o documentar por qué Render domain queda temporalmente.
- [ ] Revisar privacy/refunds/terms contra el modelo de suscripción.

Criterio de salida:

- Backend no depende de accesos sensibles hardcoded.
- CORS está cerrado a producción.
- Account linking y admin routes están protegidos explícitamente.
- Copy legal y de riesgo no es engañoso.

## Fase 3 - Stripe Billing MVP, 2-3 Días

Responsable: backend/billing.

Usar Stripe Billing con Checkout Sessions en modo `subscription` y Customer Portal.

- [ ] Crear Stripe Product `KMFX Edge` en test mode.
- [ ] Crear Prices con lookup keys:
  - `kmfx_core_monthly`
  - `kmfx_core_yearly`
  - `kmfx_pro_monthly`
  - `kmfx_pro_yearly`
- [ ] Añadir metadata:
  - `app=kmfx_edge`
  - `plan_key=core|pro`
  - `interval=month|year`
- [ ] Configurar Stripe Customer Portal.
- [ ] Añadir env vars en Render:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_API_VERSION=2026-02-25.clover`
  - `STRIPE_PRICE_CORE_MONTHLY`
  - `STRIPE_PRICE_CORE_YEARLY`
  - `STRIPE_PRICE_PRO_MONTHLY`
  - `STRIPE_PRICE_PRO_YEARLY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Implementar `POST /api/billing/checkout`.
- [ ] Implementar `POST /api/billing/portal`.
- [ ] Implementar `POST /api/billing/webhook`.
- [ ] Implementar `GET /api/billing/status`.
- [ ] Verificar firma webhook usando raw body.
- [ ] Guardar eventos idempotentes en `billing_events`.
- [ ] Upsert en `billing_customers`.
- [ ] Upsert en `billing_subscriptions`.
- [ ] Mapear Stripe status a estado interno de acceso.
- [ ] Devolver entitlements desde `plan_entitlements`.
- [ ] Añadir tests de webhook idempotente y status mapping.

Eventos webhook mínimos:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Criterio de salida:

- Checkout test crea suscripción y actualiza Supabase.
- Portal test permite cancelar/cambiar suscripción y los webhooks sincronizan.
- `/api/billing/status` devuelve billing + entitlements para usuario autenticado.

## Fase 4 - Guards de Producto, 1-2 Días

Responsable: backend/frontend/launcher.

- [ ] Añadir helper backend de entitlements.
- [ ] Exigir `launcherConnection` antes de emitir connection keys.
- [ ] Exigir `liveMt5Accounts` antes de añadir/linkear una cuenta MT5 live.
- [ ] Proteger editor Risk con `riskPolicyEditor`.
- [ ] Proteger auto-block local con `localAutoBlock`.
- [ ] Proteger debug raw bridge con `rawBridgeDebug`.
- [ ] Proteger exports con `exports`.
- [ ] Devolver respuestas claras:
  - `billing_required`
  - `plan_limit_reached`
  - `entitlement_required`
  - `billing_past_due`
- [ ] Añadir empty/blocked states sobrios en frontend.
- [ ] Asegurar que el launcher muestra “plan/account limit” sin borrar cola ni logs locales.

Criterio de salida:

- Usuario Free no puede linkear cuenta live.
- Usuario Core no puede superar 1 cuenta MT5 live.
- Usuario Pro no puede superar 3 cuentas MT5 live.
- Debug/admin/raw routes no están disponibles para usuarios normales.

## Fase 5 - QA de Release, 1-2 Días

Responsable: QA/engineering.

- [ ] Ejecutar unit tests: `python3 -m unittest discover -s tests`.
- [ ] Añadir GitHub Actions para tests Python.
- [ ] Añadir smoke test de producción:
  - `https://kmfxedge.com` devuelve 200.
  - `https://api.kmfxedge.com/health` devuelve commit actual.
  - `/api/accounts/snapshot` sin auth devuelve `auth_required`.
  - `/api/mt5/policy` rechaza identity ausente.
- [ ] Probar login auth desde dominio production.
- [ ] Probar Google login y comprobar que vuelve a `kmfxedge.com`.
- [ ] Probar creación de account link con usuario real autenticado.
- [ ] Probar ruta launcher:
  - EA -> launcher localhost -> backend production -> dashboard.
- [ ] Probar resiliencia:
  - backend caído -> cola launcher crece.
  - backend vuelve -> cola drena.
- [ ] Probar navegación móvil.
- [ ] Probar navegación desktop.
- [ ] Probar dark/light mode si se ofrece públicamente.
- [ ] Probar Terms, Privacy y Refund links.
- [ ] Probar Checkout success/cancel redirects.
- [ ] Probar replay/idempotencia de Stripe webhook.
- [ ] Probar cancelación en Stripe Customer Portal.

Criterio de salida:

- Un viaje completo de usuario funciona en URLs de producción.
- Billing funciona en Stripe test mode.
- No queda ningún P0 abierto.

## Fase 6 - Go Live, Mismo Día Tras QA

Responsable: release.

- [ ] Congelar `main`.
- [ ] Crear tag, por ejemplo `v0.1.0-production-mvp`.
- [ ] Cambiar Stripe de test keys a live keys.
- [ ] Crear productos/prices live con los mismos lookup keys.
- [ ] Configurar webhook live.
- [ ] Configurar Customer Portal live.
- [ ] Confirmar Render env con live Stripe keys y Supabase production.
- [ ] Confirmar Vercel con `kmfxedge.com` como dominio principal.
- [ ] Confirmar `api.kmfxedge.com`, si se activa.
- [ ] Ejecutar smoke tests production.
- [ ] Hacer rehearsal de checkout live con el camino más seguro disponible.
- [ ] Monitorizar Render logs, Stripe events, Supabase writes y Vercel traffic.

Criterio de salida:

- Un usuario real puede registrarse, suscribirse, linkear launcher, sincronizar MT5 y ver datos en el dashboard.

## Revisión Integral por Complementos

No hay un único complemento que haga bien toda la revisión. Para buscar puntos de mejora de verdad, conviene usar varios:

- **Browser Use**: revisión visual y funcional en navegador real. Sirve para detectar problemas de UX, mobile, redirects, login, botones rotos, responsive, consola y flujos completos.
- **Vercel**: revisión de dominios, aliases, deployments, build output, previews, redirects y configuración de producción.
- **Supabase**: revisión de Auth, redirect URLs, RLS, tablas, policies, migrations y seguridad de datos.
- **Stripe**: revisión de catálogo, precios, Checkout, Portal, webhooks, eventos e integración de suscripciones.
- **GitHub**: revisión de issues, PRs, CI/CD, release flow, branches y checks.
- **Codex Security**: revisión de seguridad técnica del repo: auth, secretos, CORS, endpoints admin, permisos y superficies expuestas.
- **Build Web Apps / frontend audit**: revisión de experiencia, accesibilidad, copy, layout, mobile y polish del producto.

Orden recomendado de revisión:

1. Browser Use + Vercel para detectar problemas visibles de dominio, navegación, mobile y despliegue.
2. Supabase + Stripe para auth, billing y datos.
3. Codex Security para riesgos de producción.
4. GitHub para convertir hallazgos en issues, CI y release checklist.

## Pista Post-Lanzamiento A - Migración a Next.js

Hacer después de que el MVP sea usable y billing esté estable.

- [ ] Crear `apps/web-next`.
- [ ] Instalar Next.js, TypeScript, Tailwind, shadcn/ui, lucide y Recharts.
- [ ] Portar tokens desde `styles-v2.css`.
- [ ] Construir AppShell, rutas, sidebar, topbar y mobile nav.
- [ ] Crear fixtures tipados y modelos de dominio.
- [ ] Extraer selectors de cuentas, riesgo y charts.
- [ ] Construir primero Dashboard read-only.
- [ ] Añadir live data clients después del data layer tipado.
- [ ] Hacer cutover solo tras paridad de rutas y QA visual.

Referencia: `docs/nextjs-migration-blueprint.md`.

## Pista Post-Lanzamiento B - Distribución del Launcher

- [ ] Validar app macOS en máquina limpia.
- [ ] Añadir Developer ID signing.
- [ ] Notarizar build macOS.
- [ ] Build Windows en Windows 10/11 limpio.
- [ ] Envolver build Windows onedir con Inno Setup o WiX.
- [ ] Añadir Windows code signing.
- [ ] Publicar guía de instalación del launcher.
- [ ] Definir estrategia de updates.

## Pista Post-Lanzamiento C - Paridad de Producto

Referencia: `docs/restoration-gap-list.md`.

- [ ] Restaurar flujo de gestión del banner add-account.
- [ ] Restaurar diagnósticos ricos de cuenta.
- [ ] Restaurar modales de journal y lifecycle de estrategias.
- [ ] Restaurar edición/creación de funded challenges.
- [ ] Restaurar tablas RAW EA vs dashboard.
- [ ] Restaurar breakdown mensual de bridge debug.
- [ ] Restaurar widgets ricos de instrumentos en calculadora.
- [ ] Restaurar paridad más profunda en market/glossary.
- [ ] Mejorar bottom nav móvil y menú “Más secciones”.

## Backlog Sugerido en GitHub

Crear issues con estos labels:

- `P0 Launch blocker`
- `P1 Launch confidence`
- `P2 Post launch`
- `branding`
- `domain`
- `billing`
- `backend`
- `frontend`
- `launcher`
- `supabase`
- `stripe`
- `vercel`
- `security`

Issues iniciales:

- [ ] Finalizar pricing y política de trial.
- [ ] Cambiar dominio principal a `kmfxedge.com`.
- [ ] Limpiar OAuth/Google para que vuelva a `kmfxedge.com`.
- [ ] Evaluar dominio personalizado de Supabase/Auth.
- [ ] Crear `api.kmfxedge.com`.
- [ ] Hardening de producción del backend.
- [ ] Implementar endpoints Stripe billing en FastAPI.
- [ ] Añadir helper de entitlements y product guards.
- [ ] Añadir GitHub Actions para unit tests.
- [ ] Añadir smoke test de producción.
- [ ] Ejecutar revisión Browser Use sobre producción.
- [ ] Ejecutar revisión de seguridad.
- [ ] Probar launcher end-to-end en producción.
- [ ] Preparar tag de release y rollback plan.
- [ ] Empezar sidecar Next.js después del lanzamiento.

## Plan de Rollback

- Web rollback: usar rollback candidate en Vercel para `kmfx-edge`.
- Backend rollback: redeploy del commit anterior en Render.
- Stripe rollback:
  - mantener test mode hasta que QA pase.
  - si live falla, desactivar prices live o pausar entry points de compra.
  - Customer Portal debe seguir disponible para suscriptores existentes.
- Supabase rollback:
  - evitar migraciones destructivas durante launch.
  - billing writes deben ser aditivos y event-driven.
- Launcher rollback:
  - mantener instalador/connector anterior disponible.
  - no forzar auto-update en primera release.

## Definition of Done del MVP de Producción

- [ ] Usuario puede autenticarse en `https://kmfxedge.com`.
- [ ] Login con Google vuelve a `https://kmfxedge.com`.
- [ ] Usuario puede comprar Core o Pro.
- [ ] Stripe webhook actualiza Supabase.
- [ ] App lee billing status y entitlements.
- [ ] Usuario puede linkear launcher solo si tiene permiso.
- [ ] Launcher puede sincronizar MT5 con production API.
- [ ] Dashboard muestra datos live de la cuenta autenticada.
- [ ] Usuarios no autorizados no pueden ver datos de otra cuenta.
- [ ] Admin tools están protegidas en servidor.
- [ ] Tests y smoke checks de producción pasan.
- [ ] Terms, privacy, refunds y risk disclaimer están finales.
- [ ] Rollback path está claro.

