import { supabase } from "../lib/supabase.js?v=build-20260406-213500";
import { normalizeAvatarUrl } from "./avatar-utils.js?v=build-20260406-213500";

const AUTH_STORAGE_KEY = "kmfx.auth.session.v1";
const LEGACY_PROFILE_STORAGE_KEY = "kmfx.settings.profile";
const RECOVERY_STATE_KEY = "kmfx.auth.recovery.v1";

export const AUTH_PROVIDER_IDS = ["email", "google", "apple", "local"];

export const DEFAULT_AUTH_USER = {
  id: "local-dev-user",
  name: "Kevin C.",
  email: "kevin@kmfxedge.local",
  avatar: null,
  initials: "KC",
  provider: "local",
  role: "user",
  is_admin: false
};

export const DEFAULT_AUTH_PROFILE = {
  discord: "@kevin.kmfx",
  defaultAccount: "sandbox"
};

export const DEFAULT_AUTH_STATE = {
  status: "anonymous",
  provider: "local",
  session: {
    accessToken: null,
    refreshToken: null,
    expiresAt: null
  },
  user: { ...DEFAULT_AUTH_USER },
  profile: { ...DEFAULT_AUTH_PROFILE }
};

const DEFAULT_RECOVERY_STATE = {
  active: false,
  email: "",
  updatedAt: null
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

function safeRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // noop
  }
}

function sanitizeRecoveryState(input = {}) {
  return {
    active: Boolean(input.active),
    email: String(input.email || "").trim().toLowerCase(),
    updatedAt: input.updatedAt || null
  };
}

function readPersistedRecoveryState() {
  const raw = safeGet(RECOVERY_STATE_KEY);
  if (!raw) return { ...DEFAULT_RECOVERY_STATE };
  try {
    return sanitizeRecoveryState(JSON.parse(raw) || {});
  } catch {
    return { ...DEFAULT_RECOVERY_STATE };
  }
}

function persistRecoveryState(recoveryState = DEFAULT_RECOVERY_STATE) {
  const sanitized = sanitizeRecoveryState(recoveryState);
  if (!sanitized.active && !sanitized.email) {
    safeRemove(RECOVERY_STATE_KEY);
    return sanitized;
  }
  safeSet(RECOVERY_STATE_KEY, JSON.stringify(sanitized));
  return sanitized;
}

function getRecoveryHintFromUrl() {
  const hashParams = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
  const searchParams = new URLSearchParams(window.location.search || "");
  const type = hashParams.get("type") || searchParams.get("type") || searchParams.get("auth");
  return type === "recovery";
}

function clearRecoveryUrlState() {
  const url = new URL(window.location.href);
  url.searchParams.delete("auth");
  url.searchParams.delete("type");
  const nextUrl = `${url.pathname}${url.search}${url.hash && !url.hash.includes("access_token") ? url.hash : ""}`;
  window.history.replaceState({}, document.title, nextUrl || window.location.pathname);
}

function resolveOAuthRedirectUrl() {
  const { protocol, hostname, port, pathname } = window.location;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  const isLocalDev = isLocalhost || protocol === "file:";

  if (isLocalDev) {
    const origin = protocol === "file:" ? "http://localhost:3000" : `${window.location.origin}`;
    return `${origin}${pathname || "/"}`;
  }

  return "https://dashboard.kmfxedge.com";
}

