import type { RawLiveAccountsSnapshot } from "@/lib/contracts/live-snapshot";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { createWorkspaceFromLiveSnapshot } from "@/lib/data/live-snapshot-adapter";
import fixtureSnapshot from "@/lib/data/fixtures/live-accounts-snapshot.fixture.json";
import { wave1Workspace } from "@/lib/data/wave1-mock";
import { getAccountsOverview } from "@/lib/domain/accounts-selectors";
import {
  getRouteAccessLevel,
  navigationGroups,
  routeDecisionQuestions,
  routeTitles,
} from "@/lib/domain/navigation";
import { getRiskPolicyControls } from "@/lib/domain/risk-policy-selectors";
import { getStudyOverview } from "@/lib/domain/study-selectors";
import { describe, expect, it } from "vitest";

function collectDisabledNavigationHrefs() {
  return navigationGroups.flatMap((group) =>
    group.items.flatMap((item) => [
      !item.enabled ? item.href : null,
      ...(item.children?.map((child) => (!child.enabled ? child.href : null)) ?? []),
    ]),
  ).filter((href): href is string => Boolean(href));
}

function collectActiveUserRoutes() {
  const disabledHrefs = new Set(collectDisabledNavigationHrefs());

  return Object.keys(routeTitles)
    .filter((href) => getRouteAccessLevel(href) === "user")
    .filter((href) => !disabledHrefs.has(href));
}

describe("V1 readiness contract", () => {
  it("keeps active V1 routes focused on unique decisions", () => {
    const allowedAliases = new Set(["/settings/subscription"]);
    const activeRoutes = collectActiveUserRoutes();
    const duplicateQuestions = activeRoutes.filter((href, index) => {
      if (allowedAliases.has(href)) return false;

      const question = routeDecisionQuestions[href];

      return activeRoutes.findIndex((route) => routeDecisionQuestions[route] === question) !== index;
    });

    expect(duplicateQuestions).toEqual([]);
    expect(routeDecisionQuestions["/subscription"]).toBe(routeDecisionQuestions["/settings/subscription"]);
  });

  it("keeps critical metrics tied to a visible source instead of silent assumptions", () => {
    const preparedWorkspace = createWorkspaceFromLiveSnapshot(
      fixtureSnapshot as RawLiveAccountsSnapshot,
      "fixture",
    );
    const liveWorkspace = createWorkspaceFromLiveSnapshot(
      fixtureSnapshot as RawLiveAccountsSnapshot,
      "live",
    );
    const studyOverview = getStudyOverview(preparedWorkspace);

    expect(preparedWorkspace.meta).toMatchObject({
      sourceMode: "fixture",
      sourceLabel: "Lectura preparada",
    });
    expect(liveWorkspace.meta).toMatchObject({
      sourceMode: "live",
      sourceLabel: "Lectura MT5",
    });
    expect(preparedWorkspace.dashboard.pulseItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Origen",
          value: preparedWorkspace.meta.sourceLabel,
        }),
      ]),
    );
    expect(studyOverview.glossaryRows.filter((row) => !row.sourceLabel)).toEqual([]);
  });

  it("degrades account status when data is incomplete or stale", () => {
    const overview = getAccountsOverview(wave1Workspace);
    const emptyOverview = getAccountsOverview({
      ...wave1Workspace,
      activeAccountId: "",
      accounts: [],
    } satisfies WorkspaceState);

    expect(overview.status).not.toBe("ready");
    expect(overview.attentionCount).toBeGreaterThan(0);
    expect(emptyOverview.status).toBe("empty");
    expect(emptyOverview.activeAccount).toBeNull();
  });

  it("keeps policy defaults as prepared controls, not current MT5 enforcement", () => {
    const controls = getRiskPolicyControls(wave1Workspace);
    const allowedStatuses = new Set([
      "Solo aviso ahora",
      "Preparado para EA",
      "Desactivado",
    ]);
    const invalidStatuses = controls.rules.filter((rule) => !allowedStatuses.has(rule.status));
    const futureAutomation = controls.rules.find(
      (rule) => rule.label === "Automatización MT5 futura",
    );

    expect(invalidStatuses).toEqual([]);
    expect(futureAutomation).toMatchObject({
      checked: false,
      status: "Desactivado",
      value: "Pendiente",
    });
    expect(controls.rules.map((rule) => rule.status)).not.toContain("Activo");
    expect(controls.rules.map((rule) => rule.status)).not.toContain("Incumplido");
  });
});
