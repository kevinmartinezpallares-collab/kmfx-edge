import { resolveAccountDataAuthority, selectCurrentAccount, selectCurrentModel } from "./utils.js?v=build-20260406-213500";

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
  return trades.reduce((sum, trade) => sum + (Number(trade.rMultiple) || 0), 0) / trades.length;
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

function resolveTradeCap(tradesDay = 0) {
  if (tradesDay > 4) return 3;
  if (tradesDay > 2.25) return 2;
  return 1;
}

function estimateDayAdherence(day, tradeCap) {
  if (!day) return null;
  let score = 100;
  const extraTrades = Math.max(0, (day.trades || 0) - tradeCap);
  score -= extraTrades * 22;
  if ((day.returnPct || 0) < -0.25) score -= 16;
  if ((day.pnl || 0) < 0 && (day.trades || 0) > tradeCap) score -= 14;
  return clamp(Math.round(score));
}

function buildRecentDays(model, tradeCap) {
  const recent = [...(model.dailyReturns || [])].slice(-10);
  const mapped = recent.map((day) => {
    const adherence = estimateDayAdherence(day, tradeCap);
    return {
      key: day.key,
      label: new Date(day.date || day.key).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }),
      trades: day.trades || 0,
      adherence,
      state: adherence >= 65 ? "disciplined" : "broken",
      title: adherence >= 65
        ? `${day.trades || 0} ${(day.trades || 0) === 1 ? "trade" : "trades"} dentro del plan estimado`
        : `${day.trades || 0} ${(day.trades || 0) === 1 ? "trade" : "trades"} con ruptura del plan estimado`
    };
  });

  while (mapped.length < 10) {
    mapped.unshift({
      key: `empty-${mapped.length}`,
      label: "—",
      trades: 0,
      adherence: null,
      state: "empty",
      title: "Sin datos"
    });
  }

  return mapped;
}

function buildAdherenceMeta(model, consistency, tradesDay, currentLosses, avgRValue) {
  const tradeCap = resolveTradeCap(tradesDay);
  const recentDays = buildRecentDays(model, tradeCap);
  const scoredDays = recentDays.filter((day) => Number.isFinite(day.adherence));
  const adherence = scoredDays.length ? Math.round(average(scoredDays.map((day) => day.adherence))) : Math.round(clamp((consistency * 0.6) + (clamp(100 - Math.max(0, tradesDay - tradeCap) * 22) * 0.4)));
  const score = Math.round(clamp((adherence * 0.72) + (consistency * 0.18) + (clamp(100 - currentLosses * 14) * 0.10)));
  const brokenTradesPer10 = Math.max(0, Math.min(10, Math.round((100 - adherence) / 10)));
  return {
    tradeCap,
    recentDays,
    adherence,
    score,
    brokenTradesPer10,
    avgRValue
  };
}

function resolveDisciplineLevel(score) {
  if (score >= 75) {
    return {
      label: "Ejecución sólida",
      copy: "Estás aplicando el sistema con estabilidad reciente."
    };
  }
  if (score >= 55) {
    return {
      label: "Inestable",
      copy: "Tu aplicación del sistema cambia cuando aparece presión."
    };
  }
  return {
    label: "Ejecución deteriorada",
    copy: "Tu operativa se desvía del modelo en momentos de presión."
  };
}

