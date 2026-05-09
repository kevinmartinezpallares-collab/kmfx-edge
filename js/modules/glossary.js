import { pageHeaderMarkup } from "./ui-primitives.js?v=build-20260504-080918";
import { selectDashboardMetricStudyCards } from "./dashboard-professional-kpis.js?v=build-20260508-235500";

const CATEGORY_ORDER = Object.freeze([
  "Rendimiento",
  "Riesgo",
  "Seguimiento",
  "Ejecución",
  "Avanzadas",
  "Prop Firms",
]);

const CATEGORY_COPY = Object.freeze({
  Rendimiento: "Lecturas para saber si el sistema produce dinero de forma repetible y con muestra suficiente.",
  Riesgo: "Métricas para proteger la cuenta, medir drawdown, exposición y escenarios de pérdida.",
  Seguimiento: "Señales operativas para entender actividad, momentum reciente y contexto del panel.",
  Ejecución: "Indicadores para mejorar entradas, salidas, gestión y calidad de proceso.",
  Avanzadas: "Ratios y modelos que comparan retorno, volatilidad y recuperación con más profundidad.",
  "Prop Firms": "Métricas orientadas a cumplir reglas de fondeo sin acercarte a límites críticos.",
});

const WATCH_GUIDES = Object.freeze({
  "Win Rate": "No lo mires solo. Un win rate alto con pérdidas medias grandes puede esconder un sistema frágil.",
  "P&L Total": "Comprueba si el resultado viene de muchas operaciones consistentes o de uno o dos outliers.",
  "Operaciones Totales": "Busca muestra suficiente antes de sacar conclusiones. Pocas operaciones pueden distorsionar cualquier lectura.",
  "Profit Factor": "Míralo junto a drawdown y número de trades. Un PF alto con poca muestra todavía no confirma edge.",
  "Expectancy": "Si es positiva y estable por setup, el sistema tiene mejor base estadística. Si cambia mucho, revisa la muestra.",
  "Mejor Trade": "Detecta dependencia de un trade excepcional. Si al quitarlo todo cambia, el edge puede estar sobreestimado.",
  "Beneficio Bruto": "Compáralo con pérdida bruta y comisiones para entender cuánto cuesta producir esa ganancia.",
  "Pérdida Bruta": "Vigila si crece más rápido que el beneficio bruto o si se concentra en pocas sesiones.",
  "Ganancia Media": "Debe tener sentido frente a la pérdida media. Si ganas poco y pierdes mucho, necesitas mucho acierto.",
  "Pérdida Media": "Busca estabilidad. Pérdidas medias que aumentan suelen señalar stops movidos, sobreexposición o mala ejecución.",
  "Comisiones Estimadas": "Mira si el coste erosiona demasiado setups de bajo recorrido o estrategias muy frecuentes.",
  "Mejor Mes": "Úsalo como referencia de potencial, pero revisa si fue repetible o excepcional.",
  "Peor Mes": "Sirve para calibrar tolerancia psicológica y capital necesario para sobrevivir ciclos malos.",
  "Max Drawdown": "Es una de las métricas más importantes: si no puedes tolerarlo, el sistema no es viable para ti.",
  "Balance": "Úsalo como referencia de capital cerrado, pero no ignores la equity si hay trades abiertos.",
  "Equity": "Es la foto real de la cuenta. Si se separa mucho del balance, hay flotante relevante que revisar.",
  "Open P&L": "Mira si el flotante actual amenaza límites, objetivos o disciplina de salida.",
  "Heat": "Si el heat sube, una pequeña secuencia adversa puede afectar mucho a la cuenta.",
  "Total Semana": "Úsalo para leer momentum reciente, pero evita sobreoperar para cerrar la semana en positivo.",
  "Días Ganadores": "Busca consistencia diaria, no perfección. Muchos días positivos pequeños pueden no compensar un día negativo grande.",
  "Días Activos": "Comprueba si estás operando por oportunidad real o por necesidad de actividad.",
  "Retorno Semanal": "Compáralo con riesgo asumido y drawdown semanal, no solo con el porcentaje final.",
  "Retorno Acumulado": "Mira si el crecimiento fue progresivo o si depende de tramos aislados.",
  "Trader Score": "Úsalo como resumen, pero baja al detalle cuando cambie: disciplina, riesgo o eficiencia.",
  "R-Multiple": "Permite comparar trades de distinto tamaño. Busca patrones por setup, sesión y tipo de entrada.",
  "Liquidity Sweep": "No lo trates como señal aislada. Necesita contexto, zona, timing y confirmación.",
  "Posiciones Abiertas": "Revisa concentración por símbolo, dirección y riesgo agregado antes de añadir nuevas entradas.",
  "Sesión con Mejor Edge": "Prioriza las sesiones donde hay muestra y rendimiento, no solo las que tuvieron un buen trade.",
  "Sharpe Ratio": "Útil para comparar estabilidad, pero puede castigar estrategias con retornos irregulares aunque rentables.",
  "Sortino Ratio": "Mejor cuando te importa penalizar solo caídas. Mira si mejora frente al Sharpe.",
  "Calmar Ratio": "Ideal para leer retorno frente a dolor. Cuanto más retorno por drawdown, más eficiente el sistema.",
  "Recovery Factor": "Si es bajo, el sistema gana pero recupera mal sus caídas. Eso suele sentirse pesado en real.",
  "R:R Medio": "Debe leerse junto al win rate. Bajo acierto necesita R:R alto; alto acierto puede tolerar R:R menor.",
  "DD Diario": "En prop firms es crítico. Vigila la distancia al límite antes de seguir operando.",
  "DD Máximo": "Define supervivencia. Si estás cerca, la prioridad es proteger la cuenta, no recuperar rápido.",
  "Fase de Fondeo": "Cada fase cambia el objetivo. Ajusta agresividad, tamaño y frecuencia según la regla activa."
});

