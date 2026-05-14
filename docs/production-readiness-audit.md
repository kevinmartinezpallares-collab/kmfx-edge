# Auditoria general de produccion KMFX Edge

Ultima revision: 2026-05-13
Rama revisada: `main`
Commit base local: `dad532f Fix launcher reinstall stable key fallback [skip render]`
Preset de producto: SaaS dashboard + conector MT5

## Veredicto

KMFX Edge esta en tramo final de produccion tecnica minima viable. La base critica ya esta cerrada para una beta privada controlada: seguridad de keys, flujo MT5/Launcher, billing server-side, paywall, admin unico, descargas, smoke de produccion y metricas live tienen contrato y tests.

No se recomienda abrir produccion comercial amplia hasta completar la auditoria E2E como usuario normal con credenciales/cuenta real, la validacion live de recibos/plan aplicado, QA limpia macOS/Windows y guardrails manuales de plataforma para evitar costes inesperados.

## Estado probado

| Area | Estado | Evidencia |
| --- | --- | --- |
| Web publica | OK | `https://kmfxedge.com` responde `200` con CSP, HSTS, `X-Frame-Options`, `nosniff` y Permissions Policy. |
| Backend Render | OK | `/health` responde `ok:true`; los smokes recientes de produccion siguen en verde. |
| Proxy MT5 Cloudflare | OK | `https://mt5-api.kmfxedge.com/health` responde `ok:true` y header `x-kmfx-proxy`. |
| CORS MT5 | OK | Origin malicioso en preflight devuelve `403`. |
| Writes MT5 sin key | OK | `POST /api/mt5/sync` sin `X-KMFX-Connection-Key` devuelve `401 missing_connection_key`. |
| Snapshot sin auth | Cerrado por datos | `/api/accounts/snapshot` devuelve `accounts: []` y `auth_required: true`. No filtra cuentas. |
| JS dashboard | OK sintaxis | 62 archivos JS revisados con `node --check`. |
| Backend/launcher | OK compilacion | `py_compile` pasa en API, launcher, bridge y account service. |
| Tests criticos | OK | Pasaron contratos de billing, auth/admin, Launcher/keys, account service, render smoke, calculadora Forex pips, CORS y production smoke. |
| GitHub security del repo | OK | `secret scanning`, `push protection`, Dependabot alerts y security updates verificados por API con `gh` autenticado. |
| Branch protection `main` | OK | Activado con checks requeridos, historial lineal, force-push y borrado bloqueados; bypass admin permitido durante cierre tecnico. |

## Hallazgos principales

### P0 antes de produccion comercial

1. Falta auditoria E2E final como usuario normal.
   - Debe cubrir registro/login, compra, plan aplicado, descarga Launcher/EA, MT5 real, cierre de Launcher, dashboard completo, admin oculto, limites por plan y reconciliacion de metricas.
   - Kevin aportara credenciales de prueba y cuenta de trading para ejecutar el flujo real antes de go-live.

2. Falta QA real en maquina limpia.
   - Multi-cuenta funciona en tu Mac, pero falta verificar usuario nuevo en macOS limpio y Windows 10/11 limpio.
   - El build Windows existe y descarga, pero necesita prueba funcional real: login, deteccion MT5, instalacion EA, primer sync y cuenta visible.

3. Billing live necesita ultima prueba de realidad.
   - Checkout, portal, webhook, trial pause, Price IDs y lookup keys estan implementados/configurados.
   - Falta comprobar en una compra live controlada que el recibo/confirmacion llega al usuario y que el dashboard actualiza el plan sin intervencion manual.
   - La duplicidad de trial del usuario de prueba `kevinmartinezpallares@hotmail.com` ya fue limpiada en Stripe: se conserva `sub_1TWYq4EoC6e7wNItR0TKxm5R` y se cancelo `sub_1TWW4sEoC6e7wNIt1oQfN1XE`.
   - El upsert de suscripciones actuales ahora desmarca filas actuales previas del mismo usuario antes de publicar la nueva como `is_current=true`, evitando estados Free/Demo cuando Stripe tiene un plan vigente.