function normalizeAuthError(error, fallback = "No se pudo completar la autenticación.") {
  const code = String(error?.code || error?.error_code || error?.name || "").toLowerCase();
  const message = String(error?.message || error || "").trim();
  const normalized = `${code} ${message}`.toLowerCase();

  if (normalized.includes("invalid_credentials") || normalized.includes("invalid login credentials")) {
    return "Email o contraseña incorrectos.";
  }
  if (normalized.includes("captcha") || normalized.includes("turnstile") || normalized.includes("hcaptcha") || normalized.includes("recaptcha") || normalized.includes("verification")) {
    return "No se pudo validar la verificación. Revisa la configuración de captcha e inténtalo de nuevo.";
  }
  if (normalized.includes("already registered") || normalized.includes("already exists") || normalized.includes("user already") || normalized.includes("email already")) {
    return "Este email ya está registrado. Inicia sesión o recupera la contraseña.";
  }
  if (normalized.includes("weak password") || (normalized.includes("password") && normalized.includes("weak"))) {
    return "La contraseña es demasiado débil. Usa una contraseña más segura.";
  }
  if (normalized.includes("failed to fetch") || normalized.includes("network") || normalized.includes("load failed")) {
    return "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.";
  }

  return message || fallback;
}

export function getInitialsFromAuthName(name = "") {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase()
    .slice(0, 3);
}

function sanitizeAuthUser(user = {}) {
  const email = String(user.email || "").trim();
  const fallbackName = email ? formatNameFromEmail(email) : DEFAULT_AUTH_USER.name;
  const name = String(user.name || fallbackName).trim() || fallbackName;
  const isAdmin = user.is_admin === true || user.role === "admin";
  const role = isAdmin ? "admin" : "user";
  return {
    id: String(user.id || DEFAULT_AUTH_USER.id),
    name,
    email: email || DEFAULT_AUTH_USER.email,
    avatar: user.avatar || null,
    initials: String(user.initials || getInitialsFromAuthName(name) || DEFAULT_AUTH_USER.initials).slice(0, 3).toUpperCase(),
    provider: AUTH_PROVIDER_IDS.includes(user.provider) ? user.provider : DEFAULT_AUTH_USER.provider,
    role,
    is_admin: isAdmin
  };
}

function formatNameFromEmail(email = "") {
  const localPart = String(email || "")
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .trim();
  if (!localPart) return DEFAULT_AUTH_USER.name;
  return localPart
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sanitizeAuthProfile(profile = {}) {
  return {
    discord: String(profile.discord || DEFAULT_AUTH_PROFILE.discord),
    defaultAccount: String(profile.defaultAccount || DEFAULT_AUTH_PROFILE.defaultAccount)
  };
}

function buildAnonymousAuthState(currentAuth = DEFAULT_AUTH_STATE) {
  return sanitizeAuthState({
    ...currentAuth,
    status: "anonymous",
    provider: "local",
    session: {
      accessToken: null,
      refreshToken: null,
      expiresAt: null
    }
  });
}

function buildAuthStateFromSupabaseSession(session, currentAuth = DEFAULT_AUTH_STATE) {
  const user = session?.user;
  if (!user) return buildAnonymousAuthState(currentAuth);

  const metadata = user.user_metadata || {};
  const fullName = metadata.full_name || metadata.name || metadata.user_name || formatNameFromEmail(user.email || "");
  const provider = user.app_metadata?.provider || currentAuth.provider || "google";
  const avatarUrl = normalizeAvatarUrl(
    metadata.avatar_url
    || metadata.picture
    || metadata.image
    || metadata.photo_url
    || user.identities?.[0]?.identity_data?.avatar_url
    || user.identities?.[0]?.identity_data?.picture
    || null
  );

  console.info("[KMFX][AUTH] Supabase user payload", {
    id: user.id,
    email: user.email,
    provider,
    metadata,
    resolvedAvatar: avatarUrl
  });

  return sanitizeAuthState({
    ...currentAuth,
    status: "authenticated",
    provider,
    session: {
      accessToken: session.access_token || null,
      refreshToken: session.refresh_token || null,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null
    },
    user: {
      ...(currentAuth.user || {}),
      id: user.id,
      name: fullName,
      email: user.email || currentAuth.user?.email || DEFAULT_AUTH_USER.email,
      avatar: avatarUrl,
      initials: getInitialsFromAuthName(fullName),
      provider,
      role: metadata.role || user.app_metadata?.role || currentAuth.user?.role || "user"
    },
    profile: {
      ...(currentAuth.profile || {})
    }
  });
}

export function sanitizeAuthState(input = {}) {
  const user = sanitizeAuthUser(input.user || {});
  return {
    status: ["anonymous", "authenticated", "loading"].includes(input.status) ? input.status : DEFAULT_AUTH_STATE.status,
    provider: AUTH_PROVIDER_IDS.includes(input.provider) ? input.provider : user.provider,
    session: {
      accessToken: input.session?.accessToken || null,
      refreshToken: input.session?.refreshToken || null,
      expiresAt: input.session?.expiresAt || null
    },
    user,
    profile: sanitizeAuthProfile(input.profile || {})
  };
}

function readLegacyProfileFallback() {
  const raw = safeGet(LEGACY_PROFILE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) || {};
    return sanitizeAuthState({
      status: "authenticated",
      provider: "local",
      user: {
        id: DEFAULT_AUTH_USER.id,
        name: parsed.name || DEFAULT_AUTH_USER.name,
        email: parsed.email || DEFAULT_AUTH_USER.email,
        avatar: parsed.avatar || null,
        initials: parsed.initials || DEFAULT_AUTH_USER.initials,
        provider: "local"
      },
      profile: {
        discord: parsed.discord || DEFAULT_AUTH_PROFILE.discord,
        defaultAccount: parsed.defaultAccount || DEFAULT_AUTH_PROFILE.defaultAccount
      }
    });
  } catch {
    return null;
  }
}

