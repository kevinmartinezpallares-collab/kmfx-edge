import { createHash } from "node:crypto";

export type RiskPolicyPackageRule = {
  action: "block_new_trades" | "warn";
  enabled: boolean;
  id: string;
  label: string;
  value: number | string;
};

export type RiskPolicyConfiguredInput = {
  allowed_sessions: string[];
  allowed_symbols: string[];
  auto_block: boolean;
  cooldown_after_losses_minutes: number | null;
  daily_dd_hard_stop: number | null;
  max_concurrent_positions: number | null;
  max_risk_per_trade_pct: number | null;
  max_symbol_exposure_pct: number | null;
  max_trades_per_day: number | null;
  max_volume: number | null;
  news_block_minutes: number | null;
  no_stop_loss_allowed: false;
  policy_source: "user";
  portfolio_heat_limit_pct: number | null;
  riskguard_enforcement_requested: false;
  riskguard_mode: "monitor";
  rules: RiskPolicyPackageRule[];
  total_dd_hard_stop: number | null;
};

export type RiskPolicyPackage = {
  account_id: string;
  configured_policy: RiskPolicyConfiguredInput;
  enforcement: {
    active: false;
    mode: "monitor";
    requires_terminal_ack: true;
    user_consent_required: true;
  };
  generated_at: string;
  package_id: string;
  policy_hash: string;
  version: "riskguard-policy-v1";
};

export type RiskGuardMode = "Solo aviso" | "Bloqueo lógico";
export type RiskSessionMode = "Normal" | "Reducido" | "Bloqueado";

export type RiskPolicyDraftRule = {
  checked: boolean;
  guardMode: RiskGuardMode;
  id: string;
  label: string;
  suffix?: string;
  value: number;
};

export type RiskPolicyDraftSymbol = {
  enabled: boolean;
  symbol: string;
};

export type RiskPolicyDraftSession = {
  hours: string;
  key: string;
  label: string;
  mode: RiskSessionMode;
};

export type RiskPolicyDraftPayload = {
  rules: RiskPolicyDraftRule[];
  sessions: RiskPolicyDraftSession[];
  symbols: RiskPolicyDraftSymbol[];
  volume: RiskPolicyDraftRule[];
};

function finiteOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeList(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const items: string[] = [];

  value.forEach((item) => {
    const normalized = String(item ?? "").trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    items.push(normalized);
  });

  return items;
}

function cleanSymbol(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9._-]/g, "");
}

function activeValue(rule: RiskPolicyDraftRule | undefined) {
  if (!rule) return null;
  if (!rule.checked) return null;
  return finiteOrNull(rule.value);
}

function findDraftRule(rules: RiskPolicyDraftRule[], label: string) {
  return rules.find((rule) => rule.label === label);
}

function findDraftVolume(volume: RiskPolicyDraftRule[], label: string) {
  return volume.find((rule) => rule.label === label);
}

