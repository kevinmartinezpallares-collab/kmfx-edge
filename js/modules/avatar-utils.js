export function normalizeAvatarUrl(candidate) {
  if (!candidate) return null;

  if (typeof candidate === "string") {
    const value = candidate.trim();
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    if (/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i.test(value)) return value;
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

  container.textContent = "";
  const img = document.createElement("img");
  img.className = "user-avatar-image";
  img.src = safeAvatar;
  img.alt = String(name || "Usuario");
  img.addEventListener("error", () => {
    container.textContent = safeInitials;
  }, { once: true });
  container.appendChild(img);
}
