# Runbook de Alertas Operativas

Objetivo: detectar fallos reales de produccion sin montar servicios externos ni
anadir coste fijo antes de la beta.

## Formato

El backend emite alertas estructuradas en logs con el prefijo:

```text
[KMFX][ALERT]
```

Todas las alertas pasan por el mismo sanitizador que los eventos de auditoria:
no deben imprimir keys completas, JWTs, bearer tokens, contrasenas ni secretos.

## Monitor Beta

Antes de abrir mas usuarios, despues de cada deploy beta y cuando un alumno
reporte que no puede entrar o sincronizar, ejecutar:

```bash
cd apps/web-next
npm run monitor:beta
```

El comando usa `scripts/beta_monitor_usage.py` y no imprime secretos. Carga
opcionalmente `~/.kmfx-beta-monitor.env` para leer tokens privados ya existentes
en la maquina.

Tambien existe el workflow `Beta Monitor` en GitHub Actions. Se ejecuta cada dos
horas y puede lanzarse manualmente desde `Actions > Beta Monitor > Run workflow`.
El resultado queda guardado como artifact `beta-monitor-report`.

Si el workflow falla, GitHub Actions marca la ejecucion en rojo y envia sus
notificaciones habituales. Para aviso adicional a Discord o Slack, configurar el
secret `BETA_MONITOR_WEBHOOK_URL`; el workflow enviara un resumen con checks
fallidos, deployment y uso Render MTD.

Checks cubiertos:

- `beta_version_endpoint`: confirma que `https://beta.kmfxedge.com` responde con
  version y deployment ID de Vercel.
- `beta_public_auth_config`: confirma que la configuracion publica de Supabase
  esta disponible. Si falla, el login puede mostrar "acceso seguro no cargado".
- `beta_route_*_requires_login`: confirma que las rutas privadas visibles en
  beta redirigen a login y no a Basic Auth ni a una pantalla rota.
- `beta_download_*_requires_login`: confirma que Launcher, Windows y EA no se
  descargan fuera de una sesion real.
- `backend_health` y `mt5_api_health`: confirman Render y Worker MT5 vivos.
- `snapshot_public_requires_auth`: confirma que la lectura publica de cuentas no
  devuelve datos sin sesion y muestra el guard de consumo.
- `snapshot_bandwidth_usage_below_threshold`: avisa si una lectura publica de
  snapshot se acerca al limite operativo definido para beta.
- `mt5_api_cors_allows_expected_origin`: confirma que el Worker permite el
  origen esperado para el conector MT5 y no abre CORS universal.
- `mt5_api_cors_blocks_unexpected_origin`: confirma que un origen ajeno no queda
  autorizado por CORS.
- `render_pipeline_usage`: resume minutos de deploy Render del mes para vigilar
  consumo operativo.

Variables opcionales:

```bash
KMFX_BETA_FRONTEND_URL=https://beta.kmfxedge.com
KMFX_BETA_BACKEND_URL=https://kmfx-edge-api.onrender.com
KMFX_BETA_MT5_API_URL=https://mt5-api.kmfxedge.com
KMFX_BETA_MT5_CORS_ORIGIN=https://kmfxedge.com
KMFX_BETA_MAX_BANDWIDTH_USAGE=0.05
```

Secrets recomendados en GitHub Actions:

```text
RENDER_API_KEY
BETA_MONITOR_WEBHOOK_URL
```

`RENDER_API_KEY` permite que el workflow mida consumo Render desde GitHub.
`BETA_MONITOR_WEBHOOK_URL` es opcional y solo sirve para enviar aviso adicional
a Discord o Slack cuando el monitor falle.

Si aparece `slow_check:<name>:<ms>`, no bloquea por si solo, pero conviene
revisarlo si supera de forma repetida 2500 ms.

### Interpretacion Del Monitor

- Si `ok=false`, no abrir mas usuarios hasta revisar el check fallido.
- Si `ok=true` con `warnings`, la beta sigue operativa, pero conviene revisar
  consumo Render, latencia o tokens ausentes.
- Si falta token Render en GitHub, el workflow seguira validando beta y dejara
  `render_usage_unavailable` como warning. Para medir consumo de Render desde
  Actions, anadir `RENDER_API_KEY` como secret del repositorio.

### Checklist Al Entrar Un Usuario Nuevo

1. Ejecutar `npm run monitor:beta` o lanzar el workflow `Beta Monitor`.
2. Revisar que `beta_public_auth_config`, `backend_health` y `mt5_api_health`
   esten en verde.
3. Confirmar que `snapshot_bandwidth_usage_below_threshold` no se acerca al
   limite configurado.
4. Mirar logs de Render filtrando `[KMFX][ALERT]`.
5. Si el alumno instala EA/Launcher, confirmar que no aparecen rechazos
   anormales de MT5 sync.

Runbook de incidencias de alumno: `docs/beta-incident-response-runbook.md`.

