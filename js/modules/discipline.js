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
      title: "Disciplina alta",
      copy: "La ejecución mantiene estructura incluso cuando sube la presión."
    };
  }
  if (score >= 55) {
    return {
      label: "Medio",
      title: "Disciplina inestable",
      copy: "La base es aceptable, pero todavía se rompe cuando el día se complica."
    };
  }
  return {
    label: "Bajo",
    title: "Disciplina baja",
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
      detail: `${currentLosses} pérdidas seguidas elevan la presión y hacen que suba la frecuencia mientras baja la calidad.`,
      short: `${currentLosses} pérdidas seguidas están disparando la urgencia por recuperar.`
    });
  }

  if (hourly.concentration >= 30) {
    patterns.push({
      title: "Operativa demasiado concentrada",
      detail: `${Math.round(hourly.concentration)}% de los trades cae en torno a ${peakHourLabel}. Si esa franja sale mal, arrastra el día entero.`,
      short: `${Math.round(hourly.concentration)}% de la actividad cae en una sola franja.`
    });
  }

  if (drawdownPct >= 3 || avgRValue < 0.35) {
    patterns.push({
      title: "Riesgo sin suficiente margen",
      detail: `El drawdown alcanza ${formatPercent(drawdownPct)} y el promedio por trade está en ${avgRValue.toFixed(2)}R. La ejecución no compensa el riesgo asumido.`,
      short: `El margen actual no compensa el riesgo que estás dejando entrar.`
    });
  }

  if (consistency < 45) {
    patterns.push({
      title: "Consistencia diaria débil",
      detail: `Solo ${Math.round(consistency)}% de la actividad termina en verde. La disciplina cambia demasiado de un día a otro.`,
      short: `La ejecución cambia demasiado de un día a otro.`
    });
  }

  if (tradesDay > 4.25) {
    patterns.push({
      title: "Exceso de frecuencia",
      detail: `${tradesDay.toFixed(1)} trades por día sugiere una operativa demasiado reactiva para mantener criterio estable.`,
      short: `${tradesDay.toFixed(1)} trades por día está empujando una operativa reactiva.`
    });
  }

  if (!patterns.length) {
    patterns.push({
      title: "Sin patrón dominante claro",
      detail: "No aparece una desviación dominante, pero conviene mantener límites simples para proteger la consistencia.",
      short: "No hay una desviación dominante, pero conviene mantener límites simples."
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

function buildDisciplineHeroAlerts(patterns = []) {
  return patterns.slice(0, 3).map((pattern) => pattern.title);
}

function buildDisciplineInsight(patterns = [], consistency = 0, tradesDay = 0) {
  const dominant = patterns[0];
  if (!dominant) return "La ejecución necesita límites simples para no degradarse bajo presión.";
  if (dominant.title === "Sobreoperación tras pérdidas") {
    return `Cuando llega una racha negativa, la frecuencia sube antes de que vuelva la calidad.`;
  }
  if (dominant.title === "Riesgo sin suficiente margen") {
    return "La operativa está dejando entrar más riesgo del que la sesión puede absorber con consistencia.";
  }
  if (dominant.title === "Consistencia diaria débil") {
    return `La estructura no está siendo repetible: ${Math.round(consistency)}% de días verdes no basta para sostener confianza.`;
  }
  return tradesDay > 4
    ? "La actividad se vuelve reactiva y empieza a romper el criterio de entrada."
    : dominant.short;
}

function buildDisciplineDecision(actions = [], tradesDay = 0, currentLosses = 0) {
  const maxTrades = tradesDay > 3.25 ? Math.max(2, Math.min(4, Math.round(tradesDay))) : 3;
  const stopLosses = currentLosses >= 2 ? Math.max(2, currentLosses) : 2;
  return {
    headline: `Hoy: máximo ${maxTrades} trades y sesión cerrada tras ${stopLosses} pérdidas.`,
    detail: actions.slice(0, 2)
  };
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
  const heroAlerts = buildDisciplineHeroAlerts(patterns);
  const insight = buildDisciplineInsight(patterns, consistency, tradesDay);
  const decision = buildDisciplineDecision(actions, tradesDay, currentLosses);
  const dominantPattern = patterns[0];
  const secondaryPatterns = patterns.slice(1, 3);

  root.innerHTML = `
    <div class="discipline-page-stack">
      <article class="tl-section-card discipline-hero">
        <div class="discipline-hero__copy">
          <div class="eyebrow">Estado de disciplina</div>
          <h3>${disciplineLevel.title}</h3>
          <p>${disciplineLevel.copy}</p>
          ${heroAlerts.length ? `<div class="discipline-hero__alerts">${heroAlerts.map((alert) => `<span class="analytics-risk-engine__state analytics-risk-engine__state--neutral">${alert}</span>`).join("")}</div>` : ""}
        </div>
        <div class="discipline-hero__signal">
          <span class="discipline-hero__signal-label">Señal dominante</span>
          <strong>${dominantPattern.title}</strong>
          <small>${dominantPattern.short || dominantPattern.detail}</small>
        </div>
      </article>

      <div class="discipline-kpis">
        <article class="tl-section-card discipline-kpi">
          <span class="discipline-kpi__label">Consistencia</span>
          <strong class="discipline-kpi__value">${Math.round(consistency)}%</strong>
          <small>Días verdes sobre actividad registrada.</small>
        </article>
        <article class="tl-section-card discipline-kpi">
          <span class="discipline-kpi__label">Trades por día</span>
          <strong class="discipline-kpi__value">${tradesDay.toFixed(1)}</strong>
          <small>${model.totals.totalTrades} trades en ${model.dailyReturns.length} días activos.</small>
        </article>
      </div>

      <div class="discipline-grid">
        <article class="tl-section-card discipline-behavior">
          <div class="tl-section-header discipline-section-header">
            <div>
              <div class="tl-section-title">Qué está rompiendo la disciplina</div>
              <div class="row-sub">Problema principal y fricciones secundarias</div>
            </div>
          </div>
          <div class="discipline-behavior__list">
            <div class="discipline-behavior-row discipline-behavior-row--dominant">
              <div class="discipline-behavior-row__copy">
                <strong>${dominantPattern.title}</strong>
                <span>${dominantPattern.short || dominantPattern.detail}</span>
              </div>
            </div>
            ${secondaryPatterns.map((pattern) => `
              <div class="discipline-behavior-row">
                <div class="discipline-behavior-row__copy">
                  <strong>${pattern.title}</strong>
                  <span>${pattern.short || pattern.detail}</span>
                </div>
              </div>
            `).join("")}
          </div>
        </article>

        <div class="discipline-side">
          <article class="tl-section-card discipline-copy-card">
            <div class="tl-section-header discipline-section-header">
              <div>
                <div class="tl-section-title">Insight</div>
              </div>
            </div>
            <p>${insight}</p>
          </article>
          <article class="tl-section-card discipline-copy-card discipline-copy-card--decision">
            <div class="tl-section-header discipline-section-header">
              <div>
                <div class="tl-section-title">Decisión</div>
              </div>
            </div>
            <div class="discipline-decision">
              <strong>${decision.headline}</strong>
              <div class="discipline-decision__rules">
                ${decision.detail.map((rule) => `<small>${rule}</small>`).join("")}
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  `;
}
