# MT5 Production Smoke Runbook

Ultima revision: 2026-05-11
Entorno objetivo: `https://kmfxedge.com`, `https://mt5-api.kmfxedge.com`, `https://kmfx-edge-api.onrender.com`

## Objetivo

Validar el flujo real que debe vivir un usuario antes de abrir produccion:

Dashboard -> Launcher -> EA read-only -> Cloud MT5 API -> Backend -> Dashboard.

Este smoke no sustituye a los tests automatizados. Sirve para certificar que una cuenta MT5 nueva se puede conectar sin ayuda y que los datos permanecen sincronizados aunque el Launcher se cierre despues del primer sync.

## Reglas Del Smoke

- Usar una cuenta demo o controlada.
- No usar credenciales master si basta con investor password.
- No crear una key nueva si la cuenta ya tiene una KMFXKey valida.
- Crear key nueva solo si la conexion fue eliminada, revocada, filtrada o pertenece a otra cuenta MT5.
- No pegar keys en capturas, tickets o logs publicos.
- No aceptar un smoke si el EA muestra errores repetidos de WebRequest, key no reconocida o servidor no disponible.
- No marcar como completado si el Launcher queda como requisito permanente para sincronizar.

## Preflight

1. Abrir `https://kmfxedge.com/cuentas`.
2. Iniciar sesion con usuario de prueba o admin controlado.
3. Confirmar que el plan permite conectar MT5.
4. Ejecutar smoke HTTP:

```bash
python3 scripts/production_smoke.py
```

5. Confirmar que las descargas responden:

- `https://kmfxedge.com/downloads/KMFX-Launcher-macOS.zip`
- `https://kmfxedge.com/downloads/KMFX-Launcher-Windows.exe`
- `https://kmfxedge.com/KMFXConnector.ex5`

6. Confirmar WebRequest esperado para MT5:

```text
https://mt5-api.kmfxedge.com
```

## Flujo Recomendado: Launcher

### 1. Crear O Reutilizar Conexion

1. En `Cuentas`, pulsar `Anadir cuenta`.
2. Elegir `MetaTrader 5`.
3. Elegir el metodo recomendado `Launcher + conector automatico`.
4. Si existe una cuenta previa para el mismo MT5, abrir `Ver detalles` y reutilizar su KMFXKey.
5. Si es una cuenta nueva, crear la conexion y guardar evidencia:

- nombre de conexion;
- login esperado si ya se conoce;
- broker/servidor esperado;
- estado inicial `Pendiente`.

Resultado esperado:

- la conexion aparece como pendiente;
- hay una KMFXKey disponible para copiar o para que el Launcher la instale;
- no aparece `entitlement required` para admin o plan valido.

### 2. Descargar Y Abrir Launcher

macOS:

1. Descargar `KMFX-Launcher-macOS.zip`.
2. Descomprimir.
3. Si Gatekeeper muestra aviso de app no verificada, abrir desde `Ajustes del sistema > Privacidad y seguridad > Abrir igualmente` o con clic derecho `Abrir`.
4. Iniciar sesion con la misma cuenta KMFX.

Windows:

1. Descargar `KMFX-Launcher-Windows.exe`.
2. Si Windows SmartScreen avisa, usar `Mas informacion > Ejecutar de todas formas` solo desde la descarga oficial de `kmfxedge.com`.
3. Iniciar sesion con la misma cuenta KMFX.

Resultado esperado:

- el Launcher autentica al usuario;
- detecta instalaciones MT5 con nombre legible;
- no muestra carpetas backup o rotas como opcion principal.

### 3. Instalar Conector

1. Seleccionar la instalacion MT5 correcta.
2. Pulsar `Instalar conector` o `Reinstalar conector`.
3. Confirmar que el Launcher deja:

- `MQL5/Experts/KMFXConnector.ex5`;
- `MQL5/Experts/KMFXConnector.mq5` si el paquete lo incluye;
- `MQL5/Files/kmfx_connection.conf`;
- preset de configuracion si aplica.

Resultado esperado:

- el Launcher no pide puertos ni endpoints al usuario;
- el usuario no debe escribir `connection_key` en URL;
- la key queda disponible para copiar desde dashboard/Launcher si hace falta reparar.

### 4. Preparar MT5

1. Abrir MetaTrader 5.
2. Confirmar login en la cuenta correcta.
3. Activar `Algo Trading`.
4. Ir a `Tools > Options > Expert Advisors`.
5. Activar `Allow WebRequest for listed URL`.
6. Anadir exactamente:

```text
https://mt5-api.kmfxedge.com
```

7. Reiniciar MT5 si lo pide.
8. Arrastrar `KMFXConnector` a un grafico activo.

Resultado esperado en Experts:

```text
[KMFX][STATUS] KMFX Connector iniciado en modo solo lectura.
```

