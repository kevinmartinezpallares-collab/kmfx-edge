# Auditoria completa de metricas KMFX Edge

Estado: documento de trabajo para ejecutar cuando termine la fase de conexiones MT5/EA.
Alcance: EA -> ingest backend -> metric engine -> dashboard/risk/funding/journal -> visualizacion shadcn.

## Principio rector

Cada metrica debe declarar:

- `source`: dato bruto exacto o derivacion.
- `formula`: calculo reproducible.
- `confidence`: suficiente / direccional / insuficiente.
- `policy_source`: usuario, funding, cuenta, backend explicito, inferido o default.
- `visual`: chart recomendado.
- `refresh`: live, intradia, horario o EOD.

Ningun default interno debe mostrarse como politica real. Ningun dato inferido debe bloquear, pintar rojo o decir "limite" sin origen visible.

## Referencias usadas

- MT5/MQL5: `AccountInfoDouble`, `PositionGetDouble`, `HistoryDealGetDouble`, `OrderCalcProfit`.
- shadcn/ui: `Chart` y ejemplos de line/area/bar/radial charts.
- Finanzas: definiciones profesionales de VaR, CVaR, Sortino y Maximum Drawdown.
- Codigo local: `KMFXConnector.mq5`, `kmfx_connector_api.py`, `risk_metrics_engine.py`, `risk_math.py`, `risk_policy_engine.py`, `js/modules/dashboard-professional-kpis.js`.

## Hallazgos criticos

### 1. Politicas default mezcladas con reglas reales

Origen:

- `kmfx_connector_api.py::build_policy`
- `risk_policy_engine.py::build_policy_snapshot`
- `risk_policy_engine.py::evaluate_risk_policy`
- `js/modules/dashboard.js::getRiskPostureRead`

Impacto:

- `max_risk_per_trade_pct = 0.50`
- `daily_dd_hard_stop = 1.20`
- `total_dd_hard_stop = 8.00`
- `portfolio_heat_limit_pct` se infiere por nivel si viene vacio.

Riesgo: el dashboard puede decir "Politica 0,50%" o pintar rojo aunque el usuario no haya definido esa politica.

Accion: cada limite necesita `source` e `is_configured`. Si es default/inferido, mostrar "Referencia" o "Sin politica definida", no "Politica".

### 2. Tickets MT5 pueden truncarse

Origen:

- `KMFXConnector.mq5`: `IntegerToString((int)ticket)` para `ticket`.
- `position_id` se emite como numero JSON, no siempre como string.

Impacto:

- MT5 usa identificadores grandes (`ulong`/`long`). Convertir a `int` puede truncar.
- JavaScript puede perder precision si un `position_id` grande entra como number.
- Agrupacion de parciales, deduplicacion y trazabilidad pueden fallar.

Accion: emitir `ticket`, `position_id`, `order_id`, `deal_id` siempre como string sin cast a int. Test con IDs > 2^31 y > 2^53.

### 3. Precios pueden usar precision del chart, no del simbolo

Origen:

- `KMFXConnector.mq5` usa `_Digits` en posiciones/trades.

Impacto:

- Si el EA esta en EURUSD y hay posiciones XAUUSD/NAS100, `price_open`, `price_current`, `sl`, `tp`, `open_price` o `price` pueden serializarse con precision incorrecta.

Accion: usar `SymbolInfoInteger(symbol, SYMBOL_DIGITS)` por simbolo.

### 4. Posiciones sin SL aparecen como riesgo 0

Origen:

- `KMFXEstimateRiskAmount` devuelve 0 si `stop_loss <= 0`.
- `position_risk_pct` acepta `risk_pct >= 0` como dato directo.

Impacto:

- Una posicion sin SL no tiene riesgo cero; tiene riesgo no acotado / no calculable.
- Exposure, riesgo abierto y postura de riesgo pueden parecer seguros cuando falta SL.

Accion: representar como `risk_state = "unbounded"` o `missing_stop_loss`. En UI: "Sin SL / riesgo no acotado", no `0,00%`.

### 5. Gross/Net Profit Factor no esta totalmente alineado

Origen:

