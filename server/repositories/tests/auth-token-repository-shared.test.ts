import assert from "node:assert/strict";
import test from "node:test";
import {
  buildActivationTokenInsertRecord,
  buildPasswordResetRequestInsertRecord,
  buildPasswordResetRequestUpdateRecord,
  normalizeAuthTokenHash,
  resolveAuthTokenConsumptionState,
} from "../auth-token-repository-shared";

test("auth token repository shared normalizes token hashes and consumption state", () => {
  const now = new Date("2026-04-06T12:00:00.000Z");
  const normalizedHash = normalizeAuthTokenHash("  abc123  ");
  const consumed = resolveAuthTokenConsumptionState("  token-1  ", now);
  const missing = resolveAuthTokenConsumptionState("   ", now);

  assert.equal(normalizedHash, "abc123");
  assert.equal(consumed?.id, "token-1");
  assert.equal(consumed?.now, now);
  assert.equal(consumed?.nowIso, "2026-04-06T12:00:00.000Z");
  assert.equal(missing, null);
});

test("auth token repository shared builds activation and password reset records", () => {
  const now = new Date("2026-04-06T12:00:00.000Z");
  const activation = buildActivationTokenInsertRecord(
    {
      userId: "user-1",
      tokenHash: "hash-1",
      expiresAt: new Date("2026-04-07T12:00:00.000Z"),
      createdBy: "admin-1",
    },
    now,
  );
  const reset = buildPasswordResetRequestInsertRecord(
    {
      userId: "user-2",
      requestedByUser: "user-2",
      approvedBy: undefined,
      resetType: undefined,
      tokenHash: "hash-2",
      expiresAt: null,
      usedAt: undefined,
    },
    now,
  );

  assert.equal(activation.userId, "user-1");
  assert.equal(activation.createdBy, "admin-1");
  assert.equal(activation.usedAt, null);
  assert.equal(activation.createdAt, now);

  assert.equal(reset.userId, "user-2");
  assert.equal(reset.requestedByUser, "user-2");
  assert.equal(reset.approvedBy, null);
  assert.equal(reset.resetType, "email_link");
  assert.equal(reset.tokenHash, "hash-2");
  assert.equal(reset.usedAt, null);
  assert.equal(reset.createdAt, now);
});

test("auth token repository shared builds sparse password reset updates", () => {
  const update = buildPasswordResetRequestUpdateRecord({
    requestId: "request-1",
    approvedBy: "admin-1",
    resetType: "manual_reset",
    tokenHash: undefined,
    expiresAt: undefined,
    usedAt: null,
  });

  assert.equal(update.approvedBy, "admin-1");
  assert.equal(update.resetType, "manual_reset");
  assert.equal(update.tokenHash, null);
  assert.equal(update.expiresAt, null);
  assert.equal(update.usedAt, null);
});
