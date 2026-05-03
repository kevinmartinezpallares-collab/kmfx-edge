# KMFX Edge Journal Pro Roadmap

Fecha: 2026-05-02
Objetivo: convertir KMFX Edge de dashboard + journal en un sistema profesional de diagnostico, riesgo cuantitativo y mejora continua para traders discrecionales, algorítmicos y cuentas de fondeo.

## Principios

- No pisar trabajo paralelo: cada fase debe tener scope claro, archivos definidos y una salida verificable.
- Mantener la identidad KMFX: herramienta oscura, precisa, calmada, densa pero legible; nada de dashboards decorativos sin decisión.
- Cada métrica debe responder: estado, causa, evidencia y acción.
- Separar cálculo de presentación: las métricas profesionales deben vivir primero en motor/modelos, luego exponerse a UI.
- No prometer certeza con datos insuficientes: marcar muestra baja, datos incompletos y estimaciones.
- Evitar asesoramiento financiero: el producto diagnostica proceso, riesgo y disciplina; no recomienda comprar/vender.

## Navegación Propuesta

La navegación actual puede crecer sin meter todo en un solo panel. La propuesta es conservar secciones principales y añadir subsecciones solo donde reducen fricción.

### Core

- Dashboard
- Calendario
- Operaciones
- Estrategias
  - Strategy Lab
  - Backtest vs Real
  - Portafolios
- Insights
  - Resumen
  - Diario
  - Horario
  - Riesgo

### Gestion

- Cuentas
- Capital
- Funding
  - Challenges
  - Reglas
  - Payouts

### Control

- Ejecución
- Risk Engine
  - Risk Cockpit
  - Ruin / VaR
  - Monte Carlo
  - Exposición
- Journal
  - Cockpit
  - Review Queue
  - Entradas
  - AI Review

Implementación probable si se añaden rutas: `index.html`, `js/modules/route-map.js`, `js/modules/store.js`, `js/modules/navigation.js`, `js/modules/sidebar-vnext.js`, `js/modules/mobile-nav.js`.

## Fase 0 - Preparación Anti-Solape

Objetivo: preparar el trabajo sin chocar con otros chats.

- [x] Crear branch dedicada: `codex/journal-pro-roadmap`.
- [x] Revisar `git status --short` antes de cada fase.
- [ ] No modificar `index.html` ni sidebar hasta que la fase de arquitectura de rutas esté decidida.
- [ ] Crear cambios pequeños por fase: motor de métricas, tests, UI, navegación.
- [ ] Mantener los cambios nuevos detrás de nombres de seccion claros, sin reescribir vistas existentes.

Criterio de salida:

- Roadmap aceptado.
- Primer slice elegido.
- Archivos de ownership definidos.

## Fase 1 - Journal Cockpit

Objetivo: que `Diario` deje de ser CRUD y pase a ser el centro diario de revision.

Aplicar:

- [x] Header de cuenta activa con fuente de datos, periodo, trades y estado de riesgo.
- [x] Snapshot profesional: P&L, DD, win rate, profit factor, expectancy, R medio, trades revisados.
- [x] Review Queue: trades sin tag, dias rojos, reglas violadas, setups degradados, operaciones fuera de horario.
- [x] Daily Read: resumen accionable del dia o semana.
- [x] Bloque "Top leaks": mayor fuga por setup, simbolo, sesion, direccion o regla.
- [x] Normalizacion visual KMFX Edge: primitives, tonos semanticos, densidad y lectura Estado/Evidencia/Accion.
- [x] Entrada rapida post-trade: setup, cumplimiento, error, emocion, leccion, screenshot opcional.
- [x] Entrada rapida conectada al modal existente sin tocar el layout visual de las secciones.
- [x] Tabla de entradas recientes como detalle secundario, no como experiencia principal.

Archivos probables:

- `js/modules/journal.js`
- `js/modules/discipline.js`
- `js/modules/calendar.js`
- `js/modules/trades.js`
- `styles-v2.css`

Criterio de salida:

- El usuario abre Journal y sabe en 10 segundos que revisar primero.
- El CRUD sigue funcionando.
- La vista funciona con datos mock y live.

## Fase 2 - Motor de Métricas Profesionales

Objetivo: calcular riesgo y calidad estadistica como trader profesional.

### Métricas Base

