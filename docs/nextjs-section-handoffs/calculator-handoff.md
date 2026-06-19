# Handoff - Calculadora

Usa este prompt en un chat nuevo para cerrar visualmente y funcionalmente la seccion `Calculadora`.

## Contexto

Estamos migrando KMFX Edge a Next.js en paralelo, sin tocar produccion. La app Next vive en:

`apps/web-next`

Ruta:

`http://localhost:3043/tools/calculator`

Archivo principal:

`apps/web-next/src/app/(workspace)/tools/calculator/page.tsx`

Componentes actuales:

- `apps/web-next/src/components/trading/reference-sections.tsx`
- `apps/web-next/src/components/trading/lot-size-calculator.tsx`

Dominio/selectores:

- `apps/web-next/src/lib/domain/lot-sizing.ts`
- `apps/web-next/src/lib/domain/lot-sizing.test.ts`

Contratos/documentacion obligatoria:

- `docs/nextjs-section-shells-layout-contract.md`
- `docs/nextjs-route-content-contract.md`
- `docs/nextjs-route-acceptance-gates.md`
- `docs/nextjs-cross-route-dependency-map.md`
- `docs/mt5-data-contract-v1.md`

## Objetivo de producto

Calculadora debe ser una herramienta rapida y segura para decidir lotaje/riesgo antes de operar.

Debe responder:

- cuanto puedo arriesgar;
- que lotaje corresponde al stop;
- cuanto dinero pierdo si salta el stop;
- si el riesgo entra dentro del margen diario;
- si la cuenta de fondeo tiene menos margen que el riesgo elegido;
- que alcance tiene el calculo actual.

## Estructura esperada

1. Header normal de seccion.
2. Selector de cuenta activa.
3. Calculadora principal estilo Myfxbook:
   - balance/equity;
   - riesgo en `%` y `$`;
   - par/instrumento: FX, XAUUSD y principales indices CFD;
   - divisa de cuenta;
   - stop loss en pips para FX o puntos para oro/indices;
   - precio/conversion si aplica;
   - valor punto/lote editable para oro e indices;
   - resultado de lotaje.
4. Resumen de seguridad:
   - riesgo usado;
   - margen diario restante;
   - riesgo abierto;
   - aviso si excede limites.
5. Tabla por cuenta:
   - cuenta;
   - equity;
   - riesgo actual;
   - limite diario;
   - presupuesto sugerido.
6. Notas de alcance:
   - FX majors/cruces soportados con conversion preparada;
   - oro e indices CFD soportados como estimacion editable;
   - specs reales de broker deben prevalecer cuando MT5 las exponga.

## Decision de instrumento

Se anade oro e indices porque es esencial para el usuario y Myfxbook ya trata XAU/USD dentro de su calculadora de position size. La diferencia importante es que indices CFD no tienen una convencion universal fiable entre brokers. La app debe:

- usar defaults razonables para velocidad;
- permitir editar `valor punto / lote`;
- marcar oro/indices como estimados;
- no vender los defaults como contrato oficial;
- preferir en el futuro `SYMBOL_TRADE_TICK_VALUE`, `SYMBOL_TRADE_TICK_SIZE`, `SYMBOL_TRADE_CONTRACT_SIZE` y `SYMBOL_VOLUME_STEP` de MT5.

## Decisiones visuales cerradas

- Debe ser util en menos de 5 segundos.
- No saturar con inputs innecesarios.
- Usar lenguaje de trader: `risk`, `stop`, `lotaje`, `pip`, `equity`, `balance`.
- No cards dentro de cards.
- No usar specs MT5 como verdad unica si el objetivo es estilo Myfxbook.
- Para oro/indices, no ocultar que el valor punto/lote es editable y broker-dependent.
- El `risk %` escrito por el usuario calcula ese risk; el cap recomendado avisa, no recorta el lotaje manual.
- Valores de riesgo fuera de limite deben destacar con color de estado.
- Separadores con `/`, no puntos medios.

## Prohibido

- Enviar ordenes.
- Modificar riesgo real de la cuenta.
- Guardar presets reales sin persistencia segura.
- Inventar reglas oficiales de prop firms.
- Prometer compatibilidad exacta con metales/indices sin specs reales de broker.
- Tocar auth, billing, launcher o MT5.
- Mostrar texto de demo/mock/fixture al usuario.

## Validacion esperada

Antes de entregar:

```bash
cd apps/web-next
npm run test -- lot-sizing
npm run typecheck
npm run lint
curl -I --max-time 10 http://localhost:3043/tools/calculator
```

Si se cambia UI, revisar:

- inputs se entienden sin manual;
- coma decimal y punto decimal funcionan;
- el resultado de lotaje no se corta;
- mobile mantiene orden logico;
- avisos de riesgo se ven pero no asustan sin motivo;
- no hay scroll horizontal.
