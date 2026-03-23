#!/usr/bin/env python3
"""
KMFX Edge — Bridge para Mac  (multi-cuenta)
=============================================
Uso:
    python3 kmfx_bridge_mac.py                       # puertos por defecto: WS=8765, HTTP=8766
    python3 kmfx_bridge_mac.py --ws-port 8767 --http-port 8768   # segunda cuenta
    python3 kmfx_bridge_mac.py --ws-port 8769 --http-port 8770   # tercera cuenta

Arquitectura:
    MT5 (Windows/VPS)
        │ HTTP POST → kmfx_bridge_mac.py (Mac) → ws://localhost:PUERTO_WS
    KMFXBridge.mq5                                          │
                                                  kmfx-edge.html (Chrome)
"""

import argparse
import asyncio
import json
import logging
import sys
import http
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Set

# ── Intentar importar websockets ───────────────────────────────────────────
try:
    import websockets
    HAS_WS = True
except ImportError:
    HAS_WS = False

# ── Args ────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="KMFX Edge Bridge — Mac")
parser.add_argument("--ws-port",   type=int, default=8765, help="Puerto WebSocket para el dashboard (default: 8765)")
parser.add_argument("--http-port", type=int, default=8766, help="Puerto HTTP para el EA de MT5 (default: 8766)")
args = parser.parse_args()

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(f"kmfx_bridge_{args.ws_port}.log", encoding="utf-8"),
    ],
)
log = logging.getLogger("kmfx_mac")

# ── Config ─────────────────────────────────────────────────────────────────
WS_HOST      = "0.0.0.0"
WS_PORT      = args.ws_port
HTTP_PORT    = args.http_port
DEMO_INTERVAL = 2.0   # segundos entre ticks demo si no hay EA conectado

# ── Estado global ──────────────────────────────────────────────────────────
connected_clients: Set = set()
last_ea_payload: dict  = {}
ea_last_seen: float    = 0.0
ws_loop                = None   # referencia al event loop de asyncio
_equity_history: list  = []     # historial de equity para la curva de capital
_equity_rebuilt: bool  = False  # flag: ya reconstruimos desde trades
_cached_trades:  list  = []     # último batch real de trades — nunca se pisa con []

# ── Risk config global ────────────────────────────────────────────────────
_risk_config: dict = {
    "enabled":       True,
    "max_dd_pct":    10.0,    # % drawdown total máximo
    "daily_dd_pct":  5.0,     # % drawdown diario máximo
    "risk_per_trade":1.0,     # % riesgo por trade
    "max_lot":       0.5,     # lotes máximos por trade
    "hour_from":     7,       # hora UTC inicio permitida
    "hour_to":       20,      # hora UTC fin permitida
    "symbols":       "GBPUSD,EURUSD,USDCAD,AUDUSD,EURGBP",
    "auto_block":    True,    # bloquear automáticamente al tocar DD
    "blocked":       False,   # estado actual de bloqueo
    "blocked_reason":"",      # motivo del bloqueo
    "daily_loss":    0.0,     # pérdida acumulada hoy (calculada por el bridge)
    "daily_loss_reset": "",   # fecha del último reset diario
}
_daily_pnl_by_date: dict = {}  # {"2026-03-12": -150.0}

def _risk_config_path() -> pathlib.Path:
    return pathlib.Path(f"kmfx_risk_{WS_PORT}.json")

def _load_risk_config():
    global _risk_config
    p = _risk_config_path()
    if p.exists():
        try:
            saved = json.loads(p.read_text())
            _risk_config.update(saved)
            log.info(f"🛡️  Risk config cargada desde disco")
        except Exception as e:
            log.warning(f"No se pudo leer risk config: {e}")

def _save_risk_config():
    try:
        _risk_config_path().write_text(json.dumps(_risk_config, indent=2))
    except Exception as e:
        log.warning(f"No se pudo guardar risk config: {e}")

