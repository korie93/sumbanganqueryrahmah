import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedUser } from "../../auth/guards";
import { HttpError } from "../../http/errors";
import { CollectionOspV7RepositoryError } from "../../repositories/collection-osp-v7-repository-utils";
import {
  CollectionOspV7Operations,
  assertCollectionOspV7ExportWithinLimits,
  MAX_COLLECTION_OSP_V7_EXPORT_ESTIMATED_BYTES,
  MAX_COLLECTION_OSP_V7_EXPORT_DETAIL_ROWS,
} from "../collection/collection-osp-v7-operations";
import type { CollectionStoragePort } from "../collection/collection-service-support";

const TARGET_ID = "11111111-1111-4111-8111-111111111111";
const REVISION_ID = "22222222-2222-4222-8222-222222222222";
const RECONCILIATION_ID = "33333333-3333-4333-8333-333333333333";

function user(role: string): AuthenticatedUser {
  return { username: `${role}.test`, role, activityId: `${role}-activity` };
}

function operations(storage: Partial<CollectionStoragePort>) {
  return new CollectionOspV7Operations(
    storage as CollectionStoragePort,
    (authenticatedUser) => {
      if (!authenticatedUser) throw new Error("Unauthenticated test request");
      return authenticatedUser;
    },
  );
}

function assertHttpError(error: unknown, statusCode: number, code?: string) {
  assert.ok(error instanceof HttpError);
  assert.equal(error.statusCode, statusCode);
  if (code !== undefined) assert.equal(error.code, code);
  return true;
}

test("V7 mutation service denies non-superuser before storage is called", async () => {
  let called = false;
  const service = operations({
    createCollectionOspSavedTarget: async () => {
      called = true;
      throw new Error("must not be called");
    },
  });

  await assert.rejects(
    service.createTarget(user("admin"), {}),
    (error) => assertHttpError(error, 403),
  );
  assert.equal(called, false);
});

test("V7 target/revision mismatch is concealed as not found before overview access", async () => {
  let overviewCalled = false;
  const service = operations({
    getCollectionOspSavedTarget: async () => undefined,
    getCollectionOspTargetOverview: async () => {
      overviewCalled = true;
      throw new Error("must not be called");
    },
  });

  await assert.rejects(
    service.overview(user("manager"), TARGET_ID, REVISION_ID, { asOf: "2026-09-10" }),
    (error) => assertHttpError(error, 404, "COLLECTION_OSP_TARGET_NOT_FOUND"),
  );
  assert.equal(overviewCalled, false);
});

test("V7 create validates exact money before a Saved Target reaches storage", async () => {
  let called = false;
  const service = operations({
    isCollectionStaffNicknameActive: async () => true,
    createCollectionOspSavedTarget: async () => {
      called = true;
      throw new Error("must not be called");
    },
  });

  await assert.rejects(
    service.createTarget(user("superuser"), {
      name: "September",
      sourceImportIds: ["source-a"],
      from: "2026-09-01",
      to: "2026-09-30",
      agingScope: ["D3"],
      nicknameScope: [],
      targets: [{
        agingBucket: "D3",
        totalOspBaseline: "1000.001",
        targetPercentage: "50",
      }],
    }),
    (error) => assertHttpError(error, 400),
  );
  assert.equal(called, false);
});

test("V7 repository stale-version and baseline conflicts retain controlled 409 responses", async () => {
  const staleService = operations({
    updateCollectionOspManualReconciliation: async () => {
      throw new CollectionOspV7RepositoryError(
        "VERSION_CONFLICT",
        "Manual reconciliation changed in another session.",
      );
    },
  });
  await assert.rejects(
    staleService.updateReconciliation(
      user("superuser"),
      TARGET_ID,
      REVISION_ID,
      RECONCILIATION_ID,
      {
        version: 1,
        manualPriorAmount: "300.00",
        asOfDate: "2026-09-10",
        actualPaymentDate: "2026-09-01",
        reason: "PRIOR_PAYMENT_NOT_IN_SYSTEM",
      },
    ),
    (error) => assertHttpError(error, 409, "COLLECTION_RECONCILIATION_VERSION_CONFLICT"),
  );

  const baselineService = operations({
    isCollectionStaffNicknameActive: async () => true,
    createCollectionOspSavedTarget: async () => {
      throw new CollectionOspV7RepositoryError(
        "BASELINE_MISMATCH",
        "D3 TT OSP baseline is stale.",
      );
    },
  });
  await assert.rejects(
    baselineService.createTarget(user("superuser"), {
      name: "September",
      sourceImportIds: ["source-a"],
      from: "2026-09-01",
      to: "2026-09-30",
      agingScope: ["D3"],
      nicknameScope: [],
      targets: [{
        agingBucket: "D3",
        totalOspBaseline: "1000.00",
        targetPercentage: "50",
      }],
    }),
    (error) => assertHttpError(error, 409),
  );
});

