# KMFX Edge Live Data Section Matrix

Estado: matriz inicial de certificacion de producto para desktop.  
Fecha: 2026-05-06

## Objetivo

Definir, seccion por seccion, que dato ve el trader, de donde sale y que estado debe mostrar KMFX cuando la fuente no esta completa. Esta matriz evita que una pagina parezca "live" si solo tiene datos manuales, estimados o pendientes.

## Reglas de copy

- Usuario final: hablar de "MT5", "EA", "datos de la cuenta", "datos guardados por el trader", "datos insuficientes" o "pendiente de sincronizacion".
- Modo admin: puede mostrar ids, fuente tecnica, payload, `riskSnapshot`, endpoint o diagnostico.
- Nunca mostrar en usuario final: `workspace`, `bridge`, `local`, `backend`, `payloadSource`, `mock`, `debug`, `localStorage` o nombres internos de contrato.
- Si falta una fuente, indicar la accion: conectar EA, esperar primera sincronizacion, ampliar datos, importar backtest, vincular challenge o completar review.

## Matriz por seccion

| Seccion | KPI / bloque visible | Fuente principal | Fuente secundaria | Estado si falta dato | Copy esperado |
| --- | --- | --- | --- | --- | --- |
| Desk | Equity, P&L, Drawdown, Edge Score | Snapshot MT5 via EA | Modelo derivado desde operaciones cerradas | Pendiente de sincronizacion o datos insuficientes | "Esperando sincronizacion MT5" / "Datos insuficientes" |
| Desk | Net Return, VaR, Exposure, Volatilidad, Sortino | Operaciones e historial normalizados | Calculo frontend cuando falta reporte agregado | Estimacion o datos insuficientes | "Recopilando cierres reales" |
| Cuentas | Lista, estado, ultima sincronizacion, KMFXKey en detalle | Registro de cuentas + snapshot MT5 | Cache de clave en navegador | Pendiente, desactualizada, revocada o limite de plan | "Sincronizacion pendiente" / "Clave disponible en detalles" |
| Trades | Operaciones cerradas, posiciones, etiquetas | Operaciones MT5 normalizadas | Etiquetas guardadas por el trader | Sin operaciones o etiquetas incompletas | "Sin operaciones cerradas" / "Etiquetas pendientes" |
| Calendario | P&L diario, dias operados, revisiones | Operaciones cerradas MT5 | Entradas de review | Sin historico suficiente | "Aun no hay actividad suficiente" |
| Insights | Resumen, diario, horario, control | Operaciones cerradas MT5 | Etiquetas y reglas del trader | Lectura parcial | "Lectura parcial por datos insuficientes" |
| Portfolio | Balance/equity, curva y distribucion por cuenta | Snapshot MT5 + historial | Configuracion de capital del trader | Sin cuenta activa o sin historial | "Conecta una cuenta para ver capital real" |
| RiskGuard | Estado operativo, drawdown, margen, heat, reglas, riesgo por cuenta | Motor de riesgo (`riskSnapshot`) | Calculos derivados desde operaciones y politica del trader | Riesgo pendiente, desactualizado o datos insuficientes | "Datos de riesgo pendientes" / "Datos tempranos" / "Proteccion automatica pendiente de EA" |
| Ejecucion | Cumplimiento, reglas, perfiles | Etiquetas y reglas del trader | Inferencia desde operaciones cerradas | Lectura parcial | "Reglas inferidas" / "Etiquetas pendientes" |
| Review | Cockpit, Review Queue, Entradas, AI Review | Entradas manuales + operaciones MT5 | Backtests importados | Sin entradas o sin exportable | "Crea una entrada" / "No hay evidencia suficiente" |
| Playbooks | Strategy Lab, Backtest vs Real, Portafolios | Setups y backtests importados | Operaciones MT5 agrupadas por setup | Sin backtest o datos reales bajos | "Importa backtest" / "Datos reales insuficientes" |
| Prop Firms | Procesos, Reglas, Payouts | Cuenta vinculada + reglas de firma | Payouts y fases guardados por el trader | Challenge no vinculado | "Vincula una cuenta fondeada" |
| Calculadora | Calculadora de lotaje y pip value | Specs MT5 cuando existen | Presets editables | Estimacion manual | "Verifica tick value y contract size" |
| Biblioteca | Glosario y metodologia | Documentacion interna de producto | N/A | N/A | Explicacion educativa, sin prometer resultado |

## Pendiente de certificacion manual

- Probar dos cuentas MT5 live y cambiar cuenta activa verificando Desk, RiskGuard, Trades, Calendario, Insights, Portfolio y Prop Firms.
- Confirmar que las vistas principales no muestran copy tecnico con usuario no admin.
- Confirmar que modo admin conserva diagnostico suficiente sin contaminar la experiencia del trader.
- Añadir snapshots visuales por seccion cuando el flujo de datos live este estable.
