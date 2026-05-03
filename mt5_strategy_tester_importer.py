"""
Importador MT5 Strategy Tester para Backtest vs Real.

Normaliza reports HTML/HTM, XML y CSV hacia el contrato manual-ready que
consume `backtest_real_engine.build_backtest_vs_real_report`.
"""

from __future__ import annotations

import csv
import io
import math
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any, Iterable, Sequence

from backtest_real_engine import calculate_trade_metrics, parse_hour, safe_str


METRIC_ALIASES = {
    "totalnetprofit": "net_profit",
    "netprofit": "net_profit",
    "grossprofit": "gross_profit",
    "grossloss": "gross_loss",
    "profitfactor": "profit_factor",
    "expectedpayoff": "expectancy_amount",
    "expectancy": "expectancy_amount",
    "averagetrade": "expectancy_amount",
    "totaltrades": "trade_count",
    "trades": "trade_count",
    "profittradesoftotal": "profit_trades",
    "profittradespctoftotal": "profit_trades",
    "profittrades": "profit_trades",
    "winningtrades": "profit_trades",
    "losstradesoftotal": "loss_trades",
    "losstradespctoftotal": "loss_trades",
    "losstrades": "loss_trades",
    "winrate": "win_rate_pct",
    "winratepct": "win_rate_pct",
    "maximaldrawdown": "max_drawdown_pct",
    "maxdrawdown": "max_drawdown_pct",
    "maxdrawdownpct": "max_drawdown_pct",
    "maxdd": "max_drawdown_pct",
    "balancedrawdownmaximal": "max_drawdown_pct",
    "equitydrawdownmaximal": "max_drawdown_pct",
    "drawdownmaximal": "max_drawdown_pct",
    "sharperatio": "sharpe_ratio",
    "sharpe": "sharpe_ratio",
    "recoveryfactor": "recovery_factor",
    "slippage": "average_slippage",
    "averageslippage": "average_slippage",
    "spread": "average_spread",
    "averagespread": "average_spread",
    "commission": "commission_per_trade",
    "averagecommission": "commission_per_trade",
    "expert": "expert",
    "expertadvisor": "expert",
    "ea": "expert",
    "symbol": "symbol",
    "period": "period",
}

TRADE_HEADER_ALIASES = {
    "time": "time",
    "closetime": "time",
    "close": "time",
    "date": "time",
    "deal": "ticket",
    "ticket": "ticket",
    "order": "order",
    "symbol": "symbol",
    "type": "type",
    "direction": "direction",
    "volume": "volume",
    "price": "price",
    "profit": "profit",
    "commission": "commission",
    "swap": "swap",
    "comment": "comment",
    "magic": "magic",
    "slippage": "slippage",
    "spread": "spread",
}


class TableTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[list[str]] = []
        self._in_cell = False
        self._current_cell: list[str] = []
        self._current_row: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in {"td", "th"}:
            self._in_cell = True
            self._current_cell = []

    def handle_data(self, data: str) -> None:
        if self._in_cell:
            text = " ".join(data.split())
            if text:
                self._current_cell.append(text)

    def handle_endtag(self, tag: str) -> None:
        normalized = tag.lower()
        if normalized in {"td", "th"} and self._in_cell:
            self._current_row.append(" ".join(self._current_cell).strip())
            self._current_cell = []
            self._in_cell = False
        if normalized == "tr" and self._current_row:
            self.rows.append([cell for cell in self._current_row if cell != ""])
            self._current_row = []


