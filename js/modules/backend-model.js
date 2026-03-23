const nowIso = () => new Date().toISOString();

export const BACKEND_ENTITIES = {
  users: {
    table: "users",
    primaryKey: "id",
    fields: {
      id: "uuid",
      email: "text",
      auth_provider: "text",
      auth_provider_user_id: "text|null",
      created_at: "timestamptz",
      updated_at: "timestamptz",
      last_login_at: "timestamptz|null"
    }
  },
  user_profiles: {
    table: "user_profiles",
    primaryKey: "id",
    fields: {
      id: "uuid",
      display_name: "text",
      email: "text|null",
      avatar_url: "text|null",
      avatar_initials: "text",
      discord: "text|null",
      default_account_id: "uuid|null",
      created_at: "timestamptz",
      updated_at: "timestamptz"
    }
  },
  user_preferences: {
    table: "user_preferences",
    primaryKey: "user_id",
    fields: {
      user_id: "uuid",
      theme: "text",
      visual_density: "text",
      default_landing_page: "text",
      default_account_id: "uuid|null",
      base_currency: "text",
      timezone: "text",
      favorite_pairs: "jsonb",
      trading_style: "text|null",
      primary_session: "text|null",
      chart_preference: "text",
      show_advanced_metrics: "boolean",
      show_risk_alerts: "boolean",
      bridge_url: "text|null",
      refresh_interval: "integer",
      created_at: "timestamptz",
      updated_at: "timestamptz"
    }
  },
  trading_accounts: {
    table: "trading_accounts",
    primaryKey: "id",
    fields: {
      id: "uuid",
      user_id: "uuid",
      external_account_id: "text|null",
      broker_name: "text|null",
      platform_type: "text",
      source_type: "text",
      account_name: "text",
      account_type: "text",
      base_currency: "text",
      is_default: "boolean",
      is_archived: "boolean",
      connection_status: "text",
      metadata: "jsonb",
      created_at: "timestamptz",
      updated_at: "timestamptz",
      last_synced_at: "timestamptz|null"
    }
  },
  calculator_presets: {
    table: "calculator_presets",
    primaryKey: "id",
    fields: {
      id: "uuid",
      user_id: "uuid",
      trading_account_id: "uuid|null",
      preset_key: "text",
      label: "text",
      risk_percent: "numeric",
      position_size_mode: "text|null",
      stop_loss_pips: "numeric|null",
      take_profit_pips: "numeric|null",
      metadata: "jsonb",
      created_at: "timestamptz",
      updated_at: "timestamptz"
    }
  },
  risk_rules: {
    table: "risk_rules",
    primaryKey: "user_id",
    fields: {
      user_id: "uuid",
      trading_account_id: "uuid|null",
      alert_drawdown: "boolean",
      alert_streaks: "boolean",
      alert_win_rate: "boolean",
      alert_overtrading: "boolean",
      risk_guidance_enabled: "boolean",
      auto_block_opt_in: "boolean",
      default_risk: "numeric|null",
      daily_drawdown_limit: "numeric|null",
      max_drawdown_limit: "numeric|null",
      max_trade_risk_percent: "numeric|null",
      metadata: "jsonb",
      created_at: "timestamptz",
      updated_at: "timestamptz"
    }
  },
  dashboard_objectives: {
    table: "dashboard_objectives",
    primaryKey: "id",
    fields: {
      id: "uuid",
      user_id: "uuid",
      trading_account_id: "uuid|null",
      metric_key: "text",
      label: "text",
      target_value: "numeric",
      comparison_mode: "text",
      timeframe: "text",
      is_active: "boolean",
      metadata: "jsonb",
      created_at: "timestamptz",
      updated_at: "timestamptz"
    }
  }
};

export const BACKEND_RELATIONSHIPS = [
  "users 1:1 user_profiles",
  "users 1:1 user_preferences",
  "users 1:N trading_accounts",
  "users 1:N calculator_presets",
  "users 1:N risk_rules",
  "users 1:N dashboard_objectives",
  "trading_accounts 1:N calculator_presets",
  "trading_accounts 1:N risk_rules",
  "trading_accounts 1:N dashboard_objectives"
];

