const DEFAULT_MARKETING_PREVIEW_EMAIL = "kevinmartinezpallares@gmail.com";

function parseEmails(value: string | undefined) {
  return String(value || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getMarketingPreviewEmails() {
  const configured = parseEmails(process.env.KMFX_MARKETING_PREVIEW_EMAILS);
  return configured.length > 0 ? configured : [DEFAULT_MARKETING_PREVIEW_EMAIL];
}

export function isMarketingPreviewEmail(email: string | null | undefined) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return false;

  return getMarketingPreviewEmails().includes(normalizedEmail);
}

export function isMarketingPreviewDemoValue(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase() === "marketing";
}