## Eventos Cubiertos

### Proxy Next Hacia Backend

Patrones:

```text
event=backend_proxy_done
event=backend_proxy_failed
```

Los emiten las rutas `app/api/kmfx/*` del dashboard Next cuando llaman a Render
con la sesion Supabase del usuario. No imprimen JWTs, bearer tokens ni payloads;
solo metodo, ruta sanitizada, status, duracion y motivo de fallo.

Accion:

1. Si `reason=auth_required`, el problema esta antes del backend: sesion
   Supabase ausente/caducada o cookie no disponible.
2. Si `event=backend_proxy_done` trae `status>=400`, revisar la ruta exacta en
   Render con el mismo horario.
3. Si `ms` es alto de forma repetida, revisar latencia Render/Supabase antes de
   tocar UI.

### API 5xx

Patron:

```text
[KMFX][ALERT] event=api_5xx_response
[KMFX][ALERT] event=api_unhandled_exception
```

Sirve para detectar errores del backend Render. El detalle incluye metodo, ruta
y status/error type, pero no query string ni payload.

Accion:

1. Revisar Render Logs con el evento exacto.
2. Confirmar si coincide con deploy reciente.
3. Si afecta a login, billing, MT5 sync o cuentas, aplicar rollback segun
   `docs/production-rollback-runbook.md`.

### Webhook Stripe Fallido

Patron:

```text
[KMFX][ALERT] event=billing_webhook_failed
```

Se emite cuando el webhook firmado de Stripe no puede reservar/procesar el
evento. Los rechazos por firma invalida no se elevan a alerta para evitar ruido
de probes externos.

Accion:

1. Revisar `event_id`, `event_type` y `stage`.
2. Comprobar `STRIPE_WEBHOOK_SECRET` y `SUPABASE_SERVICE_ROLE_KEY` en Render.
3. Reintentar el evento desde Stripe Dashboard si el fallo fue temporal.

### Sync MT5 Rechazado Anormal

Patron:

```text
[KMFX][ALERT] event=mt5_sync_rejected_abnormal
```

Razones cubiertas:

- `missing_connection_key`
- `query_connection_key_not_allowed`
- `unknown_connection_key`
- `revoked_connection_key`
- `connection_key_rate_limited`

Accion:

1. Si es `query_connection_key_not_allowed`, el EA/Launcher esta usando un
   paquete antiguo y debe reinstalarse.
2. Si es `unknown_connection_key` o `revoked_connection_key`, copiar la
   KMFXKey vigente desde `Cuentas > Ver detalles` y reinstalar el conector.
3. Si es `connection_key_rate_limited`, revisar si hay bucles de EA, pruebas
   repetidas o abuso.

## Busquedas Rapidas En Render

Usar estos filtros en logs:

```text
[KMFX][ALERT]
event=api_5xx_response
event=billing_webhook_failed
event=mt5_sync_rejected_abnormal
```

## Logs De Vercel

Para consultar runtime logs desde terminal hace falta `VERCEL_TOKEN`. Si no esta
disponible localmente, usar Vercel Dashboard o GitHub Actions como primera
fuente operativa.

El frontend Next emite eventos estructurados desde el `proxy` para explicar
redirecciones y bloqueos sin imprimir emails, tokens ni payloads:

```text
event=auth_redirect_login
event=auth_redirect_dashboard
event=billing_guard_redirect
event=billing_guard_status_failed
event=marketing_preview_redirect
event=beta_gate_blocked
event=internal_route_disabled
event=internal_route_admin_blocked
```

Accion:

1. Si aparece `auth_redirect_login`, el usuario no tenia sesion Supabase valida
   para esa ruta.
2. Si aparece `billing_guard_redirect`, revisar `reason`:
   `billing_required`, `billing_past_due`, `entitlement_required` o
   `plan_limit_reached`.
3. Si aparece `billing_guard_status_failed`, el proxy no pudo comprobar billing
   contra el backend; revisar Render en el mismo minuto.
4. Si aparece `internal_route_disabled` o `internal_route_admin_blocked`, la
   ruta pertenece a una superficie interna/futura y se esta ocultando como
   corresponde.

Vercel Web Analytics y Speed Insights estan activos en el layout de Next para
medir trafico real, rutas lentas y Core Web Vitals sin afectar el flujo de
usuario. Revisar desde Vercel:

```text
Project > Analytics
Project > Speed Insights
Project > Logs
```

Con token disponible:

```bash
curl -N -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v3/deployments/<deployment-id>/events" \
  --max-time 120
```

Buscar:

```text
backend_proxy_failed
billing_guard_redirect
billing_guard_status_failed
level":"error
[KMFX][ALERT]
```

## Escalado Futuro

Antes de beta abierta, se puede conectar un log drain o alerta externa a estos
patrones. La aplicacion ya emite eventos listos para monitorizacion sin cambiar
el contrato del backend.
