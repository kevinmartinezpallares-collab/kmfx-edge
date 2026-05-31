# Handoff - Cuentas / Portfolio

Usa este prompt en un chat nuevo para cerrar `Cuentas` y `Portfolio`.

## Contexto

Rutas:

- `http://localhost:3043/accounts`
- `http://localhost:3043/capital`

Archivos principales:

- `apps/web-next/src/components/trading/reference-sections.tsx`
- `apps/web-next/src/components/uitripled/account-cards-slider-shadcnui.tsx`
- `apps/web-next/src/lib/contracts/portfolio.ts`
- `apps/web-next/src/lib/domain/portfolio-selectors.ts`

Contratos/documentacion obligatoria:

- `docs/nextjs-section-shells-layout-contract.md`
- `docs/nextjs-portfolio-product-ui-contract.md`
- `docs/prd-portfolio-policy-and-ea-export.md`
- `docs/domain-model-funding-portfolio-v1.md`
- `docs/nextjs-route-acceptance-gates.md`

## Objetivo de Cuentas

Cuentas debe permitir entender y gestionar cuentas conectadas:

- que cuentas existen;
- broker/firma/server/login;
- estado de conexion;
- ultima sync;
- plan;
- acciones: editar, abrir launcher, eliminar;
- logo real de firma/broker.

## Decisiones de Cuentas cerradas

- Cards de cuenta basadas en UI TripleD cards-slider.
- Fondo original de la primera card aplicado de forma consistente.
- Demos actuales: Darwinex Zero y FTMO, no Alpha/Beta.
- Logos en `apps/web-next/public/brand-logos`.
- El menu de 3 puntos existe, pero acciones pueden estar deshabilitadas si aun no hay flujo real.
- Eliminar cuenta debe ser accion dura en rojo.
- Todo texto visible en espanol, salvo nombres de marca/trading estandar.

## Objetivo de Portfolio

Portfolio no es balance ni copia de RiskGuard. Debe responder:

- donde esta mi capital;
- que cuenta aporta;
- que cuenta resta;
- donde hay riesgo duplicado;
- que cuenta/simbolo/setup merece mas capital;
- que pausar, reducir o aislar.

## Estructura esperada Portfolio V1

- PortfolioHeader.
- PortfolioKpiStrip.
- PortfolioAllocationTable.
- PortfolioContributionRank.
- PortfolioConcentrationPanel.
- PortfolioPolicyReadiness.
- PortfolioStrategyAllocationTable.

## Decisiones Portfolio cerradas

- Tabla densa + barras horizontales.
- No pie charts como lectura principal.
- Distinguir real/demo/funding/Darwinex/bots si existen datos.
- Mostrar estados `empty`, `stale`, `partial`, `requires_review`.
- No activar export real EA ni enforcement.

## Prohibido

- Lista plana de cuentas.
- Cards dentro de cards.
- Imagenes/fondos abstractos no relacionados si ensucian.
- Inventar metricas de Darwinex oficiales sin datos.
- Prometer export real de EA.
- Ocultar pocas cuentas dentro de slider si se ven mejor de un vistazo.

## Validacion esperada

```bash
cd apps/web-next
npm run typecheck
npm run lint
curl -I --max-time 10 http://localhost:3043/accounts
curl -I --max-time 10 http://localhost:3043/capital
```

Revisar manualmente:

- logos aparecen en cards y selector superior;
- menu 3 puntos no rompe pagina;
- detalle de cuenta muestra conexion/key/server/login;
- portfolio no parece RiskGuard;
- no hay cards anidadas ni huecos negros grandes.

