import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { requestAuthenticatedBackendJson } from "@/lib/api/authenticated-backend";
import { clearLiveAccountsSnapshotCache } from "@/lib/api/accounts-snapshot-client";

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

const ACCOUNT_DEPENDENT_PATHS = [
  "/accounts",
  "/capital",
  "/dashboard",
  "/analytics",
  "/trades",
  "/calendar",
];

function invalidateAccountDependentViews() {
  clearLiveAccountsSnapshotCache();
  ACCOUNT_DEPENDENT_PATHS.forEach((path) => revalidatePath(path));
}

export async function PATCH(request: Request, context: RouteContext) {
  const [{ accountId }, body] = await Promise.all([
    context.params,
    request.json().catch(() => ({})),
  ]);

  try {
    const result = await requestAuthenticatedBackendJson(
      `/api/accounts/${encodeURIComponent(accountId)}`,
      { body, method: "PATCH" },
    );

    if (result.ok) {
      invalidateAccountDependentViews();
    }

    return NextResponse.json(result.payload, { status: result.status });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "auth_required";
    return NextResponse.json(
      { ok: false, reason, auth_required: reason === "auth_required" },
      { status: reason === "auth_required" ? 401 : 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { accountId } = await context.params;

  try {
    const result = await requestAuthenticatedBackendJson(
      `/api/accounts/${encodeURIComponent(accountId)}`,
      { method: "DELETE" },
    );

    if (result.ok) {
      invalidateAccountDependentViews();
    }

    return NextResponse.json(result.payload, { status: result.status });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "auth_required";
    return NextResponse.json(
      { ok: false, reason, auth_required: reason === "auth_required" },
      { status: reason === "auth_required" ? 401 : 500 },
    );
  }
}
