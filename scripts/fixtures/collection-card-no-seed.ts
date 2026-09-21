import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import path from "node:path";

// This entry may only seed the freshly created cluster validated by the runner.
assert.equal(process.env.SQR_COLLECTION_CARD_ISOLATED_CLUSTER, "1");
assert.equal(process.env.PG_HOST, "127.0.0.1");
assert.equal(process.env.PG_DATABASE, "sqr_collection_card_test");
assert.equal(process.env.PG_USER, "sqr_fixture");
assert.equal(process.env.DATABASE_URL, undefined);
const dataDir = process.env.SQR_COLLECTION_CARD_DATA_DIR;
assert.ok(dataDir);
assert.match(path.basename(path.dirname(dataDir)), /^sqr-collection-card-no-[a-zA-Z0-9]+$/);
delete process.env.SQR_COLLECTION_CARD_ISOLATED_CLUSTER;
delete process.env.SQR_COLLECTION_CARD_DATA_DIR;
const expectMissingCard = process.env.COLLECTION_CARD_EXPECT_MISSING === "1";
delete process.env.COLLECTION_CARD_EXPECT_MISSING;
const runtime = await import("../../server/db-postgres");
runtime.stopPgPoolBackgroundTasks();
const connection = await runtime.pool.connect();
try {
  const state = await connection.query("SHOW data_directory");
  assert.equal(await realpath(state.rows[0].data_directory), await realpath(dataDir));
  const { hashCollectionSourceIdentifier } = await import("../../server/repositories/collection-source-repository-utils");
  const { encryptCollectionPiiFieldValue, hashCollectionPiiSearchValue, hashCollectionCustomerNameSearchTerms } = await import("../../server/lib/collection-pii-encryption");
  const username = process.env.SEED_SUPERUSER_USERNAME;
  assert.ok(username?.startsWith("collectioncardfixture"));
  const entries: Array<{ source: string; card: string | null; name: string; ic: string; account: string; count: number; amount: string }> = [
    { source: "a", card: "0000123412345678", name: "Synthetic Card Customer", ic: "990101019999", account: "ACC-CARD-FIXTURE", count: 51, amount: "1.00" },
    { source: "b", card: "9999123412345678", name: "Synthetic Card Customer", ic: "990101019999", account: "ACC-CARD-FIXTURE", count: 1, amount: "25.00" },
    { source: "long", card: "9007199254740993123", name: "Synthetic Precision Customer", ic: "990101018888", account: "ACC-PRECISION-FIXTURE", count: 1, amount: "50.00" },
    { source: "retired", card: "1111123412345678", name: "Synthetic Retired Customer", ic: "990101017001", account: "ACC-RETIRED", count: 1, amount: "3.00" },
    { source: "spaced", card: "2222 1234 1234 5678", name: "Synthetic Spaced Customer", ic: "990101017002", account: "ACC-SPACED", count: 1, amount: "3.00" },
    { source: "hyphen", card: "3333-1234-1234-5678", name: "Synthetic Hyphen Customer", ic: "990101017003", account: "ACC-HYPHEN", count: 1, amount: "3.00" },
    { source: "missing", card: null, name: "Synthetic Missing Customer", ic: "990101017004", account: "ACC-MISSING", count: 1, amount: "3.00" },
    { source: "tampered", card: "4444123412345678", name: "Synthetic Tampered Customer", ic: "990101017005", account: "ACC-TAMPERED", count: 1, amount: "3.00" },
    { source: "account-changed", card: "5555123412345678", name: "Synthetic Changed Customer", ic: "990101017006", account: "ACC-CHANGED", count: 1, amount: "3.00" },
  ];
  await connection.query("BEGIN");
  for (const entry of entries) {
    const sourceId = `fixture-card-source-${entry.source}`;
    const rowId = `fixture-card-row-${entry.source}`;
    const obligation = `account:${hashCollectionSourceIdentifier(entry.account, "account_number")}`;
    const sourceName = `Synthetic Saved ${entry.source}.xlsx`;
    await connection.query("INSERT INTO imports(id,name,filename,created_by) VALUES($1,$2,$2,$3)", [sourceId, sourceName, username]);
    await connection.query("INSERT INTO data_rows(id,import_id,json_data) VALUES($1,$2,$3)", [rowId, sourceId,
      { "Customer Name": entry.name, "IC Number": entry.ic, "Account Number": entry.account, "Card Number": entry.card,
        "Total Due": "1000.00", "Billing Principal": "5000.00", "Aging": "D3", "Calling Date": "2026-09-01" }]);
    await connection.query(`INSERT INTO collection_source_configs(source_import_id,valid_from,valid_to,cycle_key,
      compatibility_status,indexed_row_count,configured_by) VALUES($1,'2026-09-01','2026-09-30','2026-09','compatible',1,$2)`, [sourceId, username]);
    await connection.query(`INSERT INTO collection_source_rows(source_import_id,source_data_row_id,account_number_hash,
      card_number_hash,card_number_last4,canonical_obligation_key,total_due,billing_principal_osp,aging_bucket,calling_date)
      VALUES($1,$2,$3,$4,$5,$6,1000,5000,'D3','2026-09-01')`, [sourceId, rowId,
      hashCollectionSourceIdentifier(entry.account, "account_number"), hashCollectionSourceIdentifier(entry.card, "card_number"), entry.card?.slice(-4) ?? null, obligation]);
    for (let index = 0; index < entry.count; index++) {
      await connection.query(`INSERT INTO collection_records(id,customer_name_encrypted,customer_name_search_hash,
        customer_name_search_hashes,ic_number_encrypted,ic_number_search_hash,customer_phone_encrypted,
        customer_phone_search_hash,account_number_encrypted,account_number_search_hash,card_number_last4,
        source_import_id,source_data_row_id,source_import_name,source_filename,source_obligation_key,
        settlement_cycle_key,aging_bucket,calling_date,calling_window_end_exclusive,total_due,billing_principal_osp,
        source_match_basis,source_match_accuracy,classification,batch,payment_date,amount,created_by_login,
        collection_staff_nickname,staff_username)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$15,$16,'D3','2026-09-01','2026-10-01',
          1000,5000,'account_number',100,'cp','P10','2026-09-21',$17,$18,'Fixture Collector','Fixture Collector')`,
      [randomUUID(), encryptCollectionPiiFieldValue(entry.name), hashCollectionPiiSearchValue("customerName", entry.name),
        hashCollectionCustomerNameSearchTerms(entry.name), encryptCollectionPiiFieldValue(entry.ic), hashCollectionPiiSearchValue("icNumber", entry.ic),
        encryptCollectionPiiFieldValue("0199997777"), hashCollectionPiiSearchValue("customerPhone", "0199997777"),
        encryptCollectionPiiFieldValue(entry.account), hashCollectionPiiSearchValue("accountNumber", entry.account),
        entry.card?.slice(-4) ?? null, sourceId, rowId, sourceName, obligation, `2026-09-01:${obligation}`, entry.amount, username]);
    }
  }
  await connection.query("DELETE FROM collection_source_rows WHERE source_import_id='fixture-card-source-retired'");
  await connection.query("DELETE FROM collection_source_configs WHERE source_import_id='fixture-card-source-retired'");
  await connection.query("UPDATE collection_source_rows SET card_number_hash=$1 WHERE source_import_id='fixture-card-source-tampered'", [hashCollectionSourceIdentifier("4444123412349999", "card_number")]);
  await connection.query("UPDATE data_rows SET json_data=jsonb_set(json_data,'{Account Number}',to_jsonb('FOREIGN-ACCOUNT'::text)) WHERE id='fixture-card-row-account-changed'");
  await connection.query("COMMIT");
  const { refreshCollectionRecordDailyRollupSlices } = await import("../../server/repositories/collection-record-rollup-utils");
  await refreshCollectionRecordDailyRollupSlices(runtime.db, [{ paymentDate: "2026-09-21", createdByLogin: username, collectionStaffNickname: "Fixture Collector" }]);
  if (!expectMissingCard) {
    const { verifyCollectionCardSearchPlan } = await import("./collection-card-no-query-plan");
    await verifyCollectionCardSearchPlan({ executor: runtime.db, connection, dataDir, ownerLogin: username,
      historicalCase: { label: "historical-card-source", search: "1111123412345678", sourceImportId: "fixture-card-source-retired", expectedRecordCount: 1 } });
  }
  console.log("Seeded 59 synthetic Collection records including historical, formatted, missing and tampered Saved-card fixtures; no existing application data used.");
} catch (error) {
  await connection.query("ROLLBACK");
  throw error;
} finally {
  connection.release();
  await runtime.closePostgresPools();
}
