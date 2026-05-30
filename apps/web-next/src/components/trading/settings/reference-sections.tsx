"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  ExternalLink,
  FileText,
  Globe2,
  LifeBuoy,
  LockKeyhole,
  LogOut,
  Palette,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  UserRound,
  WalletCards,
} from "lucide-react";
import { motion } from "framer-motion";

import { useTheme } from "@/components/app/theme-provider";
import {
  AnimatedGradient,
  type CustomConfig,
} from "@/components/ui/animated-gradient";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import {
  getSettingsOverview,
  type SettingsPlanOption,
} from "@/lib/domain/settings-selectors";
import { cn } from "@/lib/utils";

function PageMotion({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

type PlanGradientTheme = Omit<CustomConfig, "preset" | "speed">;
type PlanOptionKey = SettingsPlanOption["key"];

const PLAN_GRADIENT_THEMES = {
  core: {
    color1: "#060708",
    color2: "#263039",
    color3: "#a7b0b8",
    rotation: 42,
    proportion: 50,
    scale: 0.32,
    distortion: 11,
    swirl: 30,
    swirlIterations: 5,
    softness: 100,
    offset: 20,
    shape: "Checks",
    shapeSize: 58,
  },
  pro: {
    color1: "#04120f",
    color2: "#174338",
    color3: "#c7d85b",
    rotation: -28,
    proportion: 58,
    scale: 0.35,
    distortion: 15,
    swirl: 38,
    swirlIterations: 7,
    softness: 92,
    offset: 110,
    shape: "Edge",
    shapeSize: 46,
  },
  unlimited: {
    color1: "#100609",
    color2: "#4a1725",
    color3: "#f0a35d",
    rotation: 118,
    proportion: 62,
    scale: 0.36,
    distortion: 16,
    swirl: 36,
    swirlIterations: 7,
    softness: 90,
    offset: 230,
    shape: "Stripes",
    shapeSize: 44,
  },
} satisfies Record<string, PlanGradientTheme>;

function planGradientConfigForOption(
  key: keyof typeof PLAN_GRADIENT_THEMES,
  index: number,
): CustomConfig {
  return {
    preset: "custom",
    ...PLAN_GRADIENT_THEMES[key],
    speed: 7 + index * 2,
  };
}

function normalizeBillingPlanKey(value: unknown): PlanOptionKey | null {
  if (value === "core" || value === "pro" || value === "unlimited") {
    return value;
  }

  return null;
}

function billingPlanKeyFromPayload(payload: unknown): PlanOptionKey | null {
  if (!payload || typeof payload !== "object") return null;

  const billing = (payload as { billing?: unknown }).billing;
  if (!billing || typeof billing !== "object") return null;

  const data = billing as {
    effectivePlan?: unknown;
    plan?: unknown;
  };

  return normalizeBillingPlanKey(data.effectivePlan) ?? normalizeBillingPlanKey(data.plan);
}

function includedAccountsLabelForPlan(option: SettingsPlanOption) {
  if (option.key === "unlimited") return "Ilimitadas";
  if (option.key === "pro") return "5";
  return "2";
}

function usagePercentForPlan(option: SettingsPlanOption, accountCount: number) {
  if (option.key === "unlimited") return 100;

  const limit = option.key === "pro" ? 5 : 2;
  return Math.min(100, Math.round((accountCount / Math.max(1, limit)) * 100));
}

function SettingsPreferenceControl({
  preference,
  value,
  onValueChange,
}: {
  preference: ReturnType<typeof getSettingsOverview>["preferences"][number];
  value: string;
  onValueChange: (value: string) => void;
}) {
  if (preference.control === "switch") {
    const checked = value === "Activados";

    return (
      <div className="flex items-center justify-end gap-2">
        <span className="text-sm text-muted-foreground">{value}</span>
        <Switch
          checked={checked}
          disabled={!preference.enabled}
          onCheckedChange={(nextChecked) =>
            onValueChange(nextChecked ? "Activados" : "Desactivados")
          }
        />
      </div>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue) onValueChange(nextValue);
      }}
      disabled={!preference.enabled}
    >
      <SelectTrigger className="w-32 border-border/70 bg-background/40 sm:w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {(preference.options ?? [preference.value]).map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function getProfileInitials(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "KM";

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function themeToPreferenceLabel(theme: "light" | "dark" | "system") {
  if (theme === "light") return "Claro";
  if (theme === "system") return "Sistema";
  return "Oscuro";
}

function preferenceLabelToTheme(value: string) {
  if (value === "Claro") return "light";
  if (value === "Sistema") return "system";
  return "dark";
}

export function SettingsReferenceSection({ workspace }: { workspace: WorkspaceState }) {
  const router = useRouter();
  const { setTheme, theme } = useTheme();
  const settingsOverview = getSettingsOverview(workspace);
  const { profile } = settingsOverview;
  const [profileView, setProfileView] = React.useState({
    displayName: profile.displayName,
    email: profile.email ?? "",
  });
  const [profileDraft, setProfileDraft] = React.useState(profileView);
  const [profileDialogOpen, setProfileDialogOpen] = React.useState(false);
  const [signOutDialogOpen, setSignOutDialogOpen] = React.useState(false);
  const [settingsValues, setSettingsValues] = React.useState(() => {
    const initialValues = Object.fromEntries(
      settingsOverview.preferences.map((preference) => [
        preference.label,
        preference.value,
      ]),
    ) as Record<string, string>;

    initialValues.Tema = themeToPreferenceLabel(theme);

    return initialValues;
  });
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const visibleEmail = profileView.email.trim() || "Email pendiente";
  const profileInitials = getProfileInitials(profileView.displayName);
  const selectedLanguage = settingsValues.Idioma ?? "Español";
  const accessRows = [
    {
      label: "Rol",
      value: profile.role,
      note: "Permisos del perfil",
      icon: ShieldCheck,
    },
    {
      label: "Cuenta activa",
      value: profile.activeAccountLabel,
      note: profile.activeAccountMeta,
      icon: WalletCards,
    },
    {
      label: "Email",
      value: visibleEmail,
      note: "Contacto principal",
      icon: UserRound,
    },
  ];

  React.useEffect(() => {
    document.documentElement.lang = selectedLanguage === "English" ? "en" : "es";
  }, [selectedLanguage]);

  function openProfileDialog() {
    setProfileDraft(profileView);
    setProfileDialogOpen(true);
  }

  function updateSetting(label: string, value: string) {
    setSettingsValues((current) => ({ ...current, [label]: value }));

    if (label === "Tema") {
      setTheme(preferenceLabelToTheme(value));
    }

    setStatusMessage("Preferencia actualizada");
  }

  function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextProfile = {
      displayName: profileDraft.displayName.trim() || profile.displayName,
      email: profileDraft.email.trim(),
    };

    setProfileView(nextProfile);
    setProfileDialogOpen(false);
    setStatusMessage("Perfil actualizado");
  }

  return (
    <PageMotion>
      <div className="grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <Card className="col-span-full border-border/70 bg-card/70">
          <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/50 text-base font-semibold text-foreground">
                {profileInitials}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>Perfil</span>
                  <span className="text-primary">/</span>
                  <span>{profile.role}</span>
                  <span className="text-primary">/</span>
                  <span>{visibleEmail}</span>
                </div>
                <h2 className="mt-1 truncate text-2xl font-semibold tracking-tight text-foreground">
                  {profileView.displayName}
                </h2>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {profile.activeAccountLabel} / {profile.activeAccountMeta}
                </p>
                {statusMessage ? (
                  <p className="mt-2 text-xs text-primary" aria-live="polite">
                    {statusMessage}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <Button variant="outline" onClick={openProfileDialog}>
                <UserRound data-icon="inline-start" />
                Editar perfil
              </Button>
              <Button
                variant="outline"
                className="border-destructive/35 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
                onClick={() => setSignOutDialogOpen(true)}
              >
                <LogOut data-icon="inline-start" />
                Cerrar sesión
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/70">
          <CardHeader>
            <CardTitle>Preferencias</CardTitle>
            <CardDescription>
              Ajustes básicos visibles para esta versión.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border/60 border-y border-border/60">
              {settingsOverview.preferences.map((preference) => {
                const Icon =
                  preference.label === "Idioma"
                    ? Globe2
                    : preference.label === "Tema"
                      ? Palette
                      : preference.label === "Formato monetario"
                        ? CircleDollarSign
                        : preference.label === "Avisos visuales"
                          ? Bell
                          : ShieldCheck;

                return (
                  <div
                    key={preference.label}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{preference.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{preference.note}</p>
                      </div>
                    </div>
                    <SettingsPreferenceControl
                      preference={preference}
                      value={
                        preference.label === "Tema"
                          ? themeToPreferenceLabel(theme)
                          : settingsValues[preference.label] ?? preference.value
                      }
                      onValueChange={(value) => updateSetting(preference.label, value)}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card id="subscription" className="scroll-mt-20 border-border/70 bg-card/70">
          <CardHeader>
            <CardTitle>Acceso</CardTitle>
            <CardDescription>
              Contexto básico de tu sesión.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-3">
              {accessRows.map((row) => {
                const Icon = row.icon;

                return (
                  <div key={row.label} className="flex min-w-0 items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/35">
                      <Icon className="size-4 text-muted-foreground" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs text-muted-foreground">
                        {row.label}
                      </span>
                      <span className="mt-0.5 block truncate font-medium text-foreground">
                        {row.value}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {row.note}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            <Separator />
            <Link
              href="/subscription"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "w-full justify-center bg-background/35",
              )}
            >
              <CreditCard data-icon="inline-start" />
              Ver suscripción
            </Link>
          </CardContent>
        </Card>

        <div className="col-span-full flex flex-col gap-3 rounded-lg border border-border/70 bg-card/45 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-medium text-foreground">Ayuda y legal</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Soporte y documentos públicos de KMFX Edge.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {settingsOverview.helpLinks.map((item) => {
              const Icon = item.kind === "help" ? LifeBuoy : FileText;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "bg-background/35",
                  )}
                >
                  <Icon data-icon="inline-start" />
                  {item.label}
                  <ExternalLink data-icon="inline-end" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={saveProfile} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Editar perfil</DialogTitle>
              <DialogDescription>
                Nombre y email visibles en tu espacio de trabajo.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <Field>
                <FieldLabel htmlFor="settings-profile-name">Nombre</FieldLabel>
                <Input
                  id="settings-profile-name"
                  value={profileDraft.displayName}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="settings-profile-email">Email</FieldLabel>
                <Input
                  id="settings-profile-email"
                  type="email"
                  placeholder="tu@email.com"
                  value={profileDraft.email}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setProfileDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit">Guardar cambios</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={signOutDialogOpen} onOpenChange={setSignOutDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cerrar sesión</DialogTitle>
            <DialogDescription>
              Confirma para salir de este espacio de trabajo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSignOutDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setSignOutDialogOpen(false);
                router.push("/login");
              }}
            >
              Cerrar sesión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageMotion>
  );
}

export function SubscriptionReferenceSection({
  welcome = false,
  workspace,
}: {
  welcome?: boolean;
  workspace: WorkspaceState;
}) {
  const router = useRouter();
  const settingsOverview = getSettingsOverview(workspace);
  const { plan } = settingsOverview;
  const [billingInterval, setBillingInterval] = React.useState<"monthly" | "yearly">(
    "monthly",
  );
  const [billingPlanKey, setBillingPlanKey] = React.useState<PlanOptionKey | null>(
    null,
  );
  const [billingAction, setBillingAction] = React.useState<{
    status: "idle" | "pending" | "success" | "error";
    message: string;
    planKey?: PlanOptionKey;
  }>({
    message: "",
    status: "idle",
  });
  const statusBadgeVariant = plan.statusTone === "ready" ? "secondary" : "destructive";
  const paymentIconByTone = {
    ready: CheckCircle2,
    attention: ReceiptText,
    locked: LockKeyhole,
  } as const;
  const fallbackPlanKey =
    plan.options.find((option) => option.current)?.key ?? plan.options[0]?.key ?? "core";
  const effectivePlanKey = billingPlanKey ?? fallbackPlanKey;
  const planOptions = plan.options.map((option) => ({
    ...option,
    current: option.key === effectivePlanKey,
  }));
  const currentOption =
    planOptions.find((option) => option.current) ??
    (planOptions[0] as SettingsPlanOption);
  const overLimit = plan.statusTone === "attention";
  const includedFeatures = currentOption?.features ?? [];
  const priceForInterval = (option: SettingsPlanOption) =>
    billingInterval === "monthly" ? option.priceLabel : option.yearlyLabel;
  const intervalCaption =
    billingInterval === "monthly" ? "Sin permanencia" : "Dos meses de margen frente al mensual";
  const planDecisionRows = [
    {
      label: "Individual",
      value: "Basic",
      note: "2 cuentas MT5",
    },
    {
      label: "Fondeo activo",
      value: "Pro",
      note: "5 cuentas MT5 y analítica completa",
    },
    {
      label: "Multi-cuenta",
      value: "Unlimited",
      note: "Sin límite operativo y soporte prioritario",
    },
  ];
  const planCardVisuals = {
    core: {
      code: "BASIC",
      signal: "Entrada ordenada",
      capacity: "2 MT5",
    },
    pro: {
      code: "PRO",
      signal: "Mejor equilibrio",
      capacity: "5 MT5",
    },
    unlimited: {
      code: "UNLIMITED",
      signal: "Multi-cuenta",
      capacity: "MT5 ilimitadas",
    },
  } as const;
  const entitlementRows = [
    {
      label: "Cuentas MT5",
      values: planOptions.map((option) => option.accountLimitLabel),
    },
    {
      label: "Riesgo y dashboard",
      values: ["Base operativo", "Avanzado", "Completo"],
    },
    {
      label: "Analytics y journal",
      values: ["Core", "Completo", "Completo"],
    },
    {
      label: "Exports y diagnóstico",
      values: ["No incluido", "Incluido", "Avanzado"],
    },
  ];
  const planChartData = planOptions.map((option) => {
    const priceLabel = billingInterval === "monthly" ? option.priceLabel : option.yearlyLabel;
    const price = Number.parseInt(priceLabel, 10);
    const accountCapacity =
      option.key === "core"
        ? 2
        : option.key === "pro"
          ? 5
          : Math.max(7, settingsOverview.accountCount);

    return {
      key: option.key,
      name: option.name.replace("Edge ", ""),
      price,
      accountCapacity,
      current: option.current,
    };
  });
  const maxChartPrice = Math.max(...planChartData.map((item) => item.price), 1);
  const maxAccountCapacity = Math.max(
    ...planChartData.map((item) => item.accountCapacity),
    1,
  );
  const billingPending = billingAction.status === "pending";
  const billingMessage =
    billingAction.message ||
    (billingPending ? "Preparando conexión segura..." : plan.managementNote);
  const displayedIncludedAccountsLabel = includedAccountsLabelForPlan(currentOption);
  const displayedUsagePercent = usagePercentForPlan(currentOption, settingsOverview.accountCount);
  const displayedAccountNote =
    currentOption.key === "unlimited"
      ? "Cuentas ilimitadas dentro del plan."
      : "Cuentas dentro del plan.";

  React.useEffect(() => {
    let cancelled = false;

    async function readBillingStatus() {
      try {
        const response = await fetch("/api/kmfx/billing/status", {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        const nextPlanKey = billingPlanKeyFromPayload(payload);

        if (!cancelled && response.ok && nextPlanKey) {
          setBillingPlanKey(nextPlanKey);
        }
      } catch {
        // Keep the selector fallback if billing status cannot be read momentarily.
      }
    }

    void readBillingStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  function scrollToPlanOptions() {
    document
      .getElementById("kmfx-plan-options")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function readBillingPayload(response: Response) {
    const payload = await response.json().catch(() => ({}));

    if (response.status === 401 || payload?.auth_required) {
      router.push("/login?next=/subscription");
      return null;
    }

    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.reason || payload?.error || "billing_request_failed");
    }

    return payload;
  }

  async function startCheckout(planKey: PlanOptionKey) {
    setBillingAction({
      message: "Preparando Checkout seguro...",
      planKey,
      status: "pending",
    });

    try {
      const response = await fetch("/api/kmfx/billing/checkout", {
        body: JSON.stringify({
          cancelUrl: "/subscription?checkout=cancelled",
          interval: billingInterval,
          plan: planKey,
          successUrl: "/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));

      if (response.status === 401 || payload?.auth_required) {
        router.push("/login?next=/subscription");
        return;
      }

      if (!response.ok || payload?.ok === false) {
        if (response.status >= 500) {
          await openBillingPortal("Checkout no disponible. Abriendo portal seguro...");
          return;
        }

        throw new Error(payload?.reason || payload?.error || "billing_request_failed");
      }

      if (!payload) return;

      if (payload.url) {
        window.location.assign(payload.url);
        return;
      }

      setBillingPlanKey(billingPlanKeyFromPayload(payload) ?? planKey);
      setBillingAction({
        message: payload.message || "Suscripción actualizada correctamente.",
        planKey,
        status: "success",
      });
      router.refresh();
    } catch (error) {
      const reason = error instanceof Error ? error.message : "billing_request_failed";
      setBillingAction({
        message:
          reason === "rate_limited"
            ? "Demasiados intentos seguidos. Espera un momento y vuelve a probar."
            : "No se pudo abrir Checkout. Revisa sesión y configuración de billing.",
        planKey,
        status: "error",
      });
    }
  }

  async function openBillingPortal(message = "Abriendo portal de suscripción...") {
    setBillingAction({
      message,
      status: "pending",
    });

    try {
      const response = await fetch("/api/kmfx/billing/portal", {
        body: JSON.stringify({
          returnUrl: "/subscription?billing=portal-return",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = await readBillingPayload(response);

      if (!payload) return;

      if (!payload.url) {
        throw new Error(payload.reason || "billing_portal_url_missing");
      }

      window.location.assign(payload.url);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "billing_portal_failed";
      setBillingAction({
        message:
          reason === "rate_limited"
            ? "Demasiados intentos seguidos. Espera un momento y vuelve a probar."
            : "No se pudo abrir el portal seguro.",
        status: "error",
      });
    }
  }

  return (
    <PageMotion>
      <div className="grid max-w-7xl gap-4">
        {welcome ? (
          <Card className="overflow-hidden border-border/70 bg-card/80">
            <CardHeader className="gap-4 border-b border-border/60 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
                  <LockKeyhole className="size-4" />
                  <span>Plan pendiente</span>
                </div>
                <CardTitle>Activa KMFX Edge para conectar MT5</CardTitle>
                <CardDescription>
                  El panel ya está preparado. Activa un plan para añadir cuentas,
                  descargar launcher/EA y leer métricas reales desde MT5.
                </CardDescription>
              </div>
              <CardAction className="flex flex-wrap gap-2">
                <Button onClick={scrollToPlanOptions} type="button">
                  <CreditCard data-icon="inline-start" />
                  Elegir plan
                </Button>
                <Button
                  nativeButton={false}
                  render={<Link href="/dashboard?demo=1" />}
                  variant="outline"
                >
                  <ExternalLink data-icon="inline-start" />
                  Ver ejemplo
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-4 p-4 sm:grid-cols-3 sm:p-6">
              {[
                ["1", "Plan activo", "Desbloquea conexión, descargas y alta de cuentas."],
                ["2", "Launcher y EA", "Instala la versión preparada para la beta."],
                ["3", "Lectura completa", "La primera carga trae el historial y después solo cambios."],
              ].map(([step, title, description]) => (
                <div
                  key={step}
                  className="grid gap-2 border-l border-border/70 pl-4 first:border-l-0 first:pl-0 sm:first:border-l sm:first:pl-4"
                >
                  <p className="font-mono text-xs text-muted-foreground">{step}</p>
                  <p className="font-semibold text-foreground">{title}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card className="overflow-hidden border-border/70 bg-card/80">
          <CardHeader className="border-b border-border/60">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
                  <CreditCard className="size-4" />
                  <span>Suscripción KMFX Edge</span>
                </div>
                <CardTitle>Elige el plan operativo</CardTitle>
                <CardDescription>
                  Precio, límite MT5 y profundidad de análisis en una sola vista.
                </CardDescription>
              </div>
              <CardAction className="flex flex-wrap items-center gap-2">
                <Badge variant={statusBadgeVariant}>
                  {overLimit ? (
                    <ReceiptText data-icon="inline-start" />
                  ) : (
                    <CheckCircle2 data-icon="inline-start" />
                  )}
                  {plan.statusLabel}
                </Badge>
                <ToggleGroup
                  aria-label="Intervalo de facturación"
                  onValueChange={(value) => {
                    const nextValue = value[0] as "monthly" | "yearly" | undefined;

                    if (nextValue) setBillingInterval(nextValue);
                  }}
                  size="sm"
                  spacing={1}
                  value={[billingInterval]}
                  variant="outline"
                >
                  <ToggleGroupItem className="h-11 min-w-20 sm:h-8" value="monthly">
                    Mensual
                  </ToggleGroupItem>
                  <ToggleGroupItem className="h-11 min-w-20 sm:h-8" value="yearly">
                    Anual
                  </ToggleGroupItem>
                </ToggleGroup>
              </CardAction>
            </div>
            <p
              aria-live="polite"
              className={cn(
                "col-span-full mt-3 text-sm",
                billingAction.status === "error"
                  ? "text-destructive"
                  : billingAction.status === "success"
                    ? "text-profit"
                    : "text-muted-foreground",
              )}
            >
              {billingMessage}
            </p>
          </CardHeader>
          <CardContent className="grid gap-5 p-4 sm:p-6">
            <div id="kmfx-plan-options" className="scroll-mt-24 grid gap-5 lg:grid-cols-3">
              {planOptions.map((option, index) => {
                const featured = option.key === "pro";
                const current = option.current;
                const visual = planCardVisuals[option.key];
                const chartItem = planChartData.find((item) => item.key === option.key);
                const capacityPercent = chartItem
                  ? Math.max(12, (chartItem.accountCapacity / maxAccountCapacity) * 100)
                  : 12;
                const gradientConfig = planGradientConfigForOption(option.key, index);

                return (
                  <motion.div
                    key={option.key}
                    className={cn(
                      "h-[500px] min-w-0",
                      featured && "order-first lg:order-none lg:-translate-y-2",
                    )}
                    whileHover={{ y: -10, transition: { duration: 0.3 } }}
                  >
                    <Card
                      className={cn(
                        "group relative h-full overflow-hidden rounded-3xl border-border/50 bg-card/30 p-0 backdrop-blur-md transition-all duration-500 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/10",
                        featured && "border-primary/60 shadow-2xl shadow-primary/10",
                        current && "border-foreground/30",
                      )}
                    >
                      <div className="relative h-56 overflow-hidden">
                        <AnimatedGradient config={gradientConfig} />
                        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent opacity-60 transition-opacity duration-300 group-hover:opacity-40" />

                        <div className="absolute left-4 top-4 z-20">
                          <Badge
                            variant="secondary"
                            className="border-white/10 bg-background/50 px-3 py-1 text-xs font-medium backdrop-blur-md"
                          >
                            {current ? "Actual" : featured ? "Recomendado" : visual.signal}
                          </Badge>
                        </div>
                        <div className="absolute right-4 top-4 z-20 rounded-full border border-white/10 bg-background/45 px-3 py-1 text-xs font-medium text-foreground backdrop-blur-md">
                          {visual.capacity}
                        </div>

                        <div className="absolute bottom-4 left-4 right-4 z-20">
                          <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">
                            KMFX Edge
                          </p>
                          <div className="mt-2 flex min-w-0 items-end justify-between gap-3">
                            <h3 className="min-w-0 truncate text-3xl font-bold leading-none tracking-tight text-white">
                              {visual.code}
                            </h3>
                            <p className="shrink-0 whitespace-nowrap text-right text-[clamp(1.35rem,1.7vw,1.5rem)] font-semibold leading-none tracking-tight text-white">
                              {priceForInterval(option)}
                            </p>
                          </div>
                          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/20">
                            <div
                              className={cn(
                                "h-full rounded-full bg-white/70",
                                featured && "bg-primary",
                              )}
                              style={{ width: `${capacityPercent}%` }}
                            />
                          </div>
                        </div>

                        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20 opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-hover:opacity-100">
                          <motion.button
                            className="rounded-full bg-white px-6 py-2 text-sm font-semibold text-black shadow-lg transition-transform duration-200 disabled:cursor-not-allowed disabled:opacity-70"
                            disabled={!plan.managementReady || billingPending}
                            onClick={() => {
                              if (current) {
                                void openBillingPortal();
                                return;
                              }

                              void startCheckout(option.key);
                            }}
                            type="button"
                            whileHover={{ scale: plan.managementReady && !billingPending ? 1.05 : 1 }}
                            whileTap={{ scale: plan.managementReady && !billingPending ? 0.95 : 1 }}
                          >
                            {billingPending && billingAction.planKey === option.key
                              ? "Abriendo..."
                              : current
                                ? "Gestionar"
                                : "Seleccionar"}
                          </motion.button>
                        </div>
                      </div>

                      <div className="flex h-[calc(100%-14rem)] flex-col justify-between p-4">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="text-xl font-bold leading-tight tracking-tight text-foreground transition-colors group-hover:text-primary">
                                {option.name}
                              </h3>
                              <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
                                {option.recommendedFor}
                              </p>
                            </div>
                            {featured ? (
                              <Badge className="shrink-0 bg-foreground text-background hover:bg-foreground/90">
                                <Sparkles data-icon="inline-start" />
                                Top
                              </Badge>
                            ) : null}
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-2xl border border-border/50 bg-background/35 p-3">
                              <p className="text-[11px] font-medium uppercase text-muted-foreground">
                                Precio
                              </p>
                              <p className="mt-2 text-lg font-semibold leading-tight text-foreground">
                                {priceForInterval(option)}
                              </p>
                              <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                {intervalCaption}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-border/50 bg-background/35 p-3">
                              <p className="text-[11px] font-medium uppercase text-muted-foreground">
                                Capacidad
                              </p>
                              <p className="mt-2 text-lg font-semibold leading-tight text-foreground">
                                {option.accountLimitLabel}
                              </p>
                              <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                {option.key === "unlimited" ? "Escala total" : "Límite MT5"}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/50 pt-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <Avatar className="size-8 border border-border/60">
                              <AvatarFallback className="bg-background/70 text-[11px] font-semibold">
                                {visual.code.slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {current
                                  ? "Plan actual"
                                  : featured
                                    ? "Recomendado"
                                    : "Disponible"}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {option.key === "unlimited" ? "Sin límite" : visual.signal}
                              </p>
                            </div>
                          </div>
                          <Button
                            className="shrink-0"
                            disabled={!plan.managementReady || billingPending}
                            onClick={() => {
                              if (current) {
                                void openBillingPortal();
                                return;
                              }

                              void startCheckout(option.key);
                            }}
                            size="sm"
                            variant={current ? "secondary" : featured ? "default" : "outline"}
                          >
                            {billingPending && billingAction.planKey === option.key
                              ? "Abriendo..."
                              : current
                                ? "Gestionar"
                                : "Elegir"}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.38fr)]">
              <div className="rounded-xl border border-border/70 bg-background/35 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">Precio vs capacidad</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Comparativa rápida por intervalo.
                    </p>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">MT5</span>
                </div>
                <div className="mt-4 grid gap-4">
                  {planChartData.map((item) => (
                    <div key={item.key} className="grid gap-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-foreground">{item.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.key === "unlimited"
                            ? "Ilimitadas"
                            : `${item.accountCapacity} cuentas`}
                        </span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="grid gap-1">
                          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                            <span>Precio</span>
                            <span>{item.price} EUR</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted/45">
                            <div
                              className="h-full rounded-full bg-foreground/70"
                              style={{
                                width: `${Math.max(12, (item.price / maxChartPrice) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                        <div className="grid gap-1">
                          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                            <span>Capacidad</span>
                            <span>{item.key === "unlimited" ? "Escala" : "Límite"}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted/45">
                            <div
                              className={cn(
                                "h-full rounded-full bg-foreground/70",
                                item.current && "bg-primary",
                              )}
                              style={{
                                width: `${Math.max(12, (item.accountCapacity / maxAccountCapacity) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/35 p-4">
                <p className="font-medium text-foreground">Plan actual</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  {currentOption.name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {plan.usedAccountsLabel}/{displayedIncludedAccountsLabel} cuentas conectadas
                </p>
                <Progress className="mt-4" value={displayedUsagePercent} />
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {displayedAccountNote}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.72fr)]">
          <Card className="border-border/70 bg-card/70">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle>Estado y facturación</CardTitle>
                  <CardDescription>
                    Uso actual, renovación y estado de pagos.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!plan.managementReady || billingPending}
                    onClick={() => void openBillingPortal()}
                  >
                    <CreditCard data-icon="inline-start" />
                    {billingPending && !billingAction.planKey
                      ? "Abriendo..."
                      : plan.primaryActionLabel}
                  </Button>
                  <Button variant="outline" render={<Link href="/accounts" />} nativeButton={false}>
                    <WalletCards data-icon="inline-start" />
                    Ver cuentas
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="rounded-lg border border-border/70 bg-background/35 p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Renovación
                </p>
                <p className="mt-2 text-sm font-medium leading-6 text-foreground">
                  {plan.renewalLabel}
                </p>
                <Separator className="my-4" />
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Gestión
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {plan.managementNote}
                </p>
              </div>

              <div className="grid gap-0">
                {plan.paymentRows.map((row, index) => {
                  const Icon = paymentIconByTone[row.tone];

                  return (
                    <React.Fragment key={row.label}>
                      {index > 0 ? <Separator /> : null}
                      <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/35">
                          <Icon className="size-4 text-muted-foreground" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-3">
                            <span className="font-medium text-foreground">{row.label}</span>
                            <Badge variant={row.tone === "ready" ? "secondary" : "outline"}>
                              {row.value}
                            </Badge>
                          </span>
                          <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                            {row.note}
                          </span>
                        </span>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/70">
            <CardHeader>
              <CardTitle>Comparativa rápida</CardTitle>
              <CardDescription>
                Lo importante para decidir sin leer una tabla comercial larga.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {entitlementRows.map((row) => (
                  <div
                    key={row.label}
                    className="grid gap-2 border-b border-border/60 pb-3 last:border-b-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-start"
                  >
                    <div className="font-medium text-foreground">{row.label}</div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {row.values.map((value, index) => (
                        <div
                          key={`${row.label}-${planOptions[index]?.key}`}
                          className="min-w-0 rounded-md bg-muted/35 px-3 py-2"
                        >
                          <div className="text-xs font-medium text-muted-foreground">
                            {planOptions[index]?.name.replace("Edge ", "")}
                          </div>
                          <div className="mt-1 text-sm text-foreground">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/70">
            <CardHeader>
              <CardTitle>Incluido ahora</CardTitle>
              <CardDescription>
                Lo que ya está cubierto por tu plan actual.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3">
                {includedFeatures.map((feature) => (
                  <div key={feature} className="flex items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/35">
                      <CheckCircle2 className="size-4 text-muted-foreground" />
                    </span>
                    <span className="text-sm leading-6 text-muted-foreground">{feature}</span>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="grid gap-3">
                {planDecisionRows.map((row) => (
                  <div key={row.label} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="min-w-0 text-right">
                      <span className="block font-medium text-foreground">{row.value}</span>
                      <span className="block text-xs text-muted-foreground">{row.note}</span>
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageMotion>
  );
}
