# KMFX Edge Production Agent Execution Queue

Ultima revision: 2026-05-06

Objetivo: usar Codex como agente de ejecucion para adelantar produccion sin perder control de seguridad, pagos, diseno, actualizaciones y QA.

## Principio de trabajo

Cada bloque debe tener brief, alcance, criterios de salida y verificacion. Si una tarea necesita una decision comercial, se separa la decision de la implementacion para no bloquear trabajo tecnico.

Orden recomendado:

1. Congelar decisiones comerciales minimas.
2. Certificar seguridad y datos antes de cobrar.
3. Cerrar Stripe test mode end-to-end.
4. Pulir UX final de MT5/Launcher.
5. Verificar empaquetado, actualizaciones y checksums.
6. Activar gobierno de repositorio e infra.
7. Ejecutar release rehearsal completo.
8. Pasar a live controlado.

## Sprint 0 - Decisiones que desbloquean pagos

Tipo: decision del fundador, no sesion larga de codigo.

Hay que decidir:

- moneda inicial: EUR, USD o ambas;
- precio Core mensual/anual;
- precio Pro mensual/anual;
- trial: ninguno, con tarjeta o sin tarjeta;
- grace period para `past_due`;
- Desk: privado/contact-only o publico;
- politica de refunds/cancelacion;
- comportamiento al downgrade si el usuario excede limites.

Criterio de salida:

- `docs/billing-implementation-checklist.md` tiene Phase 0 cerrada;
- Stripe test mode puede crearse sin preguntas nuevas;
- cualquier decision pendiente queda explicitamente marcada como "post-MVP".

Brief sugerido:

```text
Lee docs/billing-implementation-checklist.md y docs/production-roadmap.md. Prepara una propuesta de pricing MVP conservadora para KMFX Edge, separando decisiones obligatorias antes de Stripe test mode de decisiones que pueden aplazarse. No implementes codigo; actualiza solo documentacion si las decisiones quedan confirmadas por el usuario.
```

## Sprint 1 - Security and data closeout

Tipo: sesion larga de auditoria + fixes pequenos.

Por que va antes que pagos: no conviene conectar cobros si aun hay dudas de auth, CORS, keys, RLS, logs, copy tecnico o datos live.

Fuentes:

- `docs/production-readiness-audit.md`
- `docs/security/platform-env-checklist.md`
- `docs/security/release-governance-checklist.md`
- `docs/security/mt5-connection-key-transport.md`
- `docs/live-data-section-matrix.md`

Alcance:

- MT5 ingestion: sync, journal, policy, connection keys, rate limits;
- Auth/Supabase: RLS, ownership, app_metadata vs user_metadata;
- Cloudflare proxy: CORS, headers, body limits, logging;
- dashboard: textos internos visibles, estados empty/stale/blocked;
- tests existentes de contrato live y render smoke.

Out of scope:

- no cambiar pricing;
- no activar live Stripe;
- no lanzar conexion directa con password MT5.

Verification:

- `python3 -m unittest tests.test_connector_cors_config tests.test_launcher_connection_keys tests.test_account_service tests.test_dashboard_live_contract tests.test_dashboard_render_smoke`
- `node --check app.js`
- `node --check cloudflare/mt5-api-proxy.js`
- `git diff --check`

Criterio de salida:

- no quedan P0/P1 de seguridad sin documentar;
- fixes pequenos aplicados y probados;
- riesgos que requieren plataforma externa quedan en checklist;
- copy tecnico visible a usuario normal queda eliminado o justificado.

## Sprint 2 - Billing test mode end-to-end

Tipo: sesion larga de implementacion/verificacion.

Prerequisito:

- Sprint 0 cerrado;
- Stripe test mode disponible;
- env vars test definidas para Render/local segun `docs/billing-env-vars.md`.

Fuentes:

- `docs/billing-implementation-checklist.md`
- `docs/billing-env-vars.md`
- `docs/stripe-product-catalog.md`
- `docs/production-roadmap.md`

