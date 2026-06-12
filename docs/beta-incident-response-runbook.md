# Beta Incident Response Runbook

Objetivo: resolver incidencias de alumnos en beta con un orden estable, sin
tocar areas fuera de beta ni abrir cambios grandes en caliente.

## Regla Base

Ante cualquier incidencia:

1. Ejecutar el monitor beta.
2. Revisar si hay alertas estructuradas.
3. Confirmar si afecta a un usuario, una cuenta MT5 o a toda la beta.
4. Aplicar rollback solo si afecta a acceso, billing, sync MT5 o datos.

Comando local:

```bash
cd apps/web-next
npm run monitor:beta
```

Workflow remoto:

```text
GitHub Actions > Beta Monitor > Run workflow
```

## Alumno No Puede Entrar

Sintomas:

- Login muestra "No se pudo cargar el acceso seguro".
- Email/password no avanza.
- OAuth vuelve a login.
- La app instalada en movil queda en pantalla de error.

Comprobar:

1. `beta_public_auth_config` debe estar en verde.
2. `beta_login_page_loads` debe estar en verde.
3. `beta_no_basic_auth` debe estar en verde.
4. En Vercel, revisar logs del deployment activo.
5. En Supabase, confirmar que el usuario existe y esta confirmado.

Accion:

- Si falla `beta_public_auth_config`, revisar env vars publicas de Supabase en
  Vercel y redeploy.
- Si solo falla un usuario, revisar confirmacion de email, proveedor OAuth y
  estado de suscripcion.
- Si falla para todos, pausar entrada de nuevos alumnos y revisar el ultimo
  deploy.

## Plan Pausado O Trial Finalizado

Sintomas:

- El dashboard carga, pero el acceso operativo aparece pausado.
- El usuario ve plan guardado pero no puede abrir cuentas o descargar archivos.
- Stripe muestra suscripcion pausada tras trial.

Comprobar:

1. Estado en `Suscripcion`.
2. Estado real en Stripe Customer Portal.
3. Backend Render logs con `event=billing_webhook_failed`.
4. Si el usuario uso un codigo privado, comprobar que el descuento vive en
   Stripe, no en el dashboard.

Accion:

- El usuario debe reactivar desde Stripe/Customer Portal o pasar por Checkout.
- No mostrar codigos privados en el dashboard.
- Si el portal no permite reactivar, crear nueva sesion de Checkout del plan
  correcto.

## Cuenta MT5 No Aparece O No Actualiza

Sintomas:

- El EA dice que sincroniza, pero el dashboard no cambia.
- La cuenta aparece como antigua.
- La KMFX Key copiada no coincide con la instalada en MT5.
- El contador de cuentas no coincide.

Comprobar:

1. `mt5_api_health` debe estar en verde.
2. `mt5_api_cors_allows_expected_origin` debe estar en verde.
3. En logs, buscar `event=mt5_sync_rejected_abnormal`.
4. En `Cuentas > Ver detalles`, copiar la KMFX Key vigente de esa cuenta.
5. Confirmar URL del EA:

```text
https://mt5-api.kmfxedge.com
```

Accion:

- Si la key no coincide, pegar la key vigente en el EA.
- Si el EA usa una URL antigua, cambiarla por `https://mt5-api.kmfxedge.com`.
- Si el rechazo es `query_connection_key_not_allowed`, reinstalar EA/Launcher.
- Si hay rate limit, revisar si MT5 quedo en bucle de sync.

## Datos O Metricas No Coinciden

Sintomas:

- Trades visibles no coinciden con MT5.
- Balance/equity parecen repetidos entre cuentas.
- Portfolio cambia de cuenta pero conserva metricas de otra.

Comprobar:

1. Cuenta activa en topbar.
2. Query string `?account=...` en la ruta.
3. Ultima sincronizacion de la cuenta.
4. Historico completo enviado por primer sync.
5. `docs/mt5-metrics-reconciliation-runbook.md`.

Accion:

- No corregir visualmente sin confirmar datos base.
- Primero comparar login MT5, servidor, broker, balance, equity y numero de
  operaciones cerradas.
- Si falta historico, relanzar primer sync completo desde EA.

## Beta Lenta Entre Secciones

Sintomas:

- Cambiar de ruta tarda varios segundos.
- Mobile o desktop se quedan con loader o shell congelado.

Comprobar:

1. Monitor beta: buscar `slow_check`.
2. Vercel runtime logs del deployment activo.
3. Render logs si la ruta toca backend.
4. Network waterfall en navegador si solo afecta al cliente.

Accion:

- Si el shell carga pero tarda el contenido, revisar fetch/backend.
- Si tarda incluso entre rutas ya cargadas, revisar bundle, suspense y
  prefetching.
- Si solo ocurre en movil, revisar scroll/layout pesado y charts.

## Workflow De Alertas

El workflow `Beta Monitor` falla si un check critico falla. GitHub enviara aviso
por email segun la configuracion de notificaciones del repositorio.

Para aviso adicional a Discord o Slack:

1. Crear un webhook privado en Discord o Slack.
2. Guardarlo como secret del repo:

```text
BETA_MONITOR_WEBHOOK_URL
```

3. No pegar el webhook en docs, issues ni chats.
4. Lanzar `Beta Monitor` manualmente para confirmar que el workflow queda listo.

## Que No Tocar En Incidencias De Beta

- RiskGuard en construccion.
- Strategy Lab.
- `kmfx_genetic/`.
- `marketing/`.
- Flujo sensible nuevo de MT5 write.

Si una incidencia parece requerir una de esas areas, documentarla y abrir fase
separada.
