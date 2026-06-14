import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readWorkspaceSource() {
  return fs.readFileSync(
    path.join(process.cwd(), "src/lib/data/workspace-source.ts"),
    "utf8",
  );
}

function readWorkspaceLayout() {
  return fs.readFileSync(
    path.join(process.cwd(), "src/app/(workspace)/layout.tsx"),
    "utf8",
  );
}

function readAccountsSnapshotClient() {
  return fs.readFileSync(
    path.join(process.cwd(), "src/lib/api/accounts-snapshot-client.ts"),
    "utf8",
  );
}

function readWorkspacePage(pagePath: string) {
  return fs.readFileSync(path.join(process.cwd(), pagePath), "utf8");
}

describe("workspace source contract", () => {
  it("keeps fixture as the local default and live as the production default", () => {
    const source = readWorkspaceSource();

    expect(source).toContain('process.env.NODE_ENV === "production" ? "live" : "fixture"');
    expect(source).toContain("process.env.KMFX_WAVE1_SOURCE || defaultSourceMode");
    expect(source).toContain('if (sourceMode === "mock")');
    expect(source).toContain('if (sourceMode === "fixture")');
  });

  it("does not hide live mode failures behind the redacted fixture", () => {
    const source = readWorkspaceSource();

    expect(source).toContain("KMFX_ALLOW_LIVE_FIXTURE_FALLBACK");
    expect(source).toContain("shouldAllowLiveFixtureFallback");
    expect(source).toContain("KMFX live snapshot unavailable");
    expect(source).toContain("throw new Error");
  });

  it("keeps workspace routes dynamic so live read-only snapshots are not frozen at build time", () => {
    expect(readWorkspaceLayout()).toContain('export const dynamic = "force-dynamic";');
  });

  it("uses a short server-side snapshot cache to avoid refetching live data on every route click", () => {
    const source = readAccountsSnapshotClient();

    expect(source).toContain("resolveKmfxSnapshotCacheTtlMs");
    expect(source).toContain("KMFX_AUTH_SNAPSHOT_CACHE_TTL_MS");
    expect(source).toContain('fingerprint(headers.get("Authorization")');
    expect(source).toContain("liveSnapshotCache");
    expect(source).toContain("revalidate: Math.max");
    expect(source).toContain('cache: "no-store"');
  });

  it("allows workspace pages to select the active account from the URL", () => {
    const source = readWorkspaceSource();

    expect(source).toContain("withActiveWorkspaceAccount");
    expect(source).toContain("getWorkspaceStateForSearchParams");
    expect(source).toContain("resolvedSearchParams?.account");
  });

  it("hydrates V1 workspace pages from the selected account instead of only the shell", () => {
    const pagePaths = [
      "src/app/(workspace)/dashboard/page.tsx",
      "src/app/(workspace)/accounts/page.tsx",
      "src/app/(workspace)/capital/page.tsx",
      "src/app/(workspace)/trades/page.tsx",
      "src/app/(workspace)/calendar/page.tsx",
      "src/app/(workspace)/analytics/page.tsx",
      "src/app/(workspace)/analytics/daily/page.tsx",
      "src/app/(workspace)/analytics/hourly/page.tsx",
      "src/app/(workspace)/analytics/risk/page.tsx",
      "src/app/(workspace)/settings/page.tsx",
      "src/app/(workspace)/tools/calculator/page.tsx",
      "src/app/(workspace)/study/page.tsx",
    ];

    for (const pagePath of pagePaths) {
      const pageSource = readWorkspacePage(pagePath);

      expect(pageSource, pagePath).toContain("getWorkspaceStateForSearchParams");
      expect(pageSource, pagePath).toContain("searchParams");
      expect(pageSource, pagePath).toContain("workspace={workspace}");
    }
  });

  it("keeps preview mode explicit and backed by the redacted fixture", () => {
    const source = readWorkspaceSource();

    expect(source).toContain('resolvedSearchParams?.demo');
    expect(source).toContain("previewMode");
    expect(source).toContain('previewMode === "mock"');
    expect(source).toContain('previewMode === "marketing"');
    expect(source).toContain("isMarketingPreviewEmail(userEmail)");
    expect(source).toContain("return readFixtureWorkspaceState(activeAccountId)");
    expect(source).toContain("return readMarketingWorkspaceState(activeAccountId)");
  });
});
