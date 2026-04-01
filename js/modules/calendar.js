import { formatCurrency, formatPercent, selectCurrentAccount, selectCurrentModel } from "./utils.js?v=build-20260329-201102";
import { openModal } from "./modal-system.js?v=build-20260329-201102";

const CALENDAR_HEADERS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function renderCalendar(root, state) {
  const account = selectCurrentAccount(state);
  const model = selectCurrentModel(state);
  const connection = account?.connection || {};

  if (!model && connection.state === "error") {
    root.innerHTML = calendarStateMarkup({
      tone: "error",
      title: "Calendario no disponible",
      message: "No se pudo cargar la actividad diaria. Revisa la conexión de la cuenta e inténtalo de nuevo."
    });
    return;
  }

  if (!model) {
    root.innerHTML = calendarLoadingMarkup();
    return;
  }

  const dayStats = Array.isArray(model.dayStats) ? model.dayStats : [];
  const months = Array.isArray(model.monthlyReturns) ? model.monthlyReturns : [];

  if (!dayStats.length || !months.length) {
    root.innerHTML = calendarStateMarkup({
      tone: "empty",
      title: "Todavía no hay sesiones registradas",
      message: "Cuando entren días operados, aquí verás el patrón mensual, la consistencia y el balance diario."
    });
    return;
  }

  const monthKey = getCalendarMonthKey(root, months);
  const monthIndex = months.findIndex((month) => month.key === monthKey);
  const selectedMonth = months[monthIndex] || months[months.length - 1];
  const monthView = buildMonthView(dayStats, monthKey);
  const summary = buildMonthSummary(monthView, selectedMonth);
  const selectedDayKey = root.__calendarSelectedDay;
  const hasSelectedDay = monthView.cells.some((cell) => cell.key === selectedDayKey && cell.trades > 0);

  if (!hasSelectedDay) root.__calendarSelectedDay = "";

  root.innerHTML = `
    <section class="calendar-screen">
      <header class="calendar-screen__header">
        <div class="calendar-screen__copy">
          <div class="calendar-screen__eyebrow">Calendario</div>
          <h1 class="calendar-screen__title">Calendario</h1>
          <p class="calendar-screen__subtitle">Consistencia operativa y resultado diario del mes de un vistazo.</p>
        </div>

        <div class="calendar-month-nav" aria-label="Selector de mes">
          <button class="calendar-month-nav__btn" type="button" data-calendar-shift="-1" ${monthIndex <= 0 ? "disabled" : ""}>‹</button>
          <div class="calendar-month-nav__label">
            <strong>${monthView.label}</strong>
            <span>${summary.activeDays} días operados</span>
          </div>
          <button class="calendar-month-nav__btn" type="button" data-calendar-shift="1" ${monthIndex >= months.length - 1 ? "disabled" : ""}>›</button>
        </div>
      </header>

      <section class="calendar-summary-strip" aria-label="Resumen del mes">
        <article class="calendar-summary-card calendar-summary-card--primary">
          <div class="calendar-summary-card__label">P&L del mes</div>
          <div class="calendar-summary-card__value ${summary.monthPnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(summary.monthPnl)}</div>
          <div class="calendar-summary-card__meta">${formatPercent(summary.monthReturnPct)} sobre balance inicial del mes</div>
        </article>

        <article class="calendar-summary-card">
          <div class="calendar-summary-card__label">Días operados</div>
          <div class="calendar-summary-card__value">${summary.activeDays}</div>
          <div class="calendar-summary-card__meta">${summary.tradeCount} trades cerrados</div>
        </article>

        <article class="calendar-summary-card">
          <div class="calendar-summary-card__label">Días ganadores</div>
          <div class="calendar-summary-card__value metric-positive">${summary.winDays}</div>
          <div class="calendar-summary-card__meta">${summary.lossDays} días negativos</div>
        </article>

        <article class="calendar-summary-card">
          <div class="calendar-summary-card__label">Consistencia</div>
          <div class="calendar-summary-card__value">${formatPercent(summary.consistencyPct)}</div>
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

        <div class="calendar-month-grid">
          ${CALENDAR_HEADERS.map((header) => `<div class="calendar-month-grid__head">${header}</div>`).join("")}
          ${monthView.cells.map((cell) => {
            const classes = [
              "calendar-day",
              cell.inMonth ? "is-current-month" : "is-outside-month",
              cell.trades ? "has-trades" : "is-idle",
              cell.state === "win" ? "is-win" : "",
              cell.state === "loss" ? "is-loss" : "",
              cell.isToday ? "is-today" : "",
              root.__calendarSelectedDay === cell.key ? "is-selected" : ""
            ].filter(Boolean).join(" ");
            const tradesLabel = cell.trades === 1 ? "1 trade" : `${cell.trades} trades`;
            return `
              <button class="${classes}" type="button" ${cell.trades ? `data-calendar-day="${cell.key}"` : "disabled"}>
                <div class="calendar-day__top">
                  <span class="calendar-day__date">${cell.date.getDate()}</span>
                  ${cell.trades ? `<span class="calendar-day__count">${cell.trades}</span>` : ""}
                </div>
                <div class="calendar-day__body">
                  ${cell.trades
                    ? `<div class="calendar-day__pnl ${cell.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(cell.pnl)}</div>
                       <div class="calendar-day__meta">${tradesLabel}</div>`
                    : `<div class="calendar-day__meta">${cell.inMonth ? "Sin operativa" : "Fuera de mes"}</div>`}
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
    </section>
  `;

  root.querySelectorAll("[data-calendar-shift]").forEach((button) => {
    button.addEventListener("click", () => {
      const offset = Number(button.dataset.calendarShift);
      const nextKey = shiftMonthKey(months, monthKey, offset);
      if (!nextKey) return;
      root.__calendarMonthKey = nextKey;
      renderCalendar(root, state);
    });
  });

  root.querySelectorAll("[data-calendar-day]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.calendarDay;
      root.__calendarSelectedDay = key;
      renderCalendar(root, state);

      const dayTrades = model.trades.filter((trade) => trade.when.toISOString().slice(0, 10) === key);
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
}

function buildMonthView(dayStats, monthKey) {
  const anchorDate = monthKeyToDate(monthKey);
  const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const last = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - last.getDay()));
  const todayKey = new Date().toISOString().slice(0, 10);
  const dayMap = new Map(dayStats.map((entry) => [entry.key, entry]));

  const cells = [];
  const weeks = [];
  for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
    const key = current.toISOString().slice(0, 10);
    const day = dayMap.get(key);
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
    weeks
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

function getCalendarMonthKey(root, months) {
  const latest = months[months.length - 1]?.key || new Date().toISOString().slice(0, 7);
  if (!root.__calendarMonthKey || !months.some((month) => month.key === root.__calendarMonthKey)) {
    root.__calendarMonthKey = latest;
  }
  return root.__calendarMonthKey;
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

function calendarStateMarkup({ tone, title, message }) {
  return `
    <section class="calendar-screen">
      <header class="calendar-screen__header">
        <div class="calendar-screen__copy">
          <div class="calendar-screen__eyebrow">Calendario</div>
          <h1 class="calendar-screen__title">Calendario</h1>
          <p class="calendar-screen__subtitle">Consistencia operativa y resultado diario del mes de un vistazo.</p>
        </div>
      </header>

      <section class="tl-section-card calendar-state calendar-state--${tone}">
        <h2 class="calendar-state__title">${title}</h2>
        <p class="calendar-state__message">${message}</p>
      </section>
    </section>
  `;
}

function calendarLoadingMarkup() {
  return `
    <section class="calendar-screen">
      <header class="calendar-screen__header">
        <div class="calendar-screen__copy">
          <div class="calendar-screen__eyebrow">Calendario</div>
          <h1 class="calendar-screen__title">Calendario</h1>
          <p class="calendar-screen__subtitle">Consistencia operativa y resultado diario del mes de un vistazo.</p>
        </div>
      </header>

      <section class="calendar-summary-strip">
        ${Array.from({ length: 4 }, () => `
          <article class="calendar-summary-card">
            <div class="skeleton" style="height:12px;border-radius:999px;"></div>
            <div class="skeleton" style="height:28px;margin-top:10px;border-radius:10px;"></div>
            <div class="skeleton" style="height:10px;margin-top:12px;border-radius:999px;"></div>
          </article>
        `).join("")}
      </section>

      <section class="tl-section-card calendar-month-panel">
        <div class="calendar-month-grid calendar-month-grid--loading">
          ${CALENDAR_HEADERS.map((header) => `<div class="calendar-month-grid__head">${header}</div>`).join("")}
          ${Array.from({ length: 35 }, () => `<div class="calendar-day calendar-day--skeleton skeleton"></div>`).join("")}
        </div>
      </section>
    </section>
  `;
}
