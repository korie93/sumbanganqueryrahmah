import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedUser } from "../../auth/guards";
import { HttpError } from "../../http/errors";
import type { CollectionRecord } from "../../storage-postgres-collection-types";
import { CollectionManualSettlementOperations } from "../collection/collection-manual-settlement-operations";
import type { CollectionStoragePort } from "../collection/collection-service-support";

const RECORD_ID = "11111111-1111-4111-8111-111111111111";

function user(role: string): AuthenticatedUser {
  return { username: `${role}.actor`, role, activityId: `${role}-activity` };
}

function record(overrides: Partial<CollectionRecord> = {}): CollectionRecord {
  return {
    id: RECORD_ID,
    customerName: "Account holder",
    icNumber: "",
    customerPhone: "",
    accountNumber: "A001",
    batch: "P10",
    paymentDate: "2026-09-03",
    amount: "150.00",
    receiptFile: null,
    receipts: [],
    receiptTotalAmount: "150.00",
    receiptValidationStatus: "matched",
    receiptValidationMessage: null,
    receiptCount: 1,
    duplicateReceiptFlag: false,
    createdByLogin: "collector.login",
    collectionStaffNickname: "collector.alpha",
    createdAt: new Date("2026-09-03T00:00:00.000Z"),
    automaticCpStatus: "cp",
    cpStatus: "cp",
    effectiveSettlementSource: "NONE",
    manualSettlement: null,
    ...overrides,
  };
}

function operations(storage: Partial<CollectionStoragePort>) {
  return new CollectionManualSettlementOperations(
    storage as CollectionStoragePort,
    (authenticatedUser) => {
      if (!authenticatedUser) throw new Error("Unauthenticated test request");
      return authenticatedUser;
    },
  );
}

function isHttpStatus(statusCode: number) {
  return (error: unknown) => error instanceof HttpError && error.statusCode === statusCode;
}

test("Manual Verified ABORT mutation is superuser-only before any storage write", async () => {
  let writes = 0;
  const service = operations({
    getCollectionRecordById: async () => record(),
    upsertCollectionManualSettlement: async () => {
      writes += 1;
      return record();
    },
    revokeCollectionManualSettlement: async () => {
      writes += 1;
      return record();
    },
  });
  for (const role of ["manager", "admin", "user"]) {
    await assert.rejects(
      service.upsert(user(role), RECORD_ID, {
        poolAmount: "350.00",
        settlementDate: "2026-09-03",
        reason: "EXTERNAL_UNASSIGNED_PAYMENT",
        confirmed: true,
      }),
      isHttpStatus(403),
    );
    await assert.rejects(
      service.revoke(user(role), RECORD_ID, {
        expectedVersion: 1,
        revokeReason: "Correction",
        confirmed: true,
      }),
      isHttpStatus(403),
    );
  }
  assert.equal(writes, 0);
});

test("RM500 example keeps RM150 user claim and sends only controlled RM350 POOL fields", async () => {
  let received: Parameters<CollectionStoragePort["upsertCollectionManualSettlement"]>[0] | undefined;
  const effective = record({
    cpStatus: "abort_cp",
    automaticCpStatus: "cp",
    effectiveSettlementSource: "MANUAL_VERIFIED",
    effectiveSettlementDate: "2026-09-03",
    manualSettlement: {
      status: "ACTIVE",
      validity: "EFFECTIVE",
      poolAmount: "350.00",
      settlementDate: "2026-09-03",
      reason: "EXTERNAL_UNASSIGNED_PAYMENT",
      note: "Prior external payment",
      reference: "POOL-350",
      version: 1,
      verifiedBy: "superuser.actor",
      verifiedAt: new Date("2026-09-03T08:00:00.000Z"),
      updatedBy: "superuser.actor",
      updatedAt: new Date("2026-09-03T08:00:00.000Z"),
      revokedBy: null,
      revokedAt: null,
      revokedReason: null,
      systemCollectedAtSettlement: "150.00",
      effectiveTotal: "500.00",
    },
  });
  const service = operations({
    getCollectionRecordById: async () => record(),
    upsertCollectionManualSettlement: async (input) => {
      received = input;
      return effective;
    },
  });

  const response = await service.upsert(user("superuser"), RECORD_ID, {
    poolAmount: "350.00",
    settlementDate: "2026-09-03",
    reason: "EXTERNAL_UNASSIGNED_PAYMENT",
    note: "Prior external payment",
    reference: "POOL-350",
    confirmed: true,
    // Forged ownership/financial fields must be ignored by the allow-list.
    actor: "collector.alpha",
    poolCreditOwner: "collector.alpha",
    claimableAmount: "500.00",
    amount: "500.00",
    collectionStaffNickname: "superuser.actor",
    sourceImportId: "forged-source",
    sourceDataRowId: "forged-row",
    sourceObligationKey: "forged-obligation",
    totalDue: "0.01",
    billingPrincipalOsp: "999999.00",
    automaticCpStatus: "abort_cp",
    cpStatus: "abort_cp",
    effectiveSettlementSource: "MANUAL_VERIFIED",
  });

  assert.deepEqual(received, {
    recordId: RECORD_ID,
    poolAmount: "350.00",
    settlementDate: "2026-09-03",
    reason: "EXTERNAL_UNASSIGNED_PAYMENT",
    note: "Prior external payment",
    reference: "POOL-350",
    expectedVersion: null,
    actor: "superuser.actor",
    actorRole: "superuser",
    requestId: null,
  });
  assert.equal(response.record.amount, "150.00");
  assert.equal(response.record.manualSettlement?.poolAmount, "350.00");
  assert.equal(response.record.manualSettlement?.effectiveTotal, "500.00");
  assert.equal(response.record.collectionStaffNickname, "collector.alpha");
});

