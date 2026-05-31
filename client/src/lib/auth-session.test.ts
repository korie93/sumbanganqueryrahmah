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
  isSessionExpired,
  isBannedSessionFlagSet,
  normalizeSessionExpiry,
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
  assert.ok(Number(session.getItem("sessionStoredAt") || 0) > 0);
  assert.ok(Number(session.getItem("sessionExpiresAt") || 0) > Number(session.getItem("sessionStoredAt") || 0));
  assert.equal(local.getItem("username"), null);
  assert.equal(local.getItem("role"), null);
  assert.equal(local.getItem("user"), null);
});

test("persistAuthenticatedUser never stores bearer tokens from accidental user payload fields", () => {
  const { session } = installStorageMocks();
  const pollutedUser = {
    ...sampleUser,
    authToken: "Bearer ey.fake.jwt",
    jwt: "ey.fake.jwt",
    token: "plain-session-token",
  } as User & {
    authToken: string;
    jwt: string;
    token: string;
  };

  persistAuthenticatedUser(pollutedUser);

  const storedUser = String(session.getItem("user") || "");
  assert.doesNotMatch(storedUser, /plain-session-token|ey\.fake\.jwt|Bearer/);
  assert.equal(session.getItem("token"), null);
  assert.equal(session.getItem("authToken"), null);
  assert.equal(session.getItem("jwt"), null);
});

test("persistAuthenticatedUser stores the server-issued session expiry when supplied", () => {
  const { session } = installStorageMocks();
  const sessionExpiresAt = "2099-05-11T01:02:03.000Z";

  persistAuthenticatedUser({ ...sampleUser, sessionExpiresAt });

  assert.equal(
    new Date(Number(session.getItem("sessionExpiresAt"))).toISOString(),
    sessionExpiresAt,
  );
  assert.equal(
    normalizeSessionExpiry(sessionExpiresAt, { nowMs: Date.parse("2099-05-10T01:02:03.000Z") })?.expiresAtIso,
    sessionExpiresAt,
  );
  assert.equal(isSessionExpired(sessionExpiresAt, Date.parse("2099-05-10T01:02:03.000Z")), false);
});

test("persistAuthenticatedUser preserves existing server expiry during profile-only refreshes", () => {
  const { session } = installStorageMocks();
  const sessionExpiresAt = "2099-05-11T01:02:03.000Z";

  persistAuthenticatedUser(sampleUser, { sessionExpiresAt });
  const firstExpiry = session.getItem("sessionExpiresAt");
  persistAuthenticatedUser({ ...sampleUser, fullName: "Alice Updated" });

  assert.equal(session.getItem("sessionExpiresAt"), firstExpiry);
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
  assert.equal(session.getItem("sessionStoredAt"), null);
  assert.equal(session.getItem("sessionExpiresAt"), null);
  assert.equal(local.getItem("user"), null);
  assert.equal(local.getItem("token"), null);
  assert.equal(local.getItem("activeTab"), "home");
  assert.match(documentMock.cookie, /Max-Age=0/);
});

test("stored auth session metadata expires stale cached users safely", () => {
  const { session } = installStorageMocks();
  session.setItem("user", JSON.stringify(sampleUser));
  session.setItem("username", "alice");
  session.setItem("role", "admin");
  session.setItem("sessionStoredAt", "1");
  session.setItem("sessionExpiresAt", "2");

  assert.equal(getStoredAuthenticatedUser(), null);
  assert.equal(session.getItem("user"), null);
  assert.equal(session.getItem("username"), null);
  assert.equal(session.getItem("role"), null);
  assert.equal(session.getItem("sessionStoredAt"), null);
  assert.equal(session.getItem("sessionExpiresAt"), null);
});

test("stored auth session recovers missing metadata without accepting corrupted users", () => {
  const { session } = installStorageMocks();
  session.setItem("user", JSON.stringify(sampleUser));
  session.setItem("username", "alice");
  session.setItem("role", "admin");

  assert.equal(getStoredAuthenticatedUser()?.username, "alice");
  assert.ok(Number(session.getItem("sessionStoredAt") || 0) > 0);

  session.setItem("user", "{bad-json");
  assert.equal(getStoredAuthenticatedUser(), null);
  assert.equal(session.getItem("user"), null);
  assert.equal(session.getItem("sessionStoredAt"), null);
});

test("stored auth session validates cached user JSON against the session schema", () => {
  const { session } = installStorageMocks();
  session.setItem("user", JSON.stringify({
    username: "alice",
    role: "admin",
    permissions: ["unexpected"],
  }));
  session.setItem("username", "alice");
  session.setItem("role", "admin");

  assert.equal(getStoredAuthenticatedUser(), null);
  assert.equal(session.getItem("user"), null);

  session.setItem("user", JSON.stringify({
    username: "alice",
    role: 42,
  }));
  session.setItem("username", "alice");
  session.setItem("role", "admin");

  assert.equal(getStoredAuthenticatedUser(), null);
  assert.equal(session.getItem("user"), null);
});

test("persistAuthNotice stores a one-time login notice in sessionStorage", () => {
  const { session } = installStorageMocks();

  persistAuthNotice("Session expired. Please login again.");

  assert.match(String(session.getItem("auth_notice") || ""), /Session expired/i);
  assert.equal(consumeStoredAuthNotice(), "Session expired. Please login again.");
  assert.equal(session.getItem("auth_notice"), null);
});

test("auth session helpers tolerate sessionStorage read and write failures", () => {
  const { local } = installStorageMocks();
  const throwingSessionStorage = {
    get length() {
      return 0;
    },
    key() {
      return null;
    },
    getItem() {
      throw new DOMException("private browsing read blocked", "SecurityError");
    },
    setItem() {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    },
    removeItem() {
      throw new DOMException("private browsing remove blocked", "SecurityError");
    },
    clear() {
      throw new DOMException("private browsing clear blocked", "SecurityError");
    },
  };

  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: throwingSessionStorage,
  });

  assert.doesNotThrow(() => persistAuthenticatedUser(sampleUser));
  assert.doesNotThrow(() => persistAuthNotice("Session expired."));
  assert.equal(consumeStoredAuthNotice(), "");
  assert.equal(getStoredAuthenticatedUser(), null);
  assert.equal(getStoredUsername(), "");
  assert.equal(getStoredRole(), "");
  assert.doesNotThrow(() => clearAuthenticatedUserStorage());
  assert.equal(local.getItem("activeTab"), null);
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
