"""
KMFX Edge — HTTP Receiver for MQL5 EA
======================================
El EA de MT5 no puede conectarse directamente a WebSocket,
así que usa HTTP POST. Este módulo:
  1. Recibe los datos del EA via HTTP POST en /mt5data
  2. Los reenvía a todos los clientes WebSocket conectados

Este archivo se importa por kmfx_bridge.py automáticamente.
No necesitas ejecutarlo por separado.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
import threading

log = logging.getLogger("kmfx_http")

# Referencia al broadcast de websockets (se inyecta desde kmfx_bridge.py)
_broadcast_fn = None
_last_ea_data = {}

HTTP_PORT = 8766  # Puerto para recibir del EA


def set_broadcast(fn):
    """Inyecta la función de broadcast de WebSocket."""
    global _broadcast_fn
    _broadcast_fn = fn


def get_last_ea_data() -> dict:
    """Retorna el último payload recibido del EA."""
    return _last_ea_data


class EAHandler(BaseHTTPRequestHandler):

    def do_POST(self):
        global _last_ea_data
        if self.path != "/mt5data":
            self.send_response(404)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        try:
            data = json.loads(body.decode("utf-8"))
            data["source"] = "ea"
            data["received_at"] = datetime.now(tz=timezone.utc).isoformat()
            _last_ea_data = data

            # Reenviar a clientes WebSocket si hay alguno conectado
            if _broadcast_fn:
                asyncio.run_coroutine_threadsafe(
                    _broadcast_fn(json.dumps(data)),
                    asyncio.get_event_loop()
                )

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')

        except json.JSONDecodeError as e:
            log.error(f"JSON inválido del EA: {e}")
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'{"status":"error","msg":"invalid json"}')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        # Suprimir logs de cada request para no ensuciar la consola
        pass


def start_http_server():
    """Arranca el servidor HTTP en un hilo separado."""
    server = HTTPServer(("localhost", HTTP_PORT), EAHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    log.info(f"📡 HTTP receiver para EA en http://localhost:{HTTP_PORT}/mt5data")
    return server