def _update_daily_pnl(trades: list):
    """Calcula la pérdida neta del día de hoy desde trades cerrados."""
    global _risk_config
    today = datetime.now().strftime("%Y-%m-%d")
    daily = 0.0
    for t in trades:
        ct = t.get("close_time", 0)
        try:
            if isinstance(ct, (int, float)) and ct > 1e9:
                dt = datetime.utcfromtimestamp(ct)
            else:
                dt = datetime.fromisoformat(str(ct).replace("Z","+00:00"))
            if dt.strftime("%Y-%m-%d") == today:
                daily += float(t.get("profit", 0))
        except:
            pass
    _risk_config["daily_loss"] = round(daily, 2)
    _risk_config["daily_loss_reset"] = today

def _check_auto_block(balance: float):
    """Verifica si se deben activar bloqueos automáticos."""
    global _risk_config
    if not _risk_config.get("auto_block") or not _risk_config.get("enabled"):
        return
    if _risk_config.get("blocked"):
        return  # ya bloqueado
    
    daily_loss = _risk_config.get("daily_loss", 0.0)
    daily_dd_usd = balance * _risk_config.get("daily_dd_pct", 5.0) / 100
    max_dd_usd   = balance * _risk_config.get("max_dd_pct", 10.0) / 100
    
    reason = ""
    if daily_loss < 0 and abs(daily_loss) >= daily_dd_usd:
        reason = f"DD diario alcanzado: ${abs(daily_loss):.2f} >= ${daily_dd_usd:.2f}"
    
    if reason:
        _risk_config["blocked"] = True
        _risk_config["blocked_reason"] = reason
        _save_risk_config()
        log.warning(f"🔴 EA BLOQUEADO: {reason}")
        # Notificar a todos los clientes WS
        if ws_loop and connected_clients:
            alert = json.dumps({"type": "risk_alert", "blocked": True, "reason": reason})
            asyncio.run_coroutine_threadsafe(broadcast(alert), ws_loop)


# ── Persistencia equity_history en disco ───────────────────────────────────
import os, pathlib

def _eq_cache_path() -> pathlib.Path:
    """Archivo donde guardamos equity_history entre reinicios."""
    return pathlib.Path(f"kmfx_equity_{WS_PORT}.json")

def _load_equity_cache():
    """Carga equity_history guardado en disco al arrancar."""
    global _equity_history
    p = _eq_cache_path()
    if p.exists():
        try:
            data = json.loads(p.read_text())
            if isinstance(data, list):
                _equity_history = data[-2000:]  # máximo 2000 puntos
                log.info(f"📂 Equity history cargado desde disco: {len(_equity_history)} puntos")
        except Exception as e:
            log.warning(f"No se pudo leer equity cache: {e}")

def _save_equity_cache():
    """Guarda equity_history en disco (llamado tras cada actualización)."""
    try:
        _eq_cache_path().write_text(json.dumps(_equity_history[-2000:]))
    except Exception:
        pass

def _rebuild_equity_from_trades(trades: list, initial_balance: float) -> list:
    """
    Reconstruye curva de equity desde trades cerrados ordenados por fecha.
    Cada punto = balance acumulado tras cada trade cerrado.
    """
    # Solo trades con ticket único + close_time (evita DEAL_ENTRY_IN duplicados)
    closed = [
        t for t in trades
        if t.get("close_time")
        and t.get("profit") is not None
        and t.get("ticket")
    ]
    if not closed:
        return []

    # Ordenar por close_time
    def to_ms(t):
        ct = t.get("close_time", 0)
        return int(ct) * 1000 if isinstance(ct, (int, float)) and ct < 1e12 else int(ct)

    closed_sorted = sorted(closed, key=to_ms)

    # Balance inicial = balance_actual - sum(profits de trades válidos)
    total_profit = sum(float(t.get("profit", 0)) for t in closed_sorted)
    start_balance = initial_balance - total_profit

    curve = []
    running = start_balance
    for t in closed_sorted:
        running += float(t.get("profit", 0))
        curve.append({"t": to_ms(t), "v": round(running, 2)})

    return curve

#  HTTP — recibe datos del EA MQL5
# ══════════════════════════════════════════════════════════════════════════

