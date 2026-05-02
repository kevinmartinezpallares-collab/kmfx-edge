"""
KMFX Edge — MT5 Bridge Server
==============================
Conecta MetaTrader 5 con el dashboard via WebSocket local.
Tu IP nunca sale del dispositivo. Solo lectura de datos.

Requisitos:
    pip install MetaTrader5 websockets asyncio

Uso:
    python kmfx_bridge.py

El servidor escucha en ws://localhost:8765
"""

import asyncio
import json
import logging
import sys
import os
import math
from datetime import datetime, timezone
from typing import Set

from account_service import AccountService
from account_store import JsonFileAccountStore
from risk_orchestrator import RiskOrchestrator
from risk_state_store import JsonFileRiskStateStore

# ── intentar importar dependencias opcionales ──────────────────────────────
try:
    import websockets
    from websockets.server import WebSocketServerProtocol
    HAS_WEBSOCKETS = True
except ImportError:
    HAS_WEBSOCKETS = False

try:
    import MetaTrader5 as mt5
    HAS_MT5 = True
except ImportError:
    HAS_MT5 = False

# ── logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("kmfx_bridge.log", encoding="utf-8"),
    ],
)
log = logging.getLogger("kmfx_bridge")

# ── configuración ──────────────────────────────────────────────────────────
HOST = "localhost"
PORT = 8765
POLL_INTERVAL = 1.0          # segundos entre actualizaciones
MAX_HISTORY_DEALS = 500      # máximo de deals a cargar del historial
RISK_STATE_PATH = os.path.join(os.path.dirname(__file__), ".kmfx-risk-state.json")
ACCOUNTS_STATE_PATH = os.path.join(os.path.dirname(__file__), ".kmfx-accounts.json")
SYMBOL_SPEC_COMMON_CANDIDATES = (
    "EURUSD",
    "GBPUSD",
    "USDJPY",
    "XAUUSD",
    "NAS100",
    "US100",
    "US30",
    "US500",
    "SPX500",
)
risk_orchestrator = RiskOrchestrator(
    state_store=JsonFileRiskStateStore(RISK_STATE_PATH)
)
account_service = AccountService(
    JsonFileAccountStore(ACCOUNTS_STATE_PATH)
)

# ── estado global ──────────────────────────────────────────────────────────
connected_clients: Set = set()
last_account_info = {}
last_positions = []
last_orders = []
last_deals = []


# ══════════════════════════════════════════════════════════════════════════
#  MT5 — funciones de lectura
# ══════════════════════════════════════════════════════════════════════════

def mt5_connect() -> bool:
    """Inicializa conexión con MT5."""
    if not HAS_MT5:
        log.warning("MetaTrader5 no instalado. Usando datos simulados.")
        return False
    if not mt5.initialize():
        log.error(f"MT5 initialize() falló: {mt5.last_error()}")
        return False
    info = mt5.account_info()
    if info is None:
        log.error("No se pudo obtener account_info. ¿MT5 está abierto y logueado?")
        return False
    log.info(f"✅ Conectado a MT5 — Cuenta: {info.login} | Broker: {info.company} | Balance: {info.balance:.2f}")
    return True


def get_account_info() -> dict:
    """Lee información de la cuenta."""
    if not HAS_MT5:
        return _mock_account()
    info = mt5.account_info()
    if info is None:
        return {}
    return {
        "login":        info.login,
        "name":         info.name,
        "broker":       info.company,
        "server":       info.server,
        "balance":      round(info.balance, 2),
        "equity":       round(info.equity, 2),
        "margin":       round(info.margin, 2),
        "free_margin":  round(info.margin_free, 2),
        "margin_level": round(info.margin_level, 2) if info.margin_level else 0,
        "profit":       round(info.profit, 2),
        "currency":     info.currency,
        "leverage":     info.leverage,
        "type":         "real" if info.trade_mode == 0 else "demo",
        "timestamp":    _now(),
    }


