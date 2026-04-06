import { chartCanvas, lineAreaSpec, mountCharts } from "./chart-system.js?v=build-20260406-210500";
import { formatCurrency, formatPercent, resolveAccountDataAuthority, selectCurrentAccount, selectCurrentModel } from "./utils.js?v=build-20260406-210500";
import { openModal } from "./modal-system.js?v=build-20260406-210500";

const CALENDAR_HEADERS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function toLocalDayKey(dateLike) {
  const date = new Date(dateLike);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalMonthKey(dateLike) {
  return toLocalDayKey(dateLike).slice(0, 7);
}

export function renderCalendar(root, state) {
  const account = selectCurrentAccount(state);
  const model = selectCurrentModel(state);
  const authority = resolveAccountDataAuthority(account);
  const connection = account?.connection || {};

  const dayStats = Array.isArray(model?.dayStats) ? model.dayStats : [];
  const months = Array.isArray(model?.monthlyReturns) ? model.monthlyReturns : [];
  const hasModel = Boolean(model);
  const hasTradingData = dayStats.length > 0 && months.length > 0;
  const monthlyMatrix = Array.isArray(model?.monthlyMatrix) ? model.monthlyMatrix : [];
  const latestMonthKey = months[months.length - 1]?.key || buildFallbackMonthRecord().key;
  const calendarMonths = months.length ? expandCalendarMonths(months) : [buildFallbackMonthRecord()];
  const monthKey = getCalendarMonthKey(root, calendarMonths, latestMonthKey);
  const monthIndex = calendarMonths.findIndex((month) => month.key === monthKey);
  const selectedMonth = calendarMonths[monthIndex] || calendarMonths[calendarMonths.length - 1];
  const valueMode = getCalendarValueMode(root);
  const monthView = buildMonthView(dayStats, monthKey);
  const summary = buildMonthSummary(monthView, selectedMonth);
  const selectedDayKey = root.__calendarSelectedDay;
  const hasSelectedDay = monthView.cells.some((cell) => cell.key === selectedDayKey && cell.trades > 0);
  const cumulativeCurve = buildCalendarCurve(dayStats, selectedMonth);
  const tradedCells = monthView.cells.filter((cell) => cell.inMonth && (cell.trades > 0 || cell.pnl !== 0));
  const tradedSample = tradedCells.slice(0, 8).map((cell) => ({
    key: cell.key,
    trades: cell.trades,
    pnl: cell.pnl
  }));
  window.__KMFX_CALENDAR_DEBUG__ = {
    currentAccount: state?.currentAccount || account?.id || null,
    currentAccountName: account?.name || null,
    hasModel,
    dayStatsCount: dayStats.length,
    monthlyReturnsCount: months.length,
    selectedMonth: selectedMonth?.key || monthKey,
    valueMode,
    tradedDaysInSelectedMonth: tradedCells.length,
    cellsSample: tradedSample
  };
  console.info("[KMFX][Calendar Debug]", window.__KMFX_CALENDAR_DEBUG__);
  console.info("[KMFX][CALENDAR_AUTHORITY]", {
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
  const note = !hasModel
    ? connection.state === "error"
      ? {
          tone: "error",
          text: "No se pudo cargar la actividad diaria. Mostramos la estructura del calendario mientras se recupera la conexión."
        }
      : {
          tone: "loading",
          text: "Cargando actividad diaria y resumen mensual."
        }
    : !hasTradingData
      ? {
          tone: "empty",
          text: "Todavía no hay sesiones registradas. La vista queda preparada para cuando entren días operados."
        }
      : null;

  if (!hasSelectedDay) root.__calendarSelectedDay = "";

  root.innerHTML = `
    <section class="calendar-screen">
      <header class="calendar-screen__header">
        <div class="calendar-screen__copy">
          <div class="calendar-screen__eyebrow">Calendario</div>
          <h1 class="calendar-screen__title">Calendario</h1>
          <p class="calendar-screen__subtitle">Consistencia operativa y resultado diario del mes de un vistazo. ${authority.firstTradeLabel ? `Ledger real desde ${authority.firstTradeLabel}.` : ""}</p>
          ${note ? `<p class="calendar-inline-note calendar-inline-note--${note.tone}">${note.text}</p>` : ""}
        </div>

        <div class="calendar-month-nav" aria-label="Selector de mes">
          <button class="calendar-month-nav__btn" type="button" data-calendar-shift="-1" ${monthIndex <= 0 ? "disabled" : ""}>‹</button>
          <div class="calendar-month-nav__label">
            <strong>${monthView.label}</strong>
            <span>${summary.activeDays} días operados</span>
          </div>
          <div class="widget-segmented calendar-value-toggle" role="tablist" aria-label="Unidad visible del calendario">
            <button class="widget-segmented-btn ${valueMode === "usd" ? "active" : ""}" type="button" data-calendar-value-mode="usd">USD</button>
            <button class="widget-segmented-btn ${valueMode === "percent" ? "active" : ""}" type="button" data-calendar-value-mode="percent">%</button>
          </div>
          <button class="calendar-month-nav__btn" type="button" data-calendar-shift="1" ${monthIndex >= calendarMonths.length - 1 ? "disabled" : ""}>›</button>
        </div>
      </header>

      <section class="calendar-summary-strip" aria-label="Resumen del mes">
        <article class="calendar-summary-card calendar-summary-card--primary">
          <div class="calendar-summary-card__label">P&L del mes</div>
          <div class="calendar-summary-card__value ${summary.monthPnl >= 0 ? "metric-positive" : "metric-negative"}">${hasModel ? formatCalendarValue(summary.monthPnl, valueMode, selectedMonth?.startBalance) : "—"}</div>
          <div class="calendar-summary-card__meta">${hasTradingData ? valueMode === "usd" ? `${formatPercent(summary.monthReturnPct)} sobre balance inicial del mes` : "Rentabilidad del mes sobre balance inicial" : "Sin muestra mensual todavía"}</div>
        </article>

        <article class="calendar-summary-card">
          <div class="calendar-summary-card__label">Días operados</div>
          <div class="calendar-summary-card__value">${hasModel ? summary.activeDays : "—"}</div>
          <div class="calendar-summary-card__meta">${hasTradingData ? `${summary.tradeCount} trades cerrados` : "Actividad pendiente de cargar"}</div>
        </article>

        <article class="calendar-summary-card">
          <div class="calendar-summary-card__label">Días ganadores</div>
          <div class="calendar-summary-card__value metric-positive">${hasModel ? summary.winDays : "—"}</div>
          <div class="calendar-summary-card__meta">${hasTradingData ? `${summary.lossDays} días negativos` : "Sin sesiones para clasificar"}</div>
        </article>

        <article class="calendar-summary-card">
          <div class="calendar-summary-card__label">Consistencia</div>
          <div class="calendar-summary-card__value">${hasModel ? formatPercent(summary.consistencyPct) : "—"}</div>
          <div class="calendar-summary-card__meta">${summary.consistencyLabel}</div>
        </article>
      </section>

      <section class="tl-section-card calendar-month-panel">
        <div class="calendar-month-panel__head">
          <div>
            <div class="calendar-month-panel__title">${monthView.label}</div>
            <div class="calendar-month-panel__sub">El foco es el ritmo diario: qué días ejecutaste, cómo cerraron y qué semanas sostuvieron la curva.</div>
          </div>

          <div class="calendar-month-panel__legend" aria-label="Leyenda">
            <span><i class="calendar-legend-dot calendar-legend-dot--win"></i>Positivo</span>
            <span><i class="calendar-legend-dot calendar-legend-dot--loss"></i>Negativo</span>
            <span><i class="calendar-legend-dot calendar-legend-dot--idle"></i>Sin operativa</span>
            <span><i class="calendar-legend-dot calendar-legend-dot--today"></i>Hoy</span>
          </div>
        </div>

        <div class="calendar-month-grid ${!hasModel ? "calendar-month-grid--loading" : ""}">
          ${CALENDAR_HEADERS.map((header) => `<div class="calendar-month-grid__head">${header}</div>`).join("")}
          ${monthView.cells.map((cell) => {
            const intensityClass = cell.trades ? getCalendarIntensityClass(cell.pnl, monthView.maxAbsPnl) : "";
            const classes = [
              "calendar-day",
              !hasModel ? "calendar-day--skeleton skeleton" : "",
              cell.inMonth ? "is-current-month" : "is-outside-month",
              cell.trades ? "has-trades" : "is-idle",
              cell.state === "win" ? "is-win" : "",
              cell.state === "loss" ? "is-loss" : "",
              intensityClass,
              cell.isToday ? "is-today" : "",
              root.__calendarSelectedDay === cell.key ? "is-selected" : ""
            ].filter(Boolean).join(" ");
            const tradesLabel = cell.trades === 1 ? "1 trade" : `${cell.trades} trades`;
            return `
              <button class="${classes}" type="button" ${cell.trades && hasModel ? `data-calendar-day="${cell.key}"` : "disabled"}>
                <div class="calendar-day__top">
                  <span class="calendar-day__date">${cell.date.getDate()}</span>
                </div>
                <div class="calendar-day__body">
                  ${cell.trades && hasModel
                    ? `<div class="calendar-day__pnl ${cell.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCalendarValue(cell.pnl, valueMode, selectedMonth?.startBalance)}</div>
                       <div class="calendar-day__meta">${tradesLabel}</div>`
                    : `<div class="calendar-day__meta">${!hasModel ? "Cargando" : cell.inMonth ? "Sin operativa" : "Fuera de mes"}</div>`}
                </div>
              </button>
            `;
          }).join("")}
        </div>

        ${monthView.weeks.length
          ? `
            <div class="calendar-week-strip">
              ${monthView.weeks.map((week) => `
                <article class="calendar-week-chip">
                  <div class="calendar-week-chip__label">${week.label}</div>
                  <div class="calendar-week-chip__value ${week.pnl >= 0 ? "metric-positive" : week.pnl < 0 ? "metric-negative" : ""}">${formatCurrency(week.pnl)}</div>
                  <div class="calendar-week-chip__meta">${week.activeDays} días · ${week.trades} trades</div>
                </article>
              `).join("")}
            </div>
          `
          : ""}
      </section>

      <section class="calendar-analytics-stack">
        <article class="tl-section-card chart-card calendar-chart-panel">
          <div class="calendar-panel-head">
            <div>
              <div class="calendar-panel-title">Rentabilidad acumulada</div>
              <div class="calendar-panel-sub">${hasTradingData ? "Lectura acumulada para seguir la tracción del año sin competir con la vista mensual." : "La curva aparecerá aquí cuando entren cierres diarios."}</div>
            </div>
          </div>
          <div class="calendar-chart-wrap">
            ${chartCanvas("calendar-cumulative-return", 220, "kmfx-chart-shell--feature")}
          </div>
        </article>

        <article class="tl-section-card table-card calendar-returns-panel">
          <div class="calendar-panel-head">
            <div>
              <div class="calendar-panel-title">Tabla de rentabilidad</div>
              <div class="calendar-panel-sub">${hasTradingData ? "Visión mensual y anual para leer progreso, baches y cierre del año de un vistazo." : "La matriz anual aparecerá aquí cuando existan meses cerrados."}</div>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Año</th>
                  <th>Ene</th>
                  <th>Feb</th>
                  <th>Mar</th>
                  <th>Abr</th>
                  <th>May</th>
                  <th>Jun</th>
                  <th>Jul</th>
                  <th>Ago</th>
                  <th>Sep</th>
                  <th>Oct</th>
                  <th>Nov</th>
                  <th>Dic</th>
                  <th>Total año</th>
                </tr>
              </thead>
              <tbody>
                ${buildMonthlyMatrixRows(monthlyMatrix, hasModel, selectedMonth?.key)}
              </tbody>
              ${buildMonthlyMatrixFooter(monthlyMatrix, hasModel)}
            </table>
          </div>
        </article>
      </section>
    </section>
  `;

  root.querySelectorAll("[data-calendar-shift]").forEach((button) => {
    button.addEventListener("click", () => {
      const offset = Number(button.dataset.calendarShift);
      const nextKey = shiftMonthKey(calendarMonths, monthKey, offset);
      if (!nextKey) return;
      root.__calendarMonthKey = nextKey;
      renderCalendar(root, state);
    });
  });

  root.querySelectorAll("[data-calendar-value-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextMode = button.dataset.calendarValueMode === "percent" ? "percent" : "usd";
      root.__calendarValueMode = nextMode;
      renderCalendar(root, state);
    });
  });

  root.querySelectorAll("[data-calendar-day]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.calendarDay;
      root.__calendarSelectedDay = key;
      renderCalendar(root, state);

      const dayTrades = (model?.trades || []).filter((trade) => toLocalDayKey(trade.when) === key);
      const dayPnl = dayTrades.reduce((sum, trade) => sum + trade.pnl, 0);
      openModal({
        title: `Detalle del ${new Date(key).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}`,
        subtitle: `${dayTrades.length} trades · ${formatCurrency(dayPnl)}`,
        maxWidth: 820,
        content: `
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Símbolo</th>
                  <th>Dir</th>
                  <th>Entrada</th>
                  <th>Salida</th>
                  <th>P&L $</th>
                  <th>Setup</th>
                  <th>Sesión</th>
                </tr>
              </thead>
              <tbody>
                ${dayTrades.map((trade) => `
                  <tr>
                    <td>${trade.when.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</td>
                    <td>${trade.symbol}</td>
                    <td>${trade.side}</td>
                    <td>${trade.entry}</td>
                    <td>${trade.exit}</td>
                    <td class="${trade.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(trade.pnl)}</td>
                    <td>${trade.setup}</td>
                    <td>${trade.session}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `
      });
    });
  });

  if (hasModel) {
    mountCharts(root, [
      lineAreaSpec("calendar-cumulative-return", cumulativeCurve, {
        tone: "blue",
        showXAxis: true,
        showYAxis: true,
        showYGrid: false,
        showAxisBorder: false,
        axisFontSize: 10,
        axisFontWeight: "600",
        xTickPadding: 6,
        yTickPadding: 10,
        maxXTicks: 6,
        maxYTicks: 4,
        borderWidth: 2.3,
        fill: true,
        fillAlphaStart: 0.16,
        fillAlphaEnd: 0,
        glowAlpha: 0.08,
        tension: 0.42,
        yHeadroomRatio: 0.1,
        yBottomPaddingRatio: 0.06,
        axisFormatter: (value) => `${Number(value).toFixed(1)}%`
      })
    ]);
  }
}

function buildMonthView(dayStats, monthKey) {
  const anchorDate = monthKeyToDate(monthKey);
  const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const last = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - last.getDay()));
  const todayKey = toLocalDayKey(new Date());
  const dayMap = new Map(dayStats.map((entry) => [entry.key, entry]));

  const cells = [];
  const weeks = [];
  let maxAbsPnl = 0;
  for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
    const key = toLocalDayKey(current);
    const day = dayMap.get(key);
    maxAbsPnl = Math.max(maxAbsPnl, Math.abs(day?.pnl || 0));
    cells.push({
      key,
      inMonth: current.getMonth() === anchorDate.getMonth(),
      date: new Date(current),
      pnl: day?.pnl || 0,
      trades: day?.trades || 0,
      isToday: key === todayKey,
      state: !day?.trades ? "idle" : day.pnl >= 0 ? "win" : "loss"
    });
  }

  for (let index = 0; index < cells.length; index += 7) {
    const slice = cells.slice(index, index + 7);
    const inMonthSlice = slice.filter((cell) => cell.inMonth);
    const trades = inMonthSlice.reduce((sum, cell) => sum + cell.trades, 0);
    const activeDays = inMonthSlice.filter((cell) => cell.trades > 0).length;
    if (!inMonthSlice.length) continue;
    weeks.push({
      label: `Sem ${weeks.length + 1}`,
      pnl: inMonthSlice.reduce((sum, cell) => sum + cell.pnl, 0),
      trades,
      activeDays
    });
  }

  return {
    key: monthKey,
    label: anchorDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" }),
    cells,
    weeks,
    maxAbsPnl
  };
}

function buildMonthSummary(monthView, monthRecord) {
  const inMonthCells = monthView.cells.filter((cell) => cell.inMonth);
  const tradedDays = inMonthCells.filter((cell) => cell.trades > 0);
  const winDays = tradedDays.filter((cell) => cell.pnl > 0).length;
  const lossDays = tradedDays.filter((cell) => cell.pnl < 0).length;
  const monthPnl = tradedDays.reduce((sum, cell) => sum + cell.pnl, 0);
  const tradeCount = tradedDays.reduce((sum, cell) => sum + cell.trades, 0);
  const base = monthRecord?.startBalance || 0;
  const activeDays = tradedDays.length;
  const consistencyPct = activeDays ? (winDays / activeDays) * 100 : 0;

  return {
    monthPnl,
    tradeCount,
    activeDays,
    winDays,
    lossDays,
    monthReturnPct: base ? (monthPnl / base) * 100 : 0,
    consistencyPct,
    consistencyLabel: activeDays
      ? winDays >= lossDays
        ? "Más días a favor que en contra"
        : "Mes con presión operativa"
      : "Todavía sin muestra suficiente"
  };
}

function buildCalendarCurve(dayStats, selectedMonth) {
  const monthKey = selectedMonth?.key || toLocalMonthKey(new Date());
  const monthDays = dayStats
    .filter((day) => day.key.startsWith(monthKey))
    .sort((a, b) => a.key.localeCompare(b.key));

  if (!monthDays.length) {
    return buildEmptyCurve(monthKey);
  }

  let runningPnl = 0;
  const base = Number(selectedMonth?.startBalance || 0);
  return monthDays.map((day) => {
    runningPnl += Number(day.pnl || 0);
    return {
      label: new Date(day.key).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }),
      value: base ? (runningPnl / base) * 100 : 0
    };
  });
}

function buildMonthlyMatrixRows(monthlyMatrix, hasModel, selectedMonthKey) {
  if (!hasModel) {
    return Array.from({ length: 2 }, () => `
      <tr>
        <td colspan="14"><div class="calendar-table-placeholder skeleton"></div></td>
      </tr>
    `).join("");
  }

  if (!monthlyMatrix.length) {
    return `
      <tr class="calendar-table-empty">
        <td colspan="14">Todavía no hay meses cerrados para mostrar rentabilidad.</td>
      </tr>
    `;
  }

  return monthlyMatrix.map((year) => `
    <tr>
      <td>${year.year}</td>
      ${year.months.map((monthCell, index) => {
        const monthKey = `${year.year}-${String(index + 1).padStart(2, "0")}`;
        const classes = [
          monthCell.pnl == null ? "" : monthCell.pnl >= 0 ? "metric-positive" : "metric-negative",
          monthKey === selectedMonthKey ? "calendar-matrix-cell--active" : ""
        ].filter(Boolean).join(" ");
        return `
        <td class="${classes}">
          ${monthCell.pnl == null ? "—" : formatPercent(monthCell.returnPct)}
        </td>
      `;
      }).join("")}
      <td class="${year.totalPnl >= 0 ? "metric-positive" : "metric-negative"}">${formatPercent(year.totalReturnPct)}</td>
    </tr>
  `).join("");
}

function buildMonthlyMatrixFooter(monthlyMatrix, hasModel) {
  if (!hasModel || !monthlyMatrix.length) return "";
  const grandTotal = monthlyMatrix.reduce((sum, year) => sum + Number(year.totalPnl || 0), 0);
  return `
    <tfoot>
      <tr>
        <th colspan="13">Grand Total</th>
        <th class="${grandTotal >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(grandTotal)}</th>
      </tr>
    </tfoot>
  `;
}

function buildFallbackMonthRecord() {
  const date = new Date();
  return {
    key: toLocalMonthKey(date),
    label: date.toLocaleDateString("es-ES", { month: "short", year: "numeric" }),
    pnl: 0,
    trades: 0,
    startBalance: 0,
    returnPct: 0
  };
}

function expandCalendarMonths(months) {
  if (!months.length) return [buildFallbackMonthRecord()];

  const byKey = new Map(months.map((month) => [month.key, month]));
  const years = [...new Set(months.map((month) => Number(month.key.slice(0, 4))))].sort((a, b) => a - b);
  const expanded = [];
  let runningBalance = Number(months[0]?.startBalance || 0);

  years.forEach((year) => {
    for (let monthNumber = 1; monthNumber <= 12; monthNumber += 1) {
      const key = `${year}-${String(monthNumber).padStart(2, "0")}`;
      const existing = byKey.get(key);
      if (existing) {
        runningBalance = Number(existing.startBalance || runningBalance) + Number(existing.pnl || 0);
        expanded.push(existing);
        continue;
      }

      const date = new Date(year, monthNumber - 1, 1);
      expanded.push({
        key,
        label: date.toLocaleDateString("es-ES", { month: "short", year: "numeric" }),
        pnl: 0,
        trades: 0,
        startBalance: runningBalance,
        returnPct: 0
      });
    }
  });

  return expanded;
}

function buildEmptyCurve(monthKey) {
  const anchor = monthKeyToDate(monthKey || toLocalMonthKey(new Date()));
  const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  return [1, 8, 15, 22, lastDay].map((day) => {
    const date = new Date(anchor.getFullYear(), anchor.getMonth(), day);
    return {
      label: date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }),
      value: 0
    };
  });
}

function getCalendarIntensityClass(pnl, maxAbsPnl) {
  const abs = Math.abs(Number(pnl || 0));
  if (!abs || !maxAbsPnl) return "";
  const ratio = abs / maxAbsPnl;
  if (ratio >= 0.72) return "is-heat-3";
  if (ratio >= 0.38) return "is-heat-2";
  return "is-heat-1";
}

function getCalendarMonthKey(root, months, preferredKey) {
  const latest = preferredKey || months[months.length - 1]?.key || toLocalMonthKey(new Date());
  if (!root.__calendarMonthKey || !months.some((month) => month.key === root.__calendarMonthKey)) {
    root.__calendarMonthKey = latest;
  }
  return root.__calendarMonthKey;
}

function getCalendarValueMode(root) {
  if (root.__calendarValueMode !== "percent") {
    root.__calendarValueMode = "usd";
  }
  return root.__calendarValueMode;
}

function formatCalendarValue(value, mode, baseAmount) {
  if (mode === "percent") {
    const base = Number(baseAmount || 0);
    const pct = base ? (Number(value || 0) / base) * 100 : 0;
    return formatPercent(pct);
  }
  return formatCurrency(value);
}

function shiftMonthKey(months, currentKey, offset) {
  const index = months.findIndex((month) => month.key === currentKey);
  if (index === -1) return null;
  const next = months[index + offset];
  return next?.key || null;
}

function monthKeyToDate(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, (month || 1) - 1, 1);
}
