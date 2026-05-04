# Roadmap de Producción KMFX Edge

Última revisión: 2026-05-04
Rama revisada: `main`
Commit base: `6be516a Harden MT5 payload handling`
Objetivo: llevar KMFX Edge a producción comercial lo antes posible, sin bloquear el lanzamiento por la migración a Next.js.

## Resumen Ejecutivo

KMFX Edge ya tiene una base real de producción:

- `https://kmfxedge.com` está desplegado en Vercel y responde `200`.
- Vercel despliega desde `main`; el deployment del commit `6be516a` está `READY`.
- Render responde en `https://kmfx-edge-api.onrender.com/health` y reporta el commit `6be516a`.
- `https://mt5-api.kmfxedge.com` existe como proxy Cloudflare para el flujo EA/MT5.
- El dashboard ya usa rutas limpias como `/dashboard`, `/cuentas`, `/funding`, `/risk-engine`, `/ejecucion`, etc.
- `dashboard.kmfxedge.com` y `www.kmfxedge.com` ya redirigen a `kmfxedge.com`.
- El Launcher macOS y el paquete Windows están publicados desde la web propia.
- La conexión MT5 multi-cuenta funciona en el flujo probado con Darwinex y Orion.
- Hay CI, smoke de producción y workflow Windows launcher en GitHub.
- La parte de seguridad de connection keys ha avanzado: keys hash at rest, rechazo de keys en query, rate limit por key, CORS cerrado, no-key ingestion bloqueada en producción y límites de payload MT5.

La conclusión es clara: el núcleo técnico ya está bastante cerca. Lo que más bloquea producción de pago no es el launcher ni el dominio, sino **billing, entitlements, QA final y gobierno de release**.

## Estado Actual

### Web y dominio

- [x] `kmfxedge.com` funciona como dominio principal.
- [x] `www.kmfxedge.com` redirige a `kmfxedge.com`.
- [x] `dashboard.kmfxedge.com` redirige a `kmfxedge.com`.
- [x] Rutas limpias configuradas en `vercel.json`.
- [x] Headers básicos de seguridad activos: CSP, HSTS, `X-Frame-Options`, `nosniff`, Referrer Policy y Permissions Policy.
- [x] Vercel sirve la app vanilla actual; no hay migración Next.js todavía.
- [ ] `api.kmfxedge.com` sigue pendiente; el frontend aún permite `kmfx-edge-api.onrender.com`.
- [ ] Revisar si el CSP final debe eliminar `kmfx-edge-api.onrender.com` cuando exista `api.kmfxedge.com`.

### Auth, Supabase y Google

- [x] Supabase Auth acepta `kmfxedge.com`.
- [x] Google OAuth tiene marca y dominio autorizados.
- [x] Dominio personalizado de Supabase Auth queda aplazado por coste mensual.
- [ ] Probar de nuevo login Google, magic link y recovery desde producción tras cada cambio de auth.
- [ ] Revisar manualmente que `dashboard.kmfxedge.com` solo queda como alias temporal autorizado mientras interese.
- [ ] Confirmar que decisiones de permisos se leen desde `app_metadata`, no desde `user_metadata`.

### MT5, EA y Launcher

- [x] Flujo principal de usuario definido: Cuentas -> Conectar MT5 -> Launcher -> Instalar conector -> Sync.
- [x] Conexión EA con WebRequest a `https://mt5-api.kmfxedge.com`.
- [x] Descarga macOS desde la web propia.
- [x] Descarga Windows desde la web propia.
- [x] CI Windows genera y publica `downloads/KMFX-Launcher-Windows.zip`.
- [x] Launcher muestra cuentas detectadas y sincronizadas de forma más clara.
- [x] Multi-cuenta probado localmente con dos cuentas MT5.
- [x] El EA funciona con investor password en modo lectura.
- [x] Logs del EA reducidos a mensajes de estado útiles.
- [ ] Probar launcher Windows real en Windows 10/11 limpio.
- [ ] Probar launcher macOS en máquina limpia, sin tus instancias previas.
- [ ] Añadir confirmación de primera sincronización: nombre, tipo de cuenta y broker.
- [ ] Permitir marcar cuenta como Real, Demo, Funding o Challenge.
- [ ] Vincular cuenta MT5 a Funding journey existente o nuevo.
- [ ] Mostrar límites de plan en launcher y dashboard sin borrar cola local.
- [ ] Definir versión visible, checksum visible y estrategia de actualización del launcher.

### Backend y seguridad