function buildViolations(model, { tradesDay, currentLosses, consistency, avgRValue }) {
  const violations = [];
  const sessions = [...(model.sessions || [])];
  const strongestSession = [...sessions].sort((a, b) => b.pnl - a.pnl)[0];
  const weakestSession = [...sessions].sort((a, b) => a.pnl - b.pnl)[0];
  const drawdownPct = Number(model.totals?.drawdown?.maxPct || 0);

  if (currentLosses >= 1 || tradesDay > 2.4) {
    violations.push({
      title: "Sobreoperación tras pérdidas",
      impact: "Sube la frecuencia cuando baja la calidad.",
      severity: currentLosses >= 2 ? "high" : "medium",
      weight: 100 + (currentLosses * 18) + (tradesDay * 8),
      pattern: "Tras 1–2 pérdidas, aumentas frecuencia y baja la calidad."
    });
  }

  if (weakestSession && strongestSession && weakestSession.key !== strongestSession.key && weakestSession.pnl < 0 && weakestSession.trades >= 2) {
    violations.push({
      title: "Operas fuera de tu ventana fuerte",
      impact: `Sales de ${strongestSession.key} y baja el contexto.`,
      severity: weakestSession.pnl < strongestSession.pnl * -0.35 ? "medium" : "low",
      weight: 70 + Math.abs(weakestSession.pnl) / 50,
      pattern: `Cuando sales de ${strongestSession.key}, el rendimiento cae y la ejecución pierde contexto.`
    });
  }

  if (drawdownPct >= 3 || avgRValue < 0.3) {
    violations.push({
      title: "Subes riesgo en días negativos",
      impact: "El riesgo cambia cuando el día se complica.",
      severity: drawdownPct >= 5 ? "high" : "medium",
      weight: 68 + (drawdownPct * 6),
      pattern: "En días flojos, el riesgo deja de ser estable y agrava el deterioro de ejecución."
    });
  }

  if (consistency < 45) {
    violations.push({
      title: "La rutina no se sostiene",
      impact: "Cuesta repetir el mismo plan varios días.",
      severity: consistency < 35 ? "high" : "low",
      weight: 62 + (45 - consistency),
      pattern: "Repites menos el plan de lo que necesitas para convertirlo en hábito estable."
    });
  }

  if (!violations.length) {
    violations.push({
      title: "No aparece una violación dominante",
      impact: "La muestra reciente no marca un error claro.",
      severity: "low",
      weight: 10,
      pattern: "No aparece un hábito claro que esté deteriorando la adherencia reciente."
    });
  }

  return violations.sort((a, b) => b.weight - a.weight).slice(0, 3);
}

function buildExecutionRules(tradeCap, currentLosses) {
  return [
    `Máx ${Math.max(2, tradeCap)} trades por sesión`,
    `Cortar tras ${Math.max(2, currentLosses || 2)} pérdidas`,
    "Mantener riesgo constante"
  ];
}

function buildExecutionPills(violations = []) {
  const labels = violations.map((violation) => {
    if (violation.title === "Operas fuera de tu ventana fuerte") return "Fuera de ventana fuerte";
    if (violation.title === "Subes riesgo en días negativos") return "Riesgo inconsistente";
    if (violation.title === "Sobreoperación tras pérdidas") return "Frecuencia tras pérdidas";
    return violation.title;
  });
  return [...new Set(labels)].slice(0, 3);
}

function resolveRiskVisibility(account, model) {
  const riskProfile = model?.riskProfile || {};
  const riskSnapshot = account?.riskSnapshot && typeof account.riskSnapshot === "object"
    ? account.riskSnapshot
    : account?.dashboardPayload?.riskSnapshot && typeof account.dashboardPayload.riskSnapshot === "object"
      ? account.dashboardPayload.riskSnapshot
      : null;
  const connectionConnected = Boolean(account?.connection?.connected);
  const snapshotPolicy = riskSnapshot?.policy && typeof riskSnapshot.policy === "object" ? riskSnapshot.policy : {};
  const profileAutoBlock = Boolean(riskProfile?.autoBlock);
  const snapshotAutoBlock = Boolean(snapshotPolicy.auto_block_enabled);
  const hasLocalSnapshot = Boolean(riskSnapshot);

  if (hasLocalSnapshot && !connectionConnected) return "Error de sincronización";
  if (!connectionConnected && !hasLocalSnapshot) return "No configurada";
  if (connectionConnected && snapshotAutoBlock) return "Protección configurada";
  if (profileAutoBlock || snapshotAutoBlock) return "Protección configurada";
  return "No configurada";
}

function buildInsight(dominantViolation) {
  if (dominantViolation.title === "Sobreoperación tras pérdidas") {
    return "Tu problema no es el setup: es la ejecución cuando el resultado se gira en contra.";
  }
  if (dominantViolation.title === "Operas fuera de tu ventana fuerte") {
    return "Tu problema no es el setup: es la ejecución fuera de contexto.";
  }
  if (dominantViolation.title === "Subes riesgo en días negativos") {
    return "El daño no viene solo del día flojo: aparece cuando el riesgo deja de ser constante.";
  }
  return "La ejecución mejora cuando repites el proceso, no cuando persigues compensar el último resultado.";
}

