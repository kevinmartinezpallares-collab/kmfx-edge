import { describe, expect, it } from "vitest";

import { wave1Workspace } from "@/lib/data/wave1-mock";
import {
  getConnectionStatusMeta,
  getFundingStatusMeta,
  getRiskStatusMeta,
  getWorkspaceStatusMeta,
} from "@/lib/domain/status-meta";

describe("status meta", () => {
  it("normalizes connection status without returning markup", () => {
    expect(getConnectionStatusMeta(wave1Workspace.accounts[0])).toEqual({
      label: "Conectada",
      tone: "ok",
    });
    expect(getConnectionStatusMeta({ connectionState: "plan_limited" })).toEqual({
      label: "Plan limitado",
      tone: "warn",
    });
    expect(getConnectionStatusMeta(null)).toEqual({
      label: "Sin cuenta",
      tone: "neutral",
    });
  });

  it("prioritizes blocking risk state over generic status", () => {
    expect(getRiskStatusMeta(wave1Workspace.risk)).toEqual({
      label: "Riesgo en vigilancia",
      tone: "warn",
    });
    expect(
      getRiskStatusMeta({
        status: "safe",
        allowNewTrades: false,
        blockingRule: "daily_loss_lock",
      }),
    ).toEqual({
      label: "Operativa bloqueada",
      tone: "error",
    });
  });

  it("normalizes funding and workspace source states", () => {
    expect(getFundingStatusMeta(wave1Workspace.accounts[0]?.funding)).toEqual({
      label: "Fondeo en vigilancia",
      tone: "warn",
    });
    expect(getFundingStatusMeta(undefined)).toEqual({
      label: "Sin fondeo",
      tone: "neutral",
    });
    expect(getWorkspaceStatusMeta({ sourceMode: "live", sourceLabel: "MT5" })).toEqual({
      label: "Lectura MT5",
      tone: "info",
    });
  });
});
