# Auditoria general de produccion KMFX Edge

Ultima revision: 2026-05-04
Rama revisada: `main`
Commit base local: `6f4f05f Harden frontend cache recovery`
Preset de producto: SaaS dashboard + conector MT5

## Veredicto

KMFX Edge esta cerca de una beta de produccion controlada, pero todavia no esta listo para abrir a usuarios de pago sin restricciones.

El nucleo MT5 ya tiene buena base: dominio activo, proxy MT5, backend Render, rechazo de escrituras sin key, snapshot autenticado, multi-cuenta y calculos principales conectados. Los bloqueos reales para produccion son billing/entitlements, QA en maquinas limpias, certificacion del contrato de datos por seccion y limpieza final de mensajes/documentacion legacy.

## Estado probado

| Area | Estado | Evidencia |
| --- | --- | --- |
| Web publica | OK | `https://kmfxedge.com` responde `200` con CSP, HSTS, `X-Frame-Options`, `nosniff` y Permissions Policy. |
| Backend Render | OK | `/health` responde `ok:true`; el frontend actual esta en `6f4f05f`. |
| Proxy MT5 Cloudflare | OK | `https://mt5-api.kmfxedge.com/health` responde `ok:true` y header `x-kmfx-proxy`. |
| CORS MT5 | OK | Origin malicioso en preflight devuelve `403`. |
| Writes MT5 sin key | OK | `POST /api/mt5/sync` sin `X-KMFX-Connection-Key` devuelve `401 missing_connection_key`. |
| Snapshot sin auth | Cerrado por datos | `/api/accounts/snapshot` devuelve `accounts: []` y `auth_required: true`. No filtra cuentas. |
| JS dashboard | OK sintaxis | 62 archivos JS revisados con `node --check`. |
| Backend/launcher | OK compilacion | `py_compile` pasa en API, launcher, bridge y account service. |
| Tests criticos | OK en ultimo commit propio | Pasaron `tests.test_sidebar_navigation_contract`, checks JS principales y validacion de routing/cache. Hay cambios ajenos posteriores sin certificar. |

## Hallazgos principales

### P0 antes de produccion comercial

1. Billing y entitlements aun no cierran el acceso real.
   - Sin Checkout, webhooks, `/api/billing/status` y guards por plan, no hay forma segura de limitar cuentas MT5, debug, exports, Risk editor o features premium.
   - La produccion puede funcionar tecnicamente, pero no como SaaS de pago.

2. El contrato de datos del dashboard aun no esta certificado pantalla por pantalla.
   - La app ya consume snapshots live, pero varias secciones combinan MT5 live con workspace local o entrada manual.
   - Antes de abrir usuarios hay que fijar el contrato esperado de `/api/accounts/snapshot` y validarlo con fixtures de cuentas MT5.
   - Las vistas no deben mostrar textos internos como "workspace" o "local" a usuarios finales.

3. Falta QA real en maquina limpia.
   - Multi-cuenta funciona en tu Mac, pero falta verificar usuario nuevo en macOS limpio y Windows 10/11 limpio.
   - El build Windows existe y descarga, pero necesita prueba funcional real: login, deteccion MT5, instalacion EA, primer sync y cuenta visible.

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

2. Metricas live: base buena, pero falta certificacion automatizada.
   - El backend ya construye `dashboard_payload`, `reportMetrics`, `riskSnapshot` y `symbolSpecs`.
   - El frontend adapta MT5 con `mt5-account-adapter` y tiene `kmfx-integrity-check`.
   - Prueba inicial creada en `tests.test_dashboard_live_contract` con fixture de dos cuentas MT5. Falta ampliarla a render smoke por pagina.

3. Descargas Launcher.
   - macOS y Windows estan publicados.
   - Falta mostrar checksum/version de forma mas clara y documentar avisos de sistema operativo.

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
| Ejecucion | Parcial | Muchas reglas dependen de tags/manual/localStorage; requiere certificacion final. |
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
| Dashboard | Usa `dashboardPayload`, `reportMetrics`, `riskSnapshot` y posiciones. | Fixture inicial cubierto; falta render smoke por pagina. |
| Cuentas | Usa `/api/accounts/snapshot` y ownership guard. | Fixture inicial cubre `active`; faltan `pending`, `stale`, `revoked`, `plan_limited`. |
| Operaciones | Usa trades normalizados desde payload MT5. | Garantizar que el EA/backend envia deals cerrados con costes completos. |
| Calendario | Deriva calendario desde trades cerrados. | Verificar fechas, timezone y sesiones con datos reales. |
| Insights | Deriva analitica desde el modelo de trades. | Validar que no usa mock cuando hay cuenta live activa. |
| Capital | Agrega varias cuentas y posiciones abiertas. | Fixture multi-cuenta Darwinex/Orion y comprobacion de totales. |
| Risk Engine | Usa `riskSnapshot`. | Tests de resumen, enforcement, exposicion y limites por policy. |
| Herramientas | Usa `symbolSpecs` y fallback manual. | Fixture Forex/JPY/XAUUSD con specs MT5 reales. |
| Funding | Mezcla cuenta live con journeys workspace. | Vincular cuenta MT5 a journey Funding persistente. |
| Estrategias | Setups/backtests son workspace; puede comparar con trades live. | Persistencia backend o etiqueta clara de datos propios del usuario. |
| Journal | Entradas/reviews son workspace/manual; usa trades live como contexto. | Persistir journal y tags por usuario antes de uso comercial serio. |

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