class EAHandler(BaseHTTPRequestHandler):

    def _send(self, data: bytes):
        """Send response bytes, silently ignoring BrokenPipe (EA closed connection early)."""
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass  # EA already closed — normal, not an error

    def do_POST(self):
        global last_ea_payload, ea_last_seen, _equity_history, _equity_rebuilt, _cached_trades
        # ── Guardar config de riesgo desde el dashboard ──
        if self.path in ("/risk_config", "/risk_config/"):
            length = int(self.headers.get("Content-Length", 0))
            body   = self.rfile.read(length)
            try:
                new_cfg = json.loads(body.decode("utf-8"))
                _risk_config.update(new_cfg)
                _save_risk_config()
                log.info(f"🛡️  Risk config actualizada desde dashboard")
                # Notificar a clientes WS
                if ws_loop and connected_clients:
                    asyncio.run_coroutine_threadsafe(
                        broadcast(json.dumps({"type":"risk_config_update","config":_risk_config})),
                        ws_loop
                    )
                resp = json.dumps({"status":"ok","config":_risk_config}).encode()
                self.send_response(200)
                self.send_header("Content-Type","application/json")
                self.send_header("Access-Control-Allow-Origin","*")
                self.end_headers()
                self._send(resp)
            except Exception as e:
                log.error(f"Error guardando risk config: {e}")
                self.send_response(400); self.end_headers()
            return

        if self.path not in ("/mt5data", "/mt5data/"):
            self.send_response(404); self.end_headers(); return

        length = int(self.headers.get("Content-Length", 0))
        body   = self.rfile.read(length)

        try:
            data = json.loads(body.decode("utf-8"))
            data["source"]      = "ea"

            data["received_at"] = _now()
            data["mode"]        = "live"

            # ── Trades: usar caché si el EA envía [] en este tick ──────────
            incoming_trades = data.get("trades", [])
            if incoming_trades:
                # EA v3.1 envía historial completo cada vez → REEMPLAZAR el caché
                # Solo aceptar deals de cierre con ticket único
                clean = [t for t in incoming_trades
                         if t.get("ticket") and t.get("close_time") and t.get("profit") is not None]
                if clean:
                    _cached_trades = clean  # Reemplazar siempre, no acumular
            # Siempre usar el caché acumulado (nunca retroceder a [])
            trades = _cached_trades
            data["trades"] = trades
            # Propagar risk_state del EA al dashboard
            if "risk_state" in data:
                rs = data["risk_state"]
                if rs.get("enabled"):
                    _risk_config["enabled"]       = True
                    _risk_config["max_dd_pct"]    = rs.get("max_dd", _risk_config["max_dd_pct"])
                    _risk_config["daily_dd_pct"]  = rs.get("daily_dd", _risk_config["daily_dd_pct"])
                    _risk_config["risk_per_trade"]= rs.get("risk_trade", _risk_config["risk_per_trade"])
                    _risk_config["max_lot"]       = rs.get("max_lot", _risk_config["max_lot"])
                    _risk_config["hour_from"]     = rs.get("hour_from", _risk_config["hour_from"])
                    _risk_config["hour_to"]       = rs.get("hour_to", _risk_config["hour_to"])
                    _risk_config["auto_block"]    = rs.get("auto_block", _risk_config["auto_block"])
                    _risk_config["blocked"]       = rs.get("blocked", _risk_config["blocked"])
            balance = data.get("account", {}).get("balance", 0)
            if trades and balance:
                data["stats"] = _compute_stats(trades, balance)

            # ── Curva de equity: reconstruir desde trades + puntos live ─
            equity = data.get("account", {}).get("equity")

            # Primera vez que recibimos trades: reconstruir curva histórica
            if trades and balance and not _equity_rebuilt:
                rebuilt = _rebuild_equity_from_trades(trades, balance)
                if rebuilt:
                    # Fusionar: puntos reconstruidos + puntos live acumulados
                    existing_ts = {p["t"] for p in _equity_history}
                    merged = rebuilt + [p for p in _equity_history if p["t"] not in {r["t"] for r in rebuilt}]
                    merged.sort(key=lambda p: p["t"])
                    _equity_history.clear()
                    _equity_history.extend(merged[-2000:])
                    log.info(f"📈 Equity history reconstruido desde trades: {len(_equity_history)} puntos")
                    _save_equity_cache()
                _equity_rebuilt = True

            # Añadir punto live actual
            if equity is not None:
                import time as _time
                now_ms = int(_time.time() * 1000)
                # Solo añadir si han pasado al menos 5 segundos del último punto
                if not _equity_history or now_ms - _equity_history[-1]["t"] > 5000:
                    _equity_history.append({"t": now_ms, "v": equity})
                    if len(_equity_history) > 2000:
                        _equity_history.pop(0)
                    # Guardar en disco cada 10 puntos nuevos
                    if len(_equity_history) % 10 == 0:
                        _save_equity_cache()

            data["equity_history"] = list(_equity_history)

            # ── Risk: calcular PnL diario y verificar bloqueos ──
            if trades and balance:
                _update_daily_pnl(trades)
                _check_auto_block(balance)
            # Añadir estado de riesgo al payload para el dashboard
            data["risk_status"] = {
                "blocked":        _risk_config.get("blocked", False),
                "blocked_reason": _risk_config.get("blocked_reason", ""),
                "daily_loss":     _risk_config.get("daily_loss", 0.0),
                "config":         _risk_config,
            }

            last_ea_payload = data
            import time; ea_last_seen = time.time()

            # Reenviar a todos los clientes WS
            if ws_loop and connected_clients:
                asyncio.run_coroutine_threadsafe(
                    broadcast(json.dumps(data)), ws_loop
                )

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self._send(b'{"status":"ok"}')
            # ── Log estructurado ──────────────────────────────────────────
            n_trades = len(_cached_trades)
            n_pos    = len(data.get("positions", []))
            eq       = data.get("account", {}).get("equity", 0)
            risk_st  = data.get("risk_state", {})
            risk_on  = risk_st.get("enabled", False)
            blocked  = risk_st.get("blocked", False)
            risk_str = ""
            if risk_on:
                risk_str = f" | 🛡️  Risk: {'🔴 BLOQUEADO' if blocked else 'OK'} DD={risk_st.get('max_dd',10)}%"
            log.info(
                f"📊 EA v{data.get('ea_version','?')} | "
                f"bal={balance} | eq={eq:.2f} | "
                f"trades={n_trades} | pos={n_pos}"
                f"{risk_str}"
            )
        except json.JSONDecodeError as e:
            log.error(f"JSON inválido del EA: {e}")
            self.send_response(400); self.end_headers()
            self._send(b'{"status":"error"}')

    def do_GET(self):
        """El EA descarga la config de riesgo en cada tick."""
        if self.path in ("/risk_config", "/risk_config/"):
            payload = json.dumps(_risk_config).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self._send(payload)
        elif self.path in ("/health", "/health/"):
            self.send_response(200); self.end_headers()
            self._send(b"OK")

        elif self.path in ("/debug", "/debug/"):
            import time as _t
            from collections import defaultdict
            import datetime as _dt
            acc    = last_ea_payload.get("account", {}) if last_ea_payload else {}
            trades = _cached_trades or []
            pos    = last_ea_payload.get("positions", []) if last_ea_payload else []
            risk   = last_ea_payload.get("risk_state", {}) if last_ea_payload else {}

            sum_profit = round(sum(t.get("profit", 0) for t in trades), 2)
            sum_gross  = round(sum(t.get("gross_profit", 0) for t in trades), 2)
            sum_comm   = round(sum(t.get("commission", 0) for t in trades), 2)
            sum_swap   = round(sum(t.get("swap", 0) for t in trades), 2)
            wins       = [t for t in trades if t.get("profit", 0) > 0]
            losses     = [t for t in trades if t.get("profit", 0) < 0]

            by_month = defaultdict(lambda: {"n": 0, "profit": 0.0})
            for t in trades:
                ct = t.get("close_time", 0)
                try:
                    d = _dt.datetime.fromtimestamp(int(ct))
                    k = f"{d.year}-{d.month:02d}"
                    by_month[k]["n"]      += 1
                    by_month[k]["profit"] += t.get("profit", 0)
                except:
                    pass

            balance  = acc.get("balance", 0)
            deposit  = acc.get("initial_deposit", 0)
            net_pnl  = round(balance - deposit, 2) if deposit else None
            ea_ver   = last_ea_payload.get("ea_version", "?") if last_ea_payload else "?"
            lag_s    = round(_t.time() - ea_last_seen, 1) if ea_last_seen else None

            debug = {
                "meta": {
                    "ea_version":  ea_ver,
                    "last_seen_s": lag_s,
                    "bridge_trades": len(trades),
                    "ts": _now(),
                },
                "account_raw": {
                    "login":           acc.get("login"),
                    "broker":          acc.get("broker"),
                    "balance":         acc.get("balance"),
                    "equity":          acc.get("equity"),
                    "profit":          acc.get("profit"),
                    "margin":          acc.get("margin"),
                    "free_margin":     acc.get("free_margin"),
                    "leverage":        acc.get("leverage"),
                    "currency":        acc.get("currency"),
                    "initial_deposit": acc.get("initial_deposit"),
                },
                "trades_summary": {
                    "count":        len(trades),
                    "wins":         len(wins),
                    "losses":       len(losses),
                    "win_rate_pct": round(len(wins) / len(trades) * 100, 2) if trades else 0,
                    "sum_profit":   sum_profit,
                    "sum_gross":    sum_gross,
                    "sum_comm":     sum_comm,
                    "sum_swap":     sum_swap,
                    "net_pnl_from_balance":   net_pnl,
                    "diff_trades_vs_balance": round(sum_profit - net_pnl, 2) if net_pnl else None,
                },
                "monthly_breakdown": dict(sorted(
                    {k: {"n": v["n"], "profit": round(v["profit"], 2)}
                     for k, v in by_month.items()}.items()
                )),
                "open_positions": pos,
                "risk_state":     risk,
                "risk_config":    _risk_config,
                "sample_trades":  trades[:5],
            }

            payload = json.dumps(debug, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self._send(payload)
            log.info("🔍 /debug requested — trades=%d balance=%s", len(trades), balance)

        else:
            self.send_response(404); self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, fmt, *args):
        pass  # silenciar logs de cada request


