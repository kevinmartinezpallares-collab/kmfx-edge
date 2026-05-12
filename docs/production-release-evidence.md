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

## 2026-05-12 - Checkpoint `c63ebd9`

Contexto:

- Rama: `main`
- Commit local: `c63ebd9 Document MT5 key repair flow`.
- Commit desplegado en Render durante el smoke:
  `be77dd92adf0ba073981e96985faad8e56650332`.
- Nota: `c63ebd9` solo modifica documentacion; por eso Render mantiene el commit backend anterior.

Cambio documentado:

- Flujo de reinstalacion para KMFXKeys antiguas o incorrectas:
  - descargar de nuevo el Launcher hasta que exista auto-update;
  - reinstalar conector sobre la cuenta existente;
  - no crear una cuenta duplicada salvo que sea otra cuenta MT5;
  - regenerar key solo por revocacion, filtracion o cambio explicito;
  - validar que MT5 vuelve a `Conectado a KMFX`.

Smoke de produccion:

- `python3 scripts/production_smoke.py`: verde.
- `https://kmfxedge.com`: responde `200`.
- Rutas SPA probadas: `/dashboard`, `/cuentas`, `/ejecucion`, `/journal`,
  `/estudio` y `/ajustes`.
- Descargas verificadas:
  - `downloads/KMFX-Launcher-macOS.zip`
  - `downloads/KMFX-Launcher-Windows.exe`
  - `KMFXConnector.ex5`
- Checksums de launcher coinciden con repo:
  - macOS ZIP: `d97e74a09488f730971abd4ac06fc36f8dfd17ff7582833b41eecfbd31766a1b`
  - Windows EXE: `32f26a0395a725a39baf5ed9c48daf5023ed298118b919d4b565644ce80dbac1`
- Hash de `KMFXConnector.ex5` coincide con repo:
  `cabc679109c674044f592035152c5cf40ea0749b366f31b213a72cf200ee741b`.
- Render `/health`: `ok`.
- `mt5-api.kmfxedge.com/health`: `ok` via Worker.
- CORS del Worker permite `X-KMFX-Connection-Key`, no permite headers de
  usuario y bloquea origenes desconocidos.
- `/api/billing/checkout` y `/api/billing/portal` sin bearer rechazan
  `401 auth_required`.
- `/api/billing/webhook` sin firma rechaza `400 invalid_signature`.
- `/api/mt5/sync` sin key rechaza `401 missing_connection_key`.
- `/api/mt5/sync` con key en query sigue rechazado en produccion.

## 2026-05-12 - Checkpoint `e48e695`

Contexto:

- Rama: `main`.
- Commit desplegado en Render durante el smoke:
  `e48e6954d10726d38a17ca7a20277ff199fa7a50`.
- Hora del gate: 2026-05-12 23:55 UTC.

Cambio validado:

- El asistente de conexión MT5 ya no induce a regenerar keys para reparar una
  cuenta existente.
- La KMFXKey se trata como estable por cuenta MT5: se crea para una cuenta
  nueva, se conserva en Cuentas > Ver detalles y se reutiliza al reinstalar el
  EA en esa misma cuenta.

Gate de producción:

- `python3 scripts/production_gate.py`: verde.
- `git diff --check`: verde.
- Compilación Python crítica: verde.
- Smoke de producción: verde.
- Regresiones de seguridad de conector/auth: verde.

Smoke de producción:

- `https://kmfxedge.com`: responde `200`.
- Rutas SPA probadas: `/dashboard`, `/cuentas`, `/ejecucion`, `/journal`,
  `/estudio` y `/ajustes`.
- Descargas verificadas:
  - `downloads/KMFX-Launcher-macOS.zip`
  - `downloads/KMFX-Launcher-Windows.exe`
  - `KMFXConnector.ex5`
- Checksums publicados coinciden con repo:
  - macOS ZIP:
    `22ec9a1ddadaeae0189f0f6cdb534e57b68d9987c3a32a1bde729e21dfee8224`
  - Windows EXE:
    `657d8279fb0c0a008f22e92656dd67226340f4badcb579cbd1bde525ad4350dc`
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

Pendiente por credenciales de plataforma:

- El gate local no tiene `GITHUB_TOKEN`; por eso secret scanning, push
  protection, Dependabot security updates y branch protection de `main` siguen
  pendientes de confirmar desde GitHub Dashboard/API autenticada.

## 2026-05-12 - Stripe Billing Read-Only Scan

Contexto:

- Plugin usado: Stripe MCP en modo lectura/busqueda.
- Producto revisado: `prod_UT7nzmgj3Eg3Zv`.
- Objetivo: confirmar el estado del catalogo antes de cerrar billing operativo.

Resultado:

- Producto live encontrado: `KMFX Edge`.
- Prices activos encontrados:
  - Basic/Core monthly: 15 EUR.
  - Basic/Core yearly: 150 EUR.
  - Pro monthly: 25 EUR.
  - Pro yearly: 250 EUR.
  - Unlimited monthly: 39 EUR.
  - Unlimited yearly: 390 EUR.
- Lookup keys buscadas y no encontradas:
  - `kmfx_basic_monthly`
  - `kmfx_basic_yearly`
  - `kmfx_pro_monthly`
  - `kmfx_pro_yearly`
  - `kmfx_unlimited_monthly`
  - `kmfx_unlimited_yearly`

Limitacion:

- El conector disponible permite listar, buscar y crear algunos objetos, pero no
  expone actualizacion de Prices ni configuracion de Customer Portal.
- `STRIPE_SECRET_KEY` no esta presente localmente, asi que no se ejecutan
  mutaciones Stripe desde esta maquina.

Impacto:

- El backend puede seguir usando los Price IDs live configurados en Render.
- Antes de cobrar publicamente queda pendiente completar lookup keys/metadata,
  Customer Portal y webhook endpoint final en Stripe Dashboard/API.

## 2026-05-12 - GitHub Governance Local Audit

Comando:

```bash
python3 scripts/github_release_governance_audit.py --repo kevinmartinezpallares-collab/kmfx-edge --branch main
```

Resultado local:

- `CODEOWNERS`: OK.
- Dependabot version updates: OK para `github-actions`, `npm` y `pip`.
- Workflows presentes:
  - `.github/workflows/ci.yml`
  - `.github/workflows/production-smoke.yml`
  - `.github/workflows/windows-launcher.yml`

Pendiente por credenciales de plataforma:

- `GITHUB_TOKEN` admin no esta presente localmente.
- Secret scanning, push protection, Dependabot security updates y branch
  protection de `main` no se pueden verificar desde este checkout sin token con
  permisos de administracion/seguridad.

## 2026-05-12 - Supabase Egress Guard Checkpoint

Contexto:

- Rama local: `main`
- Commit base antes del siguiente deploy: `375a2c2 Publish Windows launcher artifact`
- Objetivo: reducir llamadas repetidas a `supabase/auth/v1/user` sin cambiar el
  contrato funcional del dashboard ni el aislamiento de cuentas.

Cambios validados localmente:

- `kmfx_connector_api.py` usa TTL configurable para `VERIFIED_BEARER_CACHE`
  mediante `KMFX_VERIFIED_BEARER_CACHE_TTL_SECONDS`.
- `.env.example` documenta:
  - `KMFX_VERIFIED_BEARER_CACHE_TTL_SECONDS=300`
  - `KMFX_ACCOUNTS_SUMMARY_CACHE_TTL_SECONDS=5`
  - `KMFX_ACCOUNTS_SUMMARY_CACHE_MAX_ENTRIES=128`
- `tests/test_connector_cors_config.py` cubre que el cache de bearer:
  - reutiliza la respuesta verificada dentro del TTL;
  - evita una segunda llamada remota innecesaria;
  - persiste la expiracion esperada.

Validacion:

- `python3 -m py_compile kmfx_connector_api.py`: OK.
- `python3 -m unittest tests.test_connector_cors_config`: 101 tests OK.
- `python3 scripts/production_smoke.py`: verde antes del deploy del ajuste.

## 2026-05-12 - Gate local de producción

Contexto:

- Rama: `main`
- Objetivo: reducir fricción antes de release agrupando en un único comando los checks críticos del go live.

Cambios:

- Nuevo script `scripts/production_gate.py`.
- Modo estándar:
  - `git diff --check`
  - compilación Python de backend/scripts críticos
  - `scripts/github_release_governance_audit.py`
  - `scripts/production_smoke.py`
  - `tests.test_connector_cors_config`
  - `tests.test_auth_session_contract`
- Modo ampliado:
  - añade `python3 -m unittest discover -s tests`

Uso recomendado:

```bash
python3 scripts/production_gate.py
python3 scripts/production_gate.py --full-tests
```

## 2026-05-12 - App metadata como fuente de permisos

Contexto:

- Objetivo: cerrar el checkpoint de permisos para que ni el frontend ni el backend
  puedan elevar rol/plan desde `user_metadata`.

Cambios:

- `js/modules/auth-session.js` deja de derivar `role` desde
  `user.user_metadata.role`.
- `user_metadata` se mantiene solo para datos de perfil visibles como nombre o
  avatar.
- Nuevo test `tests/test_auth_session_contract.py` verifica que, si
  `user_metadata.role=admin` pero `app_metadata.role=user`, el estado final del
  frontend sigue siendo `user`.

Validacion:

- `python3 -m unittest tests.test_auth_session_contract`

Impacto esperado:

- Menor egress contra Supabase Auth en dashboards con polling y varias
  peticiones autenticadas consecutivas.
- Sin tocar snapshots completos de cuenta ni el flujo MT5/Launcher.
