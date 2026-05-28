import { describe, expect, it } from "vitest";

import type { PortfolioAccount, PortfolioPolicy } from "@/lib/contracts/portfolio";
import { wave1Workspace } from "@/lib/data/wave1-mock";
import {
  buildPortfolioAccountRows,
  getPortfolioOverview,
  getPortfolioPolicyReadiness,
} from "@/lib/domain/portfolio-selectors";

describe("getPortfolioPolicyReadiness", () => {
  it("uses funding risk budgets as read-only fallback but keeps export blocked", () => {
    const readiness = getPortfolioPolicyReadiness(wave1Workspace);

    expect(readiness.status).toBe("partial");
    expect(readiness.accountCount).toBe(3);
    expect(readiness.readinessPct).toBe(67);
    expect(readiness.exportEligible).toBe(false);
    expect(readiness.blockers).toContain("missing_portfolio_policy");
    expect(
      readiness.accounts.find((item) => item.account.id === "acct-alpha")?.policySource,
    ).toBe("funding_profile");
    expect(
      readiness.accounts.find((item) => item.account.id === "acct-sigma")?.policySource,
    ).toBe("requires_review");
  });

  it("marks export readiness only when every account has explicit policy coverage", () => {
    const accounts: PortfolioAccount[] = wave1Workspace.accounts.map((account, index) => ({
      id: `portfolio-account-${account.id}`,
      portfolioId: "portfolio-main",
      accountId: account.id,
      role: index === 0 ? "lead" : "follower",
      priority: index + 1,
      riskBudgetPct: 0.3,
      maxHeatPct: 1.2,
      enabled: true,
    }));
    const policy: PortfolioPolicy = {
      portfolioId: "portfolio-main",
      accounts,
      strategyPermissions: [],
      routing: {
        copyMode: "copy_selected",
        splitMode: "weighted",
        maxAccountsPerIdea: 2,
        preferSafestAccount: true,
        blockOnCorrelation: true,
        blockOnHeat: true,
        blockOnFundingDanger: true,
      },
      riskPolicy: null,
    };

    const readiness = getPortfolioPolicyReadiness({
      ...wave1Workspace,
      accounts: wave1Workspace.accounts.map((account) => ({
        ...account,
        connectionState: "connected",
        connectionTone: "connected",
        planAccess: "active",
      })),
      portfolio: {
        portfolios: [
          {
            id: "portfolio-main",
            name: "Main desk",
            description: null,
            objective: "Multi-account execution readiness",
            status: "active",
            baseCurrency: "USD",
          },
        ],
        accounts,
        policies: [policy],
      },
    });

    expect(readiness.readinessPct).toBe(100);
    expect(readiness.status).toBe("ready");
    expect(readiness.exportEligible).toBe(true);
    expect(readiness.blockers).toEqual([]);
    expect(readiness.accounts.every((item) => item.policySource === "portfolio_policy")).toBe(
      true,
    );
  });

  it("keeps export blocked when a portfolio policy exists but no accounts are available", () => {
    const readiness = getPortfolioPolicyReadiness({
      ...wave1Workspace,
      activeAccountId: "missing",
      accounts: [],
      portfolio: {
        portfolios: [
          {
            id: "portfolio-empty",
            name: "Portfolio vacío",
            description: null,
            objective: "No debe exportar sin cuentas",
            status: "requires_review",
            baseCurrency: "USD",
          },
        ],
        accounts: [],
        policies: [
          {
            portfolioId: "portfolio-empty",
            accounts: [],
            strategyPermissions: [],
            routing: {
              copyMode: "none",
              splitMode: "none",
              maxAccountsPerIdea: null,
              preferSafestAccount: true,
              blockOnCorrelation: true,
              blockOnHeat: true,
              blockOnFundingDanger: true,
            },
            riskPolicy: null,
          },
        ],
      },
    });

    expect(readiness.accountCount).toBe(0);
    expect(readiness.status).toBe("empty");
    expect(readiness.readinessPct).toBe(0);
    expect(readiness.exportEligible).toBe(false);
    expect(readiness.blockers).toContain("no_accounts");
  });
});

describe("getPortfolioOverview", () => {
  it("builds portfolio account allocation, contribution and capital curve from workspace data", () => {
    const overview = getPortfolioOverview(wave1Workspace);

    expect(overview.accountRows).toHaveLength(3);
    expect(overview.totalEquity).toBe(139766);
    expect(overview.totalPnl).toBe(4678);
    expect(overview.connectedAccounts).toBe(1);
    expect(overview.staleAccounts).toBe(1);
    expect(overview.allocationRows[0]?.account.id).toBe("acct-theta");
    expect(overview.contributionRows[0]?.account.id).toBe("acct-alpha");
    expect(overview.strategyPolicyRows[0]?.decision).toBe("Observar");
    expect(overview.capitalCurveDisplaySeries).toHaveLength(
      wave1Workspace.analytics.daily.length,
    );
    expect(overview.capitalCurveLatest).toBeGreaterThan(overview.totalEquity - 1);
  });

  it("keeps account share percentages safe when no accounts are present", () => {
    const rows = buildPortfolioAccountRows({
      ...wave1Workspace,
      accounts: [],
    });

    expect(rows).toEqual([]);
  });
});
