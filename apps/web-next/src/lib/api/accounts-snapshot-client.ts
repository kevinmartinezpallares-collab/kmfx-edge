import "server-only";

import { createHash } from "node:crypto";

import {
  resolveKmfxAccountsSnapshotUrl,
  resolveKmfxSnapshotCacheTtlMs,
  resolveKmfxSnapshotTimeoutMs,
  type SnapshotView,
} from "@/lib/api/kmfx-api-config";
import type { RawLiveAccountsSnapshot } from "@/lib/contracts/live-snapshot";
import { isSupabaseAuthEnabled } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SnapshotCacheEntry = {
  expiresAt: number;
  promise: Promise<RawLiveAccountsSnapshot>;
};

const liveSnapshotCache = new Map<string, SnapshotCacheEntry>();

function fingerprint(value: string) {
  if (!value) return "";

  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function buildPreviewHeaders() {
  const headers = new Headers({
    Accept: "application/json",
  });

  const token = process.env.KMFX_PREVIEW_BEARER_TOKEN?.trim();
  const userEmail = process.env.KMFX_PREVIEW_USER_EMAIL?.trim();
  const userId = process.env.KMFX_PREVIEW_USER_ID?.trim();

  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (userEmail) headers.set("X-KMFX-User-Email", userEmail);
  if (userId) headers.set("X-KMFX-User-Id", userId);

  return headers;
}

async function buildSupabaseUserHeaders() {
  const headers = new Headers({
    Accept: "application/json",
  });
  const supabase = await createServerSupabaseClient();
  const claims = await supabase.auth.getClaims();

  if (claims.error || !claims.data?.claims) {
    throw new Error("Supabase session is required for live snapshot");
  }

  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;

  if (!accessToken) {
    throw new Error("Supabase access token is required for live snapshot");
  }

  headers.set("Authorization", `Bearer ${accessToken}`);
  return headers;
}

async function buildSnapshotHeaders() {
  if (isSupabaseAuthEnabled()) {
    return buildSupabaseUserHeaders();
  }

  return buildPreviewHeaders();
}

function resolveEffectiveSnapshotCacheTtlMs() {
  if (isSupabaseAuthEnabled()) return 0;
  return resolveKmfxSnapshotCacheTtlMs();
}

function snapshotCacheKey(view: SnapshotView) {
  return [
    view,
    fingerprint(process.env.KMFX_PREVIEW_BEARER_TOKEN?.trim() ?? ""),
    fingerprint(process.env.KMFX_PREVIEW_USER_EMAIL?.trim() ?? ""),
    fingerprint(process.env.KMFX_PREVIEW_USER_ID?.trim() ?? ""),
  ].join(":");
}

async function requestLiveAccountsSnapshot(view: SnapshotView) {
  const controller = new AbortController();
  const ttlMs = resolveEffectiveSnapshotCacheTtlMs();
  const timeout = setTimeout(
    () => controller.abort(),
    resolveKmfxSnapshotTimeoutMs(),
  );

  let response: Response;

  try {
    response = await fetch(resolveKmfxAccountsSnapshotUrl({ view }), {
      headers: await buildSnapshotHeaders(),
      ...(ttlMs > 0
        ? {
            next: {
              revalidate: Math.max(1, Math.ceil(ttlMs / 1000)),
            },
          }
        : { cache: "no-store" as const }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(
      `Live snapshot request failed with status ${response.status}`,
    );
  }

  return (await response.json()) as RawLiveAccountsSnapshot;
}

export function clearLiveAccountsSnapshotCache() {
  liveSnapshotCache.clear();
}

export async function fetchLiveAccountsSnapshot({
  view = "full",
}: {
  view?: SnapshotView;
} = {}): Promise<RawLiveAccountsSnapshot> {
  const ttlMs = resolveEffectiveSnapshotCacheTtlMs();
  if (ttlMs <= 0) return requestLiveAccountsSnapshot(view);

  const now = Date.now();
  const cacheKey = snapshotCacheKey(view);
  const cached = liveSnapshotCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = requestLiveAccountsSnapshot(view).catch((error: unknown) => {
    liveSnapshotCache.delete(cacheKey);
    throw error;
  });
  liveSnapshotCache.set(cacheKey, {
    expiresAt: now + ttlMs,
    promise,
  });

  return promise;
}