- [x] Expectancy en dinero y R.
- [x] Profit Factor.
- [x] Payoff Ratio.
- [x] Average win / average loss.
- [x] Win rate y loss rate.
- [x] Max consecutive wins/losses.
- [x] Best/worst trade.
- [x] Outlier dependency: porcentaje del P&L explicado por top 1, top 3 y top 5 trades.
- [x] Sample quality: insuficiente, aceptable, robusta.

### Riesgo de Ruina

- [x] Risk of Ruin por cuenta.
- [x] Risk of Ruin por estrategia.
- [x] Ruin threshold configurable: por ejemplo -10%, -20%, max DD de prop firm o balance minimo.
- [x] Inputs visibles: win rate, payoff, riesgo por trade, capital, limite de ruina, muestra.
- [x] Modo bootstrap/Monte Carlo cuando la distribucion real de R multiples exista.
- [x] Etiqueta de confianza basada en numero de trades y estabilidad de resultados.

### VaR y CVaR

- [x] Historical VaR 95% y 99%.
- [x] Parametric VaR si hay suficientes retornos.
- [x] Monte Carlo VaR para secuencias simuladas.
- [x] CVaR / Expected Shortfall 95% y 99%.
- [x] VaR por horizonte: 1 trade, 1 dia, 1 semana.
- [x] VaR por cuenta y estrategia.
- [x] VaR por portfolio multi-cuenta.

### Drawdown y Recuperacion

- [x] Max drawdown en dinero y porcentaje.
- [x] Average drawdown.
- [x] Drawdown duration.
- [x] Time to recovery.
- [x] Recovery Factor.
- [x] Calmar / MAR ratio.
- [x] Ulcer Index.
- [x] Equity high-water mark.

### Ratios Ajustados por Riesgo

- [x] Sharpe Ratio.
- [x] Sortino Ratio.
- [x] Calmar Ratio.
- [x] Gain-to-Pain Ratio.
- [x] Tail Ratio.
- [x] Skewness y kurtosis de retornos.

### Sizing y Supervivencia

- [x] Kelly fraction.
- [x] Fractional Kelly conservador: 1/4 Kelly, 1/2 Kelly.
- [x] Risk budget diario y semanal.
- [x] Heat abierto total.
- [x] Max risk per trade real vs politica.
- [x] Risk-to-target y risk-to-ruin.

Archivos probables:

- `risk_math.py`
- `risk_metrics_engine.py`
- `risk_models.py`
- `risk_policy_engine.py`
- `risk_orchestrator.py`
- `risk_serializers.py`
- `tests/test_risk_engine.py`
- nuevos tests enfocados: `tests/test_professional_risk_metrics.py`

Criterio de salida:

- Las métricas se calculan desde trades normalizados.
- Hay tests unitarios para casos simples, muestras vacias y tails extremos.
- La UI no bloquea esta fase.

## Fase 3 - Risk Cockpit UI

Objetivo: llevar las nuevas métricas al producto sin saturar Dashboard.

Aplicar:

- [x] Nueva subseccion `Risk Engine > Ruin / VaR`.
- [x] Primer bloque desktop `Ruin / VaR` dentro de Risk Engine, sin tocar sidebar.
- [x] Cards principales iniciales: Risk of Ruin por Monte Carlo, VaR 95, VaR 99 y Recovery Factor.
- [x] Panel de supuestos inicial: tamaño de muestra, simulaciones, horizonte y limite de ruina.
- [x] Bloque portfolio multi-cuenta: VaR/CVaR agregado por cuenta con lectura conservadora.
- [x] Simulacion visual: distribucion de resultados, DD esperado, probabilidad de tocar limite.
- [x] Alertas accionables: reducir sizing, pausar estrategia, revisar muestra, revisar correlacion.
- [ ] Responsive móvil dedicado: rehacer jerarquía y stacking para pantallas estrechas.

Archivos probables:

- `js/modules/risk.js`
- `js/modules/analytics.js`
- `js/modules/dashboard.js`
- `js/modules/chart-system.js`
- `styles-v2.css`

Criterio de salida:

- Las métricas son entendibles sin leer documentación.
- La UI distingue medicion real, estimacion y muestra insuficiente.

## Fase 4 - Backtest vs Real

Objetivo: copiar la mejor idea del video de TradingNote, pero con lectura KMFX.

Aplicar:

