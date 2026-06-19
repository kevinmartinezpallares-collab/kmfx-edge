import { NextResponse } from "next/server";

import { clearLiveAccountsSnapshotCache } from "@/lib/api/accounts-snapshot-client";
import { requestConnectionAccess } from "@/lib/api/connection-access";

export const dynamic = "force-dynamic";

export async function POST() {
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

  clearLiveAccountsSnapshotCache();

  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