export function readPersistedAuthState() {
  const raw = safeGet(AUTH_STORAGE_KEY);
  if (raw) {
    try {
      return sanitizeAuthState(JSON.parse(raw) || {});
    } catch {
      return { ...DEFAULT_AUTH_STATE };
    }
  }
  return readLegacyProfileFallback() || { ...DEFAULT_AUTH_STATE };
}

export function buildLegacyProfileFromAuth(authState = DEFAULT_AUTH_STATE) {
  const auth = sanitizeAuthState(authState);
  return {
    name: auth.user.name,
    email: auth.user.email,
    discord: auth.profile.discord,
    initials: auth.user.initials,
    defaultAccount: auth.profile.defaultAccount,
    avatar: auth.user.avatar
  };
}

export function persistAuthState(authState) {
  const sanitized = sanitizeAuthState(authState);
  safeSet(AUTH_STORAGE_KEY, JSON.stringify(sanitized));
  safeSet(LEGACY_PROFILE_STORAGE_KEY, JSON.stringify(buildLegacyProfileFromAuth(sanitized)));
  return sanitized;
}

export function mergeAuthProfile(currentAuth, updates = {}) {
  return sanitizeAuthState({
    ...currentAuth,
    user: {
      ...(currentAuth?.user || {}),
      ...(updates.user || {})
    },
    profile: {
      ...(currentAuth?.profile || {}),
      ...(updates.profile || {})
    },
    provider: updates.provider || currentAuth?.provider,
    status: updates.status || currentAuth?.status,
    session: {
      ...(currentAuth?.session || {}),
      ...(updates.session || {})
    }
  });
}

export function selectSessionUser(state) {
  return sanitizeAuthUser(state?.auth?.user || DEFAULT_AUTH_USER);
}

export function selectVisibleUserProfile(state) {
  const auth = sanitizeAuthState(state?.auth || DEFAULT_AUTH_STATE);
  return {
    id: auth.user.id,
    name: auth.user.name,
    email: auth.user.email,
    avatar: auth.user.avatar,
    initials: auth.user.initials,
    provider: auth.user.provider,
    role: auth.user.role,
    is_admin: auth.user.is_admin,
    discord: auth.profile.discord,
    defaultAccount: auth.profile.defaultAccount
  };
}

