import { NextResponse, type NextRequest } from "next/server";

import { requestAuthenticatedBackendJson } from "@/lib/api/authenticated-backend";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  try {
    const result = await requestAuthenticatedBackendJson("/api/billing/portal", {
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
