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

## 2026-05-13 - Backups, restore y retencion de datos

Contexto:

- Fase: Observabilidad, Backups y Datos.
- Objetivo: dejar documentado como recuperar Supabase y que datos conserva KMFX
  antes de abrir beta o usuarios de pago.

Cambios:

- Nuevo runbook `docs/supabase-backup-restore-runbook.md`.
- Nueva politica tecnica `docs/data-retention-policy.md`.
- Checklist de produccion actualizado:
  - restore queda documentado;
  - retencion queda definida;
  - borrado de cuenta/MT5 queda documentado;
  - confirmacion real de backups Supabase sigue pendiente de plataforma.

Notas operativas:

- No se ha cambiado plan ni add-ons de Supabase.
- No se ha tocado schema ni RLS.
- El restore seguro se define primero sobre proyecto nuevo/staging, nunca sobre
  produccion a ciegas.
- Stripe queda como fuente de verdad de billing tras restore.
- Dashboard queda como fuente de verdad para copiar la KMFXKey estable de cada
  cuenta; el Launcher no debe crear ni regenerar keys.

Validacion local:

- `git diff --check`.

Pendiente manual:

- Confirmar backups/PITR en Supabase Dashboard.
- Ejecutar restore drill a staging antes de beta abierta si se aceptan usuarios
  de pago o datos live no recuperables.

## 2026-05-13 - Observabilidad minima de billing y MT5

Contexto:

- Rama: `main`.
- Fase: observabilidad tecnica minima viable.

Cambio validado:

- Los eventos de billing relevantes para produccion emiten auditoria
  estructurada sin secretos:
  - `billing_plan_changed`
  - `billing_payment_failed`
  - `billing_payment_paid`
- Los rechazos anormales de sync MT5 emiten auditoria estructurada como
  `mt5_sync_rejected` sin exponer la KMFXKey completa:
  - key ausente
  - key desconocida
  - key revocada
  - key enviada por query string
  - rate limit por `connection_key`

Validacion local:

- `python3 -m py_compile kmfx_connector_api.py`.
- `python3 -m unittest tests.test_connector_cors_config`: `102 tests OK`.
- `git diff --check`.
- `python3 scripts/production_gate.py`: verde.

Pendiente:

- Login auditado en Supabase/Auth o en frontend server-side cuando se migre a
  Next.js.
- Alertas de plataforma para 5xx, webhooks Stripe fallidos y volumen anomalo de
  rechazos MT5.

## 2026-05-13 - Kill switches de produccion

Contexto:

- Rama: `main`.
- Fase: observabilidad y control de riesgo operativo.

Cambio validado:

- Backend puede apagar conexion directa MT5 sin afectar al flujo principal
  EA/Launcher.
- Backend puede apagar checkout/portal de billing sin bloquear webhooks de
  Stripe ya emitidos.
- Backend puede apagar exports / AI evidence ante abuso, fuga o consumo anomalo.
- Conexion directa MT5 queda desactivada por defecto en produccion y solo se
  abre con `KMFX_ENABLE_DIRECT_MT5=1`.
- Runbook operativo creado en `docs/feature-flags-runbook.md`.

Flags:

- `KMFX_DISABLE_DIRECT_MT5=1`
- `KMFX_ENABLE_DIRECT_MT5=1`
- `KMFX_DISABLE_BILLING=1`
- `KMFX_DISABLE_EXPORTS=1`
- `KMFX_DISABLE_JOURNAL_AI=1` reservado/documentado.
- `KMFX_DISABLE_RISK_EDITOR=1` reservado/documentado.

Validacion local:

- `python3 -m py_compile kmfx_connector_api.py`.
- `python3 -m unittest tests.test_connector_cors_config`.
- `git diff --check`.
- `python3 scripts/production_gate.py`: verde.

Pendiente:

- Confirmar mensaje visual final en dashboard si una funcion opcional se apaga.
- Añadir flags frontend para Journal AI/Risk editor cuando migren a endpoints
  propios.

## 2026-05-13 - Guardrails de coste Render/Supabase

Contexto:

- Render avisa de uso superior al 70% de los minutos gratuitos de build
  pipeline.
