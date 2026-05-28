import "server-only";

import { cache } from "react";

import { fetchLiveAccountsSnapshot } from "@/lib/api/accounts-snapshot-client";
import type { RawLiveAccountsSnapshot } from "@/lib/contracts/live-snapshot";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { createWorkspaceFromLiveSnapshot } from "@/lib/data/live-snapshot-adapter";
import fixtureSnapshot from "@/lib/data/fixtures/live-accounts-snapshot.fixture.json";
import { wave1Workspace } from "@/lib/data/wave1-mock";

type WorkspaceSourceMode = WorkspaceState["meta"]["sourceMode"];

function resolveWorkspaceSourceMode(): WorkspaceSourceMode {
  const normalized = String(process.env.KMFX_WAVE1_SOURCE || "fixture")
    .trim()
    .toLowerCase();

  if (normalized === "mock" || normalized === "fixture" || normalized === "live") {
    return normalized;
  }

  return "fixture";
}

async function readFixtureWorkspaceState() {
  return createWorkspaceFromLiveSnapshot(
    fixtureSnapshot as RawLiveAccountsSnapshot,
    "fixture",
  );
}

async function buildWorkspaceState(): Promise<WorkspaceState> {
  const sourceMode = resolveWorkspaceSourceMode();

  if (sourceMode === "mock") {
    return wave1Workspace;
  }

  if (sourceMode === "fixture") {
    return readFixtureWorkspaceState();
  }

  try {
    const liveSnapshot = await fetchLiveAccountsSnapshot({ view: "full" });
    return createWorkspaceFromLiveSnapshot(liveSnapshot, "live");
  } catch (error) {
    console.warn("[KMFX][NEXT][WAVE1] live snapshot unavailable, falling back to fixture", {
      message: error instanceof Error ? error.message : String(error),
    });
    return readFixtureWorkspaceState();
  }
}

export const getWorkspaceState = cache(buildWorkspaceState);
