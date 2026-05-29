import type { WorkspaceState } from "@/lib/contracts/workspace-state";

export type SettingsOverviewCard = {
  label: string;
  value: string;
  note: string;
};

export type SettingsPreference = {
  label: string;
  value: string;
  note: string;
  control: "select" | "switch";
  enabled: boolean;
  options?: string[];
};

export type SettingsHelpLink = {
  label: string;
  note: string;
  href: string;
  kind: "help" | "legal";
};

export type SettingsProfile = {
  displayName: string;
  email: string | null;
  role: string;
  initials: string;
  activeAccountLabel: string;
  activeAccountMeta: string;
};

export type SettingsPlan = {
  name: string;
  priceLabel: string;
  statusLabel: string;
  statusTone: "ready" | "attention";
  intervalLabel: string;
  includedAccountsLabel: string;
  usedAccountsLabel: string;
  usagePercent: number;
  accountNote: string;
  renewalLabel: string;
  managementNote: string;
  managementReady: boolean;
  primaryActionLabel: string;
  metrics: SettingsOverviewCard[];
  paymentRows: SettingsStatusRow[];
  options: SettingsPlanOption[];
};

export type SettingsStatusRow = {
  label: string;
  value: string;
  note: string;
  tone: "ready" | "attention" | "locked";
};

export type SettingsPlanOption = {
  key: "core" | "pro" | "unlimited";
  name: string;
  priceLabel: string;
  yearlyLabel: string;
  accountLimitLabel: string;
  recommendedFor: string;
  features: string[];
  current: boolean;
};

export type SettingsOverview = {
  status: "ready" | "attention" | "empty";
  connectedCount: number;
  limitedCount: number;
  accountCount: number;
  profile: SettingsProfile;
  preferences: SettingsPreference[];
  helpLinks: SettingsHelpLink[];
  accountRows: SettingsOverviewCard[];
  safetyRows: SettingsStatusRow[];
  plan: SettingsPlan;
};

