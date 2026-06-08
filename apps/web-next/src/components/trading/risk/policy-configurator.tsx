"use client";

import * as React from "react";
import {
  PlusIcon,
  RotateCcwIcon,
  SaveIcon,
  SlidersHorizontalIcon,
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
  source: "Común" | "Usuario" | "Técnico";
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

const SOURCE_BY_LABEL: Record<string, EditableRule["source"]> = {
  "Riesgo por operación": "Común",
  "Pérdida diaria": "Común",
  "Drawdown máximo": "Común",
  "Riesgo abierto máximo": "Usuario",
  "Máximo operaciones/día": "Usuario",
  "Entradas sin stop loss": "Técnico",
  "Pausa tras 2 pérdidas": "Usuario",
  "Noticias alto impacto": "Usuario",
  "Automatización MT5 futura": "Técnico",
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
      source: SOURCE_BY_LABEL[label] ?? "Usuario",
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
      source: "Usuario" as const,
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

function formatRuleValue(rule: EditableRule) {
  if (rule.label === "Entradas sin stop loss") return "No permitidas";
  const value = Number.isInteger(rule.value) ? rule.value.toFixed(0) : rule.value.toFixed(2);
  return `${value}${rule.suffix ? ` ${rule.suffix}` : ""}`;
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
    <div className="grid gap-3 border-b border-border/60 py-3 last:border-b-0 lg:grid-cols-[minmax(240px,1fr)_136px_150px_150px] lg:items-center">
      <div className="flex min-w-0 gap-3">
        <Switch
          checked={rule.checked}
          className="mt-1"
          size="sm"
          onCheckedChange={(checked) => onChange({ ...rule, checked })}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-medium text-foreground">{rule.label}</p>
            <span className="text-xs text-muted-foreground">{rule.source}</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{rule.detail}</p>
        </div>
      </div>

      <div>
        <label className="sr-only" htmlFor={`${rule.id}-value`}>
          Valor de {rule.label}
        </label>
        <Input
          id={`${rule.id}-value`}
          type="number"
          inputMode="decimal"
          min={rule.min}
          max={rule.max}
          step={rule.step}
          value={rule.value}
          disabled={!rule.checked || rule.label === "Entradas sin stop loss"}
          className="h-9 border-border/70 bg-background/40 font-mono"
          onChange={(event) =>
            onChange({
              ...rule,
              value: clampRuleValue(rule, Number.parseFloat(event.currentTarget.value)),
            })
          }
        />
        <p className="mt-1 text-xs text-muted-foreground">{formatRuleValue(rule)}</p>
      </div>

      <Select
        value={rule.guardMode}
        disabled={!rule.checked}
        onValueChange={(value) => {
          if (value === "Solo aviso" || value === "Bloqueo lógico") {
            onChange({ ...rule, guardMode: value });
          }
        }}
      >
        <SelectTrigger className="h-9 w-full border-border/70 bg-background/40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="Solo aviso">Solo aviso</SelectItem>
            <SelectItem value="Bloqueo lógico">Bloqueo lógico</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <div className="lg:text-right">
        <p className={cn("text-xs font-medium", modeTone)}>
          {rule.checked ? rule.guardMode : "Desactivado"}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{rule.futureAction}</p>
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
      <div>
        <Input
          type="number"
          inputMode="decimal"
          min={rule.min}
          max={rule.max}
          step={rule.step}
          value={rule.value}
          className="h-9 border-border/70 bg-background/40 font-mono"
          onChange={(event) =>
            onChange({
              ...rule,
              value: clampRuleValue(rule, Number.parseFloat(event.currentTarget.value)),
            })
          }
        />
        <p className="mt-1 text-right text-xs text-muted-foreground">{formatRuleValue(rule)}</p>
      </div>
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
    { label: "Cuenta", value: accountLabel },
    { label: "Política", value: "Reglas comunes" },
    { label: "Bloqueos lógicos", value: `${activeBlockCount}` },
    { label: "Símbolos permitidos", value: `${allowedSymbolCount}` },
    { label: "Borrador", value: savedLabel },
  ];

  return (
    <div className="grid border-y border-border/60 sm:grid-cols-2 xl:grid-cols-5">
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0 border-b border-border/60 py-3 pr-4 last:border-b-0 sm:border-r sm:last:border-r-0 xl:border-b-0">
          <p className="text-xs text-muted-foreground">{cell.label}</p>
          <p className="mt-1 truncate font-mono text-sm font-semibold text-foreground">{cell.value}</p>
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
      // Local storage is an enhancement in this beta surface.
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
            Configuración de límites y bloqueos
          </CardTitle>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Ajusta la política por cuenta antes de añadir riesgo. En beta se guarda como borrador local y aplica
            avisos o bloqueos lógicos; MT5 no queda bloqueado hasta confirmar EA, consentimiento y telemetría.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={resetDraft}>
            <RotateCcwIcon data-icon="inline-start" />
            Restablecer
          </Button>
          <Button size="sm" onClick={() => saveDraft(draft)}>
            <SaveIcon data-icon="inline-start" />
            Guardar borrador
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
          <div className="grid gap-1 border-b border-border/60 pb-3 lg:grid-cols-[minmax(240px,1fr)_136px_150px_150px]">
            <div>
              <p className="font-medium text-foreground">Reglas principales</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Reglas comunes para evitar sobreoperativa e incumplimientos básicos.
              </p>
            </div>
            <p className="hidden text-xs font-medium text-muted-foreground lg:block">Límite</p>
            <p className="hidden text-xs font-medium text-muted-foreground lg:block">Modo</p>
            <p className="hidden text-right text-xs font-medium text-muted-foreground lg:block">Acción</p>
          </div>
          {draft.rules.map((rule) => (
            <PolicyRuleRow key={rule.id} rule={rule} onChange={updateRule} />
          ))}
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
            <p className="font-medium text-foreground">Estado técnico</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Esta configuración prepara avisos y bloqueos lógicos. No ejecuta, modifica ni cierra operaciones.
              La activación técnica en MT5 queda pendiente de EA, consentimiento y confirmación del terminal.
            </p>
          </div>
        </section>

        <section className="grid gap-6 border-t border-border/60 py-4 xl:grid-cols-2">
          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-medium text-foreground">Símbolos permitidos</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Añade, bloquea o retira instrumentos de la política común.
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  aria-label="Añadir símbolo"
                  className="h-9 w-32 border-border/70 bg-background/40 font-mono uppercase"
                  placeholder="EURUSD"
                  value={symbolInput}
                  onChange={(event) => setSymbolInput(event.currentTarget.value.toUpperCase())}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addSymbol();
                  }}
                />
                <Button size="sm" variant="outline" onClick={addSymbol}>
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
                      size="sm"
                      onCheckedChange={(checked) => updateSymbol(symbol.symbol, checked)}
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
              Define cuándo operar normal, reducir tamaño o bloquear nuevas entradas.
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
          Las reglas son una política común de disciplina: no generan señales, no hacen copy trading y no sustituyen la revisión de las condiciones de cada cuenta.
        </p>
      </CardContent>
    </Card>
  );
}
