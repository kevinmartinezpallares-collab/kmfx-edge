"use client";

import * as React from "react";
import { CheckCircle2, Copy, Download, ExternalLink, Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

import { AccountCardsSlider } from "@/components/uitripled/account-cards-slider-shadcnui";
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
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { resolveConnectionAccess } from "@/lib/billing/connection-access";
import { getAccountsOverview } from "@/lib/domain/accounts-selectors";
import { formatCurrency } from "@/lib/formatters/numbers";
import { cn } from "@/lib/utils";

const MT5_WEBREQUEST_URL = "https://mt5-api.kmfxedge.com";

type AddAccountStep = 1 | 2 | 3;

const addAccountSteps: Array<{ id: AddAccountStep; label: string }> = [
  { id: 1, label: "Método" },
  { id: 2, label: "Preparación" },
  { id: 3, label: "KMFX Key" },
];

const accountConnectionMethods = [
  {
    body: "Camino recomendado para beta: Launcher, EA y primera sincronización completa desde MT5.",
    label: "Disponible",
    title: "Conectar MT5 con EA",
    value: "launcher",
  },
  {
    body: "Crear ficha desde un extracto o historial cuando el asistente esté disponible.",
    label: "Próximamente",
    title: "Importar cuenta",
    value: "import",
  },
  {
    body: "Preparar una cuenta sin sincronización automática para revisión interna.",
    label: "Próximamente",
    title: "Cuenta manual",
    value: "manual",
  },
] as const;

const mt5ConnectionSteps = [
  {
    title: "Abre o instala KMFX Launcher",
    body: "Prepara el conector en este equipo. Si no se abre, descarga tu versión.",
  },
  {
    title: "Instala el conector",
    body: "Elige la instancia de MetaTrader 5 que vas a vincular e instala KMFX Connector.",
  },
  {
    title: "Permite WebRequest en MT5",
    body: "En Tools > Options > Expert Advisors, activa WebRequest y añade la URL de KMFX.",
  },
  {
    title: "Activa el EA",
    body: "Arrastra KMFXConnector a un gráfico y deja Algo Trading activo.",
  },
  {
    title: "Confirma la sincronización",
    body: "Cuando Experts confirme KMFX, la cuenta quedará sincronizada en el dashboard.",
  },
] as const;

const mt5FinishSteps = [
  {
    title: "Copiar KMFX Key",
    body: "Cada cuenta MT5 usa una key estable. Si reinstalas el EA, reutiliza la misma.",
  },
  {
    title: "Pegar en MT5",
    body: "Pégala en el campo KMFXKey del Expert Advisor con WebRequest activo.",
  },
  {
    title: "Primera sincronización",
    body: "Deja MT5 abierto hasta que llegue el histórico completo inicial.",
  },
] as const;

type PendingAccountStatus = {
  account_id?: string;
  alias?: string;
  broker?: string;
  login?: string;
  mt5_login?: string;
  server?: string;
  status?: string;
  lifecycle_status?: string;
  last_sync_at?: string;
  first_sync_at?: string;
  last_error_code?: string;
  last_error_message?: string;
};

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function accountLinkFailureMessage(payload: unknown, status: number) {
  const data = readRecord(payload);
  const details = readRecord(data.details);
  const reason = readString(data.reason || data.error);
  const message = readString(data.message);

  if (message) {
    return message;
  }

  if (reason === "auth_required") {
    return "Inicia sesión de nuevo para generar una KMFX Key.";
  }

  if (reason === "billing_required" || reason === "entitlement_required") {
    return "Activa un plan para añadir cuentas MT5 y descargar launcher/EA.";
  }

  if (reason === "billing_past_due") {
    return "Regulariza la suscripción para conectar cuentas MT5.";
  }

  if (reason === "plan_limit_reached") {
    const currentConnections = details.current_connections;
    const connectionLimit = details.connection_limit;
    const hasCounts =
      typeof currentConnections === "number" &&
      typeof connectionLimit === "number";

    return hasCounts
      ? `Has alcanzado el límite de tu plan (${currentConnections}/${connectionLimit} cuentas MT5). Gestiona el plan o libera una key.`
      : "Has alcanzado el límite de cuentas MT5 de tu plan.";
  }

  if (reason === "connection_key_revoked") {
    return "La KMFX Key de esta cuenta fue revocada. Genera o restaura una key válida.";
  }

  if (reason === "connection_key_already_linked") {
    return "Esta KMFX Key ya está asociada a otra cuenta.";
  }

  if (reason === "connection_key_not_available") {
    return "No se pudo recuperar una KMFX Key para esta cuenta. Prueba a generar una nueva conexión.";
  }

  if (reason === "account_not_found") {
    return "La cuenta pendiente no existe en el registro actual. Cierra el modal y vuelve a crear la conexión.";
  }

  if (reason === "rate_limited") {
    return "Demasiados intentos seguidos. Espera un momento y vuelve a generar la KMFX Key.";
  }

  if (reason === "fetch failed") {
    return "No se pudo contactar con el backend MT5 desde este entorno. En local, arranca la API o configura KMFX_API_BASE_URL hacia Render.";
  }

  return status >= 500
    ? "El backend no pudo preparar la cuenta ahora. Reinténtalo en unos segundos."
    : "No se pudo preparar la cuenta. Revisa sesión, plan y límites.";
}

function formatSyncCheckLabel(value: string | undefined) {
  if (!value) return "";

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "";

  const diffSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return `Hace ${diffSeconds} s`;

  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `Hace ${diffMinutes} min`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;

  const diffDays = Math.round(diffHours / 24);
  return `Hace ${diffDays} d`;
}

type PageMotionProps = {
  children: React.ReactNode;
};

function PageMotion({ children }: PageMotionProps) {
  return <div>{children}</div>;
}

export function AccountsReferenceSection({
  workspace,
}: {
  workspace: WorkspaceState;
}) {
  const router = useRouter();
  const [isAddAccountOpen, setIsAddAccountOpen] = React.useState(false);
  const [addAccountStep, setAddAccountStep] = React.useState<AddAccountStep>(1);
  const [linkState, setLinkState] = React.useState<{
    accountId: string;
    connectionKey: string;
    message: string;
    status: "idle" | "pending" | "ready" | "error";
  }>({
    accountId: "",
    connectionKey: "",
    message: "",
    status: "idle",
  });
  const [connectionAccess, setConnectionAccess] = React.useState<{
    message: string;
    status: "idle" | "pending" | "ready" | "blocked" | "error";
  }>({
    message: "",
    status: "idle",
  });
  const [connectionCheck, setConnectionCheck] = React.useState<{
    message: string;
    status: "idle" | "checking" | "waiting" | "connected" | "error";
  }>({
    message: "",
    status: "idle",
  });
  const [copiedWebRequest, setCopiedWebRequest] = React.useState(false);
  const accountsOverview = getAccountsOverview(workspace);
  const accountRows = accountsOverview.rows;
  const connectedCount = accountRows.filter(
    (account) => account.connectionTone === "connected",
  ).length;
  const activeAccountsCount = accountRows.filter(
    (account) => account.connectionState !== "error",
  ).length;
  const oldestSyncLabel =
    accountRows.find((account) => account.needsAttention)?.lastSyncLabel ??
    accountRows[0]?.lastSyncLabel ??
    "Sin datos";
  const linkPending = linkState.status === "pending";
  const connectionReady = connectionAccess.status === "ready";

  async function copyWebRequestUrl() {
    await navigator.clipboard?.writeText(MT5_WEBREQUEST_URL);
    setCopiedWebRequest(true);
    window.setTimeout(() => setCopiedWebRequest(false), 1600);
  }

  function handleAddAccountOpenChange(open: boolean) {
    setIsAddAccountOpen(open);

    if (open) {
      setAddAccountStep(1);
      setCopiedWebRequest(false);
      setConnectionCheck({ message: "", status: "idle" });
    }
  }

  React.useEffect(() => {
    if (!isAddAccountOpen) {
      return;
    }

    const controller = new AbortController();

    async function checkConnectionAccess() {
      setConnectionAccess({
        message: "Comprobando plan activo...",
        status: "pending",
      });

      try {
        const response = await fetch("/api/kmfx/billing/status", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));

        if (response.status === 401 || payload?.auth_required) {
          router.push("/login?next=/accounts");
          return;
        }

        const access = resolveConnectionAccess(response.ok ? payload : { ok: false });

        setConnectionAccess({
          message: access.message,
          status: access.allowed ? "ready" : "blocked",
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setConnectionAccess({
          message: "No se pudo comprobar el plan ahora. Inténtalo de nuevo.",
          status: "error",
        });
      }
    }

    void checkConnectionAccess();

    return () => {
      controller.abort();
    };
  }, [isAddAccountOpen, router]);

  async function prepareLauncherAccount() {
    if (connectionAccess.status !== "ready") {
      setLinkState({
        accountId: "",
        connectionKey: "",
        message:
          connectionAccess.message ||
          "Activa primero la suscripción para añadir cuentas MT5.",
        status: "error",
      });
      return;
    }

    setLinkState({
      accountId: "",
      connectionKey: "",
      message: "Preparando conexión segura...",
      status: "pending",
    });
    setConnectionCheck({ message: "", status: "idle" });

    try {
      const response = await fetch("/api/kmfx/accounts/link", {
        body: JSON.stringify({
          connectionMode: "launcher",
          label: "Nueva cuenta MT5",
          platform: "mt5",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));

      if (response.status === 401 || payload?.auth_required) {
        router.push("/login?next=/accounts");
        return;
      }

      if (!response.ok || payload?.ok === false) {
        throw new Error(accountLinkFailureMessage(payload, response.status));
      }

      setLinkState({
        accountId: payload.account_id || "",
        connectionKey: payload.connection_key || "",
        message:
          payload.connection_key
            ? "Cuenta preparada. Copia la KMFX Key en el EA y ejecuta la primera sincronización completa."
            : "Cuenta preparada. Revisa la conexión desde el launcher.",
        status: "ready",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo preparar la cuenta. Revisa sesión, plan y límites.";
      setLinkState({
        accountId: "",
        connectionKey: "",
        message,
        status: "error",
      });
    }
  }

  async function checkPendingAccountConnection() {
    if (!linkState.accountId) {
      setConnectionCheck({
        message: "Genera primero la KMFX Key de esta cuenta.",
        status: "error",
      });
      return;
    }

    setConnectionCheck({
      message: "Comprobando si el EA ya envió la primera sincronización...",
      status: "checking",
    });

    try {
      const response = await fetch(
        `/api/kmfx/accounts/pending?account_id=${encodeURIComponent(linkState.accountId)}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => ({}));

      if (response.status === 401 || payload?.auth_required) {
        router.push("/login?next=/accounts");
        return;
      }

      const account = Array.isArray(payload?.accounts)
        ? (payload.accounts[0] as PendingAccountStatus | undefined)
        : undefined;

      if (!response.ok || !account) {
        setConnectionCheck({
          message:
            "Todavía no aparece esta conexión. Revisa que la KMFX Key esté pegada en el EA correcto.",
          status: "waiting",
        });
        return;
      }

      const rawStatus = String(account.status || account.lifecycle_status || "").toLowerCase();
      const hasError =
        rawStatus === "error" ||
        Boolean(account.last_error_code || account.last_error_message);
      const hasSync =
        rawStatus === "active" ||
        rawStatus === "connected" ||
        Boolean(account.last_sync_at || account.first_sync_at);
      const lastSyncLabel = formatSyncCheckLabel(account.last_sync_at);
      const login = account.login || account.mt5_login;

      if (hasError) {
        setConnectionCheck({
          message:
            account.last_error_message ||
            "MT5 respondió con error. Revisa WebRequest, Algo Trading y el campo KMFXKey del EA.",
          status: "error",
        });
        return;
      }

      if (hasSync) {
        setConnectionCheck({
          message: `Conexión confirmada${login ? ` para MT5 ${login}` : ""}${
            lastSyncLabel ? ` - ${lastSyncLabel}` : ""
          }.`,
          status: "connected",
        });
        router.refresh();
        return;
      }

      setConnectionCheck({
        message:
          "Aún no llegó la primera sincronización. Deja MT5 abierto y confirma WebRequest, Algo Trading y KMFX Key.",
        status: "waiting",
      });
    } catch {
      setConnectionCheck({
        message: "No se pudo comprobar la conexión ahora. Inténtalo de nuevo en unos segundos.",
        status: "error",
      });
    }
  }

  return (
    <PageMotion>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <div className="flex min-w-0 flex-col gap-1.5">
              <CardTitle>Control de cuentas</CardTitle>
              <CardDescription>
                Gestiona cuentas conectadas, broker, firma, servidor, login, estado de conexión
                y permisos activos.
              </CardDescription>
            </div>
            <CardAction className="flex flex-col gap-2 sm:flex-row">
              <Button
                size="sm"
                type="button"
                onClick={() => setIsAddAccountOpen(true)}
              >
                <Plus data-icon="inline-start" />
                Añadir cuenta
              </Button>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => setIsAddAccountOpen(true)}
              >
                Abrir launcher
                <ExternalLink data-icon="inline-end" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Capital conectado</p>
                <p className="mt-2 text-3xl font-semibold">
                  {formatCurrency(accountsOverview.totalEquity)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Equity total vinculado
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Conexión MT5</p>
                <p className="mt-2 text-3xl font-semibold">
                  {connectedCount}/{accountsOverview.totalCount}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Última revisión: {oldestSyncLabel}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Cuentas activas</p>
                <p className="mt-2 text-3xl font-semibold">{activeAccountsCount}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Real, fondeo o bot
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Requieren revisión</p>
                <p className="mt-2 text-3xl font-semibold">
                  {accountsOverview.attentionCount}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Conexión, permisos o datos
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={isAddAccountOpen} onOpenChange={handleAddAccountOpenChange}>
          <DialogContent className="max-h-[calc(100svh-1rem)] overflow-y-auto overscroll-contain sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Añadir cuenta</DialogTitle>
              <DialogDescription>
                Prepara la conexión de una cuenta real, fondeo, Darwinex o bot.
                Avanza por método, preparación y KMFX Key.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2 sm:grid-cols-3">
              {addAccountSteps.map((step) => {
                const isCurrent = addAccountStep === step.id;
                const isComplete = addAccountStep > step.id;

                return (
                  <div
                    className={cn(
                      "rounded-lg border border-border/70 bg-muted/20 px-3 py-2",
                      isCurrent && "border-foreground/40 bg-muted/50",
                      isComplete && "bg-muted/35",
                    )}
                    key={step.id}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 items-center justify-center rounded-full border border-border/70 bg-background text-xs font-medium">
                        {isComplete ? (
                          <CheckCircle2 data-icon="inline-start" />
                        ) : (
                          step.id
                        )}
                      </span>
                      <span className="text-sm font-medium">{step.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {addAccountStep === 1 ? (
              <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-border/70 bg-background/45 p-4">
                  <p className="text-sm font-semibold">Elige cómo conectar</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Para beta, el flujo operativo es MT5 con EA y KMFX Key. Las
                    otras vías quedan preparadas como próximas opciones.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {accountConnectionMethods.map((method) => {
                      const isLauncher = method.value === "launcher";
                      const methodEnabled = isLauncher && connectionReady;

                      return (
                        <button
                          className={cn(
                            "min-h-40 rounded-xl border border-border/70 bg-background/55 p-4 text-left transition-colors",
                            methodEnabled
                              ? "hover:bg-muted/35"
                              : "cursor-not-allowed opacity-55",
                          )}
                          disabled={!methodEnabled}
                          key={method.value}
                          onClick={() => setAddAccountStep(2)}
                          type="button"
                        >
                          <span className="text-sm font-semibold text-foreground">
                            {method.title}
                          </span>
                          <span className="mt-3 block text-xs leading-5 text-muted-foreground">
                            {method.body}
                          </span>
                          <span className="mt-5 inline-flex rounded-full border border-border/70 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                            {method.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div
                  aria-live="polite"
                  className="rounded-xl border border-border/70 bg-background/45 p-4"
                >
                  <p
                    className={cn(
                      "text-sm leading-6 text-muted-foreground",
                      (connectionAccess.status === "blocked" ||
                        connectionAccess.status === "error") &&
                        "text-destructive",
                    )}
                  >
                    {connectionAccess.message ||
                      "Validaremos que el plan permite añadir cuentas antes de generar la KMFX Key."}
                  </p>
                </div>
              </div>
            ) : null}

            {addAccountStep === 2 ? (
              <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-border/70 bg-background/45 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Prepara MT5</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Descarga el Launcher, instala el conector y deja WebRequest
                        permitido antes de crear la KMFX Key.
                      </p>
                    </div>
                    <Button
                      disabled={!connectionReady}
                      onClick={() => {
                        window.location.href = "kmfx-launcher://open";
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <ExternalLink data-icon="inline-start" />
                      Abrir Launcher
                    </Button>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {[
                      {
                        href: "/downloads/KMFX-Launcher-macOS.zip",
                        label: "macOS",
                      },
                      {
                        href: "/downloads/KMFX-Launcher-Windows.exe",
                        label: "Windows",
                      },
                      {
                        href: `/${["KMFX", "Connector.ex5"].join("")}`,
                        label: "EA",
                      },
                    ].map((download) =>
                      connectionReady ? (
                        <a
                          className={buttonVariants({
                            size: "sm",
                            variant: "outline",
                          })}
                          href={download.href}
                          key={download.href}
                        >
                          <Download data-icon="inline-start" />
                          Descargar {download.label}
                        </a>
                      ) : (
                        <button
                          className={buttonVariants({
                            size: "sm",
                            variant: "outline",
                          })}
                          disabled
                          key={download.href}
                          type="button"
                        >
                          <Download data-icon="inline-start" />
                          Descargar {download.label}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-background/45 p-4">
                  <div className="grid gap-3">
                    {mt5ConnectionSteps.map((step, index) => (
                      <div
                        className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3"
                        key={step.title}
                      >
                        <span className="flex size-8 items-center justify-center rounded-full border border-border/70 bg-muted/35 text-xs font-medium text-foreground">
                          {index + 1}
                        </span>
                        <span>
                          <span className="block text-sm font-medium text-foreground">
                            {step.title}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                            {step.body}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-lg bg-muted/35 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase text-muted-foreground">
                          URL para WebRequest en MetaTrader 5
                        </p>
                        <code className="mt-1 block break-all font-mono text-xs text-foreground">
                          {MT5_WEBREQUEST_URL}
                        </code>
                      </div>
                      <Button
                        onClick={() => void copyWebRequestUrl()}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        <Copy data-icon="inline-start" />
                        {copiedWebRequest ? "Copiada" : "Copiar URL"}
                      </Button>
                    </div>
                  </div>
                </div>

                <p className="rounded-xl bg-muted/45 px-4 py-3 text-xs leading-5 text-muted-foreground">
                  No se guardan contraseñas ni se abre MT5 desde esta pantalla.
                  La cuenta queda pendiente hasta que el EA envíe la primera
                  sincronización completa.
                </p>
              </div>
            ) : null}

            {addAccountStep === 3 ? (
              <div className="flex flex-col gap-4">
                <div
                  aria-live="polite"
                  className="rounded-xl border border-border/70 bg-background/45 p-4"
                >
                  <p
                    className={cn(
                      "text-sm leading-6 text-muted-foreground",
                      (linkState.status === "error" ||
                        connectionAccess.status === "blocked" ||
                        connectionAccess.status === "error") &&
                        "text-destructive",
                    )}
                  >
                    {linkState.message ||
                      connectionAccess.message ||
                      "Genera una KMFX Key, pégala en el EA y deja MT5 abierto hasta que llegue el histórico completo inicial."}
                  </p>
                  {linkState.connectionKey ? (
                    <div className="mt-3 grid gap-2">
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        KMFX Key
                      </p>
                      <code className="block break-all rounded-lg border border-border/70 bg-muted/45 px-3 py-2 font-mono text-sm text-foreground">
                        {linkState.connectionKey}
                      </code>
                      {linkState.accountId ? (
                        <p className="text-xs text-muted-foreground">
                          Cuenta pendiente: {linkState.accountId}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {connectionCheck.message ? (
                    <p
                      className={cn(
                        "mt-3 text-xs leading-5 text-muted-foreground",
                        connectionCheck.status === "connected" && "text-foreground",
                        connectionCheck.status === "error" && "text-destructive",
                      )}
                    >
                      {connectionCheck.message}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-3 rounded-xl border border-border/70 bg-background/45 p-4 sm:grid-cols-3">
                  {mt5FinishSteps.map((step, index) => (
                    <div className="flex items-start gap-3" key={step.title}>
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted/35">
                        {(linkState.connectionKey && index === 0) ||
                        (connectionCheck.status === "connected" && index === 2) ? (
                          <CheckCircle2 data-icon="inline-start" />
                        ) : (
                          <span className="text-xs font-medium">{index + 1}</span>
                        )}
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-foreground">
                          {step.title}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {step.body}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>

                <p className="rounded-xl bg-muted/45 px-4 py-3 text-xs leading-5 text-muted-foreground">
                  El primer envío debe ser completo. Después, el EA solo enviará
                  actualizaciones para mantener bajo el consumo de datos.
                </p>
              </div>
            ) : null}

            <DialogFooter>
              {addAccountStep === 1 ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddAccountOpen(false)}
                  >
                    Cerrar
                  </Button>
                  <Button
                    disabled={!connectionReady}
                    type="button"
                    onClick={() => setAddAccountStep(2)}
                  >
                    Continuar con EA
                  </Button>
                </>
              ) : null}
              {addAccountStep === 2 ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAddAccountStep(1)}
                  >
                    Atrás
                  </Button>
                  <Button
                    disabled={!connectionReady}
                    type="button"
                    onClick={() => setAddAccountStep(3)}
                  >
                    Continuar
                  </Button>
                </>
              ) : null}
              {addAccountStep === 3 ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAddAccountStep(2)}
                  >
                    Atrás
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddAccountOpen(false)}
                  >
                    Cerrar
                  </Button>
                  <Button
                    disabled={!linkState.accountId || connectionCheck.status === "checking"}
                    type="button"
                    variant="outline"
                    onClick={() => void checkPendingAccountConnection()}
                  >
                    <RefreshCw
                      data-icon="inline-start"
                      className={cn(
                        connectionCheck.status === "checking" && "animate-spin",
                      )}
                    />
                    {connectionCheck.status === "checking"
                      ? "Comprobando..."
                      : "Comprobar conexión"}
                  </Button>
                  <Button
                    disabled={linkPending || !connectionReady}
                    type="button"
                    onClick={() => void prepareLauncherAccount()}
                  >
                    {linkPending ? "Preparando..." : "Generar KMFX Key"}
                  </Button>
                </>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AccountCardsSlider
          accounts={accountRows}
          activeAccountId={accountsOverview.activeAccount?.id}
        />
      </div>
    </PageMotion>
  );
}