export function isAdminUser(state) {
  const auth = sanitizeAuthState(state?.auth || DEFAULT_AUTH_STATE);
  return auth.user.is_admin === true;
}

function authIdentity(auth = DEFAULT_AUTH_STATE) {
  const sanitized = sanitizeAuthState(auth);
  if (sanitized.status !== "authenticated") return "anonymous";
  return String(sanitized.user.id || sanitized.user.email || "authenticated").trim().toLowerCase();
}

function stripLiveAccountStateForAuth(current = {}, nextAuth = DEFAULT_AUTH_STATE) {
  const currentIdentity = authIdentity(current.auth || DEFAULT_AUTH_STATE);
  const nextIdentity = authIdentity(nextAuth);
  const authChanged = currentIdentity !== nextIdentity;
  if (!authChanged && nextAuth.status === "authenticated") return current;

  const safeAccounts = Object.fromEntries(
    Object.entries(current.accounts || {}).filter(([, account]) => account?.sourceType !== "mt5")
  );
  const fallbackAccount = safeAccounts.sandbox ? "sandbox" : Object.keys(safeAccounts)[0] || null;
  const currentAccountIsSafe = current.currentAccount && safeAccounts[current.currentAccount];

  return {
    ...current,
    accounts: safeAccounts,
    accountDirectory: {},
    managedAccounts: [],
    liveAccountIds: [],
    activeLiveAccountId: null,
    activeAccountId: null,
    mode: "mock",
    currentAccount: currentAccountIsSafe ? current.currentAccount : fallbackAccount,
  };
}

