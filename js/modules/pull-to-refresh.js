export function initPullToRefresh(onRefresh) {
  let startY = 0;
  let pulling = false;
  let refreshing = false;
  const threshold = 72;

  const indicator = document.createElement("div");
  indicator.className = "kmfx-pull-indicator";
  indicator.innerHTML = "↓";
  document.body.appendChild(indicator);

  document.addEventListener("touchstart", (e) => {
    if (window.scrollY === 0 && !refreshing) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!pulling || refreshing) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0 && dy < threshold + 20) {
      indicator.style.top = `${Math.min(dy - 48 + 16, 20)}px`;
      indicator.innerHTML = dy > threshold ? "↻" : "↓";
    }
  }, { passive: true });

  document.addEventListener("touchend", async (e) => {
    if (!pulling || refreshing) return;
    pulling = false;
    const dy = e.changedTouches[0].clientY - startY;

    if (dy > threshold) {
      refreshing = true;
      indicator.style.top = "16px";
      indicator.innerHTML = "↻";
      indicator.classList.add("is-refreshing");
      try {
        await onRefresh?.();
      } finally {
        indicator.classList.remove("is-refreshing");
        indicator.style.top = "-48px";
        refreshing = false;
      }
    } else {
      indicator.style.top = "-48px";
    }

    startY = 0;
  });
}
