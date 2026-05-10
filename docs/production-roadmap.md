# Roadmap de Producción KMFX Edge

Última revisión: 2026-05-09
Rama revisada: `main`
Commit base: `2ac0eb9 Fix auth captcha and metric study UX`
Auditoria actualizada: `docs/production-readiness-audit.md`
Objetivo: llevar KMFX Edge a producción comercial lo antes posible, sin bloquear el lanzamiento por la migración a Next.js.

## Resumen Ejecutivo

KMFX Edge ya tiene una base real de producción:

- `https://kmfxedge.com` está desplegado en Vercel y responde `200`.
- Vercel despliega desde `main`; el frontend actual incluye recuperacion de cache legacy en `6f4f05f`.
- Render responde en `https://kmfx-edge-api.onrender.com/health`.
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
- [x] Rutas limpias configuradas en `vercel.json` y cache legacy retirada para evitar pantallas sin CSS.
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

- [x] Flujo principal de usuario definido: Cuentas -> Conectar cuenta -> Launcher -> Instalar conector -> Sync.
- [x] Conexión EA con WebRequest a `https://mt5-api.kmfxedge.com`.
- [x] Descarga macOS desde la web propia.
- [x] Descarga Windows desde la web propia.
- [x] CI Windows genera y publica `downloads/KMFX-Launcher-Windows.exe`.
- [x] Launcher muestra cuentas detectadas y sincronizadas de forma más clara.
- [x] Launcher prioriza nombres legibles de broker/login y oculta backups/carpetas antiguas.
- [x] Instalador del Launcher deja `.ex5`, `.mq5`, preset y `kmfx_connection.conf`; el EA lee la key desde archivo.
- [x] Cola local del Launcher probada: snapshot/journal sobreviven a backend caído y drenan al recuperarse.
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
- [x] Añadir o documentar verificación JWT final: Supabase Auth remote verification vs `SUPABASE_JWT_SECRET`.
- [x] Añadir rate limit complementario por IP/usuario para endpoints sensibles.
- [ ] Revisar logs históricos por si contienen keys antiguas y rotarlas si procede.
- [x] Confirmar que endpoints admin devuelven `403` para usuarios no-admin verificados.

### Billing y planes

- [x] Tablas Supabase de billing preparadas y RLS revisado.
- [x] `plan_entitlements` sembrado para `free`, `core`, `pro`, `desk`.
- [x] Pricing final confirmado para MVP.
- [x] Stripe Product y Prices creados como catálogo KMFX final.
- [ ] Customer Portal no está configurado.
- [x] Webhooks Stripe implementados en backend; falta configurar endpoint/secreto live antes de cobrar.
- [x] Contrato inicial `GET /api/billing/status` implementado con plan, estado y entitlements desde `app_metadata`.
- [x] Endpoints mutables `/api/billing/checkout`, `/api/billing/portal` y `/api/billing/webhook` implementados.
- [x] El frontend consume `/api/billing/status` para Cuentas y superficies premium.
- [x] Los guards de producto principales dependen de entitlements y no de nombre de plan.

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

### Auditorias especializadas preproduccion

Estas auditorias no sustituyen al QA funcional; son paquetes de cierre para reducir riesgo antes de usuarios reales.

- [ ] Ejecutar `codex-security:security-scan` repository-wide o sobre el diff final antes de go live.
  - Alcance: bridge localhost, Supabase/Auth, Cloudflare proxy MT5, CORS, account keys, billing/entitlements, endpoints admin y lógica financiera.
  - Salida esperada: threat model, finding discovery, validacion, attack-path analysis y reporte markdown con hallazgos P0/P1/P2.
- [ ] Ejecutar auditoria UX con `audit` + `harden` + `polish` + `adapt`.
  - Alcance: dashboard desktop completo, estados vacios/error/bloqueados, accesibilidad, responsive final antes de produccion, consistencia KMFX/shadcn/Apple HIG.
  - Salida esperada: issues priorizados y correcciones aplicadas solo cuando esten validadas.
- [ ] Ejecutar auditoria frontend visual con `frontend-design`, `arrange`, `typeset`, `clarify`, `optimize` y `design-audit`.
  - Alcance: `index.html`, `styles-v2.css`, `js/modules/*`, flujo Cuentas/Launcher, Billing states, Risk/Funding/Journal.
  - Salida esperada: no quedan patrones legacy visibles, textos internos ni roturas de layout desktop.
