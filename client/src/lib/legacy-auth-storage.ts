import { LEGACY_AUTH_LOCAL_STORAGE_KEYS } from "@/app/constants";

type LegacyAuthStorageKey = (typeof LEGACY_AUTH_LOCAL_STORAGE_KEYS)[number];

function canUseLegacyAuthLocalStorage() {
  return typeof localStorage !== "undefined";
}

export function clearLegacyAuthLocalStorageValue(key: LegacyAuthStorageKey) {
  if (!canUseLegacyAuthLocalStorage()) {
    return;
  }

  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage access failures during best-effort legacy cleanup.
  }
}

export function clearLegacyAuthLocalStorage() {
  for (const key of LEGACY_AUTH_LOCAL_STORAGE_KEYS) {
    clearLegacyAuthLocalStorageValue(key);
  }
}
