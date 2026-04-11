import { useEffect, useState } from "react";
import {
  safeGetStorageItem,
  safeRemoveStorageItem,
  safeSetStorageItem,
} from "@/lib/browser-storage";

export type AppTheme = "light" | "dark";
const THEME_STORAGE_KEY = "theme";

function getSystemTheme(): AppTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(): AppTheme | null {
  if (typeof window === "undefined") return null;
  const saved = safeGetStorageItem(localStorage, THEME_STORAGE_KEY);
  if (saved !== "dark" && saved !== "light" && saved !== null) {
    safeRemoveStorageItem(localStorage, THEME_STORAGE_KEY);
    return null;
  }
  return saved === "dark" || saved === "light" ? saved : null;
}

export function resolveInitialTheme(): AppTheme {
  if (typeof window === "undefined") return "light";
  return getStoredTheme() || getSystemTheme();
}

export function applyTheme(theme: AppTheme, options?: { persist?: boolean }) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  if (options?.persist !== false && typeof localStorage !== "undefined") {
    safeSetStorageItem(localStorage, THEME_STORAGE_KEY, theme, {
      onQuotaExceeded: () => {
        safeRemoveStorageItem(localStorage, THEME_STORAGE_KEY);
      },
    });
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app-theme-change", { detail: { theme } }));
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<AppTheme>(resolveInitialTheme);
  const [hasExplicitThemePreference, setHasExplicitThemePreference] = useState(
    () => getStoredTheme() !== null,
  );

  useEffect(() => {
    applyTheme(theme, {
      persist: hasExplicitThemePreference,
    });
  }, [hasExplicitThemePreference, theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTheme = (
      nextTheme: unknown,
      options?: {
        explicit?: boolean;
      },
    ) => {
      if (nextTheme === "dark" || nextTheme === "light") {
        if (typeof options?.explicit === "boolean") {
          setHasExplicitThemePreference(options.explicit);
        }
        setThemeState((current) => (current === nextTheme ? current : nextTheme));
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        if (event.newValue === null) {
          syncTheme(getSystemTheme(), { explicit: false });
          return;
        }
        syncTheme(event.newValue, { explicit: true });
      }
    };

    const onThemeChange = (event: Event) => {
      const nextTheme = (event as CustomEvent<{ theme?: unknown }>).detail?.theme;
      syncTheme(nextTheme);
    };

    const systemThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");
    const syncStoredThemeOrSystemTheme = () => {
      const storedTheme = getStoredTheme();
      syncTheme(storedTheme || getSystemTheme(), {
        explicit: storedTheme !== null,
      });
    };
    const onSystemThemeChange = () => {
      if (getStoredTheme() !== null) {
        return;
      }
      syncTheme(getSystemTheme(), { explicit: false });
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("app-theme-change", onThemeChange as EventListener);
    if (typeof systemThemeMedia.addEventListener === "function") {
      systemThemeMedia.addEventListener("change", onSystemThemeChange);
    } else {
      systemThemeMedia.addListener(onSystemThemeChange);
    }
    syncStoredThemeOrSystemTheme();
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("app-theme-change", onThemeChange as EventListener);
      if (typeof systemThemeMedia.removeEventListener === "function") {
        systemThemeMedia.removeEventListener("change", onSystemThemeChange);
      } else {
        systemThemeMedia.removeListener(onSystemThemeChange);
      }
    };
  }, []);

  return {
    theme,
    isDark: theme === "dark",
    setTheme: (nextTheme: AppTheme | ((current: AppTheme) => AppTheme)) => {
      setHasExplicitThemePreference(true);
      setThemeState((current) =>
        typeof nextTheme === "function" ? nextTheme(current) : nextTheme,
      );
    },
    toggleTheme: () => {
      setHasExplicitThemePreference(true);
      setThemeState((current) => (current === "dark" ? "light" : "dark"));
    },
  };
}
