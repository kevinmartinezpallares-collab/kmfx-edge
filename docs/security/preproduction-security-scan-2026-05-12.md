# Preproduction Security Scan - 2026-05-12

Commit base revisado: `44248f3`
Rama: `main`
Alcance: backend Render, proxy Cloudflare MT5, frontend de cuentas/keys, Launcher, Supabase/RLS documentado, billing/entitlements y gobierno de release.

## Resumen ejecutivo

No he validado ningun P0/P1 nuevo en el codigo revisado para la superficie critica de produccion minima viable.

Los controles principales de KMFX Edge estan en buen estado para una beta controlada:

- Las KMFXKeys no viajan por query string en produccion.
- La ingesta MT5 remota sin key/bearer esta bloqueada.
- Las keys se guardan hasheadas y se muestran solo enmascaradas salvo peticion autenticada del propietario/admin.
- El proxy Cloudflare elimina parametros sensibles de query, no reenvia headers publicos de identidad y solo expone las rutas MT5/health necesarias.
- Los endpoints sensibles tienen rate limit por usuario/IP y la ingesta MT5 tiene rate limit por key.
- Las decisiones de plan se resuelven desde bearer verificado y `app_metadata`, no desde headers remotos ni `user_metadata` publico. El rol admin queda restringido al email propietario `kevinmartinezpallares@gmail.com`.
- El Launcher queda limitado a detectar instalaciones, instalar/reinstalar el EA y abrir MT5. La KMFXKey estable pertenece al dashboard.

## Threat model cubierto

| Superficie | Riesgo principal | Estado |
| --- | --- | --- |
| EA/MT5 ingest | Enviar snapshots sin key, keys en logs o keys en URL | Mitigado |
| Cloudflare Worker | CORS abierto, headers de identidad falsos, secretos en query | Mitigado |
| Backend auth | Usuario normal accediendo a cuentas admin/otro usuario | Mitigado en rutas revisadas |
| Billing/entitlements | Usuario sin plan creando conexiones o accediendo a premium | Mitigado en guards actuales; falta QA live Stripe |
| Dashboard Cuentas | Exponer KMFXKeys o cachearlas para usuario equivocado | Mitigado |
| Launcher | Confundir al usuario con keys/regeneracion o instalar en instancia incorrecta | Mitigado funcionalmente; falta QA clean machine |
| Supabase | RLS/grants inseguros o egress excesivo | RLS documentado; egress sigue como riesgo operativo |
| GitHub release | Merge sin checks, secretos sin push protection | Pendiente operativo |

## Controles validados

### Backend MT5

- `allow_query_connection_key_compat()` solo permite compatibilidad fuera de produccion y con flag explicito.
- `query_connection_key_rejection_response()` rechaza `connection_key`, `api_key` y variantes en query.
- `resolve_authenticated_identity()` prioriza bearer verificado; headers `X-KMFX-User-*` solo son confiables por el flujo local controlado.
- `_allow_no_key_mt5_ingest()` devuelve `False` en produccion.
- `connection_key_rate_limit_response()` aplica limite por key y endpoint.
- `sensitive_rate_limit_response()` protege billing, admin, account writes, regenerate/revoke/delete y direct MT5.

### Cloudflare Worker

- Origen upstream unico: `https://kmfx-edge-api.onrender.com`.
- CORS limitado a `kmfxedge.com`, `www.kmfxedge.com` y `dashboard.kmfxedge.com`.
- Headers permitidos: `Authorization`, `Content-Type`, `X-KMFX-Connection-Key`.
- Parametros sensibles de query eliminados antes de reenviar.
- Headers spoofables `X-KMFX-User-Email` y `X-KMFX-User-Id` eliminados.
- Allowlist de rutas: `/health`, `/api/mt5/sync`, `/api/mt5/journal` y `/api/mt5/policy`.
- Las rutas ajenas al flujo MT5 devuelven `404 path_not_found` desde el Worker y no llegan al backend Render.
- Los fallos de upstream devuelven `502 upstream_unavailable` sin exponer detalles internos.

### Account keys

- Hash con prefijo versionado `sha256:v1:`.
- Comparacion con `hmac.compare_digest`.
- Mascara estandar `primeros 6...ultimos 4`.
- Endpoint de lectura de key exige auth y scope de cuenta.
- Regeneracion queda restringida a admin; usuario normal debe conservar la key estable.

### Frontend y Launcher

- El dashboard usa `Ver detalles` para mostrar/copiar la KMFXKey de la cuenta.
- El frontend no persiste KMFXKeys completas en `localStorage`; las recupera bajo demanda con bearer autenticado.
- El Launcher ya no presenta la key como fuente de verdad visual; indica que esta disponible en Cuentas > Ver detalles.
- Render de Launcher escapa labels, paths, estados y metadata antes de inyectar HTML.
- Las acciones del Launcher se reducen a instalar/reinstalar y abrir MT5.

### Billing

- Checkout y portal requieren auth.
- Return URLs restringidas al origen publico de KMFX.
- Webhook exige firma Stripe.
- Estado de plan y permisos se calculan desde backend.