- [x] CORS restringido a dominios reales.
- [x] Public MT5 writes sin key/bearer bloqueados en producción.
- [x] Keys en URL rechazadas por defecto.
- [x] Keys aceptadas por header/body para compatibilidad.
- [x] Keys almacenadas como hash.
- [x] Revocación y rate limit por `connection_key`.
- [x] Payloads MT5 demasiado grandes rechazados con `413 payload_too_large`.
- [x] Admin y plan limits mueven decisiones hacia env/app metadata.
- [ ] Auditar env vars reales de Render, Vercel, Cloudflare y GitHub.
- [ ] Añadir o documentar verificación JWT final: Supabase Auth remote verification vs `SUPABASE_JWT_SECRET`.
- [ ] Añadir rate limit complementario por IP/usuario para endpoints sensibles.
- [ ] Revisar logs históricos por si contienen keys antiguas y rotarlas si procede.
- [ ] Confirmar que endpoints admin devuelven `403` para usuarios no-admin verificados.

### Billing y planes

- [x] Tablas Supabase de billing preparadas y RLS revisado.
- [x] `plan_entitlements` sembrado para `free`, `core`, `pro`, `desk`.
- [ ] Pricing final no confirmado.
- [ ] Stripe Product y Prices no están creados como catálogo KMFX final.
- [ ] Customer Portal no está configurado.
- [ ] Webhooks Stripe no están implementados en producción.
- [ ] Endpoints `/api/billing/*` no están implementados.
- [ ] El frontend no consume billing status/entitlements.
- [ ] Los guards de producto no dependen aún de entitlements finales.

### CI, QA y release

- [x] GitHub Actions CI existe.
- [x] Workflow `Production Smoke` existe.
- [x] Workflow Windows launcher existe.
- [x] `CODEOWNERS` existe.
- [ ] Activar branch protection real en GitHub.
- [ ] Activar secret scanning y push protection.
- [ ] Exigir checks de CI antes de merge cuando el flujo esté estable.
- [ ] Ejecutar smoke manual antes de cada release.
- [ ] Crear tag de release cuando el MVP esté cerrado.

## Prioridad Inmediata

### Siguiente paso recomendado

Empezar por **Billing MVP + Entitlements**.

Motivo: dominio, MT5 y launcher ya tienen una base funcional. Sin billing y entitlements no hay producción comercial segura: cualquiera podría quedar con acceso incorrecto, y no hay forma clara de limitar cuentas, debug, risk editor o funciones premium.

La conexión directa con credenciales MT5 debe mantenerse bloqueada o marcada como pendiente hasta que exista vault seguro, rate limit, revocación y política de permisos. El flujo recomendado para producción debe seguir siendo EA/Launcher.

## Fase 1 - Cierre de Producto y Billing

Objetivo: poder vender Core/Pro sin improvisar permisos.

- [ ] Confirmar moneda: EUR, USD o ambas.
- [ ] Confirmar precio mensual Core.
- [ ] Confirmar precio anual Core.
- [ ] Confirmar precio mensual Pro.
- [ ] Confirmar precio anual Pro.
- [ ] Decidir trial: sin trial, trial con tarjeta o trial sin tarjeta.
- [ ] Decidir grace period para `past_due`.
- [ ] Decidir si Desk queda privado/contact-only.
- [ ] Confirmar política de refunds y cancelación.
- [ ] Crear Stripe Product `KMFX Edge`.
- [ ] Crear Prices con lookup keys:
  - `kmfx_core_monthly`
  - `kmfx_core_yearly`
  - `kmfx_pro_monthly`
  - `kmfx_pro_yearly`
- [ ] Configurar Customer Portal.
- [ ] Configurar webhook endpoint en Stripe.

Criterio de salida:

- Hay catálogo Stripe test mode completo.
- Hay decisiones de pricing suficientes para implementar Checkout.
- No quedan decisiones comerciales bloqueando ingeniería.

## Fase 2 - Backend Billing

Objetivo: que Stripe sea la fuente de verdad económica y Supabase refleje el acceso.

- [ ] Añadir env vars en Render:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_API_VERSION`
  - `STRIPE_PRICE_CORE_MONTHLY`
  - `STRIPE_PRICE_CORE_YEARLY`
  - `STRIPE_PRICE_PRO_MONTHLY`
  - `STRIPE_PRICE_PRO_YEARLY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Implementar `POST /api/billing/checkout`.
- [ ] Implementar `POST /api/billing/portal`.
- [ ] Implementar `POST /api/billing/webhook`.
- [ ] Implementar `GET /api/billing/status`.
- [ ] Verificar firma Stripe webhook usando raw body.
- [ ] Guardar `stripe_event_id` en `billing_events` para idempotencia.
- [ ] Upsert de `billing_customers`.
- [ ] Upsert de `billing_subscriptions`.
- [ ] Mapear estados Stripe a estado interno.
- [ ] Devolver entitlements desde `plan_entitlements`.
- [ ] Añadir tests de webhook idempotente.
- [ ] Añadir tests de status mapping.