def get_open_positions() -> list:
    """Lee posiciones abiertas."""
    if not HAS_MT5:
        return _mock_positions()
    positions = mt5.positions_get()
    if positions is None:
        return []
    result = []
    for p in positions:
        result.append({
            "ticket":      p.ticket,
            "symbol":      p.symbol,
            "type":        "BUY" if p.type == 0 else "SELL",
            "volume":      p.volume,
            "open_price":  p.price_open,
            "current":     p.price_current,
            "sl":          p.sl,
            "tp":          p.tp,
            "profit":      round(p.profit, 2),
            "swap":        round(p.swap, 2),
            "open_time":   datetime.fromtimestamp(p.time, tz=timezone.utc).isoformat(),
            "comment":     p.comment,
            "magic":       p.magic,
        })
    return result


def _estimate_position_risk(position: dict, account_balance: float) -> tuple[float, float]:
    """
    Estima el riesgo usando el SL real y el cálculo de profit del terminal cuando
    está disponible. Si MT5 no puede calcularlo, conserva una salida segura.
    """
    balance = max(float(account_balance or 0.0), 0.0)
    stop_loss = float(position.get("sl") or 0.0)
    open_price = float(position.get("open_price") or 0.0)
    volume = float(position.get("volume") or 0.0)
    side = str(position.get("type") or "").upper()

    if stop_loss <= 0 or open_price <= 0 or volume <= 0:
        return 0.0, 0.0

    risk_amount = 0.0
    if HAS_MT5:
        try:
            order_type = mt5.ORDER_TYPE_BUY if side == "BUY" else mt5.ORDER_TYPE_SELL
            mt5_profit = mt5.order_calc_profit(order_type, position["symbol"], volume, open_price, stop_loss)
            if mt5_profit is not None and math.isfinite(mt5_profit):
                risk_amount = abs(float(mt5_profit))
        except Exception:
            risk_amount = 0.0

    if risk_amount <= 0:
        risk_amount = abs(float(position.get("profit") or 0.0))

    risk_pct = (risk_amount / balance * 100.0) if balance > 0 else 0.0
    return round(max(risk_amount, 0.0), 2), round(max(risk_pct, 0.0), 4)


def _enrich_positions_for_risk_engine(positions: list, account: dict) -> list:
    balance = float(account.get("balance") or 0.0)
    enriched = []
    for position in positions:
        risk_amount, risk_pct = _estimate_position_risk(position, balance)
        enriched.append({
            **position,
            "position_id": position.get("ticket"),
            "price_open": position.get("open_price"),
            "price_current": position.get("current"),
            "time": position.get("open_time"),
            "strategy_tag": position.get("comment") or None,
            "risk_amount": risk_amount,
            "risk_pct": risk_pct,
        })
    return enriched


def build_risk_snapshot(account: dict, positions: list) -> dict:
    try:
        risk_snapshot = risk_orchestrator.sync_mt5_snapshot(
            account,
            _enrich_positions_for_risk_engine(positions, account),
        )
        risk_snapshot["backend_connected"] = True
        risk_snapshot["mt5_connected"] = bool(HAS_MT5)
        risk_snapshot["mode"] = "live" if HAS_MT5 else "demo"
        return risk_snapshot
    except Exception as exc:
        log.exception("No se pudo generar risk_snapshot: %s", exc)
        return {
            "risk_status": "unavailable",
            "trigger": "",
            "blocking_rule": "",
            "action_required": "",
            "remaining_daily_margin_pct": 0.0,
            "remaining_total_margin_pct": 0.0,
            "daily_drawdown_pct": 0.0,
            "max_drawdown_pct": 0.0,
            "total_open_risk_pct": 0.0,
            "effective_correlated_risk": 0.0,
            "volatility_override_active": False,
            "recommended_level": "",
            "current_level": "",
            "panic_lock_active": False,
            "panic_lock_expires_at": "",
            "active_rules": [],
            "mt5_limit_states": {},
            "limits_and_pressure": [],
            "policy_snapshot": {},
            "policy_applied_at": "",
            "policy_source": "backend",
            "policy_dirty": False,
            "ladder_snapshot": {"current_level": "", "recommended_level": "", "volatility_override_active": False, "levels": []},
            "exposure_snapshot": {"open_positions": 0, "total_open_risk_pct": 0.0, "effective_correlated_risk": 0.0, "pressure_label": "", "pressure_tone": "neutral"},
            "last_snapshot_at": _now(),
            "snapshot_stale_after_seconds": 15,
            "backend_connected": False,
            "mt5_connected": bool(HAS_MT5),
            "mode": "live" if HAS_MT5 else "demo",
            "error": str(exc),
        }


