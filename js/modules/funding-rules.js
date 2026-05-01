export const FUNDING_RULE_PHASES = ["Challenge", "Verification", "Funded"];

const PHASE_LABELS = {
  Challenge: "Challenge",
  Verification: "Verification",
  Funded: "Funded",
};

function normalizeRuleText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function normalizeFundingPhase(phase = "") {
  const normalized = normalizeRuleText(phase);
  if (normalized.includes("phase 2") || normalized.includes("verification") || normalized.includes("step 2")) return "Verification";
  if (normalized.includes("funded") || normalized.includes("master")) return "Funded";
  return "Challenge";
}

function createPhaseRule(firm, program, phaseId, values = {}) {
  const minTradingDays = Number(values.minTradingDays ?? values.requiredTradingDays ?? 0) || 0;
  const editable = Boolean(values.editable ?? program.editable ?? firm.editable ?? false);
  const verified = Boolean(values.verified ?? program.verified ?? firm.verified ?? false);
  const legacy = Boolean(values.legacy ?? program.legacy ?? false);
  const requiresReview = Boolean(values.requiresReview ?? program.requiresReview ?? firm.requiresReview ?? (!verified && editable));

  return Object.freeze({
    firmId: firm.firmId,
    firmName: firm.firmName,
    programId: program.programId,
    programName: program.programName,
    phaseId,
    phaseName: PHASE_LABELS[phaseId] || phaseId,
    accountSize: values.accountSize ?? null,
    profitTargetPct: values.profitTargetPct ?? null,
    dailyLossLimitPct: values.dailyLossLimitPct ?? null,
    maxLossLimitPct: values.maxLossLimitPct ?? null,
    minTradingDays,
    maxTradingDays: values.maxTradingDays ?? null,
    drawdownType: values.drawdownType || program.drawdownType || firm.drawdownType || "static",
    maxLossBasis: values.maxLossBasis || program.maxLossBasis || firm.maxLossBasis || "initial_balance",
    dailyReset: values.dailyReset || program.dailyReset || firm.dailyReset || "unknown",
    payoutMode: "not_modeled",
    verified,
    sourceNote: values.sourceNote || program.sourceNote || firm.sourceNote || "Preset pendiente de verificar con la firma.",
    editable,
    requiresReview,
    legacy,
    requiredTradingDays: minTradingDays,
    noMinimumDays: minTradingDays === 0,
  });
}

function createProgram(firm, program, baseRules, phaseRules) {
  const phases = Object.fromEntries(
    FUNDING_RULE_PHASES.map((phaseId) => [
      phaseId,
      createPhaseRule(firm, program, phaseId, {
        ...baseRules,
        ...(phaseRules[phaseId] || {}),
      }),
    ])
  );

  return Object.freeze({
    ...program,
    phases: Object.freeze(phases),
  });
}

function editableProgram(firm, programName = "Editable", sourceNote = "Reglas editables hasta confirmar el preset exacto.") {
  const program = {
    programId: normalizeRuleText(programName).replace(/\s+/g, "-") || "editable",
    programName,
    editable: true,
    verified: false,
    requiresReview: true,
    sourceNote,
  };
  return createProgram(firm, program, { editable: true, verified: false, requiresReview: true }, {});
}

function firmPreset(firm, programs) {
  return Object.freeze({
    ...firm,
    programs: Object.freeze(programs),
  });
}

const orion = {
  firmId: "orion-funded",
  firmName: "Orion Funded",
  aliases: ["Orion", "OrionFunded"],
  sourceNote: "Orion separa New Generation y cuentas legacy; validar reglas exactas por fecha de compra.",
};

const wallStreetFunded = {
  firmId: "wsfunded",
  firmName: "Wall Street Funded",
  aliases: ["WSFunded", "WS Funded", "Wall Street"],
  sourceNote: "FAQ oficial WSFunded: modelos Rapid y Classic con drawdown estático.",
};

const ftmo = {
  firmId: "ftmo",
  firmName: "FTMO",
  aliases: [],
  sourceNote: "FTMO Trading Objectives 2-Step: 10% Challenge, 5% Verification, 5% daily, 10% max, 4 días mínimos.",
};

