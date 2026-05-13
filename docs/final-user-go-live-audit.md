# Auditoria Final Como Usuario Normal

Ultima revision: 2026-05-13
Entorno objetivo: `https://kmfxedge.com`
Estado: pendiente de credenciales, cuenta MT5 real/controlada y aprobacion de ejecucion.

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
