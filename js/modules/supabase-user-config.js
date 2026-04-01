import { supabase } from "../lib/supabase.js?v=build-20260401-203500";
import { mergeAuthProfile } from "./auth-session.js?v=build-20260401-203500";

export const SETTINGS_PREFS_STORAGE_KEY = "kmfx.settings.preferences";

export const DEFAULT_SETTINGS_PREFERENCES = {
  favorites: "EURUSD · XAUUSD · NAS100",
  style: "Intradía",
  primarySession: "London",
  defaultRisk: "0.45",
  baseCurrency: "USD",
  timezone: "Europe/Andorra",
  theme: "dark",
  density: "comfortable",
  landingPage: "dashboard",
  dashboardAccount: "sandbox",
  chartPreference: "balanced",
  calculatorPreset: "standard",
  showAdvancedMetrics: true,
  showRiskAlerts: true,
  alertDrawdown: true,
  alertStreaks: true,
  alertWinRate: true,
  alertOvertrading: true,
  riskGuidanceEnabled: true,
  autoBlockOptIn: false,
  dailyDrawdownLimit: "1.2",
  maxDrawdownLimit: "10",
  bridgeUrl: "ws://localhost:8080/bridge",
  refreshInterval: "5"
};

function safeGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // noop
  }
}

function parseStoredPreferences() {
  const raw = safeGet(SETTINGS_PREFS_STORAGE_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS_PREFERENCES };
  try {
    return { ...DEFAULT_SETTINGS_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS_PREFERENCES };
  }
}

