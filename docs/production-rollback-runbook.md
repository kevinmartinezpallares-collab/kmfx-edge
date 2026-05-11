# KMFX Edge Production Rollback Runbook

Ultima revision: 2026-05-11
Alcance: web Vercel, backend Render, Worker Cloudflare, Launcher/EA, billing Stripe, Supabase y MT5.

## Objetivo

Tener una respuesta clara si una release rompe login, billing, MT5 sync, metricas, descargas o seguridad de cuentas.

Este documento no contiene secretos y no autoriza cambios destructivos. Cualquier borrado de datos reales, rotacion de secrets o cambio de plan requiere aprobacion explicita.

## Regla Principal

Primero proteger datos y pagos. Luego restaurar servicio.

Orden recomendado ante incidente:

1. Congelar nuevos cambios en `main`.
2. Identificar superficie afectada.
3. Bloquear temporalmente la funcion si existe feature flag o guard.
4. Restaurar ultimo deploy bueno.
5. Ejecutar smoke minimo.
6. Documentar causa, impacto y siguiente fix.

## Severidad

| Nivel | Ejemplos | Accion |
| --- | --- | --- |
| P0 | fuga de datos entre usuarios, keys expuestas, cobros erroneos, MT5 sync aceptando sin key | congelar, apagar endpoint/feature, rollback inmediato, rotar si procede |
| P1 | login roto, billing roto, cuentas desaparecen, metricas criticas erroneas | rollback o hotfix en menos de 1 hora |
| P2 | visual roto, copy incorrecto, descarga secundaria fallando | hotfix controlado sin congelar todo |

## Smoke Minimo Tras Cualquier Rollback

```bash
python3 scripts/production_smoke.py
```

Debe confirmar:

- `https://kmfxedge.com` responde y mantiene headers de seguridad.
- Rutas SPA principales responden.
- Descargas macOS/Windows/EA responden y checksums coinciden.
- Render `/health` responde.
- `/api/accounts/snapshot?view=summary` no expone datos sin auth.
- Billing checkout/portal requieren auth.
- Stripe webhook rechaza payload sin firma.
- `https://mt5-api.kmfxedge.com` responde.
- Sync MT5 sin key se rechaza.
- Key en query string no se acepta.

## Web Vercel

Rollback seguro:

1. Abrir Vercel > proyecto `kmfx-edge` > Deployments.
2. Elegir el ultimo deployment verde conocido.
3. Promoverlo a production.
4. Ejecutar `scripts/production_smoke.py`.
5. Verificar manualmente:
   - login;
   - `/dashboard`;
   - `/cuentas`;
   - descarga Launcher;
   - apertura del modal de conectar cuenta.

No hacer:

- No cambiar variables secretas en Vercel si el fallo es solo frontend.
- No eliminar dominios.
- No cambiar DNS salvo incidente de dominio.

## Backend Render

Rollback seguro:

1. Abrir Render > servicio `kmfx-edge-api`.
2. Revisar deploys recientes y localizar ultimo commit bueno.
3. Usar rollback/redeploy del deploy bueno o revert commit en Git si Render no permite rollback directo.
4. Esperar `/health` con `ok=true`.
5. Ejecutar smoke minimo.
6. Probar:
   - `/api/accounts/snapshot?view=summary` anonimo;
   - `/api/mt5/sync` sin key;
   - `/api/billing/checkout` sin bearer.

Si el incidente afecta keys o account isolation:

- bloquear ingest remoto temporalmente con env/feature flag si existe;
- no rotar keys sin aprobacion;
- conservar logs de ventana afectada.

## Cloudflare Worker `mt5-api`

Rollback seguro:

1. Abrir Cloudflare Worker `kmfx-mt5-api-proxy`.
2. Revertir al deployment anterior.
3. Verificar:

```bash
curl -i https://mt5-api.kmfxedge.com/health
curl -i -X OPTIONS https://mt5-api.kmfxedge.com/api/mt5/sync \
  -H "Origin: https://kmfxedge.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,x-kmfx-connection-key"
```

4. Confirmar que origen malicioso sigue devolviendo rechazo.

No hacer:

