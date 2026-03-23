export function normalizeAvatarUrl(candidate) {
  if (!candidate) return null;

  if (typeof candidate === "string") {
    const value = candidate.trim();
    if (!value) return null;
    if (/^https?:\/\//i.test(value) || /^data:image\//i.test(value)) return value;
    return null;
  }

  if (typeof candidate === "object") {
    return normalizeAvatarUrl(
      candidate.url
      || candidate.avatar_url
      || candidate.picture
      || candidate.image
      || candidate.data?.url
      || null
    );
  }

  return null;
}

export function applyAvatarContent(container, { avatarUrl, initials = "KM", name = "Usuario" } = {}) {
  if (!container) return;

  const safeInitials = String(initials || "KM").slice(0, 3).toUpperCase();
  const safeAvatar = normalizeAvatarUrl(avatarUrl);

  if (!safeAvatar) {
    container.textContent = safeInitials;
    return;
  }

  container.innerHTML = `<img class="user-avatar-image" src="${safeAvatar}" alt="${name}">`;
  const img = container.querySelector(".user-avatar-image");
  img?.addEventListener("error", () => {
    container.textContent = safeInitials;
  }, { once: true });
}
