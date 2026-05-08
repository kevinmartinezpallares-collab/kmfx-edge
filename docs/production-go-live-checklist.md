# KMFX Edge - Checklist Maestro de Produccion

Ultima revision: 2026-05-08
Rama objetivo: `main`
Objetivo: cerrar KMFX Edge como SaaS usable por traders reales, lanzar produccion controlada y preparar migracion a Next.js sin romper el producto actual.

## Regla de Trabajo

- Cada fase debe cerrar con commit y push.
- No se mezcla migracion a Next.js con fixes criticos de produccion.
- No se lanza conexion directa con password MT5 hasta tener vault, permisos, rate limits y auditoria.
- El flujo principal de produccion es: Dashboard -> Launcher -> EA read-only -> `https://mt5-api.kmfxedge.com` -> Backend -> Dashboard.
- Admin conserva acceso completo, pero usuarios normales dependen de entitlements.
- Ninguna metrica o politica inferida/default debe mostrarse como limite real.

## Modo Cascada

Codex puede avanzar en cascada cuando tenga acceso a los conectores necesarios y no haya una decision de negocio pendiente.

Puede hacer sin pedir cada paso:

- editar codigo y documentacion;
- ejecutar tests, smoke checks y auditorias locales;
- usar GitHub, Vercel, Render, Supabase, Cloudflare y Stripe si los conectores estan autorizados;
- crear commits y hacer push;
- actualizar roadmaps/checklists;
- verificar descargas, endpoints, headers y deploys;
- preparar scripts, fixtures y tests;
- revisar logs y diagnosticar errores.

Requiere aprobacion explicita:

- comprar addons o cambiar planes de pago;
- activar Stripe live o cambiar claves live;
- crear/cambiar DNS critico;
- borrar datos reales de usuarios;
- revocar o rotar secrets de produccion;
- activar/desactivar funciones para todos los usuarios;
- hacer cambios destructivos en Supabase;
- congelar `main`, crear tag final o anunciar go live.

## Fase 0 - Control de Base

Objetivo: asegurar que partimos de una base estable.

- [ ] `main` actualizado localmente.
- [ ] Worktree revisado y cambios ajenos identificados.
- [ ] CI actual revisado.
- [ ] Render/Vercel/Cloudflare/Supabase responden health.
- [ ] Descargas Launcher macOS/Windows responden `200`.
- [ ] MT5 smoke actual documentado: cuenta conecta, EA read-only y cierre de Launcher no corta sync.

Criterio de salida:

- Base lista para empezar fixes sin pisar otros hilos.

## Fase 1 - Contrato de Metricas

Objetivo: que las metricas sean fiables antes de UI nueva, billing final o Next.js.

- [x] Crear o implementar `metric_registry` con:
  - `id`
  - `label`
  - `source`
  - `formula`
  - `unit`
  - `confidence`
  - `policy_source`
  - `refresh`
  - `visual`
- [x] EA emite `ticket`, `position_id`, `order_id`, `deal_id` como string.
- [x] EA emite precios usando `SYMBOL_DIGITS` por simbolo, no `_Digits` del grafico.
- [x] Posiciones sin SL se marcan como `risk_state = "unbounded"` o `missing_stop_loss`.
- [x] Ninguna posicion sin SL aparece como riesgo `0`.
- [x] `floating_pnl` por simbolo usa `floating_pnl` o `profit + swap`.
- [x] Separar `gross_profit_factor` y `net_profit_factor`.
- [x] Dashboard usa profit factor neto para evaluar edge real.
- [x] VaR/RoR muestran muestra, metodo y supuesto.
- [x] Politicas default se muestran como referencia, no como politica real.
- [x] Tests con IDs > `2^31` y > `2^53`.
- [x] Tests de parcialidades, comisiones y swaps.
- [x] Test de no-default-policy: ningun default genera breach real.

Criterio de salida:

- Cada metrica critica tiene fuente, formula y confianza.
- No hay defaults internos pintando rojo como si fueran reglas del usuario.

## Fase 2 - Acceso y Paywall

Objetivo: que el producto real este gobernado por plan y permisos.