const fundingPips = {
  firmId: "funding-pips",
  firmName: "Funding Pips",
  aliases: ["FundingPips"],
  sourceNote: "Términos oficiales separan 1-Step, 2-Step, 2-Step Pro y Zero; verificar el modelo comprado.",
};

const the5ers = {
  firmId: "the5ers",
  firmName: "The5ers",
  aliases: ["The 5ers", "The5ers"],
  sourceNote: "High Stakes oficial: variantes New/Classic; validar variante y tamaño comprado.",
};

const apex = {
  firmId: "apex",
  firmName: "Apex",
  aliases: [],
  sourceNote: "Compatibilidad legacy del workspace; sin preset verificado.",
};

const fundedNext = {
  firmId: "fundednext",
  firmName: "FundedNext",
  aliases: ["Funded Next"],
  sourceNote: "Compatibilidad legacy del workspace; verificar programa antes de usar.",
};

export const FUNDING_RULE_PRESETS = Object.freeze({
  "Orion Funded": firmPreset(orion, {
    Editable: editableProgram(orion, "Editable", "Reglas Orion editables hasta confirmar programa, versión y fecha de compra."),
    "New Generation": createProgram(
      orion,
      {
        programId: "new-generation",
        programName: "New Generation",
        editable: true,
        verified: false,
        requiresReview: true,
        sourceNote: "Orion indica que New Generation aplica solo a cuentas posteriores a V2.2; faltan objetivos exactos en este preset.",
      },
      { editable: true, verified: false, requiresReview: true },
      {}
    ),
    "Legacy / reglas antiguas": createProgram(
      orion,
      {
        programId: "legacy",
        programName: "Legacy / reglas antiguas",
        editable: true,
        verified: false,
        requiresReview: true,
        legacy: true,
        sourceNote: "Cuentas anteriores a Orion V2.2 pueden seguir reglas antiguas según fecha de compra.",
      },
      { editable: true, verified: false, requiresReview: true, legacy: true },
      {}
    ),
  }),

  "Wall Street Funded": firmPreset(wallStreetFunded, {
    Rapid: createProgram(
      wallStreetFunded,
      {
        programId: "rapid",
        programName: "Rapid",
        verified: true,
        sourceNote: "FAQ oficial WSFunded Rapid: objetivo 10%, DD diario 4%, DD máximo 6%, mínimo 4 días.",
      },
      {
        dailyLossLimitPct: 4,
        maxLossLimitPct: 6,
        minTradingDays: 4,
        drawdownType: "daily_balance_or_equity",
        maxLossBasis: "initial_balance",
        dailyReset: "server_time",
        verified: true,
      },
      {
        Challenge: { profitTargetPct: 10 },
        Verification: { profitTargetPct: null, requiresReview: true, sourceNote: "Rapid es un modelo 1 fase; Verification no aplica salvo configuración manual." },
        Funded: { profitTargetPct: 0 },
      }
    ),
    Classic: createProgram(
      wallStreetFunded,
      {
        programId: "classic",
        programName: "Classic",
        verified: true,
        sourceNote: "FAQ oficial WSFunded Classic: fase 1 8%, fase 2 5%, DD diario 5%, DD máximo 8%, mínimo 4 días.",
      },
      {
        dailyLossLimitPct: 5,
        maxLossLimitPct: 8,
        minTradingDays: 4,
        drawdownType: "daily_balance_or_equity",
        maxLossBasis: "initial_balance",
        dailyReset: "server_time",
        verified: true,
      },
      {
        Challenge: { profitTargetPct: 8 },
        Verification: { profitTargetPct: 5 },
        Funded: { profitTargetPct: 0 },
      }
    ),
  }),

  FTMO: firmPreset(ftmo, {
    "2-Step": createProgram(
      ftmo,
      {
        programId: "2-step",
        programName: "2-Step",
        verified: true,
        sourceNote: "FTMO Trading Objectives 2-Step: Challenge 10%, Verification 5%, DD diario 5%, pérdida máxima 10%, mínimo 4 días.",
      },
      {
        dailyLossLimitPct: 5,
        maxLossLimitPct: 10,
        minTradingDays: 4,
        drawdownType: "daily_balance",
        maxLossBasis: "initial_balance",
        dailyReset: "server_time",
        verified: true,
      },
      {
        Challenge: { profitTargetPct: 10 },
        Verification: { profitTargetPct: 5 },
        Funded: { profitTargetPct: 0, minTradingDays: 0 },
      }
    ),
  }),

  "Funding Pips": firmPreset(fundingPips, {
    Baseline: editableProgram(fundingPips, "Baseline", "Funding Pips depende del modelo comprado; usa reglas editables hasta confirmarlo."),
    "2-Step Standard": createProgram(
      fundingPips,
      {
        programId: "2-step-standard",
        programName: "2-Step Standard",
        verified: false,
        requiresReview: true,
        sourceNote: "Términos oficiales indican DD diario 5%, pérdida máxima 10% y objetivo 8% o 10%; confirmar variante exacta.",
      },
      {
        dailyLossLimitPct: 5,
        maxLossLimitPct: 10,
        minTradingDays: 3,
        drawdownType: "daily_balance_or_equity",
        maxLossBasis: "initial_balance",
        dailyReset: "server_time",
        verified: false,
        requiresReview: true,
        editable: true,
      },
      {
        Challenge: { profitTargetPct: 8 },
        Verification: { profitTargetPct: 5 },
        Funded: { profitTargetPct: 0 },
      }
    ),
    "2-Step Pro": createProgram(
      fundingPips,
      {
        programId: "2-step-pro",
        programName: "2-Step Pro",
        verified: false,
        requiresReview: true,
        sourceNote: "Términos oficiales exponen 2-Step Pro con DD diario 3%, pérdida máxima 6% y mínimo 1 día; confirmar fase/objetivo.",
      },
      {
        dailyLossLimitPct: 3,
        maxLossLimitPct: 6,
        minTradingDays: 1,
        drawdownType: "daily_balance_or_equity",
        maxLossBasis: "initial_balance",
        dailyReset: "server_time",
        verified: false,
        requiresReview: true,
        editable: true,
      },
      {
        Challenge: { profitTargetPct: 6 },
        Verification: { profitTargetPct: 6 },
        Funded: { profitTargetPct: 0 },
      }
    ),
  }),

  The5ers: firmPreset(the5ers, {
    "High Stakes": createProgram(
      the5ers,
      {
        programId: "high-stakes",
        programName: "High Stakes",
        verified: true,
        sourceNote: "The5ers High Stakes New: objetivos 10%/5%, DD diario 5%, pérdida máxima 10%, 3 días rentables mínimos.",
      },
      {
        dailyLossLimitPct: 5,
        maxLossLimitPct: 10,
        minTradingDays: 3,
        drawdownType: "daily_balance_or_equity",
        maxLossBasis: "initial_balance",
        dailyReset: "server_time",
        verified: true,
      },
      {
        Challenge: { profitTargetPct: 10 },
        Verification: { profitTargetPct: 5 },
        Funded: { profitTargetPct: 0 },
      }
    ),
    "High Stakes Classic": createProgram(
      the5ers,
      {
        programId: "high-stakes-classic",
        programName: "High Stakes Classic",
        verified: true,
        sourceNote: "The5ers High Stakes Classic: objetivo 8% fase 1 y 5% fase 2; confirmar si aplica a la cuenta comprada.",
      },
      {
        dailyLossLimitPct: 5,
        maxLossLimitPct: 10,
        minTradingDays: 3,
        drawdownType: "daily_balance_or_equity",
        maxLossBasis: "initial_balance",
        dailyReset: "server_time",
        verified: true,
      },
      {
        Challenge: { profitTargetPct: 8 },
        Verification: { profitTargetPct: 5 },
        Funded: { profitTargetPct: 0 },
      }
    ),
  }),

  Apex: firmPreset(apex, {
    "Legacy / Editable": editableProgram(apex, "Legacy / Editable", "Preset legacy editable conservado para no romper workspaces existentes."),
  }),

  FundedNext: firmPreset(fundedNext, {
    "Stellar 2-Step": editableProgram(fundedNext, "Stellar 2-Step", "Preset legacy editable; confirmar reglas vigentes antes de interpretar objetivos."),
  }),
});

