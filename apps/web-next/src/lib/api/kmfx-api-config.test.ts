import { afterEach, describe, expect, it } from "vitest";

import {
  buildKmfxApiUrl,
  resolveKmfxAccountsSnapshotUrl,
  resolveKmfxApiBaseUrl,
  resolveKmfxSnapshotCacheTtlMs,
  resolveKmfxSnapshotTimeoutMs,
} from "@/lib/api/kmfx-api-config";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("kmfx-api-config", () => {
  it("prefers the server-only API base URL when configured", () => {
    process.env.KMFX_API_BASE_URL = " https://api.example.test/ ";
    process.env.NEXT_PUBLIC_KMFX_API_BASE_URL = "https://public.example.test";

    expect(resolveKmfxApiBaseUrl()).toBe("https://api.example.test");
    expect(buildKmfxApiUrl("api/accounts/snapshot")).toBe(
      "https://api.example.test/api/accounts/snapshot",
    );
  });

  it("uses the public base URL only as an explicit fallback", () => {
    delete process.env.KMFX_API_BASE_URL;
    process.env.NEXT_PUBLIC_KMFX_API_BASE_URL = "https://public.example.test/";

    expect(resolveKmfxApiBaseUrl()).toBe("https://public.example.test");
  });

  it("keeps snapshot endpoint construction centralised", () => {
    process.env.KMFX_API_BASE_URL = "http://127.0.0.1:8000";

    expect(resolveKmfxAccountsSnapshotUrl()).toBe(
      "http://127.0.0.1:8000/api/accounts/snapshot",
    );
    expect(resolveKmfxAccountsSnapshotUrl({ view: "summary" })).toBe(
      "http://127.0.0.1:8000/api/accounts/snapshot?view=summary",
    );
  });

  it("keeps live snapshot timeout bounded for beta read-only mode", () => {
    delete process.env.KMFX_SNAPSHOT_TIMEOUT_MS;
    expect(resolveKmfxSnapshotTimeoutMs()).toBe(8000);

    process.env.KMFX_SNAPSHOT_TIMEOUT_MS = "250";
    expect(resolveKmfxSnapshotTimeoutMs()).toBe(1000);

    process.env.KMFX_SNAPSHOT_TIMEOUT_MS = "120000";
    expect(resolveKmfxSnapshotTimeoutMs()).toBe(60000);

    process.env.KMFX_SNAPSHOT_TIMEOUT_MS = "4500";
    expect(resolveKmfxSnapshotTimeoutMs()).toBe(4500);
  });

  it("keeps live snapshot cache TTL short and bounded for route navigation", () => {
    delete process.env.KMFX_SNAPSHOT_CACHE_TTL_MS;
    expect(resolveKmfxSnapshotCacheTtlMs()).toBe(15000);

    process.env.KMFX_SNAPSHOT_CACHE_TTL_MS = "-1";
    expect(resolveKmfxSnapshotCacheTtlMs()).toBe(15000);

    process.env.KMFX_SNAPSHOT_CACHE_TTL_MS = "0";
    expect(resolveKmfxSnapshotCacheTtlMs()).toBe(0);

    process.env.KMFX_SNAPSHOT_CACHE_TTL_MS = "120000";
    expect(resolveKmfxSnapshotCacheTtlMs()).toBe(60000);
  });
});
