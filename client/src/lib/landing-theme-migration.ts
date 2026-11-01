import { getBrowserLocalStorage, safeGetStorageItem, safeRemoveStorageItem, safeSetStorageItem } from "./browser-storage";

/** Retire the landing-only preference without replacing a newer workspace choice. */
export function migrateLandingThemePreference(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = getBrowserLocalStorage(),
): void {
  const current = safeGetStorageItem(storage, "theme");
  if (current === "light" || current === "dark") {
    safeRemoveStorageItem(storage, "sqr-landing-next-theme");
    return;
  }
  const legacy = safeGetStorageItem(storage, "sqr-landing-next-theme");
  if ((legacy === "light" || legacy === "dark") && safeSetStorageItem(storage, "theme", legacy)) {
    safeRemoveStorageItem(storage, "sqr-landing-next-theme");
  }
}
