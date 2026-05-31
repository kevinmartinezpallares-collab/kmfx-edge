# Handoff - Calendario

Usa este prompt en un chat nuevo para cerrar visualmente `Calendario`.

## Contexto

Ruta:

`http://localhost:3043/calendar`

Archivo principal:

`apps/web-next/src/components/trading/reference-sections.tsx`

Contratos/documentacion obligatoria:

- `docs/nextjs-section-shells-layout-contract.md`
- `docs/nextjs-route-content-contract.md`
- `docs/nextjs-route-acceptance-gates.md`

## Objetivo de producto

Calendario debe parecerse al calendario actual de KMFX Edge, pero con el nuevo sistema visual:

- ver resultado diario;
- ver resultado semanal;
- navegar por mes y año;
- abrir detalle de dia;
- ver curva acumulada;
- ver tabla de rentabilidad anual.

## Estructura esperada

1. Header normal de seccion.
2. KPIs superiores solo si aportan.
3. Calendario full width.
4. Controles dentro del calendario:
   - mes anterior/siguiente;
   - vista mes/año;
   - selector `%/$` si aplica.
5. Curva acumulada.
6. Tabla de rentabilidad en `%` solamente.
7. Modal/detalle de dia.

## Decisiones visuales cerradas

- Calendario ocupa todo el ancho.
- Columna `Semana` va junto a sabado, no debajo.
- Tabla de rentabilidad no debe tener scroll horizontal.
- Se debe ver de un vistazo.
- Nombres de meses completos.
- Separadores con `/`, no puntos medios.
- Curvas estilo Liveline o similar, con punto final.
- La grafica del dia no debe ir dentro de otra card: debe formar parte de la card de curva del dia.

## Prohibido

- Scroll horizontal en calendario o tabla.
- Cards dentro de cards.
- Modal con grafica en un contenedor anidado innecesario.
- Textos de demo/mock/fixture de cara al usuario.
- Tabla en `$`; debe ser `%`.

## Validacion esperada

```bash
cd apps/web-next
npm run typecheck
npm run lint
curl -I --max-time 10 http://localhost:3043/calendar
```

Revisar manualmente:

- no se corta por la derecha en pantalla de Mac;
- tabla anual completa visible;
- click en dia abre detalle;
- curva acumulada visible;
- vista anual muestra operaciones y beneficio;
- no hay scroll horizontal.

