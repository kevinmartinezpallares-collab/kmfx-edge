"""
Funciones matemáticas y helpers puros del motor de riesgo.
"""

from __future__ import annotations

import math
from datetime import date, datetime, timezone
from typing import Dict, Iterable, List, Optional, Sequence
from zoneinfo import ZoneInfo

from risk_models import ClusterDetail, CorrelationExposure, Position, RecoveryMetrics, Side, VolatilitySignal
from risk_policy import RiskPolicy


def ensure_aware(dt: Optional[datetime]) -> datetime:
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def normalize_symbol(symbol: str) -> str:
    return symbol.strip().upper()


def format_money(value: float) -> str:
    sign = "-" if value < 0 else ""
    return f"{sign}€{abs(value):,.2f}"


def get_operating_date(now: Optional[datetime], broker_timezone: str) -> date:
    current_time = ensure_aware(now)
    tz = ZoneInfo(broker_timezone)
    return current_time.astimezone(tz).date()


def get_correlation(symbol_a: str, symbol_b: str, matrix: Dict[str, Dict[str, float]]) -> float:
    a = normalize_symbol(symbol_a)
    b = normalize_symbol(symbol_b)
    if a == b:
        return 1.0
    return matrix.get(a, {}).get(b) or matrix.get(b, {}).get(a) or 0.0


def direction_factor(position_a: Position, position_b: Position) -> int:
    """
    Convierte el lado de la posición en signo de exposición.

    En la fórmula:
        rho_ij * direction_factor

    usamos:
        +1 si ambas posiciones empujan en el mismo sentido de exposición
        -1 si están en direcciones opuestas

    Esto permite que:
        - correlación positiva + lados opuestos => compensación parcial
        - correlación negativa + lados opuestos => amplificación de riesgo
    """
    return 1 if position_a.side == position_b.side else -1


def compute_total_open_risk(positions: Sequence[Position]) -> tuple[float, float]:
    total_amount = sum(position.risk_amount for position in positions)
    total_pct = sum(position.risk_pct for position in positions)
    return round(total_amount, 2), round(total_pct, 4)