- [x] Bloquear dashboard real a usuarios sin plan activo.
- [x] Mostrar demo segura o pantalla de suscripcion.
- [x] Admin mantiene acceso completo sin plan aplicado.
- [x] Basic/Core limita a 2 cuentas MT5.
- [x] Pro limita a 5 cuentas MT5.
- [x] Unlimited sin limite comercial de cuentas.
- [x] Bloquear creacion de keys si el plan no permite MT5.
- [x] Bloquear snapshot live y payloads MT5 existentes cuando el plan no permite MT5.
- [x] Scrub de balances/PnL en registro de cuentas cuando el plan no permite MT5.
- [x] Bloquear regeneracion de keys si no existe entitlement MT5.
- [x] Estados visibles:
  - demo
  - sin plan
  - plan activo
  - pago pendiente
  - plan limitado
  - key revocada
  - cuenta stale
- [x] No mostrar datos admin/mock como si fueran datos reales de usuario.

Criterio de salida:

- Usuario sin permiso ve un estado claro, no una app rota ni datos indebidos.

## Fase 3 - Billing Completo

Objetivo: que Stripe sea fuente economica y Supabase refleje acceso.

- [x] Confirmar catalogo final de productos KMFX.
- [ ] Confirmar lookup keys de Stripe:
  - `kmfx_basic_monthly`
  - `kmfx_basic_yearly`
  - `kmfx_pro_monthly`
  - `kmfx_pro_yearly`
  - `kmfx_unlimited_monthly`
  - `kmfx_unlimited_yearly`
- [ ] Configurar Customer Portal.
- [ ] Configurar webhook endpoint.
- [ ] Revisar recibos automaticos de Stripe.
- [ ] Confirmar emails de compra con Resend.
- [x] Probar contrato local checkout success/cancel.
- [ ] Probar pago fallido.
- [ ] Probar cancelacion.
- [ ] Probar cambio de plan.
- [ ] Probar renovacion.
- [ ] Probar cupon comunidad 100%.
- [x] Asegurar que webhooks solo afectan productos KMFX.
- [x] Verificar idempotencia `stripe_event_id`.
- [x] Verificar `GET /api/billing/status`.
- [x] Verificar `/api/billing/checkout`.
- [x] Verificar `/api/billing/portal`.
- [x] Verificar `/api/billing/webhook`.
- [ ] Env vars live/test revisadas en Render.

Notas 2026-05-08:

- Stripe read-only scan confirma el producto live `prod_UT7nzmgj3Eg3Zv` y los seis Prices KMFX esperados.
- Stripe read-only search no devuelve lookup keys `kmfx_basic_*`/`kmfx_pro_*`; mientras se configuran, Render debe usar Price IDs.
- Checkout queda preparado con trial de 7 dias sin tarjeta por defecto (`STRIPE_TRIAL_PERIOD_DAYS=7`, `STRIPE_TRIAL_REQUIRES_CARD=false`).
- Success/cancel vuelven a `/ajustes?tab=subscription`, y la UI muestra el estado de retorno sin caer al dashboard.
- Webhooks de invoice (`invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`) sincronizan la suscripcion KMFX asociada si pertenece al producto/metadata KMFX.

Criterio de salida:

- Un usuario puede pagar en test mode y su plan/entitlements cambian correctamente.

## Fase 4 - Seguridad

Objetivo: no abrir superficie sensible sin controles.

- [x] Revisar endpoints criticos.
- [x] Validar auth real en backend.
- [x] Confirmar decisiones desde `app_metadata`/backend, no headers falsos remotos.
- [x] Confirmar `X-KMFX-User-*` solo se confia desde localhost si aplica.
- [x] Proteger creacion de conexiones MT5.
- [x] Rate limit por `connection_key`.
- [x] Rate limit complementario por usuario/IP en endpoints sensibles.
- [x] Logs sin keys completas, JWTs ni secrets.
- [ ] Revisar logs historicos y rotar keys expuestas si procede.
- [x] Confirmar endpoints admin devuelven `403` para no-admin.
- [x] Revisar Supabase RLS.
- [ ] Activar Supabase Auth leaked password protection.
- [x] Revisar Cloudflare Worker `mt5-api`.
- [x] Revisar CORS.
- [x] Revisar headers Vercel.
- [ ] Activar secret scanning GitHub.
- [ ] Activar push protection GitHub.
- [ ] Activar Dependabot alerts/security updates.
- [ ] Branch protection en `main`.
- [ ] Validacion centralizada de payloads en endpoints state-changing.
- [ ] Auditoria XSS de todos los `innerHTML` con datos de usuario/MT5.
- [ ] Definir postura CSRF para Next.js si se usan cookies/sesiones server-side.
- [ ] Ejecutar audit de dependencias cuando exista manifest/lockfile del frontend Next.
- [ ] Alertas anti-abuso: bursts de registros, creacion de keys, writes rechazados y basura en tablas de usuario.

