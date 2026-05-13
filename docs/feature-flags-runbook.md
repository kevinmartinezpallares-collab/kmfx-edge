# Feature Flags y Kill Switches de Produccion

Objetivo: poder apagar funciones de riesgo sin desplegar codigo nuevo y sin
romper el flujo principal EA/Launcher.

## Principios

- El flujo principal `EA -> mt5-api -> backend -> dashboard` debe seguir activo.
- Las funciones opcionales se apagan con variables de entorno en Render.
- Una variable `KMFX_DISABLE_*` tiene prioridad sobre cualquier `KMFX_ENABLE_*`.
- Tras cambiar una variable en Render, reinicia o redeploya el servicio backend.

## Flags disponibles

| Funcion | Variable recomendada | Default en produccion | Uso |
| --- | --- | --- | --- |
| Conexion directa MT5 | `KMFX_ENABLE_DIRECT_MT5=1` | Desactivada | Activar solo cuando vault, proveedor y limites esten validados. |
| Conexion directa MT5 | `KMFX_DISABLE_DIRECT_MT5=1` | Desactivada | Apagado inmediato ante incidencia de proveedor o credenciales. |
| Billing checkout/portal | `KMFX_DISABLE_BILLING=1` | Activada | Apagar compras/portal si Stripe, webhooks o catalogo fallan. |
| Exports / AI evidence | `KMFX_DISABLE_EXPORTS=1` | Activada | Apagar exportaciones si hay fuga, abuso o coste anomalo. |
| Journal AI | `KMFX_DISABLE_JOURNAL_AI=1` | Reservada | Flag reservado para el modulo IA cuando tenga endpoint propio. |
| Risk editor | `KMFX_DISABLE_RISK_EDITOR=1` | Reservada | Flag reservado para editor de politicas si se expone remotamente. |

Tambien se aceptan valores explicitos con `KMFX_FEATURE_<FEATURE>=false` o
`KMFX_ENABLE_<FEATURE>=true`, pero para incidentes se recomienda usar siempre
`KMFX_DISABLE_*`.

## Procedimientos rapidos

### Apagar conexion directa MT5

1. En Render, abre el servicio del backend KMFX.
2. Añade o cambia `KMFX_DISABLE_DIRECT_MT5=1`.
3. Verifica que `/api/direct-mt5/brokers` devuelve `503 feature_disabled`.
4. Confirma que `/api/mt5/sync` con KMFXKey valida sigue funcionando.

### Apagar compras o portal de Stripe

1. En Render, añade `KMFX_DISABLE_BILLING=1`.
2. Verifica que `/api/billing/checkout` y `/api/billing/portal` devuelven
   `503 feature_disabled` para usuarios autenticados.
3. El webhook de Stripe no se apaga con este flag para no perder eventos ya
   emitidos.

### Apagar exports

1. En Render, añade `KMFX_DISABLE_EXPORTS=1`.
2. Verifica que `/api/accounts/<id>/ai-evidence-report` devuelve
   `503 feature_disabled`.
3. Revisa Supabase egress si el apagado fue por consumo anomalo.

## Validacion local

```bash
python3 -m unittest tests.test_connector_cors_config
python3 -m py_compile kmfx_connector_api.py
git diff --check
```

## Estado actual

- Implementado en backend: `direct_mt5`, `billing`, `exports`.
- Reservado/documentado: `journal_ai`, `risk_editor`.
- Pendiente antes de beta abierta: confirmar que el dashboard muestra mensaje
  claro si una funcion opcional queda apagada.
