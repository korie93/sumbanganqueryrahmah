import { useCallback, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  getBrowserLocalStorage,
  safeGetStorageItem,
  safeSetStorageItem,
} from "@/lib/browser-storage";
import { getStoredAuthenticatedUser } from "@/lib/auth-session";

export type TableDensity = "comfortable" | "compact";
export type TableDensityScope = "activity" | "viewer";

const DEFAULT_TABLE_DENSITY: TableDensity = "comfortable";
const TABLE_DENSITY_STORAGE_PREFIX = "sqr:table-density";

export function normalizeTableDensity(value: unknown): TableDensity {
  return value === "compact" || value === "comfortable"
    ? value
    : DEFAULT_TABLE_DENSITY;
}

export function buildTableDensityStorageKey(
  scope: TableDensityScope,
  identity: string,
): string {
  const normalizedIdentity = String(identity || "anonymous")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 80) || "anonymous";

  return `${TABLE_DENSITY_STORAGE_PREFIX}:${scope}:${normalizedIdentity}`;
}

export function resolveTableDensity(
  preference: TableDensity,
  isMobile: boolean,
): TableDensity {
  return isMobile ? "comfortable" : preference;
}

function resolveTableDensityStorageKey(scope: TableDensityScope): string {
  const user = getStoredAuthenticatedUser();
  return buildTableDensityStorageKey(
    scope,
    user?.id || user?.username || "anonymous",
  );
}

export function usePersistentTableDensity(scope: TableDensityScope) {
  const isMobile = useIsMobile();
  const storageKey = useMemo(
    () => resolveTableDensityStorageKey(scope),
    [scope],
  );
  const [preference, setPreference] = useState<TableDensity>(() =>
    normalizeTableDensity(
      safeGetStorageItem(getBrowserLocalStorage(), storageKey),
    ),
  );

  const updatePreference = useCallback(
    (density: TableDensity) => {
      setPreference(density);
      safeSetStorageItem(getBrowserLocalStorage(), storageKey, density);
    },
    [storageKey],
  );

  return {
    density: resolveTableDensity(preference, isMobile),
    preference,
    setPreference: updatePreference,
  };
}