function splitFavorites(raw = "") {
  return String(raw || "")
    .split(/[·,]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinFavorites(list = []) {
  return Array.isArray(list) ? list.filter(Boolean).join(" · ") : DEFAULT_SETTINGS_PREFERENCES.favorites;
}

function toNullableNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function asUuidOrNull(value) {
  const normalized = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

export function readLocalPreferences() {
  return parseStoredPreferences();
}

export function persistLocalPreferences(preferences) {
  const next = { ...DEFAULT_SETTINGS_PREFERENCES, ...(preferences || {}) };
  safeSet(SETTINGS_PREFS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function fetchSupabaseUserConfig(authState) {
  const userId = authState?.user?.id;
  if (!userId) return { ok: true, data: null };

  const [profileResult, preferencesResult, riskRulesResult, presetResult, objectivesResult] = await Promise.allSettled([
    supabase.from("user_profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("user_preferences").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("risk_rules").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("calculator_presets").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("dashboard_objectives").select("*").eq("user_id", userId)
  ]);

  const profileError = profileResult.status === "rejected" ? profileResult.reason : profileResult.value?.error;
  const preferencesError = preferencesResult.status === "rejected" ? preferencesResult.reason : preferencesResult.value?.error;
  if (profileError || preferencesError) {
    console.error("[KMFX][SUPABASE] config fetch failed", profileError || preferencesError);
    return { ok: false, error: profileError || preferencesError };
  }

  const warnings = [riskRulesResult, presetResult, objectivesResult]
    .map((result) => (result.status === "rejected" ? result.reason : result.value?.error))
    .filter(Boolean);

  console.info("[KMFX][SUPABASE] fetched user config", {
    userId,
    profileResult,
    preferencesResult,
    riskRulesResult,
    presetResult,
    objectivesResult
  });

  return {
    ok: true,
    data: {
      profile: profileResult.value.data || null,
      preferences: preferencesResult.value.data || null,
      riskRules: riskRulesResult.status === "fulfilled" ? riskRulesResult.value.data || null : null,
      calculatorPreset: presetResult.status === "fulfilled" ? presetResult.value.data || null : null,
      objectives: objectivesResult.status === "fulfilled" ? objectivesResult.value.data || [] : []
    },
    warnings
  };
}

export function mergeRemoteConfigIntoAuth(authState, remoteData) {
  if (!remoteData) return authState;
  return mergeAuthProfile(authState, {
    user: {
      name: pickFirst(remoteData.profile?.display_name, authState?.user?.name),
      email: authState?.user?.email,
      avatar: pickFirst(remoteData.profile?.avatar_url, authState?.user?.avatar),
      initials: pickFirst(remoteData.profile?.avatar_initials, remoteData.profile?.initials, authState?.user?.initials)
    },
    profile: {
      discord: pickFirst(remoteData.profile?.discord, remoteData.profile?.discord_handle, authState?.profile?.discord),
      defaultAccount: pickFirst(
        asUuidOrNull(remoteData.profile?.default_account_id),
        asUuidOrNull(remoteData.preferences?.default_account_id),
        asUuidOrNull(remoteData.preferences?.default_trading_account_id),
        authState?.profile?.defaultAccount
      )
    }
  });
}

export function mergeRemoteConfigIntoPreferences(currentPreferences, remoteData, authState) {
  const next = {
    ...DEFAULT_SETTINGS_PREFERENCES,
    ...(currentPreferences || {})
  };

  if (!remoteData) return next;

  if (remoteData.profile) {
    next.dashboardAccount = pickFirst(
      asUuidOrNull(remoteData.profile.default_account_id),
      next.dashboardAccount,
      authState?.profile?.defaultAccount
    );
  }

  if (remoteData.preferences) {
    next.favorites = joinFavorites(pickFirst(remoteData.preferences.favorite_pairs, remoteData.preferences.favorite_symbols, []));
    next.style = pickFirst(remoteData.preferences.trading_style, next.style);
    next.primarySession = pickFirst(remoteData.preferences.primary_session, next.primarySession);
    next.baseCurrency = pickFirst(remoteData.preferences.base_currency, next.baseCurrency);
    next.timezone = pickFirst(remoteData.preferences.timezone, next.timezone);
    next.theme = pickFirst(remoteData.preferences.theme, next.theme);
    next.density = pickFirst(remoteData.preferences.visual_density, remoteData.preferences.density, next.density);
    next.landingPage = pickFirst(remoteData.preferences.default_landing_page, remoteData.preferences.landing_page, next.landingPage);
    next.dashboardAccount = pickFirst(
      asUuidOrNull(remoteData.preferences.default_trading_account_id),
      next.dashboardAccount,
      authState?.profile?.defaultAccount
    );
    next.chartPreference = pickFirst(remoteData.preferences.chart_preference, next.chartPreference);
    next.showAdvancedMetrics = remoteData.preferences.show_advanced_metrics ?? next.showAdvancedMetrics;
    next.showRiskAlerts = remoteData.preferences.show_risk_alerts ?? next.showRiskAlerts;
    next.bridgeUrl = pickFirst(remoteData.preferences.bridge_url, next.bridgeUrl);
    next.refreshInterval = String(pickFirst(remoteData.preferences.refresh_interval, remoteData.preferences.refresh_interval_seconds, next.refreshInterval));
  }

  if (remoteData.riskRules) {
    next.defaultRisk = String(pickFirst(remoteData.riskRules.default_risk, remoteData.riskRules.default_risk_percent, next.defaultRisk));
    next.alertDrawdown = remoteData.riskRules.alert_drawdown ?? remoteData.riskRules.alerts_drawdown ?? next.alertDrawdown;
    next.alertStreaks = remoteData.riskRules.alert_streaks ?? remoteData.riskRules.alerts_streaks ?? next.alertStreaks;
    next.alertWinRate = remoteData.riskRules.alert_win_rate ?? remoteData.riskRules.alerts_win_rate ?? next.alertWinRate;
    next.alertOvertrading = remoteData.riskRules.alert_overtrading ?? remoteData.riskRules.alerts_overtrading ?? next.alertOvertrading;
    next.riskGuidanceEnabled = remoteData.riskRules.risk_guidance_enabled ?? next.riskGuidanceEnabled;
    next.autoBlockOptIn = remoteData.riskRules.auto_block_opt_in ?? remoteData.riskRules.auto_block_enabled ?? next.autoBlockOptIn;
    next.dailyDrawdownLimit = String(pickFirst(remoteData.riskRules.daily_drawdown_limit, remoteData.riskRules.daily_drawdown_limit_percent, next.dailyDrawdownLimit));
    next.maxDrawdownLimit = String(pickFirst(remoteData.riskRules.max_drawdown_limit, remoteData.riskRules.max_drawdown_limit_percent, next.maxDrawdownLimit));
  }

  if (remoteData.calculatorPreset) {
    next.calculatorPreset = remoteData.calculatorPreset.preset_key || next.calculatorPreset;
    next.defaultRisk = String(remoteData.calculatorPreset.risk_percent ?? next.defaultRisk);
  }

  return next;
}

export async function saveSupabaseUserConfig({ auth, profile, preferences }) {
  const userId = auth?.user?.id;
  if (!userId) {
    return { ok: false, error: new Error("No hay usuario autenticado.") };
  }

  let authEmailUpdate = null;
  const targetEmail = String(profile.email || "").trim().toLowerCase();
  const currentEmail = String(auth.user?.email || "").trim().toLowerCase();
  if (targetEmail && targetEmail !== currentEmail) {
    authEmailUpdate = await supabase.auth.updateUser({ email: targetEmail });
    if (authEmailUpdate.error) {
      return { ok: false, error: authEmailUpdate.error };
    }
  }

  const profileRow = {
    id: userId,
    display_name: profile.name,
    email: targetEmail || currentEmail || null,
    avatar_url: auth.user?.avatar || null,
    avatar_initials: profile.initials,
    discord: profile.discord,
    default_account_id: asUuidOrNull(profile.defaultAccount)
  };

  const preferencesRow = {
    user_id: userId,
    theme: preferences.theme,
    visual_density: preferences.density,
    default_landing_page: preferences.landingPage,
    base_currency: preferences.baseCurrency,
    timezone: preferences.timezone,
    favorite_pairs: splitFavorites(preferences.favorites),
    trading_style: preferences.style,
    primary_session: preferences.primarySession,
    chart_preference: preferences.chartPreference,
    show_advanced_metrics: Boolean(preferences.showAdvancedMetrics),
    show_risk_alerts: Boolean(preferences.showRiskAlerts),
    bridge_url: preferences.bridgeUrl || null,
    refresh_interval: Number(preferences.refreshInterval || 5)
  };

  const riskRuleRow = {
    user_id: userId,
    alert_drawdown: Boolean(preferences.alertDrawdown),
    alert_streaks: Boolean(preferences.alertStreaks),
    alert_win_rate: Boolean(preferences.alertWinRate),
    alert_overtrading: Boolean(preferences.alertOvertrading),
    risk_guidance_enabled: Boolean(preferences.riskGuidanceEnabled),
    auto_block_opt_in: Boolean(preferences.autoBlockOptIn),
    default_risk: toNullableNumber(preferences.defaultRisk),
    daily_drawdown_limit: toNullableNumber(preferences.dailyDrawdownLimit),
    max_drawdown_limit: toNullableNumber(preferences.maxDrawdownLimit)
  };

  console.info("[KMFX][SUPABASE] saving user config", {
    userId,
    profileRow,
    preferencesRow,
    riskRuleRow
  });

  const [profileSave, preferencesSave, riskSave] = await Promise.all([
    supabase.from("user_profiles").upsert(profileRow, { onConflict: "id" }).select().maybeSingle(),
    supabase.from("user_preferences").upsert(preferencesRow, { onConflict: "user_id" }).select().maybeSingle(),
    supabase.from("risk_rules").upsert(riskRuleRow, { onConflict: "user_id" }).select().maybeSingle()
  ]);

  console.info("[KMFX][SUPABASE] save responses", {
    profileSave,
    preferencesSave,
    riskSave
  });

  const requiredError = profileSave.error || preferencesSave.error || riskSave.error;
  if (requiredError) {
    console.error("[KMFX][SUPABASE] required config save failed", {
      code: requiredError.code,
      message: requiredError.message,
      details: requiredError.details,
      hint: requiredError.hint,
      raw: requiredError
    });
    return {
      ok: false,
      error: requiredError,
      responses: {
        profileSave,
        preferencesSave,
        riskSave
      }
    };
  }

  persistLocalPreferences(preferences);

  const warnings = [
    {
      table: "calculator_presets",
      reason: "Skipped until the current UI exposes a schema-complete preset payload (for example preset_name)."
    }
  ];
  console.warn("[KMFX][SUPABASE] optional config save warnings", warnings);

  if (!preferencesSave.data) {
    console.warn("[KMFX][SUPABASE] user_preferences upsert returned no row", {
      userId,
      preferencesRow,
      preferencesSave
    });
  }

  return {
    ok: true,
    data: {
      profile: profileSave.data || profileRow,
      preferences: preferencesSave.data || preferencesRow,
      riskRules: riskSave.data || riskRuleRow,
      calculatorPreset: null,
      objectives: []
    },
    authEmailUpdate,
    warnings,
    responses: {
      profileSave,
      preferencesSave,
      riskSave
    }
  };
}