4. Guardrails manuales de coste/plataforma.
   - Supabase esta en periodo de gracia por exceso de salida; ya se redujo polling y se creo monitor, pero hay que confirmar leaked password protection, backups y limites de uso.
   - Render aviso de minutos de build: fijar limite personalizado desde Dashboard si se quiere cortar cargos automaticos.

### P1 antes de beta publica

1. Hay mensajes y textos internos que deben limpiarse.
   - Persisten textos como "workspace", "sesion local", "bridge local" y referencias tecnicas en Ajustes/admin.
   - Muchos estan correctamente ocultos para admin, pero debe hacerse una pasada completa para usuario final no-admin.

2. `README.md` describe arquitectura legacy localhost.
   - El roadmap actual ya habla de EA/Launcher/cloud.
   - Para produccion, la documentacion publica debe apuntar solo al flujo recomendado: Launcher + EA + `https://mt5-api.kmfxedge.com`.

3. `api-config.js` sigue usando `https://kmfx-edge-api.onrender.com` como backend publico.
   - Funciona, pero el branding final deberia pasar a `https://api.kmfxedge.com` o documentarse como decision temporal.
   - El CSP tambien permite Render directamente.

4. La pantalla de conexion directa debe seguir bloqueada o muy restringida.
   - El flujo con credenciales MT5 requiere vault, rate limit, revocacion, permisos por plan y advertencias claras para prop firms.
   - Para produccion inicial, el camino seguro es EA/Launcher.

### P2 de producto

1. Confirmacion de primera sincronizacion pendiente.
   - Falta modal para nombrar cuenta, elegir Demo/Real/Funding/Challenge y vincular a journey.

2. Metricas live: base buena, con certificacion automatizada inicial.
   - El backend ya construye `dashboard_payload`, `reportMetrics`, `riskSnapshot` y `symbolSpecs`.
   - El frontend adapta MT5 con `mt5-account-adapter` y tiene `kmfx-integrity-check`.
   - Prueba inicial creada en `tests.test_dashboard_live_contract` con fixture de dos cuentas MT5.
   - Smoke render creado en `tests.test_dashboard_render_smoke` para certificar que las vistas principales renderizan con ese contrato live y sin fallback mock visible.

3. Descargas Launcher.
   - macOS y Windows estan publicados.
   - Versiones visibles para usuario final; checksums reservados a admin/soporte para no generar ruido.
   - Avisos de sistema operativo documentados en el runbook MT5.

4. Reinstalacion del conector.
   - El Launcher mantiene el contrato simple de producto: instalar/reinstalar el EA en una instalacion MT5.
   - Si el backend desplegado aun no expone restauracion explicita de key, el Launcher cae al flujo estable y solicita la KMFXKey actual de la cuenta en vez de crear/regenerar otra.
   - Contrato verificado en `dad532f` con `tests.test_launcher_connection_keys`: 35 tests OK.

## Matriz de datos MT5 vs dashboard

| Superficie | Estado | Fuente actual |
| --- | --- | --- |
| Dashboard principal | Conectado | `dashboardPayload` adaptado desde MT5 cuando `payloadSource=mt5_sync_live`. |
| Cuentas | Conectado | `/api/accounts/snapshot`, ownership guard y `liveAccountIds`. |
| Risk Engine | Parcial conectado | Usa `riskSnapshot` cuando existe; si no, muestra estados pendientes. |
| Herramientas/calculadora | Conectado + corregido | Usa specs MT5 live con prioridad; Forex pips corregido en `0e8a673`. |
| Operaciones | Conectado a trades normalizados | Depende de history/deals enviados por EA. |
| Calendario | Conectado si hay trades cerrados | Deriva de trades/historial normalizado. |
| Insights | Conectado si hay muestra | Deriva de dashboard model/trades. |
| Ejecucion | Mejorado | Usa trades MT5 normalizados, revision post-trade priorizada y persistencia backend por usuario/cuenta con fallback local. |
| Journal | Parcial | Entradas y review son workspace/manual; no todo viene del EA. |
| Estrategias | Parcial | Setups/backtests son workspace/importaciones; no todo viene de EA live. |
| Funding | Parcial | Compliance usa cuenta y workspace funded; falta vincular cuenta MT5 a journey. |
| Capital | Parcial | Usa cuentas y allocations; necesita validar multi-cuenta live. |

