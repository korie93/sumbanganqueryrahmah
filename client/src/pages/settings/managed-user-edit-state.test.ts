import assert from "node:assert/strict";
import test from "node:test";
import { getManagedUserEditState } from "./managed-user-edit-state";

type Target = NonNullable<Parameters<typeof getManagedUserEditState>[0]>;
type Draft = Parameters<typeof getManagedUserEditState>[1];
const target: Target = {
  fullName: "Synthetic Maya Chen", username: "maya.synthetic", email: "maya.synthetic@example.test",
  role: "admin", status: "active", isBanned: false,
};
const draft = (changes: Partial<Draft> = {}): Draft => ({
  ...target, fullName: target.fullName ?? "", email: target.email ?? "", isBanned: Boolean(target.isBanned), ...changes,
});

test("missing edit targets cannot produce a save or a profile payload", () => {
  assert.deepEqual(getManagedUserEditState(null, draft({ fullName: "Changed", role: "manager" })), {
    profilePayload: {}, errors: {}, roleChanged: false, statusChanged: false, hasChanges: false, canSave: false,
  });
});

test("unchanged and semantically identical case or padding changes remain no-ops", () => {
  for (const value of [draft(), draft({ fullName: "  Synthetic Maya Chen  ", username: "  MAYA.SYNTHETIC  ", email: "  MAYA.SYNTHETIC@EXAMPLE.TEST  " })]) {
    assert.deepEqual(getManagedUserEditState(target, value), {
      profilePayload: {}, errors: {}, roleChanged: false, statusChanged: false, hasChanges: false, canSave: false,
    });
  }
  const padded: Target = { ...target, fullName: "  Synthetic Maya Chen  ", username: " MAYA.SYNTHETIC ", email: " MAYA.SYNTHETIC@EXAMPLE.TEST " };
  assert.deepEqual(getManagedUserEditState(padded, draft()).profilePayload, {});
  assert.equal(getManagedUserEditState(padded, draft()).hasChanges, false);
});

test("changed profile fields produce only the existing normalized profile keys", () => {
  const state = getManagedUserEditState(target, draft({ fullName: "  Updated Synthetic User  ", username: "  UPDATED.USER  ", email: "  UPDATED@EXAMPLE.TEST  " }));
  assert.deepEqual(state.profilePayload, { fullName: "Updated Synthetic User", username: "updated.user", email: "updated@example.test" });
  assert.deepEqual(state.errors, {});
  assert.equal(state.hasChanges, true);
  assert.equal(state.canSave, true);
  assert.equal(state.roleChanged, false);
  assert.equal(state.statusChanged, false);
});

test("active account optional name and email clear to null without adding unchanged identity keys", () => {
  const state = getManagedUserEditState(target, draft({ fullName: "  ", email: "  " }));
  assert.deepEqual(state.profilePayload, { fullName: null, email: null });
  assert.deepEqual(state.errors, {});
  assert.equal(state.canSave, true);
  const empty: Target = { ...target, fullName: null, email: null };
  const unchanged = getManagedUserEditState(empty, draft({ fullName: " ", email: " " }));
  assert.deepEqual(unchanged.profilePayload, {});
  assert.equal(unchanged.hasChanges, false);
  assert.equal(unchanged.canSave, false);
});

test("only changed usernames receive the existing 3-32 character format feedback", () => {
  for (const username of ["", "ab", "bad space", "x".repeat(33), "unsafe<name>"]) {
    const state = getManagedUserEditState(target, draft({ username, role: "manager" }));
    assert.ok(state.errors.username, username);
    assert.equal(state.roleChanged, true);
    assert.equal(state.hasChanges, true);
    assert.equal(state.canSave, false);
  }
  for (const username of ["abc", "valid.name_1-2", "x".repeat(32)]) {
    const state = getManagedUserEditState(target, draft({ username }));
    assert.deepEqual(state.errors, {});
    assert.equal(state.canSave, true);
  }
});

