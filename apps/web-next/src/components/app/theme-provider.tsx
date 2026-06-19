"use client";

import { usePathname } from "next/navigation";
import * as React from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

const themeStorageKey = "theme";
const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function authRouteUsesDarkTheme(pathname: string) {
  return pathname === "/login" || pathname.startsWith("/auth/");
}

function shouldForceDarkTheme(pathname?: string | null) {
  if (pathname) return authRouteUsesDarkTheme(pathname);
  return (
    typeof window !== "undefined" &&
    authRouteUsesDarkTheme(window.location.pathname)
  );
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(theme: Theme, pathname?: string | null): ResolvedTheme {
  if (shouldForceDarkTheme(pathname)) return "dark";
  if (theme === "system") return getSystemTheme();
  return theme;
}

function applyTheme(resolvedTheme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolvedTheme === "dark");
  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = resolvedTheme;
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";

  const stored = window.localStorage.getItem(themeStorageKey);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "dark";
}

function getInitialThemeState() {
  if (typeof document !== "undefined") {
    const resolvedTheme = shouldForceDarkTheme()
      ? "dark"
      : document.documentElement.classList.contains("dark")
        ? "dark"
        : "light";

    return {
      theme: readStoredTheme(),
      resolvedTheme: resolvedTheme as ResolvedTheme,
    };
  }

  return {
    theme: "dark" as Theme,
    resolvedTheme: "dark" as ResolvedTheme,
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [{ theme, resolvedTheme }, setThemeState] = React.useState(getInitialThemeState);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const storedTheme = readStoredTheme();
      setThemeState({
        theme: storedTheme,
        resolvedTheme: resolveTheme(storedTheme, pathname),
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  React.useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  React.useEffect(() => {
    if (theme !== "system" || shouldForceDarkTheme(pathname)) return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => {
      const nextResolvedTheme = resolveTheme("system", pathname);
      setThemeState((current) =>
        current.theme === "system"
          ? { theme: current.theme, resolvedTheme: nextResolvedTheme }
          : current,
      );
    };

    media.addEventListener("change", syncSystemTheme);

    return () => {
      media.removeEventListener("change", syncSystemTheme);
    };
  }, [pathname, theme]);

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      window.localStorage.setItem(themeStorageKey, nextTheme);

      const nextResolvedTheme = resolveTheme(nextTheme, pathname);
      setThemeState({ theme: nextTheme, resolvedTheme: nextResolvedTheme });
    },
    [pathname],
  );

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [resolvedTheme, setTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = React.use(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
