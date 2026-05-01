export const FUNDING_RULE_PHASES = ["Challenge", "Verification", "Funded"];

const SOURCE_RETRIEVED_AT = "2026-05-01";

const PHASE_LABELS = {
  Challenge: "Challenge",
  Verification: "Verification",
  Funded: "Funded",
};

const SOURCE_URLS = {
  orion: "https://www.orionfunded.com/",
  ftmoObjectives: "https://ftmo.com/en/trading-objectives/",
  ftmoOneStep: "https://ftmo.com/en/1-step-challenge/",
  ftmoTwoStep: "https://ftmo.com/en/2-step-challenge/",
  wsfRapid: "https://faq.wsfunded.com/en/articles/8717253-1-phase-wall-street-rapid",
  wsfClassic: "https://faq.wsfunded.com/en/articles/8717270-2-phases-wall-street-classic",
  wsfUltra: "https://faq.wsfunded.com/en/articles/8717276-2-phases-wall-street-ultra",
  wsfInstantStandard: "https://faq.wsfunded.com/en/articles/10719192-instant-standard",
  wsfInstantPro: "https://faq.wsfunded.com/en/articles/10719208-instant-pro",
  fundingPipsTerms: "https://fundingpips.com/legal/terms-and-conditions",
  the5ersHighStakes: "https://help.the5ers.com/what-are-the-general-rules-for-the-high-stakes-program/",
  the5ersHighStakesDrawdown: "https://help.the5ers.com/what-is-the-drawdown-rule-for-high-stakes/",
  the5ersBootcamp: "https://the5ers.com/bootcamp/",
};

function normalizeRuleText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function slugify(value = "") {
  return normalizeRuleText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "editable";
}

export function normalizeFundingPhase(phase = "") {
  const normalized = normalizeRuleText(phase);
  if (normalized.includes("phase 2") || normalized.includes("step 2") || normalized.includes("verification")) return "Verification";
  if (normalized.includes("funded") || normalized.includes("master") || normalized.includes("account")) return "Funded";
  return "Challenge";
}

function cascadeMetadata(firm = {}, program = {}, values = {}) {
  const sourceUrl = values.sourceUrl ?? program.sourceUrl ?? firm.sourceUrl ?? "";
  const sourceType = values.sourceType ?? program.sourceType ?? firm.sourceType ?? (sourceUrl ? "official" : "unknown");
  const requiresReview = Boolean(values.requiresReview ?? program.requiresReview ?? firm.requiresReview ?? false);
  const editable = Boolean(values.editable ?? program.editable ?? firm.editable ?? false);
  const legacy = Boolean(values.legacy ?? program.legacy ?? firm.legacy ?? false);
  const requestedVerified = Boolean(values.verified ?? program.verified ?? firm.verified ?? false);
  const verified = Boolean(requestedVerified && sourceType === "official" && sourceUrl && !requiresReview && !editable && !legacy);

  return {
    sourceType,
    sourceUrl,
    sourceRetrievedAt: values.sourceRetrievedAt ?? program.sourceRetrievedAt ?? firm.sourceRetrievedAt ?? SOURCE_RETRIEVED_AT,
    verified,
    requiresReview: Boolean(requiresReview || (!verified && (editable || !sourceUrl))),
    versionLabel: values.versionLabel ?? program.versionLabel ?? firm.versionLabel ?? "Sin versión",
    appliesToPurchasesFrom: values.appliesToPurchasesFrom ?? program.appliesToPurchasesFrom ?? firm.appliesToPurchasesFrom ?? null,
    appliesToPurchasesUntil: values.appliesToPurchasesUntil ?? program.appliesToPurchasesUntil ?? firm.appliesToPurchasesUntil ?? null,
    notes: values.notes ?? program.notes ?? firm.notes ?? "",
    editable,
    legacy,
  };
}

