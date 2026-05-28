import { describe, expect, it } from "vitest";

import { createMt5SourceConfig } from "@/lib/data/mt5-source-config";

describe("mt5 source config", () => {
  it("normalizes a read-only MT5 source config", () => {
    expect(
      createMt5SourceConfig({
        endpoint: " https://api.example.test/mt5 ",
        accountId: " 10000001 ",
        status: "connected",
        lastSyncAt: "2026-05-19T10:00:00Z",
      }),
    ).toEqual({
      sourceType: "mt5",
      endpoint: "https://api.example.test/mt5",
      accountId: "10000001",
      status: "connected",
      lastSyncAt: "2026-05-19T10:00:00Z",
    });
  });

  it("degrades invalid values without starting a connection", () => {
    expect(createMt5SourceConfig({ status: "syncing" })).toEqual({
      sourceType: "mt5",
      endpoint: null,
      accountId: null,
      status: "idle",
      lastSyncAt: null,
    });
  });
});
