import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDesktopSidebarPreferenceKey,
  readDesktopSidebarCollapsed,
  writeDesktopSidebarCollapsed,
} from "@/app/useDesktopSidebarPreference";

function createStorageMock() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

test("desktop sidebar preference defaults expanded without a saved preference", () => {
  const key = buildDesktopSidebarPreferenceKey({ id: "account-a", username: "alice" });
  assert.equal(readDesktopSidebarCollapsed(key, createStorageMock()), false);
  assert.equal(readDesktopSidebarCollapsed(key, null), false);
  assert.equal(readDesktopSidebarCollapsed(null, createStorageMock()), false);
});

test("desktop sidebar preference round-trips collapsed and expanded states", () => {
  const storage = createStorageMock();
  const key = buildDesktopSidebarPreferenceKey({ id: "account-a", username: "alice" });
  assert.equal(writeDesktopSidebarCollapsed(key, true, storage), true);
  assert.equal(storage.getItem(key!), "collapsed");
  assert.equal(readDesktopSidebarCollapsed(key, storage), true);
  assert.equal(writeDesktopSidebarCollapsed(key, false, storage), true);
  assert.equal(storage.getItem(key!), "expanded");
  assert.equal(readDesktopSidebarCollapsed(key, storage), false);
});

test("desktop sidebar preference accepts only the exact collapsed marker", () => {
  const storage = createStorageMock();
  const key = buildDesktopSidebarPreferenceKey({ username: "alice" })!;
  for (const value of ["", "true", "false", "1", "COLLAPSED", " collapsed ", "null", "{bad-json", '{"collapsed":true}']) {
    storage.setItem(key, value);
    assert.equal(readDesktopSidebarCollapsed(key, storage), false, value);
  }
});

test("desktop sidebar preference stays isolated between user accounts", () => {
  const storage = createStorageMock();
  const aliceKey = buildDesktopSidebarPreferenceKey({ id: "account-a", username: "alice" });
  const bobKey = buildDesktopSidebarPreferenceKey({ id: "account-b", username: "bob" });
  writeDesktopSidebarCollapsed(aliceKey, true, storage);
  assert.notEqual(aliceKey, bobKey);
  assert.equal(readDesktopSidebarCollapsed(bobKey, storage), false);
  assert.equal(readDesktopSidebarCollapsed(aliceKey, storage), true);
});

test("desktop sidebar preference uses a stable user ID with a scoped username fallback", () => {
  assert.equal(
    buildDesktopSidebarPreferenceKey({ id: "account-a", username: "alice" }),
    buildDesktopSidebarPreferenceKey({ id: "account-a", username: "renamed" }),
  );
  assert.equal(
    buildDesktopSidebarPreferenceKey({ id: "  ", username: "alice" }),
    buildDesktopSidebarPreferenceKey({ username: "alice" }),
  );
  assert.notEqual(
    buildDesktopSidebarPreferenceKey({ id: "alice", username: "alice" }),
    buildDesktopSidebarPreferenceKey({ username: "alice" }),
  );
});

test("desktop sidebar preference keys preserve punctuation and Unicode without collisions", () => {
  const unicodeKey = buildDesktopSidebarPreferenceKey({ username: "staff:é" });
  assert.equal(unicodeKey, "sqr:desktop-sidebar:v1:username:staff%3A%C3%A9");
  assert.notEqual(unicodeKey, buildDesktopSidebarPreferenceKey({ username: "staff_é" }));
  assert.notEqual(
    buildDesktopSidebarPreferenceKey({ username: "staff/a" }),
    buildDesktopSidebarPreferenceKey({ username: "staff_a" }),
  );
});

test("desktop sidebar preference does not persist missing or malformed identities", () => {
  const storage = createStorageMock();
  for (const username of ["", "   ", "x".repeat(161), "\ud800"]) {
    const key = buildDesktopSidebarPreferenceKey({ username });
    assert.equal(key, null);
    assert.equal(writeDesktopSidebarCollapsed(key, true, storage), false);
  }
});

test("desktop sidebar preference tolerates read failures and denied writes", () => {
  const storage = {
    getItem() { throw new Error("storage denied"); },
    setItem() { throw new Error("storage denied"); },
  };
  const key = buildDesktopSidebarPreferenceKey({ username: "alice" });
  assert.equal(readDesktopSidebarCollapsed(key, storage), false);
  assert.equal(writeDesktopSidebarCollapsed(key, true, storage), false);
  assert.equal(writeDesktopSidebarCollapsed(key, true, null), false);
});

test("desktop sidebar preference survives quota errors without clearing unrelated storage", () => {
  const storage = {
    getItem() { return null; },
    setItem() {
      const error = new Error("storage full");
      error.name = "QuotaExceededError";
      throw error;
    },
  };
  assert.equal(writeDesktopSidebarCollapsed(buildDesktopSidebarPreferenceKey({ username: "alice" }), true, storage), false);
});

test("desktop sidebar preference tolerates an unavailable browser localStorage getter", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() { throw new Error("localStorage is unavailable"); },
  });

  try {
    const key = buildDesktopSidebarPreferenceKey({ username: "alice" });
    assert.equal(readDesktopSidebarCollapsed(key), false);
    assert.equal(writeDesktopSidebarCollapsed(key, true), false);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