function resolveHowItWorks(term) {
  if (term.formula && term.formula !== "No aplica") {
    return term.formula;
  }
  return "Se interpreta por contexto operativo; no depende de una fórmula única.";
}

function resolveWhatToWatch(term) {
  if (term.watch) return term.watch;
  if (WATCH_GUIDES[term.term]) return WATCH_GUIDES[term.term];
  if (term.category === "Riesgo" || term.category === "Prop Firms") {
    return "Mira proximidad a límites, velocidad de deterioro y si exige reducir exposición.";
  }
  if (term.category === "Rendimiento") {
    return "Mira consistencia, muestra suficiente y relación con riesgo asumido.";
  }
  if (term.category === "Ejecución") {
    return "Mira si mejora la calidad de entrada, gestión y repetibilidad del proceso.";
  }
  return "Mira tendencia, estabilidad y si cambia una decisión concreta.";
}

function resolveTermSource(term) {
  if (term.source) return term.source;
  if (term.category === "Riesgo" || term.category === "Prop Firms") {
    return "Cuenta MT5, reglas de riesgo KMFX y operaciones cerradas cuando aplica.";
  }
  if (term.category === "Rendimiento") {
    return "Historial de operaciones cerradas, P&L neto, comisiones y capital de referencia.";
  }
  if (term.category === "Ejecución") {
    return "Operaciones cerradas, parciales, horarios, símbolo, sesión y contexto registrado.";
  }
  if (term.category === "Seguimiento") {
    return "Estado de cuenta, operaciones recientes y lecturas actualizadas del panel.";
  }
  return "Datos normalizados de la cuenta y contexto operativo disponible.";
}

function resolveTermConfidence(term) {
  if (term.confidence) return term.confidence;
  if (term.category === "Riesgo" || term.category === "Prop Firms") {
    return "Alta cuando MT5 está sincronizado, la política de riesgo está vigente y hay historial suficiente.";
  }
  if (term.category === "Rendimiento") {
    return "Mejora con más operaciones cerradas, costes completos y muestra estable por setup.";
  }
  if (term.category === "Ejecución") {
    return "Depende de que cada operación tenga entrada, salida, parciales y contexto completos.";
  }
  if (term.category === "Seguimiento") {
    return "Alta cuando la última sincronización es reciente y no hay datos pendientes.";
  }
  return "Depende de la calidad de los datos y del tamaño de muestra disponible.";
}

function escapeGlossaryHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderMetricStudyCard(card, index) {
  const refreshLabel = card.refresh?.label ? `Refresh ${card.refresh.label}` : "Refresh según métrica";
  const source = card.source || "Fuente pendiente";
  const formula = card.formula || "No aplica";
  const confidence = card.confidence || "Confianza pendiente de muestra";
  const visualLabel = String(card.visual || "").replace(/_/g, " ");
  const traderUse = card.traderUse || "Sirve para convertir datos del panel en una decisión concreta de riesgo, ejecución o seguimiento.";
  return `
    <article class="study-metric-card" data-study-metric="${escapeGlossaryHtml(card.id)}" style="--study-index:${index}">
      <div class="study-metric-card__top">
        <span class="study-metric-card__eyebrow">${escapeGlossaryHtml(card.category || card.period || "rolling")}</span>
        <span class="study-metric-card__chip">${escapeGlossaryHtml(refreshLabel)}</span>
      </div>
      <div class="study-metric-card__body">
        <h3>${escapeGlossaryHtml(card.label)}</h3>
        <p>${escapeGlossaryHtml(card.summary)}</p>
      </div>
      <dl class="study-metric-card__facts">
        <div>
          <dt>Fórmula</dt>
          <dd>${escapeGlossaryHtml(formula)}</dd>
        </div>
        <div>
          <dt>Para el trader</dt>
          <dd>${escapeGlossaryHtml(traderUse)}</dd>
        </div>
        <div>
          <dt>Fuente</dt>
          <dd>${escapeGlossaryHtml(source)}</dd>
        </div>
        <div>
          <dt>Confianza</dt>
          <dd>${escapeGlossaryHtml(confidence)}</dd>
        </div>
      </dl>
      <div class="study-metric-card__footer">
        <span>${escapeGlossaryHtml(card.unit || "metric")}</span>
        <span>${escapeGlossaryHtml(visualLabel || "card")}</span>
      </div>
    </article>
  `;
}