export function renderDiscipline(root, state) {
  const account = selectCurrentAccount(state);
  const model = selectCurrentModel(state);
  if (!model) {
    root.innerHTML = "";
    return;
  }

  const authority = resolveAccountDataAuthority(account);
  console.info("[KMFX][EXECUTION_AUTHORITY]", {
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

  const currentLosses = currentLossStreak(model.trades);
  const tradesDay = tradesPerDay(model);
  const consistency = activeDayConsistency(model);
  const avgRValue = avgR(model.trades);
  const adherenceMeta = buildAdherenceMeta(model, consistency, tradesDay, currentLosses, avgRValue);
  const disciplineLevel = resolveDisciplineLevel(adherenceMeta.score);
  const violations = buildViolations(model, { tradesDay, currentLosses, consistency, avgRValue });
  const dominantViolation = violations[0];
  const executionRules = buildExecutionRules(adherenceMeta.tradeCap, currentLosses);
  const executionPills = buildExecutionPills(violations);
  const riskVisibility = resolveRiskVisibility(account, model);
  const brokenDays = adherenceMeta.recentDays.filter((day) => day.state === "broken").length;

  root.innerHTML = `
    <div class="discipline-page-stack kmfx-page kmfx-page--spacious">
      <header class="kmfx-page__header">
        <div class="kmfx-page__copy">
          <p class="kmfx-page__eyebrow">EJECUCIÓN</p>
          <h2 class="kmfx-page__title">Ejecución</h2>
          <p class="kmfx-page__subtitle">Cómo estás aplicando tu sistema y dónde se degrada.</p>
        </div>
      </header>

      <article class="tl-section-card discipline-state">
        <div class="discipline-state__copy">
          <span class="discipline-state__label">Estado</span>
          <strong class="discipline-state__title">${disciplineLevel.label}</strong>
          <p class="discipline-state__copy-text">${disciplineLevel.copy}</p>
          ${executionPills.length ? `<div class="discipline-state__pills">${executionPills.map((pill) => `<span>${pill}</span>`).join("")}</div>` : ""}
        </div>
        <div class="discipline-state__deviation">
          <span>Desviación dominante</span>
          <strong>${dominantViolation.title}</strong>
          <p>${dominantViolation.pattern}</p>
        </div>
      </article>

      <article class="tl-section-card discipline-trend">
        <div class="tl-section-header discipline-section-header">
          <div>
            <div class="tl-section-title">Comportamiento reciente</div>
            <div class="row-sub">${brokenDays} de los últimos 10 días rompen el plan.</div>
          </div>
        </div>
        <div class="discipline-trend__strip">
          ${adherenceMeta.recentDays.map((day) => `
            <div class="discipline-trend__day is-${day.state}" title="${day.title}">
              <strong>${day.label}</strong>
              <span>${day.state === "disciplined" ? "Cumplió" : day.state === "broken" ? "Rompió" : "Sin datos"}</span>
            </div>
          `).join("")}
        </div>
      </article>

      <article class="tl-section-card discipline-adherence">
        <div class="tl-section-header discipline-section-header">
          <div>
            <div class="tl-section-title">Adherencia al proceso</div>
          </div>
        </div>
        <div class="discipline-adherence__value">${adherenceMeta.adherence}%</div>
        <p class="discipline-adherence__copy">${adherenceMeta.brokenTradesPer10} de cada 10 trades no cumplen el playbook.</p>
      </article>

      <div class="discipline-detail-grid">
        <article class="tl-section-card discipline-violations">
          <div class="tl-section-header discipline-section-header">
            <div>
              <div class="tl-section-title">Desviaciones del proceso</div>
            </div>
          </div>
          <div class="discipline-violations__list">
            ${violations.map((violation) => `
              <div class="discipline-violations__item">
                <strong>${violation.title}</strong>
                <span>${violation.impact}</span>
              </div>
            `).join("")}
          </div>
        </article>

        <article class="tl-section-card discipline-rule-card">
          <div class="tl-section-header discipline-section-header">
            <div>
              <div class="tl-section-title">Regla de ejecución</div>
            </div>
          </div>
          <ul class="discipline-rule-card__list">
            ${executionRules.map((rule) => `<li>${rule}</li>`).join("")}
          </ul>
        </article>
      </div>

      <article class="tl-section-card discipline-insight">
        <div class="tl-section-header discipline-section-header">
          <div>
            <div class="tl-section-title">Insight</div>
          </div>
        </div>
        <p>${buildInsight(dominantViolation)}</p>
        <div class="discipline-insight__meta">
          <span>Estado Risk Engine</span>
          <strong>${riskVisibility}</strong>
        </div>
      </article>
    </div>
  `;
}
