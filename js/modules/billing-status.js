import { resolveBillingStatusUrl } from "./api-config.js?v=build-20260505-071500";

export const DEFAULT_BILLING_STATUS = {
  loading: false,
  loadedAt: "",
  error: "",
  authRequired: true,
  billing: {
    plan: "free",
    effectivePlan: "free",
    displayName: "Free / Demo",
    status: "anonymous",
    access: "anonymous",
    currentPeriodEndsAt: "",
    trialEndsAt: "",
    cancelAtPeriodEnd: false,
  },
  entitlements: {
    demoData: true,
    liveMt5Accounts: 0,
    launcherConnection: false,
    dashboardCore: true,
    riskCore: "partial",
    riskPolicyEditor: false,
    localAutoBlock: false,
    tradesHistory: "limited",
    calendar: "limited",
    advancedAnalytics: false,
    journal: "limited",
    strategies: false,
    fundedChallenges: false,
    portfolio: false,
    talentProfile: false,
    rawBridgeDebug: false,
    exports: false,
    teamWorkspace: false,
    prioritySupport: false,
  },
  limits: {
    liveMt5Accounts: 0,
    connectionKeyLimit: 0,
  },
  isAdmin: false,
  source: "initial",
};

function buildAuthHeaders(state, extra = {}) {
  const headers = {
    Accept: "application/json",
    ...extra,
  };
  if (state?.auth?.status !== "authenticated") return headers;
  const token = state?.auth?.session?.accessToken;
  const email = state?.auth?.user?.email;
  const userId = state?.auth?.user?.id;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (email) headers["X-KMFX-User-Email"] = email;
  if (userId) headers["X-KMFX-User-Id"] = userId;
  return headers;
}

function authSignature(state = {}) {
  return JSON.stringify({
    status: state.auth?.status || "anonymous",
    userId: state.auth?.user?.id || "",
    email: state.auth?.user?.email || "",
    hasToken: Boolean(state.auth?.session?.accessToken),
  });
}

function normalizeBillingStatus(payload = {}) {
  const billing = payload.billing && typeof payload.billing === "object" ? payload.billing : {};
  const entitlements = payload.entitlements && typeof payload.entitlements === "object" ? payload.entitlements : {};
  const limits = payload.limits && typeof payload.limits === "object" ? payload.limits : {};

  return {
    ...DEFAULT_BILLING_STATUS,
    authRequired: Boolean(payload.auth_required ?? payload.authRequired ?? false),
    billing: {
      ...DEFAULT_BILLING_STATUS.billing,
      ...billing,
      plan: String(billing.plan || DEFAULT_BILLING_STATUS.billing.plan).toLowerCase(),
      effectivePlan: String(billing.effectivePlan || billing.effective_plan || billing.plan || DEFAULT_BILLING_STATUS.billing.effectivePlan).toLowerCase(),
      displayName: billing.displayName || billing.display_name || DEFAULT_BILLING_STATUS.billing.displayName,
      status: String(billing.status || DEFAULT_BILLING_STATUS.billing.status).toLowerCase(),
      access: String(billing.access || DEFAULT_BILLING_STATUS.billing.access).toLowerCase(),
      currentPeriodEndsAt: billing.currentPeriodEndsAt || billing.current_period_end || "",
      trialEndsAt: billing.trialEndsAt || billing.trial_end || "",
      cancelAtPeriodEnd: Boolean(billing.cancelAtPeriodEnd ?? billing.cancel_at_period_end ?? false),
    },
    entitlements: {
      ...DEFAULT_BILLING_STATUS.entitlements,
      ...entitlements,
    },
    limits: {
      ...DEFAULT_BILLING_STATUS.limits,
      ...limits,
    },
    isAdmin: Boolean(payload.is_admin ?? payload.isAdmin ?? false),
    source: payload.source || "api",
    loadedAt: new Date().toISOString(),
    error: "",
    loading: false,
  };
}

export function selectBillingStatus(state = {}) {
  return state.billing && typeof state.billing === "object" ? state.billing : DEFAULT_BILLING_STATUS;
}

