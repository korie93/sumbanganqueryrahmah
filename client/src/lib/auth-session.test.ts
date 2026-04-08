import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@/app/types";
import {
  broadcastForcedLogout,
  clearAuthenticatedUserStorage,
  consumeStoredAuthNotice,
  getStoredActivityId,
  getStoredAuthenticatedUser,
  getStoredRole,
  getStoredUsername,
  isBannedSessionFlagSet,
  parseForcedLogoutStorageValue,
  persistAuthenticatedUser,
  persistAuthNotice,
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
  const broadcastMessages: unknown[] = [];
  const documentMock = { cookie: "sqr_auth_hint=1" };
  const eventTarget = new EventTarget();
  const windowMock = Object.assign(globalThis, {
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
  });

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowMock,
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
  Object.defineProperty(globalThis, "BroadcastChannel", {
    configurable: true,
    value: class BroadcastChannelMock extends EventTarget {
      readonly name: string;

      constructor(name: string) {
        super();
        this.name = name;
      }

      postMessage(message: unknown) {
        broadcastMessages.push(message);
      }

      close() {
        // no-op for tests
      }
    },
  });

  return { local, session, documentMock, broadcastMessages };
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

test("getStoredAuthenticatedUser ignores and clears legacy localStorage auth data", () => {
  const { local, session } = installStorageMocks();
  local.setItem("user", JSON.stringify(sampleUser));
  local.setItem("username", "alice");
  local.setItem("role", "admin");

  const restored = getStoredAuthenticatedUser();

  assert.equal(restored, null);
  assert.equal(getStoredUsername(), "");
  assert.equal(getStoredRole(), "");
  assert.equal(session.getItem("user"), null);
  assert.equal(local.getItem("user"), null);
  assert.equal(local.getItem("username"), null);
  assert.equal(local.getItem("role"), null);
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
  assert.equal(local.getItem("activeTab"), "home");
  assert.match(documentMock.cookie, /Max-Age=0/);
});

test("persistAuthNotice stores a one-time login notice in sessionStorage", () => {
  const { session } = installStorageMocks();

  persistAuthNotice("Session expired. Please login again.");

  assert.match(String(session.getItem("auth_notice") || ""), /Session expired/i);
  assert.equal(consumeStoredAuthNotice(), "Session expired. Please login again.");
  assert.equal(session.getItem("auth_notice"), null);
});

test("parseForcedLogoutStorageValue supports both legacy and structured payloads", () => {
  assert.deepEqual(parseForcedLogoutStorageValue("true"), {});
  assert.deepEqual(
    parseForcedLogoutStorageValue(JSON.stringify({ message: "Password changed. Please login again." })),
    { message: "Password changed. Please login again." },
  );
});

test("broadcastForcedLogout broadcasts through BroadcastChannel and dispatches a browser event", () => {
  const { local, broadcastMessages } = installStorageMocks();
  const events: Array<string> = [];
  const listener = (event: Event) => {
    events.push(String((event as CustomEvent<{ message?: string }>).detail?.message || ""));
  };

  window.addEventListener("force-logout", listener);
  try {
    broadcastForcedLogout("Password was reset. Please login again.");
  } finally {
    window.removeEventListener("force-logout", listener);
  }

  assert.equal(local.getItem("forceLogout"), null);
  assert.equal(broadcastMessages.length, 1);
  const payload = broadcastMessages[0] as { message?: unknown; nonce?: unknown };
  assert.equal(payload.message, "Password was reset. Please login again.");
  assert.match(String(payload.nonce || ""), /^force-logout-/);
  assert.deepEqual(events, ["Password was reset. Please login again."]);
});
