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

test("buildCollectionPiiRetirementStartupFailure reports unreadable encrypted shadows separately", () => {
  const message = buildCollectionPiiRetirementStartupFailure({
    counts: {
      customerName: 0,
      icNumber: 0,
      customerPhone: 0,
      accountNumber: 0,
    },
    retiredFields: new Set(["icNumber", "customerPhone", "accountNumber"]),
    unreadableShadowCounts: {
      customerName: 0,
      icNumber: 1,
      customerPhone: 0,
      accountNumber: 2,
    },
  });

  assert.match(String(message), /Unreadable encrypted shadow counts: icNumber=1, accountNumber=2/i);
  assert.match(String(message), /Investigate the affected rows/i);
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
        query: async (statement) => (
          statement.includes("COUNT(*) FILTER")
            ? {
                rows: [{
                  customerNameCount: 5,
                  icNumberCount: 2,
                  customerPhoneCount: 1,
                  accountNumberCount: 0,
                }],
              }
            : { rows: [] }
        ),
      }),
    /icNumber=2.*customerPhone=1/i,
  );
});

test("assertCollectionPiiRetirementStartupReady rejects startup when retired fields have unreadable encrypted shadows", async () => {
  let shadowQueryCount = 0;

  await assert.rejects(
    () =>
      assertCollectionPiiRetirementStartupReady({
        retiredFields: new Set(["icNumber", "customerPhone", "accountNumber"]),
        query: async (statement) => {
          if (statement.includes("COUNT(*) FILTER")) {
            return {
              rows: [{
                customerNameCount: 0,
                icNumberCount: 0,
                customerPhoneCount: 0,
                accountNumberCount: 0,
              }],
            };
          }

          shadowQueryCount += 1;
          if (shadowQueryCount === 1) {
            return {
              rows: [{
                id: "11111111-1111-1111-1111-111111111111",
                ic_number: null,
                ic_number_encrypted: "not-a-valid-collection-pii-payload",
                customer_phone: null,
                customer_phone_encrypted: null,
                account_number: null,
                account_number_encrypted: null,
              }],
            };
          }

          return { rows: [] };
        },
      }),
    /Unreadable encrypted shadow counts: icNumber=1/i,
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