Eventos mínimos:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Criterio de salida:

- Checkout test crea suscripción.
- Webhook test actualiza Supabase.
- `/api/billing/status` devuelve plan, estado y entitlements para el usuario autenticado.

## Fase 3 - Guards de Producto

Objetivo: que el acceso real dependa de permisos, no de botones visibles.

- [ ] Añadir helper backend de entitlements.
- [ ] Exigir auth antes de crear cuentas MT5.
- [ ] Exigir `launcherConnection` antes de emitir keys para Launcher/EA.
- [ ] Exigir `liveMt5Accounts` antes de permitir nuevas cuentas live.
- [ ] Bloquear creación de nuevas keys cuando el plan no lo permita.
- [ ] Añadir respuesta clara `billing_required`.
- [ ] Añadir respuesta clara `plan_limit_reached`.
- [ ] Añadir respuesta clara `entitlement_required`.
- [ ] Añadir respuesta clara `billing_past_due`.
- [ ] Conectar frontend con `/api/billing/status`.
- [ ] Añadir empty/blocked states sobrios en Cuentas, Risk, Funding, Journal, Strategies y Exports.
- [ ] Proteger debug/raw bridge para admin o entitlement `rawBridgeDebug`.
- [ ] Proteger Risk editor con `riskPolicyEditor`.
- [ ] Proteger auto-block local con `localAutoBlock`.
- [ ] Proteger exports con `exports`.

Criterio de salida:

- Free no puede conectar cuenta live.
- Core no puede superar 1 cuenta MT5 live.
- Pro no puede superar 3 cuentas MT5 live.
- Usuario sin permiso ve estado bloqueado claro, no errores técnicos.

## Fase 4 - MT5 UX Final

Objetivo: que un usuario no técnico conecte MT5 sin pensar en puertos, keys ni logs.

- [ ] Probar flujo completo en producción:
  - login
  - abrir Cuentas
  - descargar Launcher
  - instalar conector
  - añadir EA al gráfico
  - pegar key si es flujo manual
  - primer sync
  - cuenta visible en dashboard
- [ ] Añadir modal de confirmación tras primera sincronización.
- [ ] Permitir editar nombre de cuenta.
- [ ] Permitir elegir tipo: Demo, Real, Funding, Challenge.
- [ ] Si es Funding, permitir vincular a journey existente.
- [ ] Añadir estado de sincronización reciente y stale más claro.
- [ ] Añadir guía breve dentro de Cuentas para WebRequest.
- [ ] Añadir checksum visible para descargas.
- [ ] Probar Windows launcher en Windows real.
- [ ] Probar macOS launcher en máquina limpia.

Criterio de salida:

- Un usuario nuevo puede conectar una cuenta sin ayuda.
- El dashboard distingue cuentas conectadas, pendientes, stale y bloqueadas por plan.
- Funding puede usar una cuenta MT5 como origen real.

## Fase 5 - Seguridad, Infra y Gobierno

Objetivo: reducir riesgo operativo antes de abrir a usuarios reales.

- [ ] Activar secret scanning en GitHub.
- [ ] Activar push protection en GitHub.
- [ ] Activar Dependabot alerts/security updates.
- [ ] Configurar branch protection para `main`.
- [ ] Exigir checks:
  - `Backend and connector tests`
  - `Static app checks`
  - `Build Windows launcher`
- [ ] Revisar colaboradores, deploy keys, GitHub Apps y webhooks.
- [ ] Revisar secrets en GitHub Actions.
- [ ] Revisar env vars en Vercel: solo valores públicos.
- [ ] Revisar env vars en Render: secretos solo backend.
- [ ] Revisar Cloudflare Worker y DNS.
- [ ] Revisar Supabase Auth providers, redirect URLs y RLS.
- [ ] Configurar alerta mínima de Render/API caído.
- [ ] Documentar rollback web, backend, launcher y billing.

Criterio de salida:

- No hay secretos backend en frontend/Vercel.
- `main` no acepta cambios críticos sin checks.
- Hay rollback operativo documentado.

## Fase 6 - QA de Release

Objetivo: validar un viaje real de usuario antes de cobrar.

