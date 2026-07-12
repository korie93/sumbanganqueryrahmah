import assert from "node:assert/strict";
import test from "node:test";
import {
  getBrowserLocalStorage,
  getBrowserSessionStorage,
  isQuotaExceededStorageError,
  safeGetStorageItem,
  safeRemoveStorageItem,
  safeRemoveStorageItemsByPrefix,
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

test("browser storage helpers remove only keys matching a prefix", () => {
  const storage = createStorageMock({
    "save-collection-draft:alpha:v1": "legacy-sensitive-draft",
    "save-collection-draft:alpha:v2": "safe-draft",
    theme: "dark",
  });

  safeRemoveStorageItemsByPrefix(storage, "save-collection-draft:");

  assert.equal(storage.getItem("save-collection-draft:alpha:v1"), null);
  assert.equal(storage.getItem("save-collection-draft:alpha:v2"), null);
  assert.equal(storage.getItem("theme"), "dark");
});

test("browser storage prefix cleanup tolerates storage enumeration failures", () => {
  const deniedStorage = {
    get length(): number {
      throw new Error("denied");
    },
    key() {
      throw new Error("denied");
    },
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
    removeItem() {
      throw new Error("denied");
    },
  } satisfies BrowserStorageLike;

  assert.doesNotThrow(() => safeRemoveStorageItemsByPrefix(deniedStorage, "draft:"));
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

test("browser storage accessors tolerate unavailable browser storage getters", () => {
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("local storage denied");
    },
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    get() {
      throw new Error("session storage denied");
    },
  });

  try {
    assert.equal(getBrowserLocalStorage(), null);
    assert.equal(getBrowserSessionStorage(), null);
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
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
