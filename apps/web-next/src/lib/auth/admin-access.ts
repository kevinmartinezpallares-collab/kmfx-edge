export function parseAdminEmails(value: string | undefined) {
  return String(value || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getAdminEmailAllowlist() {
  return [
    ...parseAdminEmails(process.env.KMFX_ADMIN_EMAILS),
    ...parseAdminEmails(process.env.KMFX_GENETIC_OWNER_EMAIL),
  ];
}

export function isAdminEmailAllowed(email: string | null | undefined) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return false;

  return getAdminEmailAllowlist().includes(normalizedEmail);
}

export function isGeneticLabEnabled() {
  return process.env.KMFX_ENABLE_GENETIC_LAB === "1";
}

export function isGeneticLabPath(pathname: string) {
  return (
    pathname === "/strategy-lab" ||
    pathname.startsWith("/strategy-lab/") ||
    pathname === "/genetic-lab" ||
    pathname.startsWith("/genetic-lab/") ||
    pathname === "/api/internal/genetic" ||
    pathname.startsWith("/api/internal/genetic/")
  );
}
