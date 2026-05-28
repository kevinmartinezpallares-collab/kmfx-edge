# Next.js Live Account Beta Runbook

Estado: operativo para primera prueba read-only, pendiente de snapshot fresco
Ultima revision: 2026-05-28
Alcance: validar una cuenta real en `apps/web-next` sin activar auth real, billing real, launcher, MT5 write-flows, enforcement RiskGuard ni export EA.

## Objetivo

Comprobar que la V1 Next puede leer un snapshot MT5 real, degradar si la lectura falla y mantener consistencia entre `Panel`, `Cuentas`, `Portfolio`, `Insights`, `Trades` y `Calendario`.

## No Tocar

- no enviar ordenes;
- no modificar cuentas MT5;
- no activar logout/auth real;
- no abrir portal billing real;
- no activar enforcement RiskGuard;
- no exportar EA real;
- no imprimir logins completos, account ids, user ids ni tokens en logs o chat.

## Variables

Definir solo para la sesion local de prueba:

```bash
export KMFX_API_BASE_URL="https://..."
export KMFX_WAVE1_SOURCE="live"
export KMFX_SNAPSHOT_TIMEOUT_MS="8000"
```

Opcionales si el endpoint preview lo requiere:

```bash
export KMFX_PREVIEW_BEARER_TOKEN="..."
export KMFX_PREVIEW_USER_EMAIL="..."
export KMFX_PREVIEW_USER_ID="..."
```

Para reactivar Render sin dejar que el dashboard legacy lea o conecte cuentas desde navegador:

```bash
export KMFX_BLOCK_LEGACY_DASHBOARD_LIVE="true"
export KMFX_FEATURE_DIRECT_MT5="false"
```

El bloqueo legacy afecta a llamadas browser-origin desde `kmfxedge.com`, `www.kmfxedge.com` y `dashboard.kmfxedge.com` contra `/accounts`, `/api/accounts/*` y `/api/direct-mt5/*`. No bloquea `/api/mt5/sync`, para que una cuenta ya enlazada pueda seguir enviando snapshots read-only con su connection key.

Importante: aplicar el mismo cierre en el Worker `mt5-api.kmfxedge.com`. El Worker no debe proxyear `/accounts`, `/api/accounts/*` ni `/api/direct-mt5/*`; solo `/health` y rutas `/api/mt5/*` read-only/ingest necesarias para el EA. Hasta desplegar `cloudflare/mt5-api-proxy.js`, verificar manualmente que `Origin: https://kmfxedge.com` no recibe `Access-Control-Allow-Origin` en rutas de cuenta.

Si hay token de Render disponible en la sesion local:

```bash
export RENDER_API_KEY="..."
python3 scripts/render_suspend_service.py --action resume --name-contains kmfx-edge-api
python3 scripts/render_suspend_service.py --action status --name-contains kmfx-edge-api
```

Para desplegar el commit actual del servicio conectado en Render:

```bash
python3 scripts/render_suspend_service.py --action deploy --name-contains kmfx-edge-api
```

Si se necesita desplegar un SHA concreto:

```bash
python3 scripts/render_suspend_service.py --action deploy --service-id "$RENDER_SERVICE_ID" --commit-id "<sha>"
```

## Orden De Prueba

Desde `apps/web-next`:

```bash
npm run validate:cascade
npm run qa:live:snapshot
npm run build
KMFX_WAVE1_SOURCE=live npm run start -- --hostname 0.0.0.0 --port 3001
KMFX_SMOKE_BASE_URL=http://localhost:3001 npm run test:smoke:routes
KMFX_QA_BASE_URL=http://localhost:3001 npm run qa:mobile:v1
```

Despues abrir `http://localhost:3001/dashboard` y revisar manualmente:

- `Panel`: equity, P&L abierto, room diario, riesgo abierto y curva.
- `Cuentas`: estado conectado/desactualizado/pendiente/error y cuenta activa.
- `Trades`: numero de operaciones y ultimas operaciones cerradas.
- `Calendario`: dias operados y P&L por dia.
- `Insights`: daily/hourly buckets derivados del snapshot.
- `Portfolio`: pesos por cuenta y lectura agregada.