## Contrato de datos live del dashboard

El dashboard entra por `GET /api/accounts/snapshot`. El frontend solo deberia considerar una cuenta como live completa cuando la entrada del snapshot incluye:

- Identidad: `account_id`, `user_id`, `broker`, `platform`, `login`, `server`, `connection_mode`, `status`, `last_sync_at`.
- Payload: `dashboard_payload.payloadSource = mt5_sync_live`.
- Cuenta: `balance`, `equity`, `floatingPnl`/`openPnl`, `closedPnl`, `totalPnl`, `openPositionsCount`.
- Posiciones: `positions[]` con `symbol`, `type`/`side`, `volume`, `open_price`/`entry_price`, `current_price`, `profit`.
- Operaciones: `trades[]` con identificador, `symbol`, `type`/`side`, volumen, precios de entrada/salida, tiempos, `profit`, `commission`, `swap` y costes.
- Curva: `history[]` o `equityCurve[]` para no depender de una linea sintetica balance-equity.
- Metricas exactas: `reportMetrics` con `balance`, `equity`, `netProfit`, `grossProfit`, `grossLoss`, `winRate`, `totalTrades`, `profitFactor`, `drawdownPct`, `commissions`, `swaps`, `bestTrade`, `worstTrade` y rachas.
- Riesgo: `riskSnapshot.summary`, `riskSnapshot.status`, `riskSnapshot.policy`, `riskSnapshot.policy_evaluation`, `symbol_exposure`, `open_trade_risks`.
- Mercado: `symbolSpecs` para calculadora y sizing.

Si falta `reportMetrics`, el frontend calcula metricas derivadas desde trades y muestra logs de integridad. Eso sirve como fallback, pero no debe ser el modo principal de produccion.

### Estado por modulo

| Modulo | Contrato live | Pendiente antes de produccion |
| --- | --- | --- |
| Dashboard | Usa `dashboardPayload`, `reportMetrics`, `riskSnapshot` y posiciones. | Fixture inicial y render smoke cubiertos; faltan estados degradados. |
| Cuentas | Usa `/api/accounts/snapshot` y ownership guard. | Fixture inicial y render smoke cubren `active`, `pending`, `stale`, `revoked`, `plan_limited` y `error`. |
| Operaciones | Usa trades normalizados desde payload MT5. | Render smoke cubierto; garantizar que el EA/backend envia deals cerrados con costes completos. |
| Calendario | Deriva calendario desde trades cerrados. | Render smoke cubierto; verificar fechas, timezone y sesiones con datos reales. |
| Insights | Deriva analitica desde el modelo de trades. | Render smoke cubierto; ampliar con muestras mas grandes. |
| Capital | Agrega varias cuentas y posiciones abiertas. | Render smoke cubierto; falta fixture de totales multi-cuenta mas exigente. |
| Risk Engine | Usa `riskSnapshot`. | Render smoke cubierto para live, sin snapshot y stale; faltan tests de enforcement, exposicion y limites por policy. |
| Herramientas | Usa `symbolSpecs` y fallback manual. | Render smoke cubierto; fixture Forex/JPY/XAUUSD con specs MT5 reales. |
| Funding | Mezcla cuenta live con journeys workspace. | Empty state de cuenta no vinculada cubierto; falta vincular cuenta MT5 a journey Funding persistente. |
| Estrategias | Setups/backtests son workspace; puede comparar con trades live. | Persistencia backend o etiqueta clara de datos propios del usuario. |
| Journal | Entradas/reviews son workspace/manual; usa trades live como contexto. | Persistir journal por usuario antes de uso comercial serio. Las revisiones post-trade de Ejecucion ya tienen backend. |

