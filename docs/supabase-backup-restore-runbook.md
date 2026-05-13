# Runbook de Backup y Restore Supabase

Estado: operativo interno para producción mínima viable.

Proyecto: KMFX Edge.

Supabase project ref: `uuhiqreifisppqkawzif`.

## Objetivo

Evitar pérdida irreversible de usuarios, cuentas MT5, billing y métricas si hay
un error de datos, una migración defectuosa o una incidencia de plataforma.

Este runbook no cambia configuración de Supabase. Define qué debe comprobarse y
cómo restaurar sin pisar producción a ciegas.

## Datos críticos

Datos que deben estar cubiertos por backup o export antes de beta abierta:

- Auth de Supabase: usuarios, identidades OAuth y metadata.
- `mt5_account_registry`: cuentas MT5, estado, previews/hash de KMFXKey, último
  sync y payload normalizado.
- Billing: `billing_customers`, `billing_subscriptions`, `billing_events`.
- Diario y revisión: `post_trade_reviews` y futuras tablas de journal.
- Preferencias del usuario: presets, layout, ajustes y configuración visual.
- Auditoría: eventos de cuentas, keys, billing y rechazos MT5.
- Migraciones versionadas en `supabase/migrations`.

Archivos locales de fallback como `.kmfx-accounts.json` solo sirven para
desarrollo o emergencia local. No son backup de producción.

## RPO y RTO

Para producción mínima viable:

- RPO objetivo: máximo 24 horas para datos históricos.
- RTO objetivo: máximo 4 horas para recuperar servicio básico.
- RTO de reconciliación: máximo 24 horas para revisar billing, cuentas MT5 y
  datos importados.

Antes de abrir beta pagada o usuarios con datos live importantes:

- Activar plan Supabase compatible con backups de producción.
- Evaluar Point-in-Time Recovery si el RPO de 24 horas deja de ser aceptable.
- Ejecutar al menos un restore drill a un proyecto nuevo/staging.

## Comprobación manual obligatoria

En Supabase Dashboard:

1. Abrir el proyecto `uuhiqreifisppqkawzif`.
2. Ir a Database > Backups.
3. Confirmar si hay backups disponibles para el plan actual.
4. Confirmar si PITR está desactivado o activado.
5. Revisar el aviso de uso/egress antes de cambiar plan.
6. Guardar captura o nota en la evidencia de release.

No actualizar a Pro ni activar add-ons sin aprobación explícita del propietario.

## Backup antes de release

Antes de un release sensible:

1. Confirmar que `main` está limpio.
2. Confirmar migraciones pendientes.
3. Exportar schema/migraciones desde repo.
4. Si el plan lo permite, crear/confirmar backup disponible en Supabase.
5. Si el plan no permite restore suficiente, hacer export lógico manual desde un
   entorno seguro usando CLI o `pg_dump`.
6. Registrar hora, commit y responsable en `docs/production-release-evidence.md`.

No guardar dumps con datos personales dentro del repo.

## Restore seguro

Regla principal: restaurar primero a un proyecto nuevo o staging. No restaurar
directamente sobre producción salvo caída total y aprobación explícita.

Proceso:

1. Crear/restaurar un proyecto nuevo desde el backup o PITR disponible.
2. Cambiar URLs OAuth solo en staging si se va a probar login real.
3. Confirmar que RLS sigue activa.
4. Ejecutar comprobaciones mínimas:
   - usuario anónimo no ve snapshots privados;
   - usuario normal no ve cuentas admin;
   - admin conserva acceso completo;
   - `/api/mt5/sync` sin key devuelve `missing_connection_key`;
   - billing sin bearer devuelve `auth_required`;
   - las cuentas MT5 muestran último sync esperado.
5. Reconciliar Stripe contra Stripe como fuente de verdad.
6. Reconciliar cuentas MT5 activas contra `mt5_account_registry`.
7. Promover cambios solo después de smoke verde.

## Reconciliación tras restore

Stripe manda sobre el estado de suscripción:

- Si `billing_subscriptions` restaurado no coincide con Stripe, corregir desde
  eventos Stripe o replay de webhooks.
- No conceder acceso por filas antiguas si Stripe marca cancelado, unpaid o
  incompleto.

KMFXKey manda sobre conexión MT5:

- Si la key activa existe, el usuario puede seguir usando la misma.
- Si la key se perdió o quedó revocada, crear una nueva conexión desde
  Dashboard y pegar la nueva key en el EA.
- El Launcher no debe crear keys; solo instala/reinstala el conector en MT5.

## Escenarios

### Migración defectuosa

1. Congelar deploys.
2. No ejecutar revert destructivo.
3. Preferir forward-fix.
4. Restaurar a staging para inspeccionar datos previos.
5. Aplicar corrección mínima en producción.

### Borrado accidental de cuentas MT5

1. Congelar acciones de borrado.
2. Restaurar backup a staging.
3. Extraer filas afectadas de `mt5_account_registry`.
4. Reinsertar solo filas exactas, preservando `user_id`.
5. Auditar que no se mezclan cuentas entre usuarios.

### Billing incorrecto

1. Stripe es fuente de verdad.
2. Exportar usuario/suscripción afectada.
3. Corregir Supabase con lista exacta.
4. Registrar evento de auditoría.

## Criterio de salida

Esta fase queda lista cuando:

- backups/PITR quedan confirmados o se acepta el riesgo temporal;
- restore a staging queda documentado o probado;
- retención y borrado de datos están definidos;
- no se requiere regenerar keys salvo revocación, pérdida o seguridad.