def start_http_server():
    """Arranca el servidor HTTP en un hilo daemon."""
    server = HTTPServer(("0.0.0.0", HTTP_PORT), EAHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    log.info(f"📡 HTTP receiver para EA: http://localhost:{HTTP_PORT}/mt5data")
    log.info(f"   (Si MT5 está en otro equipo, usa la IP de tu Mac: http://TU_IP:{HTTP_PORT}/mt5data)")
    return server


# ══════════════════════════════════════════════════════════════════════════
#  DEMO DATA — cuando no hay EA conectado
# ══════════════════════════════════════════════════════════════════════════

import random, time as _time

def _now():
    return datetime.now(tz=timezone.utc).isoformat()

_demo_base_balance = 108420.0
_demo_tick         = 0

def build_demo_snapshot() -> dict:
    global _demo_tick
    _demo_tick += 1
    fluct     = random.uniform(-80, 80)
    balance   = _demo_base_balance
    equity    = round(balance + fluct, 2)
    profit    = round(fluct, 2)
    positions = []
    if _demo_tick % 4 != 0:  # ~75% del tiempo hay posición demo
        curr = round(1.27120 + random.uniform(-0.0015, 0.0030), 5)
        pos_profit = round((curr - 1.27120) * 50000, 2)
        positions = [{
            "ticket":     98765432,
            "symbol":     "GBPUSD",
            "type":       "BUY",
            "volume":     0.50,
            "open_price": 1.27120,
            "current":    curr,
            "sl":         1.27020,
            "tp":         1.27420,
            "profit":     pos_profit,
            "swap":       -0.50,
            "open_time":  "2024-02-14T09:45:00+00:00",
            "comment":    "KMFX Asian Breakout",
            "magic":      20240214,
        }]

    prices = {
        "GBPUSD": {"bid": round(1.27120 + random.uniform(-0.0003, 0.0003), 5), "ask": 0, "spread": 1.2},
        "EURUSD": {"bid": round(1.08450 + random.uniform(-0.0002, 0.0002), 5), "ask": 0, "spread": 0.9},
        "USDCAD": {"bid": round(1.34210 + random.uniform(-0.0002, 0.0002), 5), "ask": 0, "spread": 1.5},
        "AUDUSD": {"bid": round(0.64850 + random.uniform(-0.0002, 0.0002), 5), "ask": 0, "spread": 1.3},
    }
    for s in prices:
        prices[s]["ask"] = round(prices[s]["bid"] + 0.00012, 5)

    deals = _demo_deals()

    return {
        "type":      "snapshot",
        "mode":      "demo",
        "timestamp": _now(),
        "account": {
            "login":       12345678,
            "name":        "Kevin C.",
            "broker":      "DEMO — Conecta MT5 para datos reales",
            "server":      "DemoServer",
            "balance":     balance,
            "equity":      equity,
            "margin":      1240.00,
            "free_margin": round(equity - 1240, 2),
            "margin_level": round(equity / 1240 * 100, 2),
            "profit":      profit,
            "currency":    "USD",
            "leverage":    100,
            "type":        "demo",
        },
        "positions": positions,
        "orders":    [],
        "trades":    deals,
        "stats":     _compute_stats(deals, balance),
        "prices":    prices,
    }

def _demo_deals():
    random.seed(42)
    symbols = ["GBPUSD","EURUSD","USDCAD","AUDUSD"]
    deals   = []
    for i in range(38):
        sym    = random.choice(symbols)
        profit = random.choice([
            random.uniform(80, 180),
            random.uniform(80, 160),
            random.uniform(-50, -15),
        ])
        deals.append({
            "position_id": 9000000 + i,
            "symbol":      sym,
            "type":        random.choice(["BUY","SELL"]),
            "volume":      random.choice([0.20, 0.30, 0.50]),
            "open_price":  round(random.uniform(1.0, 1.5), 5),
            "close_price": round(random.uniform(1.0, 1.5), 5),
            "profit":      round(profit, 2),
            "open_time":   f"2024-02-{random.randint(1,20):02d}T{random.randint(7,16):02d}:00:00+00:00",
            "close_time":  f"2024-02-{random.randint(1,20):02d}T{random.randint(10,18):02d}:00:00+00:00",
            "status":      "CLOSED",
            "comment":     "KMFX Demo",
            "magic":       20240200 + i,
        })
    random.seed()
    return deals

def _compute_stats(trades, balance):
    # Solo trades cerrados con ticket único y close_time (evita DEAL_ENTRY_IN del EA viejo)
    closed = [
        t for t in trades
        if t.get("profit") is not None
        and t.get("ticket")          # requiere ticket numérico
        and t.get("close_time")      # requiere tiempo de cierre
        and t.get("status","").upper() in ("CLOSED", "CLOSE", "", "DEAL", "HISTORY")
    ]
    # Fallback solo si no hay ninguno con ticket (EA muy viejo)
    if not closed:
        closed = [t for t in trades if t.get("profit") is not None and t.get("close_time")]
    if not closed: return {}

    profits  = [float(t.get("profit", 0)) for t in closed]
    profits  = [p for p in profits if p != 0]
    if not profits: return {}
    
    winners  = [p for p in profits if p > 0]
    losers   = [p for p in profits if p < 0]
    total    = len(profits)
    win_rate = len(winners) / total * 100 if total else 0
    avg_win  = sum(winners) / len(winners) if winners else 0
    avg_loss = abs(sum(losers) / len(losers)) if losers else 0
    pf       = sum(winners) / abs(sum(losers)) if losers and sum(winners) > 0 else 0
    
    # Max drawdown correcto (peak-to-valley sobre curva acumulada)
    cumulative = 0
    peak = 0
    max_dd = 0
    for p in profits:
        cumulative += p
        if cumulative > peak:
            peak = cumulative
        dd = peak - cumulative
        if dd > max_dd:
            max_dd = dd
    
    total_pnl = sum(profits)
    
    return {
        "total_trades":      total,
        "winners":           len(winners),
        "losers":            len(losers),
        "win_rate":          round(win_rate, 2),
        "total_pnl":         round(total_pnl, 2),
        "avg_win":           round(avg_win, 2),
        "avg_loss":          round(avg_loss, 2),
        "profit_factor":     round(pf, 2),
        "max_drawdown_usd":  round(max_dd, 2),
        "max_drawdown_pct":  round(max_dd / balance * 100, 2) if balance else 0,
        "expectancy_r":      round((win_rate/100) * (avg_win / avg_loss) - (1 - win_rate/100), 3) if avg_loss else 0,
        "rrr":               round(avg_win / avg_loss, 2) if avg_loss else 0,
    }


# ══════════════════════════════════════════════════════════════════════════
#  WEBSOCKET — servidor
# ══════════════════════════════════════════════════════════════════════════

async def broadcast(message: str):
    global connected_clients
    if not connected_clients: return
    dead = set()
    for ws in connected_clients.copy():
        try:
            await ws.send(message)
        except Exception:
            dead.add(ws)
    connected_clients -= dead


async def handle_client(websocket):
    global connected_clients
    addr = websocket.remote_address
    log.info(f"🔌 Cliente conectado: {addr}")
    connected_clients.add(websocket)

    try:
        # Enviar snapshot inicial
        if last_ea_payload:
            await websocket.send(json.dumps(last_ea_payload))
        else:
            snap = build_demo_snapshot()
            await websocket.send(json.dumps(snap))

        async for raw in websocket:
            try:
                msg = json.loads(raw)
                cmd = msg.get("cmd", "")
                if cmd == "ping":
                    await websocket.send(json.dumps({"type":"pong","timestamp":_now()}))
                elif cmd == "get_snapshot":
                    payload = last_ea_payload if last_ea_payload else build_demo_snapshot()
                    await websocket.send(json.dumps(payload))
            except json.JSONDecodeError:
                pass
    except Exception as e:
        log.debug(f"Cliente: {e}")
    finally:
        connected_clients.discard(websocket)
        log.info(f"🔌 Cliente desconectado: {addr}")


async def demo_tick_loop():
    """Envía ticks demo SOLO cuando no hay EA conectado Y el modo demo está activado."""
    while True:
        await asyncio.sleep(DEMO_INTERVAL)
        if not connected_clients: continue
        import time as _t
        # Si el EA envió datos en los últimos 30s, no enviar demo nunca
        if ea_last_seen and (_t.time() - ea_last_seen) < 30:
            continue
        # Si el EA ya conectó alguna vez, no activar demo al desconectarse
        # (preserva los últimos datos reales en lugar de sobreescribir con ficticios)
        if ea_last_seen > 0:
            continue
        # Solo demo si NUNCA ha habido conexión real (primera vez abriendo el dashboard)
        snap = build_demo_snapshot()
        snap["type"] = "update"
        await broadcast(json.dumps(snap))


async def process_request(connection, request):
    """Responde 200 OK a health checks HTTP de Cloudflare (websockets v16)."""
    if request.headers.get("upgrade", "").lower() != "websocket":
        response = connection.respond(http.HTTPStatus.OK, "OK\n")
        return response
    return None


async def main():
    global ws_loop
    ws_loop = asyncio.get_running_loop()

    _load_equity_cache()
    _load_risk_config()

    log.info("=" * 58)
    log.info(f"  KMFX Edge — Bridge para Mac (Puerto WS:{WS_PORT})")
    log.info("=" * 58)

    if not HAS_WS:
        log.error("❌ 'websockets' no instalado.")
        log.error("   Ejecuta: pip3 install websockets")
        sys.exit(1)

    start_http_server()

    log.info(f"🚀 WebSocket dashboard: ws://{WS_HOST}:{WS_PORT}")
    log.info(f"📡 HTTP receptor EA:    http://0.0.0.0:{HTTP_PORT}/mt5data")
    log.info(f"")
    log.info(f"   → En el dashboard, añade: ws://localhost:{WS_PORT}")
    log.info(f"   → En el EA de MT5, pon:   http://TU_IP_MAC:{HTTP_PORT}/mt5data")
    log.info(f"   → Ctrl+C para detener")
    log.info("=" * 58)

    async with websockets.serve(handle_client, WS_HOST, WS_PORT, process_request=process_request):
        await asyncio.gather(
            asyncio.Future(),
            demo_tick_loop(),
        )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("🛑 Bridge detenido — MT5 recibirá error de conexión en próximo tick")
    except Exception as e:
        log.error(f"❌ Error fatal: {e}")
