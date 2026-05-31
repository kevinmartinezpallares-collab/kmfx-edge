import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { getRiskGuardPosture } from "@/lib/domain/risk-selectors";

export type RiskGuardAlert = {
  tone: "danger" | "warning" | "info";
  label: string;
  reason: string;
};

function pushUniqueAlert(alerts: RiskGuardAlert[], alert: RiskGuardAlert) {
  if (alerts.some((item) => item.label === alert.label && item.tone === alert.tone)) {
    return;
  }

  alerts.push(alert);
}

export function getRiskGuardAlerts(
  workspace: WorkspaceState,
  maxAlerts = 4,
): RiskGuardAlert[] {
  const posture = getRiskGuardPosture(workspace);
  const alerts: RiskGuardAlert[] = [];

  if (!posture.allowNewTrades || posture.status === "blocked") {
    pushUniqueAlert(alerts, {
      tone: "danger",
      label: "Trading bloqueado",
      reason: workspace.risk.blockingRule || workspace.risk.actionRequired,
    });
  }

  if (posture.dailyUsagePct >= 90) {
    pushUniqueAlert(alerts, {
      tone: "danger",
      label: "Daily DD al limite",
      reason: "El consumo del limite diario supera el 90%.",
    });
  } else if (posture.dailyUsagePct >= 70) {
    pushUniqueAlert(alerts, {
      tone: "warning",
      label: "Daily DD en vigilancia",
      reason: "El consumo del limite diario supera el 70%.",
    });
  }

  if (posture.heatUsagePct >= 90) {
    pushUniqueAlert(alerts, {
      tone: "danger",
      label: "Heat casi lleno",
      reason: "El riesgo abierto esta cerca del limite de heat.",
    });
  } else if (posture.heatUsagePct >= 70) {
    pushUniqueAlert(alerts, {
      tone: "warning",
      label: "Heat elevado",
      reason: "El riesgo abierto supera el 70% del limite de heat.",
    });
  }

  if (posture.dominantExposure && posture.dominantSharePct >= 60) {
    pushUniqueAlert(alerts, {
      tone: "warning",
      label: `Concentracion ${posture.dominantExposure.symbol}`,
      reason: "Un simbolo concentra al menos el 60% del open risk visible.",
    });
  }

  posture.accountPostures.forEach((account) => {
    if (account.roomLeftPct > 2) return;

    pushUniqueAlert(alerts, {
      tone: account.status === "blocked" ? "danger" : "warning",
      label: `${account.accountLabel} con poco room`,
      reason: "La cuenta tiene margen diario reducido antes de la siguiente entrada.",
    });
  });

  return alerts.slice(0, Math.max(1, Math.min(6, maxAlerts)));
}
