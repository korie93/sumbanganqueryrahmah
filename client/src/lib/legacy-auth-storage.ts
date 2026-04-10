import { LEGACY_AUTH_LOCAL_STORAGE_KEYS } from "@/app/constants";
import { getBrowserLocalStorage, safeRemoveStorageItem } from "@/lib/browser-storage";

type LegacyAuthStorageKey = (typeof LEGACY_AUTH_LOCAL_STORAGE_KEYS)[number];

function canUseLegacyAuthLocalStorage() {
  return getBrowserLocalStorage() !== null;
}

export function clearLegacyAuthLocalStorageValue(key: LegacyAuthStorageKey) {
  if (!canUseLegacyAuthLocalStorage()) {
    return;
  }

  safeRemoveStorageItem(getBrowserLocalStorage(), key);
}

export function clearLegacyAuthLocalStorage() {
  for (const key of LEGACY_AUTH_LOCAL_STORAGE_KEYS) {
    clearLegacyAuthLocalStorageValue(key);
  }
}
