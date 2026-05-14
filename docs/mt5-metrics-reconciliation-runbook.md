# MT5 Metrics Reconciliation Runbook

Ultima revision: 2026-05-14
Entorno objetivo: `https://kmfxedge.com`
Objetivo: validar manualmente que los datos visibles en KMFX Edge cuadran con MetaTrader 5 y que cualquier fallback, inferencia o muestra insuficiente queda claramente identificado.

## Regla de aceptacion

No se da por bueno el cierre de produccion si ocurre cualquiera de estos casos:

- Dashboard muestra datos de una cuenta distinta a la activa en MT5.
- Balance, equity o PnL abierto difieren de MT5 sin explicacion razonable.
- El numero de operaciones cerradas difiere de MT5 y la UI no explica que falta historico o muestra.
- Risk Engine muestra limites o alertas como si fueran reglas reales cuando en realidad son referencias o inferencias.
- Una vista usa fallback por falta de `reportMetrics` y no queda claro para el usuario.

## Precondiciones

1. Usar una cuenta controlada, demo o funding permitida para la prueba.
2. Confirmar que el EA ya esta conectado y sincronizando sin el Launcher abierto.
3. Esperar al menos un ciclo de sync estable:
   - `Cuentas` debe mostrar la cuenta como `Conectada` o `Activa`.
   - `Ultimo dato recibido` debe ser reciente.
4. Mantener abierta la misma cuenta en MT5 durante toda la pasada manual.
5. Si hay varias cuentas en KMFX, fijar explicitamente la cuenta activa antes de comparar.

## Evidencia minima a recoger

- Login y servidor visibles en MT5.
- Balance y equity visibles en MT5.
- PnL flotante visible en MT5.
- Numero de posiciones abiertas.
- Numero de operaciones cerradas visibles en el periodo reciente.
- Una captura o nota por cada bloque revisado:
  - Dashboard
  - Cuentas
  - Operaciones
  - Calendario
  - Risk Engine
  - Ejecucion / AI Review si aplica

## Paso 1 - Confirmar identidad de cuenta

En MT5:

1. Abrir la cuenta exacta que quieres reconciliar.
2. Anotar:
   - login
   - broker
   - server

En KMFX:

1. Ir a `Cuentas`.
2. Seleccionar la misma cuenta.
3. Confirmar que coinciden:
   - login
   - broker
   - servidor
   - alias visible

Aceptar solo si:

- no hay duda de que ambas superficies apuntan a la misma cuenta.

## Paso 2 - Confirmar estado del dato

En KMFX:

1. En `Cuentas`, abrir `Ver detalles` de la cuenta.
2. Mirar:
   - `Ultimo dato recibido`
   - `Fuente`
   - cualquier warning sobre muestra, fallback o sincronizacion pendiente

Aceptar solo si:

- el ultimo dato es reciente;
- no aparece un error persistente de key, sync o cuenta stale;
- si la fuente no es fully live, queda indicado de forma clara.

Si aparece copy equivalente a:

- `muestra insuficiente`
- `pendiente de sincronizacion`
- `reglas inferidas`

no es bloqueo por si solo, pero debe anotarse.

## Paso 3 - Reconciliar balance, equity y PnL abierto

En MT5:

1. Anotar:
   - `Balance`
   - `Equity`
   - `Profit` o PnL flotante actual
   - numero de posiciones abiertas

En KMFX `Dashboard`:

1. Confirmar `Balance`.
2. Confirmar `Equity`.
3. Confirmar `PnL abierto` cuando haya posiciones abiertas.
4. Confirmar que la tarjeta principal responde a la cuenta activa.

Tolerancia recomendada:

- Balance: debe coincidir exacto o con diferencia solo de redondeo.
- Equity: puede variar unos segundos, pero debe seguir el mismo valor razonablemente.
- PnL abierto: puede oscilar tick a tick; aceptar solo si la direccion y el orden de magnitud coinciden.

Fallo si:

- KMFX muestra cerrado donde MT5 muestra abierto;
- la cifra parece venir de otra cuenta;
- la diferencia no se explica por un nuevo tick.

## Paso 4 - Reconciliar operaciones cerradas

En MT5:

1. Ir a `History`.
2. Anotar:
   - numero de operaciones cerradas del periodo reciente
   - neto aproximado de ese periodo si es visible

