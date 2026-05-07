# Stripe Live Safety Note

Fecha: 2026-05-06

## Contexto

La cuenta Stripe conectada al conector de Codex es:

- Account ID: `acct_1PLM5vEoC6e7wNIt`
- Display name: `Kevinmartinezfx`

El usuario aviso que esta cuenta recibe pagos externos a KMFX Edge. Por tanto, no se deben tocar productos, precios, webhooks, portal, customers, invoices, subscriptions, refunds, payment links ni configuracion global que pertenezcan a otros negocios/flujos.

## Accion realizada antes del aviso

El conector Stripe listo 0 Products y despues se creo el catalogo inicial de KMFX Edge en live mode.

Objetos creados:

| Tipo | ID | Descripcion |
| --- | --- | --- |
| Product | `prod_UT7nzmgj3Eg3Zv` | `KMFX Edge` |
| Price | `price_1TUBYUEoC6e7wNItXEGCdVZ4` | Edge Basic, 15.00 EUR/month |
| Price | `price_1TUC1ZEoC6e7wNItpQF7UGPA` | Edge Basic, 150.00 EUR/year |

## Accion realizada tras confirmacion de usar la misma cuenta

El usuario confirmo que KMFX puede vivir en la misma cuenta Stripe siempre que no se toque nada de los pagos externos. Se completaron solo los Prices dentro del Product `KMFX Edge`.

| Tipo | ID | Descripcion |
| --- | --- | --- |
| Price | `price_1TULXwEoC6e7wNItP3e4pCh4` | Edge Pro, 25.00 EUR/month |
| Price | `price_1TULY0EoC6e7wNItYVKQKHIi` | Edge Pro, 250.00 EUR/year |
| Price | `price_1TUC5uEoC6e7wNItcPyjGy5Z` | Edge Unlimited, 39.00 EUR/month |
| Price | `price_1TUC65EoC6e7wNItBfoMCblt` | Edge Unlimited, 390.00 EUR/year |

No se crearon:

- payment links;
- Checkout Sessions;
- Customer Portal configuration;
- webhook endpoints;
- customers;
- subscriptions;
- invoices;
- refunds.

## Regla desde ahora

Antes de cualquier nueva accion Stripe live:

1. Confirmar si se trabaja en test mode o live mode.
2. Confirmar si KMFX Edge debe vivir en esta misma cuenta o en una cuenta Stripe separada.
3. Si se usa la misma cuenta, aislar todo con:
   - Product `KMFX Edge`;
   - metadata `app=kmfx_edge`;
   - lookup keys `kmfx_*`;
   - webhook endpoint exclusivo de KMFX;
   - Customer Portal configurado sin romper flujos externos.
4. No modificar ni desactivar objetos Stripe no creados explicitamente para KMFX.

## Recomendacion

Para maxima seguridad operativa, crear una cuenta Stripe separada para KMFX Edge o usar test mode antes de conectar live keys. Si se mantiene esta cuenta, terminar el catalogo KMFX solo desde el Dashboard/API con revision manual y sin tocar productos ajenos.
