"""
Reportes de evidencia para usar con una IA externa.

Este modulo no llama a proveedores de IA. Solo estructura datos, genera un
Markdown copiable y deja claro que la IA externa no debe producir senales.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Iterable, Optional, Sequence


REPORT_SCHEMA_VERSION = "1.0.0"
REPORT_TYPE = "external_ai_evidence_pack"


def safe_str(value: Any, default: str = "") -> str:
    if value is None:
        return default
    try:
        text = str(value).strip()
    except Exception:
        return default
    return text or default


def safe_float(value: Any, default: float = 0.0) -> float:
    if value is None or value == "":
        return default
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if number != number or number in (float("inf"), float("-inf")):
        return default
    return number


def round_float(value: Any, digits: int = 4) -> float:
    return round(safe_float(value), digits)


def read_path(data: dict[str, Any], path: Sequence[str], default: Any = None) -> Any:
    current: Any = data
    for key in path:
        if not isinstance(current, dict) or key not in current:
            return default
        current = current[key]
    return current


def mask_identifier(value: Any) -> str:
    text = safe_str(value)
    if not text:
        return ""
    if len(text) <= 4:
        return "*" * len(text)
    return f"***{text[-4:]}"


def trade_net_pnl(trade: dict[str, Any]) -> float:
    if any(key in trade for key in ("profit", "commission", "swap")):
        return round(
            safe_float(trade.get("profit"))
            + safe_float(trade.get("commission"))
            + safe_float(trade.get("swap")),
            2,
        )
    for key in ("net", "pnl", "net_pnl", "result"):
        if key in trade:
            return round(safe_float(trade.get(key)), 2)
    return 0.0


def trade_timestamp(trade: dict[str, Any]) -> str:
    for key in ("time", "close_time", "closeTime", "date", "when", "open_time", "openTime"):
        value = safe_str(trade.get(key))
        if value:
            return value
    return ""


def trade_field(trade: dict[str, Any], keys: Sequence[str], default: str = "Sin dato") -> str:
    for key in keys:
        value = safe_str(trade.get(key))
        if value:
            return value
    return default


def extract_professional_metrics(risk_snapshot: Optional[dict[str, Any]]) -> dict[str, Any]:
    if not isinstance(risk_snapshot, dict):
        return {}
    direct = risk_snapshot.get("professional_metrics")
    if isinstance(direct, dict):
        return direct
    nested = read_path(risk_snapshot, ["riskSnapshot", "professional_metrics"], {})
    return nested if isinstance(nested, dict) else {}


def derive_period(trades: Sequence[dict[str, Any]], fallback: Optional[dict[str, Any]] = None) -> dict[str, str]:
    if fallback:
        return {
            "from": safe_str(fallback.get("from")),
            "to": safe_str(fallback.get("to")),
            "label": safe_str(fallback.get("label"), "periodo personalizado"),
        }
    timestamps = sorted(timestamp for timestamp in (trade_timestamp(trade) for trade in trades) if timestamp)
    if not timestamps:
        return {"from": "", "to": "", "label": "sin periodo"}
    return {"from": timestamps[0], "to": timestamps[-1], "label": "periodo de trades cerrados"}


def build_pattern_rows(
    trades: Sequence[dict[str, Any]],
    *,
    keys: Sequence[str],
    default: str,
    limit: int = 5,
    ascending: bool = True,
) -> list[dict[str, Any]]:
    buckets: dict[str, list[float]] = {}
    for trade in trades:
        key = trade_field(trade, keys, default)
        buckets.setdefault(key, []).append(trade_net_pnl(trade))

    rows: list[dict[str, Any]] = []
    for key, pnls in buckets.items():
        wins = [pnl for pnl in pnls if pnl > 0]
        losses = [pnl for pnl in pnls if pnl < 0]
        total = len(pnls)
        rows.append({
            "key": key,
            "trades_count": total,
            "net_pnl": round(sum(pnls), 2),
            "gross_profit": round(sum(wins), 2),
            "gross_loss": round(abs(sum(losses)), 2),
            "win_rate_pct": round((len(wins) / total) * 100.0, 4) if total else 0.0,
            "average_pnl": round((sum(pnls) / total), 2) if total else 0.0,
            "best_trade": round(max(pnls), 2) if pnls else 0.0,
            "worst_trade": round(min(pnls), 2) if pnls else 0.0,
        })

    return sorted(rows, key=lambda item: item["net_pnl"], reverse=not ascending)[:limit]


def build_review_queue(
    trades: Sequence[dict[str, Any]],
    journal_entries: Sequence[dict[str, Any]],
    professional_metrics: dict[str, Any],
    *,
    limit: int = 10,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []

    missing_strategy = [
        trade for trade in trades
        if trade_field(trade, ("strategy_tag", "strategyTag", "setup", "setup_name", "magic"), "") == ""
    ]
    if missing_strategy:
        items.append({
            "type": "missing_strategy",
            "severity": "medium",
            "title": "Trades sin estrategia o setup",
            "evidence": f"{len(missing_strategy)} trades no tienen estrategia identificable.",
            "action_prompt": "Pedir a la IA externa que detecte si esos trades comparten simbolo, horario o patron.",
        })

    worst_losses = sorted((trade for trade in trades if trade_net_pnl(trade) < 0), key=trade_net_pnl)[:3]
    for trade in worst_losses:
        items.append({
            "type": "large_loss",
            "severity": "high",
            "title": "Perdida relevante",
            "evidence": (
                f"{trade_timestamp(trade) or 'sin fecha'} "
                f"{trade_field(trade, ('symbol',), 'UNKNOWN')} "
                f"{trade_net_pnl(trade):.2f}"
            ),
            "action_prompt": "Revisar si hubo fallo de proceso, sizing, horario o condicion de mercado.",
        })

    for entry in journal_entries:
        compliance = safe_str(entry.get("compliance"))
        mistake = safe_str(entry.get("mistake"))
        if compliance and compliance.lower() not in {"cumplida", "ok", "compliant"}:
            items.append({
                "type": "journal_compliance",
                "severity": "medium",
                "title": "Entrada de journal con cumplimiento parcial",
                "evidence": f"{entry.get('date', '')} {entry.get('symbol', '')}: {compliance}. {mistake}",
                "action_prompt": "Pedir patrones de disciplina repetidos y una accion concreta para la semana.",
            })

    for group in read_path(professional_metrics, ["strategy_breakdown", "groups"], []) or []:
        score = group.get("strategy_score") if isinstance(group, dict) else {}
        if isinstance(score, dict) and score.get("overoptimization_alert"):
            items.append({
                "type": "strategy_overoptimization",
                "severity": "medium",
                "title": "Posible sobreoptimizacion o dependencia de outliers",
                "evidence": f"{group.get('strategy', 'Sin estrategia')}: {score.get('dashboard_text', '')}",
                "action_prompt": "Pedir a la IA externa que separe edge real, muestra baja y dependencia de outliers.",
            })

    prop_firm = professional_metrics.get("prop_firm") if isinstance(professional_metrics.get("prop_firm"), dict) else {}
    if prop_firm and safe_str(prop_firm.get("alert_level")) not in {"", "within_rules"}:
        items.append({
            "type": "prop_firm_rules",
            "severity": "high",
            "title": "Riesgo de reglas de fondeo",
            "evidence": prop_firm.get("dashboard_text", ""),
            "action_prompt": "Pedir un plan de reduccion de riesgo sin senales de mercado.",
        })

    return items[:limit]


def build_evidence_trades(trades: Sequence[dict[str, Any]], *, limit: int = 12) -> list[dict[str, Any]]:
    ranked = sorted(trades, key=lambda trade: abs(trade_net_pnl(trade)), reverse=True)[:limit]
    rows: list[dict[str, Any]] = []
    for trade in ranked:
        rows.append({
            "id": safe_str(trade.get("ticket") or trade.get("position_id") or trade.get("id")),
            "time": trade_timestamp(trade),
            "symbol": trade_field(trade, ("symbol",), "UNKNOWN"),
            "strategy": trade_field(trade, ("strategy_tag", "strategyTag", "setup", "setup_name", "magic"), "Sin estrategia"),
            "direction": trade_field(trade, ("type", "side", "direction"), "N/A"),
            "net_pnl": trade_net_pnl(trade),
            "r_multiple": safe_float(trade.get("r_multiple") or trade.get("rMultiple") or trade.get("result_r"), 0.0),
            "comment": safe_str(trade.get("comment")),
        })
    return rows


def build_strategy_rows(professional_metrics: dict[str, Any], *, limit: int = 10) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for group in read_path(professional_metrics, ["strategy_breakdown", "groups"], []) or []:
        if not isinstance(group, dict):
            continue
        performance = group.get("performance") if isinstance(group.get("performance"), dict) else {}
        score = group.get("strategy_score") if isinstance(group.get("strategy_score"), dict) else {}
        discipline = group.get("strategy_discipline") if isinstance(group.get("strategy_discipline"), dict) else {}
        tail_risk = read_path(group, ["tail_risk", "var_95"], {})
        ruin = group.get("risk_of_ruin") if isinstance(group.get("risk_of_ruin"), dict) else {}
        drawdown = group.get("drawdown_path") if isinstance(group.get("drawdown_path"), dict) else {}
        rows.append({
            "strategy": safe_str(group.get("strategy"), "Sin estrategia"),
            "status": safe_str(score.get("status"), "unknown"),
            "score": round_float(score.get("score")),
            "sample_size": int(safe_float(group.get("sample_size"))),
            "net_pnl": round_float(group.get("net_pnl"), 2),
            "profit_factor": score.get("profit_factor") if score.get("profit_factor") is not None else performance.get("profit_factor"),
            "expectancy_r": score.get("expectancy_r") if score.get("expectancy_r") is not None else performance.get("expectancy_r"),
            "var_95_amount": round_float(tail_risk.get("var_amount"), 2) if isinstance(tail_risk, dict) else 0.0,
            "risk_of_ruin_pct": ruin.get("analytic_ruin_probability_pct"),
            "max_drawdown_pct": drawdown.get("max_drawdown_pct"),
            "overoptimization_alert": bool(score.get("overoptimization_alert")),
            "discipline_score": score.get("discipline_score", discipline.get("discipline_score")),
            "discipline_coverage_pct": score.get("discipline_coverage_pct", discipline.get("coverage_pct", 0.0)),
            "discipline_sample_size": score.get("discipline_sample_size", discipline.get("tagged_sample_size", 0)),
            "discipline_confidence": score.get("discipline_confidence", discipline.get("confidence_level", "unavailable")),
        })
    return sorted(rows, key=lambda item: item["score"], reverse=True)[:limit]


def build_journal_summary(journal_entries: Sequence[dict[str, Any]], *, limit: int = 8) -> dict[str, Any]:
    mistakes: dict[str, int] = {}
    emotions: dict[str, int] = {}
    notable_entries: list[dict[str, Any]] = []
    for entry in journal_entries:
        mistake = safe_str(entry.get("mistake"))
        emotion = safe_str(entry.get("emotion"))
        if mistake:
            mistakes[mistake] = mistakes.get(mistake, 0) + 1
        if emotion:
            emotions[emotion] = emotions.get(emotion, 0) + 1
        if mistake or safe_str(entry.get("lesson")):
            notable_entries.append({
                "date": safe_str(entry.get("date")),
                "symbol": safe_str(entry.get("symbol")),
                "setup": safe_str(entry.get("setup")),
                "pnl": round_float(entry.get("pnl"), 2),
                "compliance": safe_str(entry.get("compliance")),
                "mistake": mistake,
                "emotion": emotion,
                "lesson": safe_str(entry.get("lesson")),
            })
    return {
        "entries_count": len(journal_entries),
        "mistakes": sorted(
            [{"name": key, "count": value} for key, value in mistakes.items()],
            key=lambda item: item["count"],
            reverse=True,
        ),
        "emotions": sorted(
            [{"name": key, "count": value} for key, value in emotions.items()],
            key=lambda item: item["count"],
            reverse=True,
        ),
        "notable_entries": notable_entries[:limit],
    }


def build_external_ai_prompt(pack: dict[str, Any]) -> str:
    period = pack.get("period", {})
    return (
        "Actua como analista de proceso y riesgo para trading. "
        "No des senales de compra o venta, no predigas mercado y no inventes causalidad. "
        "Usa solo la evidencia del reporte y marca cualquier muestra insuficiente.\n\n"
        f"Periodo: {period.get('label', '')} ({period.get('from', '')} -> {period.get('to', '')}).\n"
        "Quiero que revises:\n"
        "1. Estado general de la cuenta: riesgo, consistencia y calidad de muestra.\n"
        "2. Peor patron operativo con evidencia concreta.\n"
        "3. Estrategias que merecen capital, pausa o mas muestra.\n"
        "4. Riesgos de fondeo: DD diario, DD maximo, consistencia y dias minimos.\n"
        "5. Plan de mejora de 7 dias, solo basado en proceso y gestion de riesgo.\n"
        "6. Si cae el profit factor, explica posibles causas con evidencia y dudas abiertas.\n\n"
        "Formato de respuesta deseado: Estado / Causa probable / Evidencia / Accion."
    )


def build_ai_evidence_pack(
    *,
    account: Optional[dict[str, Any]] = None,
    trades: Optional[Sequence[dict[str, Any]]] = None,
    risk_snapshot: Optional[dict[str, Any]] = None,
    journal_entries: Optional[Sequence[dict[str, Any]]] = None,
    period: Optional[dict[str, Any]] = None,
    generated_at: Optional[str] = None,
) -> dict[str, Any]:
    account = account or {}
    trades = list(trades or [])
    journal_entries = list(journal_entries or [])
    professional_metrics = extract_professional_metrics(risk_snapshot)
    performance = professional_metrics.get("performance") if isinstance(professional_metrics.get("performance"), dict) else {}
    tail_risk = professional_metrics.get("tail_risk") if isinstance(professional_metrics.get("tail_risk"), dict) else {}
    prop_firm = professional_metrics.get("prop_firm") if isinstance(professional_metrics.get("prop_firm"), dict) else {}

    pack: dict[str, Any] = {
        "schema_version": REPORT_SCHEMA_VERSION,
        "report_type": REPORT_TYPE,
        "generated_at": generated_at or datetime.now(timezone.utc).isoformat(),
        "privacy": {
            "external_ai_ready": True,
            "contains_connection_keys": False,
            "note": "Revisar manualmente datos sensibles antes de pegar el reporte en una IA externa.",
        },
        "account": {
            "name": safe_str(account.get("name") or account.get("accountName") or account.get("broker"), "Cuenta"),
            "broker": safe_str(account.get("broker"), "MT5"),
            "server": safe_str(account.get("server")),
            "login_masked": mask_identifier(account.get("login")),
            "currency": safe_str(account.get("currency"), "USD"),
            "balance": round_float(account.get("balance"), 2),
            "equity": round_float(account.get("equity", account.get("balance")), 2),
        },
        "period": derive_period(trades, period),
        "sources": {
            "trades_count": len(trades),
            "journal_entries_count": len(journal_entries),
            "has_risk_snapshot": isinstance(risk_snapshot, dict),
            "has_professional_metrics": bool(professional_metrics),
            "source_types": ["closed_trades", "journal_entries", "risk_snapshot", "professional_metrics"],
        },
        "metrics": {
            "sample_size": performance.get("sample_size", len(trades)),
            "net_pnl": performance.get("net_pnl"),
            "win_rate_pct": performance.get("win_rate_pct"),
            "profit_factor": performance.get("profit_factor"),
            "expectancy_amount": performance.get("expectancy_amount"),
            "expectancy_r": performance.get("expectancy_r"),
            "sample_quality": performance.get("sample_quality", {}),
            "outlier_dependency": performance.get("outlier_dependency", {}),
        },
        "risk": {
            "var_95": tail_risk.get("var_95", {}),
            "var_99": tail_risk.get("var_99", {}),
            "risk_of_ruin": professional_metrics.get("risk_of_ruin", {}),
            "drawdown_path": professional_metrics.get("drawdown_path", {}),
            "monte_carlo": professional_metrics.get("monte_carlo", {}),
            "sizing": professional_metrics.get("sizing", {}),
        },
        "prop_firm": prop_firm,
        "strategies": {
            "groups": build_strategy_rows(professional_metrics),
            "correlation": read_path(professional_metrics, ["strategy_breakdown", "correlation"], {}),
            "portfolio_heat": read_path(professional_metrics, ["strategy_breakdown", "portfolio_heat"], {}),
            "risk_allocation": read_path(professional_metrics, ["strategy_breakdown", "risk_allocation"], {}),
        },
        "patterns": {
            "worst_by_symbol": build_pattern_rows(trades, keys=("symbol",), default="UNKNOWN", ascending=True),
            "worst_by_setup": build_pattern_rows(trades, keys=("strategy_tag", "strategyTag", "setup", "setup_name", "magic"), default="Sin estrategia", ascending=True),
            "worst_by_session": build_pattern_rows(trades, keys=("session", "trade_session"), default="Sin sesion", ascending=True),
            "worst_by_direction": build_pattern_rows(trades, keys=("type", "side", "direction"), default="N/A", ascending=True),
        },
        "review_queue": build_review_queue(trades, journal_entries, professional_metrics),
        "evidence_trades": build_evidence_trades(trades),
        "journal": build_journal_summary(journal_entries),
        "restrictions_for_external_ai": [
            "No generar senales de compra o venta.",
            "No inventar causalidad sin evidencia.",
            "Marcar muestra insuficiente cuando aplique.",
            "Separar datos observados, inferencias y dudas abiertas.",
            "Proponer acciones de proceso, riesgo y disciplina, no predicciones.",
        ],
    }
    pack["external_ai_prompt"] = build_external_ai_prompt(pack)
    return pack


def markdown_table(headers: Sequence[str], rows: Iterable[Sequence[Any]]) -> str:
    header_line = "| " + " | ".join(headers) + " |"
    separator = "| " + " | ".join("---" for _ in headers) + " |"
    body = [
        "| " + " | ".join(safe_str(value, "-").replace("\n", " ") for value in row) + " |"
        for row in rows
    ]
    return "\n".join([header_line, separator, *body])


def render_ai_evidence_markdown(pack: dict[str, Any]) -> str:
    account = pack.get("account", {})
    metrics = pack.get("metrics", {})
    risk = pack.get("risk", {})
    prop_firm = pack.get("prop_firm", {})
    strategies = read_path(pack, ["strategies", "groups"], []) or []
    review_queue = pack.get("review_queue", [])
    evidence_trades = pack.get("evidence_trades", [])
    journal = pack.get("journal", {})

    sections: list[str] = [
        "# KMFX Edge AI Evidence Pack",
        "",
        "Uso: copiar este reporte en una IA externa. KMFX no ha enviado estos datos a ningun proveedor.",
        "",
        "## Restricciones para la IA externa",
        "\n".join(f"- {item}" for item in pack.get("restrictions_for_external_ai", [])),
        "",
        "## Cuenta y periodo",
        markdown_table(
            ["Campo", "Valor"],
            [
                ["Cuenta", account.get("name", "")],
                ["Broker", account.get("broker", "")],
                ["Login", account.get("login_masked", "")],
                ["Periodo", f"{read_path(pack, ['period', 'from'], '')} -> {read_path(pack, ['period', 'to'], '')}"],
                ["Trades", read_path(pack, ["sources", "trades_count"], 0)],
                ["Journal entries", read_path(pack, ["sources", "journal_entries_count"], 0)],
            ],
        ),
        "",
        "## Snapshot profesional",
        markdown_table(
            ["Metrica", "Valor"],
            [
                ["P&L neto", metrics.get("net_pnl")],
                ["Win rate %", metrics.get("win_rate_pct")],
                ["Profit factor", metrics.get("profit_factor")],
                ["Expectancy", metrics.get("expectancy_amount")],
                ["Expectancy R", metrics.get("expectancy_r")],
                ["Muestra", read_path(metrics, ["sample_quality", "label"], "")],
                ["VaR 95", read_path(risk, ["var_95", "var_amount"], "")],
                ["Risk of Ruin", read_path(risk, ["risk_of_ruin", "analytic_ruin_probability_pct"], "")],
                ["Max DD %", read_path(risk, ["drawdown_path", "max_drawdown_pct"], "")],
            ],
        ),
        "",
        "## Prop firm",
        markdown_table(
            ["Regla", "Valor"],
            [
                ["Daily DD buffer %", prop_firm.get("daily_dd_buffer_pct")],
                ["Max DD buffer %", prop_firm.get("max_dd_buffer_pct")],
                ["Target progress %", prop_firm.get("profit_target_progress_pct")],
                ["Risk allowed after open risk %", prop_firm.get("risk_allowed_after_open_risk_pct")],
                ["Consistency pass", prop_firm.get("consistency_rule_pass")],
                ["Minimum days remaining", prop_firm.get("minimum_days_remaining")],
                ["Pass probability %", read_path(prop_firm, ["pass_probability", "pass_probability_pct"], "")],
                ["Payout ledger net", read_path(prop_firm, ["payout_ledger", "net_cashflow_amount"], "")],
            ],
        ),
        "",
        "## Estrategias",
        markdown_table(
            ["Estrategia", "Estado", "Score", "Trades", "P&L", "PF", "RoR %", "DD %", "Disciplina", "Cobertura %"],
            [
                [
                    row.get("strategy"),
                    row.get("status"),
                    row.get("score"),
                    row.get("sample_size"),
                    row.get("net_pnl"),
                    row.get("profit_factor"),
                    row.get("risk_of_ruin_pct"),
                    row.get("max_drawdown_pct"),
                    row.get("discipline_score"),
                    row.get("discipline_coverage_pct"),
                ]
                for row in strategies
            ] or [["-", "-", "-", "-", "-", "-", "-", "-", "-", "-"]],
        ),
        "",
        "## Review queue",
        "\n".join(
            f"- [{item.get('severity', 'info')}] {item.get('title', '')}: {item.get('evidence', '')}"
            for item in review_queue
        ) or "- Sin alertas de review generadas.",
        "",
        "## Trades de evidencia",
        markdown_table(
            ["Fecha", "Simbolo", "Setup", "Direccion", "P&L", "Comentario"],
            [
                [
                    row.get("time"),
                    row.get("symbol"),
                    row.get("strategy"),
                    row.get("direction"),
                    row.get("net_pnl"),
                    row.get("comment"),
                ]
                for row in evidence_trades[:10]
            ] or [["-", "-", "-", "-", "-", "-"]],
        ),
        "",
        "## Journal",
        markdown_table(
            ["Campo", "Valor"],
            [
                ["Entradas", journal.get("entries_count", 0)],
                ["Errores top", ", ".join(f"{item['name']} ({item['count']})" for item in journal.get("mistakes", [])[:5])],
                ["Emociones top", ", ".join(f"{item['name']} ({item['count']})" for item in journal.get("emotions", [])[:5])],
            ],
        ),
        "",
        "## Prompt sugerido",
        "```text",
        safe_str(pack.get("external_ai_prompt")),
        "```",
    ]
    return "\n".join(sections).strip() + "\n"


def build_ai_evidence_report(
    *,
    account: Optional[dict[str, Any]] = None,
    trades: Optional[Sequence[dict[str, Any]]] = None,
    risk_snapshot: Optional[dict[str, Any]] = None,
    journal_entries: Optional[Sequence[dict[str, Any]]] = None,
    period: Optional[dict[str, Any]] = None,
    generated_at: Optional[str] = None,
) -> dict[str, Any]:
    pack = build_ai_evidence_pack(
        account=account,
        trades=trades,
        risk_snapshot=risk_snapshot,
        journal_entries=journal_entries,
        period=period,
        generated_at=generated_at,
    )
    markdown = render_ai_evidence_markdown(pack)
    return {
        "schema_version": REPORT_SCHEMA_VERSION,
        "report_type": REPORT_TYPE,
        "pack": pack,
        "markdown": markdown,
        "json": json.dumps(pack, ensure_ascii=False, indent=2, sort_keys=True),
    }
