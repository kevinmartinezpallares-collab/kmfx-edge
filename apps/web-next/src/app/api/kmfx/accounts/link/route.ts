import { NextResponse, type NextRequest } from "next/server";

import { requestAuthenticatedBackendJson } from "@/lib/api/authenticated-backend";
import { requestConnectionAccess } from "@/lib/api/connection-access";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  try {
    const access = await requestConnectionAccess();
    if (!access.allowed) {
      return NextResponse.json(
        {
          ok: false,
          auth_required: access.reason === "auth_required",
          error: access.reason,
          message: access.message,
          reason: access.reason,
        },
        { status: access.status },
      );
    }

    const result = await requestAuthenticatedBackendJson("/api/accounts/link", {
      body,
      method: "POST",
    });

    return NextResponse.json(result.payload, { status: result.status });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "auth_required";
    return NextResponse.json(
      { ok: false, reason, auth_required: reason === "auth_required" },
      { status: reason === "auth_required" ? 401 : 500 },
    );
  }
}
