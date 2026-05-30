import { redirect } from "next/navigation";

import type { WorkspaceSearchParams } from "@/lib/data/workspace-source";

type LegacySettingsPageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

function firstSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function appendIfPresent(
  params: URLSearchParams,
  key: string,
  value: string | string[] | undefined,
) {
  const normalizedValue = firstSearchParamValue(value);
  if (normalizedValue) params.set(key, normalizedValue);
}

export default async function LegacySettingsRedirect({
  searchParams,
}: LegacySettingsPageProps) {
  const resolvedSearchParams = await searchParams;
  const tab = firstSearchParamValue(resolvedSearchParams?.tab);

  if (tab && tab !== "subscription") {
    redirect("/settings");
  }

  const params = new URLSearchParams();
  appendIfPresent(params, "checkout", resolvedSearchParams?.checkout);
  appendIfPresent(params, "billing", resolvedSearchParams?.billing);
  appendIfPresent(params, "session_id", resolvedSearchParams?.session_id);

  redirect(`/subscription${params.size ? `?${params.toString()}` : ""}`);
}