export function initAuthSession(store) {
  const resolvePreferredAccount = (state, candidateId = "") => {
    const liveIds = Array.isArray(state?.liveAccountIds) ? state.liveAccountIds : [];
    if (liveIds.length > 0) {
      if (candidateId && liveIds.includes(candidateId) && state?.accounts?.[candidateId]) return candidateId;
      if (state?.currentAccount && liveIds.includes(state.currentAccount) && state?.accounts?.[state.currentAccount]) return state.currentAccount;
      if (state?.activeLiveAccountId && liveIds.includes(state.activeLiveAccountId) && state?.accounts?.[state.activeLiveAccountId]) return state.activeLiveAccountId;
      return liveIds[0] || state.currentAccount;
    }
    if (candidateId && state?.accounts?.[candidateId]) return candidateId;
    return state.currentAccount;
  };

  let recoveryState = persistRecoveryState(
    getRecoveryHintFromUrl()
      ? {
          active: true,
          email: store.getState().auth?.user?.email || "",
          updatedAt: new Date().toISOString()
        }
      : readPersistedRecoveryState()
  );

  const setRecoveryState = (nextRecovery) => {
    recoveryState = persistRecoveryState(nextRecovery);
    return recoveryState;
  };

  const setAuthState = (nextAuth) => {
    const sanitized = persistAuthState(nextAuth);
    const state = store.getState();
    const resolvedCurrentAccount = resolvePreferredAccount(state, sanitized.profile.defaultAccount);
    const currentAuthSerialized = JSON.stringify(sanitizeAuthState(state.auth || DEFAULT_AUTH_STATE));
    const nextAuthSerialized = JSON.stringify(sanitized);
    const hasLiveState = Boolean(
      (Array.isArray(state.liveAccountIds) && state.liveAccountIds.length > 0)
      || Object.values(state.accounts || {}).some((account) => account?.sourceType === "mt5")
    );
    if (currentAuthSerialized === nextAuthSerialized
      && resolvedCurrentAccount === state.currentAccount
      && (sanitized.status === "authenticated" || !hasLiveState)) {
      return sanitized;
    }
    store.setState((current) => {
      const isolated = stripLiveAccountStateForAuth(current, sanitized);
      return {
        ...isolated,
        auth: sanitized,
        currentAccount: resolvePreferredAccount(isolated, sanitized.profile.defaultAccount)
      };
    });
    console.info("[KMFX][BOOT]", {
      label: "auth-state-updated",
      currentAccount: store.getState().currentAccount,
      preferredAccount: sanitized.profile.defaultAccount || "",
      liveAccountIds: store.getState().liveAccountIds || [],
    });
    return sanitized;
  };

  const syncAuth = () => {
    const persisted = readPersistedAuthState();
    const current = sanitizeAuthState(store.getState().auth || DEFAULT_AUTH_STATE);
    const currentSerialized = JSON.stringify(current);
    const persistedSerialized = JSON.stringify(persisted);
    if (currentSerialized !== persistedSerialized) {
      store.setState((state) => ({
        ...stripLiveAccountStateForAuth(state, persisted),
        auth: persisted
      }));
    }
  };

  let lastSerialized = JSON.stringify(sanitizeAuthState(store.getState().auth || DEFAULT_AUTH_STATE));

  persistAuthState(store.getState().auth || DEFAULT_AUTH_STATE);

  store.subscribe((state) => {
    const serialized = JSON.stringify(sanitizeAuthState(state.auth || DEFAULT_AUTH_STATE));
    if (serialized === lastSerialized) return;
    lastSerialized = serialized;
    persistAuthState(state.auth);
  });

  window.addEventListener("storage", (event) => {
    if (event.key === AUTH_STORAGE_KEY || event.key === LEGACY_PROFILE_STORAGE_KEY) {
      syncAuth();
    }
  });

  const bootstrapSupabaseSession = async () => {
    store.setState((state) => ({
      ...state,
      auth: sanitizeAuthState({
        ...state.auth,
        status: "loading"
      })
    }));
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setAuthState(buildAnonymousAuthState(store.getState().auth));
        return;
      }
      const nextAuth = buildAuthStateFromSupabaseSession(data?.session || null, store.getState().auth);
      setAuthState(nextAuth);
      if (getRecoveryHintFromUrl()) {
        clearRecoveryUrlState();
      }
    } catch {
      setAuthState(buildAnonymousAuthState(store.getState().auth));
    }
  };

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      setRecoveryState({
        active: true,
        email: session?.user?.email || recoveryState.email || "",
        updatedAt: new Date().toISOString()
      });
      clearRecoveryUrlState();
    } else if (event === "SIGNED_OUT") {
      setRecoveryState(DEFAULT_RECOVERY_STATE);
    }
    const nextAuth = buildAuthStateFromSupabaseSession(session, store.getState().auth);
    setAuthState(nextAuth);
  });

  bootstrapSupabaseSession();

  window.kmfxAuth = {
    providerIds: [...AUTH_PROVIDER_IDS],
    mode: "supabase",
    isSupabaseReady: true,
    getSession: () => sanitizeAuthState(store.getState().auth || DEFAULT_AUTH_STATE),
    getUser: () => selectVisibleUserProfile(store.getState()),
    getRecoveryState: () => sanitizeRecoveryState(recoveryState),
    signInWithPassword: async ({ email, password, name } = {}) => {
      const normalizedEmail = String(email || "").trim().toLowerCase();
      const normalizedPassword = String(password || "");
      if (!normalizedEmail || !normalizedEmail.includes("@")) {
        return { ok: false, reason: "Introduce un email válido." };
      }
      if (normalizedPassword.length < 6) {
        return { ok: false, reason: "La contraseña debe tener al menos 6 caracteres." };
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: normalizedPassword
      });
      if (error) {
        return { ok: false, reason: normalizeAuthError(error, "No se pudo iniciar sesión.") };
      }
      const nextAuth = buildAuthStateFromSupabaseSession(data?.session || null, mergeAuthProfile(store.getState().auth, {
        user: {
          name: String(name || "").trim() || undefined
        }
      }));
      const session = setAuthState(nextAuth);
      return { ok: true, session, user: session.user };
    },
    signUpWithPassword: async ({ email, password, name, captchaToken } = {}) => {
      const normalizedEmail = String(email || "").trim().toLowerCase();
      const normalizedPassword = String(password || "");
      const normalizedName = String(name || "").trim();
      const normalizedCaptchaToken = String(captchaToken || "").trim();
      if (!normalizedEmail || !normalizedEmail.includes("@")) {
        return { ok: false, reason: "Introduce un email válido." };
      }
      if (normalizedPassword.length < 6) {
        return { ok: false, reason: "La contraseña debe tener al menos 6 caracteres." };
      }
      const signUpOptions = {
        data: {
          full_name: normalizedName || undefined,
          name: normalizedName || undefined
        }
      };
      if (normalizedCaptchaToken) {
        signUpOptions.captchaToken = normalizedCaptchaToken;
      }
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: normalizedPassword,
        options: signUpOptions
      });
      if (error) {
        return { ok: false, reason: normalizeAuthError(error, "No se pudo crear la cuenta.") };
      }

      const requiresEmailConfirmation = Boolean(data?.user && !data?.session);
      if (data?.session) {
        const nextAuth = buildAuthStateFromSupabaseSession(data.session, mergeAuthProfile(store.getState().auth, {
          user: {
            name: normalizedName || undefined
          }
        }));
        const session = setAuthState(nextAuth);
        return {
          ok: true,
          session,
          user: session.user,
          requiresEmailConfirmation: false
        };
      }

      return {
        ok: true,
        requiresEmailConfirmation,
        confirmationEmail: normalizedEmail,
        message: requiresEmailConfirmation
          ? "Revisa tu email para confirmar la cuenta antes de entrar."
          : "Cuenta creada correctamente."
      };
    },
    signInWithOAuth: async (provider) => {
      if (provider !== "google") {
        return {
          ok: false,
          reason: AUTH_PROVIDER_IDS.includes(provider) ? "Proveedor aún no conectado." : "Proveedor no soportado."
        };
      }
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: resolveOAuthRedirectUrl(),
          queryParams: {
            prompt: "select_account"
          }
        }
      });
      if (error) {
        return { ok: false, reason: normalizeAuthError(error, "No se pudo iniciar con Google.") };
      }
      return { ok: true, redirected: true, data };
    },
    requestPasswordReset: async ({ email } = {}) => {
      const normalizedEmail = String(email || "").trim().toLowerCase();
      if (!normalizedEmail || !normalizedEmail.includes("@")) {
        return { ok: false, reason: "Introduce un email válido." };
      }
      const redirectUrl = `${window.location.origin}${window.location.pathname}?auth=recovery`;
      const { data, error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: redirectUrl
      });
      if (error) {
        return { ok: false, reason: normalizeAuthError(error, "No se pudo enviar el email de recuperación.") };
      }
      return {
        ok: true,
        data,
        email: normalizedEmail,
        message: "Te hemos enviado un enlace para restablecer tu contraseña."
      };
    },
    updatePassword: async ({ password } = {}) => {
      const normalizedPassword = String(password || "");
      if (normalizedPassword.length < 6) {
        return { ok: false, reason: "La contraseña debe tener al menos 6 caracteres." };
      }
      const { data, error } = await supabase.auth.updateUser({
        password: normalizedPassword
      });
      if (error) {
        return { ok: false, reason: normalizeAuthError(error, "No se pudo actualizar la contraseña.") };
      }
      setRecoveryState(DEFAULT_RECOVERY_STATE);
      await supabase.auth.signOut();
      return {
        ok: true,
        data,
        message: "Contraseña actualizada. Ya puedes iniciar sesión con la nueva clave."
      };
    },
    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) {
        return { ok: false, reason: normalizeAuthError(error, "No se pudo cerrar sesión.") };
      }
      setRecoveryState(DEFAULT_RECOVERY_STATE);
      setAuthState(buildAnonymousAuthState(store.getState().auth));
      return { ok: true };
    }
  };
}
