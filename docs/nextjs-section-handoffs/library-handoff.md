# Handoff - Biblioteca

Usa este prompt en un chat nuevo para cerrar visualmente y funcionalmente la seccion `Biblioteca`.

## Contexto

Estamos migrando KMFX Edge a Next.js en paralelo, sin tocar produccion. La app Next vive en:

`apps/web-next`

Ruta:

`http://localhost:3043/study`

Archivo principal:

`apps/web-next/src/app/(workspace)/study/page.tsx`

Componente actual:

`apps/web-next/src/components/trading/reference-sections.tsx`

Dominio/selectores:

- `apps/web-next/src/lib/domain/study-selectors.ts`
- `apps/web-next/src/lib/domain/study-selectors.test.ts`
- `apps/web-next/src/lib/domain/visible-copy.test.ts`

Contratos/documentacion obligatoria:

- `docs/nextjs-section-shells-layout-contract.md`
- `docs/nextjs-route-content-contract.md`
- `docs/nextjs-route-acceptance-gates.md`
- `docs/nextjs-sidebar-information-architecture.md`
- `docs/kmfx-data-dictionary-v1.md`

## Objetivo de producto

Biblioteca debe ser una capa de apoyo para entender metricas, formulas, conceptos y metodologia de KMFX sin meter ruido en Panel, Insights, Calendario o RiskGuard.

Debe responder:

- que significa cada metrica;
- como se calcula;
- donde se usa dentro del dashboard;
- que datos necesita para ser fiable;
- que decision ayuda a tomar.

No debe ser una pantalla de analitica paralela ni un blog.

## Estructura esperada

1. Header normal de seccion.
2. Buscador o categorias simples.
3. Bloques de contenido:
   - Metricas: `PnL`, `PF`, `win rate`, `Expectancy`, `DD`, `score`.
   - Riesgo: margen diario, riesgo abierto, lotaje, drawdown.
   - Operativa: sesiones, simbolos, setups, parciales.
   - Prop firms: margen diario, limite total, consistencia, payout.
   - Calculadora: pips, valor pip, lotaje y divisa.
4. Fichas cortas:
   - termino;
   - definicion;
   - formula si aplica;
   - donde verlo;
   - aviso de interpretacion.
5. Enlaces internos a secciones relacionadas.

## Decisiones visuales cerradas

- Mucho mas visual que texto largo.
- Fichas cortas y escaneables.
- Mantener terminos trader en ingles cuando son estandar: `PnL`, `Win rate`, `Profit factor`, `Expectancy`, `Score`.
- No usar lenguaje raro ni excesivamente tecnico.
- No cards dentro de cards.
- No llenar la pantalla con parrafos largos.
- Separadores con `/`, no puntos medios.

## Prohibido

- Duplicar Insights.
- Crear recomendaciones operativas como si fueran señales.
- Inventar formulas sin source/provenance.
- Meter contenido de RiskGuard avanzado si todavia no esta validado.
- Mostrar `mock`, `fixture`, `muestra`, `wave` o copy interno.
- Tocar auth, billing, launcher o MT5.

## Validacion esperada

Antes de entregar:

```bash
cd apps/web-next
npm run test -- study
npm run test -- visible-copy
npm run typecheck
npm run lint
curl -I --max-time 10 http://localhost:3043/study
```

Si se cambia UI, revisar:

- se entiende como biblioteca, no como dashboard;
- los terminos clave son faciles de encontrar;
- no hay bloques de texto pesados;
- los enlaces internos tienen sentido;
- mobile mantiene lectura rapida;
- no hay scroll horizontal.
