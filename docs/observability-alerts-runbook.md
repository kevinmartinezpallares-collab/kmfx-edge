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

## Eventos Cubiertos

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
