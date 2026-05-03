# KMFX Edge Journal Pro Release Checkpoint

Fecha: 2026-05-03
Rama actual al revisar: `codex/journal-pro-roadmap`
Estado: no desplegar preview todavia desde este worktree sin decidir alcance.

## Resultado

El bloque Journal Pro/Risk/Backtest/Funding/AI Export esta funcionalmente preparado para pasar a preview real y ya vive en una rama dedicada. Para respetar la regla anti-solape, el siguiente paso no debe ser meter mas producto, sino confirmar el alcance del paquete antes de commit/deploy.

## Checks Ejecutados

- `node --check app.js`
- `node --check js/modules/navigation.js`
- `node --check js/modules/route-map.js`
- `node --check js/modules/risk.js`
- `python3 -m py_compile risk_metrics_engine.py kmfx_connector_api.py`
- `python3 -m unittest discover -s tests`
- Serve estatico local en `http://127.0.0.1:4177/` con respuesta `200 OK`, cerrado despues del check.

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

## Go / No-Go

Go para continuar con preview real solo si ocurre una de estas dos cosas:

- Opcion A: se crea commit/branch solo con archivos del roadmap.
- Opcion B: el usuario confirma que el archivo externo `downloads/KMFX-Launcher-Windows.zip 2.sha256` tambien entra en el mismo checkpoint.

No-Go para seguir metiendo features nuevas antes de resolver esto. El siguiente producto recomendado despues del checkpoint es `Inputs visibles de riesgo + VaR multi-cuenta`; mobile queda como fase dedicada posterior.

## Smoke Test Preview

Cuando exista preview real, validar:

- Login/auth.
- Refresh directo en `/risk-engine/ruin-var`.
- Refresh directo en `/journal/ai-review`.
- Refresh directo en `/estrategias/backtest-vs-real`.
- Refresh directo en `/funding/reglas`.
- Sidebar activo correcto en subrutas.
- Risk Engine renderiza sin pantalla blanca.
- Journal AI Export copia/descarga reporte y guarda respuesta pegada.
- Backtest vs Real renderiza comparison.
- Funding muestra reglas y payouts.
- API health responde OK.
