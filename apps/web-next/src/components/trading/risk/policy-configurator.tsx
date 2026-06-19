"use client";

import * as React from "react";
import {
  CircleCheckIcon,
  FileClockIcon,
  LockKeyholeIcon,
  PlusIcon,
  RotateCcwIcon,
  SaveIcon,
  SlidersHorizontalIcon,
  TagsIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type {
  RiskPolicyControls,
  RiskPolicyRuleControl,
  RiskPolicySessionControl,
  RiskPolicyVolumeControl,
} from "@/lib/domain/risk-policy-selectors";
import { cn } from "@/lib/utils";

type GuardMode = "Solo aviso" | "Bloqueo lógico";
type SessionMode = RiskPolicySessionControl["mode"];

type EditableRule = {
  id: string;
  checked: boolean;
  detail: string;
  futureAction: string;
  guardMode: GuardMode;
  label: string;
  max: number;
  min: number;
  step: number;
  suffix: string;
  value: number;
};

type EditableSymbol = {
  enabled: boolean;
  symbol: string;
};

type EditableSession = {
  hours: string;
  key: RiskPolicySessionControl["key"];
  label: string;
  mode: SessionMode;
};

type DraftState = {
  rules: EditableRule[];
  sessions: EditableSession[];
  symbols: EditableSymbol[];
  volume: EditableRule[];
};

type RiskPolicyConfiguratorProps = {
  accountId: string;
  accountLabel: string;
  policy: RiskPolicyControls;
};

const MAIN_RULES = [
  "Riesgo por operación",
  "Pérdida diaria",
  "Drawdown máximo",
  "Riesgo abierto máximo",
  "Máximo operaciones/día",
  "Entradas sin stop loss",
  "Pausa tras 2 pérdidas",
  "Noticias alto impacto",
];

const LIMIT_BY_LABEL: Record<string, Pick<EditableRule, "max" | "min" | "step" | "suffix">> = {
  "Riesgo por operación": { max: 3, min: 0, step: 0.05, suffix: "%" },
  "Pérdida diaria": { max: 12, min: 0, step: 0.25, suffix: "%" },
  "Drawdown máximo": { max: 20, min: 0, step: 0.5, suffix: "%" },
  "Riesgo abierto máximo": { max: 10, min: 0, step: 0.25, suffix: "%" },
  "Máximo operaciones/día": { max: 25, min: 0, step: 1, suffix: "" },
  "Entradas sin stop loss": { max: 1, min: 0, step: 1, suffix: "" },
  "Pausa tras 2 pérdidas": { max: 240, min: 0, step: 5, suffix: "min" },
  "Noticias alto impacto": { max: 120, min: 0, step: 5, suffix: "min" },
};

const VOLUME_LIMITS: Record<string, Pick<EditableRule, "max" | "min" | "step" | "suffix">> = {
  "Lote máximo": { max: 100, min: 0, step: 0.01, suffix: "lotes" },
  "Posiciones simultáneas": { max: 20, min: 0, step: 1, suffix: "" },
  "Riesgo por símbolo": { max: 10, min: 0, step: 0.25, suffix: "%" },
  "Operaciones por día": { max: 25, min: 0, step: 1, suffix: "" },
};

const SESSION_MODES: SessionMode[] = ["Normal", "Reducido", "Bloqueado"];
const riskSwitchClassName =
  "data-unchecked:bg-input/80 shadow-inner [&_[data-slot=switch-thumb]]:bg-white dark:[&_[data-slot=switch-thumb]]:bg-white";
const riskSwitchActiveStyle: React.CSSProperties = {
  backgroundColor: "#0A84FF",
};

const RULE_LABELS: Partial<Record<string, string>> = {
  "Entradas sin stop loss": "Sin stop loss",
  "Máximo operaciones/día": "Operaciones/día",
  "Noticias alto impacto": "Noticias importantes",
  "Riesgo abierto máximo": "Riesgo abierto",
  "Riesgo por operación": "Riesgo por trade",
};

function displayRuleLabel(label: string) {
  return RULE_LABELS[label] ?? label;
}

function displayGuardMode(mode: GuardMode) {
  return mode === "Bloqueo lógico" ? "Bloquear entrada" : "Solo aviso";
}

function parsePolicyNumber(value: string, fallback: number) {
  const match = value.replace(",", ".").match(/-?\d+(\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : fallback;
}

function normalizeRuleId(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function ruleValueFallback(rule: RiskPolicyRuleControl) {
  if (rule.label === "Entradas sin stop loss") return 1;
  if (rule.label === "Pausa tras 2 pérdidas") return 45;
  if (rule.label === "Noticias alto impacto") return 15;
  return parsePolicyNumber(rule.value, 0);
}

function buildEditableRules(rules: RiskPolicyRuleControl[]) {
  return MAIN_RULES.map((label) => {
    const source = rules.find((rule) => rule.label === label);
    const limits = LIMIT_BY_LABEL[label];

    return {
      id: normalizeRuleId(label),
      checked: source?.checked ?? true,
      detail: source?.detail ?? "",
      futureAction: source?.futureAction ?? "Avisar antes de añadir riesgo",
      guardMode: (source?.status === "Preparado para EA"
        ? "Bloqueo lógico"
        : "Solo aviso") as GuardMode,
      label,
      max: limits.max,
      min: limits.min,
      step: limits.step,
      suffix: limits.suffix,
      value: source ? ruleValueFallback(source) : 0,
    };
  });
}

function buildEditableVolume(volumeControls: RiskPolicyVolumeControl[]) {
  return volumeControls.map((control) => {
    const limits = VOLUME_LIMITS[control.label] ?? {
      max: 100,
      min: 0,
      step: 1,
      suffix: "",
    };

    return {
      id: normalizeRuleId(control.label),
      checked: true,
      detail: control.detail,
      futureAction: "Limitar nuevas entradas",
      guardMode: "Bloqueo lógico" as GuardMode,
      label: control.label,
      max: limits.max,
      min: limits.min,
      step: limits.step,
      suffix: limits.suffix,
      value: parsePolicyNumber(control.value, 0),
    };
  });
}

function buildDefaultDraft(policy: RiskPolicyControls): DraftState {
  return {
    rules: buildEditableRules(policy.rules),
    sessions: policy.sessionControls.map((session) => ({
      hours: session.hours,
      key: session.key,
      label: session.label,
      mode: session.mode,
    })),
    symbols: policy.symbolControls.map((symbol) => ({
      enabled: symbol.enabled,
      symbol: symbol.symbol,
    })),
    volume: buildEditableVolume(policy.volumeControls),
  };
}

function mergeDraft(defaultDraft: DraftState, saved: Partial<DraftState>) {
  const savedRules = new Map((saved.rules ?? []).map((rule) => [rule.id, rule]));
  const savedVolume = new Map((saved.volume ?? []).map((rule) => [rule.id, rule]));
  const savedSessions = new Map((saved.sessions ?? []).map((session) => [session.key, session]));
  const savedSymbols = saved.symbols ?? [];
  const baseSymbols = new Map(defaultDraft.symbols.map((symbol) => [symbol.symbol, symbol]));

  savedSymbols.forEach((symbol) => {
    baseSymbols.set(symbol.symbol, symbol);
  });

  return {
    rules: defaultDraft.rules.map((rule) => {
      const savedRule = savedRules.get(rule.id);

      return {
        ...rule,
        checked: savedRule?.checked ?? rule.checked,
        guardMode: savedRule?.guardMode ?? rule.guardMode,
        value: savedRule?.value ?? rule.value,
      };
    }),
    sessions: defaultDraft.sessions.map((session) => ({
      ...session,
      ...savedSessions.get(session.key),
    })),
    symbols: Array.from(baseSymbols.values()),
    volume: defaultDraft.volume.map((rule) => {
      const savedRule = savedVolume.get(rule.id);

      return {
        ...rule,
        checked: savedRule?.checked ?? rule.checked,
        guardMode: savedRule?.guardMode ?? rule.guardMode,
        value: savedRule?.value ?? rule.value,
      };
    }),
  };
}

function formatInputValue(value: number) {
  if (!Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function parseInputValue(value: string) {
  return Number.parseFloat(value.replace(",", "."));
}

function sessionSize(mode: SessionMode) {
  if (mode === "Bloqueado") return "0%";
  if (mode === "Reducido") return "50%";
  return "100%";
}

function clampRuleValue(rule: EditableRule, value: number) {
  if (!Number.isFinite(value)) return rule.min;
  return Math.min(Math.max(value, rule.min), rule.max);
}

function ruleByLabel(draft: DraftState, label: string) {
  return draft.rules.find((rule) => rule.label === label);
}

function volumeByLabel(draft: DraftState, label: string) {
  return draft.volume.find((rule) => rule.label === label);
}

function activeRuleValue(rule?: EditableRule) {
  return rule?.checked ? rule.value : null;
}

function buildConfiguredPolicyFromDraft(draft: DraftState) {
  const riskPerTrade = ruleByLabel(draft, "Riesgo por operación");
  const dailyLoss = ruleByLabel(draft, "Pérdida diaria");
  const maxDrawdown = ruleByLabel(draft, "Drawdown máximo");
  const openRisk = ruleByLabel(draft, "Riesgo abierto máximo");
  const maxTrades = ruleByLabel(draft, "Máximo operaciones/día");
  const cooldown = ruleByLabel(draft, "Pausa tras 2 pérdidas");
  const news = ruleByLabel(draft, "Noticias alto impacto");
  const maxVolume = volumeByLabel(draft, "Lote máximo");
  const concurrentPositions = volumeByLabel(draft, "Posiciones simultáneas");
  const symbolRisk = volumeByLabel(draft, "Riesgo por símbolo");

  return {
    allowed_sessions: draft.sessions
      .filter((session) => session.mode !== "Bloqueado")
      .map((session) => session.key),
    allowed_symbols: draft.symbols
      .filter((symbol) => symbol.enabled)
      .map((symbol) => symbol.symbol),
    auto_block: draft.rules.some((rule) => rule.checked && rule.guardMode === "Bloqueo lógico"),
    cooldown_after_losses_minutes: activeRuleValue(cooldown),
    daily_dd_hard_stop: activeRuleValue(dailyLoss),
    max_concurrent_positions: activeRuleValue(concurrentPositions),
    max_risk_per_trade_pct: activeRuleValue(riskPerTrade),
    max_symbol_exposure_pct: activeRuleValue(symbolRisk),
    max_trades_per_day: activeRuleValue(maxTrades),
    max_volume: activeRuleValue(maxVolume),
    news_block_minutes: activeRuleValue(news),
    policy_source: "user",
    portfolio_heat_limit_pct: activeRuleValue(openRisk),
    riskguard_enforcement_requested: false,
    riskguard_mode: "monitor",
    rules: draft.rules.map((rule) => ({
      action: rule.guardMode === "Bloqueo lógico" ? "block_new_trades" : "warn",
      enabled: rule.checked,
      id: rule.id,
      label: rule.label,
      value: rule.label === "Entradas sin stop loss" ? "No permitidas" : rule.value,
    })),
    total_dd_hard_stop: activeRuleValue(maxDrawdown),
  };
}

function RuleValueControl({
  rule,
  disabled,
  onChange,
}: {
  rule: EditableRule;
  disabled?: boolean;
  onChange: (nextRule: EditableRule) => void;
}) {
  const stopLossRule = rule.label === "Entradas sin stop loss";
  const controlDisabled = disabled || stopLossRule;

  return (
    <div className="relative">
      <label className="sr-only" htmlFor={`${rule.id}-value`}>
        Valor de {rule.label}
      </label>
      <Input
        id={`${rule.id}-value`}
        type="text"
        inputMode="decimal"
        value={stopLossRule ? "No permitidas" : formatInputValue(rule.value)}
        disabled={controlDisabled}
        className={cn(
          "h-9! min-h-9! rounded-md border-border/70 bg-background/40 pr-12 font-mono text-sm tabular-nums",
          rule.suffix === "lotes" && "pr-16",
          !rule.suffix && "pr-3",
          stopLossRule && "font-sans text-muted-foreground",
        )}
        onChange={(event) =>
          onChange({
            ...rule,
            value: clampRuleValue(rule, parseInputValue(event.currentTarget.value)),
          })
        }
      />
      {rule.suffix && !stopLossRule ? (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">
          {rule.suffix}
        </span>
      ) : null}
    </div>
  );
}

function PolicyRuleRow({
  rule,
  onChange,
}: {
  rule: EditableRule;
  onChange: (nextRule: EditableRule) => void;
}) {
  const modeTone =
    !rule.checked
      ? "text-muted-foreground"
      : rule.guardMode === "Bloqueo lógico"
        ? "text-risk"
        : "text-profit";

  return (
    <div
      className={cn(
        "min-w-0 rounded-md border border-border/60 bg-background/30 p-4",
        !rule.checked && "opacity-70",
      )}
    >
      <div className="flex min-w-0 gap-3">
        <Switch
          checked={rule.checked}
          className={cn("mt-0.5", riskSwitchClassName)}
          onCheckedChange={(checked) => onChange({ ...rule, checked })}
          style={rule.checked ? riskSwitchActiveStyle : undefined}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{displayRuleLabel(rule.label)}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{rule.detail}</p>
        </div>
      </div>

      <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-2">
        <RuleValueControl rule={rule} disabled={!rule.checked} onChange={onChange} />

        <Select
          value={rule.guardMode}
          disabled={!rule.checked}
          onValueChange={(value) => {
            if (value === "Solo aviso" || value === "Bloqueo lógico") {
              onChange({ ...rule, guardMode: value });
            }
          }}
        >
          <SelectTrigger className="h-9! min-h-9! w-full rounded-md border-border/70 bg-background/40 text-sm">
            <span data-slot="select-value" className="flex flex-1 items-center text-left">
              {displayGuardMode(rule.guardMode)}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="Solo aviso">Solo aviso</SelectItem>
              <SelectItem value="Bloqueo lógico">Bloquear entrada</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-3 flex min-w-0 items-center justify-between gap-3">
        <p className={cn("text-sm font-medium", modeTone)}>
          {rule.checked ? displayGuardMode(rule.guardMode) : "Desactivado"}
        </p>
        <p className="truncate text-right text-xs text-muted-foreground">{rule.futureAction}</p>
      </div>
    </div>
  );
}

function VolumeRuleRow({
  rule,
  onChange,
}: {
  rule: EditableRule;
  onChange: (nextRule: EditableRule) => void;
}) {
  return (
    <div className="grid gap-3 border-b border-border/60 py-3 last:border-b-0 sm:grid-cols-[1fr_124px] sm:items-center">
      <div>
        <p className="font-medium text-foreground">{rule.label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{rule.detail}</p>
      </div>
      <RuleValueControl rule={rule} onChange={onChange} />
    </div>
  );
}

function PolicyStatusStrip({
  accountLabel,
  activeBlockCount,
  allowedSymbolCount,
  savedLabel,
}: {
  accountLabel: string;
  activeBlockCount: number;
  allowedSymbolCount: number;
  savedLabel: string;
}) {
  const cells = [
    {
      helper: "Perfil activo",
      icon: CircleCheckIcon,
      label: "Cuenta",
      tone: "text-foreground",
      value: accountLabel,
    },
    {
      helper: "Aplicable a esta cuenta",
      icon: SlidersHorizontalIcon,
      label: "Política",
      tone: "text-foreground",
      value: "Reglas comunes",
    },
    {
      helper: "Nuevos trades",
      icon: LockKeyholeIcon,
      label: "Bloqueos",
      tone: activeBlockCount > 0 ? "text-risk" : "text-muted-foreground",
      value: `${activeBlockCount} activos`,
    },
    {
      helper: "Instrumentos permitidos",
      icon: TagsIcon,
      label: "Símbolos",
      tone: allowedSymbolCount > 0 ? "text-profit" : "text-muted-foreground",
      value: `${allowedSymbolCount} permitidos`,
    },
    {
      helper: "Guardado para esta cuenta",
      icon: FileClockIcon,
      label: "Cambios",
      tone: "text-foreground",
      value: savedLabel,
    },
  ];

  return (
    <div className="grid gap-4 border-y border-border/60 py-4 sm:grid-cols-2 xl:grid-cols-5">
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0 border-l border-border/70 pl-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <cell.icon className="size-3.5" />
            {cell.label}
          </div>
          <p className={cn("mt-2 truncate text-base font-semibold tracking-normal", cell.tone)}>
            {cell.value}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{cell.helper}</p>
        </div>
      ))}
    </div>
  );
}

export function RiskPolicyConfigurator({
  accountId,
  accountLabel,
  policy,
}: RiskPolicyConfiguratorProps) {
  const defaultDraft = React.useMemo(() => buildDefaultDraft(policy), [policy]);
  const storageKey = `kmfx:mesa-riesgo:policy:${accountId}`;
  const [draft, setDraft] = React.useState<DraftState>(defaultDraft);
  const [symbolInput, setSymbolInput] = React.useState("");
  const [savedLabel, setSavedLabel] = React.useState("Local");
  const [isPublishing, setIsPublishing] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      let nextDraft = defaultDraft;
      let nextSavedLabel = "Local";

      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) {
          nextDraft = mergeDraft(defaultDraft, JSON.parse(saved) as Partial<DraftState>);
          nextSavedLabel = "Recuperado";
        }
      } catch {
        nextSavedLabel = "Local";
      }

      setDraft(nextDraft);
      setSavedLabel(nextSavedLabel);
    });

    return () => {
      cancelled = true;
    };
  }, [defaultDraft, storageKey]);

  const saveDraft = React.useCallback((nextDraft: DraftState) => {
    setDraft(nextDraft);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextDraft));
      setSavedLabel(new Intl.DateTimeFormat("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date()));
    } catch {
      setSavedLabel("Sin guardar");
    }
  }, [storageKey]);

  const publishPolicyPackage = React.useCallback(async (nextDraft: DraftState) => {
    saveDraft(nextDraft);
    setIsPublishing(true);

    try {
      const response = await fetch(`/api/kmfx/accounts/${encodeURIComponent(accountId)}/risk-policy`, {
        body: JSON.stringify({
          accountLabel,
          configured_policy: buildConfiguredPolicyFromDraft(nextDraft),
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      const policyHash =
        typeof payload.policy_hash === "string"
          ? payload.policy_hash
          : typeof payload.risk_policy_package?.policy_hash === "string"
            ? payload.risk_policy_package.policy_hash
            : "";

      setSavedLabel(
        response.ok && policyHash
          ? `${payload.persisted === false ? "Local" : "Hash"} ${policyHash.slice(0, 6)}`
          : "Local",
      );
    } catch {
      setSavedLabel("Local");
    } finally {
      setIsPublishing(false);
    }
  }, [accountId, accountLabel, saveDraft]);

  const updateRule = React.useCallback((nextRule: EditableRule) => {
    saveDraft({
      ...draft,
      rules: draft.rules.map((rule) => (rule.id === nextRule.id ? nextRule : rule)),
    });
  }, [draft, saveDraft]);

  const updateVolume = React.useCallback((nextRule: EditableRule) => {
    saveDraft({
      ...draft,
      volume: draft.volume.map((rule) => (rule.id === nextRule.id ? nextRule : rule)),
    });
  }, [draft, saveDraft]);

  const updateSession = React.useCallback((key: EditableSession["key"], mode: SessionMode) => {
    saveDraft({
      ...draft,
      sessions: draft.sessions.map((session) =>
        session.key === key ? { ...session, mode } : session,
      ),
    });
  }, [draft, saveDraft]);

  const updateSymbol = React.useCallback((symbol: string, enabled: boolean) => {
    saveDraft({
      ...draft,
      symbols: draft.symbols.map((row) => (row.symbol === symbol ? { ...row, enabled } : row)),
    });
  }, [draft, saveDraft]);

  const removeSymbol = React.useCallback((symbol: string) => {
    saveDraft({
      ...draft,
      symbols: draft.symbols.filter((row) => row.symbol !== symbol),
    });
  }, [draft, saveDraft]);

  const addSymbol = React.useCallback(() => {
    const symbol = symbolInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!symbol || draft.symbols.some((row) => row.symbol === symbol)) return;

    saveDraft({
      ...draft,
      symbols: [...draft.symbols, { enabled: true, symbol }],
    });
    setSymbolInput("");
  }, [draft, saveDraft, symbolInput]);

  const resetDraft = React.useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Local storage is an enhancement for this preview surface.
    }
    setDraft(defaultDraft);
    setSavedLabel("Restablecido");
  }, [defaultDraft, storageKey]);

  const activeBlockCount = draft.rules.filter(
    (rule) => rule.checked && rule.guardMode === "Bloqueo lógico",
  ).length;
  const allowedSymbolCount = draft.symbols.filter((symbol) => symbol.enabled).length;

  return (
    <Card className="border-border/70 bg-card/70 shadow-none">
      <CardHeader className="gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontalIcon className="size-5 text-muted-foreground" />
            Límites y bloqueos de operativa
          </CardTitle>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Define cuándo KMFX debe avisar y cuándo debe impedir añadir más riesgo. Se guarda
            como política local; MT5 no queda bloqueado hasta activar el módulo en el terminal.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={resetDraft}>
            <RotateCcwIcon data-icon="inline-start" />
            Restablecer
          </Button>
          <Button size="sm" disabled={isPublishing} onClick={() => void publishPolicyPackage(draft)}>
            <SaveIcon data-icon="inline-start" />
            {isPublishing ? "Guardando" : "Guardar política"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-0">
        <PolicyStatusStrip
          accountLabel={accountLabel}
          activeBlockCount={activeBlockCount}
          allowedSymbolCount={allowedSymbolCount}
          savedLabel={savedLabel}
        />

        <section className="py-4">
          <div className="border-b border-border/60 pb-3">
            <p className="font-medium text-foreground">Reglas principales</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Límites simples para no sobreoperar, no romper el plan y proteger la cuenta.
            </p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:gap-x-6 xl:gap-y-5">
            {draft.rules.map((rule) => (
              <PolicyRuleRow key={rule.id} rule={rule} onChange={updateRule} />
            ))}
          </div>
        </section>

        <section className="grid gap-6 border-t border-border/60 py-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.55fr)]">
          <div>
            <div className="border-b border-border/60 pb-3">
              <p className="font-medium text-foreground">Volumen y exposición</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Topes simples para lote, posiciones simultáneas y concentración.
              </p>
            </div>
            <div className="grid gap-x-6 md:grid-cols-2">
              {draft.volume.map((rule) => (
                <VolumeRuleRow key={rule.id} rule={rule} onChange={updateVolume} />
              ))}
            </div>
          </div>

          <div className="border-t border-border/60 pt-4 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
            <p className="font-medium text-foreground">Qué hace ahora</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              KMFX guarda estos límites y los usa como guía de disciplina. No abre, modifica
              ni cierra operaciones. Para bloquear MT5 de verdad hará falta activar el módulo en el terminal.
            </p>
          </div>
        </section>

        <section className="grid gap-6 border-t border-border/60 py-4 xl:grid-cols-2">
          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-medium text-foreground">Símbolos permitidos</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Decide qué pares o índices pueden usarse en esta cuenta.
                </p>
              </div>
              <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2 sm:w-auto sm:grid-cols-[160px_auto]">
                <Input
                  aria-label="Añadir símbolo"
                  className="h-10! min-h-10! border-border/70 bg-background/40 font-mono uppercase"
                  placeholder="EURUSD"
                  value={symbolInput}
                  onChange={(event) => setSymbolInput(event.currentTarget.value.toUpperCase())}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addSymbol();
                  }}
                />
                <Button className="h-10! min-h-10! px-3" variant="outline" onClick={addSymbol}>
                  <PlusIcon data-icon="inline-start" />
                  Añadir
                </Button>
              </div>
            </div>
            <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
              {draft.symbols.map((symbol) => (
                <div
                  key={symbol.symbol}
                  className="flex min-h-11 items-center justify-between gap-3 border-b border-border/60 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-foreground">{symbol.symbol}</p>
                    <p className={cn("text-xs", symbol.enabled ? "text-profit" : "text-muted-foreground")}>
                      {symbol.enabled ? "Permitido" : "Bloqueado"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={symbol.enabled}
                      className={riskSwitchClassName}
                      onCheckedChange={(checked) => updateSymbol(symbol.symbol, checked)}
                      style={symbol.enabled ? riskSwitchActiveStyle : undefined}
                    />
                    <Button
                      aria-label={`Quitar ${symbol.symbol}`}
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => removeSymbol(symbol.symbol)}
                    >
                      <XIcon />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border/60 pt-4 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
            <p className="font-medium text-foreground">Sesiones y horarios</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Define cuándo operar normal, reducir tamaño o no abrir nuevos trades.
            </p>
            <div className="mt-3">
              {draft.sessions.map((session) => (
                <div
                  key={session.key}
                  className="grid gap-3 border-b border-border/60 py-3 last:border-b-0 sm:grid-cols-[1fr_150px_60px] sm:items-center"
                >
                  <div>
                    <p className="font-medium text-foreground">{session.label}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{session.hours}</p>
                  </div>
                  <Select
                    value={session.mode}
                    onValueChange={(value) => {
                      if (SESSION_MODES.includes(value as SessionMode)) {
                        updateSession(session.key, value as SessionMode);
                      }
                    }}
                  >
                    <SelectTrigger className="h-9 w-full border-border/70 bg-background/40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {SESSION_MODES.map((mode) => (
                          <SelectItem key={mode} value={mode}>
                            {mode}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <p
                    className={cn(
                      "font-mono text-sm font-semibold",
                      session.mode === "Bloqueado"
                        ? "text-risk"
                        : session.mode === "Reducido"
                          ? "text-risk"
                          : "text-profit",
                    )}
                  >
                    {sessionSize(session.mode)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <p className="border-t border-border/60 pt-4 text-xs leading-5 text-muted-foreground">
          Estas reglas no generan señales ni replican operaciones. Sirven para mantener disciplina antes de añadir riesgo.
        </p>
      </CardContent>
    </Card>
  );
}
