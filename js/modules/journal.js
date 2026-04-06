import { closeModal, openModal } from "./modal-system.js?v=build-20260406-191800";
import { formatCurrency, selectCurrentAccount } from "./utils.js?v=build-20260406-191800";

const emptyForm = {
  date: "2026-03-20",
  symbol: "",
  setup: "",
  pnl: "",
  grade: "B",
  notes: "",
  lesson: ""
};

function upsertEntry(entries, nextEntry) {
  const index = entries.findIndex((item) => item.id === nextEntry.id);
  if (index === -1) return [nextEntry, ...entries];
  const copy = [...entries];
  copy[index] = nextEntry;
  return copy;
}

export function initJournal(store) {
  const root = document.getElementById("journalRoot");
  if (!root) return;

  function openJournalEditor(entryId = null) {
    const state = store.getState();
    const account = selectCurrentAccount(state);
    const item = entryId ? state.workspace.journal.entries.find((entry) => entry.id === entryId) : null;
    const form = item ? {
      date: item.date,
      symbol: item.symbol,
      setup: item.setup,
      pnl: item.pnl,
      grade: item.grade,
      notes: item.notes,
      lesson: item.lesson
    } : {
      ...emptyForm,
      date: state.workspace.journal.form.date || emptyForm.date
    };

    openModal({
      title: item ? "Editar entrada de diario" : "Nueva entrada de diario",
      subtitle: `${account?.name || "Cuenta"} · flujo local estable`,
      content: `
        <form class="modal-form-shell" data-modal-form>
        <div class="form-grid-clean">
          <label class="form-stack"><span>Fecha</span><input type="date" name="date" value="${form.date}"></label>
          <label class="form-stack"><span>Símbolo</span><input type="text" name="symbol" value="${form.symbol}"></label>
          <label class="form-stack"><span>Setup</span><input type="text" name="setup" value="${form.setup}"></label>
          <label class="form-stack"><span>PnL</span><input type="number" name="pnl" value="${form.pnl}"></label>
          <label class="form-stack"><span>Grade</span><select name="grade">
            ${["A", "B", "C"].map((grade) => `<option value="${grade}" ${form.grade === grade ? "selected" : ""}>${grade}</option>`).join("")}
          </select></label>
          <label class="form-stack form-stack-wide"><span>Notas</span><textarea name="notes" rows="3">${form.notes}</textarea></label>
          <label class="form-stack form-stack-wide"><span>Lección</span><textarea name="lesson" rows="3">${form.lesson}</textarea></label>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" type="button" data-modal-dismiss="true">Cancelar</button>
          <button class="btn-primary" type="button" data-journal-modal-save="true">${item ? "Guardar cambios" : "Guardar entrada"}</button>
        </div>
        </form>
      `,
      onMount(card) {
        card.querySelector("[data-journal-modal-save='true']")?.addEventListener("click", () => {
          const payload = Object.fromEntries(new FormData(card.querySelector("[data-modal-form]")).entries());
          store.setState((prev) => {
            const entry = {
              id: item?.id || `jr-${Date.now()}`,
              accountId: prev.currentAccount,
              ...payload,
              pnl: Number(payload.pnl || 0)
            };
            return {
              ...prev,
              workspace: {
                ...prev.workspace,
                journal: {
                  entries: upsertEntry(prev.workspace.journal.entries, entry),
                  form: { ...emptyForm },
                  editingId: null
                }
              }
            };
          });
          closeModal();
        });
      }
    });
  }

  root.addEventListener("click", (event) => {
    const action = event.target.closest("[data-journal-action]");
    if (!action) return;

    const { journalAction, journalId } = action.dataset;

    if (journalAction === "new") openJournalEditor();

    if (journalAction === "edit") {
      openJournalEditor(journalId);
    }

    if (journalAction === "delete") {
      store.setState((state) => ({
        ...state,
        workspace: {
          ...state.workspace,
          journal: {
            ...state.workspace.journal,
            entries: state.workspace.journal.entries.filter((entry) => entry.id !== journalId),
            editingId: state.workspace.journal.editingId === journalId ? null : state.workspace.journal.editingId
          }
        }
      }));
    }

  });
}

export function renderJournal(root, state) {
  const account = selectCurrentAccount(state);
  if (!account) {
    root.innerHTML = "";
    return;
  }

  const { entries } = state.workspace.journal;
  const accountEntries = entries.filter((entry) => entry.accountId === account.id);

  root.innerHTML = `
    <div class="tl-page-header">
      <div class="tl-page-title">Diario</div>
      <div class="tl-page-sub">Diario de trading con CRUD local estable y foco sobre la cuenta activa.</div>
      <div class="page-actions">
        <div class="pill">Modal workflow</div>
        <button class="btn-primary" data-journal-action="new">Nueva entrada</button>
      </div>
    </div>

    <div class="grid-2 equal">
      <article class="tl-section-card">
        <div class="tl-section-header"><div class="tl-section-title">Journal Snapshot</div></div>
        <div class="detail-metrics-grid">
          <div class="metric-item"><div class="metric-label">Cuenta</div><div class="metric-value">${account.name}</div></div>
          <div class="metric-item"><div class="metric-label">Entradas</div><div class="metric-value">${accountEntries.length}</div></div>
          <div class="metric-item"><div class="metric-label">P&L documentado</div><div class="metric-value">${formatCurrency(accountEntries.reduce((sum, entry) => sum + entry.pnl, 0))}</div></div>
          <div class="metric-item"><div class="metric-label">Último grado</div><div class="metric-value">${accountEntries[0]?.grade || "—"}</div></div>
        </div>
      </article>

      <article class="tl-section-card journal-highlight-card">
        <div class="tl-section-header"><div class="tl-section-title">Review Discipline</div><div class="pill">Legacy-style</div></div>
        <p class="body-copy">Las entradas nuevas y las ediciones ahora pasan por modal para acercar la experiencia al dashboard original sin reintroducir handlers inline ni dependencias frágiles.</p>
        <div class="settings-actions">
          <button class="btn-secondary" data-journal-action="new">Abrir editor</button>
        </div>
      </article>
    </div>

    <article class="tl-section-card">
      <div class="tl-section-header"><div class="tl-section-title">Entradas recientes</div></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Símbolo</th><th>Setup</th><th>PnL</th><th>Grade</th><th>Lección</th><th>Acciones</th></tr></thead>
          <tbody>
            ${accountEntries.map((entry) => `
              <tr>
                <td>${entry.date}</td>
                <td>${entry.symbol}</td>
                <td>${entry.setup}</td>
                <td class="${entry.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(entry.pnl)}</td>
                <td>${entry.grade}</td>
                <td>${entry.lesson}</td>
                <td>
                  <div class="table-actions">
                    <button class="btn-secondary btn-inline" data-journal-action="edit" data-journal-id="${entry.id}">Editar</button>
                    <button class="btn-secondary btn-inline" data-journal-action="delete" data-journal-id="${entry.id}">Borrar</button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}