- Branch protection, secret scanning y push protection deben activarse en GitHub.
- Revisar env vars reales en Vercel, Render, Cloudflare y Supabase.
- Confirmar `SUPABASE_JWT_SECRET` o verificacion remota JWT final en Render.
- Reducir admin defaults/envs a configuracion de plataforma antes de abrir usuarios.
- Rotar keys antiguas que hayan podido salir en logs previos.
- No lanzar conexion directa con password hasta tener vault y permisos por plan.

## Validaciones ejecutadas

- `curl -I https://kmfxedge.com`
- `curl https://kmfx-edge-api.onrender.com/health`
- `curl https://mt5-api.kmfxedge.com/health`
- `curl -X POST https://mt5-api.kmfxedge.com/api/mt5/sync` sin key
- `curl -X OPTIONS https://mt5-api.kmfxedge.com/api/mt5/sync` con origin malicioso
- `python3 -m py_compile kmfx_connector_api.py launcher/backend_client.py launcher/service.py launcher/config.py kmfx_bridge_mac.py account_service.py account_keys.py`
- `python3 -m unittest tests.test_connector_cors_config tests.test_launcher_connection_keys tests.test_account_service tests.test_calculator_fx_pip tests.test_sidebar_navigation_contract`
- `node --check app.js`
- `node --check js/modules/calculator.js`
- sintaxis de todos los JS de `js/`, `app.js` y `cloudflare/mt5-api-proxy.js`
- `git diff --check`

Resultado:

- Ultimo bloque propio OK.
- El workspace actual contiene cambios ajenos no commiteados y no se consideran certificados en esta auditoria.

## Roadmap actualizado por prioridad

### Paso 1 - Certificar contrato de datos live

- [x] Crear fixture de `/api/accounts/snapshot` con dos cuentas MT5, posiciones, trades, history, `reportMetrics`, `riskSnapshot` y `symbolSpecs`.
- [x] Añadir test backend/contrato que valida KPIs agregados, cuenta activa, `reportMetrics`, `riskSnapshot` y `symbolSpecs`.
- [ ] Añadir render smoke por pagina para Dashboard, Cuentas, Operaciones, Calendario, Insights, Capital, Risk Engine y Herramientas.
- [ ] Revisar textos de usuario final: quitar "workspace", "local", "bridge", "debug" y referencias tecnicas fuera de modo admin.

### Paso 2 - Certificacion de datos live por seccion

- Crear matriz por pagina con:
  - KPI visible.
  - Fuente exacta: EA payload, backend riskSnapshot, workspace local, manual/import.
  - Estado: live, parcial, pendiente.
- Usar `kmfx-integrity-check` para comparar `reportMetrics` vs dashboard model.
- Probar dos cuentas live y cambiar cuenta activa verificando Dashboard, Risk, Operaciones, Calendario, Insights, Capital y Funding.

### Paso 3 - Billing MVP + entitlements

- Crear catalogo Stripe test.
- Implementar `/api/billing/checkout`, `/api/billing/portal`, `/api/billing/webhook`, `/api/billing/status`.
- Aplicar limits: Free/Core/Pro en creacion de keys, cuentas MT5 live y features premium.
- Bloquear nuevas keys si el plan no permite conectar.

### Paso 4 - QA Launcher usuario nuevo

- macOS limpio: descarga, login, detectar MT5, instalar EA, primer sync.
- Windows 10/11 limpio: descarga ZIP, ejecutar, login, detectar MT5, instalar EA, primer sync.
- Confirmar investor password en modo lectura.
- Confirmar cola local con backend caido y drenaje al recuperar.

### Paso 5 - Seguridad y gobierno

- Activar branch protection.
- Activar secret scanning/push protection.
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

Si pasaria a una beta privada controlada cuando se resuelvan:

1. Contrato de datos live certificado con fixture.
2. Textos no-productivos visibles eliminados.
3. QA macOS/Windows limpio.
4. Billing y entitlements definidos para limitar uso real.

Para produccion de pago, el siguiente bloque obligatorio sigue siendo billing + entitlements.
