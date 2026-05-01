# KMFX Edge Billing and Subscription Blueprint

## Objetivo

Preparar la capa de suscripcion de KMFX Edge sin acoplarla a la UI vanilla actual. Este documento sirve como contrato para la futura migracion a Next.js + shadcn y para decidir que features quedan protegidas por plan.

Ruta recomendada:

1. Supabase Auth identifica al usuario.
2. Stripe Checkout crea o actualiza la suscripcion.
3. Stripe webhooks sincronizan el estado real de billing.
4. KMFX Edge calcula permisos internos desde plan + estado.
5. Frontend, backend y launcher consumen esos permisos.

## No objetivos por ahora

- No construir una UI final de pricing en vanilla.
- No guardar datos de tarjeta en KMFX Edge.
- No crear renovaciones manuales con PaymentIntents.
- No mezclar decisiones visuales de secciones con permisos de billing.
- No bloquear el trabajo de migracion a Next.js.

## Modelo inicial de planes

Los precios exactos quedan pendientes. Lo importante ahora es definir capacidades.

| Plan | Usuario objetivo | Limite base | Uso principal |
| --- | --- | --- | --- |
| Free / Demo | Usuario evaluando la app | 0 cuentas MT5 live, demo/mock | Explorar dashboard y conceptos sin conectar capital real. |
| Edge Core | Trader individual | 1 cuenta MT5 live | Dashboard, riesgo base, trades y calendario operativo. |
| Edge Pro | Trader activo/fondeo | 3 cuentas MT5 live | Riesgo avanzado, funded, journal, strategies y analytics completos. |
| Edge Desk | Multi-cuenta/equipo | Limite custom | Workspaces, cuentas multiples, permisos, soporte prioritario. |

## Entitlements

Los entitlements deben ser la fuente interna para activar o bloquear funcionalidad. La UI no deberia comprobar "plan === pro" directamente; debe preguntar por permisos concretos.

| Entitlement | Free / Demo | Edge Core | Edge Pro | Edge Desk |
| --- | --- | --- | --- | --- |
| `demo_data` | si | si | si | si |
| `live_mt5_accounts` | 0 | 1 | 3 | custom |
| `launcher_connection` | no | si | si | si |
| `dashboard_core` | si | si | si | si |
| `risk_core` | parcial | si | si | si |
| `risk_policy_editor` | no | limitado | si | si |
| `local_auto_block` | no | no/limitado | si | si |
| `trades_history` | limitado | si | si | si |
| `calendar` | limitado | si | si | si |
| `advanced_analytics` | no | limitado | si | si |
| `journal` | limitado | limitado | si | si |
| `strategies` | no | limitado | si | si |
| `funded_challenges` | no | limitado | si | si |
| `portfolio` | no | limitado | si | si |
| `talent_profile` | no | limitado | si | si |
| `raw_bridge_debug` | no | no | si | si |
| `exports` | no | no | si | si |
| `team_workspace` | no | no | no | si |
| `priority_support` | no | no | no | si |

## Estados de billing que la app debe entender

| Estado Stripe/internal | Acceso recomendado | Copy de producto |
| --- | --- | --- |
| `anonymous` | Solo demo y auth gate | "Inicia sesion para conectar una cuenta." |
| `free` | Demo + features limitadas | "Estas usando el modo demo." |
| `trialing` | Acceso del plan durante trial | "Trial activo hasta la fecha indicada." |
| `active` | Acceso completo del plan | "Suscripcion activa." |
| `past_due` | Grace period + aviso | "Actualiza el metodo de pago para mantener el acceso." |
| `unpaid` | Bloqueo de features premium | "Billing requiere atencion." |
| `paused` | Acceso congelado o read-only | "Suscripcion pausada." |
| `canceled` | Volver a free/demo tras fin de periodo | "Plan cancelado." |
| `incomplete` | Sin provision premium | "Pago pendiente de completar." |
| `incomplete_expired` | Sin provision premium | "Checkout expirado." |

## Flujos de usuario

### Alta nueva

1. Usuario crea cuenta o inicia sesion.
2. App muestra planes.
3. Usuario selecciona plan.
4. Backend crea Stripe Checkout Session en modo subscription.
5. Stripe redirige al usuario a Checkout.
6. Webhook `checkout.session.completed` vincula `stripe_customer_id` y `stripe_subscription_id`.
7. Webhook `invoice.paid` confirma acceso renovado.
8. App consulta `/api/billing/status` y refresca entitlements.

