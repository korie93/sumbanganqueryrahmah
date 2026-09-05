import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../../db-postgres";
import { updateCollectionRecord } from "../collection-record-mutation-repository-utils";

test("Collection update rechecks active manual settlement identity under the row lock", async () => {
  const mutableDb = db as unknown as { transaction: typeof db.transaction };
  const originalTransaction = mutableDb.transaction;
  let executeCalls = 0;

  mutableDb.transaction = (async (callback: (tx: {
    execute: (query: unknown) => Promise<{ rows: unknown[] }>;
  }) => Promise<unknown>) => callback({
    execute: async () => {
      executeCalls += 1;
      if (executeCalls === 1) {
        // acquireCollectionRecordMutationLock
        return { rows: [] };
      }
      if (executeCalls === 2) {
        // The service observed no override, but it became active before this
        // transaction acquired the record lock.
        return {
          rows: [{
            payment_date: "2026-09-03",
            created_by_login: "collector.login",
            collection_staff_nickname: "collector.alpha",
            account_number: "A001",
            account_number_encrypted: null,
            card_number_last4: "6221",
            source_import_id: "source-1",
            source_data_row_id: "row-1",
            aging_bucket: "D3",
            calling_date: "2026-09-01",
            calling_window_end_exclusive: "2026-10-01",
            total_due: "500.00",
            billing_principal_osp: "8000.00",
            source_match_basis: "account_number",
            source_obligation_key: "account:opaque",
            settlement_cycle_key: "2026-09-01:account:opaque",
            settlement_override_status: "ACTIVE",
          }],
        };
      }
      assert.fail("No source mutation or UPDATE query may run after the in-lock rejection.");
    },
  })) as typeof db.transaction;

  try {
    await assert.rejects(
      updateCollectionRecord(
        "11111111-1111-4111-8111-111111111111",
        { sourceImportId: "source-2" },
      ),
      /COLLECTION_MANUAL_SETTLEMENT_ACTIVE_IDENTITY_CHANGE_BLOCKED/,
    );
    assert.equal(executeCalls, 2);
  } finally {
    mutableDb.transaction = originalTransaction;
  }
});
