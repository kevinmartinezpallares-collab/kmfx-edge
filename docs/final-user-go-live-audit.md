# Auditoria Final Como Usuario Normal

Ultima revision: 2026-05-13
Entorno objetivo: `https://kmfxedge.com`
Estado: pendiente de credenciales, cuenta MT5 real/controlada y aprobacion de ejecucion.

Esta auditoria es la puerta final antes de go-live. No sustituye a los tests
automaticos: valida el producto desde fuera, como usuario normal, con datos reales
o una cuenta demo controlada.

Runbooks de apoyo:

- `docs/mt5-production-smoke-runbook.md`
- `docs/mt5-metrics-reconciliation-runbook.md`

## Objetivo

Validar KMFX Edge exactamente como lo viviria un trader antes de pasar a go-live:

1. entra o se registra;
2. compra o activa un plan;
3. descarga Launcher/EA;
4. conecta una cuenta MT5 real o demo controlada;
5. cierra el Launcher;
6. revisa el dashboard completo;
7. confirma que no ve nada de admin ni datos de otros usuarios;
8. confirma que las metricas salen de los datos enviados por el EA.

## Datos Que Debe Aportar Kevin

- Email y contrasena de usuario normal.
- Confirmacion de que ese email no debe tener permisos admin.
- Tipo de acceso esperado: sin plan, Basic, Pro o Unlimited.
- Cuenta MT5 de prueba:
  - broker;
  - servidor;
  - login;
  - password investor o metodo seguro de acceso;
  - simbolo/grafico para adjuntar el EA;
  - numero aproximado de operaciones cerradas esperadas.
- Confirmacion de si se puede hacer una compra real/controlada o solo validar estado existente.
- Confirmacion antes de cancelar cualquier suscripcion duplicada o borrar conexiones MT5.
- Bandeja de entrada disponible para verificar recibos, confirmaciones y correos de billing.

## Reglas

- No usar el email admin `kevinmartinezpallares@gmail.com` para esta auditoria.
- No crear admin por metadata, UUID ni variables de entorno.
- No publicar capturas con KMFXKey completa, JWTs, correos completos si no es necesario, ni datos sensibles de broker.
- No generar una KMFXKey nueva si la cuenta ya tiene una key estable visible en `Cuentas > Ver detalles`.
- No cancelar, borrar ni revocar nada real sin aprobacion explicita.
- Si hay un fallo, registrar:
  - paso;
  - usuario;
  - cuenta;
  - timestamp;
  - error visible;
  - request/response sin secretos;
  - correccion propuesta.
- Si aparece un dato sensible en UI, log, consola o red, detener la auditoria y
  tratarlo como bloqueo de produccion hasta corregirlo.
- Si el usuario normal ve cualquier panel admin, detener la auditoria y corregir
  permisos antes de seguir.

## Evidencias A Recoger

Cada bloque debe quedar con una de estas marcas:

- `OK`: comportamiento esperado.
- `WARN`: funciona, pero requiere seguimiento antes o justo despues de go-live.
- `FAIL`: bloquea produccion.
- `N/A`: no aplica al usuario o plan probado.

Evidencias minimas:

- captura o nota de estado de plan;
- captura o nota de cuenta MT5 conectada sin mostrar la KMFXKey completa;
- timestamp del primer sync;
- conteo de operaciones en MT5 y en dashboard;
- resultado de abrir/cerrar Launcher;
- resultado de copiar la KMFXKey desde detalles;
- confirmacion de que no aparecen paneles admin;
- confirmacion de email/recibo si se hace compra live controlada.

## Bloque A - Acceso Y Permisos

- [ ] Login con email/password.
- [ ] Login con Google si aplica.
- [ ] Recuperacion/reset de contrasena.
- [ ] El usuario normal no ve:
  - Diagnostico;
  - Cuentas Admin;
  - Sistema Admin;
  - checksums;
  - datos live de admin;
  - cuentas de otros usuarios.
- [ ] El email `kevinmartinezpallares@hotmail.com` queda como usuario normal.
- [ ] Solo `kevinmartinezpallares@gmail.com` tiene admin.
- [ ] El estado admin no depende de metadata editable ni de UUID heredado.
- [ ] Refrescar pagina y cerrar/abrir sesion no cambia permisos de usuario normal.

## Bloque B - Billing Y Conversion

- [ ] Si no tiene plan, aparece paywall/popup de conversion al entrar al dashboard.
- [ ] Sin plan no puede anadir cuenta desde ningun acceso:
  - Dashboard;
  - Cuentas;
  - wizard;
  - Launcher/API.
- [ ] Compra/plan activo se refleja en `Ajustes > Suscripcion`.
- [ ] Plan activo desbloquea `Anadir cuenta` segun limite:
  - Basic: 2 cuentas;
  - Pro: 5 cuentas;
  - Unlimited: sin limite comercial.
- [ ] Customer Portal abre y muestra la suscripcion correcta.
- [ ] Compra real/controlada genera recibo o email de confirmacion.
- [ ] Trial sin tarjeta queda en trial y al terminar debe pausar si no hay metodo de pago.
- [ ] No se crean duplicados de subscription por doble clic/retorno repetido.
- [ ] El plan comprado se refleja sin tener que tocar Supabase manualmente.
- [ ] El dashboard y `Ajustes > Suscripcion` muestran el mismo plan.
- [ ] El boton `Anadir cuenta` queda bloqueado o habilitado igual en todas las rutas.

