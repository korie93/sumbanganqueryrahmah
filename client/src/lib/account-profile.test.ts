import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@/app/types";
import { createAccountProfilePatch, formatAccountCreatedAt, mergeAccountProfile, safeAccountAvatarUrl, syncAccountProfile } from "./account-profile";
import { getStoredAuthenticatedUser, persistAuthenticatedUser } from "./auth-session";

const actor: User = { id: "actor-1", username: "user", role: "user", email: "user@example.test", mustChangePassword: true, sessionExpiresAt: "2026-10-04T01:00:00.000Z" };
const avatarUrl = `/api/me/avatar?v=${"a".repeat(24)}`;
test("avatar rendering allows only authenticated same-origin avatar URLs", () => {
  assert.equal(safeAccountAvatarUrl(avatarUrl), avatarUrl);
  for (const url of [null, undefined, "", "https://example.test/photo.png", "//example.test/photo", "data:image/svg+xml,evil", "/api/me/avatar?v=x", `${avatarUrl}&userId=other`]) assert.equal(safeAccountAvatarUrl(url), undefined);
});
test("profile updates preserve identity, permissions and session constraints", () => {
  const next = mergeAccountProfile(actor, { ...actor, avatarUrl, role: "superuser", email: "new@example.test", mustChangePassword: false, twoFactorEnabled: true });
  assert.equal(next?.avatarUrl, avatarUrl);
  assert.equal(next?.role, "user");
  assert.equal(next?.email, actor.email);
  assert.equal(next?.mustChangePassword, true);
  assert.equal(next?.twoFactorEnabled, true);
  assert.equal(mergeAccountProfile(next, { ...actor, avatarUrl: null })?.avatarUrl, null);
});
test("late profile responses cannot resurrect a session or alter a different account", () => {
  assert.equal(mergeAccountProfile(null, actor), null);
  assert.equal(mergeAccountProfile(actor, { ...actor, id: "other" }), actor);
  assert.equal(mergeAccountProfile(actor, { ...actor, username: "other" }), actor);
  assert.equal(mergeAccountProfile(actor, { ...actor, sessionExpiresAt: "2026-10-04T02:00:00.000Z" }), actor);
});
test("created date is truthful when unavailable and formatted in application timezone", () => {
  assert.equal(formatAccountCreatedAt(null), "Not available");
  assert.equal(formatAccountCreatedAt("invalid"), "Not available");
  assert.match(formatAccountCreatedAt("2026-10-01T23:00:00.000Z"), /2 October 2026/);
});

test("an avatar completion cannot revert 2FA learned from /me after the upload started", () => {
  const uploadStart = { ...actor, twoFactorEnabled: false, twoFactorPendingSetup: false, twoFactorConfiguredAt: null };
  const refreshed = { ...uploadStart, twoFactorEnabled: true, twoFactorConfiguredAt: "2026-10-03T03:00:00.000Z" };
  const patch = createAccountProfilePatch({ ...uploadStart, avatarUrl }, "avatar");
  const next = mergeAccountProfile(refreshed, patch);
  assert.equal(next?.avatarUrl, avatarUrl);
  assert.equal(next?.twoFactorEnabled, true);
  assert.equal(next?.twoFactorConfiguredAt, refreshed.twoFactorConfiguredAt);
  assert.equal("twoFactorEnabled" in patch, false);
  assert.equal("twoFactorPendingSetup" in patch, false);
  assert.equal("twoFactorConfiguredAt" in patch, false);
});

test("a 2FA completion cannot revert an avatar learned from /me after setup started", () => {
  const setupStart = { ...actor, avatarUrl: null, createdAt: null, twoFactorEnabled: false };
  const refreshed = { ...setupStart, avatarUrl, createdAt: "2026-01-01T00:00:00.000Z" };
  const patch = createAccountProfilePatch({ ...setupStart, twoFactorEnabled: true }, "two-factor");
  const next = mergeAccountProfile(refreshed, patch);
  assert.equal(next?.twoFactorEnabled, true);
  assert.equal(next?.avatarUrl, avatarUrl);
  assert.equal(next?.createdAt, refreshed.createdAt);
  assert.equal("avatarUrl" in patch, false);
  assert.equal("createdAt" in patch, false);
});

test("profile synchronization persists merged state but emits only mutation-owned fields", () => {
  const descriptors = new Map(["window", "localStorage", "sessionStorage"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const storage = new Map<string, string>();
  const events: User[] = [];
  const storageMock = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() { return storage.size; },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { dispatchEvent: (event: CustomEvent<User>) => { events.push(event.detail); return true; } } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: null });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storageMock });
  try {
    const current = { ...actor, sessionExpiresAt: new Date(Date.now() + 3_600_000).toISOString(), twoFactorEnabled: true };
    persistAuthenticatedUser(current);
    syncAccountProfile({ ...current, avatarUrl, twoFactorEnabled: false }, "avatar");
    assert.equal(getStoredAuthenticatedUser()?.twoFactorEnabled, true);
    assert.equal(getStoredAuthenticatedUser()?.avatarUrl, avatarUrl);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.avatarUrl, avatarUrl);
    assert.equal("twoFactorEnabled" in events[0]!, false);
    assert.equal("email" in events[0]!, false);
    assert.equal("mustChangePassword" in events[0]!, false);

    syncAccountProfile({ ...current, avatarUrl: null, twoFactorEnabled: false, twoFactorConfiguredAt: null }, "two-factor");
    assert.equal(getStoredAuthenticatedUser()?.avatarUrl, avatarUrl);
    assert.equal(getStoredAuthenticatedUser()?.twoFactorEnabled, false);
    assert.equal(events[1]?.twoFactorConfiguredAt, null);
    assert.equal("avatarUrl" in events[1]!, false);
    const eventCount = events.length;
    syncAccountProfile({ ...current, id: "other", avatarUrl: null }, "avatar");
    syncAccountProfile({ ...current, sessionExpiresAt: new Date(Date.now() + 7_200_000).toISOString(), avatarUrl: null }, "avatar");
    assert.equal(events.length, eventCount);
    assert.equal(getStoredAuthenticatedUser()?.avatarUrl, avatarUrl);
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
