import { NextResponse, type NextRequest } from "next/server";

import {
  buildLocalRiskGuardAlertEvent,
  rememberLocalRiskGuardAlertEvent,
} from "@/lib/server/riskguard-local-events";

export const runtime = "nodejs";

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.KMFX_ENABLE_LOCAL_RISKGUARD_ACK !== "true"
  ) {
    return NextResponse.json(
      { ok: false, reason: "local_riskguard_ack_disabled" },
      { status: 404 },
    );
  }

  const payload = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const connectionKey = stringValue(
    request.headers.get("x-kmfx-connection-key") ??
      payload.connection_key ??
      payload.KMFXApiKey ??
      payload.api_key,
  );

  if (!connectionKey) {
    return NextResponse.json(
      { ok: false, reason: "missing_connection_key" },
      { status: 401 },
    );
  }

  const accountId = stringValue(payload.account_id ?? payload.accountId);
  const event = buildLocalRiskGuardAlertEvent({
    accountId,
    connectionKey,
    payload,
  });

  if (event) {
    rememberLocalRiskGuardAlertEvent(event);
  }

  return NextResponse.json(
    {
      ok: true,
      account_id: accountId,
      alert_event: event,
      received: Boolean(event),
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
