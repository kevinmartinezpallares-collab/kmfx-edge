# Testing Guide: KMFX Launcher MVP

## 1. Levantar backend

Desde el root del proyecto:

```bash
python3 kmfx_connector_api.py
```

Confirma que el backend responde en `http://127.0.0.1:8000/`.

## 2. Arrancar launcher

macOS:

```bash
./scripts/start_launcher_mac.sh
```

Windows:

```bat
scripts\start_launcher_windows.bat
```

## 3. Verificar estado del launcher

En la UI:

- `Servicio local` debe pasar a `ON`
- `Backend KMFX` debe pasar a `Reachable`
- `MT5` debe mostrar `Detectado (...)` si encuentra instalaciones

## 4. Detectar o preparar MT5

Si no detecta MT5:

- usa `Instalar MT5`
- abre MT5 una vez manualmente
- vuelve al launcher y pulsa `Redetectar MT5`

## 5. Instalar/Reparar connector

Pulsa:

- `Instalar/Reparar connector`

Eso copiará el EA al `Experts` detectado y generará:

- `KMFXConnector_Launcher.set`

## 6. Abrir MT5

Pulsa:

- `Abrir MT5`

Si no puede abrirlo automáticamente, ábrelo tú manualmente desde la instalación detectada.

## 7. Adjuntar EA al gráfico

En MT5:

1. abre un gráfico cualquiera
2. adjunta `KMFXConnector`
3. carga el preset `KMFXConnector_Launcher.set` si MT5 no rellena inputs automáticamente
4. activa:
   - trading algorítmico
   - WebRequest para `http://127.0.0.1:8766`

## 8. Comprobar ruta local completa

Debes poder verificar:

EA:

- `backend=http://127.0.0.1:8766`
- requests a `/mt5/sync`, `/mt5/journal`, `/mt5/policy`

Launcher log:

- snapshot/journal recibidos localmente
- reenvío al backend
- policy fresh/cached/fallback

Backend log:

- `POST /api/mt5/sync`
- `POST /api/mt5/journal`
- `GET /api/mt5/policy`

## 9. Verificar dashboard

En la app KMFX Edge:

- la cuenta debe aparecer conectada
- `Cuentas` debe mostrar la cuenta real
- `Panel` y `Riesgo` deben consumir el snapshot ya integrado

## 10. Prueba de resiliencia

Para probar robustez:

1. deja el launcher levantado
2. corta temporalmente el backend
3. deja que el EA siga enviando
4. revisa en el launcher:
   - cola snapshot/journal > 0
5. vuelve a levantar backend
6. revisa que:
   - la cola baja
   - aparecen envíos `RECOVERED`

## 11. Dónde mirar si algo falla

Launcher logs:

- `~/.kmfx_launcher/logs/launcher.log`

Launcher state:

- `~/.kmfx_launcher/state.json`

Launcher config:

- `~/.kmfx_launcher/config.json`

MT5:

- pestañas `Experts` y `Journal`

## 12. Resultado esperado del MVP

Debe quedar operativa esta ruta:

`EA -> localhost:8766 -> backend:8000 -> dashboard`

Si el backend cae:

- el launcher mantiene cola local
- el EA sigue apuntando al servicio local
- cuando el backend vuelve, el launcher reenvía pendientes
