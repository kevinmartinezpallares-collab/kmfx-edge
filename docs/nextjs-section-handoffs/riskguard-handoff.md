# Handoff - RiskGuard

Usa este prompt en un chat nuevo para cerrar visualmente y funcionalmente `RiskGuard`.

## Contexto

Ruta:

`http://localhost:3043/risk`

Archivo principal:

`apps/web-next/src/components/trading/reference-sections.tsx`

Contratos/documentacion obligatoria:

- `docs/nextjs-section-shells-layout-contract.md`
- `docs/nextjs-riskguard-product-ui-contract.md`
- `docs/policy-evaluation-contract-spec.md`
- `docs/riskguard-enforcement-truth.md`
- `docs/risk-policy-source-audit.md`
- `docs/nextjs-route-acceptance-gates.md`

## Objetivo de producto

RiskGuard es el motor de proteccion operativa de KMFX. Debe responder:

- puedo abrir otra operacion;
- cuanto puedo perder hoy;
- que regla me bloquea o me avisa;
- que pares y horarios estan permitidos;
- que volumen/riesgo esta permitido;
- cuando debo operar normal, reducido o parar.

Debe sentirse como centro de control profesional, no como tabla backoffice.

## Fases que deben quedar claras

`Read-only Guard`:

- diagnostica;
- recomienda;
- documenta;
- no bloquea MT5 todavia.

`Enforced Guard` futuro:

- EA/policy package bloquea entradas;
- reduce lotaje;
- bloquea simbolo/cuenta/bot;
- audita overrides.

No prometer enforcement real hasta que exista EA confirmado.

## Estructura recomendada

1. Estado operativo principal:
   - Safe / Caution / Danger / Blocked;
   - permitido: abrir, cerrar, reducir;
   - siguiente accion.
2. Visual principal:
   - curva drawdown/equity con zonas de riesgo;
   - o gauge/segmented arc solo si aclara estado.
3. Reglas principales:
   - riesgo maximo por operacion;
   - perdida diaria;
   - max drawdown;
   - max operaciones por dia;
   - riesgo abierto;
   - no SL;
   - perdidas consecutivas;
   - cooldown;
   - noticias alto impacto.
4. Reglas configurables:
   - switch on/off;
   - valor;
   - accion futura;
   - estado.
5. Pares y sesiones:
   - añadir y quitar pares, incluidos predefinidos;
   - horarios permitidos;
   - bloqueo automatico por sesion.
6. Riesgo variable:
   - tabla sencilla por margen diario;
   - riesgo recomendado;
   - perdidas permitidas;
   - accion clara.

## Decisiones visuales cerradas

- Nada de badges decorativos.
- No dots junto a todos los titulos.
- No bordes verdes/rojos en cards.
- Color solo en valor, estado real o warning.
- Sin cards dentro de cards.
- No barras por todas partes si confunden.
- Usar nombres simples en espanol, excepto conceptos trading estandar: `drawdown`, `PnL`, `win rate`, `EA`, `MT5`.

## Prohibido

- Crear una pantalla gigante llena de texto.
- Ocultar configuracion de reglas si el usuario debe entenderla.
- Dejar pares permitidos como lista fija no editable.
- No permitir quitar pares predefinidos.
- Decir que MT5 queda bloqueado si todavia no existe EA/policy.
- Repetir bloques de Panel o Insights.

## Validacion esperada

```bash
cd apps/web-next
npm run typecheck
npm run lint
curl -I --max-time 10 http://localhost:3043/risk
```

Revisar manualmente:

- switches visibles en reglas configurables;
- pares se pueden añadir y quitar;
- no hay badges sin sentido;
- la primera pantalla responde si puedo operar;
- no hay huecos negros grandes;
- no hay cards anidadas.