Alcance:

- crear/verificar Product y Prices test;
- configurar Customer Portal test;
- configurar webhook test;
- verificar Checkout success/cancel;
- verificar webhook idempotente;
- verificar `/api/billing/status`;
- probar guards por entitlements.

Verification:

- tests de billing existentes;
- webhook replay/idempotencia;
- checkout test success/cancel;
- portal test;
- usuario Free/Core/Pro simulado.

Criterio de salida:

- un usuario test puede registrarse, pagar en test mode, recibir entitlement y ver bloqueo/permiso correcto;
- ningun secret queda expuesto en frontend;
- fallos de pago/past_due muestran estado entendible.

## Sprint 3 - MT5 onboarding and launcher release

Tipo: sesion larga de producto + empaquetado + QA.

Fuentes:

- `TESTING_GUIDE.md`
- `LAUNCHER_README.md`
- `docs/production-roadmap.md`

Alcance:

- modal o estado de primera sincronizacion;
- nombre/tipo de cuenta: Demo, Real, Funding, Challenge;
- guia WebRequest dentro de Cuentas;
- checksum/version visible;
- QA macOS limpio;
- QA Windows 10/11 limpio;
- cola local con backend caido y recuperado.

Out of scope:

- no reescribir launcher completo;
- no tocar conector si no hay fallo reproducible;
- no notarizar Apple si sigue siendo decision aplazada.

Verification:

- `python3 -m unittest tests.test_launcher_connection_keys`
- launcher macOS manual;
- launcher Windows manual;
- comprobar logs y state en rutas documentadas;
- validar descargas y checksums.

Criterio de salida:

- usuario nuevo puede conectar MT5 sin ayuda directa;
- version/checksum son claros;
- hay evidencia de clean-machine QA o una lista corta de bloqueos reproducibles.

## Sprint 4 - UX/design final pass

Tipo: sesion larga de frontend visual y copy.

Fuentes:

- `docs/kmfx-design-system-v1.md`
- `docs/dashboard-simplification-roadmap.md`
- `docs/sidebar-navigation-audit-roadmap.md`
- `docs/live-data-section-matrix.md`

Alcance:

- estados vacios/error/bloqueados;
- consistencia visual desktop;
- mobile basico sin roturas;
- textos de usuario final;
- accesibilidad basica: foco, contraste, overflow.

Verification:

- render smoke existente;
- browser visual en rutas principales;
- checks JS;
- diff visual revisado.

Criterio de salida:

- sin copy interno en modo usuario;
- sin overflows/solapes obvios;
- rutas principales se sienten como producto comercial, no prototipo.

## Sprint 5 - Governance, CI and release rehearsal

Tipo: mezcla de plataforma + checklist.

Fuentes:

- `docs/security/release-governance-checklist.md`
- `.github/workflows/*`
- `docs/domain-oauth-launch-checklist.md`
- `docs/production-roadmap.md`

Alcance:

- secret scanning;
- push protection;
- Dependabot;
- branch protection;
- checks obligatorios;
- revisar Vercel/Render/Cloudflare/Supabase envs;
- rollback documentado;
- Production Smoke.

Criterio de salida:

- `main` protegido;
- checks clave obligatorios;
- no hay secrets backend en Vercel/frontend;
- hay rollback web/backend/launcher/billing.

## Primer movimiento recomendado

Empezar por Sprint 1 mientras se decide Sprint 0. Es el mejor paralelismo: podemos limpiar seguridad/datos/copy sin esperar pricing, y cuando las decisiones de pagos esten cerradas, Sprint 2 entra mucho mas rapido.

Prompt exacto para arrancar Sprint 1:

```text
Lee docs/codex-agent-brief-playbook.md y docs/production-agent-execution-queue.md. Ejecuta Sprint 1 - Security and data closeout end-to-end: revisa los archivos indicados, aplica fixes pequenos si son claros, ejecuta la verificacion indicada, y reporta P0/P1/P2 pendientes con archivos cambiados y pruebas.
```