- `kmfx_connector_api.py::build_report_metrics` calcula gross profit/loss desde `profit` bruto.
- `winRate` usa `net`.
- `risk_math.calculate_trade_performance_metrics` trabaja con PnL neto.

Impacto:

- Profit Factor de report metrics y performance profesional pueden divergir.

Accion: definir dos metricas si se necesitan ambas: `gross_profit_factor` y `net_profit_factor`. En dashboard usar la neta para evaluar edge real.

### 6. Open PnL por simbolo ignora swap

Origen:

- `KMFXConnector.mq5` emite `profit`, `swap`, `floating_pnl`.
- `risk_metrics_engine.build_symbol_exposure` usa `profit`.

Impacto:

- Exposicion por simbolo puede no coincidir con el PnL flotante real si hay swap.

Accion: usar `floating_pnl` si existe; fallback a `profit + swap`.

### 7. VaR/RoR dependen de muestra y supuestos

Origen:

- `risk_math.calculate_tail_risk_metrics`
- `risk_math.calculate_monte_carlo_risk_summary`
- `risk_math.calculate_analytical_risk_of_ruin`

Impacto:

- Con pocas operaciones, la lectura es direccional, no robusta.
- RoR usa politica de riesgo por trade si existe; si no, usa perdida media/equity.
- Monte Carlo usa bootstrap de retornos historicos; no predice condiciones nuevas.

Accion: cada card debe mostrar muestra, metodo y base: `historical`, `parametric_normal`, `monte_carlo_bootstrap`, `analytical_brownian`.

## Contrato de datos EA: auditoria

| Bloque | Datos recogidos | Estado | Riesgo | Accion |
| --- | --- | --- | --- | --- |
| Identidad | login, name, broker, server, currency | Correcto en concepto | login/ticket deben ser string | Forzar string en contrato y tests |
| Cuenta | balance, equity, margin, free_margin, profit, leverage, margin_level | Correcto | margin_level puede ser 0 si broker no lo informa | Mostrar "sin dato" si no es finito |
| Posiciones | ticket, symbol, side, volume, open/current price, SL/TP, profit, swap, risk | Parcial | ticket int, `_Digits`, SL=0 => risk 0 | Corregir serializacion y estado de riesgo |
| Trades cerrados | deal ticket, position_id, symbol, side, volume, price, open info, PnL, commission, swap, net | Bueno | entry puede faltar si el open queda fuera de HistorySelect | Usar `HistorySelectByPosition` o lookback ampliado |
| Comisiones/swaps | close + entry prorrateada por volumen | Buena intencion | brokers registran costes de forma distinta | Test con cierre parcial y comision solo en entrada/cierre |
| Symbol specs | point, tickSize, tickValue, contractSize, volume min/max/step | Necesario y bien planteado | si no hay symbol specs, risk usa OrderCalcProfit y fallback | Validar por broker/simbolo |
| Daily/total peaks | EA envia daily_start, daily_peak, equity_peak | Correcto como telemetria | OnInit resetea y luego backend puede reconciliar | Mantener backend como fuente persistente |

## Mapa de metricas principales

