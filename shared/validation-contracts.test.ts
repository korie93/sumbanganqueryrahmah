import assert from "node:assert/strict";
import test from "node:test";
import {
  apiErrorPayloadSchema,
  authCurrentUserSchema,
  importAnalysisColumnProfileSchema,
  tabVisibilityResponseSchema,
} from "./api-contracts";
import {
  insertAuditLogSchema,
  insertBackupSchema,
  insertDataRowSchema,
  insertImportSchema,
  insertUserActivitySchema,
} from "./schema-postgres";

const columnProfile = {
  name: "Amount", inferredType: "number", applicableRows: 2,
  populatedCount: 2, emptyCount: 0, completenessPercent: 100,
  typeConsistencyPercent: 100, uniqueCount: 2,
  uniqueCountIsApproximate: false, duplicateCount: 0,
};

test("import analysis type counts remain sparse enum maps", () => {
  for (const typeDistribution of [{}, { number: 2 }, { text: 1, boolean: 0 }]) {
    assert.deepEqual(importAnalysisColumnProfileSchema.parse({ ...columnProfile, typeDistribution }).typeDistribution,
      typeDistribution);
  }
  for (const typeDistribution of [{ unknownType: 1 }, { number: -1 }, { number: 0.5 }, { number: "2" }]) {
    assert.equal(importAnalysisColumnProfileSchema.safeParse({ ...columnProfile, typeDistribution }).success, false);
  }
});

test("API record contracts preserve open string keys and reject wrong values", () => {
  const tabs = { "general-search": true, "future-feature": false };
  assert.deepEqual(tabVisibilityResponseSchema.parse({ role: "user", tabs }).tabs, tabs);
  assert.deepEqual(tabVisibilityResponseSchema.parse({ role: "user", tabs: {} }).tabs, {});
  assert.equal(tabVisibilityResponseSchema.safeParse({ role: "user", tabs: { viewer: "false" } }).success, false);
  const fieldErrors = { "user.email": ["Required"], custom: { retry: false }, count: 2, absent: null };
  assert.deepEqual(apiErrorPayloadSchema.parse({ message: "Invalid input", fieldErrors }).fieldErrors, fieldErrors);
  assert.equal(apiErrorPayloadSchema.safeParse({ message: "Invalid input", fieldErrors: { invalid: undefined } }).success, false);
  assert.equal(apiErrorPayloadSchema.safeParse({ message: "Invalid input", unexpected: true }).success, false);
});

function currentUser() {
  return {
    id: "account-id", username: "account", fullName: null, email: null, role: "user", status: "active",
    mustChangePassword: false, passwordResetBySuperuser: false, isBanned: false,
    twoFactorPendingSetup: false, activatedAt: null, passwordChangedAt: null, lastLoginAt: null,
  };
}

test("current-user output defaults still fill omitted or undefined fields without masking invalid input", () => {
  for (const optionalFields of [{}, {
    createdAt: undefined, avatarUrl: undefined, twoFactorEnabled: undefined, twoFactorConfiguredAt: undefined,
  }]) {
    const parsed = authCurrentUserSchema.parse({ ...currentUser(), ...optionalFields });
    assert.equal(parsed.createdAt, null);
    assert.equal(parsed.avatarUrl, null);
    assert.equal(parsed.twoFactorEnabled, false);
    assert.equal(parsed.twoFactorConfiguredAt, null);
  }
  const timestamp = "2026-10-24T08:00:00+08:00";
  const avatarUrl = "/api/me/avatar?v=0123456789abcdef01234567";
  const explicit = authCurrentUserSchema.parse({
    ...currentUser(), createdAt: timestamp, avatarUrl, twoFactorEnabled: true, twoFactorConfiguredAt: timestamp,
  });
  assert.equal(explicit.createdAt, timestamp);
  assert.equal(explicit.avatarUrl, avatarUrl);
  assert.equal(explicit.twoFactorEnabled, true);
  assert.equal(explicit.twoFactorConfiguredAt, timestamp);
  for (const invalid of [{ twoFactorEnabled: null }, { createdAt: "invalid" }, { avatarUrl: "https://example.test/avatar" }]) {
    assert.equal(authCurrentUserSchema.safeParse({ ...currentUser(), ...invalid }).success, false);
  }
  assert.equal(authCurrentUserSchema.safeParse({ ...currentUser(), passwordHash: "private" }).success, false);
});

test("Drizzle insert contracts retain required columns, optional nullable columns and selected-field output", () => {
  assert.deepEqual(insertImportSchema.parse({ name: "Import", filename: "import.csv", id: "server-only" }), {
    name: "Import", filename: "import.csv",
  });
  assert.equal(insertImportSchema.safeParse({ name: "Import" }).success, false);
  assert.equal(insertImportSchema.safeParse({ name: "Import", filename: 12 }).success, false);

  const activity = { userId: "user-id", username: "account", role: "user" };
  assert.deepEqual(insertUserActivitySchema.parse(activity), activity);
  assert.deepEqual(insertUserActivitySchema.parse({ ...activity, browser: null, pcName: "Desktop" }), {
    ...activity, browser: null, pcName: "Desktop",
  });
  assert.equal(insertUserActivitySchema.safeParse({ username: "account", role: "user" }).success, false);

  assert.deepEqual(insertAuditLogSchema.parse({ action: "ACTION", performedBy: "account", details: null }), {
    action: "ACTION", performedBy: "account", details: null,
  });
  assert.equal(insertAuditLogSchema.safeParse({ action: "ACTION" }).success, false);
  assert.deepEqual(insertBackupSchema.parse({ name: "Backup", createdBy: "account", backupData: "{}" }), {
    name: "Backup", createdBy: "account", backupData: "{}",
  });
  assert.equal(insertBackupSchema.safeParse({ name: "Backup", createdBy: "account" }).success, false);
});

test("import row insert contract still validates nested JSON records", () => {
  const row = { importId: "import-id", jsonDataJsonb: { Amount: 12, extra: [true, null, { label: "value" }] } };
  assert.deepEqual(insertDataRowSchema.parse(row), row);
  assert.equal(insertDataRowSchema.safeParse({ ...row, jsonDataJsonb: [] }).success, false);
  assert.equal(insertDataRowSchema.safeParse({ ...row, jsonDataJsonb: { invalid: Number.NaN } }).success, false);
});