## Criterios Go

- `qa:live:snapshot` devuelve `ready` o `partial` sin bloqueos.
- Al menos una cuenta aparece lista para prueba read-only.
- Smoke routes pasa en modo `KMFX_WAVE1_SOURCE=live`.
- Mobile QA pasa en dark/light.
- No aparece runtime error ni pantalla en blanco.
- No se muestran identificadores completos en logs compartidos.
- Las cifras principales coinciden razonablemente con MT5/export para la misma ventana temporal.

## Criterios Stop

- `qa:live:snapshot` devuelve `blocked`.
- No hay `dashboard_payload` usable.
- Equity/balance llegan vacios o no numericos.
- La cuenta aparece conectada aunque la lectura este claramente desactualizada.
- Trades o calendario contradicen el export MT5.
- Cualquier flujo intenta escribir, bloquear, sincronizar destructivamente o modificar MT5.

## Nota De Prueba 2026-05-27

La configuracion local de KMFX apunta al backend de Render usado por el bridge, pero el servicio respondio `503 Service Suspended` durante la validacion. Tambien se encontraron artefactos locales de equity/risk/trades reutilizables para una prueba read-only de shape, pero su `last_sync_at` estaba desactualizado y `qa:live:snapshot` los bloqueo correctamente como no aptos para beta real.

Estado resultante:

- la tuberia Next `KMFX_WAVE1_SOURCE=live` carga snapshots con shape real y degrada sin romper rutas;
- no hay una cuenta fresca lista para invitar a beta mientras no se reactive el backend o el bridge local publique un snapshot actual;
- no se hicieron llamadas de escritura ni cambios sobre MT5.

## Nota De Prueba 2026-05-28

Render se reactivo y `/health` responde `200` con `account_store=SupabaseAccountStore`. La sesion local del launcher se renovo correctamente sin imprimir tokens y `/api/accounts/snapshot?view=summary` devuelve 1 cuenta real Darwinex-Live con `dashboard_payload` y estado `active`.

Estado resultante:

- la lectura previa tenia balance/equity `103379.11`, pero el sync fresco de `2026-05-28T07:38:28.740660+00:00` llego parcial con `balance=0` y `equity=0`;
- `qa:live:snapshot` sigue en `blocked`: la cuenta ya no esta desactualizada, pero falta equity/balance valido y faltan `reportMetrics`;
- la instancia `MT5-Darwinex` se pudo abrir, el terminal autorizo la cuenta en Darwinex-Live y el conector `KMFXConnector` esta instalado; el siguiente paso es revisar por que el EA lee `ACCOUNT_BALANCE/ACCOUNT_EQUITY` como cero en ese arranque;
- se preparo un fix backend local para no machacar la ultima lectura positiva cuando entra un sync parcial con balance/equity cero; requiere deploy de backend para proteger siguientes syncs;
- se preparo una guarda local en `KMFXConnector.mq5` para no enviar estado si MT5 aun devuelve `ACCOUNT_BALANCE=0` y `ACCOUNT_EQUITY=0` con login cargado; no se compilo ni exporto el EA en esta fase;
- el servicio local del launcher responde correctamente en foreground, pero Codex no puede dejarlo persistente al cerrar el comando; para prueba sostenida hay que abrir la app `KMFX Launcher` o ejecutar `python3 -m launcher.service` en una terminal del usuario;
- el dominio Render directo ya bloquea lectura browser legacy por CORS; el Worker `mt5-api.kmfxedge.com` necesita deploy del hardening local antes de considerar cerrado el bloqueo legacy completo.

## Evidencia Minima

Registrar sin datos sensibles:

- hora de prueba;
- estado `ready`, `partial` o `blocked`;
- numero de cuentas listas/desactualizadas/pendientes/error;
- comandos ejecutados y resultado;
- diferencias de paridad detectadas contra MT5/export;
- decisiones pendientes antes de invitar mas cuentas beta.
