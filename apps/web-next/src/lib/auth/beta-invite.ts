function readEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }

  return "";
}

function normalizeInviteCode(code: string) {
  return code.trim().replace(/\s+/g, "").toUpperCase();
}

export function isBetaInviteHost(host: string | null | undefined) {
  const normalizedHost = (host || "").toLowerCase();
  return normalizedHost === "beta.kmfxedge.com";
}

export function isBetaInviteRequiredForHost(host: string | null | undefined) {
  const override = readEnv("KMFX_BETA_INVITE_REQUIRED").toLowerCase();
  if (override === "1" || override === "true" || override === "yes") {
    return true;
  }
  if (override === "0" || override === "false" || override === "no") {
    return false;
  }

  return isBetaInviteHost(host);
}

export function getConfiguredBetaInviteCodes() {
  return readEnv("KMFX_BETA_INVITE_CODES", "KMFX_BETA_INVITE_CODE")
    .split(/[,\n;]/)
    .map(normalizeInviteCode)
    .filter(Boolean);
}

export function hasConfiguredBetaInviteCodes() {
  return getConfiguredBetaInviteCodes().length > 0;
}

export function isValidBetaInviteCode(code: string) {
  const normalizedCode = normalizeInviteCode(code);
  if (!normalizedCode) return false;

  return getConfiguredBetaInviteCodes().includes(normalizedCode);
}
