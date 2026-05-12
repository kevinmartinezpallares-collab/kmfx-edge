# KMFX Edge - Evidencia de Release

Este documento registra pruebas de produccion ejecutadas antes del go live. No
contiene secretos ni keys completas.

## 2026-05-11 - Checkpoint `cd9c383`

Contexto:

- Rama: `main`
- Commit local: `cd9c383dde2f005584c6449e6b4a34824f83b168`
- Commit desplegado en Render durante el smoke:
  `cd9c383dde2f005584c6449e6b4a34824f83b168`
- Hora del smoke: 2026-05-11 09:37 Europe/Andorra

GitHub:

- `CI` en `cd9c383`: verde.
- `Push on main` en `cd9c383`: verde.
- Los endpoints privados de branch protection, Dependabot alerts y secret
  scanning requieren credenciales de administracion; siguen pendientes de
  confirmar/activar desde GitHub Dashboard o API autenticada.

Smoke de produccion:

- `python3 scripts/production_smoke.py`: verde.
- `https://kmfxedge.com`: responde `200`.
- Rutas SPA probadas: `/dashboard`, `/cuentas`, `/ejecucion`, `/journal`,
  `/estudio` y `/ajustes`.
- Headers verificados: CSP, HSTS, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff` y CORS sin wildcard.
- Descargas verificadas:
  - `downloads/KMFX-Launcher-macOS.zip`
  - `downloads/KMFX-Launcher-Windows.exe`
  - `KMFXConnector.ex5`
- Checksums de launcher coinciden con repo.
- Hash de `KMFXConnector.ex5` coincide con repo:
  `cabc679109c674044f592035152c5cf40ea0749b366f31b213a72cf200ee741b`.
- Render `/health`: `ok`.
- `mt5-api.kmfxedge.com/health`: `ok` via Worker.
- CORS del Worker permite `X-KMFX-Connection-Key` y bloquea headers de usuario.
- `/api/accounts/snapshot?view=summary` sin bearer no expone cuentas y devuelve
  `auth_required: true`.
- `/api/billing/checkout` sin bearer rechaza `401 auth_required`.
- `/api/billing/portal` sin bearer rechaza `401 auth_required`.
- `/api/billing/webhook` sin firma rechaza `400 invalid_signature`.
- `/api/mt5/sync` sin key rechaza `401 missing_connection_key`.
- `/api/mt5/sync` con key en query sigue rechazado en produccion.

Probes adicionales:

- `https://www.kmfxedge.com/dashboard` redirige/resuelve a
  `https://kmfxedge.com/dashboard`.
- `https://dashboard.kmfxedge.com/dashboard` redirige/resuelve a
  `https://kmfxedge.com/dashboard`.
- `/api/mt5/policy?login=smoke` sin key rechaza `401 missing_connection_key`.

Pendiente real:

- QA macOS limpio con instalacion nueva del Launcher.
- QA Windows 10/11 limpio con instalacion nueva del Launcher.
- Smoke MT5 con evidencia: primer sync, cierre del Launcher y continuidad de
  sincronizacion desde EA cloud.
- Activar o confirmar en GitHub: branch protection, secret scanning, push
  protection y Dependabot alerts/security updates.

## 2026-05-12 - Checkpoint `f5e6105`

Contexto:

- Rama: `main`
- Commit desplegado en Render durante el smoke:
  `f5e61059fbdb6e63a652d35f03ff4f52c97a6274`
- Hora del smoke: 2026-05-12 04:05 Europe/Andorra

Validacion local:

- `python3 -m unittest discover -s tests`: 349 tests OK.

Smoke de produccion:

- `python3 scripts/production_smoke.py`: verde.
- `https://kmfxedge.com`: responde `200`.
- Rutas SPA probadas: `/dashboard`, `/cuentas`, `/ejecucion`, `/journal`,
  `/estudio` y `/ajustes`.
- Headers verificados: CSP, HSTS, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, CORS sin wildcard y origen KMFX.
- Descargas verificadas:
  - `downloads/KMFX-Launcher-macOS.zip`
  - `downloads/KMFX-Launcher-Windows.exe`
  - `KMFXConnector.ex5`
- Checksums de launcher coinciden con repo.
- Hash de `KMFXConnector.ex5` coincide con repo:
  `cabc679109c674044f592035152c5cf40ea0749b366f31b213a72cf200ee741b`.
- Render `/health`: `ok`.
- `mt5-api.kmfxedge.com/health`: `ok` via Worker.
- CORS del Worker permite `X-KMFX-Connection-Key`, no permite headers de
  usuario y bloquea origenes desconocidos.
- `/api/accounts/snapshot?view=summary` sin bearer no expone cuentas y devuelve
  `auth_required: true`.
- `/api/billing/checkout` y `/api/billing/portal` sin bearer rechazan
  `401 auth_required`.
- `/api/billing/webhook` sin firma rechaza `400 invalid_signature`.
- `/api/mt5/sync` sin key rechaza `401 missing_connection_key`.
- `/api/mt5/sync` con key en query sigue rechazado en produccion.
