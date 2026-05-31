# KMFX Edge Fixture Redaction Policy

Estado: politica de anonimizado  
Ultima revision: 2026-05-14  
Alcance: definir como crear fixtures utiles para desarrollo y QA sin exponer datos sensibles de cuentas reales.

## Proposito

Necesitamos fixtures realistas.

Pero no podemos arrastrar a la nueva app:

- cuentas reales identificables
- logins MT5 completos
- brokers/servidores sensibles si no hace falta
- claves o metadatos de acceso
- historicos que permitan reconstruir a un usuario real

Esta politica fija el punto medio correcto:

- conservar forma y comportamiento
- eliminar o transformar identidad sensible

## Regla general

Un fixture debe conservar:

- estructura
- cardinalidad
- relaciones internas
- signos relativos
- escenarios de producto

Un fixture no debe conservar:

- identidad real del trader
- secretos
- huellas unicas innecesarias

## Campos que deben redacted siempre

- `connection_key`
- tokens
- passwords
- bearer headers
- emails reales
- user ids reales si permiten reidentificacion
- logins MT5 completos cuando no sean necesarios
- server names demasiado especificos si no aportan valor funcional

## Campos que pueden mantenerse transformados

- balances y equity:
  - mantener orden de magnitud relativa
  - no hace falta mantener cifra exacta
- profit/loss:
  - mantener signos, dispersion y relaciones
- timestamps:
  - conservar secuencia y distancia temporal
  - desplazar fechas absolutas si conviene
- symbols:
  - mantener simbolos reales si son necesarios para risk/calculator behavior

## Estrategias de redaccion recomendadas

### 1. Sustitucion estable

Uso:

- ids
- nombres
- brokers
- servidores

Regla:

- un mismo valor original siempre se transforma en el mismo valor anonimizado dentro del pack

### 2. Desplazamiento temporal

Uso:

- trades
- history
- sync timestamps

Regla:

- mover toda la historia por un offset constante
- preservar orden y distancias

### 3. Escalado financiero

Uso:

- balances
- equity
- pnl
- risk amounts

Regla:

- opcionalmente escalar por un factor constante por fixture
- preservar proporciones clave

### 4. Preservacion selectiva

Uso:

- fields necesarios para formulas y UX

Regla:

- no tocar aquello que romperia semantica del caso

## Lo que no debe romperse al anonimizar

- agrupacion por `position_id`
- relacion entre `profit`, `commission`, `swap`, `net`
- estados `stale`, `blocked`, `missing_stop_loss`
- coherencia entre `balance`, `equity`, `floatingPnl`
- coherencia entre funding room y drawdown state

## Niveles de sensibilidad recomendados

### `public-like`

Puede vivir en repo sin problema especial:

- shell fixtures
- light/dark preference fixtures
- empty states

### `internal-safe`

Puede vivir en repo si esta redacted correctamente:

- snapshots financieros anonimizados
- trades anonimizados
- risk fixtures

### `restricted`

No deberia entrar en fixtures de frontend:

- claves reales
- payloads sin scrub
- ownership internals que no sean necesarios

## Metadata minima por fixture

Cada fixture debe incluir:

- `redactionLevel`
- `redactionMethod`
- `redactionNotes`
- `containsShiftedTimestamps`
- `containsScaledFinancialValues`

## Checklist de aprobacion de fixture

- [ ] no contiene secretos
- [ ] no contiene emails reales
- [ ] no contiene login MT5 completo innecesario
- [ ] conserva relaciones de negocio
- [ ] conserva estados y edge cases
- [ ] sigue sirviendo para QA visual y funcional

## Relacion con documentos existentes

- `docs/kmfx-fixture-pack-spec-v1.md`
- `docs/kmfx-data-dictionary-v1.md`
- `docs/nextjs-master-migration-roadmap.md`