function createPhaseRule(firm, program, phaseId, values = {}) {
  const minTradingDays = Number(values.minTradingDays ?? values.requiredTradingDays ?? 0) || 0;
  const metadata = cascadeMetadata(firm, program, values);
  const sourceNote = values.sourceNote || program.sourceNote || firm.sourceNote || metadata.notes || "Preset pendiente de verificar con la firma.";

  return Object.freeze({
    firmId: firm.firmId,
    firmName: firm.firmName,
    programId: program.programId,
    programName: program.programName,
    phaseId,
    phaseName: values.phaseName || PHASE_LABELS[phaseId] || phaseId,
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
    sourceNote,
    editable: metadata.editable,
    legacy: metadata.legacy,
    requiredTradingDays: minTradingDays,
    noMinimumDays: minTradingDays === 0,
    sourceType: metadata.sourceType,
    sourceUrl: metadata.sourceUrl,
    sourceRetrievedAt: metadata.sourceRetrievedAt,
    verified: metadata.verified,
    requiresReview: metadata.requiresReview,
    versionLabel: metadata.versionLabel,
    appliesToPurchasesFrom: metadata.appliesToPurchasesFrom,
    appliesToPurchasesUntil: metadata.appliesToPurchasesUntil,
    notes: metadata.notes,
  });
}