- [x] Registrar métricas de backtest por estrategia en contrato manual-ready.
- [x] Comparar backtest vs real: PF, expectancy, DD, win rate, Sharpe, trade count.
- [x] Degradacion por simbolo, horario, sesion y direccion.
- [x] Diferencia de slippage, comisiones y spread si existen datos.
- [x] Diagnostico: "edge degradado", "muestra insuficiente", "real supera backtest", "backtest no confiable".
- [x] Accion: pausar/reducir sizing, ampliar muestra, excluir foco degradado, revisar horario.
- [x] Importador MT5 Strategy Tester HTML/XML/CSV.
- [x] UI lado a lado Backtest vs Real.

Archivos probables:

- `js/modules/strategies.js`
- `js/modules/analytics.js`
- nuevo modulo posible: `js/modules/backtest-real.js`
- `backtest_real_engine.py`
- backend/parser futuro si se importan reports MT5.

Criterio de salida:

- Cada estrategia tiene una lectura lado a lado.
- El usuario puede identificar donde se rompe el backtest.
- Parser backend disponible en `mt5_strategy_tester_importer.py` y endpoint `/api/backtests/mt5/import`.

## Fase 5 - Strategy Lab y Portafolios

Objetivo: que cada setup y cada EA tengan vida propia.

Aplicar:

- [x] Strategy Score basico: rentabilidad, estabilidad, DD, VaR, RoR y muestra.
- [x] Strategy Score con disciplina real de ejecucion por estrategia.
- [x] Ranking cuantitativo por score, expectancy, PF, Recovery Factor, VaR, DD y calidad de muestra.
- [x] Estado tecnico: testing, activa, pausada, descartada.
- [x] Correlacion entre estrategias por P&L diario alineado.
- [x] Portfolio heat: estrategias que pierden juntas.
- [x] Asignacion sugerida por riesgo, no por P&L.
- [x] Detector basico de sobreoptimizacion: PF alto + muestra pequena + curva demasiado limpia/outliers.

Archivos probables:

- `js/modules/strategies.js`
- `js/modules/portfolio.js`
- `risk_metrics_engine.py`
- `risk_math.py`

Criterio de salida:

- El usuario sabe que estrategias merecen capital y cuales deben pausarse.

## Fase 6 - Prop Firm Intelligence

Objetivo: convertir Funding en herramienta de supervivencia para challenges y cuentas fondeadas.

Aplicar:

- [x] Daily DD buffer.
- [x] Max DD buffer.
- [x] Consistency rule tracker.
- [x] Profit target progress.
- [x] Minimum days tracker.
- [x] Risk allowed today: max perdida posible antes de violar regla.
- [x] Probabilidad de pasar challenge segun Monte Carlo.
- [x] Payout ledger: ganancias, retiros, fees, refunds, neto.
- [x] Contrato de alerta antes de abrir trade si el riesgo rompe reglas.

Archivos probables:

- `js/modules/funded.js`
- `js/modules/risk.js`
- `risk_policy_engine.py`
- `risk_enforcement_engine.py`

Criterio de salida:

- El trader ve cuanto puede arriesgar hoy sin romper la cuenta.

## Fase 7 - AI Export con Evidencia

Objetivo: generar reportes estructurados, anonimizables y exportables para que el trader los use con una IA externa, sin integrar IA dentro del dashboard.

Aplicar:

- [x] Export estructurado de periodo/cuenta/estrategia en JSON.
- [x] Reporte Markdown copiable para IA externa.
- [x] Endpoint backend para obtener bundle, Markdown o JSON del reporte.
- [x] Prompt externo con Estado/Causa/Evidencia/Accion.
- [x] Seccion de peor patron por simbolo, setup, sesion y direccion.
- [x] Comparar backtest vs real cuando exista dataset de backtest.
- [x] Prompt sugerido para pedir plan de mejora de 7 dias.
- [x] Prompt sugerido para explicar caida de profit factor con evidencia.
- [x] Boton/accion UI para copiar o descargar reporte sin cambiar secciones existentes.
- [x] Guardar respuesta de IA externa como entrada de journal si el trader la pega manualmente.

Restricciones:

- No integrar IA dentro del dashboard en esta fase.
- No llamar a proveedores externos desde KMFX.
- No recomendar entradas de mercado.
- No inventar causalidad sin evidencia.
- Mostrar fuentes de datos usadas.
- Marcar muestra insuficiente.
- Permitir revision manual de datos sensibles antes de exportar.

Archivos probables:

- `ai_evidence_report.py`
- `kmfx_connector_api.py`
- futuro modulo frontend de export: `js/modules/ai-evidence-export.js`