function renderTermStudyCard(term, index) {
  return `
    <article class="study-metric-card study-metric-card--term" data-study-term="${escapeGlossaryHtml(term.term)}" style="--study-index:${index}">
      <div class="study-metric-card__top">
        <span class="study-metric-card__eyebrow">${escapeGlossaryHtml(term.category || "Métrica")}</span>
        <span class="study-metric-card__chip">Guía</span>
      </div>
      <div class="study-metric-card__body">
        <h3>${escapeGlossaryHtml(term.term)}</h3>
        <p>${escapeGlossaryHtml(term.what)}</p>
      </div>
      <dl class="study-metric-card__facts">
        <div>
          <dt>Para el trader</dt>
          <dd>${escapeGlossaryHtml(term.why)}</dd>
        </div>
        <div>
          <dt>Fórmula</dt>
          <dd>${escapeGlossaryHtml(resolveHowItWorks(term))}</dd>
        </div>
        <div>
          <dt>Qué mirar</dt>
          <dd>${escapeGlossaryHtml(resolveWhatToWatch(term))}</dd>
        </div>
        <div>
          <dt>Fuente</dt>
          <dd>${escapeGlossaryHtml(resolveTermSource(term))}</dd>
        </div>
        <div>
          <dt>Confianza</dt>
          <dd>${escapeGlossaryHtml(resolveTermConfidence(term))}</dd>
        </div>
      </dl>
      <div class="study-metric-card__footer">
        <span>${escapeGlossaryHtml(term.category || "metric")}</span>
        <span>Guía</span>
      </div>
    </article>
  `;
}

function renderMetricStudyGrid() {
  const cards = selectDashboardMetricStudyCards();
  return `
    <section class="study-metric-lab" aria-labelledby="study-metric-lab-title">
      <div class="study-metric-lab__header">
        <div>
          <p class="study-metric-lab__eyebrow">Metodología KMFX</p>
          <h2 id="study-metric-lab-title">Métricas críticas del dashboard</h2>
        </div>
        <p>Lee cada métrica con su fórmula, fuente y nivel de confianza antes de usarla para tomar decisiones.</p>
      </div>
      <div class="study-metric-grid study-card-grid" aria-label="Cards de métricas críticas">
        ${cards.map((card, index) => renderMetricStudyCard(card, index)).join("")}
      </div>
    </section>
  `;
}

function sortGlossaryGroups(groups) {
  return [...groups.entries()].sort(([categoryA], [categoryB]) => {
    const indexA = CATEGORY_ORDER.indexOf(categoryA);
    const indexB = CATEGORY_ORDER.indexOf(categoryB);
    if (indexA !== -1 || indexB !== -1) {
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    }
    return categoryA.localeCompare(categoryB, "es");
  });
}

export function renderGlossary(root, state) {
  const groups = state.workspace.glossary.terms.reduce((map, term) => {
    if (!map.has(term.category)) map.set(term.category, []);
    map.get(term.category).push(term);
    return map;
  }, new Map());

  root.innerHTML = `
    ${pageHeaderMarkup({
      title: "Estudio de métricas",
      description: "Guía para entender qué significa cada métrica, para qué sirve, cómo funciona y qué conviene mirar antes de tomar decisiones.",
      className: "tl-page-header",
      titleClassName: "tl-page-title",
      descriptionClassName: "tl-page-sub",
    })}

    ${renderMetricStudyGrid()}

    <div class="glossary-grid">
      ${sortGlossaryGroups(groups).map(([category, terms]) => `
        <section class="study-category-section" aria-label="${escapeGlossaryHtml(category)}">
          <div class="study-category-section__header">
            <div>
              <p class="study-metric-lab__eyebrow">${escapeGlossaryHtml(category)}</p>
              <h3>${escapeGlossaryHtml(category)}</h3>
            </div>
            <p>${escapeGlossaryHtml(CATEGORY_COPY[category] || "Métricas para entender mejor el contexto operativo antes de decidir.")}</p>
          </div>
          <div class="study-card-grid study-card-grid--compact">
            ${terms.map((term, index) => renderTermStudyCard(term, index)).join("")}
          </div>
        </section>
      `).join("")}
    </div>
  `;
}