- [ ] Ejecutar auditoria launcher macOS con `build-macos-apps:packaging-notarization` y `build-macos-apps:signing-entitlements`.
  - Alcance: bundle `.app`, DMG/ZIP, Info.plist, permisos, entitlements, Gatekeeper y estructura de distribucion.
  - Nota: notarizacion Apple sigue siendo opcional por decision de producto, pero la validacion de packaging/signing no se debe saltar.
- [ ] Ejecutar revision `cloudflare:workers-best-practices`.
  - Alcance: `cloudflare/mt5-api-proxy.js`, secrets, headers, streaming/body limits, logs, CORS, errores y observabilidad.
- [ ] Ejecutar revision `supabase:supabase-postgres-best-practices`.
  - Alcance: migrations de billing/accounts, RLS, indices, policies, funciones security definer, lecturas por usuario y tablas de eventos.
- [ ] Ejecutar `vercel:verification` o `browser-use` para prueba visual final en navegador real.
  - Alcance: rutas limpias, login, Cuentas, Dashboard, Billing state, descarga launcher, estados bloqueados y errores.

### Dashboard y contrato de datos

- [x] El frontend consume `/api/accounts/snapshot` con guard de propiedad.
- [x] El adaptador MT5 normaliza `dashboard_payload`, `reportMetrics`, `riskSnapshot`, `symbolSpecs`, trades, posiciones e historial.
- [x] Dashboard, Cuentas, Operaciones, Calendario, Insights, Risk Engine, Capital y Herramientas ya tienen ruta live cuando `payloadSource=mt5_sync_live`.
- [x] Fixture de contrato con dos cuentas MT5 live y validacion automatica inicial de KPIs.
- [x] Smoke render inicial certifica que las vistas principales no caen a mock cuando hay cuenta live activa.
- [x] Cuentas queda cubierta para estados `pending`, `stale`, `revoked`, `plan_limited` y `error`.
- [x] Risk/Funding quedan cubiertos para cuenta sin snapshot/policy, snapshot stale y cuenta funding no vinculada.
- [x] Estados bloqueados por plan cubiertos en Cuentas, Risk, Funding, Journal AI, Strategies y Exports.
- [ ] Falta persistir o decidir producto para Journal, Estrategias, Funding journeys y revisiones post-trade, que hoy mezclan live con entrada manual del usuario.
- [ ] Falta completar la pasada final de textos visibles fuera de Cuentas/Estudio: no debe quedar `workspace`, `local`, `bridge`, `debug`, `mock` o copy tecnico fuera de modo admin.

## Prioridad Inmediata

### Siguiente paso recomendado tras auditoria

Antes de billing, cerrar una pasada corta de **contrato de datos live y QA de producto**:

- retirar textos internos visibles restantes para usuario final como `workspace`, `sesion local`, `bridge local` o mensajes tecnicos fuera de modo admin;
- mantener y ampliar el render smoke por pagina con estados degradados;
- certificar seccion por seccion que metricas vienen de MT5 live, backend/riskSnapshot, workspace local o entrada manual;
- probar launcher macOS y Windows en maquina limpia.

Despues de eso, empezar por **Billing MVP + Entitlements**.

Motivo: dominio, MT5 y launcher ya tienen una base funcional. Sin billing y entitlements no hay produccion comercial segura: cualquiera podria quedar con acceso incorrecto, y no hay forma clara de limitar cuentas, debug, risk editor o funciones premium.

La conexión directa con credenciales MT5 debe mantenerse bloqueada o marcada como pendiente hasta que exista vault seguro, rate limit, revocación y política de permisos. El flujo recomendado para producción debe seguir siendo EA/Launcher.

### Checkpoint 2026-05-09

