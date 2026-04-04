from __future__ import annotations

from typing import Any


def build_risk_status(policy_evaluation: dict[str, Any], policy: dict[str, Any]) -> dict[str, Any]:
    breaches = policy_evaluation.get("breaches") if isinstance(policy_evaluation.get("breaches"), list) else []
    warnings = policy_evaluation.get("warnings") if isinstance(policy_evaluation.get("warnings"), list) else []
    auto_block_enabled = bool(policy.get("auto_block_enabled"))

    if breaches:
        dominant = breaches[0]
        blocking_rule = dominant.get("label") or dominant.get("metric") or "Risk breach"
        action_required = "Bloquea nuevas entradas y reduce exposición inmediatamente."

        if dominant.get("metric") == "max_drawdown":
            action_required = "Bloquea operativa y revisa el deterioro total de capital."
        elif dominant.get("metric") == "daily_drawdown":
            action_required = "Detén la sesión y espera el reset diario antes de reanudar."
        elif dominant.get("metric") == "portfolio_heat":
            action_required = "Reduce posiciones abiertas hasta volver por debajo del heat limit."
        elif dominant.get("metric") == "risk_per_trade":
            action_required = "Reduce el tamaño máximo por posición antes de abrir nuevas operaciones."

        return {
            "risk_status": "blocked" if auto_block_enabled else "breach",
            "severity": "critical",
            "reason_code": dominant.get("code", "RISK_BREACH"),
            "blocking_rule": blocking_rule,
            "action_required": action_required,
            "enforcement": {
                "allow_new_trades": not auto_block_enabled,
                "block_new_trades": auto_block_enabled,
                "reduce_size": dominant.get("metric") in {"portfolio_heat", "risk_per_trade"},
                "close_positions_required": False,
            },
        }

    if warnings:
        dominant = warnings[0]
        action_required = "Opera con vigilancia y evita añadir riesgo innecesario."
        if dominant.get("metric") == "portfolio_heat":
            action_required = "Modera nuevas entradas; el heat de cartera está cerca del límite."
        elif dominant.get("metric") == "daily_drawdown":
            action_required = "Reduce agresividad; el DD diario se acerca al límite."

        return {
            "risk_status": "warning",
            "severity": "warning",
            "reason_code": dominant.get("code", "RISK_WARNING"),
            "blocking_rule": dominant.get("label") or dominant.get("metric") or "Risk warning",
            "action_required": action_required,
            "enforcement": {
                "allow_new_trades": True,
                "block_new_trades": False,
                "reduce_size": True,
                "close_positions_required": False,
            },
        }

    return {
        "risk_status": "active_monitoring",
        "severity": "info",
        "reason_code": "OK",
        "blocking_rule": "",
        "action_required": "Operativa dentro de límites. Mantén disciplina y monitorización.",
        "enforcement": {
            "allow_new_trades": True,
            "block_new_trades": False,
            "reduce_size": False,
            "close_positions_required": False,
        },
    }