export const DERIVED_DATA_BOUNDARIES = {
  authenticatedUser: [
    "users",
    "user_profiles",
    "user_preferences"
  ],
  tradingAccountState: [
    "trading_accounts",
    "risk_rules",
    "calculator_presets",
    "dashboard_objectives"
  ],
  derivedAnalytics: [
    "equity curves",
    "performance ratios",
    "session analysis",
    "calendar heatmaps",
    "risk score",
    "decision engine outputs"
  ]
};

function normalizeFavoriteSymbols(raw = "") {
  return String(raw || "")
    .split(/[·,]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function buildUserRecord(auth = {}) {
  return {
    id: auth.user?.id || null,
    email: auth.user?.email || null,
    auth_provider: auth.provider || auth.user?.provider || "local",
    auth_provider_user_id: auth.user?.id || null,
    created_at: nowIso(),
    updated_at: nowIso(),
    last_login_at: auth.session?.accessToken ? nowIso() : null
  };
}

export function buildUserProfileRecord(auth = {}, preferences = {}) {
  return {
    id: auth.user?.id || null,
    display_name: auth.user?.name || null,
    email: auth.user?.email || null,
    avatar_url: auth.user?.avatar || null,
    avatar_initials: auth.user?.initials || null,
    discord: auth.profile?.discord || null,
    default_account_id: auth.profile?.defaultAccount || null,
    created_at: nowIso(),
    updated_at: nowIso()
  };
}

export function buildUserPreferencesRecord(auth = {}, preferences = {}) {
  return {
    user_id: auth.user?.id || null,
    theme: preferences.theme || "dark",
    visual_density: preferences.density || "comfortable",
    default_landing_page: preferences.landingPage || "dashboard",
    default_account_id: preferences.dashboardAccount || auth.profile?.defaultAccount || null,
    base_currency: preferences.baseCurrency || "USD",
    timezone: preferences.timezone || "Europe/Andorra",
    favorite_pairs: normalizeFavoriteSymbols(preferences.favorites),
    trading_style: preferences.style || null,
    primary_session: preferences.primarySession || null,
    chart_preference: preferences.chartPreference || "balanced",
    show_advanced_metrics: Boolean(preferences.showAdvancedMetrics),
    show_risk_alerts: Boolean(preferences.showRiskAlerts),
    bridge_url: preferences.bridgeUrl || null,
    refresh_interval: Number(preferences.refreshInterval || 5),
    created_at: nowIso(),
    updated_at: nowIso()
  };
}

export function buildTradingAccountsRecords(state = {}) {
  return Object.values(state.accounts || {}).map((account) => ({
    id: account.id,
    user_id: state.auth?.user?.id || null,
    external_account_id: account.login || account.id,
    broker_name: account.broker || null,
    platform_type: account.platform || "mt5-ready",
    source_type: account.sourceType || "mock",
    account_name: account.name,
    account_type: account.mode || "principal",
    base_currency: account.currency || "USD",
    is_default: account.id === (state.auth?.profile?.defaultAccount || state.currentAccount),
    is_archived: false,
    connection_status: account.connection?.state || "disconnected",
    metadata: {
      compliance: account.compliance || null,
      challengeStage: account.challengeStage || null
    },
    created_at: nowIso(),
    updated_at: nowIso(),
    last_synced_at: account.connection?.lastSync || null
  }));
}

export function buildCalculatorPresetRecord(state = {}, preferences = {}) {
  return {
    id: `preset:${state.auth?.user?.id || "local"}:${preferences.calculatorPreset || "standard"}`,
    user_id: state.auth?.user?.id || null,
    trading_account_id: preferences.dashboardAccount || state.currentAccount || null,
    preset_key: preferences.calculatorPreset || "standard",
    label: "Preset principal",
    risk_percent: numberOrNull(preferences.defaultRisk),
    position_size_mode: "manual",
    stop_loss_pips: null,
    take_profit_pips: null,
    metadata: {
      base_currency: preferences.baseCurrency || "USD"
    },
    created_at: nowIso(),
    updated_at: nowIso()
  };
}

export function buildRiskRulesRecord(state = {}, preferences = {}) {
  const currentAccountId = preferences.dashboardAccount || state.currentAccount || null;
  return {
    user_id: state.auth?.user?.id || null,
    trading_account_id: currentAccountId,
    alert_drawdown: Boolean(preferences.alertDrawdown),
    alert_streaks: Boolean(preferences.alertStreaks),
    alert_win_rate: Boolean(preferences.alertWinRate),
    alert_overtrading: Boolean(preferences.alertOvertrading),
    risk_guidance_enabled: Boolean(preferences.riskGuidanceEnabled),
    auto_block_opt_in: Boolean(preferences.autoBlockOptIn),
    default_risk: numberOrNull(preferences.defaultRisk),
    daily_drawdown_limit: numberOrNull(preferences.dailyDrawdownLimit),
    max_drawdown_limit: numberOrNull(preferences.maxDrawdownLimit),
    max_trade_risk_percent: numberOrNull(state.accounts?.[currentAccountId]?.model?.riskProfile?.maxTradeRiskPct),
    metadata: {},
    created_at: nowIso(),
    updated_at: nowIso()
  };
}

export function buildDashboardObjectivesRecords(state = {}, preferences = {}) {
  const currentAccountId = preferences.dashboardAccount || state.currentAccount || null;
  const objectives = state.workspace?.talent?.scorecards || [];
  return objectives.map((goal, index) => ({
    id: `objective:${state.auth?.user?.id || "local"}:${currentAccountId || "default"}:${goal.metric || index}`,
    user_id: state.auth?.user?.id || null,
    trading_account_id: currentAccountId,
    metric_key: goal.metric || `metric_${index}`,
    label: goal.label || goal.metric || `Objetivo ${index + 1}`,
    target_value: numberOrNull(goal.target),
    comparison_mode: goal.comparison || "gte",
    timeframe: goal.timeframe || "rolling",
    is_active: goal.isActive !== false,
    metadata: {
      current: goal.current ?? null,
      tone: goal.tone || null
    },
    created_at: nowIso(),
    updated_at: nowIso()
  }));
}

export function buildBackendPersistenceSnapshot({ auth, preferences, state }) {
  return {
    users: [buildUserRecord(auth)],
    user_profiles: [buildUserProfileRecord(auth, preferences)],
    user_preferences: [buildUserPreferencesRecord(auth, preferences)],
    trading_accounts: buildTradingAccountsRecords(state),
    calculator_presets: [buildCalculatorPresetRecord(state, preferences)],
    risk_rules: [buildRiskRulesRecord(state, preferences)],
    dashboard_objectives: buildDashboardObjectivesRecords(state, preferences)
  };
}

export const FRONTEND_TO_BACKEND_MAPPING = {
  profile: {
    name: "user_profiles.display_name",
    email: "users.email / user_profiles.email",
    initials: "user_profiles.avatar_initials",
    discord: "user_profiles.discord",
    defaultAccount: "user_profiles.default_account_id / user_preferences.default_account_id"
  },
  preferences: {
    favorites: "user_preferences.favorite_pairs",
    style: "user_preferences.trading_style",
    primarySession: "user_preferences.primary_session",
    baseCurrency: "user_preferences.base_currency",
    timezone: "user_preferences.timezone",
    theme: "user_preferences.theme",
    density: "user_preferences.visual_density",
    landingPage: "user_preferences.default_landing_page",
    dashboardAccount: "user_preferences.default_account_id",
    chartPreference: "user_preferences.chart_preference",
    showAdvancedMetrics: "user_preferences.show_advanced_metrics",
    showRiskAlerts: "user_preferences.show_risk_alerts",
    bridgeUrl: "user_preferences.bridge_url",
    refreshInterval: "user_preferences.refresh_interval",
    calculatorPreset: "calculator_presets.preset_key",
    defaultRisk: "risk_rules.default_risk",
    alertDrawdown: "risk_rules.alert_drawdown",
    alertStreaks: "risk_rules.alert_streaks",
    alertWinRate: "risk_rules.alert_win_rate",
    alertOvertrading: "risk_rules.alert_overtrading",
    riskGuidanceEnabled: "risk_rules.risk_guidance_enabled",
    autoBlockOptIn: "risk_rules.auto_block_opt_in",
    dailyDrawdownLimit: "risk_rules.daily_drawdown_limit",
    maxDrawdownLimit: "risk_rules.max_drawdown_limit"
  }
};