- Login con email/password, signup, recovery y reset usan Turnstile; `index.html` ya incluye la site key publica para que Supabase Auth reciba `captchaToken`.
- Estudio de métricas usa cards estables por categoría, sin slider horizontal que se corte o se reinicie.
- Cada card de métrica muestra fórmula, fuente, confianza y para qué sirve al trader.
- Detalles de cuenta es más ancho, permite scroll y oculta warnings técnicos crudos para usuario final.
- Launcher mantiene cola local de snapshot/journal con backend caído y la drena al recuperarse.
- `python3 -m unittest discover -s tests` pasa con 298 tests.
- Health externo verificado tras `6ecd97f`: Vercel `/dashboard`, Render `/health`, Worker `mt5-api` `/health` y Supabase Auth protegido responden como esperado.
- Supabase Security Advisor sigue con un unico warning abierto: activar leaked password protection en Auth. Performance Advisor requiere reautenticacion del conector o CLI local.
- Copy visible reforzado tras `d7e74fd`: se retiraron restos de `ledger`, `local`, `bridge MT5`, `Usuario local`, `Panel source trace` y labels inglesas de Mercado; Mercado escapa valores dinamicos antes de renderizar.
- Flujo MT5 reforzado con errores orientados a usuario final: WebRequest, KMFXKey ausente/no reconocida/revocada, conector desactualizado, rate limit, plan sin permiso y servidor de KMFX temporalmente no disponible.
- Añadida fase de corrección ortográfica completa del dashboard y normalización visual de Estudio de métricas con el patrón de "Métricas críticas del dashboard".
- Estudio de métricas mantiene la misma retícula de 3 columnas en métricas críticas y categorías; Funding retira restos visibles de `Ledger`, `Refund`, `Fees`, `Cashflow`, `payouts` y el disclaimer final queda en español.
- Quedan fuera del commit artefactos duplicados no relacionados en `downloads/`.

## Fase 1 - Cierre de Producto y Billing

Objetivo: poder vender Core/Pro sin improvisar permisos.

Bloque previo obligatorio:

- [x] Crear contrato inicial live de `/api/accounts/snapshot`.
- [ ] Pasada final de textos visibles para usuario final en secciones restantes.
- [ ] Corrección ortográfica completa del dashboard en español antes del QA final.
- [x] Estudio de métricas: todas las cards deben compartir patrón visual, espaciado, footer, altura y contenido didáctico de "Métricas críticas del dashboard".
- [x] Render smoke inicial de metricas live por seccion con fixture.
- [x] Render smoke de Cuentas para estados degradados: pending, stale, revoked, plan-limited y error.
- [x] Render smoke de estados degradados en Risk/Funding: sin policy/snapshot, stale y funding no vinculado.
- [x] Render smoke de billing bloqueado cuando se implemente status/entitlements.
- [ ] QA macOS limpio.
- [ ] QA Windows 10/11 limpio.

- [x] Confirmar moneda: EUR.
- [x] Confirmar precio mensual Basic/Core: 15 EUR.
- [x] Confirmar precio anual Basic/Core: 150 EUR.
- [x] Confirmar precio mensual Pro: 25 EUR.
- [x] Confirmar precios finales MVP: Basic 15/150 EUR, Pro 25/250 EUR, Unlimited 39/390 EUR.
- [x] Decidir trial: 7 dias sin tarjeta.
- [x] Decidir grace period para `past_due`: 7 dias.
- [x] Decidir si Desk queda privado/contact-only.
- [x] Confirmar política de refunds y cancelación: 14 dias en primera compra sin abuso o fallo tecnico no resuelto.
- [x] Crear Stripe Product `KMFX Edge`: `prod_UT7nzmgj3Eg3Zv`.
- [x] Crear Prices live bajo `KMFX Edge` con Price IDs documentados en `docs/stripe-product-catalog.md`.
- [ ] Completar lookup keys/metadata de esos Prices en Stripe Dashboard/API:
  - `kmfx_basic_monthly`
  - `kmfx_basic_yearly`
  - `kmfx_pro_monthly`
  - `kmfx_pro_yearly`
  - `kmfx_unlimited_monthly`
  - `kmfx_unlimited_yearly`
- [ ] Configurar Customer Portal.
- [ ] Configurar webhook endpoint en Stripe.

Criterio de salida:

- Hay catálogo Stripe creado y documentado.
- Lookup keys/metadata, Customer Portal y webhook endpoint quedan configurados antes de cobrar.
- No quedan decisiones comerciales bloqueando QA de billing.

## Fase 2 - Backend Billing

Objetivo: que Stripe sea la fuente de verdad económica y Supabase refleje el acceso.

- [x] Añadir env vars en Render:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_API_VERSION`
  - `STRIPE_PRICE_CORE_MONTHLY`
  - `STRIPE_PRICE_CORE_YEARLY`
  - `STRIPE_PRICE_PRO_MONTHLY`
  - `STRIPE_PRICE_PRO_YEARLY`
  - `STRIPE_PRICE_UNLIMITED_MONTHLY`
  - `STRIPE_PRICE_UNLIMITED_YEARLY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- [x] Implementar `POST /api/billing/checkout`.
