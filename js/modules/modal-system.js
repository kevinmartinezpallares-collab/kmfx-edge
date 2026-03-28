let modalRoot = null;

function ensureRoot() {
  if (modalRoot) return modalRoot;
  modalRoot = document.getElementById("modalRoot");
  return modalRoot;
}

function enhanceModalSelects(scope) {
  scope.querySelectorAll(".modal-body select").forEach((select) => {
    if (select.parentElement?.classList.contains("modal-select-wrap")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "modal-select-wrap";
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);

    const chevron = document.createElement("span");
    chevron.className = "modal-select-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M6 9l6 6 6-6" stroke="#636366" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    `;
    wrapper.appendChild(chevron);
  });
}

export function closeModal() {
  const root = ensureRoot();
  if (!root) return;
  root.innerHTML = "";
  document.body.classList.remove("modal-open");
}

export function openModal({ title, subtitle = "", maxWidth = 560, content = "", onMount } = {}) {
  const root = ensureRoot();
  if (!root) return;

  root.innerHTML = `
    <div class="modal-overlay open" data-modal-dismiss="true">
      <div class="modal-card" style="max-width:${maxWidth}px" role="dialog" aria-modal="true">
        <div class="modal-head">
          <div>
            <div class="modal-title">${title || "KMFX Edge"}</div>
            ${subtitle ? `<div class="modal-subtitle">${subtitle}</div>` : ""}
          </div>
          <button class="modal-close" type="button" data-modal-dismiss="true" aria-label="Cerrar">✕</button>
        </div>
        <div class="modal-body">${content}</div>
      </div>
    </div>
  `;

  document.body.classList.add("modal-open");
  enhanceModalSelects(root);

  root.onclick = (event) => {
    const dismissTarget = event.target.closest("[data-modal-dismiss='true']");
    if (dismissTarget) {
      closeModal();
    }
  };

  const card = root.querySelector(".modal-card");
  if (typeof onMount === "function") onMount(card);
}
