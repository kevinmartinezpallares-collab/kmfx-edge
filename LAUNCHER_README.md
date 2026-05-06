# KMFX Launcher MVP

`KMFX Launcher` es el puente local entre `KMFXConnector.mq5` y el backend de KMFX Edge.

Ruta principal del MVP:

`MT5 EA -> Launcher local -> Backend KMFX -> Dashboard`

## Qué incluye ya

- servicio local en Python con cola y retry
- app local macOS/Windows con UI de instalación asistida
- detección razonable de instalaciones MT5 en Mac y Windows
- instalación/reparación del connector
- apertura guiada de MT5
- preset para apuntar el EA al servicio local
- logging persistente del launcher
- compatibilidad con snapshot ligero + journal batches del EA

## Flujo recomendado de usuario

En la app web:

1. Ir a `Cuentas`.
2. Pulsar `Conectar cuenta`.
3. Descargar o abrir `KMFX Launcher`.
4. Iniciar sesión con la misma cuenta de KMFX.
5. Pulsar `Instalar conector`.
6. Abrir MetaTrader 5 y activar Algo Trading.
7. Esperar la primera sincronización.

Para usuarios normales no se muestran `connection_key`, puertos, endpoints locales ni logs técnicos. Esa información queda para admin/dev/soporte.

## Multi-cuenta

El launcher mantiene un único servicio local, pero puede instalar el conector para varias cuentas MT5. Cada cuenta creada en KMFX tiene su propia key interna y el launcher la escribe en el preset de la instalación MT5 seleccionada.

Flujo esperado:

1. Pulsar `Añadir cuenta MT5`.
2. Seleccionar la instalación MT5 detectada.
3. Pulsar `Instalar conector` en esa cuenta.
4. Abrir ese MT5 y esperar la primera sincronización.

El usuario no necesita cambiar puertos. El EA envía su key específica y el launcher reenvía cada snapshot al backend con la identidad correcta.

## Archivos principales

- `/Users/conlopuestoyaloloco/Desktop/KMFX Edge/launcher/app.py`
- `/Users/conlopuestoyaloloco/Desktop/KMFX Edge/launcher/service.py`
- `/Users/conlopuestoyaloloco/Desktop/KMFX Edge/launcher/mt5_detector.py`
- `/Users/conlopuestoyaloloco/Desktop/KMFX Edge/launcher/connector_installer.py`
- `/Users/conlopuestoyaloloco/Desktop/KMFX Edge/KMFXConnector.mq5`

## Configuración

El launcher guarda su estado en:

- `~/.kmfx_launcher/config.json`
- `~/.kmfx_launcher/state.json`
- `~/.kmfx_launcher/logs/launcher.log`

Puedes partir de:

- `/Users/conlopuestoyaloloco/Desktop/KMFX Edge/launcher_config.example.json`

## Arranque

macOS:

```bash
./scripts/start_launcher_mac.sh
```

Windows:

```bat
scripts\start_launcher_windows.bat
```

## Qué hace el instalador del connector

- copia `KMFXConnector.mq5` y `KMFXConnector.ex5` si existen
- crea el preset `KMFXConnector_Launcher.set`
- configura:
  - `KMFXBackendBaseUrl=http://127.0.0.1:8766`
  - `/mt5/sync`
  - `/mt5/journal`
  - `/mt5/policy`
  - `connection_key`

## Limitaciones honestas del MVP

- la instalación de MT5 todavía es guiada, no 100% automática
- adjuntar el EA al gráfico en MT5 sigue siendo un paso manual
- abrir MT5 está automatizado cuando el ejecutable/paquete se detecta; si no, queda guiado
- en macOS la detección depende de dónde haya quedado creada la carpeta de datos `MQL5`

## Logs

Launcher:

- `[KMFX][LAUNCHER]`
- `[KMFX][SERVICE]`
- `[KMFX][INSTALL]`
- `[KMFX][MT5]`
- `[KMFX][BACKEND]`

EA:

- `[KMFX]`

## Próximo uso recomendado

Sigue la guía completa en:

- `/Users/conlopuestoyaloloco/Desktop/KMFX Edge/TESTING_GUIDE.md`
