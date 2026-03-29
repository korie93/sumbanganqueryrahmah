import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSingleTabLockStorageKey,
  canClaimSingleTabLock,
  createSingleTabLock,
  createSingleTabNavigationReclaim,
  isSingleTabNavigationReclaimActive,
  isSingleTabLockExpired,
  isSingleTabLockOwner,
  parseSingleTabNavigationReclaim,
  parseSingleTabLock,
  serializeSingleTabNavigationReclaim,
  serializeSingleTabLock,
} from "@/app/single-tab-session";

test("single-tab lock keys normalize usernames consistently", () => {
  assert.equal(
    buildSingleTabLockStorageKey("  Alice.Admin  "),
    "sqr_single_tab_lock:alice.admin",
  );
});

test("single-tab lock round-trips through serialization safely", () => {
  const lock = createSingleTabLock("Alice", "tab-seed-1", "instance-1", 1_000);
  const parsed = parseSingleTabLock(serializeSingleTabLock(lock));

  assert.deepEqual(parsed, {
    username: "alice",
    tabSeed: "tab-seed-1",
    instanceId: "instance-1",
    updatedAt: 1_000,
  });
});

test("single-tab lock rejects malformed payloads", () => {
  assert.equal(parseSingleTabLock("{\"username\":\"alice\"}"), null);
  assert.equal(parseSingleTabLock(""), null);
  assert.equal(parseSingleTabLock("not-json"), null);
});

test("single-tab lock allows the owner instance to refresh its own lock", () => {
  const lock = createSingleTabLock("alice", "tab-seed-1", "instance-1", 5_000);

  assert.equal(isSingleTabLockOwner(lock, "alice", "tab-seed-1", "instance-1"), true);
  assert.equal(canClaimSingleTabLock(lock, "alice", "tab-seed-1", "instance-1", 6_000, 12_000), true);
});

test("single-tab lock blocks a duplicated tab that copied the same tab seed", () => {
  const ownerLock = createSingleTabLock("alice", "tab-seed-1", "instance-owner", 5_000);

  assert.equal(
    canClaimSingleTabLock(ownerLock, "alice", "tab-seed-1", "instance-duplicate", 6_000, 12_000),
    false,
  );
});

test("single-tab lock allows a new tab to claim ownership after expiry", () => {
  const staleLock = createSingleTabLock("alice", "tab-seed-1", "instance-owner", 5_000);

  assert.equal(isSingleTabLockExpired(staleLock, 18_500, 12_000), true);
  assert.equal(
    canClaimSingleTabLock(staleLock, "alice", "tab-seed-2", "instance-new", 18_500, 12_000),
    true,
  );
});

test("single-tab lock allows the same tab seed to reclaim ownership during a reload", () => {
  const ownerLock = createSingleTabLock("alice", "tab-seed-1", "instance-before-reload", 5_000);

  assert.equal(
    canClaimSingleTabLock(
      ownerLock,
      "alice",
      "tab-seed-1",
      "instance-after-reload",
      6_000,
      12_000,
      true,
    ),
    true,
  );
});

test("single-tab navigation reclaim round-trips and validates recent same-tab navigation", () => {
  const reclaim = createSingleTabNavigationReclaim("tab-seed-1", 5_000);
  const parsed = parseSingleTabNavigationReclaim(serializeSingleTabNavigationReclaim(reclaim));

  assert.deepEqual(parsed, {
    tabSeed: "tab-seed-1",
    markedAt: 5_000,
  });
  assert.equal(isSingleTabNavigationReclaimActive(parsed, "tab-seed-1", 6_000, 15_000), true);
  assert.equal(isSingleTabNavigationReclaimActive(parsed, "tab-seed-2", 6_000, 15_000), false);
  assert.equal(isSingleTabNavigationReclaimActive(parsed, "tab-seed-1", 21_000, 15_000), false);
});