| Metrica | Formula actual | Fuente | Interpretacion | Chart recomendado | Estado |
| --- | --- | --- | --- | --- | --- |
| Balance | `AccountInfoDouble(ACCOUNT_BALANCE)` | EA MT5 | Saldo cerrado sin flotante | shadcn Line/Area Chart con equity | OK |
| Equity | `AccountInfoDouble(ACCOUNT_EQUITY)` | EA MT5 | Capital live con flotante | shadcn Area Chart principal | OK |
| Floating PnL | `ACCOUNT_PROFIT`; por posicion `profit + swap` disponible | EA MT5 | Resultado abierto live | Sparkline + badge PnL | Ajustar swap en agregados |
| Margin | `ACCOUNT_MARGIN` | EA MT5 | Margen usado | Progress/Radial | OK si se etiqueta |
| Free Margin | `ACCOUNT_MARGIN_FREE` | EA MT5 | Margen disponible | Progress/Radial | OK |
| Margin Level | `ACCOUNT_MARGIN_LEVEL` | EA MT5 | Salud de margen broker | Radial/Progress | Mostrar sin dato si 0/no finito |
| Net PnL | `profit + commission + swap + dividend/fees` | Backend/adaptador | Resultado real tras costes | KPI + line cumulative | OK |
| Net Return | `PnL / capital * 100` | Dashboard model | Rendimiento neto | Sparkline 7d | Requiere capital claro |
| Win Rate | `wins netos / trades` | Backend | Frecuencia ganadora | Small KPI + bar | OK |
| Profit Factor | `gross wins / gross losses` | Backend | Calidad payout | Badge + mini bar | Separar gross/net |
| Expectancy | media PnL o media R | risk_math | Esperanza por trade | Bar diverging | OK si hay R/pnls |
| Max Drawdown | pico a valle en curva equity | Backend/risk_math | Peor caida historica | Area Chart con tramo max DD resaltado | OK con origen de curva |
| Floating DD | drop balance->equity | risk_metrics_engine | DD abierto actual | KPI estado | OK |
| Peak-to-Equity DD | peak persistido -> equity actual | risk_metrics_engine | DD live contra high watermark | Area/Progress | Necesita persistencia validada |
| Daily DD | daily peak -> equity | risk_metrics_engine | Consumo intradia | Progress con limite real | Limite no debe ser default oculto |
| Risk Amount | OrderCalcProfit(entry->SL) | EA | Perdida estimada si toca SL | Table/Badge | SL=0 debe ser no acotado |
| Risk % | risk_amount / balance | EA/backend | Riesgo por posicion | KPI/Progress | OK si SL valido |
| Total Open Risk | suma risk_pct posiciones | Backend | Heat abierto | Stacked Bar horizontal | No usar default como limite |
| Max Trade Risk | max risk_pct posicion | Backend | Mayor riesgo individual | KPI + policy chip | No decir politica sin source |
| Symbol Exposure | agrupacion por simbolo | Backend | Concentracion por activo | Bar Chart horizontal | Usar floating_pnl |
| VaR 95/99 | cuantiles de perdidas historicas | risk_math | Perdida esperada al percentil | shadcn Radial Chart o Gauge + CVaR label | Requiere muestra |
| CVaR 95/99 | media de perdidas en cola | risk_math | Perdida media si se entra en cola | Bar + label secundario | Requiere muestra |
| Parametric VaR | normal: media/vol/z | risk_math | VaR bajo supuesto normal | No portada; detalle tecnico | Requiere >=30 |
| Monte Carlo VaR | bootstrap PnL historico | risk_math | Distribucion simulada | Histogram/Area bands | Requiere muestra |
| Risk of Ruin | Brownian aprox o Monte Carlo | risk_math | Probabilidad de tocar limite | Radial + assumptions panel | Debe mostrar supuesto |
| Volatilidad anualizada | std returns diarios * sqrt(252) | Dashboard | Variabilidad anualizada | Sparkline volatilidad | OK, muestra minima 5 insuficiente para decision |
| Sortino | retorno medio / downside deviation | risk_math/dashboard | Retorno ajustado por downside | Badge/Pill + trend | OK si returns suficientes |
| Sharpe | retorno medio / volatilidad | risk_math | Retorno ajustado por vol total | Detail KPI | No usar en portada si Sortino basta |
| Recovery Factor | net profit / max DD amount | risk_math | Capacidad de recuperar DD | KPI + bar | OK |
| Ulcer Index | raiz media DD^2 | risk_math | Dolor de curva | Detail chart | OK |
| Edge Score | score propio 0-100 | risk_math | Calidad combinada | RadialBar/Badge | Renombrar D-Score si no es Darwinex |
| Discipline Score | evidencia de journal | risk_math | Calidad conductual | Progress + breakdown | Depende cobertura |
| Portfolio Heat | correlacion + co-loss | risk_math | Riesgo conjunto de estrategias | Heatmap/Matrix | Requiere historico |
| Allocation | score*risk*stability*sample | risk_math | Asignacion sugerida | Stacked Bar | Debe ser recomendacion, no orden |
| Funding DD | DD diario/max contra reglas | prop_firm metrics | Estado challenge/funding | Progress bars | Solo con reglas reales |
| Funding target | progreso a objetivo | prop_firm metrics | Distancia a payout/evaluacion | Progress | OK si objetivo existe |
| Consistency rule | top day share <= limit | prop_firm metrics | Riesgo de violar consistencia | Bar/Alert | Solo si regla existe |
| Pass probability | Monte Carlo a objetivo/ruina | prop_firm metrics | Probabilidad estimada de pasar | Fan/Area bands | Mostrar supuesto |