## Seguridad

Fortalezas actuales:

- Keys en URL rechazadas por defecto.
- Remote MT5 sync/journal sin key bloqueado en produccion.
- Revocacion y rate limit por connection key implementados.
- CORS del proxy MT5 restringido.
- Logs de keys enmascarados.
- Headers web basicos activos.
- Debug oculto para no-admin en UI.

Riesgos pendientes:

- Revisar env vars reales en Vercel, Render, Cloudflare y Supabase.
- Confirmar `SUPABASE_JWT_SECRET` o verificacion remota JWT final en Render.
- Admin defaults/envs eliminados: solo `kevinmartinezpallares@gmail.com` conserva admin antes de abrir usuarios.
- Rotar keys antiguas que hayan podido salir en logs previos.
- No lanzar conexion directa con password hasta tener vault y permisos por plan.
- GitHub queda cubierto: branch protection, secret scanning, push protection y Dependabot security updates verificados por API.

## Validaciones ejecutadas

- `curl -I https://kmfxedge.com`
- `curl https://kmfx-edge-api.onrender.com/health`
- `curl https://mt5-api.kmfxedge.com/health`
- `curl -X POST https://mt5-api.kmfxedge.com/api/mt5/sync` sin key
- `curl -X OPTIONS https://mt5-api.kmfxedge.com/api/mt5/sync` con origin malicioso
- `python3 -m py_compile kmfx_connector_api.py launcher/backend_client.py launcher/service.py launcher/config.py kmfx_bridge_mac.py account_service.py account_keys.py`
- `python3 -m unittest tests.test_connector_cors_config tests.test_launcher_connection_keys tests.test_account_service tests.test_calculator_fx_pip tests.test_sidebar_navigation_contract`
- `python3 -m unittest tests.test_dashboard_live_contract tests.test_dashboard_render_smoke`
- `node --check app.js`
- `node --check js/modules/calculator.js`
- sintaxis de todos los JS de `js/`, `app.js` y `cloudflare/mt5-api-proxy.js`
- `git diff --check`

Resultado:

- Ultimo smoke publico OK contra web, Render y Worker.
- El unico cambio local no certificado pertenece al checklist manual de billing y no se modifica desde esta auditoria.

## Roadmap actualizado por prioridad

### Paso 1 - Certificar contrato de datos live

- [x] Crear fixture de `/api/accounts/snapshot` con dos cuentas MT5, posiciones, trades, history, `reportMetrics`, `riskSnapshot` y `symbolSpecs`.
- [x] Añadir test backend/contrato que valida KPIs agregados, cuenta activa, `reportMetrics`, `riskSnapshot` y `symbolSpecs`.
- [x] Añadir render smoke por pagina para Dashboard, Cuentas, Operaciones, Calendario, Insights, Capital, Risk Engine y Herramientas.
- [x] Añadir render smoke de Cuentas para estados `pending`, `stale`, `revoked`, `plan_limited` y `error`.
- [x] Añadir render smoke de Risk/Funding para cuenta sin snapshot/policy, snapshot stale y cuenta funding no vinculada.
- [x] Revisar textos de usuario final: quitar "workspace", "local", "bridge", "debug" y referencias tecnicas fuera de modo admin.

### Paso 2 - Certificacion de datos live por seccion

- [x] Crear matriz por pagina con:
  - KPI visible.
  - Fuente exacta: EA payload, backend riskSnapshot, workspace local, manual/import.
  - Estado: live, parcial, pendiente.
