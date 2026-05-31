# Handoff - Ajustes / Suscripcion

Usa este prompt en un chat nuevo para cerrar visualmente y funcionalmente `Ajustes` y la zona de `Suscripcion`.

## Contexto

Estamos migrando KMFX Edge a Next.js en paralelo, sin tocar produccion. La app Next vive en:

`apps/web-next`

Rutas:

- `http://localhost:3043/settings`
- `http://localhost:3043/settings#subscription`

Archivo principal:

`apps/web-next/src/app/(workspace)/settings/page.tsx`

Componente actual:

`apps/web-next/src/components/trading/reference-sections.tsx`

Dominio/selectores:

- `apps/web-next/src/lib/domain/settings-selectors.ts`
- `apps/web-next/src/lib/domain/settings-selectors.test.ts`

Contratos/documentacion obligatoria:

- `docs/nextjs-section-shells-layout-contract.md`
- `docs/nextjs-route-content-contract.md`
- `docs/nextjs-route-acceptance-gates.md`
- `docs/billing-subscription-blueprint.md`
- `docs/billing-env-vars.md`
- `docs/stripe-product-catalog.md`

## Objetivo de producto

Ajustes debe ser una superficie segura y sencilla para gestionar la cuenta del usuario, preferencias visibles y estado de plan sin activar flujos sensibles antes de tiempo.

Debe responder:

- que usuario/cuenta esta activa;
- que plan o suscripcion se muestra;
- que limites de cuenta aplican;
- que preferencias son configurables en V1;
- que acciones estan preparadas pero aun no activas;
- donde se cerrara sesion cuando auth este conectada.

## Estructura esperada

1. Header normal de seccion.
2. Perfil / cuenta:
   - nombre visible;
   - email si existe;
   - rol;
   - avatar/logo;
   - cerrar sesion en rojo como accion dura, aunque aun no ejecute si auth no esta conectado.
3. Preferencias de app:
   - idioma;
   - tema;
   - formato monetario;
   - zona horaria;
   - notificaciones visuales preparadas.
4. Suscripcion y plan:
   - plan actual;
   - cuentas incluidas/usadas;
   - estado de plan;
   - proxima accion visible;
   - botones preparados sin abrir billing real si no hay wrapper.
5. Seguridad y datos:
   - estado de integraciones;
   - nota clara de que acciones sensibles siguen protegidas.

## Decisiones visuales cerradas

- Debe seguir el mismo patron de encabezado que el resto de secciones.
- No mostrar lenguaje tecnico de migracion al usuario final.
- No usar copy como `billing fuera`, `wrapper`, `read-only` en la UI final salvo que sea una nota interna.
- `Suscripcion` puede estar en la pagina y tambien enlazada desde menu de usuario.
- `Cerrar sesion` debe verse como accion destructiva: rojo sutil, no chillón.
- Separadores con `/`, no puntos medios.

## Prohibido

- Activar Stripe Checkout o Customer Portal desde Next sin wrapper dedicado.
- Crear route handlers de billing en esta pasada.
- Tocar Supabase RLS, auth sensible, tokens, secrets o app_metadata.
- Persistir preferencias reales si no hay contrato de guardado.
- Tocar launcher, cuentas MT5 o acciones operativas.
- Usar texto de demo/mock/fixture de cara al usuario.

## Validacion esperada

Antes de entregar:

```bash
cd apps/web-next
npm run typecheck
npm run lint
curl -I --max-time 10 http://localhost:3043/settings
```

Si se cambia UI, revisar:

- `#subscription` navega correctamente;
- no hay botones que prometan acciones reales no implementadas;
- suscripcion se entiende sin jerga tecnica;
- cerrar sesion se ve como accion dura;
- no hay datos sensibles expuestos;
- mobile no corta formularios ni cards.
