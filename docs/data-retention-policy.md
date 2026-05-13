# Política Técnica de Retención y Borrado de Datos

Estado: borrador operativo para producción mínima viable.

Esta política define qué conserva KMFX Edge, durante cuánto tiempo y qué debe
ocurrir al borrar una cuenta o una conexión MT5.

## Principios

- Guardar solo lo necesario para métricas, auditoría, billing y soporte.
- No registrar secretos en logs.
- No transportar KMFXKeys por query string.
- No mezclar cuentas admin con usuarios normales.
- Stripe es fuente de verdad de cobros y suscripciones.
- El Dashboard es fuente de verdad de la KMFXKey visible/copiable para el
  usuario.

## Retención por tipo de dato

| Dato | Retención propuesta | Motivo |
| --- | --- | --- |
| Usuario Supabase/Auth | Mientras la cuenta esté activa | Acceso al producto |
| Perfil y preferencias | Mientras la cuenta esté activa + 30 días | Recuperación y soporte |
| Conexiones MT5 | Mientras la conexión esté activa + tombstone mínimo | Evitar reutilización accidental y auditar borrados |
| KMFXKey | Activa hasta revocación o eliminación | Reinstalar EA sin crear otra conexión |
| Hash/preview de KMFXKey | Mientras exista la conexión + auditoría mínima | Soporte sin exponer secreto completo |
| Snapshots MT5 completos | Último snapshot completo + caché corta | Métricas actuales sin inflar egress |
| Historial de operaciones | Mientras la cuenta esté activa | Métricas, calendario, ejecución y estudio |
| Journal / post-trade reviews | Mientras la cuenta esté activa | Diario y revisión operativa |
| Eventos de auditoría de seguridad | 90 días hot, hasta 1 año agregado | Investigación de incidencias |
| Eventos de billing | Según obligación fiscal/contable, recomendado 7 años | Facturación, disputas y soporte |
| Logs de aplicación | 30-90 días según proveedor | Diagnóstico sin secretos |
| Artefactos Launcher/EA | Versionados mientras sean soportados | Reinstalación y rollback |

## Payloads MT5

Para reducir coste y egress:

- Mantener snapshot completo solo donde aporte valor inmediato.
- Usar `view=summary` para polling frecuente.
- Cachear resumen pocos segundos en backend.
- No servir histórico pesado en refrescos de estado.
- Si el uso Supabase vuelve a subir, mover histórico/trades a tabla dedicada y
  consultar por ventanas paginadas.

## Borrado de conexión MT5

Cuando el usuario elimina una conexión MT5:

1. Revocar la KMFXKey activa.
2. Ocultar la cuenta del dashboard principal.
3. Conservar tombstone mínimo:
   - `user_id`;
   - login/servidor si hace falta para auditoría;
   - fecha de eliminación;
   - motivo si existe.
4. Eliminar o anonimizar datos no necesarios si el usuario solicita borrado
   completo.
5. Registrar evento de auditoría.

El Launcher no debe volver a crear esa cuenta automáticamente. Si el EA sigue
enviando con una key revocada, el backend debe rechazarlo y mostrar instrucción
clara para crear una nueva conexión.

## Borrado de usuario

Proceso recomendado:

1. Confirmar identidad del usuario.
2. Exportar datos si el usuario lo solicita.
3. Cancelar o verificar suscripción en Stripe.
4. Revocar todas las KMFXKeys.
5. Eliminar datos user-owned:
   - cuentas MT5 activas;
   - preferencias;
   - journal/reviews;
   - presets;
   - datos no obligatorios.
6. Mantener billing mínimo legal si aplica.
7. Registrar evento de auditoría interno.
8. Eliminar o desactivar usuario Supabase/Auth.

## Regeneración de KMFXKey

La key no debe regenerarse durante un reconnect normal.

Uso correcto:

- Reinstalar EA: usar la misma key desde `Ver detalles`.
- Cambiar de gráfico o reiniciar MT5: usar la misma key.
- Cerrar Launcher: no afecta al sync si el EA ya está activo.
- Añadir otra cuenta MT5: crear otra conexión y otra key.
- Key filtrada, perdida o revocada: regenerar o crear nueva conexión.

## Datos locales del Launcher

Los datos locales están en el equipo del usuario. Para soporte:

- No pedir contraseñas del broker.
- No pedir capturas con keys completas si no es imprescindible.
- En soporte, preferir preview de key y login/servidor.
- Al desinstalar, el usuario puede borrar datos locales del Launcher.

## Criterio de salida

La política queda lista para producción mínima cuando:

- cuentas y keys tienen flujo claro;
- borrado de conexión no rompe otras cuentas;
- billing conserva lo legalmente necesario;
- snapshots pesados no se usan para polling frecuente;
- el usuario sabe que puede copiar su key desde detalles de cuenta.
