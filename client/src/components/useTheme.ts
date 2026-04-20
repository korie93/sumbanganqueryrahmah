import { useEffect, useState } from "react";
import {
  safeGetStorageItem,
  safeRemoveStorageItem,
  safeSetStorageItem,
} from "@/lib/browser-storage";

export type AppTheme = "light" | "dark";
const THEME_STORAGE_KEY = "theme";

type ThemeChangeDetail = {
  theme?: unknown;
};

function isThemeChangeEvent(event: Event): event is CustomEvent<ThemeChangeDetail> {
  return "detail" in event;
}

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

export function bindThemeMediaChangeListener(
  mediaQueryList: MediaQueryList,
  listener: (event: MediaQueryListEvent) => void,
): () => void {
  if (typeof mediaQueryList.addEventListener === "function") {
    mediaQueryList.addEventListener("change", listener);
    return () => {
      mediaQueryList.removeEventListener("change", listener);
    };
  }

  mediaQueryList.addListener(listener);
  return () => {
    mediaQueryList.removeListener(listener);
  };
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

    const onThemeChange: EventListener = (event) => {
      const nextTheme = isThemeChangeEvent(event) ? event.detail?.theme : undefined;
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
    window.addEventListener("app-theme-change", onThemeChange);
    const cleanupSystemThemeListener = bindThemeMediaChangeListener(
      systemThemeMedia,
      onSystemThemeChange,
    );
    syncStoredThemeOrSystemTheme();
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("app-theme-change", onThemeChange);
      cleanupSystemThemeListener();
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
