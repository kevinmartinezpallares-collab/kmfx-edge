export function renderGlossary(root, state) {
  const groups = state.workspace.glossary.terms.reduce((map, term) => {
    if (!map.has(term.category)) map.set(term.category, []);
    map.get(term.category).push(term);
    return map;
  }, new Map());

  root.innerHTML = `
    <div class="tl-page-header">
      <div class="tl-page-title">Glosario de métricas</div>
      <div class="tl-page-sub">Referencia breve para entender qué mide cada dato, por qué importa y cómo se calcula cuando aplica.</div>
    </div>

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
                  <div class="glossary-copy"><strong>Por qué importa:</strong> ${term.why}</div>
                  <div class="glossary-copy"><strong>Fórmula:</strong> ${term.formula || "No aplica"}</div>
                </div>
              </div>
            `).join("")}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}
