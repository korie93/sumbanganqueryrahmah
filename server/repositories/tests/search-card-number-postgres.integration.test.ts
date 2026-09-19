import assert from "node:assert/strict";
import test from "node:test";
import type { SearchCollectionStatusCandidate, SearchCollectionViewerScope } from "../search-repository-types";

const isolated = process.env.SQR_SEARCH_CARD_ISOLATED_CLUSTER === "1";
test("General Search Card SQL on disposable PostgreSQL", { skip: !isolated }, async (t) => {
  assert.equal(process.env.PG_HOST, "127.0.0.1");
  assert.equal(process.env.PG_DATABASE, "sqr_search_card_test");
  assert.equal(process.env.PG_USER, "sqr_fixture");
  assert.equal(process.env.DATABASE_URL, undefined);
  delete process.env.SQR_SEARCH_CARD_ISOLATED_CLUSTER;
  const runtime = await import("../../db-postgres");
  runtime.stopPgPoolBackgroundTasks();
  const pool = runtime.pool;
  try {
    const { SearchRepository } = await import("../search.repository");
    const { hashCollectionSourceIdentifier } = await import("../collection-source-repository-utils");
    const { hashCollectionPiiSearchValue } = await import("../../lib/collection-pii-encryption");
    // Only the SQL surfaces read by these repository methods. This is not a
    // replacement for migration tests and creates no application schema/data.
    await pool.query(`
      CREATE TABLE imports (id text PRIMARY KEY, name text, filename text, is_deleted boolean DEFAULT false);
      CREATE TABLE data_rows (id text PRIMARY KEY, import_id text NOT NULL, json_data jsonb NOT NULL);
      CREATE TABLE collection_source_rows (
        source_import_id text NOT NULL, source_data_row_id text NOT NULL,
        canonical_obligation_key text, card_number_hash text, card_number_last4 text,
        PRIMARY KEY (source_import_id, source_data_row_id)
      );
      CREATE TABLE collection_records (
        id text PRIMARY KEY, source_import_id text, source_data_row_id text,
        source_obligation_key text, source_import_name text, source_filename text,
        ic_number text, ic_number_search_hash text, customer_phone text, customer_phone_search_hash text,
        account_number text, account_number_encrypted text, account_number_search_hash text,
        payment_date date, amount numeric(14,2), created_by_login text, collection_staff_nickname text,
        created_at timestamptz, settlement_cycle_key text, settlement_override_status text,
        pool_amount numeric(14,2), total_due numeric(14,2), manual_settlement_date date,
        manual_settlement_verified_by text, manual_settlement_verified_at timestamptz,
        manual_settlement_updated_at timestamptz, manual_settlement_updated_by text,
        manual_settlement_version integer DEFAULT 1, manual_settlement_revoked_at timestamptz,
        manual_settlement_revoked_by text, manual_settlement_reason text,
        manual_settlement_note text, manual_settlement_reference text,
        source_match_basis text, duplicate_receipt_flag boolean DEFAULT false,
        calling_date date, calling_window_end_exclusive date, classification text
      );
      CREATE TABLE collection_record_purge_history (LIKE collection_records INCLUDING DEFAULTS);
      ALTER TABLE collection_record_purge_history ADD COLUMN original_record_id text,
        ADD COLUMN original_created_at timestamptz, ADD COLUMN purged_at timestamptz,
        ADD COLUMN purged_by text, ADD COLUMN automatic_classification text;
    `);
    const account = "FIXTURE-ACCOUNT";
    const ic = "990101019999";
    const accountHash = hashCollectionPiiSearchValue("accountNumber", account);
    const icHash = hashCollectionPiiSearchValue("icNumber", ic);
    const obligation = `account:${hashCollectionSourceIdentifier(account, "account_number")}`;
    const cards = ["0000123412341111", "0000123412342222", "0000123412343333"];
    async function addSource(id: string, card: string | null, sourceAccount = account) {
      const key = `account:${hashCollectionSourceIdentifier(sourceAccount, "account_number")}`;
      await pool.query("INSERT INTO imports(id,name,filename) VALUES($1,$2,$3)",
        [`import-${id}`, `Synthetic ${id}`, `${id}.csv`]);
      await pool.query("INSERT INTO data_rows(id,import_id,json_data) VALUES($1,$2,$3)",
        [`row-${id}`, `import-${id}`, { "Account No": sourceAccount, "Card No": card }]);
      await pool.query(`INSERT INTO collection_source_rows(source_import_id,source_data_row_id,
        canonical_obligation_key,card_number_hash,card_number_last4) VALUES($1,$2,$3,$4,$5)`,
      [`import-${id}`, `row-${id}`, key, hashCollectionSourceIdentifier(card, "card_number"), card?.slice(-4) ?? null]);
      return key;
    }
    for (const [index, id] of ["a", "b", "c"].entries()) await addSource(id, cards[index]);
    await pool.query(`INSERT INTO collection_records(id,source_import_id,source_data_row_id,
      source_obligation_key,source_import_name,source_filename,ic_number,ic_number_search_hash,
      account_number,account_number_search_hash,payment_date,amount,created_by_login,
      collection_staff_nickname,created_at,settlement_cycle_key,total_due,source_match_basis,
      calling_date,calling_window_end_exclusive,classification)
      VALUES ('record-a','import-a','row-a',$1,'Synthetic a','a.csv',$2,$3,$4,$5,'2026-09-01',10,
        'alpha','Alpha','2026-09-01T08:00:00Z','cycle-a',90,'account','2026-09-01','2026-10-01','cp'),
        ('record-b','import-b','row-b',$1,'Synthetic b','b.csv',$2,$3,$4,$5,'2026-09-02',20,
        'beta','Beta','2026-09-02T08:00:00Z','cycle-b',90,'account','2026-09-01','2026-10-01','cp')`,
    [obligation, ic, icHash, account, accountHash]);
    await pool.query(`UPDATE collection_records SET settlement_override_status='ACTIVE',pool_amount=70,
      manual_settlement_date='2026-09-03',manual_settlement_verified_by='fixture-reviewer',
      manual_settlement_verified_at='2026-09-03T09:00:00Z',manual_settlement_reason='Synthetic audit reason'
      WHERE id='record-b'`);
    await pool.query(`INSERT INTO collection_record_purge_history(id,original_record_id,
      source_import_id,source_data_row_id,source_obligation_key,source_import_name,source_filename,
      ic_number_search_hash,account_number_search_hash,payment_date,amount,created_by_login,
      collection_staff_nickname,original_created_at,purged_at,purged_by,automatic_classification,
      settlement_override_status,pool_amount,manual_settlement_date,manual_settlement_verified_at)
      VALUES('purge-c','record-c','import-c','row-c',$1,'Synthetic c','c.csv',$2,$3,'2026-08-31',5,
        'alpha','Alpha','2026-08-31T08:00:00Z','2026-09-04T08:00:00Z','fixture-reviewer','cp',
        'ACTIVE',40,'2026-09-01','2026-09-01T10:00:00Z')`, [obligation, icHash, accountHash]);
    const repository = new SearchRepository();
    const candidate: SearchCollectionStatusCandidate = {
      rowId: "row-a", sourceImportId: "import-a", icHash, icValue: ic,
      phoneHash: null, phoneValue: null, accountHashes: accountHash ? [accountHash] : [],
      accountValues: [account],
    };
    const history = (page: number, pageSize: number, viewerScope: SearchCollectionViewerScope = { kind: "all" }) =>
      repository.findCollectionHistoryForRow({ candidate, sourceObligationKey: obligation,
        viewerScope, includeManualAuditDetails: false, includeSourceDetails: false, page, pageSize });

    await t.test("latest status uses selected Collection card, not searched source card", async () => {
      const matches = await repository.findCollectionStatusesForRows([candidate], { kind: "all" });
      assert.equal(matches.length, 1);
      assert.equal(matches[0].latestCardNumber, cards[1]);
      assert.equal(matches[0].latestAccountNumber, account);
      assert.equal(matches[0].latestAmount, "20.00");
      assert.equal(matches[0].recordCount, 3);
    });
    await t.test("all four history UNION branches retain exact cards and deterministic pagination", async () => {
      const first = await history(1, 2);
      const second = await history(2, 2);
      const third = await history(3, 2);
      const items = [...first.items, ...second.items, ...third.items];
      assert.deepEqual(items.map((item) => item.id),
        ["pool:record-b:1", "record-b", "pool:record-c:1", "record-a", "record-c"]);
      assert.deepEqual(items.map((item) => item.cardNumber),
        [cards[1], cards[1], cards[2], cards[0], cards[2]]);
      assert.deepEqual(items.map((item) => item.isHistorical), [false, false, true, false, true]);
      assert.equal(first.total, 5);
      assert.equal(first.totalPages, 3);
      assert.equal(first.hasNextPage, true);
      assert.equal(third.hasNextPage, false);
      assert.deepEqual(first.summary, { recordCount: 3, activeRecordCount: 2, historicalRecordCount: 1,
        poolContributionCount: 2, collectionAmount: "35.00", poolAmount: "70.00",
        totalCoveredAmount: "105.00", effectiveStatus: "abort_cp" });
      assert.deepEqual(second.summary, first.summary);
      assert.ok(items.every((item) => item.sourceImportName === null && item.sourceFilename === null));
      assert.ok(items.every((item) => !("reason" in item) && !("source_obligation_key" in item)));
    });
    await t.test("owner and nickname scopes remain effective before Card hydration", async () => {
      for (const scope of [{ kind: "created_by", username: " ALPHA " },
        { kind: "nicknames", nicknames: [" ALPHA "] }] as SearchCollectionViewerScope[]) {
        const matches = await repository.findCollectionStatusesForRows([candidate], scope);
        assert.equal(matches[0].latestCardNumber, cards[0]);
        assert.equal(matches[0].recordCount, 2);
        const page = await history(1, 10, scope);
        assert.equal(page.total, 3);
        assert.ok(page.items.every((item) => item.cardNumber !== cards[1]));
      }
      assert.deepEqual(await repository.findCollectionStatusesForRows([candidate], { kind: "none" }), []);
      assert.deepEqual((await history(1, 10, { kind: "none" })).items, []);
    });
    await t.test("mismatched source index fails closed and retired configuration retains exact-link policy", async () => {
      await pool.query("UPDATE collection_source_rows SET card_number_hash='tampered' WHERE source_data_row_id='row-b'");
      const matches = await repository.findCollectionStatusesForRows([candidate], { kind: "all" });
      assert.equal(matches[0].latestCardNumber, null);
      assert.equal(matches[0].latestAccountNumber, account);
      assert.equal(matches[0].latestAmount, "20.00");
      await pool.query("UPDATE collection_source_rows SET card_number_hash=$1 WHERE source_data_row_id='row-b'",
        [hashCollectionSourceIdentifier(cards[1], "card_number")]);
      await pool.query("DELETE FROM collection_source_rows WHERE source_data_row_id='row-a'");
      const page = await history(1, 10);
      assert.equal(page.items.find((item) => item.id === "record-a")?.cardNumber, cards[0]);
    });
    await t.test("missing or expanded Unicode source Card remains a valid bounded display value", async () => {
      const unicodeCard = "\u00df".repeat(252) + "1234";
      for (const [id, card] of [["missing", null], ["unicode", unicodeCard]] as const) {
        const sourceAccount = `FIXTURE-${id.toUpperCase()}`;
        const key = await addSource(id, card, sourceAccount);
        await pool.query(`INSERT INTO collection_records(id,source_import_id,source_data_row_id,
          source_obligation_key,account_number,payment_date,amount,created_by_login,created_at,classification)
          VALUES($1,$2,$3,$4,$5,'2026-09-01',1,'fixture','2026-09-01T08:00:00Z','cp')`,
        [`record-${id}`, `import-${id}`, `row-${id}`, key, sourceAccount]);
        const exactCandidate = { ...candidate, rowId: `row-${id}`, sourceImportId: `import-${id}`,
          icHash: null, icValue: null, accountHashes: [], accountValues: [sourceAccount] };
        const matches = await repository.findCollectionStatusesForRows([exactCandidate], { kind: "all" });
        const page = await repository.findCollectionHistoryForRow({ candidate: exactCandidate,
          sourceObligationKey: key, viewerScope: { kind: "all" }, includeManualAuditDetails: false,
          includeSourceDetails: false, page: 1, pageSize: 10 });
        assert.equal(matches[0].latestCardNumber, card?.toUpperCase() ?? null);
        assert.equal(matches[0].latestAccountNumber, sourceAccount);
        assert.equal(page.items[0].cardNumber, card?.toUpperCase() ?? null);
      }
    });
  } finally {
    await runtime.closePostgresPools();
  }
});
