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

test("buildSaveCollectionDraftStorageKey normalizes the nickname into a stable session key", () => {
  assert.equal(
    buildSaveCollectionDraftStorageKey(" Collector Alpha "),
    "save-collection-draft:collector-alpha:v1",
  );
});

test("persistSaveCollectionDraft stores non-empty drafts in sessionStorage and restores them safely", () => {
  const session = installSessionStorageMock();

  persistSaveCollectionDraft("Collector Alpha", {
    customerName: "Siti",
    icNumber: "900101-10-1234",
    customerPhone: "0123456789",
    accountNumber: "ACC-1",
    batch: "P25",
    paymentDate: "2026-03-26",
    amount: "100.50",
    hadPendingReceipts: true,
  });

  const stored = readSaveCollectionDraft("Collector Alpha");
  assert.equal(stored?.customerName, "Siti");
  assert.equal(stored?.batch, "P25");
  assert.equal(stored?.hadPendingReceipts, true);
  assert.equal(session.length, 1);
});

test("persistSaveCollectionDraft clears empty drafts instead of keeping stale session state", () => {
  installSessionStorageMock();

  persistSaveCollectionDraft("Collector Alpha", {
    customerName: "",
    icNumber: "",
    customerPhone: "",
    accountNumber: "",
    batch: "P10",
    paymentDate: "",
    amount: "",
    hadPendingReceipts: false,
  });

  assert.equal(readSaveCollectionDraft("Collector Alpha"), null);
  assert.equal(
    isSaveCollectionDraftEmpty({
      customerName: "",
      icNumber: "",
      customerPhone: "",
      accountNumber: "",
      batch: "P10",
      paymentDate: "",
      amount: "",
      hadPendingReceipts: false,
    }),
    true,
  );
});

test("parseSaveCollectionDraft rejects malformed payloads and clearSaveCollectionDraft removes stored data", () => {
  const session = installSessionStorageMock();
  session.setItem(
    buildSaveCollectionDraftStorageKey("Collector Alpha"),
    JSON.stringify({
      customerName: "Siti",
      batch: "INVALID",
      savedAt: "2026-03-26T00:00:00.000Z",
    }),
  );

  const parsed = readSaveCollectionDraft("Collector Alpha");
  assert.equal(parsed?.batch, "P10");
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
      customerName: "Siti",
      icNumber: "",
      customerPhone: "",
      accountNumber: "",
      batch: "P10",
      paymentDate: "",
      amount: "",
      hadPendingReceipts: false,
    }),
  );
});
