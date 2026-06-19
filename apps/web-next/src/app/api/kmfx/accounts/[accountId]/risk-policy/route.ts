import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { requestAuthenticatedBackendJson } from "@/lib/api/authenticated-backend";
import { clearLiveAccountsSnapshotCache } from "@/lib/api/accounts-snapshot-client";
import {
  buildRiskPolicyPackage,
  configuredPolicyFromDraft,
  type RiskPolicyDraftPayload,
} from "@/lib/domain/risk-policy-package";

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

const RISK_DEPENDENT_PATHS = [
  "/risk",
  "/dashboard",
  "/analytics/risk",
  "/accounts",
];

function invalidateRiskDependentViews() {
  clearLiveAccountsSnapshotCache();
  RISK_DEPENDENT_PATHS.forEach((path) => revalidatePath(path));
}

function buildPackagePayload(accountId: string, body: Record<string, unknown>) {
  const draft = body.draft;
  const configuredPolicy =
    draft && typeof draft === "object"
      ? configuredPolicyFromDraft(draft as RiskPolicyDraftPayload)
      : (body.configured_policy ?? body.configuredPolicy ?? body);

  const packagePayload = buildRiskPolicyPackage({
    accountId,
    configuredPolicy,
  });

  return {
    configured_policy: packagePayload.configured_policy,
    policy_hash: packagePayload.policy_hash,
    risk_policy_package: packagePayload,
  };
}

async function persistPolicyPackage(accountId: string, packagePayload: ReturnType<typeof buildPackagePayload>) {
  const result = await requestAuthenticatedBackendJson(
    `/api/accounts/${encodeURIComponent(accountId)}/risk-policy`,
    {
      body: packagePayload,
      method: "POST",
    },
  );

  if (result.ok) {
    invalidateRiskDependentViews();
  }

  return result;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const [{ accountId }, body] = await Promise.all([
    context.params,
    request.json().catch(() => ({})),
  ]);

  const packagePayload = buildPackagePayload(accountId, body as Record<string, unknown>);

  try {
    const result = await persistPolicyPackage(accountId, packagePayload);

    return NextResponse.json(
      {
        ...result.payload,
        ...packagePayload,
      },
      { status: result.status },
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : "auth_required";
    const authRequired = reason === "auth_required";

    return NextResponse.json(
      {
        ok: !authRequired,
        auth_required: authRequired,
        persisted: false,
        ...packagePayload,
        reason,
      },
      { status: authRequired ? 401 : 200 },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const [{ accountId }, body] = await Promise.all([
    context.params,
    request.json().catch(() => ({})),
  ]);
  const packagePayload = buildPackagePayload(accountId, body as Record<string, unknown>);

  try {
    const result = await persistPolicyPackage(accountId, packagePayload);

    return NextResponse.json(
      {
        ok: result.ok,
        persisted: result.ok,
        ...packagePayload,
        backend: result.payload,
      },
      { status: result.status },
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : "backend_unavailable";
    const authRequired = reason === "auth_required";

    return NextResponse.json(
      {
        ok: !authRequired,
        auth_required: authRequired,
        persisted: false,
        reason,
        ...packagePayload,
      },
      {
        status: authRequired ? 401 : 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }
}