function createProgram(firm, program, baseRules = {}, phaseRules = {}) {
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

function editableProgram(firm, programName, metadata = {}) {
  const program = {
    programId: metadata.programId || slugify(programName),
    programName,
    aliases: metadata.aliases || [],
    editable: true,
    verified: false,
    requiresReview: true,
    sourceType: metadata.sourceType || firm.sourceType || "unknown",
    sourceUrl: metadata.sourceUrl ?? firm.sourceUrl ?? "",
    sourceRetrievedAt: metadata.sourceRetrievedAt || firm.sourceRetrievedAt || SOURCE_RETRIEVED_AT,
    versionLabel: metadata.versionLabel || "Por verificar",
    appliesToPurchasesFrom: metadata.appliesToPurchasesFrom ?? null,
    appliesToPurchasesUntil: metadata.appliesToPurchasesUntil ?? null,
    notes: metadata.notes || "Requiere confirmar reglas del programa en el dashboard de la firma.",
    sourceNote: metadata.sourceNote || "Requiere confirmar reglas del programa en el dashboard de la firma.",
    legacy: Boolean(metadata.legacy),
  };

  return createProgram(firm, program, { editable: true, verified: false, requiresReview: true }, {});
}

function firmPreset(firm, programs) {
  return Object.freeze({
    sourceType: firm.sourceType || "unknown",
    sourceUrl: firm.sourceUrl || "",
    sourceRetrievedAt: firm.sourceRetrievedAt || SOURCE_RETRIEVED_AT,
    verified: false,
    requiresReview: true,
    versionLabel: firm.versionLabel || "Multi-programa",
    appliesToPurchasesFrom: firm.appliesToPurchasesFrom ?? null,
    appliesToPurchasesUntil: firm.appliesToPurchasesUntil ?? null,
    notes: firm.notes || "",
    ...firm,
    programs: Object.freeze(programs),
  });
}

const orion = {
  firmId: "orion-funded",
  firmName: "Orion Funded",
  aliases: ["Orion", "OrionFunded"],
  sourceType: "official",
  sourceUrl: SOURCE_URLS.orion,
  sourceRetrievedAt: SOURCE_RETRIEVED_AT,
  verified: false,
  requiresReview: true,
  versionLabel: "New Generation / legacy split",
  appliesToPurchasesFrom: null,
  appliesToPurchasesUntil: null,
  sourceNote: "Requiere confirmar reglas del programa en Orion dashboard.",
  notes: "Orion publica separación New Generation y legacy/pre-V2.2, pero los valores exactos por subprograma deben confirmarse en el dashboard.",
};

const wallStreetFunded = {
  firmId: "wsfunded",
  firmName: "Wall Street Funded",
  aliases: ["WSFunded", "WS Funded", "Wall Street"],
  sourceType: "official",
  sourceRetrievedAt: SOURCE_RETRIEVED_AT,
  versionLabel: "FAQ 2026",
  sourceNote: "Reglas tomadas del FAQ oficial de WSFunded por programa.",
};

const ftmo = {
  firmId: "ftmo",
  firmName: "FTMO",
  aliases: [],
  sourceType: "official",
  sourceRetrievedAt: SOURCE_RETRIEVED_AT,
  versionLabel: "Trading Objectives 2026",
  sourceNote: "Reglas tomadas de FTMO Trading Objectives oficiales.",
};

const fundingPips = {
  firmId: "funding-pips",
  firmName: "Funding Pips",
  aliases: ["FundingPips"],
  sourceType: "official",
  sourceUrl: SOURCE_URLS.fundingPipsTerms,
  sourceRetrievedAt: SOURCE_RETRIEVED_AT,
  versionLabel: "Terms & Conditions 2026",
  sourceNote: "Reglas tomadas de Terms & Conditions oficiales; revisar modelo exacto comprado.",
};

const the5ers = {
  firmId: "the5ers",
  firmName: "The5ers",
  aliases: ["The 5ers", "The5ers"],
  sourceType: "official",
  sourceRetrievedAt: SOURCE_RETRIEVED_AT,
  versionLabel: "Program pages 2026",
  sourceNote: "Reglas tomadas de páginas oficiales y Help Center de The5ers.",
};

const apex = {
  firmId: "apex",
  firmName: "Apex",
  aliases: [],
  sourceType: "internal_seed",
  sourceUrl: "",
  sourceRetrievedAt: SOURCE_RETRIEVED_AT,
  verified: false,
  requiresReview: true,
  sourceNote: "Compatibilidad legacy del workspace; sin preset verificado.",
};

const fundedNext = {
  firmId: "fundednext",
  firmName: "FundedNext",
  aliases: ["Funded Next"],
  sourceType: "internal_seed",
  sourceUrl: "",
  sourceRetrievedAt: SOURCE_RETRIEVED_AT,
  verified: false,
  requiresReview: true,
  sourceNote: "Compatibilidad legacy del workspace; verificar programa antes de usar.",
};

const staticDailyBalanceOrEquity = {
  drawdownType: "daily_balance_or_equity",
  maxLossBasis: "initial_balance",
  dailyReset: "server_time",
};

export const FUNDING_RULE_PRESETS = Object.freeze({
  "Orion Funded": firmPreset(orion, {
    "Orion Zero": editableProgram(orion, "Orion Zero", {
      versionLabel: "New Generation / Zero",
      sourceUrl: SOURCE_URLS.orion,
      appliesToPurchasesFrom: "2026-03-23",
    }),
    "Orion Lite": editableProgram(orion, "Orion Lite", {
      versionLabel: "New Generation / Lite",
      sourceUrl: SOURCE_URLS.orion,
      appliesToPurchasesFrom: "2026-03-23",
    }),
    "Orion Standard/Swing": editableProgram(orion, "Orion Standard/Swing", {
      aliases: ["Standard", "Swing"],
      versionLabel: "New Generation / Standard-Swing",
      sourceUrl: SOURCE_URLS.orion,
      appliesToPurchasesFrom: "2026-03-23",
    }),
    "Orion Select": editableProgram(orion, "Orion Select", {
      versionLabel: "New Generation / Select",
      sourceUrl: SOURCE_URLS.orion,
      appliesToPurchasesFrom: "2026-03-23",
    }),
    "New Generation / post-V2.2": editableProgram(orion, "New Generation / post-V2.2", {
      versionLabel: "Post-V2.2",
      sourceUrl: SOURCE_URLS.orion,
      appliesToPurchasesFrom: "2026-03-23",
      notes: "New Generation aplica solo a cuentas adquiridas mediante modelos New Generation.",
    }),
    "Legacy / pre-V2.2": editableProgram(orion, "Legacy / pre-V2.2", {
      aliases: ["Legacy / reglas antiguas"],
      legacy: true,
      versionLabel: "Pre-V2.2",
      sourceUrl: SOURCE_URLS.orion,
      appliesToPurchasesUntil: "2026-03-22",
      notes: "Cuentas compradas hasta el 22 mar 2026 se rigen por términos vigentes en el momento de compra.",
      sourceNote: "Legacy / revisar fecha: confirma reglas antiguas en Orion dashboard.",
    }),
    "Manual / sin preset": editableProgram(orion, "Manual / sin preset", {
      aliases: ["Editable"],
      sourceType: "user_manual",
      sourceUrl: "",
      versionLabel: "Manual",
      sourceNote: "Reglas editables hasta vincular programa Orion exacto.",
    }),
  }),

  FTMO: firmPreset(ftmo, {
    "FTMO 1-Step": createProgram(
      ftmo,
      {
        programId: "ftmo-1-step",
        programName: "FTMO 1-Step",
        aliases: ["1-Step"],
        sourceType: "official",
        sourceUrl: SOURCE_URLS.ftmoOneStep,
        versionLabel: "1-Step 2026",
        verified: true,
        notes: "1-Step: profit target 10%, max daily loss 3%, max loss 10%, best day rule 50%.",
      },
      {
        dailyLossLimitPct: 3,
        maxLossLimitPct: 10,
        minTradingDays: 0,
        drawdownType: "trailing",
        maxLossBasis: "trailing_high_watermark",
        dailyReset: "server_time",
        verified: true,
      },
      {
        Challenge: { phaseName: "FTMO 1-Step Challenge", profitTargetPct: 10 },
        Verification: {
          phaseName: "No aplica",
          profitTargetPct: null,
          editable: true,
          verified: false,
          requiresReview: true,
          sourceNote: "FTMO 1-Step no tiene fase Verification.",
          notes: "Fase no aplicable al modelo 1-Step.",
        },
        Funded: { phaseName: "FTMO Account 1-Step", profitTargetPct: 0 },
      }
    ),
    "FTMO 2-Step": createProgram(
      ftmo,
      {
        programId: "ftmo-2-step",
        programName: "FTMO 2-Step",
        aliases: ["2-Step"],
        sourceType: "official",
        sourceUrl: SOURCE_URLS.ftmoTwoStep,
        versionLabel: "2-Step 2026",
        verified: true,
        notes: "2-Step: 10% Challenge, 5% Verification, max daily loss 5%, max loss 10%, min 4 days.",
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
        Challenge: { phaseName: "FTMO Challenge", profitTargetPct: 10 },
        Verification: { phaseName: "FTMO Verification", profitTargetPct: 5 },
        Funded: { phaseName: "FTMO Account", profitTargetPct: 0, minTradingDays: 0 },
      }
    ),
  }),

  "Wall Street Funded": firmPreset(wallStreetFunded, {
    "Wall Street Rapid": createProgram(
      wallStreetFunded,
      {
        programId: "wsf-rapid",
        programName: "Wall Street Rapid",
        aliases: ["Rapid"],
        sourceType: "official",
        sourceUrl: SOURCE_URLS.wsfRapid,
        versionLabel: "Rapid FAQ 2026",
        verified: true,
        notes: "SL obligatorio en 2 min y riesgo máximo por idea del 50% del DD diario.",
      },
      {
        dailyLossLimitPct: 4,
        maxLossLimitPct: 6,
        minTradingDays: 4,
        ...staticDailyBalanceOrEquity,
        verified: true,
      },
      {
        Challenge: { phaseName: "Rapid 1 Phase", profitTargetPct: 10 },
        Verification: {
          phaseName: "No aplica",
          profitTargetPct: null,
          editable: true,
          verified: false,
          requiresReview: true,
          sourceNote: "Rapid es un modelo de 1 fase; Verification no aplica.",
        },
        Funded: { phaseName: "Rapid Funded", profitTargetPct: 0 },
      }
    ),
    "Wall Street Classic": createProgram(
      wallStreetFunded,
      {
        programId: "wsf-classic",
        programName: "Wall Street Classic",
        aliases: ["Classic"],
        sourceType: "official",
        sourceUrl: SOURCE_URLS.wsfClassic,
        versionLabel: "Classic FAQ 2026",
        verified: true,
        notes: "SL obligatorio en 2 min y riesgo máximo por idea del 50% del DD diario.",
      },
      {
        dailyLossLimitPct: 5,
        maxLossLimitPct: 8,
        minTradingDays: 4,
        ...staticDailyBalanceOrEquity,
        verified: true,
      },
      {
        Challenge: { phaseName: "Classic Phase 1", profitTargetPct: 8 },
        Verification: { phaseName: "Classic Phase 2", profitTargetPct: 5 },
        Funded: { phaseName: "Classic Funded", profitTargetPct: 0 },
      }
    ),
    "Wall Street Ultra": createProgram(
      wallStreetFunded,
      {
        programId: "wsf-ultra",
        programName: "Wall Street Ultra",
        aliases: ["Ultra"],
        sourceType: "official",
        sourceUrl: SOURCE_URLS.wsfUltra,
        versionLabel: "Ultra FAQ 2026",
        verified: true,
        notes: "SL obligatorio en 2 min y riesgo máximo por idea del 50% del DD diario.",
      },
      {
        dailyLossLimitPct: 5,
        maxLossLimitPct: 10,
        minTradingDays: 4,
        ...staticDailyBalanceOrEquity,
        verified: true,
      },
      {
        Challenge: { phaseName: "Ultra Phase 1", profitTargetPct: 10 },
        Verification: { phaseName: "Ultra Phase 2", profitTargetPct: 5 },
        Funded: { phaseName: "Ultra Funded", profitTargetPct: 0 },
      }
    ),
    "Wall Street Elite New": createProgram(
      wallStreetFunded,
      {
        programId: "wsf-elite-new",
        programName: "Wall Street Elite New",
        aliases: ["Elite New"],
        editable: true,
        verified: false,
        requiresReview: true,
        sourceType: "official",
        sourceUrl: "https://faq.wsfunded.com/es/collections/7470136-desafios",
        versionLabel: "Elite New 2026",
        sourceNote: "Requiere verificar artículo exacto Elite New antes de aplicar objetivos o límites.",
        notes: "Colección oficial lista Elite New, pero no se confirmó artículo exacto con valores.",
      },
      {
        editable: true,
        verified: false,
        requiresReview: true,
        sourceType: "official",
        sourceUrl: "https://faq.wsfunded.com/es/collections/7470136-desafios",
      },
      {
        Challenge: { phaseName: "Elite New Phase 1", profitTargetPct: null },
        Verification: { phaseName: "Elite New Phase 2", profitTargetPct: null },
        Funded: { phaseName: "Elite New Funded", profitTargetPct: 0 },
      }
    ),
    "Instant Standard": createProgram(
      wallStreetFunded,
      {
        programId: "wsf-instant-standard",
        programName: "Instant Standard",
        sourceType: "official",
        sourceUrl: SOURCE_URLS.wsfInstantStandard,
        versionLabel: "Instant Standard 2026",
        verified: true,
        notes: "Instant Standard: DD diario 3%, DD total trailing 6%, 4 días rentables para reward.",
      },
      {
        dailyLossLimitPct: 3,
        maxLossLimitPct: 6,
        minTradingDays: 4,
        drawdownType: "trailing",
        maxLossBasis: "trailing_high_watermark",
        dailyReset: "server_time",
        verified: true,
      },
      {
        Challenge: { profitTargetPct: null, editable: true, verified: false, requiresReview: true, sourceNote: "Instant Standard no es challenge de evaluación tradicional." },
        Verification: { profitTargetPct: null, editable: true, verified: false, requiresReview: true, sourceNote: "Instant Standard no tiene fase 2." },
        Funded: { phaseName: "Instant Standard Funded", profitTargetPct: 0 },
      }
    ),
    "Instant Pro": createProgram(
      wallStreetFunded,
      {
        programId: "wsf-instant-pro",
        programName: "Instant Pro",
        sourceType: "official",
        sourceUrl: SOURCE_URLS.wsfInstantPro,
        versionLabel: "Instant Pro 2026",
        verified: true,
        notes: "Instant Pro: DD diario 3%, DD total trailing 5%, consistencia 15%.",
      },
      {
        dailyLossLimitPct: 3,
        maxLossLimitPct: 5,
        minTradingDays: 4,
        drawdownType: "trailing",
        maxLossBasis: "trailing_high_watermark",
        dailyReset: "server_time",
        verified: true,
      },
      {
        Challenge: { profitTargetPct: null, editable: true, verified: false, requiresReview: true, sourceNote: "Instant Pro no es challenge de evaluación tradicional." },
        Verification: { profitTargetPct: null, editable: true, verified: false, requiresReview: true, sourceNote: "Instant Pro no tiene fase 2." },
        Funded: { phaseName: "Instant Pro Funded", profitTargetPct: 0 },
      }
    ),
  }),

  "Funding Pips": firmPreset(fundingPips, {
    "1-Step": createProgram(
      fundingPips,
      {
        programId: "funding-pips-1-step",
        programName: "1-Step",
        sourceType: "official",
        sourceUrl: SOURCE_URLS.fundingPipsTerms,
        versionLabel: "T&C 2026 / 1-Step",
        verified: true,
        notes: "T&C: 1-Step maximum loss 6%, daily loss 3%, profit target 10%, min 3 days.",
      },
      {
        dailyLossLimitPct: 3,
        maxLossLimitPct: 6,
        minTradingDays: 3,
        ...staticDailyBalanceOrEquity,
        verified: true,
      },
      {
        Challenge: { profitTargetPct: 10 },
        Verification: { profitTargetPct: null, editable: true, verified: false, requiresReview: true, sourceNote: "1-Step no tiene fase Practitioner/Verification." },
        Funded: { profitTargetPct: 0, minTradingDays: 0 },
      }
    ),
    "2-Step": createProgram(
      fundingPips,
      {
        programId: "funding-pips-2-step",
        programName: "2-Step",
        aliases: ["2-Step Standard", "Baseline"],
        sourceType: "official",
        sourceUrl: SOURCE_URLS.fundingPipsTerms,
        versionLabel: "T&C 2026 / 2-Step",
        verified: false,
        requiresReview: true,
        editable: true,
        notes: "T&C indica objetivo Phase 1 de 8% o 10%; requiere confirmar variante exacta.",
      },
      {
        dailyLossLimitPct: 5,
        maxLossLimitPct: 10,
        minTradingDays: 3,
        ...staticDailyBalanceOrEquity,
        verified: false,
        requiresReview: true,
        editable: true,
      },
      {
        Challenge: { profitTargetPct: 8, sourceNote: "Phase 1 puede ser 8% o 10%; verificar variante comprada." },
        Verification: { profitTargetPct: 5, sourceNote: "Practitioner account 2-Step: objetivo 5% según T&C." },
        Funded: { profitTargetPct: 0 },
      }
    ),
    "2-Step Pro": createProgram(
      fundingPips,
      {
        programId: "funding-pips-2-step-pro",
        programName: "2-Step Pro",
        sourceType: "official",
        sourceUrl: SOURCE_URLS.fundingPipsTerms,
        versionLabel: "T&C 2026 / 2-Step Pro",
        verified: false,
        requiresReview: true,
        editable: true,
        notes: "T&C confirma límites y Phase 1 6%; objetivo Practitioner/Phase 2 no queda suficientemente explícito.",
      },
      {
        dailyLossLimitPct: 3,
        maxLossLimitPct: 6,
        minTradingDays: 1,
        ...staticDailyBalanceOrEquity,
        verified: false,
        requiresReview: true,
        editable: true,
      },
      {
        Challenge: { profitTargetPct: 6 },
        Verification: { profitTargetPct: null, sourceNote: "Requiere confirmar objetivo Phase 2 de 2-Step Pro." },
        Funded: { profitTargetPct: 0 },
      }
    ),
    Zero: createProgram(
      fundingPips,
      {
        programId: "funding-pips-zero",
        programName: "Zero",
        sourceType: "official",
        sourceUrl: SOURCE_URLS.fundingPipsTerms,
        versionLabel: "T&C 2026 / Zero",
        verified: false,
        requiresReview: true,
        editable: true,
        notes: "T&C confirma DD trailing 5%, DD diario 3% y 7 días rentables en Master; objetivo de evaluación no queda modelado.",
      },
      {
        dailyLossLimitPct: 3,
        maxLossLimitPct: 5,
        minTradingDays: 7,
        drawdownType: "trailing",
        maxLossBasis: "equity_peak",
        dailyReset: "server_time",
        verified: false,
        requiresReview: true,
        editable: true,
      },
      {
        Challenge: { profitTargetPct: null },
        Verification: { profitTargetPct: null },
        Funded: { profitTargetPct: 0 },
      }
    ),
  }),

  The5ers: firmPreset(the5ers, {
    "High Stakes": createProgram(
      the5ers,
      {
        programId: "the5ers-high-stakes-new",
        programName: "High Stakes",
        aliases: ["High Stakes New"],
        sourceType: "official",
        sourceUrl: SOURCE_URLS.the5ersHighStakes,
        versionLabel: "High Stakes New 2026",
        verified: true,
        notes: "New High Stakes: 10% Step 1, 5% Step 2, 3 profitable days, 5% daily, 10% max loss.",
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
        Challenge: { phaseName: "High Stakes Step 1", profitTargetPct: 10 },
        Verification: { phaseName: "High Stakes Step 2", profitTargetPct: 5 },
        Funded: { phaseName: "High Stakes Funded / Scaling", profitTargetPct: 10 },
      }
    ),
    "High Stakes Classic": createProgram(
      the5ers,
      {
        programId: "the5ers-high-stakes-classic",
        programName: "High Stakes Classic",
        sourceType: "official",
        sourceUrl: SOURCE_URLS.the5ersHighStakes,
        versionLabel: "High Stakes Classic 2026",
        verified: true,
        notes: "Classic High Stakes: 8% Step 1, 5% Step 2, 3 profitable days, 5% daily, 10% max loss.",
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
        Challenge: { phaseName: "High Stakes Classic Step 1", profitTargetPct: 8 },
        Verification: { phaseName: "High Stakes Classic Step 2", profitTargetPct: 5 },
        Funded: { phaseName: "High Stakes Classic Funded", profitTargetPct: null, editable: true, verified: false, requiresReview: true, sourceNote: "Confirmar objetivo de scaling para variante Classic." },
      }
    ),
    Bootcamp: createProgram(
      the5ers,
      {
        programId: "the5ers-bootcamp",
        programName: "Bootcamp",
        sourceType: "official",
        sourceUrl: SOURCE_URLS.the5ersBootcamp,
        versionLabel: "Bootcamp 2026",
        verified: true,
        notes: "Bootcamp tiene 3 pasos; este modelo mapea Step 1/2 y funded/scaling. Step 3 debe revisarse si se usa en UI.",
      },
      {
        dailyLossLimitPct: null,
        maxLossLimitPct: 5,
        minTradingDays: 0,
        drawdownType: "static",
        maxLossBasis: "initial_balance",
        dailyReset: "server_time",
        verified: true,
      },
      {
        Challenge: { phaseName: "Bootcamp Step 1", profitTargetPct: 6 },
        Verification: { phaseName: "Bootcamp Step 2", profitTargetPct: 6 },
        Funded: { phaseName: "Bootcamp Funded / Scaling", profitTargetPct: 5, dailyLossLimitPct: 3, maxLossLimitPct: 4 },
      }
    ),
  }),

  Apex: firmPreset(apex, {
    "Legacy / Editable": editableProgram(apex, "Legacy / Editable", {
      sourceType: "internal_seed",
      sourceUrl: "",
      versionLabel: "Legacy workspace seed",
      sourceNote: "Preset legacy editable conservado para no romper workspaces existentes.",
    }),
  }),

  FundedNext: firmPreset(fundedNext, {
    "Stellar 2-Step": editableProgram(fundedNext, "Stellar 2-Step", {
      sourceType: "internal_seed",
      sourceUrl: "",
      versionLabel: "Legacy workspace seed",
      sourceNote: "Preset legacy editable; confirmar reglas vigentes antes de interpretar objetivos.",
    }),
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
    firmId: slugify(firmName) || "custom",
    firmName,
    sourceType: "unknown",
    sourceUrl: "",
    sourceRetrievedAt: SOURCE_RETRIEVED_AT,
    sourceNote: sourceNote || "Sin preset verificado para esta firma.",
  };
  const program = {
    programId: slugify(programName) || "editable",
    programName,
    editable: true,
    verified: false,
    requiresReview: true,
    sourceType: "unknown",
    sourceUrl: "",
    sourceRetrievedAt: SOURCE_RETRIEVED_AT,
    versionLabel: "Sin preset",
    notes: "Reglas no encontradas en presets internos.",
    sourceNote: firm.sourceNote,
  };
  return {
    ...createPhaseRule(firm, program, normalizeFundingPhase(phase), {
      accountSize,
      editable: true,
      verified: false,
      requiresReview: true,
      sourceType: "unknown",
      sourceUrl: "",
      sourceNote: firm.sourceNote,
    }),
    ruleStatus: fundingRuleStatus({ editable: true, verified: false, requiresReview: true, sourceUrl: "" }),
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
  return models[0] || "Manual / sin preset";
}

export function fundingRuleStatus(rule = null) {
  if (!rule) return { label: "Sin preset", tone: "neutral" };
  if (rule.legacy) return { label: "Legacy / revisar fecha", tone: "warning" };
  if (rule.requiresReview) return { label: "Requiere verificación", tone: "warning" };
  if (rule.verified) return { label: "Preset verificado", tone: "ok" };
  if (rule.editable) return { label: "Reglas editables", tone: "neutral" };
  return { label: "Sin preset", tone: "neutral" };
}

export function fundingRuleNote(rule = null) {
  const status = fundingRuleStatus(rule);
  if (!rule) return "Sin preset: reglas editables hasta configurar la firma.";
  const version = rule.versionLabel ? ` · ${rule.versionLabel}` : "";
  const source = rule.sourceUrl ? "fuente oficial vinculada" : "sin fuente oficial vinculada";
  return `${status.label}${version}: ${rule.sourceNote || rule.notes || "Revisa condiciones vigentes de la firma."} (${source}).`;
}

export function resolveFundingRulePreset({ propFirm = "", firm = "", programModel = "", phase = "", accountSize = null } = {}) {
  const requestedFirm = propFirm || firm || "Sin firma";
  const requestedProgram = programModel || "Manual / sin preset";
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
