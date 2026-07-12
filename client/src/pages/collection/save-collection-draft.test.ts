import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSaveCollectionDraftStorageKey,
  clearSaveCollectionDraft,
  isSaveCollectionDraftEmpty,
  parseSaveCollectionDraft,
  persistSaveCollectionDraft,
  readSaveCollectionDraft,
} from "@/pages/collection/save-collection-draft";

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  key: (index: number) => string | null;
  readonly length: number;
};

function createStorageMock(): StorageLike {
  const store = new Map<string, string>();

  return {
    getItem(key) {
      return store.has(key) ? String(store.get(key)) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
}

function installSessionStorageMock() {
  const session = createStorageMock();

  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: session,
  });

  return session;
}

test("buildSaveCollectionDraftStorageKey preserves distinct nicknames in a stable v2 key", () => {
  assert.equal(
    buildSaveCollectionDraftStorageKey(" Collector Alpha "),
    "save-collection-draft:collector%20alpha:v2",
  );
  assert.notEqual(
    buildSaveCollectionDraftStorageKey("Collector Alpha"),
    buildSaveCollectionDraftStorageKey("Collector-Alpha"),
  );
});

test("persistSaveCollectionDraft stores only non-PII draft fields at runtime", () => {
  const session = installSessionStorageMock();
  const contaminatedDraft = {
    customerName: "Siti",
    icNumber: "900101-10-1234",
    customerPhone: "0123456789",
    accountNumber: "ACC-1",
    batch: "P25" as const,
    paymentDate: "2026-03-26",
    amount: "100.50",
    hadPendingReceipts: true,
  };

  persistSaveCollectionDraft("Collector Alpha", contaminatedDraft);

  const stored = readSaveCollectionDraft("Collector Alpha");
  assert.equal(stored?.batch, "P25");
  assert.equal(stored?.hadPendingReceipts, true);
  assert.equal("customerName" in (stored ?? {}), false);
  const raw = String(session.getItem(buildSaveCollectionDraftStorageKey("Collector Alpha")) || "");
  assert.doesNotMatch(raw, /Siti|900101-10-1234|0123456789|ACC-1/);
  assert.doesNotMatch(raw, /customerName|icNumber|customerPhone|accountNumber/);
  assert.equal(session.length, 1);
});

test("persistSaveCollectionDraft clears empty drafts instead of keeping stale session state", () => {
  installSessionStorageMock();

  persistSaveCollectionDraft("Collector Alpha", {
    batch: "P10",
    paymentDate: "",
    amount: "",
    hadPendingReceipts: false,
  });

  assert.equal(readSaveCollectionDraft("Collector Alpha"), null);
  assert.equal(
    isSaveCollectionDraftEmpty({
      batch: "P10",
      paymentDate: "",
      amount: "",
      hadPendingReceipts: false,
    }),
    true,
  );
});

test("draft reads purge legacy PII keys and ignore unexpected sensitive fields", () => {
  const session = installSessionStorageMock();
  const legacyKey = "save-collection-draft:collector-alpha:v1";
  session.setItem(legacyKey, JSON.stringify({
    customerName: "Legacy Siti",
    icNumber: "900101-10-1234",
    batch: "P25" as const,
  }));
  session.setItem(
    buildSaveCollectionDraftStorageKey("Collector Alpha"),
    JSON.stringify({
      customerName: "Unexpected Siti",
      batch: "INVALID",
      paymentDate: "2026-03-26",
      amount: "50.00",
      hadPendingReceipts: "false",
      savedAt: "2026-03-26T00:00:00.000Z",
    }),
  );

  const parsed = readSaveCollectionDraft("Collector Alpha");
  assert.equal(parsed?.batch, "P10");
  assert.equal(parsed?.hadPendingReceipts, false);
  assert.equal("customerName" in (parsed ?? {}), false);
  assert.equal(session.getItem(legacyKey), null);
  assert.equal(parseSaveCollectionDraft("{bad-json"), null);

  clearSaveCollectionDraft("Collector Alpha");
  assert.equal(readSaveCollectionDraft("Collector Alpha"), null);
});

test("save collection draft helpers stay safe when sessionStorage access throws", () => {
  const deniedStorage = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
    removeItem() {
      throw new Error("denied");
    },
    clear() {
      throw new Error("denied");
    },
    key() {
      return null;
    },
    get length() {
      return 0;
    },
  } satisfies StorageLike;

  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: deniedStorage,
  });

  assert.equal(readSaveCollectionDraft("Collector Alpha"), null);
  assert.doesNotThrow(() => clearSaveCollectionDraft("Collector Alpha"));
  assert.doesNotThrow(() =>
    persistSaveCollectionDraft("Collector Alpha", {
      batch: "P10",
      paymentDate: "",
      amount: "",
      hadPendingReceipts: false,
    }),
  );
});
