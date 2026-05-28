import "server-only";

import {
  resolveKmfxAccountsSnapshotUrl,
  resolveKmfxSnapshotTimeoutMs,
  type SnapshotView,
} from "@/lib/api/kmfx-api-config";
import type { RawLiveAccountsSnapshot } from "@/lib/contracts/live-snapshot";

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

export async function fetchLiveAccountsSnapshot({
  view = "full",
}: {
  view?: SnapshotView;
} = {}): Promise<RawLiveAccountsSnapshot> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    resolveKmfxSnapshotTimeoutMs(),
  );

  let response: Response;

  try {
    response = await fetch(resolveKmfxAccountsSnapshotUrl({ view }), {
      headers: buildPreviewHeaders(),
      cache: "no-store",
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
