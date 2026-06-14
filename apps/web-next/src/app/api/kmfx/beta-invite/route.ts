import { NextResponse } from "next/server";

import {
  hasConfiguredBetaInviteCodes,
  isBetaInviteRequiredForHost,
  isValidBetaInviteCode,
} from "@/lib/auth/beta-invite";

export const dynamic = "force-dynamic";

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const host = request.headers.get("host");
  const required = isBetaInviteRequiredForHost(host);

  if (!required) {
    return NextResponse.json(
      { ok: true, required: false },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  if (!hasConfiguredBetaInviteCodes()) {
    console.warn(
      JSON.stringify({
        event: "beta_invite_codes_missing",
        host,
        level: "warn",
        service: "kmfx-next",
      }),
    );

    return NextResponse.json(
      {
        ok: false,
        message: "La beta cerrada todavía no tiene invitaciones activas.",
        required: true,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" }, status: 503 },
    );
  }

  const payload = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const inviteCode = readString(payload.inviteCode);

  if (!isValidBetaInviteCode(inviteCode)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Código de invitación no válido.",
        required: true,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" }, status: 403 },
    );
  }

  return NextResponse.json(
    { ok: true, required: true },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
