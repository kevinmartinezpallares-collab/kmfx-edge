import "server-only";

import { cache } from "react";

import { fetchLiveAccountsSnapshot } from "@/lib/api/accounts-snapshot-client";
import type { RawLiveAccountsSnapshot } from "@/lib/contracts/live-snapshot";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { createWorkspaceFromLiveSnapshot } from "@/lib/data/live-snapshot-adapter";
import fixtureSnapshot from "@/lib/data/fixtures/live-accounts-snapshot.fixture.json";
import { wave1Workspace } from "@/lib/data/wave1-mock";

type WorkspaceSourceMode = WorkspaceState["meta"]["sourceMode"];
export type WorkspaceSearchParams = Record<
  string,
  string | string[] | undefined
>;

type SearchParamsLike =
  | Promise<WorkspaceSearchParams | undefined>
  | WorkspaceSearchParams
  | undefined;

const MARKETING_SNAPSHOT_ANCHOR_MS = Date.parse("2026-06-13T09:00:00Z");

function resolveWorkspaceSourceMode(): WorkspaceSourceMode {
  const normalized = String(process.env.KMFX_WAVE1_SOURCE || "fixture")
    .trim()
    .toLowerCase();

  if (normalized === "mock" || normalized === "fixture" || normalized === "live") {
    return normalized;
  }

  return "fixture";
}

function shouldAllowLiveFixtureFallback() {
  const normalized = String(process.env.KMFX_ALLOW_LIVE_FIXTURE_FALLBACK || "")
    .trim()
    .toLowerCase();

  return normalized === "1" || normalized === "true";
}

async function readFixtureWorkspaceState(activeAccountId?: string) {
  return createWorkspaceFromLiveSnapshot(
    fixtureSnapshot as RawLiveAccountsSnapshot,
    "fixture",
    activeAccountId,
  );
}

function shiftIsoTimestamp(value: unknown, offsetMs: number) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return value;

  return new Date(timestamp + offsetMs).toISOString();
}

function shiftMarketingSnapshotTimestamps(snapshot: RawLiveAccountsSnapshot) {
  const offsetMs = Date.now() - MARKETING_SNAPSHOT_ANCHOR_MS;
  const shifted = JSON.parse(JSON.stringify(snapshot)) as RawLiveAccountsSnapshot;

  shifted.accounts?.forEach((account) => {
    account.last_sync_at = shiftIsoTimestamp(account.last_sync_at, offsetMs) as string;

    const payload = account.dashboard_payload;
    if (!payload) return;

    payload.timestamp = shiftIsoTimestamp(payload.timestamp, offsetMs) as string;
    payload.history?.forEach((point) => {
      point.timestamp = shiftIsoTimestamp(point.timestamp, offsetMs) as string;
    });
    payload.trades?.forEach((trade) => {
      trade.open_time = shiftIsoTimestamp(trade.open_time, offsetMs) as string;
      trade.close_time = shiftIsoTimestamp(trade.close_time, offsetMs) as string;
      trade.time = shiftIsoTimestamp(trade.time, offsetMs) as string;
    });
  });

  return shifted;
}

async function readMarketingWorkspaceState(activeAccountId?: string) {
  const { default: marketingSnapshot } = await import(
    "@/lib/data/fixtures/marketing-accounts-snapshot.fixture.json"
  );

  return createWorkspaceFromLiveSnapshot(
    shiftMarketingSnapshotTimestamps(marketingSnapshot as RawLiveAccountsSnapshot),
    "fixture",
    activeAccountId,
  );
}

async function buildWorkspaceState(
  activeAccountId?: string,
): Promise<WorkspaceState> {
  const sourceMode = resolveWorkspaceSourceMode();

  if (sourceMode === "mock") {
    return withActiveWorkspaceAccount(wave1Workspace, activeAccountId);
  }

  if (sourceMode === "fixture") {
    return readFixtureWorkspaceState(activeAccountId);
  }

  try {
    const liveSnapshot = await fetchLiveAccountsSnapshot({ view: "full" });
    return createWorkspaceFromLiveSnapshot(
      liveSnapshot,
      "live",
      activeAccountId,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (shouldAllowLiveFixtureFallback()) {
      console.warn("[KMFX][NEXT][WAVE1] live snapshot unavailable, falling back to fixture", {
        message,
      });
      return readFixtureWorkspaceState(activeAccountId);
    }

    console.error("[KMFX][NEXT][WAVE1] live snapshot unavailable", {
      message,
    });
    throw new Error(`KMFX live snapshot unavailable: ${message}`);
  }
}

export const getWorkspaceState = cache(buildWorkspaceState);

function firstSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function withActiveWorkspaceAccount(
  workspace: WorkspaceState,
  accountId: string | undefined,
): WorkspaceState {
  const normalizedAccountId = String(accountId ?? "").trim();
  if (!normalizedAccountId) return workspace;
  if (!workspace.accounts.some((account) => account.id === normalizedAccountId)) {
    return workspace;
  }

  return {
    ...workspace,
    activeAccountId: normalizedAccountId,
  };
}

export async function getWorkspaceStateForSearchParams(
  searchParams?: SearchParamsLike,
) {
  const resolvedSearchParams = await searchParams;
  const activeAccountId = firstSearchParamValue(resolvedSearchParams?.account);
  const previewMode = firstSearchParamValue(resolvedSearchParams?.demo);

  if (previewMode === "mock") {
    return withActiveWorkspaceAccount(wave1Workspace, activeAccountId);
  }

  if (previewMode === "1") {
    return readFixtureWorkspaceState(activeAccountId);
  }

  if (previewMode === "marketing") {
    return readMarketingWorkspaceState(activeAccountId);
  }

  if (!activeAccountId) {
    return getWorkspaceState();
  }

  return getWorkspaceState(activeAccountId);
}
