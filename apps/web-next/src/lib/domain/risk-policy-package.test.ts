import { describe, expect, it } from "vitest";

import {
  buildRiskPolicyPackage,
  configuredPolicyFromDraft,
  stableJson,
  type RiskPolicyDraftPayload,
} from "@/lib/domain/risk-policy-package";

const draft: RiskPolicyDraftPayload = {
  rules: [
    {
      checked: true,
      guardMode: "Solo aviso",
      id: "riesgo-por-operacion",
      label: "Riesgo por operación",
      suffix: "%",
      value: 0.25,
    },
    {
      checked: true,
      guardMode: "Bloqueo lógico",
      id: "perdida-diaria",
      label: "Pérdida diaria",
      suffix: "%",
      value: 3,
    },
    {
      checked: true,
      guardMode: "Bloqueo lógico",
      id: "drawdown-maximo",
      label: "Drawdown máximo",
      suffix: "%",
      value: 6,
    },
    {
      checked: true,
      guardMode: "Solo aviso",
      id: "noticias-alto-impacto",
      label: "Noticias alto impacto",
      suffix: "min",
      value: 15,
    },
  ],
  sessions: [
    { hours: "00:00-08:00", key: "Asia", label: "Asia", mode: "Bloqueado" },
    { hours: "08:00-14:00", key: "London", label: "Londres", mode: "Normal" },
    { hours: "14:00-21:00", key: "New York", label: "Nueva York", mode: "Reducido" },
  ],
  symbols: [
    { enabled: true, symbol: "eurusd" },
    { enabled: true, symbol: "NAS100" },
    { enabled: false, symbol: "XAUUSD" },
  ],
  volume: [
    {
      checked: true,
      guardMode: "Bloqueo lógico",
      id: "lote-maximo",
      label: "Lote máximo",
      suffix: "lotes",
      value: 1.5,
    },
  ],
};

describe("risk policy package", () => {
  it("normalizes the UI draft into a backend/EA policy", () => {
    expect(configuredPolicyFromDraft(draft)).toMatchObject({
      allowed_sessions: ["London", "New York"],
      allowed_symbols: ["EURUSD", "NAS100"],
      auto_block: true,
      daily_dd_hard_stop: 3,
      max_risk_per_trade_pct: 0.25,
      max_volume: 1.5,
      policy_source: "user",
      total_dd_hard_stop: 6,
    });
  });

  it("keeps MT5 enforcement inactive until RiskGuard confirms consent", () => {
    const riskPolicyPackage = buildRiskPolicyPackage({
      accountId: "mt5-orion-50000011",
      configuredPolicy: configuredPolicyFromDraft(draft),
      generatedAt: "2026-06-13T08:00:00.000Z",
    });

    expect(riskPolicyPackage.enforcement).toEqual({
      active: false,
      mode: "monitor",
      requires_terminal_ack: true,
      user_consent_required: true,
    });
    expect(riskPolicyPackage.policy_hash).toHaveLength(16);
  });

  it("serializes deterministically for policy hashing", () => {
    expect(stableJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
});
