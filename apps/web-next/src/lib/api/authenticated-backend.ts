import "server-only";

import { buildKmfxApiUrl } from "@/lib/api/kmfx-api-config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type BackendJsonOptions = {
  body?: Record<string, unknown>;
  method?: "DELETE" | "GET" | "POST";
};

async function resolveSupabaseAccessToken() {
  const supabase = await createServerSupabaseClient();
  const claims = await supabase.auth.getClaims();

  if (claims.error || !claims.data?.claims) {
    throw new Error("auth_required");
  }

  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;

  if (!accessToken) {
    throw new Error("auth_required");
  }

  return accessToken;
}

export async function requestAuthenticatedBackendJson(
  pathname: string,
  { body, method = "GET" }: BackendJsonOptions = {},
) {
  const accessToken = await resolveSupabaseAccessToken();
  const response = await fetch(buildKmfxApiUrl(pathname), {
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    method,
  });
  const payload = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    payload,
    status: response.status,
  };
}
