# KMFX Edge — Sistema Completo MT5

## Arquitectura

```
MetaTrader 5
    │
    │ HTTP POST (localhost:8766)
    ▼
KMFXBridge.mq5 ──► kmfx_bridge.py ──► ws://localhost:8765
                     (Python)                │
                                             ▼
                                    kmfx_dashboard_live.html
                                    (tu navegador)
```

**Tu IP NUNCA sale del dispositivo. Todo es localhost.**

---

## Instalación rápida (Windows)

### 1. Requisitos
- Python 3.10+ → https://python.org/downloads (marcar "Add to PATH")
- MetaTrader 5 abierto y logueado

### 2. Instalar dependencias
```
Doble-click en: INSTALL.bat
```
O manualmente:
```bash
pip install MetaTrader5 websockets
```

### 3. Configurar MT5
1. Abre MetaTrader 5
2. **Tools → Options → Expert Advisors**
3. Marca ✓ `Allow algorithmic trading`
4. Marca ✓ `Allow WebRequest for listed URL`
5. Añade la URL: `http://localhost:8766`
6. Haz click en OK

### 4. Instalar el EA
1. Copia `KMFXBridge.mq5` a:
   ```
   %AppData%\MetaQuotes\Terminal\[ID_TERMINAL]\MQL5\Experts\
   ```
   (Desde MT5: File → Open Data Folder → MQL5 → Experts)
2. Abre MetaEditor (F4 en MT5)
3. Abre el archivo y compila con **F7**
4. Vuelve a MT5, en el Navigator busca "KMFXBridge"
5. Arrastra el EA a cualquier chart (ej. EURUSD H1)
6. En el diálogo: marca "Allow DLL imports" → OK
7. Verifica que aparece una cara sonriente en la esquina del chart

### 5. Arrancar el bridge
```
Doble-click en: LAUNCH_BRIDGE.bat
```
O manualmente:
```bash
python kmfx_bridge.py
```
Verás:
```
✅ Conectado a MT5 — Cuenta: 12345678 | Balance: 100,000.00
🚀 WebSocket server en ws://localhost:8765
```

### 6. Abrir el dashboard
Abre `kmfx_dashboard_live.html` en tu navegador.
Se conectará automáticamente. Verás "Conectado" en verde.

---

## Instalación macOS / Linux

```bash
# Instalar dependencias (MT5 solo disponible en Windows/Wine)
pip3 install websockets

# Arrancar bridge (modo demo en macOS/Linux)
bash launch_bridge.sh
```

**Nota:** MetaTrader5 Python API solo funciona en Windows.
En macOS/Linux el bridge arranca en **modo demo** con datos simulados.

---

## Flujo de datos

| Fuente | Dato | Frecuencia |
|--------|------|-----------|
| MT5 Python API | Account info, equity, balance | Cada 1s |
| MT5 Python API | Posiciones abiertas | Cada 1s |
| MT5 Python API | Órdenes pendientes | Cada 1s |
| MT5 Python API | Precios bid/ask | Cada 1s |
| EA MQL5 | Deals históricos | Cada 5min |
| EA MQL5 | Confirmación de nuevo trade | Inmediato (OnTrade) |

---

## Seguridad para cuentas de fondeo

✅ El bridge corre en **localhost** — tu IP no se comparte  
✅ El EA es **solo lectura** — no ejecuta órdenes  
✅ No hay servidor externo — todo en tu máquina  
✅ Sin VPN compartida — conexión nativa de MT5  
✅ Múltiples cuentas seguras — una instancia del bridge por cuenta  

---

## Solución de problemas

**"No se puede conectar al bridge"**
- Verifica que `kmfx_bridge.py` está corriendo
- El firewall de Windows puede bloquear el puerto 8765
- Prueba desactivando el firewall temporalmente para verificar

**"MT5 no disponible"**
- MT5 debe estar abierto y logueado antes de arrancar el bridge
- Verifica que Python puede ver MT5: `python -c "import MetaTrader5 as mt5; print(mt5.initialize())"`

**"El EA no envía datos"**
- Verifica que el EA tiene cara sonriente (no triste) en el chart
- Revisa Tools → Options → Expert Advisors → URL permitidas
- Presiona F (tecla) en el chart con el EA para forzar sincronización

**"Datos desactualizados"**
- El bridge actualiza cada 1 segundo. Si hay lag, revisa la consola del bridge
- Reinicia el EA desde el chart (quitar y volver a poner)

---

## Archivos del paquete

```
kmfx-bridge/
├── kmfx_bridge.py           # Servidor principal Python
├── kmfx_http_receiver.py    # Receptor HTTP para el EA MQL5
├── KMFXBridge.mq5           # Expert Advisor para MetaTrader 5
├── kmfx_dashboard_live.html # Dashboard en tiempo real
├── INSTALL.bat              # Instalador Windows
├── LAUNCH_BRIDGE.bat        # Lanzador Windows
├── launch_bridge.sh         # Lanzador macOS/Linux
└── README.md                # Este archivo
```