def build_account_payload(account: dict, positions: list, deals: list, risk_snapshot: dict) -> dict:
    symbol_specs = build_symbol_specs(positions, deals, account.get("currency", ""))
    return {
        "accountName": account.get("name") or account.get("broker") or "MT5 Account",
        "name": account.get("name") or account.get("broker") or "MT5 Account",
        "broker": account.get("broker") or "MT5",
        "server": account.get("server") or "",
        "environment": account.get("type") or "live",
        "platform": "mt5",
        "mode": "MT5 Live" if HAS_MT5 else "MT5 Demo",
        "balance": account.get("balance", 0.0),
        "equity": account.get("equity", account.get("balance", 0.0)),
        "openPnl": account.get("profit", 0.0),
        "symbolSpecs": symbol_specs,
        "positions": positions,
        "trades": deals,
        "riskProfile": {
            "currentRiskPct": risk_snapshot.get("total_open_risk_pct", 0.0),
            "dailyLossLimitPct": risk_snapshot.get("policy_snapshot", {}).get("daily_dd_limit_pct", 0.0),
            "weeklyHeatLimitPct": risk_snapshot.get("policy_snapshot", {}).get("max_dd_limit_pct", 0.0),
            "maxTradeRiskPct": risk_snapshot.get("policy_snapshot", {}).get("risk_per_trade_pct", 0.0),
            "maxVolume": risk_snapshot.get("policy_snapshot", {}).get("max_volume", 0.0),
            "allowedSessions": risk_snapshot.get("policy_snapshot", {}).get("allowed_sessions", []),
            "allowedSymbols": risk_snapshot.get("policy_snapshot", {}).get("allowed_symbols", []),
            "autoBlock": risk_snapshot.get("policy_snapshot", {}).get("auto_block_enabled", False),
        },
        "riskRules": risk_snapshot.get("active_rules", []),
        "riskSnapshot": risk_snapshot,
    }


def build_accounts_snapshot(account: dict, positions: list, deals: list, risk_snapshot: dict) -> dict:
    try:
        account_payload = build_account_payload(account, positions, deals, risk_snapshot)
        account_service.ingest_account_snapshot(
            user_id="local",
            account_info=account,
            connection_mode="bridge",
            payload=account_payload,
        )
        return account_service.build_accounts_snapshot("local")
    except Exception as exc:
        log.exception("No se pudo actualizar accounts_snapshot: %s", exc)
        return {
            "accounts": [],
            "active_account_id": "",
            "updated_at": _now(),
            "error": str(exc),
        }


def get_pending_orders() -> list:
    """Lee órdenes pendientes."""
    if not HAS_MT5:
        return []
    orders = mt5.orders_get()
    if orders is None:
        return []
    result = []
    type_map = {0:"BUY_LIMIT", 1:"SELL_LIMIT", 2:"BUY_STOP", 3:"SELL_STOP",
                4:"BUY_STOP_LIMIT", 5:"SELL_STOP_LIMIT"}
    for o in orders:
        result.append({
            "ticket":     o.ticket,
            "symbol":     o.symbol,
            "type":       type_map.get(o.type, str(o.type)),
            "volume":     o.volume_current,
            "price":      o.price_open,
            "sl":         o.sl,
            "tp":         o.tp,
            "placed_at":  datetime.fromtimestamp(o.time_setup, tz=timezone.utc).isoformat(),
            "comment":    o.comment,
        })
    return result