test("untouched legacy invalid usernames do not block unrelated role changes", () => {
  const legacy: Target = { ...target, username: "Legacy User!" };
  const state = getManagedUserEditState(legacy, draft({ username: "  LEGACY USER!  ", role: "manager" }));
  assert.deepEqual(state.profilePayload, {});
  assert.deepEqual(state.errors, {});
  assert.equal(state.roleChanged, true);
  assert.equal(state.canSave, true);
});

test("changed email validation mirrors the existing simple server address pattern", () => {
  for (const email of ["not-an-email", "name@host", "name@@example.test", "name @example.test", "@example.test"]) {
    const state = getManagedUserEditState(target, draft({ email }));
    assert.ok(state.errors.email, email);
    assert.equal(state.canSave, false);
  }
  for (const email of ["A@B.C", "NAME+TAG@EXAMPLE.TEST", "member@sub.example.test"]) {
    const state = getManagedUserEditState(target, draft({ email }));
    assert.deepEqual(state.errors, {});
    assert.equal(state.profilePayload.email, email.toLowerCase());
    assert.equal(state.canSave, true);
  }
});

test("pending account email cannot be cleared when changed, even alongside a status change", () => {
  const pending: Target = { ...target, status: "pending_activation" };
  for (const status of ["pending_activation", "active"]) {
    const state = getManagedUserEditState(pending, draft({ email: " ", status }));
    assert.deepEqual(state.profilePayload, { email: null });
    assert.match(state.errors.email!, /Pending accounts require an email/);
    assert.equal(state.canSave, false);
  }
});

test("unchanged legacy invalid or blank pending email does not block unrelated changes", () => {
  for (const email of [null, "legacy-address", "NAME@INTRANET"]) {
    const legacy: Target = { ...target, status: "pending_activation", email };
    const state = getManagedUserEditState(legacy, draft({ email: email?.toLowerCase() ?? "", status: "pending_activation", role: "manager" }));
    assert.deepEqual(state.profilePayload, {});
    assert.deepEqual(state.errors, {});
    assert.equal(state.roleChanged, true);
    assert.equal(state.canSave, true);
  }
});

test("role, status and ban-only edits keep separate flags without a profile payload", () => {
  for (const [changes, roleChanged, statusChanged] of [
    [{ role: "manager" }, true, false],
    [{ status: "suspended" }, false, true],
    [{ isBanned: true }, false, true],
    [{ role: "user", status: "disabled", isBanned: true }, true, true],
  ] as const) {
    const state = getManagedUserEditState(target, draft(changes));
    assert.deepEqual(state.profilePayload, {});
    assert.deepEqual(state.errors, {});
    assert.equal(state.roleChanged, roleChanged);
    assert.equal(state.statusChanged, statusChanged);
    assert.equal(state.hasChanges, true);
    assert.equal(state.canSave, true);
  }
});

test("null stored ban state is semantically equivalent to an unchecked draft", () => {
  const state = getManagedUserEditState({ ...target, isBanned: null }, draft());
  assert.equal(state.statusChanged, false);
  assert.equal(state.hasChanges, false);
  assert.equal(state.canSave, false);
});

test("feedback is pure and reverting all changes removes errors and every payload key", () => {
  const stored = Object.freeze({ ...target });
  const changed = Object.freeze(draft({ username: "bad space", email: "invalid", role: "manager" }));
  assert.equal(getManagedUserEditState(stored, changed).canSave, false);
  const reverted = getManagedUserEditState(stored, Object.freeze(draft()));
  assert.deepEqual(reverted.profilePayload, {});
  assert.deepEqual(reverted.errors, {});
  assert.equal(reverted.roleChanged, false);
  assert.equal(reverted.statusChanged, false);
  assert.equal(reverted.hasChanges, false);
  assert.equal(reverted.canSave, false);
});