- Supabase ya habia avisado por salida/egress sobre la cuota gratuita.
- Objetivo: evitar facturas sorpresa sin ralentizar el dashboard.

Cambio validado:

- Runbook operativo creado en `docs/platform-cost-guardrails.md`.
- Se documenta que Codex debe agrupar cambios y ejecutar gate local antes de
  empujar a `main` para reducir builds innecesarios.
- Se documenta accion manual recomendada en Render: configurar limite mensual
  personalizado de minutos de build.
- Se mantiene la regla de no activar planes, add-ons o cambios de facturacion
  sin aprobacion explicita del owner.

Validacion local:

- `git diff --check`.

Pendiente:

- Activar manualmente el limite de minutos de build en Render si se quiere
  cortar gasto automatico.
- Confirmar desde Supabase Dashboard si el egress baja tras las mitigaciones de
  polling/cache.

Actualizacion 2026-05-13:

- Monitor recurrente ampliado para revisar tambien Render build pipeline
  minutes/coste cada 6 horas junto al uso de Supabase.
- Regla operativa anadida: commits solo de documentacion deben usar
  `[skip render]` cuando no requieran deploy, para evitar consumo innecesario de
  minutos de build.

## 2026-05-13 - Alertas operativas minimas

Contexto:

- Antes de abrir beta hace falta detectar fallos reales sin contratar otra
  herramienta ni aumentar el coste fijo.
- Las areas criticas son 5xx del backend, webhooks Stripe fallidos y rechazos
  anormales de sincronizacion MT5.

Cambio validado:

- Backend emite `[KMFX][ALERT] event=api_5xx_response` para respuestas 5xx.
- Backend emite `[KMFX][ALERT] event=api_unhandled_exception` para excepciones
  no controladas.
- Backend emite `[KMFX][ALERT] event=billing_webhook_failed` cuando un webhook
  firmado de Stripe falla al reservar o procesar evento.
- Backend emite `[KMFX][ALERT] event=mt5_sync_rejected_abnormal` para key ausente,
  query string legacy, key desconocida, key revocada o rate limit.
- Runbook creado en `docs/observability-alerts-runbook.md`.
- Las alertas reutilizan el sanitizador de auditoria y no imprimen keys completas.

Validacion local:

- `python3 -m py_compile kmfx_connector_api.py`.
- `python3 -m unittest tests.test_connector_cors_config`: 110 tests OK.

## 2026-05-13 - GitHub branch protection

Contexto:

- Antes de produccion tecnica minima viable, `main` no debe admitir borrados ni
  force-push accidentales.
- Queremos mantener velocidad hoy, asi que no se exige pull request obligatorio
  todavia.

Cambio aplicado:

- Proteccion de rama activada en `main`.
- Checks obligatorios:
  - `Backend and connector tests`
  - `Static app checks`
  - `Analyze (python)`
  - `Analyze (javascript-typescript)`
- Historial lineal requerido.
- Force-push desactivado.
- Borrado de rama desactivado.

Validacion:

- CI y CodeQL del ultimo commit `745f70e` estan en verde.


## 2026-05-13 - Checkpoint `0c13fd7`

Contexto:

- Rama: `main`.
- Commit local y remoto: `0c13fd7 Simplify launcher reinstall flow`.
- Hora del gate: 2026-05-13 UTC.

Cambio validado:

- El Launcher queda alineado con el flujo simple de produccion:
  - instala o reinstala el conector en la instalacion MT5 seleccionada;
  - no muestra accion de reparacion separada;
  - no crea, regenera ni decide KMFXKeys desde la app local;
  - la KMFXKey estable sigue siendo propiedad del dashboard y se consulta desde
    Cuentas > Ver detalles.

Artefactos publicados:

- `downloads/KMFX-Launcher-macOS.zip` reconstruido.
- `downloads/KMFX-Launcher-Windows.exe` reconstruido.
- `downloads/KMFX-Launcher-Windows.zip` reconstruido como artefacto alternativo.
- Checksums publicados coinciden con repo:
  - macOS ZIP:
    `e1d09f21e1ae4297b0933244b605d73b08fc05ff15a9db4d89871b4122bf081e`
  - Windows EXE:
    `8909c79d57c56976f0073a9fe44a32e51cf58ea7296394a323876eaa4a47f12b`
  - Windows ZIP:
    `b5f00e62a971ee358aedf54382a02f1acf8534398dc62da7f9bd96e06bf9e8ae`