def get_deal_history(days_back: int = 30) -> list:
    """Lee historial de operaciones cerradas."""
    if not HAS_MT5:
        return _mock_deals()
    from datetime import timedelta
    date_to   = datetime.now(tz=timezone.utc)
    date_from = date_to - timedelta(days=days_back)
    deals = mt5.history_deals_get(date_from, date_to)
    if deals is None:
        return []
    result = []
    for d in deals:
        # Filtrar solo trades reales (entrada/salida), no balance/crédito
        if d.type not in (0, 1):   # 0=BUY, 1=SELL
            continue
        result.append({
            "ticket":      d.ticket,
            "order":       d.order,
            "position_id": d.position_id,
            "symbol":      d.symbol,
            "type":        "BUY" if d.type == 0 else "SELL",
            "entry":       "IN" if d.entry == 0 else "OUT",
            "volume":      d.volume,
            "price":       d.price,
            "profit":      round(d.profit, 2),
            "commission":  round(d.commission, 2),
            "swap":        round(d.swap, 2),
            "comment":     d.comment,
            "magic":       d.magic,
            "time":        datetime.fromtimestamp(d.time, tz=timezone.utc).isoformat(),
        })
    # Agrupar por position_id para calcular PnL neto
    result = _group_deals_to_trades(result)
    return result[-MAX_HISTORY_DEALS:]


def _group_deals_to_trades(deals: list) -> list:
    """Agrupa deals de entrada/salida en trades completos."""
    from collections import defaultdict
    positions = defaultdict(list)
    for d in deals:
        positions[d["position_id"]].append(d)

    trades = []
    for pos_id, pos_deals in positions.items():
        entries = [d for d in pos_deals if d["entry"] == "IN"]
        exits   = [d for d in pos_deals if d["entry"] == "OUT"]
        if not entries:
            continue

        entry_deal = entries[0]
        total_profit = sum(d["profit"] + d["commission"] + d["swap"] for d in pos_deals)
        exit_price = exits[0]["price"] if exits else None
        close_time = exits[0]["time"] if exits else None

        trades.append({
            "position_id":  pos_id,
            "symbol":       entry_deal["symbol"],
            "type":         entry_deal["type"],
            "volume":       entry_deal["volume"],
            "open_price":   entry_deal["price"],
            "close_price":  exit_price,
            "profit":       round(total_profit, 2),
            "open_time":    entry_deal["time"],
            "close_time":   close_time,
            "status":       "CLOSED" if exits else "OPEN",
            "comment":      entry_deal["comment"],
            "magic":        entry_deal["magic"],
        })
    trades.sort(key=lambda x: x["open_time"], reverse=True)
    return trades


def get_symbol_price(symbol: str) -> dict:
    """Lee precio actual de un símbolo."""
    if not HAS_MT5:
        return {}
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        return {}
    return {
        "symbol": symbol,
        "bid":    tick.bid,
        "ask":    tick.ask,
        "spread": round((tick.ask - tick.bid) * 100000, 1),
        "time":   datetime.fromtimestamp(tick.time, tz=timezone.utc).isoformat(),
    }


def _symbol_info_value(info, name: str, default=None):
    return getattr(info, name, default)