test("V7 oversized drilldown scopes retain a controlled 413 response", async () => {
  const service = operations({
    getCollectionOspSavedTarget: async () => ({
      id: TARGET_ID,
      status: "ACTIVE",
      activeRevision: { id: REVISION_ID },
    }) as never,
    getCollectionOspDrilldown: async () => {
      throw new CollectionOspV7RepositoryError(
        "DATASET_TOO_LARGE",
        "Drilldown exceeds the source-row limit.",
      );
    },
  });

  await assert.rejects(
    service.drilldown(user("manager"), TARGET_ID, REVISION_ID, { asOf: "2026-09-10" }),
    (error) => assertHttpError(error, 413),
  );
});

test("V7 reconciliation IDOR remains not found when IDs do not share one target revision", async () => {
  const service = operations({
    updateCollectionOspManualReconciliation: async () => {
      throw new CollectionOspV7RepositoryError("NOT_FOUND", "Manual reconciliation was not found.");
    },
  });

  await assert.rejects(
    service.updateReconciliation(
      user("superuser"),
      TARGET_ID,
      REVISION_ID,
      RECONCILIATION_ID,
      {
        version: 1,
        manualPriorAmount: "300.00",
        asOfDate: "2026-09-10",
        reason: "PRIOR_PAYMENT_NOT_IN_SYSTEM",
      },
    ),
    (error) => assertHttpError(error, 404, "COLLECTION_OSP_TARGET_NOT_FOUND"),
  );
});

test("V7 export validates and forwards contribution source to the repository", async () => {
  let received: Record<string, unknown> | undefined;
  const visibleTarget = {
    id: TARGET_ID,
    name: "September",
    description: null,
    status: "ACTIVE" as const,
    version: 1,
    activeRevision: {
      id: REVISION_ID,
      revisionNumber: 1,
      from: "2026-09-01",
      to: "2026-09-30",
      trackingStartDate: "2026-09-01",
      trackingEndDate: "2026-09-30",
      sourceImportIds: ["source-a"],
      sourceSnapshots: [],
      nicknameScope: [],
      agingScope: ["D3" as const],
      createdAt: "2026-09-01T00:00:00.000Z",
    },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
  const service = operations({
    getCollectionOspSavedTarget: async () => visibleTarget,
    getCollectionOspExportDataset: async (input) => {
      received = input;
      return {
        generatedAt: "2026-09-10T00:00:00.000Z",
        filters: {
          asOf: "2026-09-10",
          from: "2026-09-01",
          to: "2026-09-10",
          date: null,
          aging: null,
          contributionSource: "MANUAL_RECONCILIATION" as const,
        },
        overview: {},
        calendar: {},
        reconciliations: [],
        reconciliationTotal: 0,
        drilldown: [],
        drilldownTotal: 0,
      } as never;
    },
  });

  await service.exportReport(user("manager"), TARGET_ID, REVISION_ID, {
    format: "json",
    asOf: "2026-09-10",
    from: "2026-09-01",
    to: "2026-09-10",
    contributionSource: "MANUAL_RECONCILIATION",
  });
  assert.equal(received?.contributionSource, "MANUAL_RECONCILIATION");

  await assert.rejects(
    service.exportReport(user("manager"), TARGET_ID, REVISION_ID, {
      format: "json",
      asOf: "2026-09-10",
      contributionSource: "UNTRUSTED",
    }),
    (error) => assertHttpError(error, 400),
  );
});

test("V7 export fails closed before serialization when detail rows exceed its memory cap", async () => {
  const visibleTarget = {
    id: TARGET_ID,
    name: "September",
    description: null,
    status: "ACTIVE" as const,
    version: 1,
    activeRevision: {
      id: REVISION_ID,
      revisionNumber: 1,
      from: "2026-09-01",
      to: "2026-09-30",
      trackingStartDate: "2026-09-01",
      trackingEndDate: "2026-09-30",
      sourceImportIds: ["source-a"],
      sourceSnapshots: [],
      nicknameScope: [],
      agingScope: ["D3" as const],
      createdAt: "2026-09-01T00:00:00.000Z",
    },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
  const service = operations({
    getCollectionOspSavedTarget: async () => visibleTarget,
    getCollectionOspExportDataset: async () => ({
      generatedAt: "2026-09-10T00:00:00.000Z",
      filters: {},
      overview: {},
      calendar: [],
      reconciliations: Array.from(
        { length: MAX_COLLECTION_OSP_V7_EXPORT_DETAIL_ROWS + 1 },
        () => ({ account: "safe" }),
      ),
      reconciliationTotal: MAX_COLLECTION_OSP_V7_EXPORT_DETAIL_ROWS + 1,
      drilldown: [],
      drilldownTotal: 0,
    }) as never,
  });

  await assert.rejects(
    service.exportReport(user("manager"), TARGET_ID, REVISION_ID, {
      format: "json",
      asOf: "2026-09-10",
    }),
    (error) => assertHttpError(error, 413),
  );
});

test("V7 export fails closed when the estimated serialized payload is too large", () => {
  assert.throws(
    () => assertCollectionOspV7ExportWithinLimits({
      reconciliations: [],
      drilldown: [],
      overview: { oversized: "x".repeat(MAX_COLLECTION_OSP_V7_EXPORT_ESTIMATED_BYTES) },
    }),
    (error) => assertHttpError(error, 413),
  );
});
