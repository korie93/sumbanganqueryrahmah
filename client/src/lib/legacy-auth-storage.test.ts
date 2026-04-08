import assert from "node:assert/strict";
import test from "node:test";

import { clearLegacyAuthLocalStorage } from "@/lib/legacy-auth-storage";

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

test("clearLegacyAuthLocalStorage removes legacy auth keys without touching UI persistence", () => {
  const local = createStorageMock();

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: local,
  });

  local.setItem("token", "legacy-token");
  local.setItem("user", "{\"username\":\"alice\"}");
  local.setItem("username", "alice");
  local.setItem("role", "admin");
  local.setItem("activityId", "activity-1");
  local.setItem("fingerprint", "fingerprint-1");
  local.setItem("activeTab", "settings");
  local.setItem("selectedImportId", "import-1");

  clearLegacyAuthLocalStorage();

  assert.equal(local.getItem("token"), null);
  assert.equal(local.getItem("user"), null);
  assert.equal(local.getItem("username"), null);
  assert.equal(local.getItem("role"), null);
  assert.equal(local.getItem("activityId"), null);
  assert.equal(local.getItem("fingerprint"), null);
  assert.equal(local.getItem("activeTab"), "settings");
  assert.equal(local.getItem("selectedImportId"), "import-1");
});
