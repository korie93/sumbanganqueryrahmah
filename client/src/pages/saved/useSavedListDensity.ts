import { useCallback, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  getBrowserLocalStorage,
  safeGetStorageItem,
  safeSetStorageItem,
} from "@/lib/browser-storage";
import { getStoredAuthenticatedUser } from "@/lib/auth-session";

export type SavedListDensity = "comfortable" | "compact";

const DEFAULT_SAVED_LIST_DENSITY: SavedListDensity = "comfortable";
const SAVED_LIST_DENSITY_STORAGE_PREFIX = "sqr:saved-list-density";

export function normalizeSavedListDensity(value: unknown): SavedListDensity {
  return value === "compact" || value === "comfortable"
    ? value
    : DEFAULT_SAVED_LIST_DENSITY;
}

export function buildSavedListDensityStorageKey(identity: string): string {
  const normalizedIdentity = String(identity || "anonymous")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 80) || "anonymous";

  return `${SAVED_LIST_DENSITY_STORAGE_PREFIX}:${normalizedIdentity}`;
}

export function resolveSavedListDensity(
  preference: SavedListDensity,
  isMobile: boolean,
): SavedListDensity {
  return isMobile ? "comfortable" : preference;
}

function resolveSavedListDensityStorageKey(): string {
  const user = getStoredAuthenticatedUser();
  return buildSavedListDensityStorageKey(user?.id || user?.username || "anonymous");
}

export function useSavedListDensity() {
  const isMobile = useIsMobile();
  const storageKey = useMemo(resolveSavedListDensityStorageKey, []);
  const [preference, setPreference] = useState<SavedListDensity>(() =>
    normalizeSavedListDensity(
      safeGetStorageItem(getBrowserLocalStorage(), storageKey),
    ),
  );

  const updatePreference = useCallback(
    (density: SavedListDensity) => {
      setPreference(density);
      safeSetStorageItem(getBrowserLocalStorage(), storageKey, density);
    },
    [storageKey],
  );

  return {
    density: resolveSavedListDensity(preference, isMobile),
    preference,
    setPreference: updatePreference,
  };
}