## Bloque C - Descargas Y Launcher

- [ ] Descargar macOS desde dashboard.
- [ ] Descargar Windows desde dashboard.
- [ ] Descargar `KMFXConnector.ex5` desde flujo manual.
- [ ] `Abrir Launcher` abre la app instalada, no descarga otra vez.
- [ ] Launcher login funciona.
- [ ] Launcher detecta instancias MT5 con nombre legible:
  - broker;
  - servidor;
  - login si esta disponible;
  - alias si existe.
- [ ] Launcher instala/reinstala:
  - `KMFXConnector.ex5`;
  - `kmfx_connection.conf`;
  - preset si aplica.
- [ ] Launcher no crea ni regenera keys; solo instala la KMFXKey estable de esa cuenta.
- [ ] El Launcher muestra una interfaz simple: instalar/reinstalar y abrir MT5.
- [ ] Las keys se consultan desde el dashboard, no se gestionan como flujo tecnico dentro del Launcher.
- [ ] Si el Launcher no puede contactar con KMFX, el error explica accion concreta para el usuario.

## Bloque D - MT5 Y EA

- [ ] WebRequest autorizado para `https://mt5-api.kmfxedge.com`.
- [ ] EA aparece como `KMFXConnector`.
- [ ] EA log inicial indica modo solo lectura.
- [ ] EA no muestra payloads completos ni keys completas.
- [ ] Primer sync llega en menos de 60 segundos.
- [ ] Cuenta pasa a conectada/activa en dashboard.
- [ ] Login, broker y servidor coinciden con MT5.
- [ ] Cerrar Launcher no corta la sincronizacion.
- [ ] Reinstalar conserva la misma cuenta y KMFXKey.
- [ ] Si la key esta revocada, el flujo correcto es copiar la key estable desde detalles o reinstalar, no crear una cuenta nueva.
- [ ] Si se reinstala el conector sobre la misma cuenta, dashboard y Launcher muestran la misma KMFXKey.
- [ ] Si se anade otra instancia MT5, se crea otra cuenta/key solo para esa instancia.

## Bloque E - Reconciliacion De Datos

- [ ] Numero de cuentas en dashboard coincide con las cuentas conectadas/reales del usuario.
- [ ] Numero de operaciones cerradas coincide con MT5 o se explica la diferencia.
- [ ] Balance y equity coinciden con MT5 dentro de margen razonable.
- [ ] PnL flotante coincide con MT5.
- [ ] Operaciones agrupa parciales sin duplicar trades.
- [ ] Calendario usa fecha de cierre final.
- [ ] Dashboard, Operaciones, Calendario, Capital, Risk Engine, Herramientas, Ejecucion e Insights usan la misma cuenta activa.
- [ ] Las metricas criticas muestran fuente/formula/confianza y no dependen de mocks.
- [ ] Politicas default no se muestran como incumplimientos reales.
- [ ] Warnings tecnicos se traducen a lectura util para usuario o quedan ocultos para admin/diagnostico.
- [ ] Las metricas que no tengan muestra suficiente lo indican sin inventar precision.

## Bloque F - Recorrido Del Dashboard

- [ ] Dashboard.
- [ ] Calendario.
- [ ] Operaciones.
- [ ] Estrategias.
- [ ] Insights.
- [ ] Cuentas.
- [ ] Capital.
- [ ] Funding.
- [ ] Ejecucion.
- [ ] Risk Engine.
- [ ] Herramientas.
- [ ] Ajustes.
- [ ] Estudio de metricas.
- [ ] Diario / Review / Entradas / AI Review si esta visible por plan.
- [ ] Enlaces legales, soporte y disclaimer.
- [ ] No hay textos provisionales, checksums visibles ni mensajes tecnicos para usuario normal.
- [ ] No hay acciones destructivas sin confirmacion.

## Bloque H - Criterios De No-Go

No pasar a go-live si ocurre cualquiera de estos casos:

- usuario normal ve admin, datos de admin o cuentas de otro usuario;
- plan comprado no se aplica en dashboard;
- `Anadir cuenta` se puede usar sin plan cuando deberia estar bloqueado;
- EA no sincroniza tras cerrar Launcher;
- KMFXKey del dashboard y la instalada por Launcher no coinciden para la misma cuenta;
- hay que regenerar keys para reparar una cuenta normal;
- operaciones, calendario y dashboard no cuadran en conteo/P&L sin explicacion;
- Stripe crea suscripciones duplicadas;
- Supabase/Render quedan en riesgo de coste o bloqueo operativo sin guardrail manual.

## Bloque G - Resultado

La auditoria solo queda aprobada si:

- no hay datos cruzados entre usuarios;
- el plan correcto gobierna acceso y limites;
- la cuenta MT5 sigue viva con el Launcher cerrado;
- las metricas principales cuadran con MT5 o tienen una explicacion documentada;
- no hay paneles admin visibles para usuario normal;
- el usuario entiende como recuperar o reutilizar su KMFXKey;
- no hay errores persistentes en MT5 Experts ni en consola web;
- se puede repetir el flujo sin asistencia tecnica.

## Pendiente Antes De Ejecutar

- Credenciales de usuario normal.
- Cuenta MT5 real/demo controlada.
- Confirmacion de compra live controlada o estado de plan existente.
- Aprobacion explicita para cancelar suscripciones duplicadas si aparecen.
- Confirmacion de que Supabase y Render tienen limites/plan operativo suficiente para la prueba.