test("Manual settlement rejects malformed and missing record IDs before mutation", async () => {
  let reads = 0;
  let writes = 0;
  const service = operations({
    getCollectionRecordById: async () => {
      reads += 1;
      return undefined;
    },
    upsertCollectionManualSettlement: async () => {
      writes += 1;
      return record();
    },
    revokeCollectionManualSettlement: async () => {
      writes += 1;
      return record();
    },
  });

  for (const operation of [
    () => service.upsert(user("superuser"), "' OR 1=1 --", {
      poolAmount: "350.00",
      settlementDate: "2026-09-03",
      reason: "EXTERNAL_UNASSIGNED_PAYMENT",
      confirmed: true,
    }),
    () => service.revoke(user("superuser"), "../../records", {
      expectedVersion: 1,
      revokeReason: "Correction",
      confirmed: true,
    }),
    () => service.history(user("superuser"), "not-a-uuid"),
  ]) {
    await assert.rejects(operation, isHttpStatus(400));
  }
  assert.equal(reads, 0);
  assert.equal(writes, 0);

  await assert.rejects(
    service.upsert(user("superuser"), "22222222-2222-4222-8222-222222222222", {
      poolAmount: "350.00",
      settlementDate: "2026-09-03",
      reason: "EXTERNAL_UNASSIGNED_PAYMENT",
      confirmed: true,
    }),
    isHttpStatus(404),
  );
  assert.equal(reads, 1);
  assert.equal(writes, 0);
});

test("Manual settlement maps duplicate evidence and stale versions to controlled conflicts", async () => {
  let repositoryError = "COLLECTION_MANUAL_SETTLEMENT_DUPLICATE";
  const service = operations({
    getCollectionRecordById: async () => record(),
    upsertCollectionManualSettlement: async () => {
      throw new Error(repositoryError);
    },
  });
  const payload = {
    poolAmount: "350.00",
    settlementDate: "2026-09-03",
    reason: "EXTERNAL_UNASSIGNED_PAYMENT",
    confirmed: true,
  };

  await assert.rejects(service.upsert(user("superuser"), RECORD_ID, payload), (error: unknown) => {
    assert.equal((error as HttpError).statusCode, 409);
    assert.equal((error as HttpError).code, "COLLECTION_MANUAL_SETTLEMENT_DUPLICATE");
    return true;
  });

  repositoryError = "COLLECTION_MANUAL_SETTLEMENT_VERSION_CONFLICT";
  await assert.rejects(service.upsert(user("superuser"), RECORD_ID, payload), (error: unknown) => {
    assert.equal((error as HttpError).statusCode, 409);
    assert.equal((error as HttpError).code, "COLLECTION_MANUAL_SETTLEMENT_VERSION_CONFLICT");
    return true;
  });
});

test("Manual settlement validation requires explicit confirmation, exact money, and optimistic version", async () => {
  const existing = record({
    manualSettlement: {
      status: "ACTIVE",
      validity: "EFFECTIVE",
      poolAmount: "350.00",
      settlementDate: "2026-09-03",
      reason: "EXTERNAL_UNASSIGNED_PAYMENT",
      note: null,
      reference: null,
      version: 3,
      verifiedBy: "root",
      verifiedAt: new Date(),
      updatedBy: "root",
      updatedAt: new Date(),
      revokedBy: null,
      revokedAt: null,
      revokedReason: null,
      systemCollectedAtSettlement: "150.00",
      effectiveTotal: "500.00",
    },
  });
  const service = operations({ getCollectionRecordById: async () => existing });
  await assert.rejects(
    service.upsert(user("superuser"), RECORD_ID, {
      poolAmount: "350.001",
      settlementDate: "2026-09-03",
      reason: "EXTERNAL_UNASSIGNED_PAYMENT",
      confirmed: true,
    }),
    isHttpStatus(400),
  );
  await assert.rejects(
    service.upsert(user("superuser"), RECORD_ID, {
      poolAmount: "350.00",
      settlementDate: "2026-09-03",
      reason: "EXTERNAL_UNASSIGNED_PAYMENT",
      confirmed: false,
    }),
    isHttpStatus(400),
  );
  await assert.rejects(
    service.upsert(user("superuser"), RECORD_ID, {
      poolAmount: "350.00",
      settlementDate: "2026-09-03",
      reason: "EXTERNAL_UNASSIGNED_PAYMENT",
      confirmed: true,
    }),
    isHttpStatus(400),
  );
});

test("Manual audit evidence is complete for superuser and redacted for read-only roles", async () => {
  const audit = [{
    id: "audit-1",
    action: "VERIFIED" as const,
    actor: "superuser.actor",
    actorRole: "superuser",
    timestamp: "2026-09-03T08:00:00.000Z",
    requestId: "request-secret",
    oldValue: { reference: "sensitive-before" },
    newValue: { reference: "sensitive-after", poolCreditOwner: null },
  }];
  const service = operations({
    getCollectionRecordById: async () => record(),
    listCollectionManualSettlementAudit: async () => audit,
  });

  const full = await service.history(user("superuser"), RECORD_ID, 500);
  assert.equal(full.history[0]?.requestId, "request-secret");
  assert.deepEqual(full.history[0]?.newValue, audit[0]?.newValue);

  const manager = await service.history(user("manager"), RECORD_ID, 50);
  assert.equal(manager.history[0]?.requestId, null);
  assert.equal(manager.history[0]?.oldValue, null);
  assert.equal(manager.history[0]?.newValue, null);
  assert.equal(manager.history[0]?.actor, "superuser.actor");
});