### Gestion de suscripcion

1. Usuario abre Billing desde Settings.
2. Backend crea Customer Portal Session.
3. Usuario cambia plan, cancela o actualiza metodo de pago en Stripe.
4. Webhooks sincronizan el nuevo estado.
5. App actualiza permisos sin depender solo del redirect.

### Usuario ya suscrito

Si el usuario intenta comprar otro plan teniendo una suscripcion activa, redirigirlo al Customer Portal o a una pantalla interna de gestion. Evitar multiples suscripciones activas para el mismo usuario/workspace salvo que se decida vender add-ons.

## Eventos Stripe a manejar

Eventos minimos para MVP:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Eventos utiles despues:

- `customer.subscription.trial_will_end`
- `invoice.payment_action_required`
- `customer.updated`
- `price.updated`
- `product.updated`

Regla: todos los webhooks deben ser idempotentes usando `stripe_event_id`.

## Modelo de datos sugerido

Pensado para Supabase/Postgres y portable a Next.js.

### `billing_customers`

| Campo | Tipo | Nota |
| --- | --- | --- |
| `user_id` | uuid primary key | Igual a Supabase auth user id. |
| `stripe_customer_id` | text unique | Customer de Stripe. |
| `email` | text | Email de referencia. |
| `created_at` | timestamptz | Auditoria. |
| `updated_at` | timestamptz | Auditoria. |

### `billing_subscriptions`

| Campo | Tipo | Nota |
| --- | --- | --- |
| `id` | uuid primary key | Interno. |
| `user_id` | uuid | Owner. |
| `stripe_subscription_id` | text unique | Subscription de Stripe. |
| `stripe_customer_id` | text | Customer asociado. |
| `stripe_price_id` | text | Price activo. |
| `plan_key` | text | `free`, `core`, `pro`, `desk`. |
| `status` | text | Estado normalizado. |
| `current_period_start` | timestamptz | Periodo actual. |
| `current_period_end` | timestamptz | Fin de acceso pagado. |
| `cancel_at_period_end` | boolean | Cancelacion programada. |
| `trial_end` | timestamptz null | Fin de trial si aplica. |
| `metadata` | jsonb | Detalles no criticos. |
| `created_at` | timestamptz | Auditoria. |
| `updated_at` | timestamptz | Auditoria. |

### `billing_events`

| Campo | Tipo | Nota |
| --- | --- | --- |
| `stripe_event_id` | text primary key | Idempotencia. |
| `event_type` | text | Tipo de evento. |
| `processed_at` | timestamptz | Fecha de proceso. |
| `status` | text | `processed`, `ignored`, `failed`. |
| `error` | text null | Error si falla. |

### `plan_entitlements`

| Campo | Tipo | Nota |
| --- | --- | --- |
| `plan_key` | text primary key | `free`, `core`, `pro`, `desk`. |
| `entitlements` | jsonb | Permisos y limites. |
| `updated_at` | timestamptz | Versionado simple. |

## Contrato de entitlements en runtime

Ejemplo de payload que deberia consumir la app:

```json
{
  "billing": {
    "plan": "pro",
    "status": "active",
    "trialEndsAt": null,
    "currentPeriodEndsAt": "2026-06-01T00:00:00Z",
    "cancelAtPeriodEnd": false
  },
  "entitlements": {
    "liveMt5Accounts": 3,
    "launcherConnection": true,
    "riskCore": true,
    "riskPolicyEditor": true,
    "localAutoBlock": true,
    "advancedAnalytics": true,
    "journal": true,
    "strategies": true,
    "fundedChallenges": true,
    "rawBridgeDebug": true,
    "exports": true,
    "teamWorkspace": false
  }
}
```

## Endpoints futuros en Next.js

| Endpoint | Metodo | Proposito |
| --- | --- | --- |
| `/api/billing/checkout` | POST | Crear Checkout Session para un `price_id`. |
| `/api/billing/portal` | POST | Crear Customer Portal Session. |
| `/api/billing/webhook` | POST | Recibir eventos Stripe con firma verificada. |
| `/api/billing/status` | GET | Devolver billing + entitlements del usuario actual. |
| `/api/entitlements` | GET | Respuesta ligera para guards de UI/backend. |

