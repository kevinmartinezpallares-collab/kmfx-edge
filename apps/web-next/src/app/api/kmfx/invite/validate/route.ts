import { NextResponse } from "next/server";

import {
  isInviteCodeAllowed,
  isInviteOnlySignupEnabled,
} from "@/lib/auth/invite-access";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const code = typeof payload?.code === "string" ? payload.code : "";

  if (!isInviteOnlySignupEnabled()) {
    return NextResponse.json(
      { inviteRequired: false, ok: true },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  if (!isInviteCodeAllowed(code)) {
    return NextResponse.json(
      {
        inviteRequired: true,
        message: "Código de invitación no válido.",
        ok: false,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" }, status: 403 },
    );
  }

  return NextResponse.json(
    { inviteRequired: true, ok: true },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
