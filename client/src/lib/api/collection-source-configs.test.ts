import assert from "node:assert/strict";
import test from "node:test";
import {
  collectionSourceConfigDeleteResponseSchema,
  collectionSourceConfigMutationResponseSchema,
  collectionSourceConfigsResponseSchema,
  COLLECTION_SOURCE_CONFIG_CHANGED_EVENT,
  saveCollectionSourceConfig,
  deleteCollectionSourceConfig,
} from "./collection-source-configs";

const validConfig = {
  sourceImportId: "saved-source-id",
  sourceImportName: "Saved source",
  sourceFilename: "source.xlsb",
  rowCount: 12,
  validFrom: "2026-09-01",
  validTo: "2026-09-30",
  cycleKey: "2026-09",
  enabled: true,
  compatibilityStatus: "compatible" as const,
  compatibilityIssues: [],
  indexedRowCount: 12,
  configuredBy: "operator",
  configuredAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  status: "active" as const,
};

test("Collection source config schemas accept bounded valid responses", () => {
  assert.equal(collectionSourceConfigsResponseSchema.safeParse({
    ok: true,
    sourceConfigs: [validConfig],
  }).success, true);
  assert.equal(collectionSourceConfigMutationResponseSchema.safeParse({
    ok: true,
    config: validConfig,
  }).success, true);
  assert.equal(collectionSourceConfigDeleteResponseSchema.safeParse({ ok: true }).success, true);
});

test("source validity response rejects calendar overflow dates", () => {
  for (const value of ["2026-02-30", "2026-09-31", "2026-09-01T00:00:00Z"]) {
    assert.equal(collectionSourceConfigMutationResponseSchema.safeParse({ ok: true, config: { ...validConfig, validFrom: value } }).success, false);
  }
});

test("source save/delete notify Billing only after successful validated mutations", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const eventTarget = new EventTarget();
  let notifications = 0;
  let invalid = false;
  eventTarget.addEventListener(COLLECTION_SOURCE_CONFIG_CHANGED_EVENT, () => { notifications += 1; });
  Object.defineProperty(globalThis, "window", { configurable: true, value: eventTarget });
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify(
    invalid ? { ok: false } : init?.method === "DELETE" ? { ok: true } : { ok: true, config: validConfig },
  ), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    await saveCollectionSourceConfig("saved-source-id", { validFrom: validConfig.validFrom, validTo: validConfig.validTo, enabled: true });
    assert.equal(notifications, 1);
    await deleteCollectionSourceConfig("saved-source-id");
    assert.equal(notifications, 2);
    invalid = true;
    await assert.rejects(deleteCollectionSourceConfig("saved-source-id"));
    assert.equal(notifications, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("Collection source config schemas fail closed on unsafe numeric and enum shapes", () => {
  assert.equal(collectionSourceConfigsResponseSchema.safeParse({
    ok: true,
    sourceConfigs: [{ ...validConfig, indexedRowCount: -1 }],
  }).success, false);
  assert.equal(collectionSourceConfigsResponseSchema.safeParse({
    ok: true,
    sourceConfigs: [{ ...validConfig, status: "unknown" }],
  }).success, false);
  assert.equal(collectionSourceConfigMutationResponseSchema.safeParse({
    ok: true,
    config: { ...validConfig, validFrom: "01/09/2026" },
  }).success, false);
});