- [ ] Ejecutar `python3 -m unittest discover -s tests`.
- [ ] Ejecutar CI en GitHub y confirmar verde.
- [ ] Ejecutar `Production Smoke`.
- [ ] Probar `https://kmfxedge.com`.
- [ ] Probar redirección desde `www` y `dashboard`.
- [ ] Probar login Google.
- [ ] Probar recovery/password reset.
- [ ] Probar `/api/accounts/snapshot` sin auth: debe requerir auth.
- [ ] Probar `/api/mt5/policy` sin key: debe rechazar.
- [ ] Probar `/api/mt5/sync` sin key: debe rechazar.
- [ ] Probar Checkout test success/cancel.
- [ ] Probar Customer Portal test.
- [ ] Probar webhook replay/idempotencia.
- [ ] Probar launcher con backend caído: cola crece.
- [ ] Probar launcher con backend recuperado: cola drena.
- [ ] Probar dashboard desktop completo.
- [ ] Probar mobile básico, aunque no sea rediseño final.
- [ ] Revisar Terms, Privacy, Refunds y Risk disclaimer.

Criterio de salida:

- Un usuario puede registrarse, pagar en test mode, conectar MT5 y ver datos.
- No queda ningún P0 abierto.

## Fase 7 - Go Live

Objetivo: pasar de beta técnica a producción controlada.

- [ ] Congelar `main`.
- [ ] Crear tag `v0.1.0-production-mvp`.
- [ ] Cambiar Stripe a live keys.
- [ ] Crear productos/prices live con las mismas lookup keys.
- [ ] Configurar webhook live.
- [ ] Configurar Customer Portal live.
- [ ] Confirmar Render env live.
- [ ] Confirmar Supabase production.
- [ ] Confirmar Vercel production branch `main`.
- [ ] Ejecutar smoke production.
- [ ] Hacer compra real de prueba controlada.
- [ ] Monitorizar Render logs, Stripe events, Supabase writes y Vercel traffic.

Criterio de salida:

- Un usuario real puede autenticarse, suscribirse, conectar MT5 y usar el dashboard sin intervención manual.

## Pistas Post-Lanzamiento

### Next.js + shadcn

- [ ] Crear sidecar Next.js sin bloquear la app vanilla.
- [ ] Migrar primero dashboard read-only.
- [ ] Portar AppShell, rutas, sidebar y topbar.
- [ ] Tipar contratos de datos.
- [ ] Rehacer charts y tablas con componentes mantenibles.
- [ ] Hacer cutover solo con paridad visual y funcional.

### Launcher distribution

- [ ] Firma macOS con Developer ID.
- [ ] Notarización macOS.
- [ ] Windows code signing.
- [ ] Instalador `.msi` o `.exe` con Inno/WiX.
- [ ] Auto-update o aviso de nueva versión.
- [ ] `downloads.kmfxedge.com` o bucket dedicado.

### Conexión directa MT5

- [ ] Definir vault seguro para credenciales.
- [ ] Separar investor/master password.
- [ ] Auditar riesgos para prop firms.
- [ ] Añadir rate limit y revocación.
- [ ] Lanzar solo para usuarios/planes permitidos.

### Producto

- [ ] Completar secciones Risk Engine y Ejecución.
- [ ] Pulir Funding con journeys reales.
- [ ] Mejorar Journal/Strategies con datos live.
- [ ] Revisar mobile.
- [ ] Añadir onboarding guiado para primer usuario.

## Orden de Trabajo Recomendado Desde Aquí

1. Cerrar pricing y catálogo Stripe.
2. Implementar backend billing.
3. Conectar entitlements al frontend y al backend.
4. QA del flujo MT5 usuario final.
5. Activar branch protection y release governance.
6. Ejecutar smoke completo.
7. Tag `v0.1.0-production-mvp`.
8. Lanzamiento controlado.

## Qué Se Puede Saltar Por Ahora

- Dominio personalizado de Supabase Auth, por coste mensual.
- Firma/notarización Apple, porque has aceptado el aviso de descarga.
- Windows code signing, mientras el primer paquete funcione y se explique el aviso.
- Migración Next.js completa.
- `api.kmfxedge.com`, si se documenta temporalmente que Render sigue como backend interno y `mt5-api.kmfxedge.com` cubre el EA.

## Definition of Done del MVP

- [ ] Auth funciona en `kmfxedge.com`.
- [ ] Billing test funciona end-to-end.
- [ ] Entitlements gobiernan cuentas y features premium.
- [ ] Launcher conecta una cuenta nueva en producción.
- [ ] EA sincroniza con `mt5-api.kmfxedge.com`.
- [ ] Dashboard muestra datos live del usuario correcto.
- [ ] Usuarios normales no ven cuentas admin ni de otros usuarios.
- [ ] CI y smoke están verdes.
- [ ] Legal mínimo está publicado.
- [ ] Rollback está documentado.
