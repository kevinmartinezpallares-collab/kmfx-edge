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

describe("workspace source contract", () => {
  it("keeps the one-year fixture as the default V1 source", () => {
    const source = readWorkspaceSource();

    expect(source).toContain('process.env.KMFX_WAVE1_SOURCE || "fixture"');
    expect(source).toContain('if (sourceMode === "mock")');
    expect(source).toContain('if (sourceMode === "fixture")');
  });

  it("falls back from live mode to the redacted fixture instead of crashing the UI", () => {
    const source = readWorkspaceSource();

    expect(source).toContain("live snapshot unavailable, falling back to fixture");
    expect(source).toContain("return readFixtureWorkspaceState();");
  });

  it("keeps workspace routes dynamic so live read-only snapshots are not frozen at build time", () => {
    expect(readWorkspaceLayout()).toContain('export const dynamic = "force-dynamic";');
  });

  it("uses a short server-side snapshot cache to avoid refetching live data on every route click", () => {
    const source = readAccountsSnapshotClient();

    expect(source).toContain("resolveKmfxSnapshotCacheTtlMs");
    expect(source).toContain("liveSnapshotCache");
    expect(source).toContain('cache: "no-store"');
  });
});