def get_symbol_spec(symbol: str, account_currency: str = "") -> dict:
    """Lee specs de contrato/volumen del símbolo desde MT5 si están disponibles."""
    if not HAS_MT5 or not symbol:
        return None
    info = mt5.symbol_info(symbol)
    if info is None or not getattr(info, "visible", False):
        return None
    point = _symbol_info_value(info, "point", 0.0) or 0.0
    tick_size = _symbol_info_value(info, "trade_tick_size", 0.0) or point
    tick_value = _symbol_info_value(info, "trade_tick_value", 0.0) or 0.0
    if point <= 0 or tick_size <= 0:
        return None
    return {
        "symbol": symbol,
        "digits": _symbol_info_value(info, "digits", 0) or 0,
        "point": point,
        "tickSize": tick_size,
        "tickValue": tick_value,
        "tickValueProfit": _symbol_info_value(info, "trade_tick_value_profit", tick_value) or 0.0,
        "tickValueLoss": _symbol_info_value(info, "trade_tick_value_loss", tick_value) or 0.0,
        "contractSize": _symbol_info_value(info, "trade_contract_size", 0.0) or 0.0,
        "volumeMin": _symbol_info_value(info, "volume_min", 0.0) or 0.0,
        "volumeMax": _symbol_info_value(info, "volume_max", 0.0) or 0.0,
        "volumeStep": _symbol_info_value(info, "volume_step", 0.0) or 0.0,
        "currencyProfit": _symbol_info_value(info, "currency_profit", "") or "",
        "currencyMargin": _symbol_info_value(info, "currency_margin", "") or "",
        "tradeCalcMode": _symbol_info_value(info, "trade_calc_mode", ""),
        "spread": _symbol_info_value(info, "spread", 0) or 0,
        "accountCurrency": account_currency,
    }


def build_symbol_specs(positions: list, deals: list, account_currency: str = "") -> dict:
    if not HAS_MT5:
        return {}
    symbols: list[str] = []
    seen: set[str] = set()

    def add(symbol: str):
        normalized = str(symbol or "").strip()
        if not normalized or normalized in seen:
            return
        seen.add(normalized)
        symbols.append(normalized)

    for position in positions or []:
        add(position.get("symbol"))
    for deal in (deals or [])[:80]:
        add(deal.get("symbol"))
    for symbol in SYMBOL_SPEC_COMMON_CANDIDATES:
        add(symbol)

    specs: dict[str, dict] = {}
    for symbol in symbols[:80]:
        spec = get_symbol_spec(symbol, account_currency)
        if spec:
            specs[symbol] = spec
    return specs


def compute_stats(trades: list, balance: float) -> dict:
    """Calcula estadísticas a partir del historial."""
    if not trades:
        return {}
    closed = [t for t in trades if t["status"] == "CLOSED"]
    if not closed:
        return {}

    profits  = [t["profit"] for t in closed]
    winners  = [p for p in profits if p > 0]
    losers   = [p for p in profits if p < 0]

    total_pnl    = sum(profits)
    win_rate     = len(winners) / len(closed) * 100 if closed else 0
    avg_win      = sum(winners) / len(winners) if winners else 0
    avg_loss     = abs(sum(losers) / len(losers)) if losers else 0
    profit_factor = sum(winners) / abs(sum(losers)) if losers else 0

    # Drawdown
    equity_curve = []
    running = 0
    peak = 0
    max_dd = 0
    for p in reversed(profits):
        running += p
        if running > peak:
            peak = running
        dd = peak - running
        if dd > max_dd:
            max_dd = dd
    max_dd_pct = (max_dd / balance * 100) if balance > 0 else 0

    # Expectativa en R (asumiendo 1:3 de media)
    expectancy_r = (win_rate / 100 * (avg_win / avg_loss)) - ((1 - win_rate / 100)) if avg_loss else 0

    return {
        "total_trades":    len(closed),
        "winners":         len(winners),
        "losers":          len(losers),
        "win_rate":        round(win_rate, 2),
        "total_pnl":       round(total_pnl, 2),
        "avg_win":         round(avg_win, 2),
        "avg_loss":        round(avg_loss, 2),
        "profit_factor":   round(profit_factor, 2),
        "max_drawdown_usd": round(max_dd, 2),
        "max_drawdown_pct": round(max_dd_pct, 2),
        "expectancy_r":    round(expectancy_r, 3),
    }


# ══════════════════════════════════════════════════════════════════════════
#  DATOS MOCK (cuando MT5 no está disponible — demo mode)
# ══════════════════════════════════════════════════════════════════════════

import random, time as _time

def _now():
    return datetime.now(tz=timezone.utc).isoformat()

