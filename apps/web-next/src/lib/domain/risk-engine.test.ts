import { describe, expect, it } from "vitest";

import {
  buildRiskGuardBetaMonitor,
  computeRecommendedRiskFromModel,
  computeRiskState,
  recommendedRiskPctForState,
} from "@/lib/domain/risk-engine";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { wave1Workspace } from "@/lib/data/wave1-mock";

describe("risk-engine", () => {
  it("locks immediately when hard drawdown limits are breached", () => {
    expect(
      computeRiskState({
        drawdownPct: 10,
        maxDrawdownLimitPct: 10,
        autoBlockEnabled: true,
      }),
    ).toMatchObject({
      risk_state: "LOCKED",
      blocked: true,
      block_reason: "Trading blocked",
    });

    expect(
      computeRiskState({
        dailyDrawdownPct: 1.2,
        dailyDrawdownLimitPct: 1.2,
        autoBlockEnabled: true,
      }),
    ).toMatchObject({
      risk_state: "LOCKED",
      blocked: true,
    });
  });

  it("escalates soft risk when loss streak, win rate and trade risk deteriorate", () => {
    const risk = computeRiskState({
      drawdownPct: 3.2,
      dailyDrawdownPct: 0.3,
      consecutiveLosses: 6,
      recentWinRate: 32,
      riskPerTradePct: 2.2,
      autoBlockEnabled: false,
    });

    expect(risk.risk_state).toBe("DANGER");
    expect(risk.blocked).toBe(false);
    expect(risk.explanation).toContain("Racha de 6");
  });

  it("keeps recommendation percentages stable by state", () => {
    expect(recommendedRiskPctForState("NORMAL")).toBe(1);
    expect(recommendedRiskPctForState("CAUTION")).toBe(0.75);
    expect(recommendedRiskPctForState("DANGER")).toBe(0.5);
    expect(recommendedRiskPctForState("LOCKED")).toBe(0);
  });

  it("computes risk from the legacy-shaped calculator model", () => {
    const result = computeRecommendedRiskFromModel(
      {
        account: {
          balance: 10000,
          maxDrawdownLimit: 10,
        },
        riskProfile: {
          autoBlock: true,
          currentRiskPct: 0.8,
          dailyLossLimitPct: 1.2,
        },
        riskSummary: {
          dailyLossUsd: -80,
        },
        streaks: {
          bestLoss: 2,
        },
        totals: {
          drawdown: {
            maxPct: 2,
          },
          winRate: 55,
        },
        trades: [
          { pnl: 100 },
          { pnl: -50 },
          { pnl: 90 },
          { pnl: 30 },
        ],
      },
      { balance: 10000 },
    );

    expect(result.risk_state).toBe("NORMAL");
    expect(result.recommendedRiskPct).toBe(1);
  });

  it("builds a read-only beta monitor from workspace data", () => {
    const workspace = {
      ...wave1Workspace,
      risk: {
        ...wave1Workspace.risk,
        dailyDrawdownPct: 2.1,
        dailyLimitPct: 3,
        status: "safe",
        severity: "info",
      },
    } satisfies WorkspaceState;
    const monitor = buildRiskGuardBetaMonitor(workspace);

    expect(monitor.monitor).toMatchObject({
      active: true,
      mt5BlockingActive: false,
      orderActionsActive: false,
    });
    expect(monitor.dailyLossUsedPct).toBe(2.1);
    expect(monitor.dailyLimitPct).toBe(3);
    expect(monitor.dailyUsagePct).toBe(70);
    expect(monitor.status.key).toBe("warning");
    expect(monitor.rules.find((rule) => rule.id === "mt5-blocking")).toMatchObject({
      status: "No activado",
      value: "Lectura",
    });
  });

  it("escalates beta monitor thresholds without activating enforcement", () => {
    const baseWorkspace = {
      ...wave1Workspace,
      risk: {
        ...wave1Workspace.risk,
        dailyLimitPct: 3,
        status: "safe",
        severity: "info",
      },
    } satisfies WorkspaceState;

    expect(
      buildRiskGuardBetaMonitor({
        ...baseWorkspace,
        risk: { ...baseWorkspace.risk, dailyDrawdownPct: 2.7 },
      }).status.key,
    ).toBe("critical");

    const limitMonitor = buildRiskGuardBetaMonitor({
      ...baseWorkspace,
      risk: { ...baseWorkspace.risk, dailyDrawdownPct: 3 },
    });

    expect(limitMonitor.status.key).toBe("limit_reached");
    expect(limitMonitor.monitor.mt5BlockingActive).toBe(false);
    expect(limitMonitor.rules.find((rule) => rule.id === "theoretical-limit")).toMatchObject({
      status: "Teórico",
    });
  });

  it("marks missing balance or history as insufficient and keeps fallback limits pending", () => {
    const monitor = buildRiskGuardBetaMonitor({
      ...wave1Workspace,
      accounts: wave1Workspace.accounts.map((account, index) =>
        index === 0 ? { ...account, balance: 0 } : account,
      ),
      analytics: {
        ...wave1Workspace.analytics,
        daily: [],
      },
      risk: {
        ...wave1Workspace.risk,
        dailyDrawdownPct: 0,
        dailyLimitPct: 0,
      },
    } satisfies WorkspaceState);

    expect(monitor.status.key).toBe("insufficient");
    expect(monitor.dailyLimitPct).toBe(3);
    expect(monitor.dailyLimitSourceLabel).toBe("Pendiente de verificación de fondeo");
    expect(monitor.metrics.find((metric) => metric.id === "daily-pnl")?.detail).toBe(
      "Historial insuficiente",
    );
  });

  it("uses verified funding rules for The Funding Pips funded evaluations", () => {
    const baseAccount = wave1Workspace.accounts[0]!;
    const fundingPipsAccount = {
      ...baseAccount,
      broker: "The Funding Pips",
      funding: {
        ...baseAccount.funding!,
        accountMode: "evaluation",
        dailyRoomLeftPct: 5,
        firm: "The Funding Pips",
        maxRoomLeftPct: 10,
        objectivePct: 5,
        phaseLabel: "Step 2",
        playbookLabel: "2 Step Standard",
      },
      id: "acct-funding-pips",
      label: "The Funding Pips 100K",
      server: "TFP-Server01",
    } satisfies typeof baseAccount;
    const monitor = buildRiskGuardBetaMonitor({
      ...wave1Workspace,
      accounts: [fundingPipsAccount],
      activeAccountId: fundingPipsAccount.id,
      risk: {
        ...wave1Workspace.risk,
        dailyDrawdownPct: 2.5,
        dailyLimitPct: 1,
        severity: "info",
        status: "safe",
      },
    } satisfies WorkspaceState);

    expect(monitor.dailyLimitPct).toBe(5);
    expect(monitor.dailyUsagePct).toBe(50);
    expect(monitor.dailyLimitSourceLabel).toBe("Política común verificada");
    expect(monitor.fundingRule).toMatchObject({
      firmName: "The Funding Pips",
      programName: "2 Step Standard",
      status: "verified",
    });
    expect(monitor.rules.find((rule) => rule.id === "funding-rule")).toMatchObject({
      status: "Verificada",
      value: "Activa",
    });
  });

  it("surfaces funding review status when the connected firm has no verified rule", () => {
    const baseAccount = wave1Workspace.accounts[0]!;
    const darwinexZeroAccount = {
      ...baseAccount,
      broker: "Darwinex",
      funding: {
        ...baseAccount.funding!,
        accountMode: "challenge",
        dailyRoomLeftPct: 4,
        firm: "Darwinex Zero",
        maxRoomLeftPct: 8,
        objectivePct: 8,
        phaseLabel: "Fase 1",
        playbookLabel: "Challenge conservative",
      },
      id: "acct-darwinex-zero",
      label: "Darwinex Zero 100K",
      server: "Darwinex-Live",
    } satisfies typeof baseAccount;

    const monitor = buildRiskGuardBetaMonitor({
      ...wave1Workspace,
      accounts: [darwinexZeroAccount],
      activeAccountId: darwinexZeroAccount.id,
      risk: {
        ...wave1Workspace.risk,
        dailyDrawdownPct: 0,
        dailyLimitPct: 4,
        severity: "info",
        status: "safe",
      },
    } satisfies WorkspaceState);

    expect(monitor.status).toMatchObject({
      key: "requires_review",
      label: "Reglas por revisar",
      tone: "warning",
    });
    expect(monitor.rules.find((rule) => rule.id === "funding-rule")).toMatchObject({
      status: "Revisar",
      tone: "warning",
      value: "No aplica",
    });
    expect(monitor.fundingRule.firmName).toBe("Darwinex Zero");
  });

  it("shows logical funding blocks without activating MT5 enforcement", () => {
    const baseAccount = wave1Workspace.accounts[0]!;
    const fundingPipsAccount = {
      ...baseAccount,
      broker: "The Funding Pips",
      funding: {
        ...baseAccount.funding!,
        accountMode: "evaluation",
        dailyRoomLeftPct: 0,
        firm: "The Funding Pips",
        maxRoomLeftPct: 10,
        objectivePct: 5,
        phaseLabel: "Step 2",
        playbookLabel: "2 Step Standard",
      },
      id: "acct-funding-pips-blocked",
      label: "The Funding Pips 100K",
      server: "TFP-Server01",
    } satisfies typeof baseAccount;

    const monitor = buildRiskGuardBetaMonitor({
      ...wave1Workspace,
      accounts: [fundingPipsAccount],
      activeAccountId: fundingPipsAccount.id,
      risk: {
        ...wave1Workspace.risk,
        dailyDrawdownPct: 0,
        dailyLimitPct: 1,
        severity: "info",
        status: "safe",
      },
    } satisfies WorkspaceState);

    expect(monitor.status.key).toBe("limit_reached");
    expect(monitor.monitor).toMatchObject({
      mt5BlockingActive: false,
      orderActionsActive: false,
    });
    expect(monitor.fundingRule).toMatchObject({
      allowNewTradesRecommendation: false,
      evaluationStatus: "blocked",
      status: "verified",
    });
    expect(monitor.rules.find((rule) => rule.id === "funding-rule")).toMatchObject({
      status: "Bloqueo lógico",
      tone: "danger",
    });
    expect(monitor.rules.find((rule) => rule.id === "funding-rule-alert-1")).toMatchObject({
      label: "Bloqueo diario de fondeo",
      status: "Bloqueo lógico",
    });
  });
});