## Hallazgos y riesgos restantes

### P1 operativo - GitHub release governance no esta confirmado con permisos admin

El gate local detecta que la auditoria de GitHub no puede confirmar branch protection, secret scanning, push protection y Dependabot security updates sin token con permisos suficientes.

Impacto: riesgo de merge accidental, secreto commiteado o release sin checks obligatorios.

Mitigacion recomendada:

- Activar branch protection en `main`.
- Requerir checks: backend/tests, static app checks, production smoke y Windows launcher.
- Activar secret scanning, push protection y Dependabot security updates.
- Reejecutar `python3 scripts/github_release_governance_audit.py` con token admin.

### P1 operativo - Supabase egress excedido

Supabase aviso `Salida 54.91 GB / 5 GB`. Esto no es una vulnerabilidad de codigo, pero si un riesgo de disponibilidad/coste: al terminar el periodo de gracia podria aplicar restricciones.

Mitigacion ya aplicada:

- Polling de `/api/accounts/snapshot` reducido.
- Backoff cuando la pestaña esta oculta.
- `view=summary` para refrescos ligeros.
- Cache backend de resumen durante 5s.
- Cache TTL configurable para bearer verificado.

Mitigacion siguiente si sigue subiendo:

- Tabla/materialized summary por cuenta para vistas de lista.
- Limitar payload historico por defecto y cargar detalle bajo demanda.
- Considerar plan Pro de Supabase antes de beta abierta.

### P2 - Conexion directa MT5 con credenciales debe permanecer bloqueada para usuario normal

El backend conserva capacidades de conexion directa si se entrega password y servidor, pero el producto debe mantener este flujo bloqueado o marcado como pendiente hasta tener vault seguro, auditoria de proveedor, revocacion, rate limits finales y consentimiento explicito.

Decision actual recomendada:

- Produccion MVP: solo EA/Launcher.
- Conexion directa: no visible como flujo principal para usuarios normales.

### P2 - Logs historicos pueden contener keys antiguas

Los fixes actuales enmascaran y sacan keys de URLs, pero logs antiguos de EA/launcher/Render/soporte podrian contener keys previas.

Mitigacion:

- Rotar keys sospechosas.
- Evitar adjuntar capturas con keys completas.
- Mantener mostrar/copiar key solo en dashboard autenticado.

### P2 - Launcher clean-machine QA pendiente

El Launcher funciona en la maquina de desarrollo, pero produccion necesita evidencia en:

- macOS limpio sin instancias previas.
- Windows 10/11 real.
- Usuario no-admin con plan valido.
- Descarga desde dashboard.
- Instalacion/Reinstalacion en MT5.
- WebRequest autorizado.
- Primer sync visible en dashboard.
- Launcher cerrado sin cortar la sincronizacion.

### P2 - Supabase schema drift de configuracion de usuario

Riesgo detectado:

- El frontend usa tablas de configuracion (`user_profiles`,
  `user_preferences`, `risk_rules`, `calculator_presets`,
  `dashboard_objectives`) que no estaban completamente versionadas en
  migraciones locales.

Mitigacion aplicada:

- Se añade migracion reproducible para esas tablas con RLS por usuario,
  indices de ownership y grants solo a `authenticated`.
- La migracion antigua de indice de presets queda tolerante si la tabla no
  existe todavia.

Riesgo restante:

- Si Supabase produccion ya tenia tablas manuales con tipos incompatibles, hay
  que aplicar primero en staging o revisar el plan de migracion antes del push
  remoto.

### P3 - Gatekeeper/notarizacion

El aviso de Apple es esperado porque se decidio no notarizar ahora. No bloquea la beta si esta documentado, pero soporte debe saber explicar `Abrir` desde Finder/context menu.

## Evidencia reciente

`python3 scripts/production_gate.py --full-tests` paso en `44248f3` con:

- `git diff --check`: OK.
- `py_compile_critical_backend`: OK.
- `production_smoke`: OK.
- Web `https://kmfxedge.com`: OK.
- Render `/health`: OK.
- Worker `mt5-api`: OK.
- CORS allowlist y headers MT5: OK.
- MT5 sync sin key: `401 missing_connection_key`.
- MT5 sync con key en query: rechazado.
- Billing checkout/portal sin auth: `401 auth_required`.
- Webhook Stripe sin firma: `400 invalid_signature`.
- Suite completa: `365 tests OK`.

## Decision de salida

Se puede seguir hacia produccion tecnica minima viable con beta controlada si:

- Se acepta que GitHub governance, Supabase egress y clean-machine QA son los bloqueos operativos restantes.
- No se abre conexion directa MT5 con credenciales a usuarios normales.
- Se mantiene el flujo estable de KMFXKey: dashboard como fuente de verdad, Launcher solo instalador.

No recomiendo produccion comercial abierta hasta cerrar:

1. GitHub branch protection / secret scanning / push protection.
2. Customer Portal + webhook Stripe live validado.
3. QA Launcher macOS limpio y Windows real.
4. Control del egress Supabase o upgrade de plan.