function resolveFirmPreset(firmName = "") {
  if (FUNDING_RULE_PRESETS[firmName]) return FUNDING_RULE_PRESETS[firmName];
  const normalized = normalizeRuleText(firmName);
  return Object.values(FUNDING_RULE_PRESETS).find((firm) => {
    const candidates = [firm.firmName, ...(firm.aliases || [])].map(normalizeRuleText);
    return candidates.includes(normalized);
  }) || null;
}

function resolveProgramPreset(firmPresetValue, programName = "") {
  if (!firmPresetValue) return null;
  if (firmPresetValue.programs?.[programName]) return firmPresetValue.programs[programName];
  const normalized = normalizeRuleText(programName);
  return Object.values(firmPresetValue.programs || {}).find((program) => {
    const candidates = [program.programName, ...(program.aliases || [])].map(normalizeRuleText);
    return candidates.includes(normalized);
  }) || null;
}

function customRule({ firmName = "Sin firma", programName = "Editable", phase = "Challenge", accountSize = null, sourceNote = "" } = {}) {
  const firm = {
    firmId: normalizeRuleText(firmName).replace(/\s+/g, "-") || "custom",
    firmName,
    sourceNote: sourceNote || "Sin preset verificado para esta firma.",
  };
  const program = {
    programId: normalizeRuleText(programName).replace(/\s+/g, "-") || "editable",
    programName,
    editable: true,
    verified: false,
    requiresReview: true,
    sourceNote: firm.sourceNote,
  };
  return {
    ...createPhaseRule(firm, program, normalizeFundingPhase(phase), {
      accountSize,
      editable: true,
      verified: false,
      requiresReview: true,
      sourceNote: firm.sourceNote,
    }),
    ruleStatus: fundingRuleStatus({ editable: true, verified: false, requiresReview: true }),
  };
}

