"use client";

import Link from "next/link";
import * as React from "react";
import { useRouter } from "next/navigation";
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
import { GoogleIcon } from "@/components/icons/google-icon";
import { LogoMark, LogoWordmark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  createBrowserSupabaseClient,
  type BrowserSupabasePublicConfig,
} from "@/lib/supabase/client";
import {
  resolveSupabasePublishableKey,
  resolveSupabaseUrl,
} from "@/lib/supabase/config";

declare global {
  interface Window {
    turnstile?: {
      getResponse?: (widgetId: string) => string | undefined;
      remove?: (widgetId: string) => void;
      render: (
        container: HTMLElement,
        options: {
          action?: string;
          appearance?: "always" | "execute" | "interaction-only";
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          language?: "auto" | string;
          sitekey: string;
          size?: "normal" | "compact" | "flexible";
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
    title: "Mesa de Riesgo",
    description: "Reglas y límites listos para evolucionar hacia protección operativa.",
  },
  {
    icon: CalendarDaysIcon,
    title: "Calendario",
    description: "Sesiones, días clave y eventos macro cerca de la operativa.",
  },
];

type AuthMode = "sign-in" | "sign-up";
type AuthConfigStatus = "idle" | "loading" | "failed";
type AuthStatus = "idle" | "loading";
type TurnstileStatus = "disabled" | "error" | "loading" | "ready";

type AuthPublicConfig = BrowserSupabasePublicConfig & {
  turnstileSiteKey: string;
};

type AuthPageProps = {
  initialPublicConfig?: Partial<AuthPublicConfig>;
  nextPath?: string;
};

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

const TURNSTILE_TOKEN_WAIT_MS = 12000;

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getInitialAuthPublicConfig(
  initialPublicConfig?: Partial<AuthPublicConfig>,
): AuthPublicConfig {
  return {
    supabasePublishableKey:
      readString(initialPublicConfig?.supabasePublishableKey) ||
      resolveSupabasePublishableKey(),
    supabaseUrl:
      readString(initialPublicConfig?.supabaseUrl) || resolveSupabaseUrl(),
    turnstileSiteKey:
      readString(initialPublicConfig?.turnstileSiteKey) ||
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ||
      "",
  };
}

function hasAuthPublicConfig(config: AuthPublicConfig) {
  return Boolean(config.supabaseUrl.trim() && config.supabasePublishableKey.trim());
}

function isCaptchaAuthError(error: unknown) {
  const value = error as { code?: unknown; message?: unknown; name?: unknown };
  return [value.code, value.message, value.name].some((field) =>
    String(field || "")
      .toLowerCase()
      .includes("captcha"),
  );
}

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

function useAuthPageModel(
  nextPath: string,
  initialPublicConfig?: Partial<AuthPublicConfig>,
) {
  const router = useRouter();
  const resolvedInitialPublicConfig = React.useMemo(
    () => getInitialAuthPublicConfig(initialPublicConfig),
    [initialPublicConfig],
  );
  const [authForm, dispatchAuthForm] = React.useReducer(
    authFormReducer,
    INITIAL_AUTH_FORM_STATE,
  );
  const { authMode, email, message, password, status } = authForm;
  const captchaTokenRef = React.useRef("");
  const captchaTokenWaitersRef = React.useRef<
    Array<{
      reject: (error: Error) => void;
      resolve: (token: string) => void;
      timeoutId: ReturnType<typeof setTimeout>;
    }>
  >([]);
  const turnstileContainerRef = React.useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = React.useRef<string | null>(null);
  const turnstileRetryTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [publicAuthConfig, setPublicAuthConfig] = React.useState<AuthPublicConfig>(
    resolvedInitialPublicConfig,
  );
  const [authConfigStatus, setAuthConfigStatus] =
    React.useState<AuthConfigStatus>(() =>
      hasAuthPublicConfig(resolvedInitialPublicConfig) ? "idle" : "loading",
    );
  const authConfigured = hasAuthPublicConfig(publicAuthConfig);
  const turnstileSiteKey = publicAuthConfig.turnstileSiteKey;
  const [turnstileStatus, setTurnstileStatus] =
    React.useState<TurnstileStatus>(() =>
      turnstileSiteKey ? "loading" : "disabled",
    );

  React.useEffect(() => {
    if (authConfigured) {
      return;
    }

    let cancelled = false;

    async function loadPublicConfig() {
      try {
        const response = await fetch("/api/kmfx/public-auth-config", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Public auth config request failed");
        }

        const payload = (await response.json()) as Record<string, unknown>;
        if (cancelled) {
          return;
        }

        const nextConfig: AuthPublicConfig = {
          supabasePublishableKey: readString(payload.supabasePublishableKey),
          supabaseUrl: readString(payload.supabaseUrl),
          turnstileSiteKey: readString(payload.turnstileSiteKey),
        };

        setPublicAuthConfig(nextConfig);
        setAuthConfigStatus(hasAuthPublicConfig(nextConfig) ? "idle" : "failed");
      } catch {
        if (!cancelled) {
          setAuthConfigStatus("failed");
        }
      }
    }

    void loadPublicConfig();

    return () => {
      cancelled = true;
    };
  }, [authConfigured]);

  const writeCaptchaToken = React.useCallback((token: string) => {
    captchaTokenRef.current = token;
    if (!token) return;

    const waiters = captchaTokenWaitersRef.current;
    captchaTokenWaitersRef.current = [];
    waiters.forEach((waiter) => {
      clearTimeout(waiter.timeoutId);
      waiter.resolve(token);
    });
  }, []);

  const rejectCaptchaTokenWaiters = React.useCallback((message: string) => {
    const waiters = captchaTokenWaitersRef.current;
    captchaTokenWaitersRef.current = [];
    waiters.forEach((waiter) => {
      clearTimeout(waiter.timeoutId);
      waiter.reject(new Error(message));
    });
  }, []);

  const readCaptchaToken = React.useCallback(() => {
    const token = captchaTokenRef.current;
    if (token) return token;

    const widgetId = turnstileWidgetIdRef.current;
    if (!widgetId) return "";

    return window.turnstile?.getResponse?.(widgetId) || "";
  }, []);

  const waitForCaptchaToken = React.useCallback(() => {
    const token = readCaptchaToken();
    if (token) return Promise.resolve(token);

    return new Promise<string>((resolve, reject) => {
      const waiter = {
        reject,
        resolve,
        timeoutId: setTimeout(() => {
          captchaTokenWaitersRef.current = captchaTokenWaitersRef.current.filter(
            (entry) => entry !== waiter,
          );
          reject(new Error("turnstile_timeout"));
        }, TURNSTILE_TOKEN_WAIT_MS),
      };

      captchaTokenWaitersRef.current = [
        ...captchaTokenWaitersRef.current,
        waiter,
      ];
    });
  }, [readCaptchaToken]);

  const resetTurnstile = React.useCallback(() => {
    writeCaptchaToken("");
    rejectCaptchaTokenWaiters("turnstile_reset");
    const widgetId = turnstileWidgetIdRef.current;
    if (widgetId && window.turnstile?.reset) {
      setTurnstileStatus("loading");
      window.turnstile.reset(widgetId);
    }
  }, [rejectCaptchaTokenWaiters, writeCaptchaToken]);

  const scheduleTurnstileRetry = React.useCallback((retry: () => void) => {
    if (turnstileRetryTimeoutRef.current) {
      clearTimeout(turnstileRetryTimeoutRef.current);
    }

    turnstileRetryTimeoutRef.current = setTimeout(() => {
      turnstileRetryTimeoutRef.current = null;
      retry();
    }, 1200);
  }, []);

  React.useEffect(() => {
    if (!authConfigured || !turnstileSiteKey || !turnstileContainerRef.current) {
      setTurnstileStatus(turnstileSiteKey ? "loading" : "disabled");
      return;
    }

    let cancelled = false;
    let renderedWidgetId: string | null = null;
    let scriptWithLoadListener: HTMLElement | null = null;
    const clearRenderedWidget = () => {
      const widgetId = renderedWidgetId || turnstileWidgetIdRef.current;
      if (widgetId && window.turnstile?.remove) {
        window.turnstile.remove(widgetId);
      }
      renderedWidgetId = null;
      turnstileWidgetIdRef.current = null;
      turnstileContainerRef.current?.replaceChildren();
    };

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

      setTurnstileStatus("loading");
      renderedWidgetId = window.turnstile.render(turnstileContainerRef.current, {
        action: authMode === "sign-up" ? "signup" : "signin",
        callback: (token) => {
          writeCaptchaToken(token || "");
          setTurnstileStatus(token ? "ready" : "loading");
          dispatchAuthForm({ type: "clearMessage" });
        },
        "error-callback": () => {
          writeCaptchaToken("");
          setTurnstileStatus("error");
          rejectCaptchaTokenWaiters("turnstile_error");
          clearRenderedWidget();
          scheduleTurnstileRetry(renderTurnstile);
          dispatchAuthForm({
            type: "setMessage",
            message:
              "La verificación anti-bots se ha reiniciado. Espera un momento y vuelve a intentarlo.",
          });
        },
        "expired-callback": () => {
          writeCaptchaToken("");
          setTurnstileStatus("loading");
          rejectCaptchaTokenWaiters("turnstile_expired");
          clearRenderedWidget();
          scheduleTurnstileRetry(renderTurnstile);
          dispatchAuthForm({
            type: "setMessage",
            message:
              "La verificación ha caducado. La estamos recargando para que puedas intentarlo otra vez.",
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
      rejectCaptchaTokenWaiters("turnstile_unmounted");
      if (turnstileRetryTimeoutRef.current) {
        clearTimeout(turnstileRetryTimeoutRef.current);
        turnstileRetryTimeoutRef.current = null;
      }
      scriptWithLoadListener?.removeEventListener("load", renderTurnstile);
      clearRenderedWidget();
    };
  }, [
    authConfigured,
    authMode,
    rejectCaptchaTokenWaiters,
    scheduleTurnstileRetry,
    turnstileSiteKey,
    writeCaptchaToken,
  ]);

  async function handlePasswordAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatchAuthForm({ type: "clearMessage" });

    if (!authConfigured) {
      dispatchAuthForm({
        type: "setMessage",
        message:
          authConfigStatus === "loading"
            ? "Preparando acceso seguro. Vuelve a intentarlo en unos segundos."
            : "No se pudo cargar el acceso seguro. Recarga e inténtalo de nuevo.",
      });
      return;
    }

    dispatchAuthForm({ type: "setStatus", status: "loading" });

    try {
      let captchaToken = readCaptchaToken();

      if (turnstileSiteKey && !captchaToken) {
        try {
          captchaToken = await waitForCaptchaToken();
        } catch {
          dispatchAuthForm({
            type: "setMessage",
            message:
              "Cloudflare no ha terminado la verificación. Espera unos segundos y vuelve a intentarlo.",
          });
          resetTurnstile();
          return;
        }
      }

      const supabase = createBrowserSupabaseClient(publicAuthConfig);
      const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      let authResult =
        authMode === "sign-up"
          ? await supabase.auth.signUp({
              email,
              options: {
                ...(captchaToken ? { captchaToken } : {}),
                emailRedirectTo,
                data: {
                  kmfx_trial_days: 7,
                  kmfx_trial_source: "public_signup",
                },
              },
              password,
            })
          : await supabase.auth.signInWithPassword({
              email,
              options: captchaToken ? { captchaToken } : undefined,
              password,
            });
      let { data, error } = authResult;

      if (authMode === "sign-in" && error && !captchaToken && isCaptchaAuthError(error)) {
        const retryCaptchaToken = readCaptchaToken();
        if (retryCaptchaToken) {
          authResult = await supabase.auth.signInWithPassword({
            email,
            options: { captchaToken: retryCaptchaToken },
            password,
          });
          data = authResult.data;
          error = authResult.error;
        }
      }

      if (error) {
        dispatchAuthForm({
          type: "setMessage",
          message: isCaptchaAuthError(error)
            ? "No se pudo validar Cloudflare. Espera unos segundos y vuelve a intentarlo."
            : authMode === "sign-up"
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
    } catch {
      dispatchAuthForm({
        type: "setMessage",
        message:
          authMode === "sign-up" && turnstileSiteKey && !captchaTokenRef.current
            ? "Cloudflare está tardando demasiado. Vuelve a intentarlo en unos segundos."
            : "No se pudo conectar con el acceso seguro.",
      });
    } finally {
      dispatchAuthForm({ type: "setStatus", status: "idle" });
    }
  }

  async function signInWithProvider(provider: "google") {
    dispatchAuthForm({ type: "clearMessage" });

    if (!authConfigured) {
      dispatchAuthForm({
        type: "setMessage",
        message:
          authConfigStatus === "loading"
            ? "Preparando acceso seguro. Vuelve a intentarlo en unos segundos."
            : "No se pudo cargar el acceso seguro. Recarga e inténtalo de nuevo.",
      });
      return;
    }

    dispatchAuthForm({ type: "setStatus", status: "loading" });

    try {
      const supabase = createBrowserSupabaseClient(publicAuthConfig);
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          queryParams: { prompt: "select_account" },
        },
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
  const canSubmitPasswordAuth =
    status !== "loading" &&
    (authConfigured
      ? !turnstileSiteKey || turnstileStatus === "ready"
      : authConfigStatus !== "loading");

  const setAuthMode = React.useCallback(
    (nextAuthMode: AuthMode) => {
      dispatchAuthForm({
        type: "setMode",
        authMode: nextAuthMode,
      });
      resetTurnstile();
    },
    [resetTurnstile],
  );

  const setEmail = React.useCallback((nextEmail: string) => {
    dispatchAuthForm({
      type: "setEmail",
      email: nextEmail,
    });
  }, []);

  const setPassword = React.useCallback((nextPassword: string) => {
    dispatchAuthForm({
      type: "setPassword",
      password: nextPassword,
    });
  }, []);

  return {
    authConfigured,
    authConfigStatus,
    authMode,
    email,
    handlePasswordAuth,
    message,
    messageIsSuccess,
    password,
    canSubmitPasswordAuth,
    setAuthMode,
    setEmail,
    setPassword,
    signInWithProvider,
    status,
    turnstileContainerRef,
    turnstileSiteKey,
    turnstileStatus,
  };
}

type AuthPageModel = ReturnType<typeof useAuthPageModel>;

const AuthHero = React.memo(function AuthHero() {
  return (
    <section
      className="relative hidden min-h-svh overflow-hidden border-r border-border/70 lg:flex"
      style={{
        backgroundImage:
          "radial-gradient(circle at 20% 20%, var(--muted) 0, transparent 32%), linear-gradient(180deg, var(--background), color-mix(in oklch, var(--muted) 28%, transparent))",
      }}
    >
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
          <h1 className="max-w-xl text-4xl leading-tight font-semibold tracking-tight text-balance xl:text-6xl">
            Entra, revisa tu cuenta y decide sin ruido.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 font-light text-white/85 xl:text-lg">
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
  );
});

function ProviderButtons({
  signInWithProvider,
  status,
}: Pick<AuthPageModel, "signInWithProvider" | "status">) {
  return (
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
    </div>
  );
}

function AuthModeTabs({
  authMode,
  setAuthMode,
  status,
}: Pick<AuthPageModel, "authMode" | "setAuthMode" | "status">) {
  return (
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
          onClick={() => setAuthMode(option.mode)}
          role="tab"
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function EmailPasswordForm({
  authConfigStatus,
  authConfigured,
  authMode,
  canSubmitPasswordAuth,
  email,
  handlePasswordAuth,
  message,
  messageIsSuccess,
  password,
  setEmail,
  setPassword,
  status,
  turnstileContainerRef,
  turnstileStatus,
}: Pick<
  AuthPageModel,
  | "authConfigStatus"
  | "authConfigured"
  | "authMode"
  | "canSubmitPasswordAuth"
  | "email"
  | "handlePasswordAuth"
  | "message"
  | "messageIsSuccess"
  | "password"
  | "setEmail"
  | "setPassword"
  | "status"
  | "turnstileContainerRef"
  | "turnstileStatus"
>) {
  const submitLabel =
    status === "loading"
      ? "Validando..."
      : !authConfigured && authConfigStatus === "loading"
        ? "Preparando acceso..."
        : !canSubmitPasswordAuth && turnstileStatus !== "disabled"
        ? "Verificando..."
        : authMode === "sign-up"
          ? "Crear cuenta con email"
          : "Continuar con email";

  return (
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
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tu@email.com"
              required
              type="email"
              value={email}
            />
          </InputGroup>
          <FieldDescription>
            {authMode === "sign-up"
              ? "Usaremos este email para activar tu prueba de 7 días gratis."
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
              onChange={(event) => setPassword(event.target.value)}
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

      <div
        ref={turnstileContainerRef}
        className="min-h-[65px] overflow-hidden rounded-xl"
        data-turnstile-container=""
      />
      {turnstileStatus === "loading" ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Cloudflare está preparando la verificación segura.
        </p>
      ) : null}

      <Button
        className="h-10 rounded-xl"
        disabled={!canSubmitPasswordAuth}
        type="submit"
      >
        {submitLabel}
        <ChevronRightIcon data-icon="inline-end" />
      </Button>
    </form>
  );
}

function AuthPanel(model: AuthPageModel) {
  const { authMode } = model;

  return (
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
                ? "Regístrate y activa 7 días gratis para probar KMFX Edge."
                : "Accede a tu panel de trading y gestión de cuentas."}
            </p>
          </div>
        </div>

        <ProviderButtons {...model} />

        <AuthDivider>o</AuthDivider>

        <AuthModeTabs {...model} />

        <EmailPasswordForm {...model} />

        <p className="text-center text-sm leading-6 text-muted-foreground">
          Al continuar aceptas los términos de KMFX Edge y la política de privacidad.
        </p>
      </div>
    </section>
  );
}

export function AuthPage({
  initialPublicConfig,
  nextPath = "/dashboard",
}: AuthPageProps) {
  const model = useAuthPageModel(nextPath, initialPublicConfig);

  return (
    <main className="dark relative min-h-svh overflow-hidden bg-background text-foreground lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <AuthHero />
      <AuthPanel {...model} />
    </main>
  );
}