- No permitir `Access-Control-Allow-Origin: *`.
- No reenviar `X-KMFX-User-*` desde trafico remoto.
- No aceptar keys por query string.

## Launcher Y EA

Rollback seguro de artefactos publicos:

1. Identificar el ultimo artefacto bueno:
   - `downloads/KMFX-Launcher-macOS.zip`
   - `downloads/KMFX-Launcher-Windows.exe`
   - `KMFXConnector.ex5`
2. Restaurar artefactos y `.sha256` correspondientes desde el commit bueno.
3. Verificar hashes locales:

```bash
shasum -a 256 downloads/KMFX-Launcher-macOS.zip
shasum -a 256 downloads/KMFX-Launcher-Windows.exe
shasum -a 256 KMFXConnector.ex5
```

4. Ejecutar `scripts/production_smoke.py`.
5. Hacer smoke MT5 manual con `docs/mt5-production-smoke-runbook.md`.

No hacer:

- No publicar un `.ex5` que no coincida con su checksum.
- No publicar un EA que mande keys en query.
- No mezclar RiskGuard activo en el paquete publico de `KMFXConnector`.

## Billing Stripe

Rollback seguro:

1. Si hay riesgo de cobro incorrecto, pausar enlaces/CTA de checkout desde frontend o feature flag.
2. No borrar productos, prices, cupones ni customers.
3. Confirmar que webhook sigue rechazando firma invalida.
4. Revisar Stripe Events para errores.
5. Si un webhook malo concedio acceso incorrecto:
   - congelar cambios;
   - exportar eventos afectados;
   - corregir estado en Supabase solo con lista exacta de usuarios;
   - documentar cada cambio.

No hacer sin aprobacion:

- reembolsos masivos;
- cancelar suscripciones reales;
- cambiar live secret keys;
- borrar productos/precios.

## Supabase

Rollback seguro:

1. Si el fallo es de Auth/configuracion, revertir ajuste manual desde Dashboard y probar login.
2. Si el fallo es de datos, no ejecutar migraciones destructivas.
3. Confirmar RLS activa antes de reabrir trafico.
4. Para cambios de schema, preferir migracion forward-fix antes que revert manual si hay datos nuevos.
5. Si hay sospecha de fuga:
   - congelar ingest;
   - exportar ventana temporal;
   - preservar logs;
   - rotar secrets solo con aprobacion.

Checks minimos:

- usuario anonimo no recibe snapshots privados;
- usuario normal no ve cuentas admin;
- admin conserva acceso completo;
- tablas publicas visibles mantienen RLS.

## MT5 Sync Incidents

Si las cuentas aparecen y desaparecen:

1. Revisar `/health` de Render y Worker.
2. Revisar si `last_sync` cambia en Dashboard.
3. Confirmar que el EA no repite:
   - key no reconocida;
   - WebRequest no autorizado;
   - servidor temporalmente no disponible.
4. Confirmar que el usuario usa la misma KMFXKey de `Ver detalles`.
5. Confirmar que cerrar Launcher no corta el sync si el EA ya esta activo.

Si el backend rechaza demasiados payloads:

- revisar rate limit por key;
- revisar tamano de payload;
- revisar version del EA;
- revisar si `view=summary` y cache siguen reduciendo egress.

## Comunicacion

Mensaje interno minimo:

```text
Incidente:
Inicio:
Superficie afectada:
Usuarios afectados:
Accion tomada:
Commit/deploy rollback:
Smoke:
Riesgo residual:
Siguiente fix:
```

Mensaje al usuario si aplica:

```text
Estamos corrigiendo una incidencia temporal de sincronizacion/servicio.
Tus credenciales de broker no estan almacenadas en KMFX y el conector no ejecuta operaciones.
Te avisaremos cuando el servicio vuelva a estar estable.
```

## Criterio De Cierre

- Smoke automatico verde.
- Login probado.
- Snapshot anonimo no expone datos.
- MT5 ingest sin key se rechaza.
- Una cuenta controlada sincroniza.
- Billing no concede acceso incorrecto.
- Incidente documentado.
- Fix definitivo entra por commit nuevo, no por cambios manuales invisibles.