export function availableFundingFirms() {
  return Object.keys(FUNDING_RULE_PRESETS);
}

export function availableFundingPrograms(firmName = "") {
  const firm = resolveFirmPreset(firmName);
  return Object.keys(firm?.programs || {});
}

export function inferFundingProgramModel(account = {}) {
  if (account.programModel) return account.programModel;
  const firmName = account.propFirm || account.firm || "";
  const firm = resolveFirmPreset(firmName);
  const models = Object.keys(firm?.programs || {});
  return models[0] || "Editable";
}

export function fundingRuleStatus(rule = null) {
  if (!rule) return { label: "Sin preset", tone: "neutral" };
  if (rule.legacy) return { label: "Legacy / reglas antiguas", tone: "warning" };
  if (rule.requiresReview) return { label: "Requiere verificación", tone: "warning" };
  if (rule.verified) return { label: "Preset verificado", tone: "ok" };
  if (rule.editable) return { label: "Reglas editables", tone: "neutral" };
  return { label: "Sin preset", tone: "neutral" };
}

export function fundingRuleNote(rule = null) {
  const status = fundingRuleStatus(rule);
  if (!rule) return "Sin preset: reglas editables hasta configurar la firma.";
  return `${status.label}: ${rule.sourceNote || "Revisa condiciones vigentes de la firma."}`;
}

export function resolveFundingRulePreset({ propFirm = "", firm = "", programModel = "", phase = "", accountSize = null } = {}) {
  const requestedFirm = propFirm || firm || "Sin firma";
  const requestedProgram = programModel || "Editable";
  const phaseId = normalizeFundingPhase(phase);
  const firmPresetValue = resolveFirmPreset(requestedFirm);
  if (!firmPresetValue) {
    return customRule({ firmName: requestedFirm, programName: requestedProgram, phase: phaseId, accountSize });
  }

  const programPreset = resolveProgramPreset(firmPresetValue, requestedProgram);
  if (!programPreset) {
    return customRule({
      firmName: firmPresetValue.firmName,
      programName: requestedProgram,
      phase: phaseId,
      accountSize,
      sourceNote: `Sin preset para ${requestedProgram}; usa reglas editables hasta verificar.`,
    });
  }

  const rule = programPreset.phases?.[phaseId];
  if (!rule) {
    return customRule({
      firmName: firmPresetValue.firmName,
      programName: programPreset.programName,
      phase: phaseId,
      accountSize,
      sourceNote: `Sin fase ${phaseId} en el preset seleccionado.`,
    });
  }

  return {
    ...rule,
    accountSize: accountSize ?? rule.accountSize,
    ruleStatus: fundingRuleStatus(rule),
  };
}
