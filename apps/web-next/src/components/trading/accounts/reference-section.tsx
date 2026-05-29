"use client";

import * as React from "react";
import { ExternalLink, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { AccountCardsSlider } from "@/components/uitripled/account-cards-slider-shadcnui";
import { Button } from "@/components/ui/button";
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
import { getAccountsOverview } from "@/lib/domain/accounts-selectors";
import { formatCurrency } from "@/lib/formatters/numbers";

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

  async function prepareLauncherAccount() {
    setLinkState({
      accountId: "",
      connectionKey: "",
      message: "Preparando conexión segura...",
      status: "pending",
    });

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
        throw new Error(payload?.reason || payload?.error || "account_link_failed");
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
      const reason = error instanceof Error ? error.message : "account_link_failed";
      setLinkState({
        accountId: "",
        connectionKey: "",
        message:
          reason === "billing_required" || reason === "entitlement_required"
            ? "Activa primero la suscripción para añadir cuentas MT5."
            : "No se pudo preparar la cuenta. Revisa sesión, plan y límites.",
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

        <Dialog open={isAddAccountOpen} onOpenChange={setIsAddAccountOpen}>
          <DialogContent className="max-h-[calc(100svh-1rem)] overflow-y-auto overscroll-contain sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Añadir cuenta</DialogTitle>
              <DialogDescription>
                Prepara la conexión de una cuenta real, fondeo, Darwinex o bot.
                La activación final se completará con el launcher y permisos de MT5.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  title: "Conectar MT5",
                  description: "Alta guiada con login, servidor y broker.",
                  enabled: true,
                },
                {
                  title: "Importar cuenta",
                  description: "Crear ficha y vincular datos cuando estén disponibles.",
                  enabled: false,
                },
                {
                  title: "Cuenta manual",
                  description: "Preparar una cuenta para revisar estructura y permisos.",
                  enabled: false,
                },
              ].map((option) => (
                <button
                  className="flex min-h-32 flex-col justify-between rounded-xl border border-border/70 bg-background/45 p-4 text-left transition-colors hover:bg-muted/55 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
                  disabled={!option.enabled || linkPending}
                  key={option.title}
                  onClick={() => {
                    if (option.enabled) void prepareLauncherAccount();
                  }}
                  type="button"
                >
                  <span className="text-sm font-semibold">{option.title}</span>
                  <span className="text-xs leading-5 text-muted-foreground">
                    {option.description}
                  </span>
                  {!option.enabled ? (
                    <span className="mt-3 text-[11px] font-medium text-muted-foreground">
                      Próximamente
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            <div
              aria-live="polite"
              className="rounded-xl border border-border/70 bg-background/45 p-4"
            >
              <p
                className={
                  linkState.status === "error"
                    ? "text-sm text-destructive"
                    : "text-sm text-muted-foreground"
                }
              >
                {linkState.message ||
                  "Conectar MT5 crea una cuenta pendiente y una KMFX Key para el EA."}
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
            </div>

            <p className="rounded-xl bg-muted/45 px-4 py-3 text-xs leading-5 text-muted-foreground">
              No se guardan contraseñas ni se abre MT5 desde esta pantalla.
              La cuenta queda pendiente hasta que el EA envíe la primera sincronización completa.
            </p>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddAccountOpen(false)}
              >
                Cerrar
              </Button>
              <Button
                disabled={linkPending}
                type="button"
                onClick={() => void prepareLauncherAccount()}
              >
                {linkPending ? "Preparando..." : "Generar KMFX Key"}
              </Button>
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
