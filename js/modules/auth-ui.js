export function initAuthUI(store) {
  const root = document.getElementById("authRoot");
  if (!root) return;

  root.__authUiState = root.__authUiState || {
    mode: "signin",
    slideIndex: 0,
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

  const updateAuthCarouselView = () => {
    const nextIndex = Math.max(0, Math.min(authSlides.length - 1, Number(root.__authUiState?.slideIndex || 0)));
    root.querySelector(".auth-carousel-track")?.style.setProperty("transform", `translateX(-${nextIndex * 100}%)`);
    root.querySelectorAll("[data-auth-slide]")?.forEach((dot, index) => {
      dot.classList.toggle("is-active", index === nextIndex);
    });
  };

  const authSlides = [
    {
      section: "Panel",
      title: "Controla tu trading como un profesional",
      copy: "Todas tus métricas, riesgo y rendimiento en un solo lugar",
      tone: "panel"
    },
    {
      section: "Riesgo",
      title: "Controla el riesgo antes de que te controle a ti",
      copy: "Drawdown, exposición y presión de riesgo en tiempo real",
      tone: "risk"
    },
    {
      section: "Disciplina",
      title: "Tu ventaja está en tu disciplina",
      copy: "Analiza tu comportamiento y mejora tu consistencia como trader",
      tone: "discipline"
    }
  ];

  const startAuthCarousel = () => {
    if (root.__authCarouselTimer) {
      window.clearInterval(root.__authCarouselTimer);
      root.__authCarouselTimer = null;
    }
    if (window.matchMedia("(max-width: 860px)").matches) return;
    root.__authCarouselTimer = window.setInterval(() => {
      const current = Number(root.__authUiState?.slideIndex || 0);
      setUiState({ slideIndex: (current + 1) % authSlides.length }, { rerender: false });
      updateAuthCarouselView();
    }, 5600);
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
      if (root.__authCarouselTimer) {
        window.clearInterval(root.__authCarouselTimer);
        root.__authCarouselTimer = null;
      }
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
        ? "Crea tu cuenta en KMFX Edge"
        : isForgotMode
          ? "Recupera el acceso"
          : "Accede a tu panel de trading";
    const authCopy = isResetMode
      ? "Define una nueva contraseña para volver a entrar con normalidad."
      : isSignUpMode
        ? "Crea tu cuenta con correo y contraseña o continúa con Google."
        : isForgotMode
          ? "Introduce tu email y te enviaremos un enlace seguro para restablecer la contraseña."
          : "Visualiza tu rendimiento, riesgo y disciplina en tiempo real.";

    const activeSlideIndex = Math.max(0, Math.min(authSlides.length - 1, Number(uiState.slideIndex || 0)));
    root.innerHTML = `
      <div class="auth-screen">
        <div class="auth-layout ${root.__authHasRendered ? "" : "auth-layout--fade-in"}">
          <section class="auth-showcase" aria-label="KMFX Edge overview">
            <div class="auth-showcase-brand">
              <div class="auth-showcase-brand-mark">
                <img class="brand-logo brand-logo-light" src="./assets/logos/logo-azul-violeta-oscuro-512.svg" alt="KMFX Edge">
                <img class="brand-logo brand-logo-dark" src="./assets/logos/logo-blanco-oscuro-512.svg" alt="KMFX Edge">
              </div>
              <div class="auth-showcase-brand-name">KMFX Edge</div>
            </div>

            <div class="auth-showcase-copyblock">
              <h1 class="auth-showcase-title">Controla tu trading como un profesional</h1>
              <p class="auth-showcase-copy">Todas tus métricas, riesgo y rendimiento en un solo lugar.</p>
              <div class="auth-showcase-value">Usado por traders para medir rendimiento, riesgo y consistencia.</div>
            </div>

            <ul class="auth-benefits" aria-label="Platform benefits">
              <li class="auth-benefit">Analítica avanzada</li>
              <li class="auth-benefit">Seguimiento del rendimiento en tiempo real</li>
              <li class="auth-benefit">Control de cuentas fondeadas</li>
              <li class="auth-benefit">Insights de disciplina</li>
            </ul>

            <div class="auth-preview" aria-hidden="true">
              <div class="auth-preview-shell auth-preview-shell--carousel">
                <div class="auth-carousel-window">
                  <div class="auth-carousel-track" style="transform: translateX(-${activeSlideIndex * 100}%);">
                    ${authSlides.map((slide) => `
                      <article class="auth-carousel-slide auth-carousel-slide--${slide.tone}">
                        <div class="auth-carousel-slide-copy">
                          <span>${slide.section}</span>
                          <strong>${slide.title}</strong>
                          <p>${slide.copy}</p>
                        </div>
                        <div class="auth-carousel-visual auth-carousel-visual--${slide.tone}">
                          <div class="auth-carousel-visual-shell">
                            <div class="auth-carousel-visual-header">
                              <span></span><span></span><span></span>
                            </div>
                            ${slide.tone === "panel" ? `
                              <div class="auth-carousel-visual-panel-kpis">
                                <div><label>Equity</label><strong>$129,180</strong></div>
                                <div><label>Return</label><strong>+3.0%</strong></div>
                                <div><label>Trades</label><strong>142</strong></div>
                              </div>
                              <div class="auth-carousel-visual-bars">
                                <span style="height: 36%"></span>
                                <span style="height: 54%"></span>
                                <span style="height: 66%"></span>
                                <span style="height: 48%"></span>
                                <span style="height: 78%"></span>
                                <span style="height: 62%"></span>
                              </div>
                            ` : ""}
                            ${slide.tone === "risk" ? `
                              <div class="auth-carousel-visual-risk">
                                <div class="auth-carousel-visual-risk-row"><label>Drawdown</label><strong>2.4%</strong></div>
                                <div class="auth-carousel-visual-risk-track"><span style="width: 38%"></span></div>
                                <div class="auth-carousel-visual-risk-row"><label>Exposure</label><strong>31%</strong></div>
                                <div class="auth-carousel-visual-risk-track auth-carousel-visual-risk-track--warning"><span style="width: 54%"></span></div>
                                <div class="auth-carousel-visual-risk-row"><label>Risk Pressure</label><strong>Low</strong></div>
                              </div>
                            ` : ""}
                            ${slide.tone === "discipline" ? `
                              <div class="auth-carousel-visual-discipline">
                                <div class="auth-carousel-visual-discipline-head">
                                  <div><label>Racha limpia</label><strong>4 sesiones</strong></div>
                                  <div><label>Avg R</label><strong>1.9</strong></div>
                                </div>
                                <div class="auth-carousel-visual-bars auth-carousel-visual-bars--discipline">
                                  <span style="height: 26%"></span>
                                  <span style="height: 74%"></span>
                                  <span style="height: 78%"></span>
                                  <span style="height: 22%"></span>
                                  <span style="height: 46%"></span>
                                  <span style="height: 32%"></span>
                                </div>
                                <div class="auth-carousel-visual-discipline-metrics">
                                  <div><label>Constancia</label><strong>5/5</strong></div>
                                  <div><label>Sesgo horario</label><strong>08:00</strong></div>
                                </div>
                              </div>
                            ` : ""}
                          </div>
                        </div>
                      </article>
                    `).join("")}
                  </div>
                </div>
                <div class="auth-carousel-nav" role="tablist" aria-label="Login preview slides">
                  ${authSlides.map((slide, index) => `
                    <button
                      class="auth-carousel-dot ${index === activeSlideIndex ? "is-active" : ""}"
                      type="button"
                      data-auth-slide="${index}"
                      aria-label="Mostrar diapositiva ${index + 1}: ${slide.section}"
                    ></button>
                  `).join("")}
                </div>
              </div>
            </div>

            <div class="auth-showcase-footnote">
              Diseñado para traders que quieren una lectura más clara de su rendimiento, riesgo y ejecución.
            </div>
          </section>

          <div class="auth-panel">
            <div class="auth-panel-cta">Empieza a medir tu ventaja hoy</div>
            <div class="auth-card">
              <div class="auth-brand">
                <div>
                  <div class="auth-kicker">Acceso</div>
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
                  <span>Correo electrónico</span>
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
                  : ``}

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
                  <span class="auth-google-mark" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.26-.96 2.33-2.04 3.05l3.3 2.56c1.92-1.77 3.04-4.38 3.04-7.5 0-.72-.06-1.4-.18-2.06H12z"/>
                      <path fill="#34A853" d="M12 22c2.76 0 5.08-.92 6.77-2.49l-3.3-2.56c-.92.62-2.1.99-3.47.99-2.67 0-4.93-1.8-5.74-4.22l-3.42 2.64A10 10 0 0 0 12 22z"/>
                      <path fill="#4A90E2" d="M6.26 13.72A5.98 5.98 0 0 1 5.94 12c0-.6.11-1.18.32-1.72L2.84 7.64A10 10 0 0 0 2 12c0 1.61.38 3.13 1.06 4.36l3.2-2.64z"/>
                      <path fill="#FBBC05" d="M12 6.02c1.5 0 2.85.52 3.91 1.54l2.93-2.93C17.07 2.98 14.76 2 12 2A10 10 0 0 0 3.06 7.64l3.2 2.64C7.07 7.82 9.33 6.02 12 6.02z"/>
                    </svg>
                  </span>
                  <span>${isGoogleLoading ? "Conectando..." : "Continuar con Google"}</span>
                </button>
                <div class="auth-trust-line">Usamos Google para proteger tu cuenta. No almacenamos contraseñas.</div>` : ""}
                ${!isResetMode ? `<button class="auth-link-btn" type="button" data-auth-secondary-action ${uiState.loading ? "disabled" : ""}>
                  ${isForgotMode ? "Volver a iniciar sesión" : "¿Has olvidado tu contraseña?"}
                </button>` : ""}
              </div>

              <div class="auth-legal-links" aria-label="Legal links">
                <span>Al continuar, aceptas nuestros</span>
                <a class="auth-legal-link" href="/terms">Términos</a>
                <span aria-hidden="true">y</span>
                <a class="auth-legal-link" href="/privacy">Política de Privacidad</a>
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
    root.querySelectorAll("[data-auth-slide]")?.forEach((button) => {
      button.addEventListener("click", () => {
        const nextIndex = Number(button.getAttribute("data-auth-slide") || 0);
        setUiState({ slideIndex: nextIndex }, { rerender: false });
        updateAuthCarouselView();
      });
    });
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

    startAuthCarousel();
    root.__authHasRendered = true;
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
