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
      label: "Alta",
      title: "Disciplina alta",
      copy: "Estás respetando tu plan con bastante regularidad."
    };
  }
  if (score >= 55) {
    return {
      label: "Inestable",
      title: "Disciplina inestable",
      copy: "Hay sesiones ordenadas, pero todavía cambias hábitos cuando cambia el resultado."
    };
  }
  return {
    label: "Baja",
    title: "Disciplina baja",
    copy: "Estás rompiendo tu plan en momentos clave."
  };
}

function buildPatterns({ model, tradesDay, currentLosses, consistency, avgRValue }) {
  const drawdownPct = model.totals.drawdown.maxPct || 0;
  const patterns = [];

  if (currentLosses >= 2) {
    patterns.push({
      title: "Sobreoperación tras pérdidas",
      detail: `${currentLosses} pérdidas seguidas elevan la presión y hacen que suba la frecuencia mientras baja la calidad.`,
      short: `${currentLosses} pérdidas seguidas están disparando la urgencia por recuperar.`
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

function buildPatternBullets(dominantPattern, { currentLosses, tradesDay, avgRValue, consistency }) {
  if (dominantPattern.title === "Sobreoperación tras pérdidas") {
    return [
      `${currentLosses} pérdidas seguidas aumentan la urgencia por recuperar.`,
      `La frecuencia sube hasta ${tradesDay.toFixed(1)} trades por día cuando baja la calidad.`,
      "El día se alarga justo cuando el criterio debería estrecharse."
    ];
  }
  if (dominantPattern.title === "Riesgo sin suficiente margen") {
    return [
      `El promedio por trade está en ${avgRValue.toFixed(2)}R y deja poco colchón para absorber error.`,
      "El tamaño del riesgo cambia más rápido que la calidad de ejecución.",
      "Una sesión floja tarda demasiado en estabilizarse."
    ];
  }
  if (dominantPattern.title === "Consistencia diaria débil") {
    return [
      `${Math.round(consistency)}% de días verdes no basta para consolidar rutina.`,
      "La ejecución cambia demasiado de un día a otro.",
      "Cuesta repetir el mismo criterio cuando el resultado se tuerce."
    ];
  }
  if (dominantPattern.title === "Exceso de frecuencia") {
    return [
      `${tradesDay.toFixed(1)} trades por día empujan una operativa más reactiva que intencional.`,
      "La selección pierde calidad cuando el día se acelera.",
      "Entras más por necesidad de participar que por contexto."
    ];
  }
  return [
    "No aparece una desviación única, pero el hábito aún no es estable.",
    "La calidad de ejecución cambia demasiado entre sesiones.",
    "Conviene simplificar la rutina para repetir mejor el plan."
  ];
}

function buildRepeatedErrors(patterns = []) {
  return patterns.slice(1, 4).map((pattern) => ({
    title: pattern.title,
    copy: pattern.short || pattern.detail
  }));
}

function buildDisciplineRuleSet(tradesDay = 0, currentLosses = 0) {
  const tradeCap = tradesDay > 3.25 ? 3 : 2;
  const pauseAfterLosses = currentLosses >= 2 ? Math.max(2, currentLosses) : 2;
  return [
    `Máximo ${tradeCap} trades al día.`,
    `Corta la sesión tras ${pauseAfterLosses} pérdidas seguidas.`,
    "Mantén el mismo riesgo por trade durante toda la sesión."
  ];
}

function buildRecentDays(model, tradeCap = 3) {
  const recent = [...(model.dailyReturns || [])].slice(-7);
  return recent.map((day) => {
    const disciplined = day.trades <= tradeCap && day.returnPct >= -0.25;
    return {
      key: day.key,
      label: new Date(day.date || day.key).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }),
      trades: day.trades,
      pnl: day.pnl,
      disciplined
    };
  });
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
  const consistency = activeDayConsistency(model);
  const avgRValue = avgR(model.trades);
  const patterns = buildPatterns({ model, tradesDay, currentLosses, consistency, avgRValue });
  const dominantPattern = patterns[0];
  const repeatedErrors = buildRepeatedErrors(patterns);
  const disciplineRules = buildDisciplineRuleSet(tradesDay, currentLosses);
  const recentDays = buildRecentDays(model, Number(disciplineRules[0].match(/\d+/)?.[0] || 3));
  const disciplinedDays = recentDays.filter((day) => day.disciplined).length;
  const undisciplinedDays = recentDays.length - disciplinedDays;
  const patternBullets = buildPatternBullets(dominantPattern, { currentLosses, tradesDay, avgRValue, consistency });

  root.innerHTML = `
    <div class="discipline-page-stack kmfx-page kmfx-page--spacious">
      <header class="kmfx-page__header">
        <div class="kmfx-page__copy">
          <p class="kmfx-page__eyebrow">DISCIPLINA</p>
          <h2 class="kmfx-page__title">Disciplina</h2>
          <p class="kmfx-page__subtitle">Cómo estás ejecutando tu plan y qué hábitos afectan tu consistencia.</p>
        </div>
      </header>

      <article class="tl-section-card discipline-status">
        <div class="discipline-status__state">Disciplina: ${disciplineLevel.label}</div>
        <p class="discipline-status__copy">${disciplineLevel.copy}</p>
      </article>

      <div class="discipline-main-grid">
        <article class="tl-section-card discipline-pattern">
          <div class="tl-section-header discipline-section-header">
            <div>
              <div class="tl-section-title">Tu patrón actual</div>
            </div>
          </div>
          <div class="discipline-pattern__hero">
            <strong>${dominantPattern.title}</strong>
            <p>${dominantPattern.short || dominantPattern.detail}</p>
          </div>
          <ul class="discipline-pattern__bullets">
            ${patternBullets.map((bullet) => `<li>${bullet}</li>`).join("")}
          </ul>
        </article>

        <article class="tl-section-card discipline-recent">
          <div class="tl-section-header discipline-section-header">
            <div>
              <div class="tl-section-title">Últimos días</div>
            </div>
          </div>
          <div class="discipline-recent__summary">
            <div class="discipline-recent__metric">
              <strong>${disciplinedDays}</strong>
              <span>Días disciplinados</span>
            </div>
            <div class="discipline-recent__metric">
              <strong>${undisciplinedDays}</strong>
              <span>Días no disciplinados</span>
            </div>
          </div>
          <div class="discipline-recent__days">
            ${recentDays.length ? recentDays.map((day) => `
              <div class="discipline-recent__day ${day.disciplined ? "is-disciplined" : "is-undisciplined"}">
                <strong>${day.label}</strong>
                <span>${day.trades} ${day.trades === 1 ? "trade" : "trades"}</span>
              </div>
            `).join("") : `<div class="discipline-recent__empty">Aún no hay días suficientes para detectar hábito.</div>`}
          </div>
        </article>
      </div>

      <div class="discipline-kpis">
        <article class="tl-section-card discipline-kpi">
          <span class="discipline-kpi__label">Consistencia</span>
          <strong class="discipline-kpi__value">${Math.round(consistency)}%</strong>
          <small>Días verdes sobre actividad registrada.</small>
        </article>
        <article class="tl-section-card discipline-kpi">
          <span class="discipline-kpi__label">Trades por día</span>
          <strong class="discipline-kpi__value">${tradesDay.toFixed(1)}</strong>
          <small>${model.totals.totalTrades} ${model.totals.totalTrades === 1 ? "trade" : "trades"} en ${model.dailyReturns.length} días activos.</small>
        </article>
      </div>

      <div class="discipline-support-grid">
        <article class="tl-section-card discipline-rules">
          <div class="tl-section-header discipline-section-header">
            <div>
              <div class="tl-section-title">Regla de disciplina</div>
            </div>
          </div>
          <ul class="discipline-rules__list">
            ${disciplineRules.map((rule) => `<li>${rule}</li>`).join("")}
          </ul>
        </article>

        <article class="tl-section-card discipline-errors">
          <div class="tl-section-header discipline-section-header">
            <div>
              <div class="tl-section-title">Errores repetidos</div>
            </div>
          </div>
          <div class="discipline-errors__list">
            ${repeatedErrors.length ? repeatedErrors.map((pattern) => `
              <div class="discipline-errors__item">
                <strong>${pattern.title}</strong>
                <span>${pattern.copy}</span>
              </div>
            `).join("") : `<div class="discipline-errors__empty">No aparece un error repetido secundario claro.</div>`}
          </div>
        </article>
      </div>
    </div>
  `;
}
