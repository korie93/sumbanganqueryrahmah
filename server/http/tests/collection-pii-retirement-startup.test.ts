import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCollectionPiiRetirementStartupReady,
  buildCollectionPiiRetirementStartupFailure,
  mapCollectionPiiRetirementCounts,
} from "../../internal/collection-pii-retirement-startup";

test("mapCollectionPiiRetirementCounts normalizes numeric and string counts", () => {
  assert.deepEqual(
    mapCollectionPiiRetirementCounts({
      customerNameCount: "2",
      icNumberCount: 1,
      customerPhoneCount: null,
      accountNumberCount: undefined,
    }),
    {
      customerName: 2,
      icNumber: 1,
      customerPhone: 0,
      accountNumber: 0,
    },
  );
});

test("buildCollectionPiiRetirementStartupFailure returns null when retired fields are clean", () => {
  assert.equal(
    buildCollectionPiiRetirementStartupFailure({
      counts: {
        customerName: 0,
        icNumber: 0,
        customerPhone: 0,
        accountNumber: 0,
      },
      retiredFields: new Set(["icNumber", "customerPhone", "accountNumber"]),
    }),
    null,
  );
});

test("buildCollectionPiiRetirementStartupFailure only reports configured retired fields", () => {
  const message = buildCollectionPiiRetirementStartupFailure({
    counts: {
      customerName: 9,
      icNumber: 2,
      customerPhone: 1,
      accountNumber: 0,
    },
    retiredFields: new Set(["icNumber", "customerPhone", "accountNumber"]),
  });

  assert.match(String(message), /icNumber=2/);
  assert.match(String(message), /customerPhone=1/);
  assert.doesNotMatch(String(message), /customerName=9/);
  assert.doesNotMatch(String(message), /accountNumber=0/);
});

test("assertCollectionPiiRetirementStartupReady skips querying when no retired fields are configured", async () => {
  let queryCalled = false;

  await assertCollectionPiiRetirementStartupReady({
    retiredFields: new Set(),
    query: async () => {
      queryCalled = true;
      return { rows: [] };
    },
  });

  assert.equal(queryCalled, false);
});

test("assertCollectionPiiRetirementStartupReady rejects startup when retired fields still have plaintext rows", async () => {
  await assert.rejects(
    () =>
      assertCollectionPiiRetirementStartupReady({
        retiredFields: new Set(["icNumber", "customerPhone", "accountNumber"]),
        query: async () => ({
          rows: [{
            customerNameCount: 5,
            icNumberCount: 2,
            customerPhoneCount: 1,
            accountNumberCount: 0,
          }],
        }),
      }),
    /icNumber=2.*customerPhone=1/i,
  );
});

test("assertCollectionPiiRetirementStartupReady allows startup when retired fields are fully redacted", async () => {
  await assertCollectionPiiRetirementStartupReady({
    retiredFields: new Set(["icNumber", "customerPhone", "accountNumber"]),
    query: async () => ({
      rows: [{
        customerNameCount: 8,
        icNumberCount: 0,
        customerPhoneCount: 0,
        accountNumberCount: 0,
      }],
    }),
  });
});
