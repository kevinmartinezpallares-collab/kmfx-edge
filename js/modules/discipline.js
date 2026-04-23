import { formatPercent, resolveAccountDataAuthority, selectCurrentAccount, selectCurrentModel } from "./utils.js?v=build-20260406-213500";

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function currentLossStreak(trades = []) {
  let streak = 0;
  for (let index = trades.length - 1; index >= 0; index -= 1) {
    if ((trades[index]?.pnl || 0) < 0) {
      streak += 1;
      continue;
    }
    break;
  }
  return streak;
}

function avgR(trades = []) {
  if (!trades.length) return 0;
  return trades.reduce((sum, trade) => sum + (trade.rMultiple || 0), 0) / trades.length;
}

function tradesPerDay(model) {
  const activeDays = model.dailyReturns?.length || 0;
  if (!activeDays) return 0;
  return model.totals.totalTrades / activeDays;
}

function hourlyBehavior(model) {
  const rows = model.hours || [];
  const peak = [...rows].sort((a, b) => b.trades - a.trades)[0] || { hour: 0, trades: 0, pnl: 0 };
  return {
    peak,
    concentration: model.totals.totalTrades ? (peak.trades / model.totals.totalTrades) * 100 : 0
  };
}

function activeDayConsistency(model) {
  const activeDays = model.dailyReturns?.length || 0;
  const greenDays = model.weekdays?.filter((day) => day.pnl > 0).length || 0;
  if (!activeDays) return 0;
  return (greenDays / activeDays) * 100;
}

function buildDisciplineScore(model) {
  const scoreWinRate = clamp(model.totals.winRate);
  const scoreProfitFactor = clamp((Math.min(model.totals.profitFactor || 0, 3) / 3) * 100);
  const scoreDrawdown = clamp(100 - ((model.totals.drawdown.maxPct || 0) * 8));
  const scoreAvgR = clamp((Math.max(avgR(model.trades), 0) / 2) * 100);
  return Math.round(
    (scoreWinRate * 0.35)
    + (scoreProfitFactor * 0.25)
    + (scoreDrawdown * 0.20)
    + (scoreAvgR * 0.20)
  );
}

function resolveDisciplineLevel(score) {
  if (score >= 75) {
    return {
      label: "Alto",
      copy: "La ejecución mantiene estructura incluso cuando sube la presión."
    };
  }
  if (score >= 55) {
    return {
      label: "Medio",
      copy: "La base es aceptable, pero todavía se rompe cuando el día se complica."
    };
  }
  return {
    label: "Bajo",
    copy: "La operativa se está alejando del plan y necesita límites más claros."
  };
}

function buildPatterns({ model, tradesDay, currentLosses, consistency, hourly, avgRValue }) {
  const drawdownPct = model.totals.drawdown.maxPct || 0;
  const peakHourLabel = `${String(hourly.peak.hour).padStart(2, "0")}:00`;
  const patterns = [];

  if (currentLosses >= 2) {
    patterns.push({
      title: "Sobreoperación tras pérdidas",
      detail: `${currentLosses} pérdidas seguidas elevan la presión y aumentan la probabilidad de forzar la siguiente entrada.`
    });
  }

  if (hourly.concentration >= 30) {
    patterns.push({
      title: "Operativa demasiado concentrada",
      detail: `${Math.round(hourly.concentration)}% de los trades cae en torno a ${peakHourLabel}. Si esa franja sale mal, arrastra el día entero.`
    });
  }

  if (drawdownPct >= 3 || avgRValue < 0.35) {
    patterns.push({
      title: "Riesgo sin suficiente margen",
      detail: `El drawdown alcanza ${formatPercent(drawdownPct)} y el promedio por trade está en ${avgRValue.toFixed(2)}R. La ejecución no compensa el riesgo asumido.`
    });
  }

  if (consistency < 45) {
    patterns.push({
      title: "Consistencia diaria débil",
      detail: `Solo ${Math.round(consistency)}% de la actividad termina en verde. La disciplina cambia demasiado de un día a otro.`
    });
  }

  if (tradesDay > 4.25) {
    patterns.push({
      title: "Exceso de frecuencia",
      detail: `${tradesDay.toFixed(1)} trades por día sugiere una operativa demasiado reactiva para mantener criterio estable.`
    });
  }

  if (!patterns.length) {
    patterns.push({
      title: "Sin patrón dominante claro",
      detail: "No aparece una desviación dominante, pero conviene mantener límites simples para proteger la consistencia."
    });
  }

  return patterns.slice(0, 3);
}

