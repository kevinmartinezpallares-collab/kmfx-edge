export function parseInviteCodeList(value: string | undefined) {
  return String(value || "")
    .split(",")
    .map((code) => normalizeInviteCode(code))
    .filter(Boolean);
}

export function normalizeInviteCode(code: string | null | undefined) {
  return String(code || "")
    .trim()
    .toLowerCase();
}

export function getInviteCodes() {
  return [
    ...parseInviteCodeList(process.env.KMFX_INVITE_CODES),
    ...parseInviteCodeList(process.env.KMFX_INVITE_CODE),
  ];
}

export function isInviteOnlySignupEnabled() {
  return (
    process.env.KMFX_INVITE_ONLY_SIGNUP === "1" || getInviteCodes().length > 0
  );
}

export function isInviteCodeAllowed(code: string | null | undefined) {
  const normalizedCode = normalizeInviteCode(code);
  if (!normalizedCode) return false;

  return getInviteCodes().includes(normalizedCode);
}
