export type BrowserStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key"> & {
  length: number;
};

export function getBrowserLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function getBrowserSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
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

export function safeRemoveStorageItemsByPrefix(
  storage: BrowserStorageLike | null | undefined,
  prefix: string,
): void {
  if (!storage || !prefix) {
    return;
  }

  const matchingKeys: string[] = [];
  try {
    const storageLength = storage.length;
    for (let index = 0; index < storageLength; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) {
        matchingKeys.push(key);
      }
    }
  } catch {
    return;
  }

  for (const key of matchingKeys) {
    safeRemoveStorageItem(storage, key);
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
