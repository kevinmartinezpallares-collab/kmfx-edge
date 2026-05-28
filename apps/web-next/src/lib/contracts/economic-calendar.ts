export type EconomicImpact = "alto" | "medio" | "bajo";

export type EconomicCalendarProviderStatus =
  | "not_connected"
  | "cached"
  | "connected"
  | "stale"
  | "error";

export type EconomicCalendarEvent = {
  id: string;
  scheduledAt: string;
  timeLabel: string;
  currency: string;
  country?: string;
  title: string;
  impact: EconomicImpact;
  affectedSymbols: string[];
  protectionWindowLabel: string;
  suggestedAction: string;
  source: {
    provider: string;
    status: EconomicCalendarProviderStatus;
    provenanceUrl?: string;
    fetchedAt?: string;
  };
  actual?: string | number | null;
  forecast?: string | number | null;
  previous?: string | number | null;
};