export function getSettingsOverview(workspace: WorkspaceState): SettingsOverview {
  const accountCount = workspace.accounts.length;
  const connectedCount = workspace.accounts.filter(
    (account) => account.connectionTone === "connected",
  ).length;
  const limitedCount = workspace.accounts.filter(
    (account) => account.planAccess === "limited",
  ).length;
  const hasAttention = limitedCount > 0 || connectedCount < accountCount;
  const activeAccount =
    workspace.accounts.find((account) => account.id === workspace.activeAccountId) ??
    workspace.accounts[0] ??
    null;
  const plan =
    limitedCount > 0 || accountCount <= 2
      ? {
          name: "Edge Basic",
          key: "core" as const,
          priceLabel: "15 EUR/mes",
          yearlyLabel: "150 EUR/año",
          includedAccounts: 2,
        }
      : accountCount <= 5
        ? {
            name: "Edge Pro",
            key: "pro" as const,
            priceLabel: "25 EUR/mes",
            yearlyLabel: "250 EUR/año",
            includedAccounts: 5,
          }
        : {
            name: "Edge Unlimited",
            key: "unlimited" as const,
            priceLabel: "39 EUR/mes",
            yearlyLabel: "390 EUR/año",
            includedAccounts: null,
          };
  const includedAccountsLabel =
    plan.includedAccounts === null ? "Ilimitadas" : String(plan.includedAccounts);
  const usedAccountsLabel = String(accountCount);
  const usagePercent =
    plan.includedAccounts === null
      ? 100
      : Math.min(100, Math.round((accountCount / Math.max(1, plan.includedAccounts)) * 100));
  const planStatusLabel = limitedCount > 0 ? "Revisar límite" : "Activo";
  const planOptions: SettingsPlanOption[] = [
    {
      key: "core",
      name: "Edge Basic",
      priceLabel: "15 EUR/mes",
      yearlyLabel: "150 EUR/año",
      accountLimitLabel: "2 cuentas MT5",
      recommendedFor: "Trader individual",
      features: ["Dashboard y riesgo base", "Trades y calendario", "Conexión MT5"],
      current: plan.key === "core",
    },
    {
      key: "pro",
      name: "Edge Pro",
      priceLabel: "25 EUR/mes",
      yearlyLabel: "250 EUR/año",
      accountLimitLabel: "5 cuentas MT5",
      recommendedFor: "Trader activo o fondeo",
      features: ["Riesgo avanzado", "Analytics completos", "Journal y playbooks"],
      current: plan.key === "pro",
    },
    {
      key: "unlimited",
      name: "Edge Unlimited",
      priceLabel: "39 EUR/mes",
      yearlyLabel: "390 EUR/año",
      accountLimitLabel: "Cuentas ilimitadas",
      recommendedFor: "Multi-cuenta avanzado",
      features: ["Acceso completo", "Exports y diagnóstico avanzado", "Soporte prioritario"],
      current: plan.key === "unlimited",
    },
  ];

  return {
    status: accountCount === 0 ? "empty" : hasAttention ? "attention" : "ready",
    connectedCount,
    limitedCount,
    accountCount,
    profile: {
      displayName: "Usuario KMFX",
      email: null,
      role: "Propietario",
      initials: "KM",
      activeAccountLabel: activeAccount?.label ?? "Sin cuenta activa",
      activeAccountMeta: activeAccount
        ? `${activeAccount.broker} / ${activeAccount.server}`
        : "Conecta una cuenta para ver su contexto",
    },
    accountRows: [
      {
        label: "Cuenta activa",
        value: activeAccount?.label ?? "Sin cuenta",
        note: activeAccount
          ? `${activeAccount.broker} / ${activeAccount.login}`
          : "Aún no hay cuenta visible",
      },
      {
        label: "Plan actual",
        value: plan.name,
        note: limitedCount > 0 ? "Revisa el límite de cuentas" : "Acceso preparado",
      },
      {
        label: "Cuentas MT5",
        value: `${accountCount}`,
        note:
          plan.includedAccounts === null
            ? "Sin límite operativo de plan"
            : `${plan.includedAccounts} incluidas en el plan`,
      },
    ],
    preferences: [
      {
        label: "Idioma",
        value: "Español",
        note: "Interfaz principal",
        control: "select",
        enabled: true,
        options: ["Español", "English"],
      },
      {
        label: "Tema",
        value: "Oscuro",
        note: "Diseño operativo actual",
        control: "select",
        enabled: true,
        options: ["Oscuro", "Claro", "Sistema"],
      },
      {
        label: "Formato monetario",
        value: "USD",
        note: "Moneda base de la cuenta activa",
        control: "select",
        enabled: true,
        options: ["USD", "EUR", "GBP"],
      },
      {
        label: "Zona horaria",
        value: "Europe/Madrid",
        note: "Calendario y sesiones",
        control: "select",
        enabled: true,
        options: ["Europe/Madrid", "UTC", "America/New_York"],
      },
      {
        label: "Avisos visuales",
        value: "Activados",
        note: "Preparados para alertas en pantalla",
        control: "switch",
        enabled: true,
      },
    ],
    helpLinks: [
      {
        label: "Soporte",
        note: "Contacto y ayuda operativa.",
        href: "https://kmfxedge.com/support",
        kind: "help",
      },
      {
        label: "Términos",
        note: "Condiciones de uso.",
        href: "https://kmfxedge.com/terms",
        kind: "legal",
      },
      {
        label: "Privacidad",
        note: "Tratamiento de datos y sincronizaciones.",
        href: "https://kmfxedge.com/privacy",
        kind: "legal",
      },
      {
        label: "Reembolsos",
        note: "Política comercial y devoluciones.",
        href: "https://kmfxedge.com/refunds",
        kind: "legal",
      },
    ],
    safetyRows: [
      {
        label: "Sesión",
        value: "Preparada",
        note: "El cierre de sesión queda bloqueado hasta conectar sesión segura",
        tone: "locked",
      },
      {
        label: "Pagos",
        value: "Portal seguro",
        note: "Checkout y portal requieren sesión Supabase activa",
        tone: "ready",
      },
      {
        label: "Datos sensibles",
        value: "Sin exposición",
        note: "Oculta tokens, claves e identificadores privados",
        tone: "ready",
      },
    ],
    plan: {
      name: plan.name,
      priceLabel: plan.priceLabel,
      statusLabel: planStatusLabel,
      statusTone: limitedCount > 0 ? "attention" : "ready",
      intervalLabel: "Mensual",
      includedAccountsLabel,
      usedAccountsLabel,
      usagePercent,
      accountNote:
        limitedCount > 0
          ? "Hay cuentas por encima del límite visible."
          : "Cuentas dentro del plan.",
      renewalLabel:
        limitedCount > 0
          ? "Reduce cuentas activas o sube de plan."
          : "Renovación mensual preparada.",
      managementNote: "Checkout y portal se abren desde sesión segura.",
      managementReady: true,
      primaryActionLabel: limitedCount > 0 ? "Revisar plan" : "Gestionar plan",
      metrics: [
        {
          label: "Plan",
          value: plan.name,
          note: plan.priceLabel,
        },
        {
          label: "Cuentas",
          value: `${usedAccountsLabel}/${includedAccountsLabel}`,
          note:
            plan.includedAccounts === null
              ? "Sin límite operativo"
              : `${Math.max(0, plan.includedAccounts - accountCount)} disponibles`,
        },
        {
          label: "Estado",
          value: planStatusLabel,
          note: limitedCount > 0 ? "Necesita atención" : "Sin acciones urgentes",
        },
      ],
      paymentRows: [
        {
          label: "Método de pago",
          value: "Preparado",
          note: "Se gestionará desde el portal seguro.",
          tone: "locked",
        },
        {
          label: "Facturas",
          value: "Pendiente",
          note: "El historial aparecerá al activar la sesión.",
          tone: "locked",
        },
        {
          label: "Cambios de plan",
          value: "Protegidos",
          note: "Se confirman en Checkout o portal seguro.",
          tone: "ready",
        },
      ],
      options: planOptions,
    },
  };
}