- Matriz inicial: `docs/live-data-section-matrix.md`.
- Usar `kmfx-integrity-check` para comparar `reportMetrics` vs dashboard model.
- Probar dos cuentas live y cambiar cuenta activa verificando Dashboard, Risk, Operaciones, Calendario, Insights, Capital y Funding.

### Paso 3 - Billing MVP + entitlements

- Checkout, Customer Portal, webhook endpoint, status, guards por plan, trial pause y lookup keys quedan cerrados a nivel tecnico.
- Cuentas y Dashboard bloquean `Añadir cuenta` si el entitlement no lo permite; admin solo es `kevinmartinezpallares@gmail.com`.
- Pendiente antes de abrir cobro publico: compra live controlada con recibo, plan aplicado sin refresco manual, cancelacion/cambio/pago fallido en Stripe y verificacion final del portal tras la limpieza de duplicados.

### Paso 4 - QA Launcher usuario nuevo

- macOS limpio: descarga, login, detectar MT5, instalar EA, primer sync.
- Windows 10/11 limpio: descarga ZIP, ejecutar, login, detectar MT5, instalar EA, primer sync.
- Confirmar investor password en modo lectura.
- Confirmar cola local con backend caido y drenaje al recuperar.

### Paso 5 - Seguridad y gobierno

- Ejecutar auditoria completa final con `codex-security:security-scan` sobre bridge localhost, Supabase/Auth, Cloudflare proxy MT5, CORS, account keys, billing/entitlements y endpoints admin.
- Ejecutar auditoria UX con `audit`, `harden`, `polish` y `adapt` para estados vacios/error/bloqueados, accesibilidad, responsive y copy final.
- Ejecutar auditoria launcher macOS con `build-macos-apps:packaging-notarization` y `build-macos-apps:signing-entitlements`. La notarizacion Apple puede seguir aplazada, pero no la validacion del paquete.
- Ejecutar revision Cloudflare con `cloudflare:workers-best-practices` para `cloudflare/mt5-api-proxy.js`.
- Ejecutar revision Supabase con `supabase:supabase-postgres-best-practices` para migrations, RLS, indices y billing/accounts.
- Branch protection ya esta activa en `main`; mantener bypass admin solo hasta congelar el MVP.
- Revisar secrets/env vars.
- Ejecutar Production Smoke despues de cada deploy.
- Documentar rollback web/backend/launcher.

### Paso 6 - Go live controlado

- Tag `v0.1.0-production-mvp`.
- Stripe live.
- Compra real de prueba.
- Monitorizacion Render, Stripe, Supabase, Vercel y Cloudflare durante primeras sesiones.

## Decision recomendada

No pasaria todavia a produccion comercial abierta.

Pasaria a beta privada controlada cuando se resuelvan:

1. Auditoria E2E final como usuario normal con credenciales/cuenta real.
2. Compra live controlada con recibo y plan aplicado en dashboard.
3. QA macOS/Windows limpio del Launcher.
4. Guardrails manuales de Supabase/Render confirmados.
5. Revisión final de plataforma y smoke verde.

Para produccion de pago, el siguiente bloque obligatorio es QA real + facturacion live controlada, no nuevas features.

## Cierre operativo pendiente

Antes de go-live, Codex ejecutara `docs/final-user-go-live-audit.md` con un usuario normal y una cuenta MT5 real/demo controlada aportada por Kevin. Esa auditoria es la puerta final: debe probar login, plan, descarga Launcher/EA, instalacion, primer sync, cierre del Launcher, dashboard completo, ocultacion admin y reconciliacion de metricas contra MT5.

La auditoria final queda ampliada con criterios de no-go: usuario normal con panel admin, plan comprado que no aplica, `Anadir cuenta` habilitado sin entitlement, EA que depende del Launcher abierto, KMFXKey distinta entre dashboard y Launcher, suscripciones duplicadas o coste/plataforma sin guardrail manual.