## Visualizacion shadcn recomendada

| Tipo de lectura | Componente shadcn/Recharts | Uso KMFX |
| --- | --- | --- |
| Serie temporal principal | ChartContainer + AreaChart/LineChart | Equity, balance, net return |
| Drawdown | AreaChart con fill semantico | Max DD, daily DD path |
| Distribucion/cola | BarChart/Histogram custom dentro de ChartContainer | VaR, Monte Carlo outcomes |
| Gauge compacto | RadialChart | VaR95, VaR99, Risk of Ruin, Margin Level |
| Exposicion | BarChart horizontal stacked | Gross/net exposure, symbol heat |
| Score 0-100 | RadialBar o Progress + Badge | Edge Score, Discipline, Quality |
| Tabla accionable | Table + Badge + DropdownMenu | Trades, open risks, accounts |
| Supuestos / warnings | Alert + Tooltip/HoverCard | Politica source, muestra insuficiente |
| Comparativas | ComposedChart | Backtest vs real, funding trajectory |

Nota: el repo actual es `Manual` segun `npx shadcn@latest info`; no hay componentes shadcn instalados como fuente React. Para este proyecto vanilla, shadcn debe usarse como sistema de composicion/patrones visuales, o migrar los charts a un wrapper equivalente con tokens KMFX.

## Roadmap de metricas

### Fase 0 - Congelar contrato de metricas

- Crear `metric_registry.json` o modulo equivalente.
- Cada metrica debe tener id, label, formula, unit, source, confidence, policy_dependency, chart, refresh.
- Bloquear nombres ambiguos: `D-Score` solo si viene de Darwinex; si es propio, `Edge Score`.

### Fase 1 - Sanidad del EA

- Emitir IDs como string.
- Usar digits por simbolo.
- Marcar posiciones sin SL como `unbounded`, no 0.
- Incluir `floating_pnl` en agregados.
- Test de parcialidades: entrada fuera de rango, cierre parcial, comision solo entrada, swap.

### Fase 2 - Fuente y politica

- Introducir `policy_source` por limite.
- Separar `configured_policy` de `reference_assumption`.
- Eliminar rojo/bloqueo basado en defaults.
- Permitir politica por cuenta: riesgo/trade, DD diario, DD max, heat, funding rule.

### Fase 3 - Motor matematico

- Validar formulas con fixtures deterministas.
- Duplicar PF gross/net y decidir cual aparece en dashboard.
- Agregar confidence por muestra: 0, <30, 30-99, >=100.
- Documentar VaR historico, parametric, Monte Carlo y RoR con metodo y supuestos.

### Fase 4 - UI y charts

- Dashboard: 4 KPIs core arriba, chart principal, 8 KPIs profesionales debajo, y luego estado operativo/postura.
- Cada KPI debe tener tooltip con formula, source y confidence.
- VaR/RoR con RadialChart; exposure con stacked horizontal; drawdown con AreaChart; scores con RadialBar/Progress.
- Evitar color unico: texto + icono + badge + color semantico.

### Fase 5 - QA automatico

- Tests unitarios por formula.
- Contract tests EA payload -> backend -> dashboard.
- Fixtures con datos reales anonimizados.
- Snapshot visual desktop para cards/charts.
- Test de no-default-policy: ningun default puede generar `breach`.

### Fase 6 - Documentacion de usuario

- Glosario por metrica.
- "De donde sale este dato" en cada tooltip.
- Vista tecnica por cuenta con ultima sync, fuente, sample size y warnings.

## Checklist de aceptacion por metrica

- El dato bruto existe y esta tipado.
- La formula tiene test.
- La muestra minima esta definida.
- Si usa politica, la politica tiene fuente real.
- Si usa supuesto, se etiqueta como supuesto.
- La UI no oculta incertidumbre.
- El chart coincide con la naturaleza del dato.
- Hay estado empty/loading/error.
- Hay tooltip con definicion y origen.