def normalize_key(value: Any) -> str:
    text = safe_str(value).lower()
    replacements = {
        "%": " pct ",
        "&": " and ",
        "_": " ",
        "-": " ",
        "/": " ",
        "(": " ",
        ")": " ",
        ".": " ",
        ":": " ",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return re.sub(r"[^a-z0-9]+", "", text)


def parse_number(value: Any, default: float = 0.0) -> float:
    text = safe_str(value)
    if not text:
        return default
    negative = "(" in text and ")" in text and not re.search(r"\([+\d].*%\)", text)
    cleaned = re.sub(r"[^0-9,\.\-+]", "", text)
    if not cleaned or cleaned in {"-", "+", ".", ","}:
        return default
    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        parts = cleaned.split(",")
        if len(parts[-1]) in {1, 2, 3}:
            cleaned = "".join(parts[:-1]).replace(",", "") + "." + parts[-1]
        else:
            cleaned = cleaned.replace(",", "")
    try:
        number = float(cleaned)
    except ValueError:
        return default
    if not math.isfinite(number):
        return default
    return -abs(number) if negative else number


def parse_percent(value: Any) -> float | None:
    text = safe_str(value)
    if not text:
        return None
    percent_matches = re.findall(r"([-+]?\d+(?:[\.,]\d+)?)\s*%", text)
    if percent_matches:
        return parse_number(percent_matches[-1])
    return None


def parse_count_with_optional_pct(value: Any) -> tuple[int, float | None]:
    return int(parse_number(value, 0.0)), parse_percent(value)


def detect_report_format(content: str, filename: str = "") -> str:
    ext = os.path.splitext(filename.lower())[1]
    sample = content.lstrip()[:240].lower()
    if ext in {".html", ".htm"} or "<html" in sample or "<table" in sample:
        return "html"
    if ext == ".xml" or sample.startswith("<?xml") or sample.startswith("<report"):
        return "xml"
    return "csv"


def strategy_from_filename(filename: str) -> str:
    stem = os.path.splitext(os.path.basename(filename))[0]
    return safe_str(stem.replace("_", " ").replace("-", " "), "MT5 Strategy Tester")


def rows_from_html(content: str) -> list[list[str]]:
    parser = TableTextParser()
    parser.feed(content)
    return parser.rows


def extract_summary_from_rows(rows: Sequence[Sequence[str]]) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    for row in rows:
        cells = [safe_str(cell) for cell in row if safe_str(cell)]
        if len(cells) < 2:
            continue
        for index in range(0, len(cells) - 1, 2):
            key = normalize_key(cells[index])
            metric = METRIC_ALIASES.get(key)
            if metric:
                summary[metric] = cells[index + 1]
    return summary


def normalized_header_map(headers: Sequence[str]) -> dict[int, str]:
    result: dict[int, str] = {}
    for index, header in enumerate(headers):
        key = normalize_key(header)
        mapped = TRADE_HEADER_ALIASES.get(key)
        if mapped:
            result[index] = mapped
    return result


def infer_session_from_time(value: Any) -> str:
    hour_label = parse_hour(value)
    if hour_label == "Sin hora":
        return "Sin sesion"
    hour = int(hour_label.split(":", 1)[0])
    if 0 <= hour < 7:
        return "Asia"
    if 7 <= hour < 13:
        return "London"
    if 13 <= hour < 21:
        return "New York"
    return "Off-session"


def normalize_trade_row(row: dict[str, Any], *, fallback_strategy: str = "") -> dict[str, Any] | None:
    profit_source = row.get("profit") if "profit" in row else row.get("pnl")
    if profit_source in (None, ""):
        return None
    time_value = row.get("time") or row.get("date") or row.get("close_time")
    trade = {
        "ticket": safe_str(row.get("ticket") or row.get("deal") or row.get("order")),
        "time": safe_str(time_value),
        "symbol": safe_str(row.get("symbol"), "UNKNOWN"),
        "type": safe_str(row.get("direction") or row.get("type")).upper(),
        "volume": parse_number(row.get("volume")),
        "price": parse_number(row.get("price")),
        "profit": parse_number(profit_source),
        "commission": parse_number(row.get("commission")),
        "swap": parse_number(row.get("swap")),
        "comment": safe_str(row.get("comment")),
        "strategy_tag": safe_str(row.get("strategy") or row.get("strategy_tag") or row.get("magic") or fallback_strategy),
        "slippage": parse_number(row.get("slippage")),
        "spread": parse_number(row.get("spread")),
    }
    trade["session"] = safe_str(row.get("session")) or infer_session_from_time(trade["time"])
    return trade


def extract_trades_from_html_rows(rows: Sequence[Sequence[str]], fallback_strategy: str = "") -> list[dict[str, Any]]:
    trades: list[dict[str, Any]] = []
    header_map: dict[int, str] = {}
    for row in rows:
        if not row:
            continue
        candidate_map = normalized_header_map(row)
        if {"time", "type", "profit"}.issubset(set(candidate_map.values())):
            header_map = candidate_map
            continue
        if not header_map:
            continue
        mapped = {
            mapped_key: row[index]
            for index, mapped_key in header_map.items()
            if index < len(row)
        }
        trade = normalize_trade_row(mapped, fallback_strategy=fallback_strategy)
        if trade is not None:
            trades.append(trade)
    return trades


def parse_csv_rows(content: str) -> tuple[list[dict[str, Any]], dict[str, Any], list[str]]:
    sample = content[:2048]
    warnings: list[str] = []
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
        if ";" in sample and sample.count(";") >= sample.count(","):
            dialect.delimiter = ";"
    handle = io.StringIO(content)
    reader = csv.reader(handle, dialect)
    raw_rows = [[safe_str(cell) for cell in row] for row in reader if any(safe_str(cell) for cell in row)]
    if not raw_rows:
        return [], {}, ["CSV vacio o sin filas legibles."]

    summary: dict[str, Any] = {}
    if all(len(row) == 2 for row in raw_rows[:12]):
        summary = extract_summary_from_rows(raw_rows)
        return [], summary, warnings

    headers = raw_rows[0]
    header_map = normalized_header_map(headers)
    dict_rows = [
        {
            header_map.get(index, normalize_key(headers[index]) or f"column_{index}"): row[index]
            for index in range(min(len(headers), len(row)))
        }
        for row in raw_rows[1:]
    ]
    trades = [trade for row in dict_rows for trade in [normalize_trade_row(row)] if trade is not None]
    if not trades:
        summary = extract_summary_from_rows(raw_rows)
    return trades, summary, warnings


def flatten_xml_summary(root: ET.Element) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    for element in root.iter():
        raw_key = safe_str(element.tag).split("}", 1)[-1]
        metric = METRIC_ALIASES.get(normalize_key(raw_key))
        if metric and safe_str(element.text):
            summary[metric] = safe_str(element.text)
        for attr_key, attr_value in element.attrib.items():
            metric = METRIC_ALIASES.get(normalize_key(attr_key))
            if metric:
                summary[metric] = attr_value
    return summary


def extract_xml_trades(root: ET.Element, fallback_strategy: str = "") -> list[dict[str, Any]]:
    trades: list[dict[str, Any]] = []
    trade_tags = {"trade", "deal", "order", "position"}
    for element in root.iter():
        tag = normalize_key(element.tag.split("}", 1)[-1])
        if tag not in trade_tags:
            continue
        row = dict(element.attrib)
        for child in element:
            child_key = child.tag.split("}", 1)[-1]
            row[child_key] = child.text
        trade = normalize_trade_row(row, fallback_strategy=fallback_strategy)
        if trade is not None:
            trades.append(trade)
    return trades


def metric_payload_from_summary(summary: dict[str, Any]) -> dict[str, Any]:
    profit_trades, profit_pct = parse_count_with_optional_pct(summary.get("profit_trades"))
    trade_count = int(parse_number(summary.get("trade_count")))
    explicit_win_rate = parse_percent(summary.get("win_rate_pct"))
    if explicit_win_rate is None and summary.get("win_rate_pct") not in (None, ""):
        explicit_win_rate = parse_number(summary.get("win_rate_pct"))
    win_rate_pct = explicit_win_rate if explicit_win_rate is not None else profit_pct
    if win_rate_pct is None and trade_count > 0 and profit_trades > 0:
        win_rate_pct = (profit_trades / trade_count) * 100.0
    drawdown_pct = parse_percent(summary.get("max_drawdown_pct"))
    if drawdown_pct is None:
        drawdown_pct = parse_number(summary.get("max_drawdown_pct"))
    return {
        "trade_count": trade_count,
        "profit_factor": parse_number(summary.get("profit_factor")),
        "expectancy_amount": parse_number(summary.get("expectancy_amount")),
        "expectancy_r": None,
        "win_rate_pct": round(win_rate_pct or 0.0, 4),
        "max_drawdown_pct": round(drawdown_pct or 0.0, 4),
        "sharpe_ratio": parse_number(summary.get("sharpe_ratio")) if summary.get("sharpe_ratio") not in (None, "") else None,
        "average_slippage": parse_number(summary.get("average_slippage")) if summary.get("average_slippage") not in (None, "") else None,
        "average_spread": parse_number(summary.get("average_spread")) if summary.get("average_spread") not in (None, "") else None,
        "commission_per_trade": parse_number(summary.get("commission_per_trade")) if summary.get("commission_per_trade") not in (None, "") else None,
        "net_profit": parse_number(summary.get("net_profit")),
        "gross_profit": parse_number(summary.get("gross_profit")),
        "gross_loss": parse_number(summary.get("gross_loss")),
        "recovery_factor": parse_number(summary.get("recovery_factor")),
    }


def merge_metric_payloads(summary_metrics: dict[str, Any], trade_metrics: dict[str, Any]) -> dict[str, Any]:
    merged = dict(summary_metrics)
    for key, value in trade_metrics.items():
        if key not in merged or merged.get(key) in (None, "", 0, 0.0):
            merged[key] = value
    return merged


def build_breakdowns(trades: Sequence[dict[str, Any]], *, starting_equity: float) -> dict[str, dict[str, dict[str, Any]]]:
    breakdowns: dict[str, dict[str, dict[str, Any]]] = {}
    for dimension in ("symbol", "hour", "session", "direction"):
        groups: dict[str, list[dict[str, Any]]] = {}
        for trade in trades:
            if dimension == "symbol":
                key = safe_str(trade.get("symbol"), "UNKNOWN")
            elif dimension == "hour":
                key = parse_hour(trade.get("time"))
            elif dimension == "session":
                key = safe_str(trade.get("session"), "Sin sesion")
            else:
                key = safe_str(trade.get("direction") or trade.get("type"), "N/A").upper()
            groups.setdefault(key, []).append(trade)
        breakdowns[dimension] = {
            key: calculate_trade_metrics(group, starting_equity=starting_equity)
            for key, group in groups.items()
        }
    return breakdowns


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_mt5_strategy_tester_report(
    content: str,
    *,
    filename: str = "",
    strategy_name: str = "",
    starting_equity: float = 100_000.0,
    imported_at: str | None = None,
) -> dict[str, Any]:
    text = safe_str(content)
    report_format = detect_report_format(text, filename)
    warnings: list[str] = []
    summary: dict[str, Any] = {}
    trades: list[dict[str, Any]] = []
    strategy = safe_str(strategy_name) or strategy_from_filename(filename)

    if not text:
        warnings.append("Report vacio.")
    elif report_format == "html":
        rows = rows_from_html(text)
        summary = extract_summary_from_rows(rows)
        strategy = safe_str(strategy_name) or safe_str(summary.get("expert")) or strategy
        trades = extract_trades_from_html_rows(rows, fallback_strategy=strategy)
    elif report_format == "xml":
        try:
            root = ET.fromstring(text)
        except ET.ParseError:
            warnings.append("XML invalido o incompleto.")
            root = None
        if root is not None:
            summary = flatten_xml_summary(root)
            strategy = safe_str(strategy_name) or safe_str(summary.get("expert")) or strategy
            trades = extract_xml_trades(root, fallback_strategy=strategy)
    else:
        trades, summary, csv_warnings = parse_csv_rows(text)
        warnings.extend(csv_warnings)
        strategy = safe_str(strategy_name) or safe_str(summary.get("expert")) or strategy
        trades = [
            {**trade, "strategy_tag": trade.get("strategy_tag") or strategy}
            for trade in trades
        ]

    summary_metrics = metric_payload_from_summary(summary)
    trade_metrics = calculate_trade_metrics(trades, starting_equity=starting_equity) if trades else {}
    metrics = merge_metric_payloads(summary_metrics, trade_metrics)
    if not metrics.get("trade_count") and not trades:
        warnings.append("No se detectaron trades ni Total Trades en el report.")
    if not metrics.get("profit_factor"):
        warnings.append("Profit Factor no detectado; se dejara como 0 hasta completar datos.")

    return {
        "strategy": strategy,
        "source": {
            "platform": "mt5",
            "kind": "strategy_tester",
            "format": report_format,
            "filename": filename,
            "imported_at": imported_at or now_iso(),
        },
        "metrics": metrics,
        "breakdowns": build_breakdowns(trades, starting_equity=starting_equity) if trades else {},
        "trades": trades[:500],
        "raw_summary": summary,
        "warnings": warnings,
    }


def parse_mt5_strategy_tester_reports(
    reports: Iterable[dict[str, Any]],
    *,
    starting_equity: float = 100_000.0,
    imported_at: str | None = None,
) -> list[dict[str, Any]]:
    parsed: list[dict[str, Any]] = []
    for item in reports:
        if not isinstance(item, dict):
            continue
        parsed.append(
            parse_mt5_strategy_tester_report(
                safe_str(item.get("content") or item.get("text") or item.get("report")),
                filename=safe_str(item.get("filename") or item.get("name")),
                strategy_name=safe_str(item.get("strategy") or item.get("strategy_name")),
                starting_equity=starting_equity,
                imported_at=imported_at,
            )
        )
    return parsed
