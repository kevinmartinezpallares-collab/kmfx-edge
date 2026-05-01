export const FUNDING_JOURNEY_STATUSES = Object.freeze([
  "planned",
  "phase_1_active",
  "phase_1_failed",
  "phase_1_passed",
  "phase_2_active",
  "phase_2_failed",
  "phase_2_passed",
  "funded_active",
  "funded_suspended",
  "closed",
]);

export const FUNDING_PHASE_STATUSES = Object.freeze([
  "planned",
  "active",
  "passed",
  "failed",
  "funded",
  "suspended",
  "closed",
]);

/**
 * FundingJourney tracks the commercial challenge over credential changes.
 * A prop firm can issue new MT5 logins per phase, but the journey remains one record.
 *
 * @typedef {Object} FundingJourney
 * @property {string} id
 * @property {string} label
 * @property {string} firmId
 * @property {string} firmName
 * @property {string} programId
 * @property {string} programName
 * @property {number} accountSize
 * @property {string|null} purchaseDate
 * @property {string} status
 * @property {string} currentPhaseId
 * @property {string} notes
 * @property {string|null} createdAt
 * @property {string|null} updatedAt
 */

/**
 * FundingPhase links a journey phase to the MT5 account active for that phase.
 *
 * @typedef {Object} FundingPhase
 * @property {string} id
 * @property {string} journeyId
 * @property {string} phaseId
 * @property {string} phaseName
 * @property {string} accountId
 * @property {string} login
 * @property {string} server
 * @property {string|null} startedAt
 * @property {string|null} endedAt
 * @property {string} status
 * @property {string|null} passedAt
 * @property {string|null} failedAt
 * @property {Object} resultSnapshot
 * @property {string} notes
 */

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function slugify(value = "") {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}

function accountLogin(account = {}) {
  return String(account.login || account.model?.account?.login || account.dashboardPayload?.login || account.meta?.login || "");
}

function accountServer(account = {}) {
  return String(account.meta?.server || account.model?.account?.server || account.dashboardPayload?.server || account.server || "");
}

function accountBroker(account = {}) {
  return String(account.broker || account.model?.account?.broker || account.dashboardPayload?.broker || "");
}

function normalizePhaseBucket(phase = "") {
  const normalized = normalizeText(phase);
  if (normalized.includes("phase 2") || normalized.includes("step 2") || normalized.includes("verification")) return "phase_2";
  if (normalized.includes("funded") || normalized.includes("live") || normalized.includes("master")) return "funded";
  return "phase_1";
}

function normalizeJourneyStatus(status = "") {
  return FUNDING_JOURNEY_STATUSES.includes(status) ? status : "planned";
}

function normalizePhaseStatus(status = "") {
  return FUNDING_PHASE_STATUSES.includes(status) ? status : "planned";
}

function hasExplicitFailedState(account = {}) {
  const phaseStatus = String(account.phaseStatus || account.status || "").trim().toLowerCase();
  return Boolean(
    account.failedAt
      || account.manualFailed === true
      || account.phaseFailed === true
      || account.providerFailed === true
      || phaseStatus === "failed"
      || phaseStatus === "phase_failed"
      || phaseStatus === "phase_1_failed"
      || phaseStatus === "phase_2_failed"
      || phaseStatus === "fallida"
  );
}

function phaseStatusFromFundedAccount(account = {}) {
  if (hasExplicitFailedState(account)) return "failed";
  if (normalizePhaseBucket(account.phase) === "funded") {
    return account.fundedSuspended === true || account.providerStatus === "suspended" ? "suspended" : "funded";
  }
  if (account.challengeState === "passed") return "passed";
  return "active";
}

function journeyStatusFromPhase(phaseId = "", phaseStatus = "") {
  const bucket = normalizePhaseBucket(phaseId);
  if (phaseStatus === "closed") return "closed";
  if (bucket === "funded") return phaseStatus === "suspended" ? "funded_suspended" : "funded_active";
  if (bucket === "phase_2") {
    if (phaseStatus === "failed") return "phase_2_failed";
    if (phaseStatus === "passed") return "phase_2_passed";
    return "phase_2_active";
  }
  if (phaseStatus === "failed") return "phase_1_failed";
  if (phaseStatus === "passed") return "phase_1_passed";
  return "phase_1_active";
}

function findStoredJourney(account = {}, journeys = []) {
  const candidates = [
    account.journeyId,
    account.fundingJourneyId,
    `journey-${account.id}`,
  ].filter(Boolean);

  return journeys.find((journey) => (
    candidates.includes(journey.id)
      || journey.fundedAccountId === account.id
      || journey.currentFundedAccountId === account.id
  )) || null;
}

