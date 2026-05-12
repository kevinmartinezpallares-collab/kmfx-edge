(function () {
  const hostname = window.location.hostname || "";
  const isLocalRuntime = window.location.protocol === "file:"
    || hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1";

  function isDebugEnabled() {
    if (window.__KMFX_DEBUG__ === true) return true;
    try {
      const params = new URLSearchParams(window.location.search || "");
      if (params.get("kmfx_debug") === "1") return true;
      if (window.localStorage?.getItem("kmfx.debug") === "1") return true;
      if (window.sessionStorage?.getItem("kmfx.debug") === "1") return true;
    } catch (error) {
      return false;
    }
    return false;
  }

  if (isLocalRuntime || isDebugEnabled()) {
    window.__KMFX_CONSOLE_PRIVACY__ = {
      enabled: false,
      reason: isLocalRuntime ? "local-runtime" : "debug-enabled",
    };
    return;
  }

  const methods = ["log", "info", "debug"];
  methods.forEach((method) => {
    const original = typeof console?.[method] === "function"
      ? console[method].bind(console)
      : null;
    if (!original) return;

    console[method] = function kmfxProductionConsoleGuard(...args) {
      if (isDebugEnabled()) original(...args);
    };
  });

  window.__KMFX_CONSOLE_PRIVACY__ = {
    enabled: true,
    mutedMethods: methods,
  };
})();
