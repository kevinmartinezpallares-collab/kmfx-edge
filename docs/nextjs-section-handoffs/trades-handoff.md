# Handoff - Trades

Usa este prompt en un chat nuevo para cerrar visualmente y funcionalmente la seccion `Trades`.

## Contexto

Estamos migrando KMFX Edge a Next.js en paralelo, sin tocar produccion. La app Next vive en:

`apps/web-next`

Ruta:

`http://localhost:3043/trades`

Archivo principal:

`apps/web-next/src/app/(workspace)/trades/page.tsx`

Componente actual:

`apps/web-next/src/components/trading/reference-sections.tsx`

Dominio/selectores:

- `apps/web-next/src/lib/domain/trades-selectors.ts`
- `apps/web-next/src/lib/contracts/trade.ts`
- `apps/web-next/src/lib/contracts/workspace-state.ts`

Contratos/documentacion obligatoria:

- `docs/nextjs-section-shells-layout-contract.md`
- `docs/nextjs-route-content-contract.md`
- `docs/nextjs-route-acceptance-gates.md`
- `docs/live-data-section-matrix.md`
- `docs/mt5-data-contract-v1.md`

## Objetivo de producto

Trades debe ser el ledger operativo: una tabla clara para entender que operaciones existen, que resultado tuvieron y que merece revision.

Debe responder en pocos segundos:

- que trades hice;
- que simbolo, sesion y setup explican el resultado;
- cuanto fue el `PnL` neto;
- que costes y parciales hubo;
- que operaciones necesitan review;
- que datos faltan para que la lectura sea fiable.

No debe convertirse en Insights, Review ni Calendario.

## Estructura esperada

1. Header normal de seccion.
2. Resumen compacto del ledger:
   - operaciones cerradas;
   - `PnL` neto;
   - costes;
   - win/loss;
   - cobertura de setup/etiquetas.
3. Filtros basicos:
   - cuenta;
   - rango de fechas;
   - simbolo;
   - sesion;
   - resultado;
   - con/sin setup.
4. Tabla principal densa:
   - fecha/cierre;
   - simbolo;
   - direccion;
   - sesion;
   - setup;
   - parciales/ejecuciones;
   - costes;
   - `PnL` neto;
   - estado de review.
5. Panel o fila expandible de detalle por operacion:
   - entrada/salida;
   - duracion;
   - ejecuciones parciales;
   - notas o setup si existe;
   - enlace a Review.
6. Empty/partial states cuando no haya operaciones o falten datos.

## Recomendaciones de producto

- Mantener `Trades` como libro de operaciones, no como pagina de graficas. Si una visual no ayuda a encontrar, filtrar o revisar una operacion, debe ir a Insights.
- Priorizar una tabla fuerte y rapida: fecha, simbolo, direccion, sesion, setup, parciales, costes, `PnL` neto y estado de review.
- Usar filtros compactos y persistentes arriba de la tabla. Los filtros deben sentirse como herramienta de busqueda, no como otro bloque de contenido.
- El detalle de trade debe abrirse como fila expandible o panel lateral ligero. Evitar navegar a otra pagina solo para ver entrada, salida, costes o parciales.
- La lectura clave debe ser: que operacion explica el movimiento, que trade debo revisar y que dato falta.
- Si se incluye una visual, que sea pequena y funcional: distribucion win/loss o neto por resultado en el resumen, nunca una grafica grande que compita con Panel o Insights.
- En V1 no obligaria a usar estrategias. Muchos traders no etiquetan por setup desde el dia uno; la sesion, simbolo, direccion y resultado son mas fiables.
- Las operaciones con perdida, coste alto, sin setup o con varias ejecuciones deben tener senales sutiles, no badges decorativos.

## Decisiones visuales cerradas

- Tabla densa, limpia y profesional.
- No cards dentro de cards.
- No bloques gigantes con poco contenido.
- Los valores positivos/negativos se colorean de forma util.
- Separadores con `/`, no puntos medios.
- Mantener terminos trader estandar: `PnL`, `win rate`, `setup`, `trade`, `partial`, `Review`.
- No usar palabras como `mock`, `fixture`, `muestra`, `drena`, `wave`.

## Prohibido

- Crear graficas grandes que dupliquen Insights.
- Convertir Trades en un dashboard de analitica.
- Inventar MAE/MFE, slippage o spread si no vienen del contrato real.
- Prometer escritura, edicion real de operaciones o sincronizacion MT5 si no existe wrapper.
- Mezclar reglas de fondeo oficiales sin provenance.
- Tocar auth, billing, launcher o flujos MT5.

## Validacion esperada

Antes de entregar:

```bash
cd apps/web-next
npm run typecheck
npm run lint
curl -I --max-time 10 http://localhost:3043/trades
```

Si se cambia UI, revisar:

- no hay scroll horizontal;
- la tabla se lee bien en desktop y mobile;
- los filtros no ocupan mas que el contenido;
- las filas con perdida destacan sin gritar;
- las operaciones con parciales son entendibles;
- los estados sin datos no parecen errores.