En KMFX `Operaciones`:

1. Confirmar que el conteo reciente es consistente.
2. Mirar si hay parciales agrupados correctamente.
3. Confirmar que no hay duplicados obvios.

En KMFX `Calendario`:

1. Confirmar que los dias con actividad coinciden con MT5.
2. Revisar que el PnL diario tenga sentido con los cierres reales.

Aceptar solo si:

- el conteo cuadra o la diferencia se explica por historico insuficiente;
- no aparecen trades duplicados;
- las fechas de cierre son coherentes.

## Paso 5 - Reconciliar metricas base del dashboard

En KMFX `Dashboard` y `Estudio de metricas`:

1. Confirmar que las metricas principales no parecen inventadas:
   - Net Return
   - Win Rate
   - Profit Factor
   - Drawdown
   - Exposure
   - Volatilidad
   - Sortino
   - Edge Score

2. Mirar si la UI muestra:
   - `Muestra insuficiente`
   - `Recopilando cierres reales`
   - `Confianza`
   - explicacion o formula

Aceptar solo si:

- las metricas basadas en historico cerrado no se presentan como “rotas” cuando falta muestra;
- la UI identifica cuando una lectura es temprana o parcial;
- no hay claims falsos de precision en cuentas recien conectadas.

## Paso 6 - Reconciliar Risk Engine

En KMFX `Risk Engine`:

1. Confirmar que la cuenta activa es la misma.
2. Revisar:
   - riesgo abierto
   - exposicion
   - DD diario
   - DD maximo
   - VaR / CVaR
   - warnings o breaches

Regla clave:

- Si no hay politica real configurada, no aceptar que se muestre como un limite real del usuario.

Aceptar solo si:

- los datos live usan la misma cuenta;
- cualquier regla inferida o de referencia queda identificada;
- una posicion sin SL no aparece como `0 riesgo` si en realidad no es calculable.

## Paso 7 - Funding / Challenge

Solo si la cuenta es de fondeo o challenge.

1. Confirmar que la cuenta esta etiquetada como `Funding` o `Challenge`.
2. Revisar `Funding`.
3. Validar que:
   - no se inventa una regla de firma si no existe;
   - el estado del challenge no contradice los limites visibles;
   - payouts o costes manuales no se mezclan con el PnL de trading.

## Paso 8 - Ejecucion / Journal / AI Review

1. Abrir `Ejecucion`.
2. Revisar una operacion cerrada reciente.
3. Confirmar que:
   - la cuenta activa es la misma;
   - los datos base vienen del trade real cuando existen;
   - AI Review no exporta una revision vacia como si fuera completa.

Aceptar solo si:

- la narrativa se apoya en datos reales;
- cualquier parte manual o incompleta se distingue claramente.

## Paso 9 - Resultado final

Marca el cierre de una cuenta como:

- `OK`: MT5 y KMFX cuadran en identidad, estado live y metricas clave.
- `WARN`: hay pequenas diferencias explicables o muestra insuficiente, pero no engañan al usuario.
- `FAIL`: hay discrepancia material, cuenta cruzada, fallback oculto o metrica presentada como real cuando no lo es.

## Tabla rapida de comparacion

| Bloque | MT5 | KMFX | Resultado esperado |
| --- | --- | --- | --- |
| Identidad | login / broker / server | Cuentas / Dashboard | Debe coincidir |
| Balance | Account Balance | Dashboard / Cuentas | Debe coincidir |
| Equity | Account Equity | Dashboard / Capital | Debe coincidir de forma razonable |
| PnL abierto | Profit flotante | Dashboard | Debe seguir el mismo valor |
| Posiciones abiertas | Trade tab | Dashboard / Riesgo | Conteo coherente |
| Operaciones cerradas | History | Operaciones / Calendario | Sin duplicados y fechas coherentes |
| Drawdown | Derivado por curva | Dashboard / Risk Engine | Coherente con equity curve |
| Exposure / riesgo abierto | Posiciones y SL | Risk Engine | No presentar riesgo falso si falta SL |
| Funding state | Reglas reales | Funding | No inferir reglas como definitivas |

## Si algo falla

Registrar siempre:

- cuenta afectada;
- hora aproximada;
- superficie afectada;
- valor MT5;
- valor KMFX;
- si el valor cambio al refrescar;
- si el problema desaparece al esperar un nuevo sync.