Criterio de salida:

- El trader puede exportar evidencia limpia y pegarla en una IA externa para pedir el analisis que quiera.

## MVP Recomendado

Primer paquete vendible y no demasiado grande:

- [x] Journal Cockpit.
- [x] Review Queue diaria.
- [x] Risk of Ruin.
- [x] VaR / CVaR historico.
- [x] Monte Carlo drawdown.
- [x] Recovery Factor y drawdown duration.
- [x] Strategy Score basico.
- [x] Backtest vs Real manual o mock-ready.

## Orden de Implementación Sugerido

1. Motor de métricas profesionales con tests.
2. Journal Cockpit usando métricas existentes y nuevas.
3. Risk Cockpit `Ruin / VaR`.
4. Strategy Lab score.
5. Backtest vs Real.
6. Prop Firm Intelligence.
7. AI Review.

## Fase 8 - Checkpoint Real / Anti-Solape

Objetivo: convertir el bloque MVP del roadmap en un checkpoint desplegable sin mezclarlo accidentalmente con trabajo paralelo de seguridad, launcher o distribución.

Aplicar:

- [x] Revisar `git status --short` antes de continuar.
- [x] Verificar sintaxis frontend de los archivos de routing/app tocados.
- [x] Ejecutar tests backend/unitarios actuales.
- [x] Confirmar que las subrutas tienen rewrite para preview/producción.
- [x] Separar cambios del roadmap frente a cambios de otros chats antes de hacer commit.
- [ ] Crear commit limpio del roadmap excluyendo `downloads/KMFX-Launcher-Windows.zip 2.sha256`, o confirmar explicitamente que entra.
- [ ] Deploy preview real desde un árbol limpio o intencionadamente agrupado.
- [ ] Smoke test en preview: auth, sidebar, rutas profundas, Risk Engine, Journal AI Export, Backtest vs Real, Funding y API health.
- [ ] Promover a producción solo si el preview pasa.

Archivos del roadmap en este checkpoint:

- `app.js`
- `index.html`
- `js/modules/route-map.js`
- `js/modules/navigation.js`
- `js/modules/store.js`
- `js/modules/journal.js`
- `js/modules/strategies.js`
- `js/modules/backtest-real.js`
- `js/data/sources/mock-workspace-source.js`
- `styles-v2.css`
- `vercel.json`
- `risk_math.py`
- `risk_metrics_engine.py`
- `risk_models.py`
- `risk_policy_engine.py`
- `backtest_real_engine.py`
- `mt5_strategy_tester_importer.py`
- `ai_evidence_report.py`
- tests nuevos del roadmap.

Cambios que deben tratarse como otro frente salvo decisión explícita:

- `launcher/service.py`
- `tests/test_connector_cors_config.py`
- `docs/security/mt5-connection-key-transport.md`
- `downloads/KMFX-Launcher-Windows.zip 2.sha256`

Criterio de salida:

- Existe un preview real verificable.
- No hay mezcla accidental de cambios entre chats.
- El usuario puede decidir producción con una lista corta de pruebas pasadas/fallidas.

## Primer Slice Técnico Propuesto

Scope pequeño para empezar sin tocar sidebar:

- Crear funciones puras para:
  - [x] `risk_of_ruin` analitico.
  - [x] riesgo de ruina por Monte Carlo con threshold configurable.
  - [x] historical VaR.
  - [x] CVaR / Expected Shortfall historico.
  - [x] max drawdown duration.
  - [x] recovery factor.
  - [x] bootstrap Monte Carlo summary.
- [x] Añadir tests.
- [x] Exponer resultados en modelo/snapshot existente.
- Solo después añadir una tarjeta UI experimental en Journal o Risk.

Archivos del primer slice:

- `risk_math.py`
- `risk_metrics_engine.py`
- `risk_models.py`
- `kmfx_connector_api.py`
- `tests/test_professional_risk_metrics.py`

## Preguntas Abiertas

- ¿El primer usuario objetivo es trader algorítmico MT5, trader de fondeo o ambos?
- ¿Backtest se importara desde HTML/XML/CSV de MT5 Strategy Tester o se registrara manualmente al inicio?
- ¿Risk of Ruin debe usar balance de cuenta, max DD de prop firm o ambos?
- ¿VaR se calcula sobre retornos porcentuales, R multiples o P&L nominal?
- ¿La IA debe esperar a backend productivo o basta con export estructurado primero?
