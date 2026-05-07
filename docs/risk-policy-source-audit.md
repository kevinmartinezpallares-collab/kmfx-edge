# Auditoria de politica y umbrales de riesgo

Estado: prioridad critica despues de cerrar conexiones MT5/EA.

## Problema

Hay metricas que mezclan dato medido con politica o umbral implicito. Si el usuario no ha configurado una regla, la UI no debe presentar un valor interno como si fuese una politica real.

El caso visible es `Riesgo por trade 0,57% / Politica 0,50%`: el 0,57% es dato medido desde posiciones abiertas, pero el 0,50% sale de un default interno.

## Metricas afectadas

| Metrica / bloque | Dato medido | Politica / umbral actual | Riesgo UX |
| --- | --- | --- | --- |
| Riesgo por trade | `max_open_trade_risk_pct` | `max_risk_per_trade_pct` default 0,50% | Puede marcar rojo sin politica definida por usuario. |
| Riesgo abierto / heat | `total_open_risk_pct` | `portfolio_heat_limit_pct`, inferido por nivel BASE 2,00% | Puede parecer limite configurado aunque sea inferido. |
| DD diario | `daily_drawdown_pct` | `daily_dd_hard_stop` default 1,20% | Puede bloquear o avisar como regla real sin origen visible. |
| DD maximo | `peak_to_equity_drawdown_pct` | `total_dd_hard_stop` default 8,00% | Puede mezclar limite de cuenta/funding con default interno. |
| Margen a limite | distancia a DD diario/maximo | depende de los limites anteriores | Si el limite es default, el margen tambien lo es. |
| Risk of ruin | perdida simulada | `max_dd_limit_pct` o fallback 20% | Necesita mostrar base de calculo: politica real, funding o supuesto. |
| VaR / CVaR | distribucion de retornos | no es politica por si misma | No debe pintarse como incumplimiento sin umbral configurado. |
| Estado operativo | estado de `policy_evaluation` | warning/breach al 80% del limite | Correcto solo si el limite tiene fuente real. |

## Fuentes actuales

- `kmfx_connector_api.py::build_policy` crea defaults: riesgo por trade 0,50%, DD diario 1,20%, DD total 8,00%.
- `risk_policy_engine.py::build_policy_snapshot` infiere `portfolio_heat_limit_pct` si viene vacio.
- `risk_policy_engine.py::evaluate_risk_policy` marca warning al 80% y breach al 100% del limite.
- `js/modules/dashboard.js::getRiskPostureRead` tambien pinta riesgo elevado cuando el trade supera el 80% de la politica.
- `js/modules/dashboard.js::getDrawdownValueClass` usa thresholds visuales propios: warning > 0,50%, risk > 2,00%.

## Regla de producto a implementar

Separar siempre tres capas:

1. `measured`: datos reales calculados desde MT5/EA, historial o posiciones.
2. `configured_policy`: reglas definidas por usuario, funding, cuenta o backend explicito.
3. `reference_assumption`: defaults o supuestos tecnicos para calculos cuando no hay politica real.

Solo `configured_policy` puede generar lenguaje de "politica", "limite", "bloqueado" o color rojo de incumplimiento.

## Cambios recomendados

- Anadir `policy_source` por campo: `user`, `funding`, `account`, `backend_config`, `inferred`, `default`.
- Anadir `is_configured` por limite critico.
- Si una politica es default/inferida:
  - Mostrar `Sin politica definida` o `Referencia base`.
  - No marcar breach por ese default.
  - Mantener el dato medido visible.
- En risk engine/reportes, mostrar el origen del supuesto cuando se use para VaR/RoR/sizing.
- Crear una pantalla de configuracion de politica por cuenta antes de produccion.

## Criterio de aceptacion

- Ninguna metrica debe decir `Politica X%` si X no viene de una regla real.
- Ninguna card debe ponerse roja por superar un default oculto.
- Todo limite debe poder explicar su origen en tooltip o detalle.
- Los calculos profesionales pueden usar supuestos, pero deben etiquetarse como supuestos.