def detect_correlated_exposure(
    positions: Sequence[Position],
    policy: RiskPolicy,
) -> CorrelationExposure:
    """
    Calcula riesgo efectivo por clúster correlacionado con la fórmula:

        effective_cluster_risk² =
            Σ(r_i²) + 2 Σ(r_i * r_j * rho_ij * direction_factor)

    Luego:

        effective_cluster_risk = sqrt(max(0, effective_cluster_risk²))

    Notas:
        - r_i se modela aquí en porcentaje de riesgo, no en dinero.
        - el clúster se construye con pares cuya |correlación| supera el umbral
          o son el mismo símbolo.
        - direction_factor introduce la orientación de la exposición.
    """
    if not positions:
        return CorrelationExposure(
            alert=False,
            symbols=[],
            effective_risk_pct=0.0,
            gross_risk_pct=0.0,
            cluster_breakdown=[],
            dashboard_text="Sin posiciones abiertas; no hay exposición correlacionada.",
        )

    adjacency: Dict[int, set[int]] = {index: set() for index in range(len(positions))}
    pair_meta: Dict[tuple[int, int], Dict[str, float]] = {}

    for i, position_i in enumerate(positions):
        for j in range(i + 1, len(positions)):
            position_j = positions[j]
            rho = get_correlation(position_i.symbol, position_j.symbol, policy.symbol_correlation_matrix)
            if not math.isfinite(rho):
                continue
            if abs(rho) < policy.correlation_threshold:
                continue

            adjacency[i].add(j)
            adjacency[j].add(i)
            pair_meta[(i, j)] = {
                "rho": round(rho, 4),
                "direction_factor": float(direction_factor(position_i, position_j)),
            }

    visited: set[int] = set()
    components: List[List[int]] = []
    for root in range(len(positions)):
        if root in visited:
            continue
        stack = [root]
        component: List[int] = []
        while stack:
            node = stack.pop()
            if node in visited:
                continue
            visited.add(node)
            component.append(node)
            stack.extend(adjacency[node] - visited)
        components.append(component)

    cluster_breakdown: List[ClusterDetail] = []
    top_cluster: Optional[ClusterDetail] = None

    for component in components:
        component_positions = [positions[index] for index in component]
        gross_risk_pct = sum(
            position.risk_pct
            for position in component_positions
            if math.isfinite(position.risk_pct) and position.risk_pct > 0
        )

        squared_risk_sum = sum(
            position.risk_pct ** 2
            for position in component_positions
            if math.isfinite(position.risk_pct) and position.risk_pct > 0
        )
        covariance_term = 0.0
        pair_details: List[Dict[str, float]] = []

        for component_index, i in enumerate(component):
            for j in component[component_index + 1:]:
                meta = pair_meta.get((min(i, j), max(i, j)))
                if not meta:
                    continue

                position_i = positions[i]
                position_j = positions[j]
                rho = meta["rho"]
                dir_factor = meta["direction_factor"]
                if not (
                    math.isfinite(position_i.risk_pct)
                    and math.isfinite(position_j.risk_pct)
                    and position_i.risk_pct >= 0
                    and position_j.risk_pct >= 0
                ):
                    continue

                pair_contribution = 2 * position_i.risk_pct * position_j.risk_pct * rho * dir_factor
                if not math.isfinite(pair_contribution):
                    continue
                covariance_term += pair_contribution
                pair_details.append(
                    {
                        "position_i": i,
                        "position_j": j,
                        "rho": round(rho, 4),
                        "direction_factor": dir_factor,
                        "pair_contribution": round(pair_contribution, 6),
                    }
                )

        effective_risk_squared = squared_risk_sum + covariance_term
        if not math.isfinite(effective_risk_squared):
            effective_risk_squared = 0.0
        effective_risk_pct = math.sqrt(max(0.0, effective_risk_squared))
        if not math.isfinite(effective_risk_pct):
            effective_risk_pct = 0.0
        cluster = ClusterDetail(
            symbols=sorted({normalize_symbol(position.symbol) for position in component_positions}),
            position_ids=[position.position_id for position in component_positions],
            pair_count=len(pair_details),
            effective_risk_pct=round(effective_risk_pct, 4),
            gross_risk_pct=round(gross_risk_pct, 4),
            exceeds_limit=len(component_positions) > 1 and effective_risk_pct > policy.max_correlated_risk_pct,
            details=pair_details,
        )
        cluster_breakdown.append(cluster)
        if top_cluster is None or cluster.effective_risk_pct > top_cluster.effective_risk_pct:
            top_cluster = cluster

    assert top_cluster is not None
    alert = top_cluster.exceeds_limit
    if alert:
        dashboard_text = (
            f"Riesgo correlacionado efectivo {top_cluster.effective_risk_pct:.2f}% "
            f"en {', '.join(top_cluster.symbols)}."
        )
    else:
        dashboard_text = "La exposición correlacionada efectiva está dentro del límite."

    return CorrelationExposure(
        alert=alert,
        symbols=top_cluster.symbols,
        effective_risk_pct=top_cluster.effective_risk_pct,
        gross_risk_pct=top_cluster.gross_risk_pct,
        cluster_breakdown=cluster_breakdown,
        dashboard_text=dashboard_text,
    )


def calculate_recovery_metrics(current_equity: float, equity_peak: float) -> RecoveryMetrics:
    if equity_peak <= 0:
        raise ValueError("EQUITY_PEAK debe ser mayor que cero.")
    if current_equity <= 0:
        raise ValueError("La equity actual debe ser mayor que cero.")

    if current_equity >= equity_peak:
        return RecoveryMetrics(
            drawdown_amount=0.0,
            drawdown_pct=0.0,
            recovery_pct=0.0,
            dashboard_text="Equity en peak; no hay drawdown activo.",
        )

    drawdown_amount = equity_peak - current_equity
    drawdown_decimal = drawdown_amount / equity_peak
    if drawdown_decimal >= 0.999999:
        raise ValueError("El drawdown es demasiado extremo para calcular recuperación segura.")

    recovery_pct = (1 / (1 - drawdown_decimal)) - 1
    return RecoveryMetrics(
        drawdown_amount=round(drawdown_amount, 2),
        drawdown_pct=round(drawdown_decimal * 100, 4),
        recovery_pct=round(recovery_pct * 100, 4),
        dashboard_text=(
            f"DD {format_money(drawdown_amount)} ({drawdown_decimal * 100:.2f}%). "
            f"Recuperación requerida {recovery_pct * 100:.2f}%."
        ),
    )


