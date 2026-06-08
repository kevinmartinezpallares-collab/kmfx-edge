# RiskGuard Enforcement Truth

## Purpose

This document defines the product and copy boundary between the read-only `KMFXConnector` and the optional active-protection `KMFXRiskGuard`.

The goal is to avoid overclaiming enforcement capabilities before MT5 behavior, policy acknowledgement, and user consent are fully verified.

## KMFXConnector

`KMFXConnector` is the safe default for normal users.

It should be positioned as:

- Read-only sync.
- Account, trade, position, history, symbol specs, and risk telemetry collection.
- No order execution.
- No order modification.
- No trade closing.
- No active blocking.
- No copy trading.
- No signal execution.
- No broker password collection.
- Designed as the default connector for normal users.

Public `KMFXConnector` packaging must not claim that MT5 enforcement is active.

For the public connector package, `KMFXEnableEnforce` must default to `false`, payload `mode` should report `SYNC_ONLY`, and `supports_active_enforcement` should be `false`.

Users should verify their firm policy before using any third-party EA. Product copy must not claim firm approval, guaranteed acceptance, invisibility, or rule bypass.

## KMFXRiskGuard

`KMFXRiskGuard` is optional active protection.

It may:

- Receive backend policy.
- Alert, restrict, react, or close depending on enabled mode and MT5 limitations.
- Require explicit user consent.
- Report policy hash.
- Report last policy received.
- Report last policy applied.
- Report current enforcement mode and any degraded/read-only state.

It must not claim pre-server blocking of manual trades unless that exact behavior is verified on supported broker/account modes. Reactive deletion/closure is not the same as guaranteed pre-execution blocking.

`KMFXRiskGuard` must be labeled as advanced/beta until enforcement telemetry, acknowledgements, and user consent flows are production-ready. It is not part of the default public `KMFXConnector` package.

## RiskGuard Beta Monitor Boundary

The Next.js `/risk` surface is a read-only Beta Monitor until EA enforcement readiness is explicitly proven and shipped.

In this beta monitor state:

- It may read account, history, open-risk, daily drawdown, limit, and policy telemetry when available.
- It may show warnings, critical states, and a theoretical limit breach.
- It must say when data is insufficient or pending configuration.
- It must not execute orders.
- It must not modify orders.
- It must not close trades.
- It must not claim MT5 blocking is active.
- It must not present fallback limits as confirmed account policy.

Future active protection requires a separate EA-controlled kill switch boundary. The safe default should keep local EA enforcement disabled, for example `RiskGuardEnabled = false`, with any order, close, modify, or reactive restriction mode also disabled until explicit user consent, backend policy acknowledgement, EA acknowledgement telemetry, and degraded/read-only state reporting are all verified.

The dashboard or backend must not silently enable active protection. Local terminal state, EA permissions, account trade permissions, policy hash acknowledgement, and user consent must be visible before any active mode is described as enabled. Automatic close-all paths remain out of normal user copy unless the user has explicitly entered an advanced RiskGuard flow.

## Enforcement Truth Matrix

| Feature | Monitor | Enforce | Requires EA | Requires backend policy | Requires user consent | Current status |
|---|---|---|---|---|---|---|
| Max risk per trade | Supported | Partial/reactive | Yes | Yes | Yes | Requires RiskGuard |
| Daily DD | Supported | Partial | Yes | Yes | Yes | Requires RiskGuard |
| Max DD | Supported | Partial | Yes | Yes | Yes | Requires RiskGuard |
| Max volume | Supported | Partial/reactive | Yes | Yes | Yes | Requires RiskGuard |
| Allowed symbols | Supported | Partial/reactive | Yes | Yes | Yes | Requires RiskGuard |
| Allowed sessions | Supported | Partial | Yes | Yes | Yes | Requires RiskGuard |
| Allowed trading hours | Supported | Partial | Yes | Yes | Yes | Requires RiskGuard |
| London/New York restriction | Supported | Partial | Yes | Yes | Yes | Requires RiskGuard |
| Auto-block | Monitoring only in Connector | Partial/reactive in RiskGuard | Yes | Yes | Yes | RiskGuard/admin beta only |
| Panic lock | Monitoring only in Connector | Partial/close-all path in RiskGuard | Yes | Yes | Explicit | RiskGuard/admin beta only |
| Close all | Monitoring only | Supported only when trade permissions allow | Yes | Yes | Explicit | RiskGuard only |
| Reduce size | Monitoring only | Not supported | Yes | Yes | Explicit | Pending implementation |
| Block new trades | Monitoring only | Not guaranteed pre-server; reactive only unless verified | Yes | Yes | Explicit | Do not overclaim |
| Policy hash confirmation | Supported telemetry | N/A | Yes | Yes | No | Required for RiskGuard readiness |

## Copy Rules For UI

- Do not say "aplicado en MT5" without EA acknowledgement telemetry.
- Use "pendiente de confirmar" if no EA acknowledgement exists.
- Use "monitorizado" when the connector is read-only.
- Use "protección activa" only when RiskGuard is enabled and confirmed.
- Use "bloqueo reactivo" when the EA can respond after a trade/order event but cannot guarantee pre-server prevention.
- Use "modo lectura" when the account or terminal lacks trading permissions.
- Say "designed as read-only data sync" for `KMFXConnector`.
- Say "does not execute trades or copy signals" for public connector explanations.
- Say "does not require broker passwords" when clarifying setup expectations.
- Say "verify your firm policy" when discussing third-party EA usage.
- Do not say "approved", "guaranteed", "undetectable", or "bypass" in public connector copy.
- Keep admin diagnostics separate from normal user copy.

## Packaging Boundary

Normal users:

- Receive `KMFXConnector`.
- See read-only telemetry and analytics language.
- Do not see active enforcement claims.

Advanced/admin beta:

- May receive `KMFXRiskGuard` only with explicit labeling.
- Must consent to active protection.
- Must see policy hash/last received/last applied telemetry.
- Must see degraded/read-only state when MT5 permissions prevent enforcement.
