import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getAppLocale, setAppLocale, subscribeAppLocale, translate, type AppLocale } from "@/lib/i18n";
import { getBrowserLocalStorage, safeGetStorageItem, safeSetStorageItem } from "@/lib/browser-storage";

const preferenceKey = "sqr.auth.locale";

/** Presentation-only preference; never stores credentials or resets the auth flow. */
export function useAuthLocale() {
  const locale = useSyncExternalStore(subscribeAppLocale, getAppLocale, () => "ms" as AppLocale);
  useEffect(() => {
    const saved = safeGetStorageItem(getBrowserLocalStorage(), preferenceKey);
    if (saved === "ms" || saved === "en") setAppLocale(saved);
  }, []);
  const setLocale = useCallback((next: AppLocale) => {
    safeSetStorageItem(getBrowserLocalStorage(), preferenceKey, next);
    setAppLocale(next);
  }, []);
  const t = useCallback((key: Parameters<typeof translate>[0], params?: Parameters<typeof translate>[1]) =>
    translate(key, params, locale), [locale]);
  return { locale, setLocale, t };
}
