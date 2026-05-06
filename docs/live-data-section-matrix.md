# KMFX Edge Live Data Section Matrix

Estado: matriz inicial de certificacion de producto para desktop.  
Fecha: 2026-05-06

## Objetivo

Definir, seccion por seccion, que dato ve el trader, de donde sale y que estado debe mostrar KMFX cuando la fuente no esta completa. Esta matriz evita que una pagina parezca "live" si solo tiene datos manuales, estimados o pendientes.

## Reglas de copy

- Usuario final: hablar de "MT5", "EA", "datos de la cuenta", "datos guardados por el trader", "muestra insuficiente" o "pendiente de sincronizacion".
- Modo admin: puede mostrar ids, fuente tecnica, payload, `riskSnapshot`, endpoint o diagnostico.
- Nunca mostrar en usuario final: `workspace`, `bridge`, `local`, `backend`, `payloadSource`, `mock`, `debug`, `localStorage` o nombres internos de contrato.
- Si falta una fuente, indicar la accion: conectar EA, esperar primera sincronizacion, ampliar muestra, importar backtest, vincular challenge o completar journal.

## Matriz por seccion

| Seccion | KPI / bloque visible | Fuente principal | Fuente secundaria | Estado si falta dato | Copy esperado |
| --- | --- | --- | --- | --- | --- |
| Dashboard | Equity, P&L, Drawdown, Edge Score | Snapshot MT5 via EA | Modelo derivado desde trades cerrados | Pendiente de sincronizacion o muestra insuficiente | "Esperando sincronizacion MT5" / "Muestra insuficiente" |
| Dashboard | Net Return, VaR, Exposure, Volatilidad, Sortino | Trades e historial normalizados | Calculo frontend cuando falta reporte agregado | Estimacion o muestra insuficiente | "Recopilando cierres reales" |
| Cuentas | Lista, estado, ultima sync, KMFXKey en detalle | Registro de cuentas + snapshot MT5 | Cache de clave en navegador | Pendiente, stale, revocada o limite de plan | "Sincronizacion pendiente" / "Clave disponible en detalles" |
| Operaciones | Trades cerrados, posiciones, tagging | Trades MT5 normalizados | Tags guardados por el trader | Sin operaciones o tagging incompleto | "Sin operaciones cerradas" / "Tags pendientes" |
| Calendario | P&L diario, dias operados, revisiones | Trades cerrados MT5 | Entradas de journal | Sin historico suficiente | "Aun no hay actividad suficiente" |
| Insights | Resumen, diario, horario, control | Trades cerrados MT5 | Tags y reglas del trader | Lectura parcial | "Lectura parcial por muestra" |
| Capital | Balance/equity, curva y distribucion por cuenta | Snapshot MT5 + historial | Configuracion de capital del trader | Sin cuenta activa o sin historial | "Conecta una cuenta para ver capital real" |
| Risk Engine | Risk Cockpit, Ruin / VaR, Monte Carlo, Exposicion | Motor de riesgo (`riskSnapshot`) | Calculos derivados desde trades | Riesgo pendiente, stale o muestra insuficiente | "Datos de riesgo pendientes" / "Muestra temprana" |
| Ejecucion | Cumplimiento, reglas, perfiles | Tags y reglas del trader | Inferencia desde trades cerrados | Lectura parcial | "Reglas inferidas" / "Tags pendientes" |
| Journal | Cockpit, Review Queue, Entradas, AI Review | Entradas manuales + trades MT5 | Backtests importados | Sin entradas o sin exportable | "Crea una entrada" / "No hay evidencia suficiente" |
| Estrategias | Strategy Lab, Backtest vs Real, Portafolios | Setups y backtests importados | Trades MT5 agrupados por setup | Sin backtest o muestra baja | "Importa backtest" / "Muestra real insuficiente" |
| Funding | Challenges, Reglas, Payouts | Cuenta vinculada + reglas de firma | Payouts y fases guardados por el trader | Challenge no vinculado | "Vincula una cuenta fondeada" |
| Herramientas | Calculadora de lotaje y pip value | Specs MT5 cuando existen | Presets editables | Estimacion manual | "Verifica tick value y contract size" |
| Estudio | Glosario y metodologia | Documentacion interna de producto | N/A | N/A | Explicacion educativa, sin prometer resultado |

## Pendiente de certificacion manual

- Probar dos cuentas MT5 live y cambiar cuenta activa verificando Dashboard, Risk, Operaciones, Calendario, Insights, Capital y Funding.
- Confirmar que las vistas principales no muestran copy tecnico con usuario no admin.
- Confirmar que modo admin conserva diagnostico suficiente sin contaminar la experiencia del trader.
- Añadir snapshots visuales por seccion cuando el flujo de datos live este estable.
