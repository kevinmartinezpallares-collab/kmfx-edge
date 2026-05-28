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

import { useTheme } from "@/components/app/theme-provider";
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
import { getSettingsOverview } from "@/lib/domain/settings-selectors";
import { cn } from "@/lib/utils";

function PageMotion({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
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

export function SubscriptionReferenceSection({ workspace }: { workspace: WorkspaceState }) {
  const settingsOverview = getSettingsOverview(workspace);
  const { plan } = settingsOverview;
  const [billingInterval, setBillingInterval] = React.useState<"monthly" | "yearly">(
    "monthly",
  );
  const statusBadgeVariant = plan.statusTone === "ready" ? "secondary" : "destructive";
  const paymentIconByTone = {
    ready: CheckCircle2,
    attention: ReceiptText,
    locked: LockKeyhole,
  } as const;
  const currentOption = plan.options.find((option) => option.current) ?? plan.options[0];
  const overLimit = plan.statusTone === "attention";
  const includedFeatures = currentOption?.features ?? [];
  const priceForInterval = (option: (typeof plan.options)[number]) =>
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
      values: plan.options.map((option) => option.accountLimitLabel),
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
  const planChartData = plan.options.map((option) => {
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

  return (
    <PageMotion>
      <div className="grid max-w-7xl gap-4">
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
          </CardHeader>
          <CardContent className="grid gap-5 p-4 sm:p-6">
            <div className="grid gap-4 lg:grid-cols-3">
              {plan.options.map((option) => {
                const featured = option.key === "pro";
                const current = option.current;
                const visual = planCardVisuals[option.key];
                const chartItem = planChartData.find((item) => item.key === option.key);
                const capacityPercent = chartItem
                  ? Math.max(12, (chartItem.accountCapacity / maxAccountCapacity) * 100)
                  : 12;

                return (
                  <div
                    key={option.key}
                    className={cn(
                      "relative flex min-w-0 flex-col rounded-xl border border-border/70 bg-background/45 p-3 transition-colors",
                      featured &&
                        "order-first border-foreground/25 bg-card/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] lg:order-none lg:-translate-y-2",
                      current && "border-foreground/35 bg-muted/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
                    )}
                  >
                    <div className="overflow-hidden rounded-lg border border-border/70 bg-card/65 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium uppercase text-muted-foreground">
                            KMFX Edge
                          </p>
                          <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                            {visual.code}
                          </p>
                        </div>
                        {current ? (
                          <Badge variant="secondary">Actual</Badge>
                        ) : featured ? (
                          <Badge className="bg-foreground text-background hover:bg-foreground/90">
                            <Sparkles data-icon="inline-start" />
                            Recomendado
                          </Badge>
                        ) : null}
                      </div>

                      <div className="mt-8 flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">{visual.signal}</p>
                          <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                            {visual.capacity}
                          </p>
                        </div>
                        <p className="max-w-36 text-right text-2xl font-semibold tracking-tight text-foreground">
                          {priceForInterval(option)}
                        </p>
                      </div>

                      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted/50">
                        <div
                          className={cn(
                            "h-full rounded-full bg-foreground/65",
                            featured && "bg-primary",
                          )}
                          style={{ width: `${capacityPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="px-2 pt-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{option.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {option.recommendedFor}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {option.key === "unlimited" ? "Escala" : "Límite"}
                        </span>
                      </div>
                      <p className="mt-4 font-medium text-foreground">{option.accountLimitLabel}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{intervalCaption}</p>
                    </div>

                    <div className="mt-4 grid gap-3">
                      {option.features.map((feature) => (
                        <div
                          key={feature}
                          className="flex items-start gap-2 px-2 text-sm leading-6 text-muted-foreground"
                        >
                          <CheckCircle2 className="mt-1 size-4 shrink-0 text-muted-foreground" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>

                    <Button
                      className="mt-6 w-full"
                      disabled={!plan.managementReady}
                      variant={option.current ? "secondary" : featured ? "default" : "outline"}
                    >
                      {option.current ? "Plan actual" : "Seleccionar plan"}
                    </Button>
                  </div>
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
                  {plan.name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {plan.usedAccountsLabel}/{plan.includedAccountsLabel} cuentas conectadas
                </p>
                <Progress className="mt-4" value={plan.usagePercent} />
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {plan.accountNote}
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
                  <Button disabled={!plan.managementReady}>
                    <CreditCard data-icon="inline-start" />
                    {plan.primaryActionLabel}
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
                          key={`${row.label}-${plan.options[index]?.key}`}
                          className="min-w-0 rounded-md bg-muted/35 px-3 py-2"
                        >
                          <div className="text-xs font-medium text-muted-foreground">
                            {plan.options[index]?.name.replace("Edge ", "")}
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
