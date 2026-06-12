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

Checks cubiertos:

- `beta_version_endpoint`: confirma que `https://beta.kmfxedge.com` responde con
  version y deployment ID de Vercel.
- `beta_public_auth_config`: confirma que la configuracion publica de Supabase
  esta disponible. Si falla, el login puede mostrar "acceso seguro no cargado".
- `beta_route_*_requires_login`: confirma que las rutas privadas redirigen a
  login y no a Basic Auth ni a una pantalla rota.
- `beta_download_*_requires_login`: confirma que Launcher, Windows y EA no se
  descargan fuera de una sesion real.
- `backend_health` y `mt5_api_health`: confirman Render y Worker MT5 vivos.
- `snapshot_public_requires_auth`: confirma que la lectura publica de cuentas no
  devuelve datos sin sesion y muestra el guard de consumo.
- `mt5_api_cors_allows_expected_origin`: confirma que el Worker permite el
  origen esperado para el conector MT5 y no abre CORS universal.
- `render_pipeline_usage`: resume minutos de deploy Render del mes para vigilar
  consumo operativo.

Variables opcionales:

```bash
KMFX_BETA_FRONTEND_URL=https://beta.kmfxedge.com
KMFX_BETA_BACKEND_URL=https://kmfx-edge-api.onrender.com
KMFX_BETA_MT5_API_URL=https://mt5-api.kmfxedge.com
KMFX_BETA_MT5_CORS_ORIGIN=https://kmfxedge.com
```

Si aparece `slow_check:<name>:<ms>`, no bloquea por si solo, pero conviene
revisarlo si supera de forma repetida 2500 ms.

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

## Escalado Futuro

Antes de beta abierta, se puede conectar un log drain o alerta externa a estos
patrones. La aplicacion ya emite eventos listos para monitorizacion sin cambiar
el contrato del backend.