Validacion local:

- `node --check launcher/ui/app.js`: verde.
- `python3 -m py_compile launcher/app.py launcher/backend_client.py launcher/service.py`: verde.
- `python3 -m unittest tests.test_launcher_connection_keys`: 35 tests OK.
- `git diff --check`: verde.
- `git diff --cached --check`: verde.

Gate de produccion:

- `python3 scripts/production_gate.py`: verde.
- Descargas publicas macOS/Windows verificadas contra checksums versionados.
- Hash de `KMFXConnector.ex5` coincide con repo:
  `cabc679109c674044f592035152c5cf40ea0749b366f31b213a72cf200ee741b`.
- Render `/health`: `ok`.
- `mt5-api.kmfxedge.com/health`: `ok` via Worker.
- Billing sin bearer y webhook sin firma siguen fallando cerrado.
- MT5 sync sin key y key en query siguen rechazados en produccion.

Pendiente real:

- Smoke MT5 limpio con usuario no-admin y plan valido en macOS/Windows.
- Confirmar manualmente en GitHub: branch protection, secret scanning, push
  protection y Dependabot security updates.

## 2026-05-13 - XSS pass en vistas de riesgo MT5

Contexto:

- Rama: `main`.
- Objetivo: cerrar otra superficie de `innerHTML` sin cambiar flujo ni diseno
  visible.

Cambio validado:

- Las tablas de exposicion por simbolo y riesgo abierto escapan simbolo,
  direccion y lado de posicion antes de pintar datos MT5.
- Las cards de riesgo escapan labels, meta y clases de tono derivadas de estado.
- La vista Talent escapa labels y notas dinamicas antes de renderizar.
- Los badges comunes y la vista Diagnostico/admin escapan labels, valores de
  runtime, nombres de cuenta y mensajes de error.

Validacion local:

- `node --check js/modules/risk-panel-components.js`: verde.
- `node --check js/modules/talent.js`: verde.
- `node --check js/modules/status-badges.js`: verde.
- `node --check js/modules/debug.js`: verde.
- `git diff --check`: verde.

Pendiente:

- La auditoria XSS global sigue abierta hasta revisar todos los sinks restantes
  de `innerHTML` ruta por ruta.

## 2026-05-13 - Checkpoint `c76f880`

Contexto:

- Rama: `main`.
- Commit local y remoto: `c76f880 Harden frontend dynamic HTML rendering`.
- Objetivo: cerrar la auditoria XSS del dashboard vanilla actual sin cambiar el
  flujo MT5/Launcher ni introducir rediseños grandes antes de la migracion a
  Next.js.

Cambio validado:

- Calculadora escapa capital, placeholders, distancias, precios y metricas antes
  de renderizar markup dinamico.
- Estrategias escapa nombre, mercado, descripcion, SL/TP, score y resumen antes
  de montar formularios y tarjetas.
- Risk Engine escapa simbolos, ids y campos de whitelist derivados de usuario o
  MT5.
- Funding escapa account ids, status tones y valores usados en acciones HTML.
- Ejecucion/Discipline escapa labels, valores, subcopy y badges de KPIs antes
  de insertarlos con `innerHTML`.
- Se mantiene permitido el HTML explicito solo en helpers que ya separan
  `metaHtml`, `pnlHtml` o `valueHtml` de texto normal.

Validacion local:

- `node --check js/modules/calculator.js js/modules/strategies.js js/modules/risk.js js/modules/funded.js js/modules/discipline.js`: verde.
- `python3 -m unittest tests.test_frontend_xss_contract`: 6 tests OK.
- `python3 -m unittest tests.test_frontend_xss_contract tests.test_calculator_fx_pip tests.test_dashboard_render_smoke`: 14 tests OK.
- `git diff --check`: verde.

Pendiente relacionado:

- Repetir auditoria XSS/CSRF en la app Next.js cuando exista sidecar y si se
  introducen cookies o sesiones server-side.

## 2026-05-13 - Checkpoint `ae26c85`