## Puntos de integracion con KMFX actual

### Frontend

- `auth-session.js` puede enriquecerse luego con `billing` y `entitlements`.
- Settings deberia tener un bloque "Plan y billing".
- Las secciones deben leer permisos por capability, no por nombre de plan.
- Empty states premium deben explicar el limite sin romper el flujo demo.

### Backend Python actual

- Los endpoints sensibles deben validar usuario y entitlement cuando la app pase a produccion.
- La emision de `connection_key` del launcher deberia depender de `launcher_connection`.
- El numero de cuentas live debe respetar `live_mt5_accounts`.
- Debug RAW y herramientas de reparacion avanzada deben depender de `raw_bridge_debug`.

### Launcher

- El launcher no decide el plan.
- El launcher solo muestra si la cuenta puede conectar segun respuesta del backend.
- Si billing esta `past_due` o `unpaid`, mostrar estado claro y mantener logs/local queue sin borrar datos.

## Guards por seccion

| Seccion | Entitlement principal | Fallback sin permiso |
| --- | --- | --- |
| Dashboard | `dashboard_core` | Demo/read-only. |
| Accounts / Connections | `launcher_connection`, `live_mt5_accounts` | Mostrar guia y limite de plan. |
| Risk | `risk_core`, `risk_policy_editor`, `local_auto_block` | Risk summary demo o solo lectura. |
| Trades | `trades_history` | Historial limitado/demo. |
| Calendar | `calendar` | Mes demo o datos limitados. |
| Analytics | `advanced_analytics` | KPIs base + upsell sobrio. |
| Journal | `journal` | Captura limitada o read-only. |
| Strategies | `strategies` | Templates demo. |
| Funded | `funded_challenges` | Vista educativa/demo. |
| Portfolio | `portfolio` | Resumen limitado. |
| Talent | `talent_profile` | Perfil parcial. |
| Debug | `raw_bridge_debug` | Diagnostico basico. |
| Settings | siempre | Gestion de perfil; billing si auth. |

## Secuencia recomendada de implementacion

### Fase 1 - Definicion

- Confirmar nombres de planes.
- Confirmar limites de cuentas live.
- Confirmar si habra trial.
- Confirmar si Desk es self-service o manual.
- Confirmar si los add-ons existen o quedan fuera del MVP.

### Fase 2 - Base de datos

- Crear tablas `billing_customers`, `billing_subscriptions`, `billing_events`, `plan_entitlements`.
- Definir RLS para que cada usuario lea solo su billing.
- Sembrar entitlements iniciales.

### Fase 3 - Stripe en Next.js

- Crear checkout endpoint.
- Crear portal endpoint.
- Crear webhook endpoint con verificacion de firma.
- Guardar eventos de forma idempotente.
- Exponer `/api/billing/status`.

### Fase 4 - Guards de producto

- Conectar auth state con entitlements.
- Bloquear emision de connection keys si no hay permiso.
- Aplicar limites de cuentas live.
- Anadir empty states premium sobrios en secciones.

### Fase 5 - Pulido comercial

- Pricing page final.
- Settings billing card.
- Emails transaccionales.
- Copy de upgrade/downgrade/cancelacion.
- Checklist go-live de Stripe.

## Decisiones pendientes

- Precios mensual/anual.
- Trial: si existe, duracion y si requiere tarjeta.
- Que plan incluye auto-block local.
- Limite exacto de cuentas en Pro.
- Si Desk es plan publico o contacto comercial.
- Politica de grace period para `past_due`.
- Retencion de datos cuando baja de plan.
- Impuestos: si se usa Stripe Tax desde el inicio.

## Referencias oficiales

- Stripe Subscriptions: https://docs.stripe.com/subscriptions
- Build a subscriptions integration: https://docs.stripe.com/billing/subscriptions/set-up-subscription
- Subscription webhooks: https://docs.stripe.com/billing/subscriptions/webhooks
- Customer Portal Sessions: https://docs.stripe.com/api/customer_portal/sessions
- Stripe Prices API: https://docs.stripe.com/api/prices
