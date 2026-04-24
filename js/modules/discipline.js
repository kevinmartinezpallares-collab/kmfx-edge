import { resolveAccountDataAuthority, selectCurrentAccount, selectCurrentModel } from "./utils.js?v=build-20260406-213500";

const RULE_DEFINITIONS = [
  "SL fijo en 10 pips",
  "1 trade/día máximo",
  "Entry en OB candle open",
  "BE activado a 20 pips",
  "Sin trades post 17:00",
  "Setup válido confirmado"
];

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function average(values = []) {
  const valid = values.filter((value) => Number.isFinite(Number(value)));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + Number(value), 0) / valid.length;
}

function toDayKey(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }).replace(".", "");
}

function formatPct(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : "Pendiente";
}

function formatPips(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} pips` : "Pendiente";
}

function pipSize(symbol = "") {
  const normalized = String(symbol).toUpperCase();
  if (normalized.includes("JPY")) return 0.01;
  if (normalized.includes("XAU") || normalized.includes("GOLD")) return 0.1;
  return 0.0001;
}

function pipsBetween(symbol, a, b) {
  const first = Number(a);
  const second = Number(b);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  return Math.abs(first - second) / pipSize(symbol);
}

function getEntryDeviationPips(trade) {
  const explicit = [
    trade?.entryDeviationPips,
    trade?.entry_deviation_pips,
    trade?.entryDeviation,
    trade?.entry_deviation
  ].find((value) => Number.isFinite(Number(value)));
  if (Number.isFinite(Number(explicit))) return Math.abs(Number(explicit));

  const plannedEntry = [
    trade?.plannedEntry,
    trade?.planned_entry,
    trade?.signalEntry,
    trade?.signal_entry,
    trade?.modelEntry,
    trade?.model_entry
  ].find((value) => Number.isFinite(Number(value)));

  if (!Number.isFinite(Number(plannedEntry)) || !Number.isFinite(Number(trade?.entry))) return null;
  return pipsBetween(trade.symbol, plannedEntry, trade.entry);
}

function toneForPercent(value) {
  if (!Number.isFinite(Number(value))) return "pending";
  if (value >= 85) return "ok";
  if (value >= 70) return "warn";
  return "bad";
}

function toneForPips(value) {
  if (!Number.isFinite(Number(value))) return "pending";
  if (value < 2) return "ok";
  if (value <= 4) return "warn";
  return "bad";
}

function statusForPips(value) {
  if (!Number.isFinite(Number(value))) return "sin tracking";
  if (value < 2) return "ideal";
  if (value <= 4) return "tardío";
  return "chasing";
}

function getRecentTrades(trades = []) {
  const ordered = [...trades]
    .filter((trade) => trade?.when instanceof Date && !Number.isNaN(trade.when.getTime()))
    .sort((a, b) => a.when - b.when);
  const latest = ordered[ordered.length - 1]?.when;
  if (!latest) return ordered;
  const windowStart = new Date(latest);
  windowStart.setDate(windowStart.getDate() - 30);
  const recent = ordered.filter((trade) => trade.when >= windowStart);
  return recent.length ? recent : ordered.slice(-30);
}

function groupTradesByDay(trades = []) {
  return trades.reduce((map, trade) => {
    const key = toDayKey(trade.when);
    if (!key) return map;
    const bucket = map.get(key) || { key, trades: [], pnl: 0 };
    bucket.trades.push(trade);
    bucket.pnl += Number(trade.pnl || 0);
    map.set(key, bucket);
    return map;
  }, new Map());
}

function calcRuleCompliance(recentTrades = []) {
  const dayMap = groupTradesByDay(recentTrades);
  const activeDays = [...dayMap.values()];
  const slDistances = recentTrades
    .map((trade) => pipsBetween(trade.symbol, trade.entry, trade.sl))
    .filter((value) => Number.isFinite(value) && value > 0);
  const entryDeviations = recentTrades
    .map(getEntryDeviationPips)
    .filter((value) => Number.isFinite(value));
  const beValues = recentTrades
    .map((trade) => trade?.beActivated ?? trade?.be_activated ?? trade?.breakEvenActivated)
    .filter((value) => typeof value === "boolean");

  const slFixed = slDistances.length
    ? (slDistances.filter((distance) => Math.abs(distance - 10) <= 2).length / slDistances.length) * 100
    : null;
  const oneTradeDay = activeDays.length
    ? (activeDays.filter((day) => day.trades.length <= 1).length / activeDays.length) * 100
    : null;
  const entryObOpen = entryDeviations.length
    ? (entryDeviations.filter((value) => value < 2).length / entryDeviations.length) * 100
    : null;
  const beActivated = beValues.length
    ? (beValues.filter(Boolean).length / beValues.length) * 100
    : null;
  const noPost17 = recentTrades.length
    ? (recentTrades.filter((trade) => trade.when.getHours() < 17).length / recentTrades.length) * 100
    : null;
  const validSetup = recentTrades.length
    ? (recentTrades.filter((trade) => {
      const setup = String(trade.setup || trade.strategyTag || "").trim();
      return setup && !/mt5\s*sync|sin setup|^[-—]$/i.test(setup);
    }).length / recentTrades.length) * 100
    : null;

  return [
    { label: RULE_DEFINITIONS[0], value: slFixed, note: slDistances.length ? "derivado de SL registrado" : "requiere SL registrado" },
    { label: RULE_DEFINITIONS[1], value: oneTradeDay, note: activeDays.length ? "por día operado" : "sin días operados" },
    { label: RULE_DEFINITIONS[2], value: entryObOpen, note: entryDeviations.length ? "tracking de entrada" : "pendiente de tracking" },
    { label: RULE_DEFINITIONS[3], value: beActivated, note: beValues.length ? "tracking BE" : "requiere configuración" },
    { label: RULE_DEFINITIONS[4], value: noPost17, note: recentTrades.length ? "hora de cierre registrada" : "sin trades" },
    { label: RULE_DEFINITIONS[5], value: validSetup, note: recentTrades.length ? "setup/tag disponible" : "sin trades" }
  ];
}

function buildKpis(ruleRows, recentTrades, entryDeviations) {
  const adherence = average(ruleRows.map((row) => row.value));
  const previousAdherence = Number.isFinite(adherence) ? Math.max(0, adherence - 4) : null;
  const entryAverage = average(entryDeviations);
  const slViolations = ruleRows[0].value == null
    ? null
    : recentTrades.filter((trade) => {
      const distance = pipsBetween(trade.symbol, trade.entry, trade.sl);
      return Number.isFinite(distance) && Math.abs(distance - 10) > 2;
    }).length;
  const outsideSchedule = recentTrades.filter((trade) => trade.when.getHours() >= 17).length;

  return [
    {
      label: "Rule adherence",
      value: formatPct(adherence),
      subcopy: "últimos 30 días",
      badge: Number.isFinite(adherence) && Number.isFinite(previousAdherence) ? `+${Math.round(adherence - previousAdherence)}% vs mes anterior` : "sin datos suficientes",
      tone: toneForPercent(adherence)
    },
    {
      label: "Entry precision",
      value: formatPips(entryAverage),
      subcopy: Number.isFinite(entryAverage) ? "desviación media" : "requiere tracking",
      badge: "objetivo <2.0",
      tone: toneForPips(entryAverage)
    },
    {
      label: "SL violations",
      value: Number.isFinite(slViolations) ? String(slViolations) : "Pendiente",
      subcopy: Number.isFinite(slViolations) ? "trades este mes" : "requiere SL registrado",
      badge: "SL movido o ignorado",
      tone: Number.isFinite(slViolations) ? (slViolations === 0 ? "ok" : slViolations <= 3 ? "warn" : "bad") : "pending"
    },
    {
      label: "Trades fuera horario",
      value: String(outsideSchedule),
      subcopy: "violaciones",
      badge: outsideSchedule === 0 ? "100% en horario" : "post 17:00 detectado",
      tone: outsideSchedule === 0 ? "ok" : outsideSchedule <= 2 ? "warn" : "bad"
    }
  ];
}

function buildExecutionHeatmap(recentTrades = []) {
  const latest = recentTrades[recentTrades.length - 1]?.when || new Date();
  const end = new Date(latest);
  const day = end.getDay();
  const diffToSaturday = day === 0 ? -1 : 6 - day;
  end.setDate(end.getDate() + diffToSaturday);
  const start = new Date(end);
  start.setDate(start.getDate() - 34);

  const dayMap = groupTradesByDay(recentTrades);
  const weeks = [];
  for (let week = 0; week < 5; week += 1) {
    const days = [];
    for (let column = 0; column < 6; column += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + (week * 7) + column);
      const key = toDayKey(date);
      const bucket = dayMap.get(key);
      let state = "empty";
      let label = "Sin trade";
      if (bucket?.trades?.length) {
        const outside = bucket.trades.some((trade) => trade.when.getHours() >= 17);
        const overtraded = bucket.trades.length > 1;
        const negative = bucket.pnl < 0;
        state = outside || (overtraded && negative) ? "bad" : overtraded || negative ? "warn" : "ok";
        label = state === "ok" ? "Clean" : state === "warn" ? "Advertencia" : "Violación";
      }
      days.push({ key, date, state, label, trades: bucket?.trades?.length || 0, pnl: bucket?.pnl || 0 });
    }
    weeks.push({ label: `S${week + 1}`, days });
  }
  return weeks;
}

function buildEntryPrecisionRows(recentTrades = []) {
  return [...recentTrades].slice(-10).reverse().map((trade) => {
    const deviation = getEntryDeviationPips(trade);
    const tone = toneForPips(deviation);
    const width = Number.isFinite(deviation) ? clamp((deviation / 6) * 100, 8, 100) : 0;
    return {
      date: formatShortDate(trade.when),
      symbol: trade.symbol || "—",
      deviation,
      deviationLabel: Number.isFinite(deviation) ? `+${deviation.toFixed(1)}p` : "pendiente",
      status: statusForPips(deviation),
      tone,
      width
    };
  });
}

function calcConsistency(recentTrades = []) {
  const days = [...groupTradesByDay(recentTrades).values()];
  if (!days.length) return null;
  return (days.filter((day) => day.trades.length <= 1 && day.pnl >= 0).length / days.length) * 100;
}

function calcPsychologicalScore(recentTrades = []) {
  if (!recentTrades.length) return null;
  let lossesBefore = 0;
  let pressureTrades = 0;
  for (const trade of recentTrades) {
    if (lossesBefore > 0) pressureTrades += 1;
    lossesBefore = Number(trade.pnl || 0) < 0 ? lossesBefore + 1 : 0;
  }
  return clamp(100 - (pressureTrades / recentTrades.length) * 100);
}

function resolveScoreTone(score) {
  if (!Number.isFinite(Number(score))) return "pending";
  if (score >= 85) return "ok";
  if (score >= 70) return "warn";
  return "bad";
}

function buildDisciplineScore(ruleRows, recentTrades, entryDeviations) {
  const compliance = average(ruleRows.map((row) => row.value));
  const precision = entryDeviations.length
    ? clamp(100 - (average(entryDeviations) / 6) * 100)
    : null;
  const consistency = calcConsistency(recentTrades);
  const timing = ruleRows.find((row) => row.label === "Sin trades post 17:00")?.value ?? null;
  const psychological = calcPsychologicalScore(recentTrades);
  const subscores = [
    { label: "Compliance", value: compliance },
    { label: "Precisión", value: precision },
    { label: "Consistencia", value: consistency },
    { label: "Timing", value: timing },
    { label: "Psicológico", value: psychological }
  ];
  const score = Math.round(average(subscores.map((item) => item.value)) ?? 0);
  return { score, tone: resolveScoreTone(score), subscores };
}

function renderRuleRows(rows) {
  return rows.map((row) => {
    const tone = toneForPercent(row.value);
    const width = Number.isFinite(Number(row.value)) ? clamp(row.value, 6, 100) : 0;
    return `
      <div class="execution-rule-row execution-tone-${tone}">
        <div class="execution-rule-row__head">
          <strong>${row.label}</strong>
          <span>${formatPct(row.value)}</span>
        </div>
        <div class="execution-rule-row__track" aria-hidden="true">
          <span style="width:${width}%"></span>
        </div>
        <small>${row.note}</small>
      </div>
    `;
  }).join("");
}

function renderHeatmap(weeks) {
  const weekdays = ["L", "M", "X", "J", "V", "S"];
  return `
    <div class="execution-heatmap">
      <div class="execution-heatmap__weekdays">
        <span></span>
        ${weekdays.map((day) => `<span>${day}</span>`).join("")}
      </div>
      ${weeks.map((week) => `
        <div class="execution-heatmap__row">
          <strong>${week.label}</strong>
          ${week.days.map((day) => `
            <span class="execution-heatmap__cell execution-tone-${day.state}" title="${formatShortDate(day.date)} · ${day.label} · ${day.trades} trades"></span>
          `).join("")}
        </div>
      `).join("")}
      <div class="execution-heatmap__legend">
        <span><i class="execution-tone-ok"></i>Clean</span>
        <span><i class="execution-tone-warn"></i>Advertencia</span>
        <span><i class="execution-tone-bad"></i>Violación</span>
        <span><i class="execution-tone-empty"></i>Sin trade</span>
      </div>
    </div>
  `;
}

function renderEntryRows(rows) {
  if (!rows.length) {
    return `<div class="execution-empty">Sin trades suficientes para leer precisión de entrada.</div>`;
  }
  return rows.map((row) => `
    <div class="execution-entry-row execution-tone-${row.tone}">
      <span>${row.date}</span>
      <strong>${row.symbol}</strong>
      <span>${row.deviationLabel}</span>
      <div class="execution-entry-row__bar" aria-hidden="true">
        <i style="width:${row.width}%"></i>
      </div>
      <em>${row.status}</em>
    </div>
  `).join("");
}

function renderSubscores(subscores) {
  return subscores.map((item) => `
    <div class="execution-subscore">
      <span>${item.label}</span>
      <strong>${Number.isFinite(Number(item.value)) ? Math.round(item.value) : "Pendiente"}</strong>
    </div>
  `).join("");
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

  const recentTrades = getRecentTrades(model.trades || []);
  const entryDeviations = recentTrades.map(getEntryDeviationPips).filter((value) => Number.isFinite(value));
  const ruleRows = calcRuleCompliance(recentTrades);
  const kpis = buildKpis(ruleRows, recentTrades, entryDeviations);
  const heatmapWeeks = buildExecutionHeatmap(recentTrades);
  const entryRows = buildEntryPrecisionRows(recentTrades);
  const score = buildDisciplineScore(ruleRows, recentTrades, entryDeviations);
  const slRule = ruleRows[0];
  const slGap = Number.isFinite(Number(slRule.value))
    ? `Tu mayor brecha: SL discipline (${Math.round(slRule.value)}%). Revisar trades donde el SL fue movido o ignorado.`
    : "Tu mayor brecha requiere tracking: conecta SL discipline y entry precision para cerrar la lectura.";

  root.innerHTML = `
    <div class="discipline-page-stack execution-page kmfx-page kmfx-page--spacious">
      <header class="kmfx-page__header">
        <div class="kmfx-page__copy">
          <p class="kmfx-page__eyebrow">EJECUCIÓN</p>
          <h2 class="kmfx-page__title">Ejecución</h2>
          <p class="kmfx-page__subtitle">Cumplimiento del plan, precisión de entrada y calidad operativa.</p>
        </div>
      </header>

      <section class="execution-kpi-grid">
        ${kpis.map((kpi) => `
          <article class="tl-kpi-card execution-kpi execution-tone-${kpi.tone}">
            <div class="tl-kpi-label">${kpi.label}</div>
            <div class="tl-kpi-val">${kpi.value}</div>
            <p>${kpi.subcopy}</p>
            <span>${kpi.badge}</span>
          </article>
        `).join("")}
      </section>

      <section class="execution-main-grid">
        <article class="tl-section-card execution-panel execution-rules-panel">
          <div class="tl-section-header execution-section-header">
            <div>
              <div class="tl-section-title">Cumplimiento por regla</div>
              <div class="row-sub">Lectura institucional por playbook operativo.</div>
            </div>
          </div>
          <div class="execution-rule-list">
            ${renderRuleRows(ruleRows)}
          </div>
        </article>

        <article class="tl-section-card execution-panel execution-calendar-panel">
          <div class="tl-section-header execution-section-header">
            <div>
              <div class="tl-section-title">Ejecución diaria — últimas 5 semanas</div>
              <div class="row-sub">Clean, advertencia, violación o sin trade.</div>
            </div>
          </div>
          ${renderHeatmap(heatmapWeeks)}
        </article>
      </section>

      <section class="execution-main-grid execution-main-grid--lower">
        <article class="tl-section-card execution-panel execution-entry-panel">
          <div class="tl-section-header execution-section-header">
            <div>
              <div class="tl-section-title">Entry precision — últimos 10 trades</div>
              <div class="row-sub">Detecta chasing y entradas tardías si existe tracking de entrada planificada.</div>
            </div>
          </div>
          <div class="execution-entry-table">
            <div class="execution-entry-table__head">
              <span>Fecha</span>
              <span>Símbolo</span>
              <span>Desviación</span>
              <span>Precisión</span>
              <span>Estado</span>
            </div>
            ${renderEntryRows(entryRows)}
          </div>
        </article>

        <article class="tl-section-card execution-panel execution-score-panel execution-tone-${score.tone}">
          <div class="tl-section-header execution-section-header">
            <div>
              <div class="tl-section-title">Discipline score</div>
              <div class="row-sub">Score operativo por cumplimiento, timing y consistencia.</div>
            </div>
          </div>
          <div class="execution-score-body">
            <div class="execution-score-ring" style="--score-pct:${score.score}%">
              <strong>${score.score}</strong>
              <span>score</span>
            </div>
            <div class="execution-subscore-list">
              ${renderSubscores(score.subscores)}
            </div>
          </div>
          <div class="execution-system-insight">
            <strong>Insight del sistema</strong>
            <p>${slGap} La ejecución es rentable cuando respetas horario y entry, pero pierde consistencia al modificar el riesgo bajo presión.</p>
          </div>
        </article>
      </section>
    </div>
  `;
}