Contexto:

- Rama: `main`.
- Commit desplegado en Render durante el smoke:
  `ae26c850f189f4b9226d7ddac6fdd45534c82171`.
- Hora del gate: 2026-05-13 00:13 UTC.

Cambio validado:

- El flujo de KMFXKey estable queda cerrado para el usuario final:
  - el Launcher instala o reinstala el EA, pero no muestra ni regenera keys;
  - el dashboard, en Cuentas > Ver detalles, es la fuente de verdad para copiar
    la KMFXKey;
  - una cuenta MT5 existente debe conservar su misma key salvo revocacion,
    filtracion o eliminacion explicita;
  - la regeneracion normal queda bloqueada para usuarios no-admin.

Gate completo de produccion:

- `python3 scripts/production_gate.py --full-tests`: verde.
- `git diff --check`: verde.
- Compilacion Python critica: verde.
- Smoke real de produccion: verde.
- Regresiones de seguridad de conector/auth: verde.
- Suite completa: `365 tests OK`.

Smoke de produccion:

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

## 2026-05-12 - Cloudflare Worker MT5 hardening

Contexto:

- Skill usado: `cloudflare:workers-best-practices`.
- Worker revisado: `cloudflare/mt5-api-proxy.js`.
- Objetivo: mantener `mt5-api.kmfxedge.com` como endpoint dedicado al EA/MT5,
  sin exponer accidentalmente otras rutas del backend Render.

Cambios:

- Allowlist explicita de rutas proxy:
  - `/health`
  - `/api/mt5/sync`
  - `/api/mt5/journal`
  - `/api/mt5/policy`
- Cualquier otra ruta devuelve `404 path_not_found` desde el Worker.
- Los errores de upstream devuelven `502 upstream_unavailable` sin detalles
  internos.
- Se mantiene CORS cerrado, strip de query params sensibles y strip de headers
  spoofables de identidad.
- Se añade `X-Forwarded-Proto` junto a `X-Forwarded-Host` y `X-KMFX-Proxy`.

Validacion local:

- `node --check cloudflare/mt5-api-proxy.js`.
- Smoke local del Worker con `vm`: ruta MT5 permitida, ruta de billing bloqueada,
  query key eliminada y header spoofable no reenviado.
- `git diff --check`.

Pendiente operativo:

- Desplegar el Worker si Cloudflare no publica automáticamente desde `main`.
- Tras deploy, ejecutar smoke externo y comprobar que una ruta ajena al flujo
  MT5 no llega a Render.

## 2026-05-12 - Supabase user config schema

Contexto:

- Skill usado: `supabase:supabase-postgres-best-practices`.
- Objetivo: que perfiles, preferencias, reglas, presets y objetivos del
  dashboard queden reproducibles por migraciones y no dependan de tablas
  creadas manualmente en Supabase.

Cambios:

- Nueva migracion `20260512112000_user_config_tables.sql`.
- Tablas versionadas:
  - `user_profiles`
  - `user_preferences`
  - `trading_accounts`
  - `calculator_presets`
  - `risk_rules`
  - `dashboard_objectives`
- RLS activado en todas las tablas.
- Politicas por ownership con `(select auth.uid())` para evitar reevaluacion por
  fila.
- Indices de `user_id`, cuenta y ultimo preset para las consultas actuales del
  dashboard.
- La migracion antigua de indice de `calculator_presets` pasa a ser tolerante si
  la tabla aun no existe en entornos antiguos.

Validacion local:

- `git diff --check`.
- Revision estatica de RLS: sin grants a `anon` y sin `auth.uid()` directo.

Pendiente operativo:

- Aplicar migraciones en Supabase antes de beta abierta.
- Si el entorno remoto ya tenia tablas creadas manualmente con tipos distintos,
  revisar el diff en staging antes de aplicar en produccion.

## 2026-05-13 - Gate tras artefacto Windows CI

Contexto:

- Rama: `main`.
- Commit local y remoto: `47f11f916c40c1f7ad2e4fead6acb3b7c5da892e`.
- Commit desplegado en Render durante el smoke:
  `47f11f916c40c1f7ad2e4fead6acb3b7c5da892e`.