def _mock_account():
    base = 108420.0
    fluctuation = random.uniform(-50, 50)
    return {
        "login": 12345678, "name": "Kevin C.", "broker": "DEMO BROKER",
        "server": "DemoServer-1", "balance": base,
        "equity": round(base + fluctuation, 2),
        "margin": 1240.00, "free_margin": round(base + fluctuation - 1240, 2),
        "margin_level": round((base + fluctuation) / 1240 * 100, 2),
        "profit": round(fluctuation, 2), "currency": "USD", "leverage": 100,
        "type": "demo", "timestamp": _now(),
    }

def _mock_positions():
    if random.random() > 0.6:
        return []
    return [{
        "ticket": 98765432, "symbol": "GBPUSD", "type": "BUY",
        "volume": 0.50, "open_price": 1.27120, "current": round(1.27120 + random.uniform(-0.0010, 0.0025), 5),
        "sl": 1.27020, "tp": 1.27420,
        "profit": round(random.uniform(-30, 120), 2),
        "swap": -0.50,
        "open_time": "2024-02-14T09:45:00+00:00",
        "comment": "KMFX Asian Breakout", "magic": 20240214,
    }]

def _mock_deals():
    symbols = ["GBPUSD","EURUSD","USDCAD","AUDUSD"]
    deals = []
    for i in range(40):
        sym = random.choice(symbols)
        profit = random.choice([
            random.uniform(80, 180),
            random.uniform(80, 180),
            random.uniform(-40, -10),
        ])
        deals.append({
            "position_id": 9000000 + i,
            "symbol": sym,
            "type": random.choice(["BUY","SELL"]),
            "volume": random.choice([0.20, 0.30, 0.40, 0.50]),
            "open_price": round(random.uniform(1.0, 1.5), 5),
            "close_price": round(random.uniform(1.0, 1.5), 5),
            "profit": round(profit, 2),
            "open_time": f"2024-02-{random.randint(1,14):02d}T{random.randint(7,16):02d}:00:00+00:00",
            "close_time": f"2024-02-{random.randint(1,14):02d}T{random.randint(10,18):02d}:00:00+00:00",
            "status": "CLOSED",
            "comment": "KMFX",
            "magic": 20240200 + i,
        })
    return deals


# ══════════════════════════════════════════════════════════════════════════
#  WebSocket — servidor
# ══════════════════════════════════════════════════════════════════════════

def build_full_snapshot() -> dict:
    """Construye el payload completo para enviar al dashboard."""
    account  = get_account_info()
    positions = get_open_positions()
    orders   = get_pending_orders()
    deals    = get_deal_history(days_back=90)
    stats    = compute_stats(deals, account.get("balance", 0))
    risk_snapshot = build_risk_snapshot(account, positions)
    accounts_snapshot = build_accounts_snapshot(account, positions, deals, risk_snapshot)

    # Precios de pares principales
    symbols = ["GBPUSD","EURUSD","USDCAD","AUDUSD","USDJPY"]
    prices  = {}
    for s in symbols:
        p = get_symbol_price(s)
        if p:
            prices[s] = p

    return {
        "type":      "snapshot",
        "timestamp": _now(),
        "account":   account,
        "positions": positions,
        "orders":    orders,
        "trades":    deals,
        "stats":     stats,
        "prices":    prices,
        "risk_snapshot": risk_snapshot,
        "accounts_snapshot": accounts_snapshot,
        "mode":      "live" if HAS_MT5 else "demo",
    }


async def broadcast(message: str):
    """Envía mensaje a todos los clientes conectados."""
    if not connected_clients:
        return
    disconnected = set()
    for ws in connected_clients.copy():
        try:
            await ws.send(message)
        except Exception:
            disconnected.add(ws)
    connected_clients -= disconnected


