#!/bin/bash

# ══════════════════════════════════════════════════════════
#  KMFX Edge — Script de arranque
#  Carpeta base: ~/Desktop/KMFX\ Edge/
# ══════════════════════════════════════════════════════════

KMFX_DIR="$HOME/Desktop/KMFX Edge"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         KMFX Edge — Arranque             ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "📁 Carpeta: $KMFX_DIR"
echo ""

# ── 1. Verificar que la carpeta existe ─────────
if [ ! -d "$KMFX_DIR" ]; then
    echo "❌ No se encuentra la carpeta: $KMFX_DIR"
    echo "   Asegúrate de que la carpeta 'KMFX Edge' está en el Escritorio"
    exit 1
fi

# ── 2. Matar procesos anteriores ───────────────
echo "⏹  Parando procesos anteriores (graceful)..."
# 1. SIGTERM al bridge primero — da tiempo a MT5 de recibir respuesta limpia
pkill -TERM -f "kmfx_bridge_mac.py" 2>/dev/null
sleep 1.5                          # MT5 tiene 1.5s para completar el POST en curso
# 2. Forzar todo lo que quede
lsof -ti:3000,8765,8766 | xargs kill -9 2>/dev/null
pkill -9 -f "kmfx_bridge_mac.py" 2>/dev/null
pkill cloudflared 2>/dev/null
pkill caffeinate 2>/dev/null
sleep 1
echo "✅ Limpio"
echo ""

# ── 3. Evitar suspensión ───────────────────────
caffeinate -s &
echo "☕ caffeinate activo (Mac no se dormirá)"

# ── 4. HTTP server desde la carpeta KMFX Edge ──
cd "$KMFX_DIR"
python3 -m http.server 3000 --bind 0.0.0.0 > /tmp/kmfx_http.log 2>&1 &
HTTP_PID=$!
sleep 1
if lsof -ti:3000 > /dev/null 2>&1; then
    echo "✅ HTTP server activo (puerto 3000)"
else
    echo "❌ HTTP server falló — revisa /tmp/kmfx_http.log"
fi

# ── 5. Bridge WebSocket ────────────────────────
python3 "$KMFX_DIR/kmfx_bridge_mac.py" > /tmp/kmfx_bridge.log 2>&1 &
BRIDGE_PID=$!
sleep 2
if lsof -ti:8765 > /dev/null 2>&1; then
    echo "✅ Bridge activo (puerto 8765)"
else
    echo "❌ Bridge falló — revisa /tmp/kmfx_bridge.log"
fi

# ── 6. Túneles Cloudflare ──────────────────────
echo ""
echo "🌐 Abriendo túneles Cloudflare..."
osascript -e 'tell application "Terminal"
    do script "echo \"🖥️  Túnel DASHBOARD\"; cloudflared tunnel --config ~/.cloudflared/config.yml run"
    set bounds of front window to {50, 50, 800, 400}
end tell'

sleep 1

osascript -e 'tell application "Terminal"
    do script "echo \"🔌 Túnel WEBSOCKET\"; cloudflared tunnel --config ~/.cloudflared/config-ws.yml run"
    set bounds of front window to {50, 420, 800, 770}
end tell'

sleep 4

# ── 7. Verificación final ──────────────────────
echo ""
echo "🔍 Verificando servicios..."

HTTP_OK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/kmfx-edge.html 2>/dev/null)
if [ "$HTTP_OK" = "200" ]; then
    echo "✅ Dashboard HTTP:  OK (200)"
else
    echo "⚠️  Dashboard HTTP:  $HTTP_OK"
fi

WS_PORT=$(lsof -ti:8765 2>/dev/null | wc -l | tr -d ' ')
if [ "$WS_PORT" -gt "0" ]; then
    echo "✅ Bridge WS:       OK (puerto 8765)"
else
    echo "❌ Bridge WS:       no responde"
fi

LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "192.168.1.227")

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅ KMFX Edge activo                     ║"
echo "╠══════════════════════════════════════════╣"
echo "║  🖥️  Mac:     http://localhost:3000/      ║"
echo "║             kmfx-edge.html               ║"
echo "║  📡 Red:     http://$LOCAL_IP:3000/  ║"
echo "║             kmfx-edge.html               ║"
echo "║  📱 iPhone:  https://dashboard.           ║"
echo "║             kmfxedge.com/kmfx-edge.html  ║"
echo "║  🔌 WS:      wss://ws.kmfxedge.com       ║"
echo "╠══════════════════════════════════════════╣"
echo "║  Para parar: pkill cloudflared &&         ║"
echo "║  lsof -ti:3000,8765,8766|xargs kill -9   ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "📋 Logs en tiempo real:"
echo "   Bridge:  tail -f /tmp/kmfx_bridge.log"
echo "   HTTP:    tail -f /tmp/kmfx_http.log"
echo ""
