# Next.js Data Adapter Safety Audit

Fecha: 2026-05-19
Estado: activo

## Proposito

Definir que adaptadores legacy se pueden portar a `apps/web-next` y cuales necesitan gates antes de tocar datos reales, launcher, MT5 o estados de cuenta.

## Regla base

No copiar adaptadores legacy tal cual.

Cada adaptador debe quedar separado en:

- contrato de entrada
- normalizacion pura
- fuente de datos read-only
- acciones mutables o runtime, si existen

Las acciones mutables no entran en Wave 1/Wave 2.

## Estado actual seguro

Ya existe en Next:

- `kmfx-api-config`: URLs de API centralizadas por env.
- `accounts-snapshot-client`: cliente read-only para snapshot de cuentas.
- `live-snapshot-adapter`: normalizacion de snapshot live a `WorkspaceState`.
- `mock-accounts-source`: fuente mock tipada y defensiva.
- `mt5-source-config`: metadata read-only de fuente MT5.
- `status-meta`: estados visibles sin HTML legacy.
- `account-context`: cuenta activa, opciones y fallback seguro.

## Adaptadores legacy revisados

### `js/data/adapters/internal-model-adapter.js`

Riesgo:

- depende de `buildDashboardModel` legacy;
- crea un `account record` con `model`, `connection` y `compliance`;
- mezcla contrato de cuenta con modelo de dashboard antiguo.

Decision:

- no portarlo tal cual;
- extraer solo si una ruta Next necesita compatibilidad con payload legacy;
- antes de portar, crear contrato explicito `LegacyDashboardPayload`.

Gate minimo:

- fixture legacy redacted;
- test de equivalencia contra metricas esperadas;
- sin HTML ni store mutation.

### `js/data/adapters/mock-account-adapter.js`

Riesgo:

- depende de `internal-model-adapter`;
- genera estructura legacy, no `TradingAccount`.

Decision:

- sustituido parcialmente por `mock-accounts-source`;
- no portar hasta que haya una necesidad real de raw mock accounts.

Gate minimo:

- raw mock fixture tipada;
- salida `TradingAccount` o `WorkspaceState`, no account record legacy.

### `js/data/adapters/mt5-account-adapter.js`

Riesgo:

- normaliza trades, report metrics, sesiones, pips, posiciones y compliance;
- puede cambiar lectura de PnL, cierres parciales o sesiones si se porta mal.

Decision:

- no tocar sin tests de paridad sobre fixture live;
- preferir evolucionar `live-snapshot-adapter` actual antes que duplicar otro adaptador.

Gate minimo:

- tests para partial closes;
- tests para net/gross/commission/swap;
- tests para tradingDayKey;
- tests para riskSnapshot y reportMetrics;
- fixture redacted con metadata.

### `js/modules/account-runtime.js`

Riesgo:

- contiene simulacion local, timers, reconexion y mutacion de store;
- no aplica directamente a Next App Router;
- puede confundirse con enforcement real.

Decision:

- no portar runtime mutable;
- extraer solo helpers read-only si hacen falta;
- mantener enforcement MT5 fuera de scope hasta EA/policy package.

Gate minimo:

- ninguna llamada a `window.setTimeout`, `setInterval` o store mutation;
- ninguna promesa de bloqueo real MT5;
- tests de decision read-only.

## Orden recomendado

1. Mantener `live-snapshot-adapter` como adaptador principal.
2. Añadir tests de paridad si aparece un nuevo campo MT5.
3. Crear contratos nuevos antes de aceptar payload legacy.
4. Solo despues portar helpers concretos desde legacy.
5. No portar runtime mutable hasta fase de enforcement.

## Criterio de salida

Se puede avanzar a datos reales cuando:

- snapshots redacted pasan tests;
- la UI no calcula datos que pertenecen a dominio;
- no hay store legacy dentro de componentes Next;
- ninguna ruta promete conectar, bloquear o ejecutar acciones sin backend/EA confirmado.
