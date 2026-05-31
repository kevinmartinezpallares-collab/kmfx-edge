# Handoff - Insights

Usa este prompt en un chat nuevo para cerrar `Insights` y sus subsecciones.

## Contexto

Rutas:

- `http://localhost:3043/analytics`
- `http://localhost:3043/analytics/daily`
- `http://localhost:3043/analytics/hourly`
- `http://localhost:3043/analytics/risk`

Archivo principal:

`apps/web-next/src/components/trading/reference-sections.tsx`

Contratos/documentacion obligatoria:

- `docs/nextjs-section-shells-layout-contract.md`
- `docs/nextjs-route-content-contract.md`
- `docs/nextjs-route-acceptance-gates.md`
- `docs/dashboard-simplification-roadmap.md`

## Objetivo de producto

Insights debe ayudar a corregir la operativa sin leer mucho texto:

- que sesiones funcionan;
- que simbolos funcionan;
- que horario conviene operar;
- que dias o ventanas revisar;
- que comportamiento esta dañando el resultado;
- donde mirar antes de subir riesgo.

El usuario prefiere graficas y lectura visual, similar a KMFX Edge actual.

## Estructura esperada

### Resumen

- No repetir Panel.
- Debe resumir las tres subsecciones: diario, horario y riesgo.
- Incluir:
  - rendimiento por sesion;
  - rendimiento por simbolo;
  - distribucion win/loss con donut KMFX;
  - timing / ventana operativa.

### Diario

- Mapa diario robusto tipo KMFX Edge.
- Navegacion por meses sin limites artificiales.
- Dias clave con mejor aporte, mayor daño, alta frecuencia.
- Click en dia abre detalle.

### Horario

- Mapa 24h full width tipo KMFX Edge.
- Selector de mejores horas con bordes redondeados bien alineados.
- El fondo del selector debe envolver exactamente las horas seleccionadas.
- Debajo: mejor ventana, hora a revisar, sesion dominante.

### Riesgo

- Analisis historico de comportamiento de riesgo.
- No duplicar RiskGuard.
- Debe mostrar donde el riesgo se concentró o empeoró resultado.

## Decisiones visuales cerradas

- Mejor simbolo se resalta con gris sutil, no verde.
- Quitar lenguaje raro: `muestra`, `drena`, `drenaje`.
- Quitar badges que no indiquen estado real.
- No poner dots decorativos junto a London/NY.
- Usar `/` para separadores.
- PnL positivo/negativo con color en numero, no en toda la card.

## Graficos permitidos

- Donut KMFX para win/loss.
- Ranking bars para simbolo/sesion.
- Mapa horario 24h para timing.
- Mapa diario para diario.
- Liveline o area chart solo si explica una tendencia.

## Prohibido

- Copiar el resumen de Panel.
- Meter 50 metricas.
- Cards dentro de cards.
- Texto largo donde una grafica lo explica.
- Graficas decorativas.

## Validacion esperada

```bash
cd apps/web-next
npm run typecheck
npm run lint
curl -I --max-time 10 http://localhost:3043/analytics
curl -I --max-time 10 http://localhost:3043/analytics/daily
curl -I --max-time 10 http://localhost:3043/analytics/hourly
curl -I --max-time 10 http://localhost:3043/analytics/risk
```

Revisar manualmente:

- resumen se entiende en 5 segundos;
- mapa horario no tiene barras interiores feas;
- calendario diario navega todos los meses;
- no hay nombres raros;
- no hay huecos negros grandes.

