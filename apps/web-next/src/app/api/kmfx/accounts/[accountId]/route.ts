import { NextResponse } from "next/server";

import { requestAuthenticatedBackendJson } from "@/lib/api/authenticated-backend";

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { accountId } = await context.params;

  try {
    const result = await requestAuthenticatedBackendJson(
      `/api/accounts/${encodeURIComponent(accountId)}`,
      { method: "DELETE" },
    );

    return NextResponse.json(result.payload, { status: result.status });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "auth_required";
    return NextResponse.json(
      { ok: false, reason, auth_required: reason === "auth_required" },
      { status: reason === "auth_required" ? 401 : 500 },
    );
  }
}
