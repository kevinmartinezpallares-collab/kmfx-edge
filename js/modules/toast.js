export function showToast(message, type = "default", duration = 2800) {
  const existing = document.querySelector(".kmfx-toast");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.className = `kmfx-toast${type !== "default" ? ` kmfx-toast--${type}` : ""}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}
