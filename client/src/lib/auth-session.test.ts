import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@/app/types";
import {
  clearAuthenticatedUserStorage,
  getStoredActivityId,
  getStoredAuthenticatedUser,
  getStoredRole,
  getStoredUsername,
  isBannedSessionFlagSet,
  persistAuthenticatedUser,
  setBannedSessionFlag,
  setStoredActivityId,
} from "@/lib/auth-session";

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

function installStorageMocks() {
  const local = createStorageMock();
  const session = createStorageMock();
  const documentMock = { cookie: "sqr_auth_hint=1" };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: globalThis,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: local,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: session,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentMock,
  });

  return { local, session, documentMock };
}

const sampleUser: User = {
  username: "alice",
  role: "admin",
  fullName: "Alice Admin",
};

test("persistAuthenticatedUser stores auth session data in sessionStorage instead of localStorage", () => {
  const { local, session } = installStorageMocks();

  persistAuthenticatedUser(sampleUser);

  assert.equal(session.getItem("username"), "alice");
  assert.equal(session.getItem("role"), "admin");
  assert.match(String(session.getItem("user") || ""), /Alice Admin/);
  assert.equal(local.getItem("username"), null);
  assert.equal(local.getItem("role"), null);
  assert.equal(local.getItem("user"), null);
});

test("getStoredAuthenticatedUser migrates legacy localStorage auth data into sessionStorage", () => {
  const { local, session } = installStorageMocks();
  local.setItem("user", JSON.stringify(sampleUser));
  local.setItem("username", "alice");
  local.setItem("role", "admin");

  const restored = getStoredAuthenticatedUser();

  assert.equal(restored?.username, "alice");
  assert.equal(getStoredUsername(), "alice");
  assert.equal(getStoredRole(), "admin");
  assert.equal(session.getItem("user"), JSON.stringify(sampleUser));
  assert.equal(local.getItem("user"), null);
});

test("auth session helpers keep activity and banned flags scoped to the browser session", () => {
  installStorageMocks();

  setStoredActivityId("activity-123");
  setBannedSessionFlag(true);

  assert.equal(getStoredActivityId(), "activity-123");
  assert.equal(isBannedSessionFlagSet(), true);
});

test("clearAuthenticatedUserStorage clears both session auth data and legacy local copies", () => {
  const { local, session, documentMock } = installStorageMocks();
  persistAuthenticatedUser(sampleUser);
  setStoredActivityId("activity-123");
  setBannedSessionFlag(true);
  local.setItem("user", JSON.stringify(sampleUser));
  local.setItem("role", "admin");
  local.setItem("username", "alice");
  local.setItem("token", "legacy-token");
  local.setItem("activeTab", "home");

  clearAuthenticatedUserStorage();

  assert.equal(session.getItem("user"), null);
  assert.equal(session.getItem("activityId"), null);
  assert.equal(session.getItem("banned"), null);
  assert.equal(local.getItem("user"), null);
  assert.equal(local.getItem("token"), null);
  assert.equal(local.getItem("activeTab"), null);
  assert.match(documentMock.cookie, /Max-Age=0/);
});