export function configuredPolicyFromDraft(draft: RiskPolicyDraftPayload): RiskPolicyConfiguredInput {
  const rules = draft.rules ?? [];
  const volume = draft.volume ?? [];
  const activeBlocks = rules.filter(
    (rule) => rule.checked && rule.guardMode === "Bloqueo lógico",
  ).length;
  const allowedSessions = (draft.sessions ?? [])
    .filter((session) => session.mode !== "Bloqueado")
    .map((session) => session.key);
  const allowedSymbols = (draft.symbols ?? [])
    .filter((symbol) => symbol.enabled)
    .map((symbol) => cleanSymbol(symbol.symbol))
    .filter(Boolean);

  return {
    allowed_sessions: allowedSessions,
    allowed_symbols: Array.from(new Set(allowedSymbols)),
    auto_block: activeBlocks > 0,
    cooldown_after_losses_minutes: activeValue(findDraftRule(rules, "Pausa tras 2 pérdidas")),
    daily_dd_hard_stop: activeValue(findDraftRule(rules, "Pérdida diaria")),
    max_concurrent_positions: activeValue(findDraftVolume(volume, "Posiciones simultáneas")),
    max_risk_per_trade_pct: activeValue(findDraftRule(rules, "Riesgo por operación")),
    max_symbol_exposure_pct: activeValue(findDraftVolume(volume, "Riesgo por símbolo")),
    max_trades_per_day: activeValue(findDraftRule(rules, "Máximo operaciones/día")),
    max_volume: activeValue(findDraftVolume(volume, "Lote máximo")),
    news_block_minutes: activeValue(findDraftRule(rules, "Noticias alto impacto")),
    no_stop_loss_allowed: false,
    policy_source: "user",
    portfolio_heat_limit_pct: activeValue(findDraftRule(rules, "Riesgo abierto máximo")),
    riskguard_enforcement_requested: false,
    riskguard_mode: "monitor",
    rules: rules.map((rule) => ({
      action: rule.guardMode === "Bloqueo lógico" ? "block_new_trades" : "warn",
      enabled: rule.checked,
      id: rule.id,
      label: rule.label,
      value: rule.value,
    })),
    total_dd_hard_stop: activeValue(findDraftRule(rules, "Drawdown máximo")),
  };
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function normalizeRiskPolicyInput(value: unknown): RiskPolicyConfiguredInput {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};

  return {
    allowed_sessions: normalizeList(input.allowed_sessions ?? input.allowedSessions),
    allowed_symbols: normalizeList(input.allowed_symbols ?? input.allowedSymbols),
    auto_block: Boolean(input.auto_block ?? input.autoBlock),
    cooldown_after_losses_minutes: finiteOrNull(input.cooldown_after_losses_minutes ?? input.cooldownAfterLossesMinutes),
    daily_dd_hard_stop: finiteOrNull(input.daily_dd_hard_stop ?? input.dailyDrawdownLimitPct),
    max_concurrent_positions: finiteOrNull(input.max_concurrent_positions ?? input.maxConcurrentPositions),
    max_risk_per_trade_pct: finiteOrNull(input.max_risk_per_trade_pct ?? input.defaultRiskPerTradePct),
    max_symbol_exposure_pct: finiteOrNull(input.max_symbol_exposure_pct ?? input.maxSymbolExposurePct),
    max_trades_per_day: finiteOrNull(input.max_trades_per_day ?? input.maxTradesPerDay),
    max_volume: finiteOrNull(input.max_volume ?? input.maxVolume),
    news_block_minutes: finiteOrNull(input.news_block_minutes ?? input.newsBlockMinutes),
    no_stop_loss_allowed: false,
    policy_source: "user",
    portfolio_heat_limit_pct: finiteOrNull(input.portfolio_heat_limit_pct ?? input.portfolioHeatLimitPct),
    riskguard_enforcement_requested: false,
    riskguard_mode: "monitor",
    rules: Array.isArray(input.rules)
      ? input.rules.map((rule, index) => {
          const source = rule && typeof rule === "object" ? rule as Record<string, unknown> : {};

          return {
            action: source.action === "block_new_trades" ? "block_new_trades" : "warn",
            enabled: source.enabled !== false,
            id: String(source.id ?? `rule-${index + 1}`),
            label: String(source.label ?? "Regla"),
            value: typeof source.value === "number" ? source.value : String(source.value ?? ""),
          };
        })
      : [],
    total_dd_hard_stop: finiteOrNull(input.total_dd_hard_stop ?? input.maxDrawdownLimitPct),
  };
}

export function buildRiskPolicyPackage({
  accountId,
  configuredPolicy,
  generatedAt = new Date().toISOString(),
}: {
  accountId: string;
  configuredPolicy: unknown;
  generatedAt?: string;
}): RiskPolicyPackage {
  const normalized = normalizeRiskPolicyInput(configuredPolicy);
  const stablePayload = {
    account_id: accountId,
    configured_policy: normalized,
    version: "riskguard-policy-v1",
  };
  const policyHash = createHash("sha256")
    .update(stableJson(stablePayload))
    .digest("hex")
    .slice(0, 16);

  return {
    account_id: accountId,
    configured_policy: normalized,
    enforcement: {
      active: false,
      mode: "monitor",
      requires_terminal_ack: true,
      user_consent_required: true,
    },
    generated_at: generatedAt,
    package_id: `rgp_${policyHash}`,
    policy_hash: policyHash,
    version: "riskguard-policy-v1",
  };
}

export function buildRiskGuardConfiguredPolicy(draft: RiskPolicyDraftPayload) {
  return configuredPolicyFromDraft(draft);
}

export function buildRiskGuardPolicyPackage({
  accountId,
  accountLabel,
  draft,
  generatedAt = new Date().toISOString(),
  policyHash,
}: {
  accountId: string;
  accountLabel: string;
  draft: RiskPolicyDraftPayload;
  generatedAt?: string;
  policyHash?: string;
}) {
  const configuredPolicy = configuredPolicyFromDraft(draft);
  const stablePayload = {
    accountId,
    accountLabel,
    configuredPolicy,
    version: "riskguard-policy-v1",
  };
  const resolvedPolicyHash = policyHash || createHash("sha256")
    .update(stableJson(stablePayload))
    .digest("hex")
    .slice(0, 16);

  return {
    accountId,
    accountLabel,
    configuredPolicy,
    enforcement: {
      consentAcknowledged: false,
      mode: "reactive_requested",
      mt5BlockingActive: false,
      requested: true,
      requiresConsent: true,
    },
    generatedAt,
    policyHash: resolvedPolicyHash,
    version: "riskguard-policy-v1",
  };
}
