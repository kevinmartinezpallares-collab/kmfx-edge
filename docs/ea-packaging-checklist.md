# EA Packaging Checklist

## Public v1 Package

The public/private beta v1 EA package should ship `KMFXConnector.ex5` as a read-only sync connector.

Current public package source version: `KMFXConnector` v2.86.

Public v1 scope:

- Read-only sync and analytics.
- Account, trades, open positions, history, symbol specs, and risk telemetry.
- No active enforcement claims.
- No order execution, trade closing, or blocking claims.
- No order modification.
- No copy trading or signal execution.
- No broker password collection.
- `KMFXEnableEnforce=false` in the public connector package.
- Payload `mode` should report `SYNC_ONLY` unless RiskGuard is explicitly enabled in a separate/admin beta.
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
- Preferred local macOS command: `bash scripts/compile_mt5_connector.sh`
- Confirm `.ex5` timestamp and version match release manifest.
- Confirm `KMFXConnector` version is `2.82` or the intended newer release version.
- Confirm public/default source has `KMFXEnableEnforce=false`.
- Confirm sync payload capabilities report `supports_active_enforcement=false`.
- Confirm startup logs clearly state read-only mode.
- Confirm MT5 inputs/comments do not suggest active trading, copy trading, signal execution, or broker credential collection.
- Confirm no close/delete/modify/block functions run unless RiskGuard is explicitly enabled outside the public connector mode.
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

## Public Read-Only Release Gate

The public EA package must remain a read-only connector:

- Startup logs must say that `KMFXConnector` is read-only and only synchronizes account data.
- Public/default configuration must not enable active enforcement or RiskGuard.
- MT5 inputs and release notes must not imply automatic trading, order management, copy trading, signal execution, or broker password collection.
- No order close, order delete, order modification, trade blocking, or close-all path may run in public connector mode.
- Support copy must explain that `KMFXConnector` is designed as read-only data sync and that users should verify their firm policy before using any third-party EA.
- `KMFXRiskGuard` active protection is optional/beta, separate from the default public connector package, and must be explicitly enabled with user consent.

Before packaging public `KMFXConnector`, complete and record these gates:

- Run a static scan for `OrderSend`, `CTrade`, `PositionClose`, `OrderDelete`, `OrderModify`, `panic`, `enforce`, `protect mode`, `block trades`, and `close all`.
- For every active-trading finding, confirm it is internal RiskGuard/admin code and cannot run when public/default `KMFXEnableEnforce=false`.
- Confirm startup log says read-only.
- Confirm no `connection_key`, `api_key`, or equivalent secret is appended to a URL or query string.
- Confirm logs mask connection keys and do not dump full secrets in verbose mode.
- Compile `KMFXConnector.mq5` to `KMFXConnector.ex5` in MetaEditor.
- Record the SHA256 hash of the compiled `.ex5`.
- Verify the Launcher/download package includes the exact `.ex5` matching that SHA256 hash.
- Attach the EA to a demo MT5 terminal and verify sync reaches KMFX Edge.
- Verify `symbolSpecs` appear for active/recent/common symbols when the broker provides them.
- Verify partial closes sync as close deal rows and the dashboard groups them correctly.
- Verify a normal/non-admin user can only see their own linked account data.
- Rotate old local, demo, Darwinex, Orion, and test connection keys before production release.

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
- Public/default package can close positions, delete orders, or block trades without explicit RiskGuard enablement.
- Public copy claims firm approval, guaranteed acceptance, invisibility, or rule bypass.
- Any connection key appears in a URL.
- Logs or persisted payloads contain raw keys.
- Partial closes are duplicated or dropped.
- Calendar and Operaciones disagree on cross-day close date.
- Symbol specs are absent for active broker symbols without documented fallback.
- Normal user can access another user's account payload.