def level_step_down(current_level: str, ladder: Sequence[str]) -> str:
    if current_level not in ladder:
        return ladder[0]
    index = ladder.index(current_level)
    if index == 0:
        return ladder[0]
    return ladder[index - 1]


def evaluate_volatility_signal(
    *,
    current_atr: Optional[float],
    atr_history: Optional[Sequence[float]],
    current_level: str,
    current_recommended_level: str,
    override_active: bool,
    last_volatility_change_at: Optional[datetime],
    confirmation_count: int,
    normalization_count: int,
    now: Optional[datetime],
    policy: RiskPolicy,
) -> tuple[VolatilitySignal, bool, str, int, int, Optional[datetime]]:
    current_time = ensure_aware(now)
    if current_atr is None or not atr_history:
        signal = VolatilitySignal(
            triggered=False,
            previous_level=current_level,
            suggested_level=current_recommended_level,
            atr_ratio=1.0,
            override_active=override_active,
            confirmation_count=confirmation_count,
            cooldown_active=False,
            dashboard_text="Sin datos ATR suficientes; mantener recomendación actual.",
        )
        return signal, override_active, current_recommended_level, confirmation_count, normalization_count, last_volatility_change_at

    history = [
        value
        for value in atr_history[-policy.atr_lookback_days:]
        if isinstance(value, (int, float)) and math.isfinite(value) and value > 0
    ]
    if not history:
        raise ValueError("Se requiere histórico ATR válido.")

    avg_atr = sum(history) / len(history)
    atr_ratio = current_atr / avg_atr
    cooldown_active = False
    if last_volatility_change_at is not None:
        cooldown_active = (current_time - last_volatility_change_at).total_seconds() < policy.volatility_cooldown_minutes * 60

    new_override_active = override_active
    new_recommended_level = current_recommended_level
    new_confirmation_count = confirmation_count
    new_normalization_count = normalization_count
    new_change_at = last_volatility_change_at

    if atr_ratio >= policy.atr_vol_multiplier_threshold:
        new_confirmation_count += 1
        new_normalization_count = 0
        if (
            not override_active
            and new_confirmation_count >= policy.volatility_confirmation_events
            and not cooldown_active
        ):
            new_override_active = True
            new_recommended_level = level_step_down(current_level, policy.risk_ladder)
            new_change_at = current_time
    elif atr_ratio <= policy.atr_release_multiplier_threshold:
        new_normalization_count += 1
        new_confirmation_count = 0
        if (
            override_active
            and new_normalization_count >= policy.volatility_confirmation_events
            and not cooldown_active
        ):
            new_override_active = False
            new_recommended_level = current_level
            new_change_at = current_time
    else:
        new_confirmation_count = 0
        new_normalization_count = 0

    signal = VolatilitySignal(
        triggered=atr_ratio >= policy.atr_vol_multiplier_threshold,
        previous_level=current_level,
        suggested_level=new_recommended_level,
        atr_ratio=round(atr_ratio, 4),
        override_active=new_override_active,
        confirmation_count=max(new_confirmation_count, new_normalization_count),
        cooldown_active=cooldown_active,
        dashboard_text=(
            f"ATR ratio {atr_ratio:.2f}x. "
            f"{'Override activo.' if new_override_active else 'Sin override activo.'}"
        ),
    )
    return (
        signal,
        new_override_active,
        new_recommended_level,
        new_confirmation_count,
        new_normalization_count,
        new_change_at,
    )