async def handle_client(websocket):
    """Maneja una conexión de cliente."""
    client_ip = websocket.remote_address[0] if websocket.remote_address else "unknown"
    log.info(f"🔌 Cliente conectado: {client_ip}")
    connected_clients.add(websocket)

    try:
        # Enviar snapshot completo al conectar
        snapshot = build_full_snapshot()
        await websocket.send(json.dumps(snapshot))

        # Escuchar mensajes del cliente
        async for raw in websocket:
            try:
                msg = json.loads(raw)
                cmd = msg.get("cmd", "")
                log.debug(f"Comando recibido: {cmd}")

                if cmd == "ping":
                    await websocket.send(json.dumps({"type": "pong", "timestamp": _now()}))

                elif cmd == "get_snapshot":
                    snap = build_full_snapshot()
                    await websocket.send(json.dumps(snap))

                elif cmd == "get_history":
                    days = msg.get("days", 30)
                    deals = get_deal_history(days_back=days)
                    await websocket.send(json.dumps({"type": "history", "trades": deals, "timestamp": _now()}))

                elif cmd == "get_prices":
                    syms = msg.get("symbols", ["GBPUSD","EURUSD"])
                    prices = {s: get_symbol_price(s) for s in syms}
                    await websocket.send(json.dumps({"type": "prices", "prices": prices, "timestamp": _now()}))

            except json.JSONDecodeError:
                log.warning(f"Mensaje JSON inválido recibido")

    except Exception as e:
        log.info(f"Cliente desconectado: {e}")
    finally:
        connected_clients.discard(websocket)
        log.info(f"🔌 Cliente desconectado: {client_ip}")


async def poll_mt5():
    """Polling loop — envía actualizaciones a todos los clientes."""
    log.info(f"⏱  Polling MT5 cada {POLL_INTERVAL}s")
    while True:
        await asyncio.sleep(POLL_INTERVAL)
        if not connected_clients:
            continue
        try:
            # Update rápido: solo cuenta y posiciones
            account   = get_account_info()
            positions = get_open_positions()
            orders    = get_pending_orders()
            risk_snapshot = build_risk_snapshot(account, positions)
            deals = get_deal_history(days_back=90)
            accounts_snapshot = build_accounts_snapshot(account, positions, deals, risk_snapshot)

            symbols = list({p["symbol"] for p in positions} | {"GBPUSD","EURUSD"})
            prices  = {s: get_symbol_price(s) for s in symbols}

            update = {
                "type":      "update",
                "timestamp": _now(),
                "account":   account,
                "positions": positions,
                "orders":    orders,
                "prices":    prices,
                "risk_snapshot": risk_snapshot,
                "accounts_snapshot": accounts_snapshot,
                "mode":      "live" if HAS_MT5 else "demo",
            }
            await broadcast(json.dumps(update))
        except Exception as e:
            log.error(f"Error en poll_mt5: {e}")


async def main():
    log.info("=" * 60)
    log.info("  KMFX Edge — MT5 Bridge Server")
    log.info("=" * 60)

    if not HAS_WEBSOCKETS:
        log.error("❌ 'websockets' no instalado. Ejecuta: pip install websockets")
        sys.exit(1)

    # Intentar conectar MT5
    mt5_ok = mt5_connect()
    if not mt5_ok:
        log.warning("⚠️  MT5 no disponible — arrancando en modo DEMO con datos simulados")

    # Arrancar receptor HTTP para el EA de MQL5
    try:
        from kmfx_http_receiver import start_http_server, set_broadcast
        set_broadcast(broadcast)
        start_http_server()
        log.info(f"📡 HTTP receiver activo en http://localhost:8766/mt5data")
    except Exception as e:
        log.warning(f"HTTP receiver no disponible: {e}")

    log.info(f"🚀 WebSocket server en ws://{HOST}:{PORT}")
    log.info(f"   Abre el dashboard y conecta a ws://{HOST}:{PORT}")
    log.info(f"   Ctrl+C para detener")
    log.info("=" * 60)

    async with websockets.serve(handle_client, HOST, PORT):
        await poll_mt5()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("🛑 Bridge detenido por el usuario")
        if HAS_MT5:
            mt5.shutdown()
