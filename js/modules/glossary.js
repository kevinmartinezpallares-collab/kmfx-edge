import { pageHeaderMarkup } from "./ui-primitives.js?v=build-20260504-080918";

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

    <div class="glossary-grid">
      ${[...groups.entries()].map(([category, terms]) => `
        <article class="tl-section-card">
          <div class="tl-section-header"><div class="tl-section-title">${category}</div></div>
          <div class="breakdown-list">
            ${terms.map((term) => `
              <div class="list-row glossary-row">
                <div>
                  <div class="row-title">${term.term}</div>
                  <div class="glossary-copy"><strong>Qué es:</strong> ${term.what}</div>
                  <div class="glossary-copy"><strong>Para qué sirve:</strong> ${term.why}</div>
                  <div class="glossary-copy"><strong>Cómo funciona:</strong> ${resolveHowItWorks(term)}</div>
                  <div class="glossary-copy"><strong>Qué mirar:</strong> ${resolveWhatToWatch(term)}</div>
                </div>
              </div>
            `).join("")}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}
