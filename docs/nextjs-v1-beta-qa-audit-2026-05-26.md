# Next.js V1 Beta QA Audit - 2026-05-26

Estado: evidencia de cierre parcial V1  
Alcance: rutas V1 activas de `apps/web-next`  
Objetivo: separar lo verificable automaticamente de lo que aun requiere revision visual por seccion.

## Validacion Ejecutada

```bash
cd apps/web-next
npm run qa:screenshots:v1
npm run qa:mobile:v1
npm run test:smoke:routes
npm run validate:cascade
```

Resultado:

- `qa:screenshots:v1`: OK, 56 capturas V1 generadas en `output/playwright/v1-qa`.
- `qa:mobile:v1`: OK, 14 rutas V1 validadas en dark/light.
- `test:smoke:routes`: OK, 14 rutas V1, 16 rutas avanzadas y 1 ruta admin.
- `validate:cascade`: OK, tests, typecheck y lint.

## Rutas V1 Validadas

- `/dashboard`
- `/accounts`
- `/capital`
- `/analytics`
- `/analytics/daily`
- `/analytics/hourly`
- `/analytics/risk`
- `/trades`
- `/calendar`
- `/tools/calculator`
- `/study`
- `/settings`
- `/subscription`
- `/settings/subscription`

## Cierre Verificable

- No hay runtime error visible en rutas V1.
- No hay H1 ausente en rutas V1.
- No hay scroll horizontal de pagina en mobile V1.
- Los controles compactos detectados por QA movil quedaron dentro del umbral actual.
- Las rutas avanzadas validan estado `Proximamente`.
- Dark/light carga en las rutas V1 cubiertas por screenshots.
- Calendario y mapas moviles ya no dependen de una matriz desktop comprimida.

## Pasada Visual Transversal

Aplicada en la misma fecha sobre rutas V1:

- Se redujeron separadores internos decorativos en resumenes, modales, KPIs y lecturas rapidas.
- Se eliminaron patrones de mini-card innecesaria dentro de cards principales cuando solo habia texto o una metrica.
- Calendario, mapa diario y mapa portfolio usan tokens `--profit` / `--loss` en vez de verdes/rojos hardcodeados.
- Insights y Risk overview usan bloques mas limpios, sin grids con `divide-*` cuando la separacion no aporta lectura.
- Las lineas se conservan en tablas, matrices y calendario porque son estructura de lectura, no decoracion.

## Pendiente Visual No Automatizado

Estos puntos no deben marcarse cerrados solo por pasar tests:

- Revision final por chat dedicado de cada seccion: confirmar que el criterio visual encaja con el contenido real.
- Densidad visual: seguir corrigiendo huecos negros grandes si aparecen al meter datos reales.
- Excepciones permitidas: tablas, calendario, matrices y cards de cuenta con contenido compuesto.

## Decision Operativa

La base V1 esta tecnicamente lista para seguir cerrando secciones individuales sin reabrir arquitectura.

Orden recomendado:

1. Cerrar `Trades`, `Ajustes`, `Calculadora` y `Biblioteca` en chats dedicados.
2. Mantener `RiskGuard`, `Review`, `Playbooks`, `Prop Firms`, `Mercado` y `Ejecucion` como `Proximamente`.
3. Repetir `qa:screenshots:v1`, `qa:mobile:v1`, `test:smoke:routes` y `validate:cascade` al cerrar cada bloque visual.
