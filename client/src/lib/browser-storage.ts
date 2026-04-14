export type BrowserStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key"> & {
  length: number;
};

export function getBrowserLocalStorage(): Storage | null {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

export function getBrowserSessionStorage(): Storage | null {
  return typeof sessionStorage !== "undefined" ? sessionStorage : null;
}

export function isQuotaExceededStorageError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED";
}

export function safeGetStorageItem(
  storage: Pick<Storage, "getItem"> | null | undefined,
  key: string,
): string | null {
  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function safeRemoveStorageItem(
  storage: Pick<Storage, "removeItem"> | null | undefined,
  key: string,
): void {
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(key);
  } catch {
    // Ignore best-effort storage cleanup failures.
  }
}

export function safeSetStorageItem(
  storage: Pick<Storage, "setItem"> | null | undefined,
  key: string,
  value: string,
  options?: {
    onQuotaExceeded?: () => void;
  },
): boolean {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isQuotaExceededStorageError(error)) {
      return false;
    }

    try {
      options?.onQuotaExceeded?.();
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}
