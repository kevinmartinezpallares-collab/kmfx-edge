import "server-only";

import { buildKmfxApiUrl } from "@/lib/api/kmfx-api-config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type BackendJsonOptions = {
  body?: Record<string, unknown>;
  method?: "DELETE" | "GET" | "PATCH" | "POST";
};

function sanitizeBackendPath(pathname: string) {
  return pathname.split("?", 1)[0] || pathname;
}

function logBackendProxyEvent(
  level: "error" | "info" | "warn",
  event: string,
  fields: Record<string, unknown>,
) {
  const payload = JSON.stringify({
    event,
    level,
    service: "kmfx-next",
    ...fields,
  });

  if (level === "error") {
    console.error(payload);
  } else if (level === "warn") {
    console.warn(payload);
  } else {
    console.log(payload);
  }
}

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
  const start = Date.now();
  const route = sanitizeBackendPath(pathname);

  try {
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
    const ms = Date.now() - start;

    logBackendProxyEvent(response.ok ? "info" : "warn", "backend_proxy_done", {
      method,
      ms,
      route,
      status: response.status,
    });

    return {
      ok: response.ok,
      payload,
      status: response.status,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "backend_proxy_failed";
    const ms = Date.now() - start;

    logBackendProxyEvent(reason === "auth_required" ? "warn" : "error", "backend_proxy_failed", {
      method,
      ms,
      reason,
      route,
    });

    throw error;
  }
}
