import { NextResponse, type NextRequest } from "next/server";

import { fetchLiveAccountsSnapshot } from "@/lib/api/accounts-snapshot-client";
import type {
  RawLiveSnapshotAccount,
  RawRiskGuardAlertEvent,
} from "@/lib/contracts/live-snapshot";
import { readLocalRiskGuardAlertEvent } from "@/lib/server/riskguard-local-events";

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function findAccount(
  accounts: RawLiveSnapshotAccount[],
  accountId: string,
) {
  if (accountId) {
    return accounts.find((account) => stringValue(account.account_id) === accountId);
  }

  return accounts.find((account) => account.is_default) ?? accounts[0];
}

function normalizeAlertEvent(
  account: RawLiveSnapshotAccount | undefined,
): RawRiskGuardAlertEvent | null {
  const payload = account?.dashboard_payload;
  const directEvent =
    payload?.riskguard_alert_event ??
    payload?.riskGuardAlertEvent;
  const ackEvent =
    payload?.riskguard_terminal_ack?.alert_event ??
    payload?.riskguard_terminal_ack?.alertEvent ??
    payload?.riskGuardTerminalAck?.alert_event ??
    payload?.riskGuardTerminalAck?.alertEvent ??
    account?.riskguard_terminal_ack?.alert_event ??
    account?.riskguard_terminal_ack?.alertEvent ??
    account?.riskGuardTerminalAck?.alert_event ??
    account?.riskGuardTerminalAck?.alertEvent;
  const event = directEvent ?? ackEvent;
  const id = stringValue(event?.id);
  const label = stringValue(event?.label);
  const reason = stringValue(event?.reason);

  if (!event || !id || !label || !reason) return null;

  return {
    ...event,
    id,
    label,
    reason,
    tone: event.tone === "danger" || event.tone === "info" ? event.tone : "warning",
    occurred_at:
      stringValue(event.occurred_at) ||
      stringValue(event.occurredAt) ||
      stringValue(event.received_at) ||
      stringValue(event.receivedAt),
  };
}

export async function GET(request: NextRequest) {
  const accountId = stringValue(request.nextUrl.searchParams.get("accountId"));
  const localEvent = readLocalRiskGuardAlertEvent(accountId);

  if (localEvent) {
    return NextResponse.json(
      {
        ok: true,
        accountId: localEvent.accountId ?? accountId,
        event: localEvent,
        source: "local_ack",
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }

  try {
    const snapshot = await fetchLiveAccountsSnapshot({
      cacheMode: "no-store",
      view: "summary",
    });
    const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
    const account = findAccount(accounts, accountId);
    const event = normalizeAlertEvent(account);

    return NextResponse.json(
      {
        ok: true,
        accountId: account?.account_id ?? "",
        event,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "riskguard_events_unavailable";

    return NextResponse.json(
      {
        ok: false,
        reason,
        event: null,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
        status: reason === "auth_required" ? 401 : 200,
      },
    );
  }
}