- Hora del gate: 2026-05-13 02:00 UTC.

Cambio validado:

- GitHub Actions publico el artefacto Windows definitivo del Launcher y el
  checkout local se sincronizo por fast-forward.
- Las descargas publicas de macOS y Windows vuelven a coincidir con los
  checksums versionados en el repo.
- El contrato del Launcher sigue siendo: instalar/reinstalar el EA en la
  instalacion MT5 seleccionada; la KMFXKey estable se consulta y copia desde el
  dashboard, no desde el Launcher.

Gate de produccion:

- `python3 scripts/production_gate.py`: verde.
- `git diff --check`: verde.
- Compilacion Python critica: verde.
- Auditoria local de GitHub governance: verde en archivos del repo, con
  advertencias de plataforma por falta de `GITHUB_TOKEN`.
- Smoke real de produccion: verde.
- Regresiones de seguridad de conector/auth: `102 tests OK`.

Smoke de produccion:

- `https://kmfxedge.com`: responde `200`.
- Rutas SPA probadas: `/dashboard`, `/cuentas`, `/ejecucion`, `/journal`,
  `/estudio` y `/ajustes`.
- Descargas verificadas:
  - `downloads/KMFX-Launcher-macOS.zip`
  - `downloads/KMFX-Launcher-Windows.exe`
  - `KMFXConnector.ex5`
- Checksums publicados coinciden con repo:
  - macOS ZIP:
    `e5e3e285269957a43d1cabc742bb9ce59ac2443bace49a2714974d02b62df8e8`
  - Windows EXE:
    `bb77d12d2c1f6334f5880a749bfb6f64022a6fb589e6141f3b80eb8441c92693`
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

- El gate local se ejecuto sin `GITHUB_TOKEN` administrativo, asi que esa
  corrida solo podia validar archivos del repo y no ajustes privados de GitHub.

## 2026-05-13 - GitHub governance verificado con `gh`

Contexto:

- Cuenta autenticada en `gh`: `kevinmartinezpallares-collab`.
- Repo verificado: `kevinmartinezpallares-collab/kmfx-edge`.
- Objetivo: confirmar por API los gates de seguridad del repositorio sin tocar
  branch protection todavia.

Comandos usados:

```bash
gh auth status
gh api repos/kevinmartinezpallares-collab/kmfx-edge --jq '{default_branch,security_and_analysis}'
gh api repos/kevinmartinezpallares-collab/kmfx-edge/vulnerability-alerts -i
gh api repos/kevinmartinezpallares-collab/kmfx-edge/branches/main/protection
gh run list --workflow ci.yml --limit 5
gh run list --workflow windows-launcher.yml --limit 5
```

Resultado:

- `secret_scanning.status=enabled`
- `secret_scanning_push_protection.status=enabled`
- `dependabot_security_updates.status=enabled`
- Vulnerability alerts endpoint responde `204 No Content`, consistente con
  alerts activos.
- `main` sigue sin branch protection: `404 Branch not protected`.
- Ultimas ejecuciones observadas:
  - `CI`: verdes en `main`.
  - `Build Windows Launcher`: verdes en `main`.

Lectura operativa:

- La seguridad de repositorio en GitHub ya no esta pendiente salvo por la
  proteccion de `main`.
- Se mantiene sin branch protection por decision operativa temporal para no
  bloquear cambios directos mientras el otro frente sigue cerrando roadmap.

## 2026-05-13 - Smoke publico y governance tras guardrails de coste

Contexto:

- Rama: `main`.
- Backend desplegado durante el smoke:
  `0299d364c2a06bbd6f80d5c588dafada31d363b5`.
- Nota: los commits posteriores de documentacion usan `[skip render]` para no
  gastar minutos de build pipeline.

Validacion Launcher/EA local:

- `python3 -m unittest tests.test_launcher_connection_keys tests.test_launcher_connector_install tests.test_launcher_queue_resilience tests.test_launcher_auth_errors tests.test_launcher_config`: 55 tests OK.
- `python3 -m py_compile launcher/app.py launcher/backend_client.py launcher/service.py launcher/config.py launcher/connector_installer.py launcher/mt5_detector.py launcher/platform_mac.py launcher/platform_windows.py`: OK.
- Contrato validado por tests:
  - el Launcher instala `KMFXConnector.ex5` y escribe `MQL5/Files/kmfx_connection.conf`;
  - la key viaja a MT5 desde el dashboard, no desde una key local obsoleta;
  - una key local que no coincide con el preview servidor no se expone para copiar;
  - la reinstalacion puede sustituir una key local antigua por la KMFXKey estable
    de la cuenta existente;
  - el Launcher no auto-resucita cuentas borradas ni crea duplicados desde keys
    locales desconocidas.

Smoke de produccion:

- `python3 scripts/production_smoke.py`: verde.
- `https://kmfxedge.com`: responde `200`.
- Rutas SPA probadas: `/dashboard`, `/cuentas`, `/ejecucion`, `/journal`,
  `/estudio` y `/ajustes`.
- Descargas verificadas:
  - `downloads/KMFX-Launcher-macOS.zip`
  - `downloads/KMFX-Launcher-Windows.exe`
  - `KMFXConnector.ex5`
- Checksums publicados coinciden con repo:
  - macOS ZIP:
    `e1d09f21e1ae4297b0933244b605d73b08fc05ff15a9db4d89871b4122bf081e`
  - Windows EXE:
    `8909c79d57c56976f0073a9fe44a32e51cf58ea7296394a323876eaa4a47f12b`
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

GitHub governance:

- Branch protection de `main` activado por API con checks requeridos:
  - `Backend and connector tests`;
  - `Static app checks`;
  - `Analyze (python)`;
  - `Analyze (javascript-typescript)`.
- Historial lineal activado.
- Force-push y borrado de rama desactivados.
- Admin bypass permitido temporalmente para no bloquear fixes criticos durante
  el cierre de produccion.

Coste:

- Monitor recurrente ampliado para revisar Supabase y Render cada 6 horas.
- Regla operativa añadida: usar `[skip render]` o `[render skip]` en commits
  solo-documentacion.
- Pendiente manual: fijar un limite de gasto de build pipeline en Render
  Dashboard. Sin ese limite, Render puede cobrar minutos adicionales si se
  supera la cuota incluida.

## 2026-05-13 - Smoke publico tras runbook de auditoria final

Contexto:

- Rama: `main`.
- Commit local: `96ad22e Add final user go-live audit runbook [skip render]`.
- Hora del smoke: 2026-05-13 23:00 UTC.
- Nota: el commit es documental y usa `[skip render]`; Render mantiene el
  backend desplegado en `968b8e0ad1d4e72ca3aea95d685cc21f776d6d5d`.

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
- Checksums publicados coinciden con repo:
  - macOS ZIP:
    `441ccfa1454dc6555dfd5ade57f50a12d95b726d0588dbfb394ed84986d6d514`
  - Windows EXE:
    `6fdb9c399e666d892bb29b25f93c107f2d7775317b04dcb45e636412b957cca4`
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

Auditoria final:

- Se anade `docs/final-user-go-live-audit.md` como runbook obligatorio antes de
  go-live.
- La auditoria final queda pendiente de credenciales de usuario normal, cuenta
  MT5 real/demo controlada y aprobacion explicita para cualquier limpieza de
  suscripciones o conexiones reales.

## 2026-05-13 - Cache frontend, admin unico y limpieza Stripe

Contexto:

- Rama: `main`.
- Commit local: `1c19515 Refresh frontend cache for billing gates [skip render]`.
- Objetivo: evitar mezcla de modulos frontend antiguos en produccion y cerrar
  el estado duplicado del usuario de prueba `kevinmartinezpallares@hotmail.com`.

Cambios verificados:

- `index.html`, `app.js`, modulos `js/**` y contratos de UI comparten el mismo
  tag de cache `build-20260514-013000`.
- La app mantiene admin unico por contrato:
  `kevinmartinezpallares@gmail.com`.
- `kevinmartinezpallares@hotmail.com` queda como usuario normal de prueba y no
  debe recibir paneles admin, checksums ni bypass de plan.
- El commit usa `[skip render]` para no consumir minutos de build Render.

Stripe:

- Cliente revisado: `cus_UVWuC0JWs5W70n`.
- Suscripcion que se conserva: `sub_1TWYq4EoC6e7wNItR0TKxm5R`
  (`kmfx_unlimited_yearly`, trialing).
- Suscripcion duplicada cancelada:
  `sub_1TWW4sEoC6e7wNIt1oQfN1XE`.
- Verificacion posterior: Stripe devuelve una suscripcion `trialing` y una
  `canceled` para ese customer.

Validacion local:

- `python3 -m unittest tests.test_user_flow_ui_contract tests.test_auth_session_contract`
  pasa con 30 tests.
- `python3 -m unittest tests.test_dashboard_render_smoke tests.test_user_flow_ui_contract tests.test_auth_session_contract`
  pasa con 35 tests.
- `node --check` pasa en `app.js`, `js/modules/auth-session.js`,
  `js/modules/billing-status.js`, `js/modules/admin-mode.js`,
  `js/modules/connections.js` y `js/modules/connection-wizard.js`.

Validacion de produccion:

- `https://kmfxedge.com` sirve `build-20260514-013000` en `reloadKey`,
  `styles.css`, `styles-v2.css` y `app.js`, evitando mezcla de modulos
  antiguos en navegadores de usuario.
- Render responde `/health` en un commit descendiente de la linea actual con
  keys estables MT5 y admin unico por email propietario.
- La limpieza de duplicado Stripe del usuario de prueba queda completada; el
  orden de go-live ya no incluye esa tarea como pendiente.
- `git diff --check` pasa.

Pendiente:

- Verificado por `curl` que `https://kmfxedge.com` ya sirve
  `styles.css`, `styles-v2.css`, `app.js` y `reloadKey` con
  `build-20260514-013000`.
- Validar recibo real de Stripe/Resend y plan aplicado sin refresco manual en la
  auditoria final con usuario normal.

## 2026-05-13 - Gate estandar post billing/key

Contexto:

- Rama: `main`.
- Objetivo: confirmar que, tras la limpieza de billing y el fallback de
  reinstalacion del Launcher, el gate tecnico minimo sigue verde sin disparar
  builds innecesarios.
- El archivo `docs/billing-implementation-checklist.md` queda fuera del stage
  porque contiene cambios manuales del owner.

Validacion ejecutada:

- `python3 scripts/production_gate.py`: verde en modo estandar.
- `git diff --check`: verde.
- Compilacion Python critica: verde.
- Smoke de produccion: verde.
- Regresiones de seguridad de conector/auth: verde.

Smoke de produccion:

- `https://kmfxedge.com`: responde `200`.
- Rutas SPA probadas: `/dashboard`, `/cuentas`, `/ejecucion`, `/journal`,
  `/estudio` y `/ajustes`.
- Descargas publicas macOS/Windows/EA verificadas contra checksums versionados.
- Render `/health`: `ok`, commit desplegado
  `968b8e0ad1d4e72ca3aea95d685cc21f776d6d5d`.
- `mt5-api.kmfxedge.com/health`: `ok` via Worker.
- Billing sin bearer, portal sin bearer y webhook sin firma fallan cerrado.
- MT5 sync sin key y key en query siguen rechazados en produccion.

Admin y checksums:

- Produccion sirve `ADMIN_EMAILS = ["kevinmartinezpallares@gmail.com"]`.
- `kevinmartinezpallares@hotmail.com` no aparece como admin en los modulos
  servidos por produccion.
- Los checksums de release solo se renderizan si hay modo admin real y
  `localStorage["kmfx:showReleaseChecksums"] === "1"`.
- Los enlaces admin del HTML siguen marcados como `data-admin-only` y deben
  quedar ocultos para usuarios normales cuando la app inicializa.

Advertencias operativas:

- El gate local no tiene `GITHUB_TOKEN`; las comprobaciones de plataforma
  GitHub no se consultan desde este shell, aunque la proteccion de rama y checks
  obligatorios ya quedaron documentados previamente.
- Persisten avisos de cuota Supabase/egress en pruebas locales. No bloquean el
  gate, pero siguen siendo riesgo operativo a vigilar antes de abrir usuarios.
- La auditoria final de usuario normal queda pendiente de credenciales y cuenta
  MT5 real/demo controlada antes del go-live publico.