function buildActions({ tradesDay, currentLosses, avgRValue, consistency, model }) {
  const actions = [];
  const drawdownPct = model.totals.drawdown.maxPct || 0;

  if (tradesDay > 3.25) {
    actions.push(`Limita el día a ${Math.max(2, Math.min(4, Math.round(tradesDay)))} trades con criterio claro.`);
  } else {
    actions.push("Mantén un tope simple de 2 a 3 trades para evitar operativa reactiva.");
  }

  if (currentLosses >= 2) {
    actions.push(`Corta la sesión tras ${Math.max(2, currentLosses)} pérdidas seguidas y vuelve solo con contexto nuevo.`);
  } else {
    actions.push("Define un corte automático tras 2 pérdidas seguidas para proteger la ejecución.");
  }

  if (drawdownPct >= 3 || avgRValue < 0.35 || consistency < 45) {
    actions.push("Reduce el riesgo por trade hasta recuperar consistencia y promedio positivo por operación.");
  } else {
    actions.push("Mantén el riesgo estable y evita aumentarlo mientras la consistencia no mejore.");
  }

  return actions.slice(0, 3);
}

export function renderDiscipline(root, state) {
  const account = selectCurrentAccount(state);
  const model = selectCurrentModel(state);
  if (!model) {
    root.innerHTML = "";
    return;
  }

  const authority = resolveAccountDataAuthority(account);
  console.info("[KMFX][DISCIPLINE_AUTHORITY]", {
    account_id: account?.id || "",
    login: account?.login || "",
    broker: account?.broker || "",
    payloadSource: authority.payloadSource,
    tradeCount: authority.tradeCount,
    historyPoints: authority.historyPoints,
    firstTradeLabel: authority.firstTradeLabel,
    lastTradeLabel: authority.lastTradeLabel,
    sourceUsed: authority.sourceUsed,
  });

  const disciplineScore = buildDisciplineScore(model);
  const disciplineLevel = resolveDisciplineLevel(disciplineScore);
  const currentLosses = currentLossStreak(model.trades);
  const tradesDay = tradesPerDay(model);
  const hourly = hourlyBehavior(model);
  const consistency = activeDayConsistency(model);
  const avgRValue = avgR(model.trades);
  const patterns = buildPatterns({ model, tradesDay, currentLosses, consistency, hourly, avgRValue });
  const actions = buildActions({ tradesDay, currentLosses, avgRValue, consistency, model });

  root.innerHTML = `
    <div class="tl-page-header">
      <div class="tl-page-title">Disciplina</div>
      <div class="tl-page-sub">Detecta los hábitos que sostienen tu ejecución y los que empiezan a romper tu plan.</div>
    </div>

    <div class="discipline-page-stack">
      <div class="tl-kpi-row discipline-kpi-row discipline-kpi-row--compact">
        <article class="tl-kpi-card discipline-kpi-card discipline-kpi-card--score">
          <div class="tl-kpi-label">Disciplina</div>
          <div class="tl-kpi-val">${disciplineLevel.label}</div>
          <div class="row-sub">${disciplineScore}/100 · ${disciplineLevel.copy}</div>
        </article>
        <article class="tl-kpi-card discipline-kpi-card">
          <div class="tl-kpi-label">Consistencia</div>
          <div class="tl-kpi-val">${Math.round(consistency)}%</div>
          <div class="row-sub">Días con resultado verde sobre actividad registrada.</div>
        </article>
        <article class="tl-kpi-card discipline-kpi-card">
          <div class="tl-kpi-label">Trades por día</div>
          <div class="tl-kpi-val">${tradesDay.toFixed(1)}</div>
          <div class="row-sub">${model.totals.totalTrades} trades en ${model.dailyReturns.length} días activos.</div>
        </article>
      </div>

      <article class="tl-section-card discipline-section-card">
        <div class="tl-section-header discipline-section-header">
          <div>
            <div class="tl-section-title">Patrones de comportamiento</div>
            <div class="tl-section-sub">Qué hábito se repite más y dónde empieza a deteriorarse la ejecución.</div>
          </div>
        </div>
        <div class="discipline-pattern-list">
          ${patterns.map((pattern) => `
            <div class="discipline-pattern-item">
              <strong>${pattern.title}</strong>
              <p>${pattern.detail}</p>
            </div>
          `).join("")}
        </div>
      </article>

      <article class="tl-section-card discipline-section-card discipline-section-card--action">
        <div class="tl-section-header discipline-section-header">
          <div>
            <div class="tl-section-title">Qué hacer ahora</div>
            <div class="tl-section-sub">Tres límites simples para proteger la sesión y recuperar estructura.</div>
          </div>
        </div>
        <div class="discipline-action-list">
          ${actions.map((action, index) => `
            <div class="discipline-action-item">
              <span>${index + 1}</span>
              <p>${action}</p>
            </div>
          `).join("")}
        </div>
      </article>
    </div>
  `;
}
