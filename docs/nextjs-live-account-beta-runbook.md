# Next.js Live Account Beta Runbook

Estado: operativo para primera prueba read-only, snapshot live listo
Ultima revision: 2026-05-28
Alcance: validar una cuenta real en `apps/web-next` sin activar auth real, billing real, launcher, MT5 write-flows, enforcement RiskGuard ni export EA.

## Objetivo

Comprobar que la V1 Next puede leer un snapshot MT5 real, degradar si la lectura falla y mantener consistencia entre `Panel`, `Cuentas`, `Portfolio`, `Insights`, `Trades` y `Calendario`.

## Entrada Beta Recomendada

Usar `https://beta.kmfxedge.com` como entrada de beta cerrada.

Motivo:

- separa Next beta de la app legacy en `https://kmfxedge.com`;
- permite rollback simple quitando DNS/env o apuntando el subdominio a una pagina cerrada;
- no requiere mover rutas productivas vanilla;
- permite restringir la lectura live con un bearer preview server-to-server antes de activar auth real completa.

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
export KMFX_PREVIEW_PLAN="pro"
export KMFX_PREVIEW_ALLOW_FULL_SNAPSHOT="true"
```

El bearer preview solo debe vivir en entorno servidor. No debe exponerse como `NEXT_PUBLIC_*`, no sustituye auth real y se retirara cuando la beta pase a sesiones Supabase reales. `KMFX_PREVIEW_ALLOW_FULL_SNAPSHOT` solo se usa en beta cerrada read-only para que Next pueda leer trades/history detallados cuando la guarda de bandwidth esta en modo ahorro; no abre snapshots full para trafico anonimo ni para bearer invalido.

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

Desde la raiz del repo, cuando haya `SUPABASE_SERVICE_ROLE_KEY` o `KMFX_SUPABASE_SERVICE_ROLE_KEY` solo en la sesion local:

```bash
python3 scripts/audit_mt5_live_storage.py --max-sync-age-minutes 120
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

Render se reactivo y `/health` responde `200` con `account_store=SupabaseAccountStore`. La sesion local del launcher se renovo correctamente sin imprimir tokens y `/api/accounts/snapshot?view=summary` devuelve 1 cuenta real Darwinex-Live con `dashboard_payload`, `reportMetrics`, `balance/equity` validos y estado `active`.

Estado resultante:

- el backend desplegado en Render sirve el commit `4718d4a` y conserva `reportMetrics` en el payload compacto de summary;
- el sync parcial con `balance=0` y `equity=0` quedo cubierto por una guarda backend que preserva la ultima lectura positiva y por una guarda del EA para no enviar metricas de cuenta vacias;
- la instancia `MT5-Darwinex` se abrio mediante el acceso dedicado, autorizo la cuenta en Darwinex-Live y el conector `KMFXConnector` sincronizo correctamente en modo solo lectura;
- `qa:live:snapshot` queda en `ready`: 1 cuenta lista, 0 desactualizadas, 0 pendientes y 0 con error;
- `npm run validate:cascade` queda OK con 20 archivos de test y 91 tests, seguido de `typecheck` y `lint` OK;
- `KMFX_WAVE1_SOURCE=live npm run build` queda OK;
- `KMFX_SMOKE_BASE_URL=http://127.0.0.1:3001 npm run test:smoke:routes` queda OK con 14 rutas V1, 16 rutas avanzadas y 1 ruta admin validada;
- `KMFX_QA_BASE_URL=http://127.0.0.1:3001 npm run qa:mobile:v1` queda OK con 14 rutas V1 en dark/light;
- verificacion en navegador sobre `http://127.0.0.1:3001/dashboard`: titulo `KMFX Edge`, H1 `Panel`, cuenta real visible, sin overlay/runtime error y sin errores/warnings de consola; navegacion `Panel -> Cuentas` funciona y muestra H1 `Cuentas`;
- el dominio Render directo bloquea lectura browser legacy y el Worker `mt5-api.kmfxedge.com` queda desplegado para no proxyear lectura de cuentas legacy; mantiene `/health` y `/api/mt5/*` para el EA.

## Nota De Almacenamiento Normalizado 2026-05-28

Se verifico un heartbeat MT5 posterior al deploy `b8b99ce` sin activar flujos de escritura:

- `payload_mode=lightweight`, `sync_reason=heartbeat` y `historyBootstrapFull=false`;
- el registro principal queda en `payloadShape=storage-summary` con `fullPayloadStored=false`;
- el registro principal no conserva arrays pesados `trades` ni `history`;
- la lectura full reconstruye 20 operaciones y 48 puntos de equity desde tablas normalizadas;
- `mt5_account_trades` contiene 20 filas y `mt5_equity_points` contiene 48 filas para la cuenta activa;
- `scripts/audit_mt5_live_storage.py` queda como auditoria repetible de storage live sin imprimir tokens ni identificadores completos.

## Nota De Gate Preview 2026-05-28

Se adopta `https://beta.kmfxedge.com` como entrada recomendada de beta cerrada. El backend acepta un bearer preview configurado en entorno servidor para que Next pueda pedir `/api/accounts/snapshot` sin abrir auth real completa todavia.

Guardas:

- sin bearer valido, `/api/accounts/snapshot` sigue devolviendo `auth_required`;
- headers `X-KMFX-User-*` remotos no crean identidad si no van acompanados del bearer preview;
- el bearer preview aplica metadata de plan activa solo para la beta read-only;
- el legacy dashboard sigue bloqueado para lectura browser de cuentas.

Siguiente paso antes de invitar usuarios externos:

- configurar hosting del frontend Next con variables `KMFX_WAVE1_SOURCE=live`, `KMFX_API_BASE_URL`, timeout y token/identidad preview o gate equivalente;
- probar una segunda cuenta beta read-only para cubrir multi-cuenta sin activar billing/auth/launcher reales;
- registrar feedback por ruta V1 y no abrir rutas `Proximamente` hasta su chat dedicado.

## Nota De Validacion Live 2026-05-28

Se desplego el backend `c944159` en Render con una guarda adicional para el sync MT5 ligero:

- el EA normaliza claves copiadas desde `.set` con metadata y evita duplicar timestamps en el historico minimo;
- el backend hace unico `point_time` antes del upsert de `mt5_equity_points`;
- Darwinex queda lista para beta read-only: snapshot `summary` conectado, storage normalizado `ready`, registro ligero sin arrays pesados y reconstruccion full desde tablas normalizadas;
- IC Markets aparece en snapshot preview con balance/equity y posicion abierta, pero queda como riesgo operativo hasta que la instancia local MT5 vuelva a refrescar; los logs muestran rechazo de `WebRequest` en la instancia Wine aunque la URL autorizada figura en `common.ini`;
- `qa:live:integrity` queda `ready` con ventana de 60 minutos para validar paridad `summary/full`, pero `qa:live:snapshot` marca `partial` porque IC esta desactualizada frente a la ventana estricta de 5-20 minutos.

Estado resultante:

- para beta inicial, Darwinex es la cuenta candidata segura;
- IC Markets sirve para validar lectura multi-cuenta en snapshot, pero no debe considerarse cerrada hasta ver un heartbeat nuevo posterior al deploy;
- no se activaron flujos de escritura MT5, billing real, auth real, launcher ni enforcement.

## Nota De Hosting Beta 2026-05-28

El proyecto Vercel enlazado localmente es `kmfx-edge` y sigue representando la superficie productiva/legacy con dominios `kmfxedge.com`, `www.kmfxedge.com` y `dashboard.kmfxedge.com`. No debe usarse para cortar `apps/web-next` encima de produccion.

Decision operativa:

- mantener `kmfxedge.com` como legacy mientras se prueba Next;
- publicar Next en un proyecto/entorno separado o dominio beta dedicado;
- usar `beta.kmfxedge.com` como destino recomendado para beta cerrada;
- configurar ahi, solo en entorno servidor, `KMFX_WAVE1_SOURCE=live`, `KMFX_API_BASE_URL`, `KMFX_SNAPSHOT_TIMEOUT_MS`, `KMFX_PREVIEW_BEARER_TOKEN`, `KMFX_PREVIEW_USER_EMAIL`, `KMFX_PREVIEW_USER_ID` y `KMFX_PREVIEW_ALLOW_FULL_SNAPSHOT`;
- no promocionar el proyecto legacy actual como beta Next sin revisar framework/root directory/build command.

Preflight operativo:

```bash
python3 scripts/next_beta_preflight.py
```

Con `RENDER_API_KEY` disponible en la sesion, el preflight lee las variables preview desde Render sin imprimir secretos y comprueba backend, Worker, snapshot summary, scripts de Next y el enlace Vercel local.

Resultado actual:

- backend y Worker OK en `c944159`;
- snapshot summary listo con 1 cuenta fresca y 1 cuenta stale;
- Next local tiene los scripts de validacion necesarios;
- Vercel local esta enlazado al proyecto legacy, por lo que el hosting beta separado sigue pendiente.

## Nota De Worker CORS 2026-05-28

Durante la revision de cierre beta se comprobo que el Worker `mt5-api.kmfxedge.com` ya no proxyea `/api/accounts/snapshot`, pero la version desplegada todavia anade `Access-Control-Allow-Origin` a la respuesta `404` cuando el origen es `https://kmfxedge.com`.

Estado preparado en repo:

- `cloudflare/mt5-api-proxy.js` mantiene CORS solo para `/health` y rutas permitidas `/api/mt5/*`;
- `/accounts`, `/api/accounts/*`, `/api/direct-mt5/*` y rutas no permitidas devuelven `404 path_not_found` sin CORS de navegador;
- `wrangler.jsonc` define el Worker `kmfx-mt5-api-proxy` apuntando a `mt5-api.kmfxedge.com/*` sin secretos ni bindings;
- `scripts/production_smoke.py` incluye una asercion para detectar que `/api/accounts/snapshot?view=summary` en el Worker no se proxyea y no expone `Access-Control-Allow-Origin`;
- validacion local: `node --check cloudflare/mt5-api-proxy.js`, harness Node de rutas legacy/MT5 OK y `npx wrangler deploy --dry-run --config wrangler.jsonc` OK.

Cuando haya token Cloudflare en la sesion local:

```bash
export CLOUDFLARE_API_TOKEN="..."
npx wrangler deploy --config wrangler.jsonc
python3 scripts/production_smoke.py
```

Pendiente operativo: desplegar el Worker actualizado en Cloudflare y repetir el smoke publico. Hasta ese despliegue, el riesgo no es filtrado de cuentas por Worker porque la ruta devuelve `404`, pero la cabecera CORS sigue mas permisiva de lo ideal en rutas no MT5.

## Evidencia Minima

Registrar sin datos sensibles:

- hora de prueba;
- estado `ready`, `partial` o `blocked`;
- numero de cuentas listas/desactualizadas/pendientes/error;
- comandos ejecutados y resultado;
- diferencias de paridad detectadas contra MT5/export;
- decisiones pendientes antes de invitar mas cuentas beta.
