import { badgeMarkup } from "./status-badges.js?v=build-20260401-203500";
import { formatPercent } from "./utils.js?v=build-20260401-203500";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function recentWinRate(model, sample = 10) {
  const recent = [...(model.trades || [])].slice(-sample);
  if (!recent.length) return model.totals?.winRate || 0;
  const wins = recent.filter((trade) => trade.pnl > 0).length;
  return (wins / recent.length) * 100;
}

export function computeRiskAlerts(model, account = {}) {
  const alerts = [];
  const maxDdLimit = Number(account.maxDrawdownLimit || model.account?.maxDrawdownLimit || 10);
  const drawdown = Number(model.totals?.drawdown?.maxPct || 0);
  const ddUsage = maxDdLimit ? (drawdown / maxDdLimit) * 100 : 0;
  const lossStreak = Number(model.streaks?.bestLoss || 0);
  const totalWinRate = Number(model.totals?.winRate || 0);
  const lastTenWinRate = recentWinRate(model, 10);
  const weekly = Array.isArray(model.weekly) ? model.weekly : [];
  const avgTrades = weekly.length ? weekly.reduce((sum, day) => sum + (day.trades || 0), 0) / weekly.length : 0;
  const peakTrades = weekly.length ? Math.max(...weekly.map((day) => day.trades || 0), 0) : 0;

  if (ddUsage >= 90 || drawdown >= 8) {
    alerts.push({ tone: "error", label: `DD alto ${formatPercent(drawdown)}` });
  } else if (ddUsage >= 70 || drawdown >= 5) {
    alerts.push({ tone: "warn", label: `DD en vigilancia ${formatPercent(drawdown)}` });
  }

  if (lossStreak >= 6) {
    alerts.push({ tone: "error", label: `Racha loss ${lossStreak}` });
  } else if (lossStreak >= 4) {
    alerts.push({ tone: "warn", label: `Racha loss ${lossStreak}` });
  }

  if (lastTenWinRate <= totalWinRate - 18 || (lastTenWinRate < 35 && totalWinRate < 50)) {
    alerts.push({ tone: "error", label: `WR en caída ${Math.round(lastTenWinRate)}%` });
  } else if (lastTenWinRate <= totalWinRate - 10 || lastTenWinRate < 45) {
    alerts.push({ tone: "warn", label: `WR bajando ${Math.round(lastTenWinRate)}%` });
  }

  if (peakTrades >= Math.max(8, avgTrades * 2.1)) {
    alerts.push({ tone: "error", label: `Overtrading ${peakTrades} trades` });
  } else if (peakTrades >= Math.max(6, avgTrades * 1.7)) {
    alerts.push({ tone: "warn", label: `Overtrading detectado` });
  }

  const unique = [];
  const seen = new Set();
  alerts.forEach((alert) => {
    const key = `${alert.tone}:${alert.label}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(alert);
    }
  });
  return unique.slice(0, 4);
}

export function riskAlertsMarkup(alerts = [], max = 3) {
  if (!alerts.length) return "";
  return `
    <div class="risk-alert-row" aria-label="Risk alerts">
      ${alerts.slice(0, clamp(max, 1, 6)).map((alert) => badgeMarkup(alert, "ui-badge--compact")).join("")}
    </div>
  `;
}
