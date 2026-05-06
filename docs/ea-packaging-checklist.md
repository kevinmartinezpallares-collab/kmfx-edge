# EA Packaging Checklist

## Public v1 Package

The public/private beta v1 EA package should ship `KMFXConnector.ex5` as a read-only sync connector.

Public v1 scope:

- Read-only sync and analytics.
- Account, trades, open positions, history, symbol specs, and risk telemetry.
- No active enforcement claims.
- No order execution, trade closing, or blocking claims.
- Connection key transport via header/body paths only.
- Cloud endpoint configured through launcher/EA setup.
- Launcher-assisted setup for normal users.
- Key masking and log masking validated before release.

## Files To Include

- `KMFXConnector.ex5`
- `KMFXConnector.mq5` only if source distribution is intentionally approved.
- User setup guide.
- Checksum file for every binary artifact.
- Version manifest with connector version, build date, and target endpoint.
- Release notes with known limitations.

## Files Not To Include For Normal Users

- Admin/debug-only scripts.
- Raw connection keys.
- Logs from developer/test sessions.
- Config files containing real connection keys.
- `KMFXRiskGuard.ex5` or active enforcement artifacts unless intentionally included as a separate beta.
- Internal testing payloads containing account identifiers or secrets.

## Manual Compile / Deploy Checklist

Before packaging:

- Compile `KMFXConnector.mq5` in MetaEditor.
- Confirm `.ex5` timestamp and version match release manifest.
- Confirm the EA does not send `connection_key` in URL or query string.
- Confirm sync uses `X-KMFX-Connection-Key` header and/or approved body compatibility.
- Confirm EA and launcher logs mask keys.
- Confirm persisted backend payload does not include full keys.
- Confirm `symbolSpecs` appears in live payload for active/recent/common symbols.
- Confirm partial closes appear as individual close deal rows.
- Confirm frontend groups partial closes into one UI trade.
- Confirm XAU, NAS100/US100, US30, and US500/SPX500 specs if broker provides those symbols.
- Confirm a live sync reaches Dashboard, Operaciones, Calendario, Analytics, Ejecución, Risk, and Calculadora.
- Confirm normal users cannot see admin accounts or other users' accounts.
- Document whether manual MetaEditor compile is required for this release.

## Release Validation

Launcher/package checks:

- Windows launcher artifact exists and checksum matches.
- macOS launcher app exists and checksum matches.
- Launcher can create or retrieve a connection key.
- User can copy/use their own key.
- Launcher can install/copy EA files without exposing admin diagnostics in normal flow.
- First MT5 account syncs.
- Second MT5 account syncs without overwriting the first account.
- Account switching does not leak stale trades or positions.

Backend/cloud checks:

- Render logs do not print raw keys/tokens.
- Query-string connection keys are rejected.
- Header/body key paths work.
- Revoked keys are rejected.
- Cloudflare Worker/CORS behavior is correct for production origins.
- Admin diagnostics remain separate from normal user flow.

Frontend checks:

- Dashboard totals agree with grouped closed trades.
- Calendar uses final close date for realized P&L.
- Operaciones shows grouped partial trade once and exposes executions.
- Analytics and Ejecución use normalized day keys.
- Calculator consumes broker symbol specs when available.

## Pre-Production Key Rotation

Before final user packaging:

- Rotate old Darwinex, Orion, local, and test connection keys after final EA deployment.
- Verify old keys are rejected.
- Verify new keys work from launcher and MT5.
- Verify no raw keys appear in backend, launcher, EA, or browser logs.
- Verify regenerated keys update user-facing previews without exposing full values.

## Packaging Decision Gate

Release is blocked if any of these are true:

- Public package includes active enforcement without explicit RiskGuard labeling.
- Any connection key appears in a URL.
- Logs or persisted payloads contain raw keys.
- Partial closes are duplicated or dropped.
- Calendar and Operaciones disagree on cross-day close date.
- Symbol specs are absent for active broker symbols without documented fallback.
- Normal user can access another user's account payload.
