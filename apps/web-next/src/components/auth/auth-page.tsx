"use client";

import Link from "next/link";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  AtSignIcon,
  CalendarDaysIcon,
  ChartNoAxesCombinedIcon,
  ChevronRightIcon,
  Layers3Icon,
  LockKeyholeIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { AuthDivider } from "@/components/auth-divider";
import { FloatingPaths } from "@/components/floating-paths";
import { AppleIcon } from "@/components/icons/apple-icon";
import { GithubIcon } from "@/components/icons/github-icon";
import { GoogleIcon } from "@/components/icons/google-icon";
import { LogoMark, LogoWordmark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { hasSupabasePublicConfig } from "@/lib/supabase/config";

declare global {
  interface Window {
    turnstile?: {
      remove?: (widgetId: string) => void;
      render: (
        container: HTMLElement,
        options: {
          action?: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          sitekey: string;
          theme?: "auto" | "dark" | "light";
        },
      ) => string;
      reset?: (widgetId: string) => void;
    };
  }
}

const accessHighlights = [
  {
    icon: ChartNoAxesCombinedIcon,
    title: "Panel operativo",
    description: "Capital, PnL, win rate, drawdown y cuenta activa en una lectura rápida.",
  },
  {
    icon: Layers3Icon,
    title: "Multi-cuenta",
    description: "Cuentas reales, fondeo y Darwinex preparadas en un mismo entorno.",
  },
  {
    icon: ShieldCheckIcon,
    title: "RiskGuard",
    description: "Reglas y límites listos para evolucionar hacia protección operativa.",
  },
  {
    icon: CalendarDaysIcon,
    title: "Calendario",
    description: "Sesiones, días clave y eventos macro cerca de la operativa.",
  },
];

type AuthMode = "sign-in" | "sign-up";
type AuthStatus = "idle" | "loading";

type AuthFormState = {
  authMode: AuthMode;
  email: string;
  message: string;
  password: string;
  status: AuthStatus;
};

type AuthFormAction =
  | { type: "clearMessage" }
  | { type: "setEmail"; email: string }
  | { type: "setMessage"; message: string }
  | { type: "setMode"; authMode: AuthMode }
  | { type: "setPassword"; password: string }
  | { type: "setStatus"; status: AuthStatus };

const INITIAL_AUTH_FORM_STATE: AuthFormState = {
  authMode: "sign-in",
  email: "",
  message: "",
  password: "",
  status: "idle",
};

function authFormReducer(
  state: AuthFormState,
  action: AuthFormAction,
): AuthFormState {
  switch (action.type) {
    case "clearMessage":
      return state.message ? { ...state, message: "" } : state;
    case "setEmail":
      return { ...state, email: action.email };
    case "setMessage":
      return { ...state, message: action.message };
    case "setMode":
      return { ...state, authMode: action.authMode, message: "" };
    case "setPassword":
      return { ...state, password: action.password };
    case "setStatus":
      return { ...state, status: action.status };
  }
}

export function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authForm, dispatchAuthForm] = React.useReducer(
    authFormReducer,
    INITIAL_AUTH_FORM_STATE,
  );
  const { authMode, email, message, password, status } = authForm;
  const captchaTokenRef = React.useRef("");
  const turnstileContainerRef = React.useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = React.useRef<string | null>(null);
  const nextPath = searchParams.get("next") || "/dashboard";
  const authConfigured = hasSupabasePublicConfig();
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ||
    "0x4AAAAAACxJdw3wjMn7Jm0K";

  const setCaptchaToken = React.useCallback((token: string) => {
    captchaTokenRef.current = token;
  }, []);

  const resetTurnstile = React.useCallback(() => {
    setCaptchaToken("");
    const widgetId = turnstileWidgetIdRef.current;
    if (widgetId && window.turnstile?.reset) {
      window.turnstile.reset(widgetId);
    }
  }, [setCaptchaToken]);

  React.useEffect(() => {
    if (!authConfigured || !turnstileSiteKey || !turnstileContainerRef.current) {
      return;
    }

    let cancelled = false;
    let renderedWidgetId: string | null = null;
    let scriptWithLoadListener: HTMLElement | null = null;
    const renderTurnstile = () => {
      if (
        cancelled ||
        !turnstileContainerRef.current ||
        !window.turnstile?.render ||
        renderedWidgetId
      ) {
        return;
      }

      const theme =
        document.documentElement.getAttribute("data-theme") === "dark"
          ? "dark"
          : "light";

      renderedWidgetId = window.turnstile.render(turnstileContainerRef.current, {
        action: authMode === "sign-up" ? "signup" : "signin",
        callback: (token) => setCaptchaToken(token || ""),
        "error-callback": () => {
          setCaptchaToken("");
          dispatchAuthForm({
            type: "setMessage",
            message: "No hemos podido validar la protección anti-bots.",
          });
        },
        "expired-callback": () => {
          setCaptchaToken("");
          dispatchAuthForm({
            type: "setMessage",
            message: "La verificación ha caducado. Vuelve a intentarlo.",
          });
        },
        sitekey: turnstileSiteKey,
        theme,
      });
      turnstileWidgetIdRef.current = renderedWidgetId;
    };

    if (window.turnstile?.render) {
      renderTurnstile();
    } else {
      const existingScript = document.getElementById("kmfx-turnstile-script");
      if (existingScript) {
        existingScript.addEventListener("load", renderTurnstile, { once: true });
        scriptWithLoadListener = existingScript;
      } else {
        const script = document.createElement("script");
        script.async = true;
        script.defer = true;
        script.id = "kmfx-turnstile-script";
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.addEventListener("load", renderTurnstile, { once: true });
        scriptWithLoadListener = script;
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      scriptWithLoadListener?.removeEventListener("load", renderTurnstile);
      if (renderedWidgetId && window.turnstile?.remove) {
        window.turnstile.remove(renderedWidgetId);
      }
    };
  }, [authConfigured, authMode, setCaptchaToken, turnstileSiteKey]);

  async function handlePasswordAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatchAuthForm({ type: "clearMessage" });

    if (!authConfigured) {
      dispatchAuthForm({
        type: "setMessage",
        message: "El acceso real todavía no está configurado en este entorno.",
      });
      return;
    }

    const captchaToken = captchaTokenRef.current;

    if (turnstileSiteKey && !captchaToken) {
      dispatchAuthForm({
        type: "setMessage",
        message: "Completa la verificación para continuar.",
      });
      return;
    }

    dispatchAuthForm({ type: "setStatus", status: "loading" });

    try {
      const supabase = createBrowserSupabaseClient();
      const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const { data, error } =
        authMode === "sign-up"
          ? await supabase.auth.signUp({
              email,
              options: captchaToken
                ? { captchaToken, emailRedirectTo }
                : { emailRedirectTo },
              password,
            })
          : await supabase.auth.signInWithPassword({
              email,
              options: captchaToken ? { captchaToken } : undefined,
              password,
            });

      if (error) {
        dispatchAuthForm({
          type: "setMessage",
          message:
            authMode === "sign-up"
              ? "No se pudo crear la cuenta. Revisa el email, la contraseña o si ya existe."
              : "Email o contraseña incorrectos.",
        });
        resetTurnstile();
        return;
      }

      if (authMode === "sign-up" && !data.session) {
        dispatchAuthForm({
          type: "setMessage",
          message: "Cuenta creada. Revisa tu email para confirmar el acceso.",
        });
        resetTurnstile();
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      dispatchAuthForm({
        type: "setMessage",
        message: "No se pudo conectar con el acceso seguro.",
      });
    } finally {
      dispatchAuthForm({ type: "setStatus", status: "idle" });
    }
  }

  async function signInWithProvider(provider: "google" | "apple" | "github") {
    dispatchAuthForm({ type: "clearMessage" });

    if (!authConfigured) {
      dispatchAuthForm({
        type: "setMessage",
        message: "El acceso real todavía no está configurado en este entorno.",
      });
      return;
    }

    dispatchAuthForm({ type: "setStatus", status: "loading" });

    try {
      const supabase = createBrowserSupabaseClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });

      if (error) {
        dispatchAuthForm({
          type: "setMessage",
          message: "No se pudo abrir el proveedor de acceso.",
        });
        dispatchAuthForm({ type: "setStatus", status: "idle" });
      }
    } catch {
      dispatchAuthForm({
        type: "setMessage",
        message: "No se pudo conectar con el acceso seguro.",
      });
      dispatchAuthForm({ type: "setStatus", status: "idle" });
    }
  }

  const messageIsSuccess = message.startsWith("Cuenta creada.");

  return (
    <main className="relative min-h-svh overflow-hidden bg-background text-foreground lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden min-h-svh overflow-hidden border-r border-border/70 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--muted))_0,transparent_32%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)/0.28))] lg:flex">
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />

        <div className="relative z-10 flex min-h-svh w-full flex-col justify-between p-10 xl:p-12">
          <div className="flex items-center gap-3">
            <LogoMark
              className="size-11 rounded-full ring-1 ring-border shadow-[0_20px_80px_rgba(0,0,0,0.25)]"
              priority
              sizes="44px"
            />
            <div className="flex flex-col">
              <LogoWordmark className="text-lg" />
            </div>
          </div>

          <div className="max-w-2xl">
            <p className="mb-4 text-sm font-medium tracking-[0.28em] text-muted-foreground uppercase">
              Acceso seguro
            </p>
            <h1 className="max-w-xl text-4xl leading-tight font-semibold tracking-tight text-balance xl:text-6xl">
              Entra, revisa tu cuenta y decide sin ruido.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground xl:text-lg">
              KMFX centraliza cuenta, calendario, trades, portfolio e insights para que
              el trader vea lo importante antes de tocar el botón de entrada.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-border bg-border/70">
            {accessHighlights.map((item) => (
              <div
                className="flex min-h-36 flex-col justify-between bg-card/90 p-5"
                key={item.title}
              >
                <item.icon className="size-5 text-muted-foreground" />
                <div className="flex flex-col gap-1.5">
                  <h2 className="text-sm font-semibold">{item.title}</h2>
                  <p className="text-sm leading-5 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative flex min-h-svh items-center justify-center px-5 py-10 sm:px-8 lg:px-10">
        <Button
          className="absolute top-5 left-5 text-muted-foreground"
          render={<Link href="/dashboard" />}
          nativeButton={false}
          variant="ghost"
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Volver al panel
        </Button>

        <div className="flex w-full max-w-md flex-col gap-8">
          <div className="flex flex-col gap-3 text-center">
            <LogoMark
              className="mx-auto size-12 rounded-full ring-1 ring-border"
              priority
              sizes="48px"
            />
            <div className="flex flex-col gap-2">
              <h2 className="text-3xl font-semibold tracking-tight">
                {authMode === "sign-up" ? "Crea tu cuenta" : "Inicia sesión"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {authMode === "sign-up"
                  ? "Regístrate con un email nuevo para probar la beta."
                  : "Accede a tu panel de trading y gestión de cuentas."}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              disabled={status === "loading"}
              onClick={() => void signInWithProvider("google")}
              type="button"
              variant="outline"
            >
              <GoogleIcon data-icon="inline-start" />
              Continuar con Google
            </Button>
            <Button
              disabled={status === "loading"}
              onClick={() => void signInWithProvider("apple")}
              type="button"
              variant="outline"
            >
              <AppleIcon data-icon="inline-start" />
              Continuar con Apple
            </Button>
            <Button
              disabled={status === "loading"}
              onClick={() => void signInWithProvider("github")}
              type="button"
              variant="outline"
            >
              <GithubIcon data-icon="inline-start" />
              Continuar con GitHub
            </Button>
          </div>

          <AuthDivider>o</AuthDivider>

          <div
            aria-label="Modo de acceso"
            className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/30 p-1"
            role="tablist"
          >
            {[
              { label: "Entrar", mode: "sign-in" as const },
              { label: "Crear cuenta", mode: "sign-up" as const },
            ].map((option) => (
              <button
                aria-selected={authMode === option.mode}
                className="h-9 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-sm"
                disabled={status === "loading"}
                key={option.mode}
                onClick={() => {
                  dispatchAuthForm({
                    type: "setMode",
                    authMode: option.mode,
                  });
                  resetTurnstile();
                }}
                role="tab"
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>

          <form className="flex flex-col gap-5" onSubmit={handlePasswordAuth}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <InputGroup className="h-10 rounded-xl">
                  <InputGroupAddon align="inline-start">
                    <AtSignIcon className="size-4" />
                  </InputGroupAddon>
                  <InputGroupInput
                    autoComplete="email"
                    disabled={status === "loading"}
                    id="email"
                    onChange={(event) =>
                      dispatchAuthForm({
                        type: "setEmail",
                        email: event.target.value,
                      })
                    }
                    placeholder="tu@email.com"
                    required
                    type="email"
                    value={email}
                  />
                </InputGroup>
                <FieldDescription>
                  {authMode === "sign-up"
                    ? "Usaremos este email para crear tu acceso de beta."
                    : "Usaremos este email para validar el acceso a tu cuenta."}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Contraseña</FieldLabel>
                <InputGroup className="h-10 rounded-xl">
                  <InputGroupAddon align="inline-start">
                    <LockKeyholeIcon className="size-4" />
                  </InputGroupAddon>
                  <InputGroupInput
                    autoComplete={authMode === "sign-up" ? "new-password" : "current-password"}
                    disabled={status === "loading"}
                    id="password"
                    onChange={(event) =>
                      dispatchAuthForm({
                        type: "setPassword",
                        password: event.target.value,
                      })
                    }
                    placeholder="Tu contraseña"
                    required
                    type="password"
                    value={password}
                  />
                </InputGroup>
              </Field>
            </FieldGroup>

            {message ? (
              <p
                className={
                  messageIsSuccess
                    ? "flex items-center gap-2 text-sm text-emerald-500"
                    : "flex items-center gap-2 text-sm text-destructive"
                }
              >
                <AlertCircleIcon className="size-4" />
                {message}
              </p>
            ) : null}

            {authConfigured && turnstileSiteKey ? (
              <div
                ref={turnstileContainerRef}
                className="min-h-[65px] overflow-hidden rounded-xl"
              />
            ) : null}

            <Button
              className="h-10 rounded-xl"
              disabled={status === "loading"}
              type="submit"
            >
              {status === "loading"
                ? "Validando..."
                : authMode === "sign-up"
                  ? "Crear cuenta con email"
                  : "Continuar con email"}
              <ChevronRightIcon data-icon="inline-end" />
            </Button>
          </form>

          <p className="text-center text-sm leading-6 text-muted-foreground">
            Al continuar aceptas los términos de KMFX Edge y la política de privacidad.
          </p>
        </div>
      </section>
    </main>
  );
}
