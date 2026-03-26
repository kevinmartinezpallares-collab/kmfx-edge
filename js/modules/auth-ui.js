export function initAuthUI(store) {
  const root = document.getElementById("authRoot");
  if (!root) return;

  root.__authUiState = root.__authUiState || {
    mode: "signin",
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    loading: false,
    error: "",
    notice: "",
    providerLoading: ""
  };

  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  const getAuthRenderSignature = (state = {}) => JSON.stringify({
    status: state.auth?.status || "anonymous",
    provider: state.auth?.provider || "local",
    userId: state.auth?.user?.id || null,
    email: state.auth?.user?.email || null
  });

  const setUiState = (patch = {}, options = {}) => {
    const { rerender = true } = options;
    root.__authUiState = {
      ...root.__authUiState,
      ...patch
    };
    if (rerender) {
      render(store.getState());
    }
  };

  const signInWithPassword = async () => {
    const email = String(root.__authUiState.email || "").trim();
    const password = String(root.__authUiState.password || "");
    setUiState({ loading: true, error: "", notice: "", providerLoading: "email" });
    const result = await window.kmfxAuth?.signInWithPassword?.({ email, password });
    if (!result?.ok) {
      setUiState({
        loading: false,
        providerLoading: "",
        error: result?.reason || "No se pudo iniciar sesión."
      });
      return;
    }
    setUiState({
      loading: false,
      providerLoading: "",
      error: "",
      notice: "",
      password: ""
    });
  };

  const signUpWithPassword = async () => {
    const name = String(root.__authUiState.name || "").trim();
    const email = String(root.__authUiState.email || "").trim();
    const password = String(root.__authUiState.password || "");
    const confirmPassword = String(root.__authUiState.confirmPassword || "");
    if (password !== confirmPassword) {
      setUiState({ error: "Las contraseñas no coinciden.", notice: "" });
      return;
    }
    setUiState({ loading: true, error: "", notice: "", providerLoading: "signup" });
    const result = await window.kmfxAuth?.signUpWithPassword?.({ name, email, password });
    if (!result?.ok) {
      setUiState({
        loading: false,
        providerLoading: "",
        error: result?.reason || "No se pudo crear la cuenta.",
        notice: ""
      });
      return;
    }

    setUiState({
      loading: false,
      providerLoading: "",
      error: "",
      notice: result?.message || (result?.requiresEmailConfirmation
        ? "Revisa tu email para confirmar la cuenta."
        : "Cuenta creada correctamente."),
      password: "",
      confirmPassword: "",
      mode: result?.requiresEmailConfirmation ? "signin" : root.__authUiState.mode
    });
  };

  const signInWithGoogle = async () => {
    setUiState({ loading: true, error: "", notice: "", providerLoading: "google" });
    const result = await window.kmfxAuth?.signInWithOAuth?.("google");
    if (!result?.ok) {
      setUiState({
        loading: false,
        providerLoading: "",
        error: result?.reason || "No se pudo iniciar con Google."
      });
      return;
    }
    setUiState({
      loading: false,
      providerLoading: "",
      error: ""
    });
  };

  const requestPasswordReset = async () => {
    const email = String(root.__authUiState.email || "").trim();
    setUiState({ loading: true, error: "", notice: "", providerLoading: "reset-request" });
    const result = await window.kmfxAuth?.requestPasswordReset?.({ email });
    if (!result?.ok) {
      setUiState({
        loading: false,
        providerLoading: "",
        error: result?.reason || "No se pudo enviar el email de recuperación.",
        notice: ""
      });
      return;
    }
    setUiState({
      loading: false,
      providerLoading: "",
      error: "",
      notice: result?.message || "Te hemos enviado un email de recuperación.",
      mode: "signin"
    });
  };

  const updatePassword = async () => {
    const password = String(root.__authUiState.password || "");
    const confirmPassword = String(root.__authUiState.confirmPassword || "");
    if (password !== confirmPassword) {
      setUiState({ error: "Las contraseñas no coinciden.", notice: "" });
      return;
    }
    setUiState({ loading: true, error: "", notice: "", providerLoading: "reset-password" });
    const result = await window.kmfxAuth?.updatePassword?.({ password });
    if (!result?.ok) {
      setUiState({
        loading: false,
        providerLoading: "",
        error: result?.reason || "No se pudo actualizar la contraseña.",
        notice: ""
      });
      return;
    }
    setUiState({
      loading: false,
      providerLoading: "",
      error: "",
      notice: result?.message || "Contraseña actualizada correctamente.",
      password: "",
      confirmPassword: "",
      mode: "signin"
    });
  };

  const render = (state) => {
    const auth = state.auth || {};
    const recoveryState = window.kmfxAuth?.getRecoveryState?.() || { active: false, email: "" };
    const isRecoveryMode = Boolean(recoveryState.active);
    const isAuthenticated = auth.status === "authenticated";
    document.body.classList.toggle("auth-locked", !isAuthenticated || isRecoveryMode);
    if (isAuthenticated && !isRecoveryMode) {
      root.innerHTML = "";
      root.hidden = true;
      return;
    }

    const activeField = document.activeElement?.closest?.("[data-auth-field]");
    const activeFieldName = activeField?.getAttribute?.("data-auth-field") || "";
    const activeSelectionStart = typeof activeField?.selectionStart === "number"
      ? activeField.selectionStart
      : null;
    const activeSelectionEnd = typeof activeField?.selectionEnd === "number"
      ? activeField.selectionEnd
      : null;

    root.hidden = false;
    const uiState = root.__authUiState;
    const isEmailLoading = uiState.loading && uiState.providerLoading === "email";
    const isSignupLoading = uiState.loading && uiState.providerLoading === "signup";
    const isGoogleLoading = uiState.loading && uiState.providerLoading === "google";
    const isResetRequestLoading = uiState.loading && uiState.providerLoading === "reset-request";
    const isResetPasswordLoading = uiState.loading && uiState.providerLoading === "reset-password";
    const isSignUpMode = uiState.mode === "signup";
    const isForgotMode = uiState.mode === "forgot";
    const isResetMode = isRecoveryMode;
    const authTitle = isResetMode
      ? "Restablecer contraseña"
      : isSignUpMode
        ? "Create your KMFX Edge account"
        : isForgotMode
          ? "Recover access"
          : "Welcome to KMFX Edge";
    const authCopy = isResetMode
      ? "Define una nueva contraseña para volver a entrar con normalidad."
      : isSignUpMode
        ? "Create your account with email and password or continue with Google."
        : isForgotMode
          ? "Introduce tu email y te enviaremos un enlace seguro para restablecer la contraseña."
          : "Secure access to your full trading workspace with email or Google.";

    root.innerHTML = `
      <div class="auth-screen">
        <div class="auth-layout auth-layout--fade-in">
          <section class="auth-showcase" aria-label="KMFX Edge overview">
            <div class="auth-showcase-brand">
              <div class="auth-showcase-brand-mark">
                <img class="brand-logo brand-logo-light" src="./assets/logos/logo-azul-violeta-oscuro-512.svg" alt="KMFX Edge">
                <img class="brand-logo brand-logo-dark" src="./assets/logos/logo-blanco-oscuro-512.svg" alt="KMFX Edge">
              </div>
            </div>

            <div class="auth-showcase-copyblock">
              <h1 class="auth-showcase-title">Track your trading performance like a professional</h1>
              <p class="auth-showcase-copy">All your metrics, risk and discipline in one place.</p>
              <div class="auth-showcase-value">Used by traders to track performance, risk and consistency.</div>
            </div>

            <ul class="auth-benefits" aria-label="Platform benefits">
              <li class="auth-benefit">Advanced analytics</li>
              <li class="auth-benefit">Real-time performance tracking</li>
              <li class="auth-benefit">Funded account control</li>
              <li class="auth-benefit">Discipline insights</li>
            </ul>

            <div class="auth-preview" aria-hidden="true">
              <div class="auth-preview-shell auth-preview-shell--carousel">
                <div class="auth-preview-topline">
                  <span class="auth-preview-dot"></span>
                  <span class="auth-preview-dot"></span>
                  <span class="auth-preview-dot"></span>
                </div>
                <div class="auth-carousel-window">
                  <div class="auth-carousel-track">
                    <article class="auth-carousel-slide auth-carousel-slide--panel">
                      <div class="auth-carousel-slide-head">
                        <span>Panel</span>
                        <strong>Resumen</strong>
                      </div>
                      <div class="auth-carousel-metric">$129,180</div>
                      <div class="auth-carousel-grid">
                        <div class="auth-carousel-stat">
                          <span>Win rate</span>
                          <strong>72.2%</strong>
                        </div>
                        <div class="auth-carousel-stat">
                          <span>Profit Factor</span>
                          <strong>5.16</strong>
                        </div>
                        <div class="auth-carousel-stat">
                          <span>Best trade</span>
                          <strong>$605</strong>
                        </div>
                      </div>
                    </article>

                    <article class="auth-carousel-slide auth-carousel-slide--analytics">
                      <div class="auth-carousel-slide-head">
                        <span>Análisis</span>
                        <strong>Hourly edge</strong>
                      </div>
                      <div class="auth-carousel-bars">
                        <span style="height: 34%"></span>
                        <span style="height: 58%"></span>
                        <span style="height: 76%"></span>
                        <span style="height: 48%"></span>
                        <span style="height: 86%"></span>
                        <span style="height: 66%"></span>
                        <span style="height: 42%"></span>
                      </div>
                      <div class="auth-carousel-meta">Performance breakdown by session, weekday and execution quality.</div>
                    </article>

                    <article class="auth-carousel-slide auth-carousel-slide--risk">
                      <div class="auth-carousel-slide-head">
                        <span>Riesgo</span>
                        <strong>Live limits</strong>
                      </div>
                      <div class="auth-carousel-risk">
                        <div class="auth-carousel-risk-row">
                          <span>Daily DD</span>
                          <strong>1.2%</strong>
                        </div>
                        <div class="auth-carousel-risk-track"><span style="width: 38%"></span></div>
                        <div class="auth-carousel-risk-row">
                          <span>Max DD</span>
                          <strong>10%</strong>
                        </div>
                        <div class="auth-carousel-risk-track auth-carousel-risk-track--warning"><span style="width: 54%"></span></div>
                      </div>
                    </article>
                  </div>
                </div>
                <div class="auth-carousel-nav">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>

            <div class="auth-showcase-footnote">
              Built for traders who want a cleaner read on performance, risk, and execution quality.
            </div>
          </section>

          <div class="auth-panel">
            <div class="auth-panel-cta">Start tracking your edge today</div>
            <div class="auth-card">
              <div class="auth-brand">
                <div>
                  <div class="auth-kicker">Access</div>
                  <h1 class="auth-title">${authTitle}</h1>
                  <p class="auth-copy">${authCopy}</p>
                </div>
              </div>

              ${!isForgotMode && !isResetMode ? `<div class="auth-mode-switch" role="tablist" aria-label="Modo de autenticación">
                <button class="auth-mode-btn ${!isSignUpMode ? "is-active" : ""}" type="button" data-auth-mode="signin" ${uiState.loading ? "disabled" : ""}>
                  Iniciar sesión
                </button>
                <button class="auth-mode-btn ${isSignUpMode ? "is-active" : ""}" type="button" data-auth-mode="signup" ${uiState.loading ? "disabled" : ""}>
                  Crear cuenta
                </button>
              </div>` : ""}

              <div class="auth-form-grid">
                ${(isSignUpMode && !isResetMode) ? `
                  <label class="form-stack">
                    <span>Nombre</span>
                    <input type="text" data-auth-field="name" placeholder="Kevin C." value="${escapeHtml(uiState.name)}">
                  </label>
                ` : ""}
                <label class="form-stack">
                  <span>Email</span>
                  <input type="email" data-auth-field="email" placeholder="kevin@kmfxedge.local" value="${escapeHtml(isResetMode ? (recoveryState.email || uiState.email) : uiState.email)}" ${isResetMode ? "disabled" : ""}>
                </label>
                ${!isForgotMode ? `<label class="form-stack">
                  <span>Contraseña</span>
                  <input type="password" data-auth-field="password" placeholder="${isResetMode ? "Nueva contraseña" : "Mínimo 6 caracteres"}" value="${escapeHtml(uiState.password)}">
                </label>` : ""}
                ${(isSignUpMode || isResetMode) ? `
                  <label class="form-stack">
                    <span>${isResetMode ? "Confirmar nueva contraseña" : "Confirmar contraseña"}</span>
                    <input type="password" data-auth-field="confirmPassword" placeholder="${isResetMode ? "Repite la nueva contraseña" : "Repite la contraseña"}" value="${escapeHtml(uiState.confirmPassword)}">
                  </label>
                ` : ""}
              </div>

              ${uiState.error
                ? `<div class="auth-feedback auth-feedback--error">${escapeHtml(uiState.error)}</div>`
                : uiState.notice
                  ? `<div class="auth-feedback auth-feedback--success">${escapeHtml(uiState.notice)}</div>`
                  : `<div class="auth-feedback">La identidad del usuario y la cuenta de trading se mantienen separadas.</div>`}

              <div class="auth-actions">
                <button class="btn-primary auth-action" type="button" data-auth-submit ${uiState.loading ? "disabled" : ""}>
                  ${isResetMode
                    ? (isResetPasswordLoading ? "Actualizando..." : "Guardar nueva contraseña")
                    : isForgotMode
                      ? (isResetRequestLoading ? "Enviando..." : "Enviar email de recuperación")
                    : isSignUpMode
                    ? (isSignupLoading ? "Creando cuenta..." : "Crear cuenta")
                    : (isEmailLoading ? "Entrando..." : "Entrar con email")}
                </button>
                ${!isForgotMode && !isResetMode ? `<button class="btn-secondary auth-action auth-action--google" type="button" data-auth-google ${uiState.loading ? "disabled" : ""}>
                  ${isGoogleLoading ? "Conectando..." : "Continuar con Google"}
                </button>
                <div class="auth-trust-line">No spam. Secure login via Google.</div>` : ""}
                ${!isResetMode ? `<button class="auth-link-btn" type="button" data-auth-secondary-action ${uiState.loading ? "disabled" : ""}>
                  ${isForgotMode ? "Volver a iniciar sesión" : "¿Has olvidado tu contraseña?"}
                </button>` : ""}
              </div>

              ${!isForgotMode && !isResetMode ? `<div class="auth-trust-indicators" aria-label="Trust indicators">
                <div class="auth-trust-indicator">No credit card required</div>
                <div class="auth-trust-indicator">Secure authentication</div>
              </div>` : ""}

              <div class="auth-disclaimer">
                KMFX Edge is an analysis tool. It does not provide financial advice. Trading involves risk and users are solely responsible for their decisions.
              </div>

              <div class="auth-legal-links" aria-label="Legal links">
                <a class="auth-legal-link" href="/privacy">Privacy</a>
                <span aria-hidden="true">·</span>
                <a class="auth-legal-link" href="/terms">Terms</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    root.querySelectorAll("[data-auth-mode]")?.forEach((button) => {
      button.addEventListener("click", () => {
        setUiState({
          mode: button.getAttribute("data-auth-mode") || "signin",
          error: "",
          notice: "",
          email: root.__authUiState.email,
          password: "",
          confirmPassword: ""
        });
      });
    });

    root.querySelector('[data-auth-field="name"]')?.addEventListener("input", (event) => {
      setUiState({ name: event.currentTarget.value, error: "", notice: "" }, { rerender: false });
    });

    root.querySelector('[data-auth-field="email"]')?.addEventListener("input", (event) => {
      setUiState({ email: event.currentTarget.value, error: "", notice: "" }, { rerender: false });
    });

    root.querySelector('[data-auth-field="password"]')?.addEventListener("input", (event) => {
      setUiState({ password: event.currentTarget.value, error: "", notice: "" }, { rerender: false });
    });

    root.querySelector('[data-auth-field="confirmPassword"]')?.addEventListener("input", (event) => {
      setUiState({ confirmPassword: event.currentTarget.value, error: "", notice: "" }, { rerender: false });
    });

    root.querySelector('[data-auth-submit]')?.addEventListener("click", () => {
      if (isResetMode) {
        updatePassword();
        return;
      }
      if (isForgotMode) {
        requestPasswordReset();
        return;
      }
      if (isSignUpMode) {
        signUpWithPassword();
        return;
      }
      signInWithPassword();
    });
    root.querySelector('[data-auth-google]')?.addEventListener("click", signInWithGoogle);
    root.querySelector('[data-auth-secondary-action]')?.addEventListener("click", () => {
      setUiState({
        mode: isForgotMode ? "signin" : "forgot",
        error: "",
        notice: "",
        password: "",
        confirmPassword: ""
      });
    });

    const submitOnEnter = (event) => {
      if (event.key === "Enter" && !uiState.loading) {
        if (isResetMode) {
          updatePassword();
          return;
        }
        if (isForgotMode) {
          requestPasswordReset();
          return;
        }
        if (isSignUpMode) {
          signUpWithPassword();
          return;
        }
        signInWithPassword();
      }
    };

    root.querySelector('[data-auth-field="email"]')?.addEventListener("keydown", submitOnEnter);
    root.querySelector('[data-auth-field="password"]')?.addEventListener("keydown", submitOnEnter);
    root.querySelector('[data-auth-field="confirmPassword"]')?.addEventListener("keydown", submitOnEnter);

    if (activeFieldName) {
      const nextActiveField = root.querySelector(`[data-auth-field="${activeFieldName}"]`);
      if (nextActiveField) {
        nextActiveField.focus({ preventScroll: true });
        if (typeof activeSelectionStart === "number" && typeof activeSelectionEnd === "number") {
          nextActiveField.setSelectionRange(activeSelectionStart, activeSelectionEnd);
        }
      }
    }
  };

  let lastAuthSignature = getAuthRenderSignature(store.getState());
  render(store.getState());
  store.subscribe((state) => {
    const nextSignature = getAuthRenderSignature(state);
    if (nextSignature === lastAuthSignature) return;
    lastAuthSignature = nextSignature;
    render(state);
  });
}
