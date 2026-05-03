# KMFX Edge Journal Pro Release Checkpoint

Fecha: 2026-05-03
Rama actual al revisar: `main`
Estado: roadmap integrado, desplegado en produccion y validado con smoke test HTTP.

## Resultado

El bloque Journal Pro/Risk/Backtest/Funding/AI Export quedo integrado en `main` y desplegado en produccion con Vercel. El frontend y el API live reportan el commit `8f14016f6d8bf2d196b8136c036a2be2b9af09f6`.

## Checks Ejecutados

- `node --check app.js`
- `node --check js/modules/navigation.js`
- `node --check js/modules/route-map.js`
- `node --check js/modules/risk.js`
- `python3 -m py_compile risk_metrics_engine.py kmfx_connector_api.py`
- `python3 -m unittest discover -s tests`
- Serve estatico local en `http://127.0.0.1:4177/` con respuesta `200 OK`, cerrado despues del check.
- Preview Vercel protegido generado y validado con `vercel curl`.
- Produccion Vercel `READY` para `8f14016`.
- Smoke HTTP publico: `/`, `/risk-engine/ruin-var`, `/journal/ai-review`, `/estrategias/backtest-vs-real`, `/funding/reglas`.
- Assets publicos: `app.js` y `styles-v2.css`.
- API health: `https://mt5-api.kmfxedge.com/health` y `https://kmfx-edge-api.onrender.com/health`.

Resultado actual: 104 tests OK.

## Alcance Roadmap

Cambios que pertenecen al bloque de roadmap:

- Navegacion y subrutas: `index.html`, `app.js`, `js/modules/route-map.js`, `js/modules/navigation.js`, `js/modules/store.js`, `vercel.json`.
- Journal Pro y AI Export: `js/modules/journal.js`, `ai_evidence_report.py`, `kmfx_connector_api.py`, `tests/test_ai_evidence_report.py`.
- Backtest vs Real: `js/modules/strategies.js`, `js/modules/backtest-real.js`, `backtest_real_engine.py`, `mt5_strategy_tester_importer.py`, `tests/test_backtest_real_engine.py`, `tests/test_mt5_strategy_tester_importer.py`.
- Risk profesional: `js/modules/risk.js`, `risk_math.py`, `risk_metrics_engine.py`, `risk_models.py`, `risk_policy_engine.py`, `kmfx_connector_api.py`, `tests/test_professional_risk_metrics.py`.
- Datos mock y visual: `js/data/sources/mock-workspace-source.js`, `styles-v2.css`.

## Alcance Externo Detectado

Cambios que parecen pertenecer a otro frente y no deberian mezclarse sin confirmacion:

- `downloads/KMFX-Launcher-Windows.zip 2.sha256`

Nota: `kmfx_connector_api.py` es un archivo compartido, pero el diff actual de esta rama corresponde a endpoints/contratos del roadmap: AI Evidence, Backtest vs Real, `professional_metrics` y `portfolio_risk`.

## Estado Produccion

- Dominio publico: `https://kmfxedge.com`
- Deployment Vercel: `dpl_AaxZ8pTaCWY9pndptDpzqm5L9y7A`
- Inspector: `https://vercel.com/kevinmartinezpallares-1079s-projects/kmfx-edge/AaxZ8pTaCWY9pndptDpzqm5L9y7A`
- Commit: `8f14016f6d8bf2d196b8136c036a2be2b9af09f6`
- API health: OK con `runtime_marker=sync-key-any-user-6d8a6ab-20260411`.

## Siguiente Paso

Segun el roadmap actual, el siguiente bloque pendiente ya no es metricas profesionales: es la fase responsive movil dedicada. No tocar visual desktop ya cerrado salvo bugs detectados en smoke real.