Notas 2026-05-08:

- Backend revisado para que permisos sensibles dependan de bearer verificado, `app_metadata` y decisiones server-side.
- `X-KMFX-User-*` queda limitado a requests locales; Cloudflare Worker elimina esos headers antes de reenviar a Render.
- MT5 remoto requiere `X-KMFX-Connection-Key` o bearer valido; keys en query string siguen bloqueadas en produccion.
- Rate limit por `connection_key` activo en sync/journal/policy.
- Rate limit complementario por usuario/IP anadido a checkout, portal, creacion/link de cuentas, regeneracion/revocacion/borrado de keys y endpoints admin.
- Supabase RLS revisado: todas las tablas `public` visibles tienen RLS activo y policies; no hay views `public`.
- Supabase `handle_new_user` sigue como `SECURITY DEFINER` por trigger de Auth, pero con `search_path` vacio y sin `EXECUTE` para `anon`, `authenticated` ni `public`.
- Supabase Advisor solo devuelve un warning de seguridad abierto: activar leaked password protection en Auth.
- Supabase Performance Advisor ya no senala foreign keys sin indice; se aplico `calculator_presets_user_id_updated_at_idx`.
- Supabase Performance Advisor conserva avisos `unused_index` informativos en indices recientes; se revisaran tras trafico real.
- CORS backend sin wildcard; Worker `mt5-api` mantiene allowlist de dominios KMFX y elimina headers/query sensibles.
- Vercel mantiene CSP, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy` y `Permissions-Policy`.
- Revisión inspirada por checklists AppSec de X/Twitter:
  - entradas de usuario validadas en servidor;
  - auth en rutas protegidas;
  - secrets reales fuera del repo;
  - queries parametrizadas/cliente Supabase;
  - rate limits en auth/write endpoints;
  - CORS allowlist;
  - HTTPS y headers de seguridad;
  - CSRF si se introduce auth basada en cookies;
  - audit de dependencias antes de deploy.
- Scan local de secretos no encontro claves privadas obvias; aparecen la anon key publica de Supabase y placeholders documentales de Stripe.
- No hay `package.json`/lockfile raiz en la app vanilla actual; `npm audit` queda pendiente para la migracion Next o cuando exista manifest JS.
- Endurecido `avatar-utils`: los avatares ya no se renderizan con `innerHTML` y solo se aceptan URLs `http(s)` o data URI raster base64.

Criterio de salida:

- Sin P0/P1 abiertos en seguridad.

## Fase 5 - MT5, EA y Launcher

Objetivo: que un usuario conecte MT5 sin entender puertos ni backend.

- [ ] Flujo dashboard: Cuentas -> Añadir cuenta -> Launcher recomendado.
- [ ] Descarga macOS correcta desde dashboard.
- [ ] Descarga Windows correcta desde dashboard.
- [ ] Boton "Abrir Launcher" abre la app instalada, no descarga de nuevo.
- [ ] Launcher detecta instalaciones por nombre legible: broker/cuenta/alias.
- [ ] Instalar/Reinstalar conector deja `.ex5` y `kmfx_connection.conf`.
- [ ] EA adjunto lee key desde archivo sin que el usuario la pegue si viene del Launcher.
- [ ] Flujo manual permite copiar key desde "Ver detalles".
- [ ] Si la cuenta se desconecta, se reutiliza la misma key.
- [ ] Regenerar key solo por revocacion/filtracion/cambio explicito.
- [ ] Errores claros:
  - WebRequest no autorizado
  - key no reconocida
  - backend temporalmente no disponible
  - cuenta stale
  - plan sin permiso
- [ ] Primer sync convierte cuenta pendiente en activa.
- [ ] Cerrar Launcher no corta sync cloud del EA.
- [ ] Backend caido: EA/Launcher no pierde datos criticos.
- [ ] Backend recuperado: pendientes drenan.
- [ ] QA macOS limpio.
- [ ] QA Windows 10/11 limpio.
- [ ] Version visible de EA/Launcher.
- [ ] Checksum visible de descargas.
- [ ] Avisos de Gatekeeper/Windows documentados.

Criterio de salida:

- Usuario nuevo conecta MT5 sin ayuda.

## Fase 6 - UX de Produccion

Objetivo: que la app parezca producto final, no panel interno.

- [ ] Onboarding tras registro.
- [ ] Estados empty/loading/error/bloqueado.
- [ ] Ajustes: perfil, suscripcion, seguridad, conexiones y preferencias claros.
- [ ] Cuentas: detalles, key, pasos, eliminar/revocar sin solapes.
- [ ] Plan card visualmente destacada.
- [ ] Menus se abren hacia arriba si estan al final de pagina.
- [ ] Sin textos tecnicos visibles:
  - `workspace`
  - `local`
  - `bridge`
  - `debug`
  - `mock`
  - `backend`
- [ ] Copy final de usuario no tecnico.
- [ ] Modo admin separado y claramente oculto.
- [ ] Desktop completo revisado.
- [ ] Mobile basico revisado antes de go live.

Criterio de salida:

- Un usuario normal entiende que hacer en cada estado.

## Fase 7 - Legal, Confianza y Soporte

Objetivo: poder cobrar y operar con minima confianza legal.

- [ ] Privacy Policy publicada.
- [ ] Terms publicados.
- [ ] Refund Policy publicada.
- [ ] Disclaimer financiero visible.
- [ ] Copy claro: KMFX no da asesoramiento financiero.
- [ ] Copy claro: KMFX Connector es read-only.
- [ ] Soporte/contacto visible.
- [ ] Emails transaccionales revisados.
- [ ] Email de compra.
- [ ] Email de cancelacion.
- [ ] Email de pago fallido.
- [ ] Flujo operativo de refunds/cancelaciones.
- [ ] Politica de eliminacion de datos.

Criterio de salida:

- Usuario sabe que compra, que riesgos asume y como pedir soporte.

## Fase 8 - Observabilidad, Backups y Datos

Objetivo: detectar problemas reales y poder recuperarse.

- [ ] Alerta Render/API caida.
- [ ] Alerta errores 5xx.
- [ ] Alerta webhooks Stripe fallidos.
- [ ] Alerta sync MT5 rechazado anormal.
- [ ] Logs utiles sin secretos.
- [ ] Eventos de auditoria:
  - login
  - crear key
  - copiar key
  - revocar key
  - regenerar key
  - crear cuenta
  - eliminar cuenta
  - cambio de plan
  - pago fallido
  - sync rechazado
- [ ] Backups Supabase confirmados.
- [ ] Restore documentado o probado.
- [ ] Retencion de datos definida:
  - payloads MT5
  - operaciones
  - journal
  - logs
  - eventos billing
- [ ] Politica de borrado de cuenta/MT5.
- [ ] Feature flags para apagar:
  - conexion directa
  - billing
  - Journal AI
  - Risk editor
  - exports

Criterio de salida:

- Si algo cae, se detecta y hay plan de recuperacion.

## Fase 9 - QA Final

Objetivo: validar un viaje real antes de cobrar.

- [ ] `python3 -m unittest discover -s tests`.
- [ ] CI GitHub verde.
- [ ] Production Smoke verde.
- [ ] Registro nuevo.
- [ ] Login Google.
- [ ] Password recovery/reset.
- [ ] Usuario sin plan.
- [ ] Usuario Basic.
- [ ] Usuario Pro.
- [ ] Usuario Unlimited.
- [ ] Usuario admin.
- [ ] Cupón comunidad 100%.
- [ ] Pago fallido.
- [ ] Cancelacion.
- [ ] Cambio de plan.
- [ ] Checkout test success/cancel.
- [ ] Customer Portal test.
- [ ] Webhook replay/idempotencia.
- [ ] MT5 Launcher macOS.
- [ ] MT5 Launcher Windows.
- [ ] Cerrar Launcher y mantener sync.
- [ ] Cuenta stale.
- [ ] Key revocada.
- [ ] Sin auth no hay snapshot privado.
- [ ] `/api/mt5/sync` sin key rechaza.
- [ ] `/api/mt5/policy` sin key rechaza.
- [ ] Dashboard desktop completo.
- [ ] Mobile basico.
- [ ] Legal links.

Criterio de salida:

- Un usuario puede registrarse, pagar, conectar MT5 y ver sus datos sin intervencion manual.

## Fase 10 - Go Live Controlado

Objetivo: pasar a produccion con control.

- [ ] Congelar `main`.
- [ ] Crear tag `v0.1.0-production-mvp`.
- [ ] Stripe live keys.
- [ ] Products/prices live con lookup keys correctas.
- [ ] Webhook live.
- [ ] Customer Portal live.
- [ ] Render env live confirmadas.
- [ ] Supabase production confirmada.
- [ ] Vercel production branch `main` confirmada.
- [ ] Cloudflare DNS/Worker confirmados.
- [ ] Smoke production.
- [ ] Compra real controlada.
- [ ] Conectar cuenta MT5 real controlada.
- [ ] Monitorizar primeras sesiones.

Criterio de salida:

- Produccion abierta de forma controlada.

## Fase 11 - Next.js Sidecar

Objetivo: migrar rapido, pero sin poner en riesgo el MVP.

- [ ] Crear `apps/web-next` en paralelo.
- [ ] App Router.
- [ ] shadcn/ui.
- [ ] Tokens KMFX.
- [ ] AppShell, Sidebar, Topbar.
- [ ] Data layer tipado.
- [ ] Migrar primero read-only:
  - Dashboard
  - Cuentas
  - Operaciones
  - Calendario
  - Capital
  - Risk read-only
- [ ] No migrar billing hasta tener paridad base.
- [ ] No cutover hasta paridad visual/funcional.
- [ ] Comparativa vanilla vs Next con fixtures.

Criterio de salida:

- Next existe sin bloquear ni romper la app actual.

## Definition of Done del MVP

- [ ] Auth funciona en `kmfxedge.com`.
- [ ] Billing test funciona end-to-end.
- [ ] Entitlements gobiernan cuentas y features premium.
- [ ] Launcher conecta una cuenta nueva en produccion.
- [ ] EA sincroniza con `https://mt5-api.kmfxedge.com`.
- [ ] Dashboard muestra datos live del usuario correcto.
- [ ] Usuarios normales no ven cuentas admin ni de otros usuarios.
- [ ] Metricas criticas tienen source/formula/confidence.
- [ ] Sin defaults internos como politicas reales.
- [ ] CI y smoke estan verdes.
- [ ] Legal minimo esta publicado.
- [ ] Observabilidad minima activa.
- [ ] Rollback documentado.

## Orden Recomendado Desde Aqui

1. Fase 3 - Billing completo.
2. Fase 5 - MT5/Launcher QA limpio.
3. Fase 4 - Seguridad final.
4. Fase 6 - UX de produccion.
5. Fase 7 - Legal/confianza.
6. Fase 8 - Observabilidad/backups.
7. Fase 9 - QA final.
8. Fase 10 - Go live.
9. Fase 11 - Next.js sidecar.

## Paquete de Trabajo Cerrado

`METRICS-FIX-1`

- Sanidad del EA:
  - IDs como string.
  - `SYMBOL_DIGITS` por simbolo.
  - riesgo sin SL como no acotado.
  - `floating_pnl` consistente.
- Backend:
  - policy source/configured/reference.
  - profit factor gross/net.
  - confidence por muestra.
- Tests:
  - payload EA -> backend.
  - no default policy breach.
  - parcialidades y precision.

Este paquete queda cerrado antes de iniciar migracion Next.js. El siguiente paquete activo es `BILLING-QA-1`.
