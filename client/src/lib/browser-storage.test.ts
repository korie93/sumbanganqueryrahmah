import assert from "node:assert/strict";
import test from "node:test";
import {
  getBrowserSessionStorage,
  isQuotaExceededStorageError,
  safeGetStorageItem,
  safeRemoveStorageItem,
  safeSetStorageItem,
  type BrowserStorageLike,
} from "@/lib/browser-storage";

function createStorageMock(initialEntries?: Record<string, string>): BrowserStorageLike {
  const store = new Map<string, string>(Object.entries(initialEntries || {}));

  return {
    get length() {
      return store.size;
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
  };
}

test("browser storage helpers detect quota errors by browser-specific names", () => {
  assert.equal(isQuotaExceededStorageError(new Error("boom")), false);

  const quotaExceededError = new Error("quota");
  quotaExceededError.name = "QuotaExceededError";
  assert.equal(isQuotaExceededStorageError(quotaExceededError), true);
});

test("browser storage helpers tolerate read and cleanup failures", () => {
  const readFailure = {
    getItem() {
      throw new Error("denied");
    },
  } as Pick<Storage, "getItem">;
  const removeFailure = {
    removeItem() {
      throw new Error("denied");
    },
  } as Pick<Storage, "removeItem">;

  assert.equal(safeGetStorageItem(readFailure, "theme"), null);
  assert.doesNotThrow(() => safeRemoveStorageItem(removeFailure, "theme"));
});

test("getBrowserSessionStorage returns the browser session storage when available", () => {
  const originalSessionStorage = globalThis.sessionStorage;
  const storage = createStorageMock();

  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: storage,
  });

  try {
    assert.equal(getBrowserSessionStorage(), storage);
  } finally {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: originalSessionStorage,
    });
  }
});

test("safe storage set retries once after quota cleanup", () => {
  const storage = createStorageMock();
  let shouldThrowQuota = true;
  let cleanupCalls = 0;

  const quotaStorage = {
    ...storage,
    setItem(key: string, value: string) {
      if (shouldThrowQuota) {
        shouldThrowQuota = false;
        const error = new Error("quota");
        error.name = "QuotaExceededError";
        throw error;
      }
      storage.setItem(key, value);
    },
  } satisfies Pick<Storage, "setItem">;

  assert.equal(
    safeSetStorageItem(quotaStorage, "theme", "dark", {
      onQuotaExceeded: () => {
        cleanupCalls += 1;
      },
    }),
    true,
  );
  assert.equal(cleanupCalls, 1);
  assert.equal(storage.getItem("theme"), "dark");
});