function createCurrentPhase(account = {}, journeyId = "", storedPhases = []) {
  const linked = account.linked || {};
  const phaseId = account.phase || "Challenge";
  const accountId = account.linkedAccountId || account.configuredAccountId || account.accountId || "";
  const login = accountLogin(linked) || String(account.login || "");
  const server = accountServer(linked) || String(account.server || "");
  const stableLink = login || accountId || account.id || "unlinked";
  const phaseKey = `${journeyId}-${slugify(phaseId)}-${slugify(stableLink)}`;
  const storedCurrent = storedPhases.find((phase) => (
    phase.current === true
      || phase.id === `phase-${phaseKey}`
      || (phase.journeyId === journeyId && phase.accountId && phase.accountId === accountId)
      || (phase.journeyId === journeyId && phase.login && String(phase.login) === login)
  )) || {};
  const status = normalizePhaseStatus(storedCurrent.status || phaseStatusFromFundedAccount(account));
  const explicitFailedAt = storedCurrent.failedAt || account.failedAt || null;

  return {
    id: storedCurrent.id || `phase-${phaseKey}`,
    journeyId,
    phaseId,
    phaseName: account.preset?.phaseName || phaseId,
    accountId,
    login,
    server,
    broker: accountBroker(linked),
    startedAt: storedCurrent.startedAt || account.startedAt || null,
    endedAt: storedCurrent.endedAt || null,
    status,
    passedAt: storedCurrent.passedAt || (status === "passed" ? account.updatedAt || null : null),
    failedAt: status === "failed" ? explicitFailedAt : null,
    resultSnapshot: {
      balance: account.balance ?? null,
      equity: account.equity ?? null,
      currentProfitUsd: account.currentProfitUsd ?? null,
      currentProfitPct: account.currentProfitPct ?? null,
      targetUsd: account.targetUsd ?? null,
      targetCompletionPct: account.targetCompletionPct ?? null,
      dailyDdPct: account.dailyDdPct ?? null,
      maxDdPct: account.maxDdPct ?? null,
      daysCompleted: account.daysCompleted ?? null,
    },
    notes: storedCurrent.notes || account.phaseNotes || "",
    current: true,
  };
}

function createJourney(account = {}, storedJourney = {}, currentPhase = {}, historicalPhases = []) {
  const status = normalizeJourneyStatus(storedJourney.status || journeyStatusFromPhase(currentPhase.phaseId, currentPhase.status));

  return {
    id: storedJourney.id || account.journeyId || account.fundingJourneyId || `journey-${account.id || slugify(account.label)}`,
    label: storedJourney.label || account.journeyLabel || account.label || "Recorrido funding",
    firmId: storedJourney.firmId || account.preset?.firmId || slugify(account.propFirm || account.firm),
    firmName: storedJourney.firmName || account.propFirm || account.firm || "",
    programId: storedJourney.programId || account.preset?.programId || slugify(account.programModel),
    programName: storedJourney.programName || account.programModel || "",
    accountSize: Number(storedJourney.accountSize || account.accountSize || account.size || 0),
    purchaseDate: storedJourney.purchaseDate || account.purchaseDate || null,
    status,
    currentPhaseId: currentPhase.id,
    notes: storedJourney.notes || account.journeyNotes || account.notes || "",
    createdAt: storedJourney.createdAt || account.createdAt || null,
    updatedAt: storedJourney.updatedAt || account.updatedAt || null,
    fundedAccountId: account.id || storedJourney.fundedAccountId || "",
    phases: [...historicalPhases, currentPhase],
  };
}

export function fundingJourneyStatusLabel(status = "") {
  const labels = {
    planned: "Planificado",
    phase_1_active: "Fase 1 activa",
    phase_1_failed: "Fase 1 fallida",
    phase_1_passed: "Fase 1 superada",
    phase_2_active: "Fase 2 activa",
    phase_2_failed: "Fase 2 fallida",
    phase_2_passed: "Fase 2 superada",
    funded_active: "Funded activo",
    funded_suspended: "Funded suspendido",
    closed: "Cerrado",
  };
  return labels[status] || "Planificado";
}

export function fundingPhaseStatusLabel(status = "") {
  const labels = {
    planned: "Planificada",
    active: "Activa",
    passed: "Superada",
    failed: "Fallida",
    funded: "Funded",
    suspended: "Suspendida",
    closed: "Cerrada",
  };
  return labels[status] || "Planificada";
}

export function fundingJourneyCurrentPhaseLine(journey = null) {
  const phase = journey?.phases?.find((item) => item.id === journey.currentPhaseId) || journey?.phases?.[journey?.phases.length - 1];
  if (!phase) return "";
  const linked = phase.login ? ` vinculada a ${phase.login}` : " sin cuenta live vinculada";
  return `${phase.phaseName || phase.phaseId}${linked}`;
}

export function buildFundingJourneys({ fundedAccounts = [], journeys = [], phases = [] } = {}) {
  const storedJourneys = Array.isArray(journeys) ? journeys : [];
  const storedPhases = Array.isArray(phases) ? phases : [];
  const journeyByFundedId = new Map();
  const phaseByFundedId = new Map();
  const allPhases = [];

  const derivedJourneys = fundedAccounts.map((account) => {
    const storedJourney = findStoredJourney(account, storedJourneys) || {};
    const journeyId = storedJourney.id || account.journeyId || account.fundingJourneyId || `journey-${account.id || slugify(account.label)}`;
    const historicalPhases = storedPhases.filter((phase) => phase.journeyId === journeyId && !phase.current);
    const currentPhase = createCurrentPhase(account, journeyId, storedPhases);
    const journey = createJourney(account, { ...storedJourney, id: journeyId }, currentPhase, historicalPhases);

    journeyByFundedId.set(account.id, journey);
    phaseByFundedId.set(account.id, currentPhase);
    allPhases.push(...historicalPhases, currentPhase);
    return journey;
  });

  return {
    journeys: derivedJourneys,
    phases: allPhases,
    journeyByFundedId,
    phaseByFundedId,
  };
}
