# Handoff - Panel / Dashboard

Usa este prompt en un chat nuevo para cerrar visualmente la seccion `Panel` de KMFX Edge Next.js.

## Contexto

Estamos migrando KMFX Edge a Next.js en paralelo, sin tocar produccion. La app Next vive en:

`apps/web-next`

Ruta:

`http://localhost:3043/dashboard`

Archivo principal:

`apps/web-next/src/components/trading/mesa-dashboard.tsx`

Shell/layout:

`apps/web-next/src/components/trading/workspace-shell.tsx`

Contratos/documentacion obligatoria:

- `docs/nextjs-section-shells-layout-contract.md`
- `docs/nextjs-dashboard-mesa-product-contract.md`
- `docs/nextjs-shaban-efferd-dashboard-patterns.md`
- `docs/dashboard-simplification-roadmap.md`

## Objetivo de producto

Panel debe ser una lectura de 5 segundos para un trader:

- que cuenta esta activa;
- cuanto capital vivo hay;
- como va el PnL;
- si el riesgo permite operar;
- si la curva de equity/balance esta sana;
- que operaciones explican el ultimo movimiento;
- que noticia macro o insight hay que mirar antes de subir riesgo.

No debe ser una pagina gigante de widgets.

## Estructura bloqueada

Orden esperado:

1. Card de cuenta.
2. 5 KPI separadas: `Capital activo`, `PnL`, `PF`, `Win rate`, `DD`.
3. Grid principal:
   - izquierda: curva de equity/balance;
   - derecha: estado operativo.
4. Operaciones recientes.
5. Noticias + Insights rapidos.

## Decisiones visuales cerradas

- Estetica dark premium, neutral, sobria.
- Inspiracion: Shaban/Efferd, Apple HIG, shadcn, UI TripleD.
- No copiar contenido SaaS de Efferd; copiar claridad, jerarquia y densidad.
- No cards dentro de cards.
- No badges decorativos.
- No iconos en KPI si no aportan.
- No mini charts decorativos que no explican nada.
- Color solo en numeros positivos/negativos, warning o danger.
- Separadores con `/`, no puntos medios.
- Mantener nombres de trading en ingles cuando son estandar: `PnL`, `PF`, `win rate`, `DD`, `score`.

## Gauge operativo

El gauge de estado operativo usa BkLit:

```tsx
import { Gauge } from "@/components/charts/gauge";
```

Debe respetar esta configuracion visual:

```tsx
<Gauge
  value={57}
  centerValue={102400}
  totalNotches={25}
  spacing={20}
  notchCornerRadius={12}
  notchLengthPercent={100}
  startAngle={174}
  endAngle={367}
  useGradient={false}
  uniformWidth={false}
  inactiveFillOpacity={1}
  activeFillOpacity={1}
  defaultLabel="Margen diario"
  formatOptions={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }}
  enterTransition={{ type: "spring", duration: 1, bounce: 0.6 }}
  enterStaggerScale={1}
/>
```

Si hay solapes, ajustar contenedor/tipografia, no deformar el gauge.

## Prohibido

- Reintroducir flotante, mejor dia o peor dia como KPI superior.
- Poner `Estado operativo` y noticias mezclados.
- Crear cards anidadas.
- Dejar huecos negros grandes bajo curva, operaciones o rail.
- Poner todo verde.
- Repetir equity/balance/PnL en varios sitios sin necesidad.
- Usar palabras como `mock`, `fixture`, `muestra`, `drena`, `wave` de cara al usuario.

## Validacion esperada

Antes de entregar:

```bash
cd apps/web-next
npm run typecheck
npm run lint
curl -I --max-time 10 http://localhost:3043/dashboard
```

Si se cambia UI, abrir preview y revisar:

- no hay huecos negros sin funcion;
- las 5 KPI son cards separadas;
- curva y estado operativo estan alineados;
- operaciones no deja una card enorme vacia;
- noticias e insights ocupan altura coherente;
- no hay scroll horizontal.