- [x] Implementar `POST /api/billing/portal`.
- [x] Implementar `POST /api/billing/webhook`.
- [x] Implementar `GET /api/billing/status` como contrato inicial sin Stripe live.
- [x] Verificar firma Stripe webhook usando raw body.
- [x] Guardar `stripe_event_id` en `billing_events` para idempotencia.
- [x] Reservar eventos Stripe como reintentables hasta que el procesamiento final marque `processed` o `ignored`, evitando duplicados concurrentes durante la ventana de procesamiento.
- [x] Upsert de `billing_customers`.
- [x] Upsert de `billing_subscriptions`.
- [x] Mapear estados Stripe a estado interno.
- [x] Devolver entitlements equivalentes a `plan_entitlements` desde el contrato backend inicial.
- [x] Añadir tests de webhook idempotente.
- [x] Añadir tests de status mapping.

Eventos mínimos:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.payment_action_required`

Checkpoint 2026-05-09:

- Contratos locales cubiertos con tests para `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated` y `customer.subscription.deleted`.
- Queda pendiente el replay end-to-end desde Stripe test/live controlado contra el webhook configurado.

Checkpoint 2026-05-10:

- Emails transaccionales de billing conectados a los webhooks: confirmacion de compra, pago fallido/pago con accion requerida y cancelacion de suscripcion.
- El envio de email queda como side effect no bloqueante: el plan se sincroniza aunque Resend falle, y el resultado queda incluido en la respuesta interna del webhook.
- Logs de emails enmascaran el destinatario y usan `stripe_event_id` como tag de soporte.

Criterio de salida:

- Checkout test crea suscripción.
- Webhook test actualiza Supabase.
- `/api/billing/status` devuelve plan, estado y entitlements para el usuario autenticado.

Checkpoint 2026-05-09:

- Render backend `kmfx-edge-api` tiene Stripe secret, webhook secret, product ID, Price IDs, Supabase service role y Resend configurados.
- `NEXT_PUBLIC_APP_URL`, trial de 7 dias y rutas success/cancel se fijaron explicitamente en Render.
- Deploy Render `dep-d7v720d0lvsc73fj4me0` quedo live y `/health` responde.

## Fase 3 - Guards de Producto

Objetivo: que el acceso real dependa de permisos, no de botones visibles.

- [x] Añadir helper backend de entitlements para status/guards iniciales.
- [x] Exigir auth antes de crear cuentas MT5.
- [x] Exigir `launcherConnection` antes de emitir keys para Launcher/EA.
- [x] Exigir `liveMt5Accounts` antes de permitir nuevas cuentas live.
- [x] Bloquear creación de nuevas keys cuando el plan no lo permita.
- [x] Añadir respuesta clara `billing_required`.
- [x] Añadir respuesta clara `plan_limit_reached`.
- [x] Añadir respuesta clara `entitlement_required`.
- [x] Añadir respuesta clara `billing_past_due`.
- [x] Conectar frontend con `/api/billing/status` para mostrar plan, acceso y avisos de billing.
- [x] Añadir empty/blocked states sobrios en Cuentas, Risk, Funding, Journal, Strategies y Exports.
- [x] Proteger debug/raw bridge para admin o entitlement `rawBridgeDebug`.
- [x] Proteger Risk editor con `riskPolicyEditor`.
- [x] Proteger auto-block local con `localAutoBlock`.
- [x] Proteger exports con `exports`.

Criterio de salida:

- Free no puede conectar cuenta live.
- Core no puede superar 2 cuentas MT5 live.
- Pro no puede superar 5 cuentas MT5 live.
- Unlimited no tiene limite comercial de cuentas MT5 live.
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
- [x] Añadir estado de sincronización reciente, stale, key revocada y bloqueo por plan más claro en Cuentas.
- [ ] Añadir guía breve dentro de Cuentas para WebRequest.
- [ ] Añadir checksum visible para descargas.
- [ ] Probar Windows launcher en Windows real.
- [ ] Probar macOS launcher en máquina limpia.

Criterio de salida:

- Un usuario nuevo puede conectar una cuenta sin ayuda.
- El dashboard distingue cuentas conectadas, pendientes, stale y bloqueadas por plan.
- Funding puede usar una cuenta MT5 como origen real.

## Fase 5 - Auditorias Especializadas

Objetivo: cerrar los riesgos que no se ven en el smoke funcional.

- [ ] Seguridad completa con `codex-security:security-scan`.
  - Bridge localhost y launcher.
  - Supabase Auth, RLS, app_metadata/user_metadata y billing.
  - Cloudflare proxy MT5.
  - CORS, headers, account keys, revocacion y rate limits.
  - Endpoints admin y rutas de ingest MT5.
- [ ] UX y robustez con `audit`, `harden`, `polish` y `adapt`.
  - Estados vacios, carga, error, bloqueado y sin permisos.
  - Accesibilidad, foco, contraste, scroll y desktop/responsive.
  - Textos de usuario final sin jerga tecnica.
- [ ] Frontend visual con `frontend-design`, `arrange`, `typeset`, `clarify`, `optimize` y `design-audit`.
  - Consistencia KMFX Edge, shadcn y Apple HIG.
  - Sin layouts legacy, titulos antiguos, lineas decorativas ni copy interno.
  - Performance razonable de charts, modales y render de secciones principales.
- [ ] Launcher macOS con `build-macos-apps:packaging-notarization` y `build-macos-apps:signing-entitlements`.
  - Validar bundle, plist, permisos, entitlements, firma local/ad hoc y comportamiento Gatekeeper.
  - Confirmar que el aviso de Apple es aceptable si no se notariza, pero sin fallos de estructura del paquete.
- [ ] Cloudflare con `cloudflare:workers-best-practices`.
  - Revisar `cloudflare/mt5-api-proxy.js`, body limits, CORS, logs, errores y secretos.
- [ ] Supabase con `supabase:supabase-postgres-best-practices`.
  - Revisar migrations, RLS, indices, policies, funciones y tablas de billing/accounts.
- [ ] Verificacion visual final con `vercel:verification` o `browser-use`.
  - Probar rutas reales, modales, login, Cuentas, Billing state y descargas.

Criterio de salida:

- No quedan P0/P1 abiertos en seguridad.
- Los P2 aceptados tienen mitigacion o issue documentado.
- El dashboard no muestra copy tecnico a usuario normal.
- Launcher macOS tiene packaging verificado aunque no se notarice.
- Cloudflare Worker y Supabase quedan revisados contra reglas de produccion.

## Fase 6 - Seguridad, Infra y Gobierno

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

## Fase 7 - QA de Release

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
- [x] Probar launcher con backend caído: cola crece.
- [x] Probar launcher con backend recuperado: cola drena.
- [ ] Probar dashboard desktop completo.
- [ ] Probar mobile básico, aunque no sea rediseño final.
- [x] Revisar Términos, Privacidad, Reembolsos y disclaimer de riesgo.

Criterio de salida:

- Un usuario puede registrarse, pagar en test mode, conectar MT5 y ver datos.
- No queda ningún P0 abierto.

## Fase 8 - Go Live

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

- [ ] Completar secciones Risk Engine y Ejecucion.
  - [x] Ejecucion evita backlog historico de tags: prioriza hasta 8 cierres recientes/de impacto y mantiene metricas MT5 con todo el historico.
  - [x] Popup global de revision post-trade para nuevos cierres, aunque el usuario este en otra seccion.
  - [ ] Persistir revisiones post-trade en backend por usuario/cuenta antes de uso comercial serio.
- [ ] Pulir Funding con journeys reales.
- [ ] Mejorar Journal/Strategies con datos live.
- [ ] Revisar mobile.
- [ ] Añadir onboarding guiado para primer usuario.

## Orden de Trabajo Recomendado Desde Aquí

1. Cerrar configuración operativa Stripe: lookup keys/metadata, Customer Portal, webhook endpoint y env vars Render.
2. QA del flujo MT5/Launcher con usuario final: macOS limpio, Windows real, descarga, apertura, key, primer sync y cuenta visible.
3. Pasada final desktop de UX/copy en secciones restantes, sin tocar el rediseño mobile profundo hasta preproducción.
4. Ejecutar auditorias especializadas: seguridad, UX, launcher, Cloudflare y Supabase.
5. Activar branch protection, secret scanning, push protection y release governance.
6. Ejecutar smoke completo: auth, billing, MT5, métricas, legal, descargas y errores.
7. Tag `v0.1.0-production-mvp`.
8. Lanzamiento controlado.

## Qué Se Puede Saltar Por Ahora

- Dominio personalizado de Supabase Auth, por coste mensual.
- Notarización Apple, porque has aceptado el aviso de descarga.
- Firma Developer ID completa, si se valida antes que el paquete abre correctamente y el aviso queda documentado.
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
- [x] Legal mínimo está publicado.
- [ ] Rollback está documentado.
