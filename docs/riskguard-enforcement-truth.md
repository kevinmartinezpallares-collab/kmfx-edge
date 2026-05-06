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
- No trade closing.
- No active blocking.
- Suitable for all users.

Public `KMFXConnector` packaging must not claim that MT5 enforcement is active.

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