export function billingAccessTone(state = {}) {
  const billingState = selectBillingStatus(state);
  const access = String(billingState.billing?.access || "").toLowerCase();
  if (billingState.loading) return "neutral";
  if (billingState.error) return "warning";
  if (access === "restricted") return "blocked";
  if (access === "billing_attention") return "warning";
  if (access === "active") return "ok";
  return "neutral";
}

export function billingAccessLabel(state = {}) {
  const billingState = selectBillingStatus(state);
  if (billingState.loading) return "Comprobando plan";
  if (billingState.error) return "Estado no disponible";
  const access = String(billingState.billing?.access || "").toLowerCase();
  if (access === "restricted") return "Acceso restringido";
  if (access === "billing_attention") return "Pago pendiente";
  if (access === "active") return "Activo";
  if (access === "free") return "Demo / Free";
  if (access === "anonymous") return "Inicia sesión";
  return "Plan disponible";
}

export function isBillingRestricted(state = {}) {
  return String(selectBillingStatus(state).billing?.access || "").toLowerCase() === "restricted";
}

export function isBillingAttention(state = {}) {
  return String(selectBillingStatus(state).billing?.access || "").toLowerCase() === "billing_attention";
}

export async function refreshBillingStatus(store, { silent = false } = {}) {
  const state = store.getState();
  if (state.auth?.status !== "authenticated") {
    store.setState((current) => ({
      ...current,
      billing: {
        ...DEFAULT_BILLING_STATUS,
        loadedAt: new Date().toISOString(),
        source: "anonymous",
      },
    }));
    return { ok: true, authRequired: true };
  }

  const url = resolveBillingStatusUrl();
  if (!url) {
    store.setState((current) => ({
      ...current,
      billing: {
        ...selectBillingStatus(current),
        loading: false,
        error: "missing_api_base_url",
      },
    }));
    return { ok: false, reason: "missing_api_base_url" };
  }

  if (!silent) {
    store.setState((current) => ({
      ...current,
      billing: {
        ...selectBillingStatus(current),
        loading: true,
        error: "",
      },
    }));
  }

  try {
    const response = await fetch(url, { headers: buildAuthHeaders(store.getState()) });
    const payload = await response.json();
    if (!response.ok || payload?.ok === false) {
      const reason = payload?.reason || `http_${response.status}`;
      store.setState((current) => ({
        ...current,
        billing: {
          ...selectBillingStatus(current),
          loading: false,
          error: reason,
        },
      }));
      return { ok: false, reason };
    }
    const normalized = normalizeBillingStatus(payload);
    store.setState((current) => ({
      ...current,
      billing: normalized,
      auth: {
        ...(current.auth || {}),
        user: {
          ...(current.auth?.user || {}),
          is_admin: current.auth?.user?.is_admin === true || normalized.isAdmin,
          role: normalized.isAdmin ? "admin" : current.auth?.user?.role || "user",
        },
      },
    }));
    return { ok: true, billing: normalized };
  } catch (error) {
    console.warn("[KMFX][BILLING] status fetch failed", error);
    store.setState((current) => ({
      ...current,
      billing: {
        ...selectBillingStatus(current),
        loading: false,
        error: "network_error",
      },
    }));
    return { ok: false, reason: "network_error" };
  }
}

export function initBillingStatus(store) {
  let lastAuthSignature = "";
  const syncForAuth = () => {
    const nextSignature = authSignature(store.getState());
    if (nextSignature === lastAuthSignature) return;
    lastAuthSignature = nextSignature;
    refreshBillingStatus(store, { silent: false });
  };

  syncForAuth();
  store.subscribe(syncForAuth);
  window.addEventListener("kmfx:billing-refresh", () => {
    refreshBillingStatus(store, { silent: false });
  });

  window.kmfxBilling = {
    refresh: () => refreshBillingStatus(store, { silent: false }),
    getStatus: () => selectBillingStatus(store.getState()),
  };
}