El texto debe dejar claro que no ejecuta, modifica ni cierra operaciones.

### 5. Primer Sync

Esperar hasta 60 segundos.

Resultado esperado en MT5:

```text
[KMFX][STATUS] Conectado a KMFX. Cuenta sincronizada correctamente.
```

Resultado esperado en Dashboard:

- la cuenta pasa de `Pendiente` a `Conectada` o `Activa`;
- muestra login, servidor y broker correctos;
- `Ultima sincronizacion` se actualiza en segundos;
- balance/equity/PnL aparecen si el payload los trae;
- no se duplica una cuenta existente con la misma key/login.

## Prueba Critica: Cerrar Launcher

1. Con la cuenta ya sincronizada, cerrar el Launcher completamente.
2. Mantener MT5 abierto con el EA activo.
3. Esperar 2 a 5 minutos.
4. Refrescar `Cuentas` y `Dashboard`.

Resultado esperado:

- la cuenta sigue actualizando;
- `Ultima sincronizacion` continua reciente;
- el Launcher no es necesario tras el primer sync;
- el EA envia directo a `https://mt5-api.kmfxedge.com`.

Fallo si:

- la cuenta desaparece;
- pasa a stale en pocos segundos sin razon;
- MT5 repite `KMFX no reconoce la clave`;
- MT5 repite `No se pudo conectar con KMFX`;
- el dashboard solo funciona mientras el Launcher esta abierto.

## Flujo Manual: EA Instalado Por Usuario

Usar solo si el Launcher no esta disponible.

1. Descargar `KMFXConnector.ex5`.
2. Copiarlo en `MQL5/Experts`.
3. En Dashboard > Cuentas > Ver detalles, copiar la KMFXKey de esa cuenta.
4. Pegar la key en el input visible del EA si el archivo `kmfx_connection.conf` no existe.
5. Autorizar WebRequest:

```text
https://mt5-api.kmfxedge.com
```

6. Adjuntar el EA a un grafico activo.
7. Esperar primer sync.

Resultado esperado:

- mismo contrato que el flujo Launcher;
- la key no viaja en query string;
- la key no aparece completa en logs.

## Errores Y Accion Correcta

| Mensaje | Causa probable | Accion |
| --- | --- | --- |
| `No se pudo conectar con KMFX` | WebRequest no autorizado, red bloqueada o API caida | Revisar URL permitida y ejecutar smoke HTTP |
| `KMFX no reconoce la clave` | Key revocada, copiada de otra cuenta o archivo config antiguo | Copiar la KMFXKey de `Ver detalles` y reinstalar/reparar |
| `KMFX no acepto temporalmente la sincronizacion` | Rate limit, backend temporal o payload rechazado | Esperar, revisar ultima version del EA y backend logs |
| `Plan sin permiso` | Entitlement no permite MT5 | Revisar plan o admin override |
| Cuenta pendiente sin sync | EA no adjunto, Algo Trading apagado o WebRequest falta | Revisar MT5 Experts y Journal |

## Evidencia A Guardar

No guardar keys completas.

Registrar:

- fecha/hora del smoke;
- usuario usado;
- SO y version: macOS o Windows;
- version Launcher;
- version Connector;
- checksum descargado;
- broker/servidor;
- login MT5;
- hora del primer sync;
- resultado al cerrar Launcher;
- numero de cuentas visibles antes/despues;
- ultimo commit Render en `/health`;
- resultado de `scripts/production_smoke.py`.

Plantilla:

```text
Fecha:
Usuario:
Sistema operativo:
Launcher:
Connector:
Cuenta:
Broker/servidor:
Login:
Metodo: Launcher / Manual
Primer sync:
Launcher cerrado y sync sigue: Si / No
Dashboard muestra cuenta: Si / No
Errores MT5:
Smoke HTTP:
Commit Render:
Resultado final:
```

## Criterio De Aprobacion

El smoke queda aprobado solo si:

- una cuenta nueva o controlada sincroniza desde MT5;
- la cuenta aparece en Dashboard/Cuentas con login y servidor correctos;
- cerrar Launcher no corta la sincronizacion;
- WebRequest usa `https://mt5-api.kmfxedge.com`;
- el EA se presenta como read-only;
- no hay keys completas en URL, logs o capturas;
- el usuario puede recuperar la KMFXKey desde `Ver detalles`;
- las descargas macOS/Windows/EA responden desde `kmfxedge.com`;
- el smoke HTTP automatico esta verde.

## Bloqueos Antes De Go Live

- Smoke macOS limpio pendiente.
- Smoke Windows 10/11 limpio pendiente.
- Activar o documentar definitivamente avisos Gatekeeper/SmartScreen.
- Rotar keys antiguas si hubo logs/capturas con keys completas.
- Ejecutar este runbook al menos una vez con usuario no-admin y plan valido.
