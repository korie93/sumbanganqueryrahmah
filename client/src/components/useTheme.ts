import { useEffect, useState } from "react";

export type AppTheme = "light" | "dark";

function getStoredTheme(): AppTheme | null {
  if (typeof window === "undefined") return null;
  const saved = localStorage.getItem("theme");
  return saved === "dark" || saved === "light" ? saved : null;
}

export function resolveInitialTheme(): AppTheme {
  if (typeof window === "undefined") return "light";
  return (
    getStoredTheme()
    || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
  );
}

export function applyTheme(theme: AppTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  localStorage.setItem("theme", theme);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app-theme-change", { detail: { theme } }));
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<AppTheme>(resolveInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTheme = (nextTheme: unknown) => {
      if (nextTheme === "dark" || nextTheme === "light") {
        setTheme((current) => (current === nextTheme ? current : nextTheme));
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === "theme") {
        syncTheme(event.newValue);
      }
    };

    const onThemeChange = (event: Event) => {
      const nextTheme = (event as CustomEvent<{ theme?: unknown }>).detail?.theme;
      syncTheme(nextTheme);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("app-theme-change", onThemeChange as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("app-theme-change", onThemeChange as EventListener);
    };
  }, []);

  return {
    theme,
    isDark: theme === "dark",
    setTheme,
    toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
  };
}
