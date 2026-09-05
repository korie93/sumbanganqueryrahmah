import assert from "node:assert/strict";
import test from "node:test";
import { db, dbRead } from "../../db-postgres";
import { encryptCollectionPiiWithSecret } from "../../lib/collection-pii-encryption-crypto";
import { normalizeSearchJsonPayload } from "../search-repository-shared";
import {
  MAX_SEARCH_OFFSET,
  SearchRepository,
} from "../search.repository";
import {
  collectBoundValues,
  collectSqlLiteralText,
  collectSqlText,
} from "./sql-test-utils";

function withMockedDbExecute(
  handler: (queryText: string) => { rows?: unknown[] },
): () => void {
  const originalExecute = dbRead.execute;

  (dbRead as unknown as {
    execute: typeof dbRead.execute;
  }).execute = (async (query) => handler(collectSqlText(query))) as typeof dbRead.execute;

  return () => {
    (dbRead as unknown as {
      execute: typeof dbRead.execute;
    }).execute = originalExecute;
  };
}

test("normalizeSearchJsonPayload keeps oversized serialized payloads as strings", () => {
  const oversizedPayload = JSON.stringify({ payload: "x".repeat(300 * 1024) });
  assert.equal(normalizeSearchJsonPayload(oversizedPayload), oversizedPayload);
});

test("SearchRepository.searchGlobalDataRows skips deep offset scans and still reports totals", async () => {
  const repository = new SearchRepository();
  const queries: string[] = [];
  const restore = withMockedDbExecute((queryText) => {
    queries.push(queryText);
    return { rows: [{ total: 321 }] };
  });

  try {
    const result = await repository.searchGlobalDataRows({
      search: "Alice",
      limit: 50,
      offset: MAX_SEARCH_OFFSET + 1,
    });

    assert.deepEqual(result, {
      rows: [],
      total: 321,
      totalIsApproximate: false,
    });
    assert.equal(queries.length, 1);
    assert.match(queries[0] || "", /COUNT\(\*\)::int AS total/i);
    assert.doesNotMatch(queries[0] || "", /\bOFFSET\b/i);
  } finally {
    restore();
  }
});

test("SearchRepository.searchGlobalDataRows avoids exact counts on normal result pages", async () => {
  const repository = new SearchRepository();
  const queries: string[] = [];
  const restore = withMockedDbExecute((queryText) => {
    queries.push(queryText);
    return {
      rows: [
        {
          id: "row-1",
          import_id: "import-1",
          json_data_jsonb: { name: "Alice" },
          import_name: "Import Alpha",
          import_filename: "alpha.csv",
        },
        {
          id: "row-2",
          import_id: "import-1",
          json_data_jsonb: { name: "Alicia" },
          import_name: "Import Alpha",
          import_filename: "alpha.csv",
        },
        {
          id: "row-3",
          import_id: "import-2",
          json_data_jsonb: { name: "Alina" },
          import_name: "Import Beta",
          import_filename: "beta.csv",
        },
      ],
    };
  });

  try {
    const result = await repository.searchGlobalDataRows({
      search: "ALICE",
      limit: 2,
      offset: 0,
    });

    assert.deepEqual(result, {
      rows: [
        {
          id: "row-1",
          importId: "import-1",
          importName: "Import Alpha",
          importFilename: "alpha.csv",
          jsonDataJsonb: { name: "Alice" },
        },
        {
          id: "row-2",
          importId: "import-1",
          importName: "Import Alpha",
          importFilename: "alpha.csv",
          jsonDataJsonb: { name: "Alicia" },
        },
      ],
      total: 3,
      totalIsApproximate: true,
    });
    assert.equal(queries.length, 1);
    assert.doesNotMatch(queries[0] || "", /COUNT\(\*\)\s+OVER\(\)::int AS total/i);
    assert.match(queries[0] || "", /lower\(dr\.json_data::text\)\s+LIKE/i);
    assert.match(queries[0] || "", /\bLIMIT\b/i);
  } finally {
    restore();
  }
});

test("SearchRepository.searchSimpleDataRows parameterizes LIKE injection attempts with an ESCAPE clause", async () => {
  const repository = new SearchRepository();
  const rawQueries: unknown[] = [];
  const originalExecute = dbRead.execute;

  (dbRead as unknown as {
    execute: typeof dbRead.execute;
  }).execute = (async (query: unknown) => {
    rawQueries.push(query);
    return { rows: [] };
  }) as unknown as typeof dbRead.execute;

  try {
    await repository.searchSimpleDataRows("'; DROP TABLE users; --");

    assert.equal(rawQueries.length, 1);
    const sqlText = collectSqlText(rawQueries[0]);
    const boundValues = collectBoundValues(rawQueries[0]);

    assert.match(sqlText, /lower\(dr\.json_data::text\)\s+LIKE/i);
    assert.match(sqlText, /\bESCAPE\b/i);
    assert.ok(boundValues.includes("%'; drop table users; --%"));
  } finally {
    (dbRead as unknown as {
      execute: typeof dbRead.execute;
    }).execute = originalExecute;
  }
});

test("SearchRepository searches equivalent local and international Malaysian phone values", async () => {
  const repository = new SearchRepository();
  const rawQueries: unknown[] = [];
  const originalExecute = dbRead.execute;

  (dbRead as unknown as { execute: typeof dbRead.execute }).execute = (async (query: unknown) => {
    rawQueries.push(query);
    return { rows: [] };
  }) as unknown as typeof dbRead.execute;

  try {
    await repository.searchSimpleDataRows("012-345 6789");

    assert.equal(rawQueries.length, 1);
    const sqlText = collectSqlText(rawQueries[0]);
    const boundValues = collectBoundValues(rawQueries[0]);
    assert.match(sqlText, /jsonb_each_text/i);
    assert.match(sqlText, /regexp_replace\(phone_field\.value/i);
    assert.ok(boundValues.includes("0123456789"));
    assert.ok(boundValues.includes("123456789"));
    assert.ok(boundValues.includes("60123456789"));
    assert.ok(boundValues.includes("0060123456789"));
  } finally {
    (dbRead as unknown as { execute: typeof dbRead.execute }).execute = originalExecute;
  }
});

test("SearchRepository.findCollectionStatusesForRows uses one parameterized bounded lookup", async () => {
  const repository = new SearchRepository();
  const rawQueries: unknown[] = [];
  const originalExecute = dbRead.execute;

  (dbRead as unknown as { execute: typeof dbRead.execute }).execute = (async (query) => {
    rawQueries.push(query);
    return {
      rows: [{
        row_id: "row-1",
        record_count: 2,
        is_historical: false,
        payment_date: "2026-08-01",
        created_at: new Date("2026-08-01T08:00:00.000Z"),
        collection_staff_nickname: "Collector Alpha",
        created_by_login: "collector.login",
        account_number: "ACC-1001",
        account_number_encrypted: null,
        account_number_search_hash: "account-hash-1001",
        amount: "150.50",
        source_import_name: "NPL CC P10 JULY",
        source_filename: "npl.xlsx",
        purged_at: null,
        purged_by: null,
        match_basis: "source_and_identifier",
      }],
    };
  }) as typeof dbRead.execute;

  try {
    const matches = await repository.findCollectionStatusesForRows([{
      rowId: "row-1",
      sourceImportId: "import-1",
      icHash: null,
      icValue: "900101101234",
      phoneHash: null,
      phoneValue: "0123456789",
      accountHashes: [],
      accountValues: ["ACC9999", "ACC1001"],
    }], { kind: "all" });

    assert.equal(rawQueries.length, 1);
    assert.match(collectSqlText(rawQueries[0]), /jsonb_to_recordset/i);
    assert.match(collectSqlText(rawQueries[0]), /source_data_row_id/i);
    assert.match(collectSqlText(rawQueries[0]), /collection_record_purge_history/i);
    assert.match(collectSqlText(rawQueries[0]), /record\.is_historical ASC/i);
    assert.match(collectSqlText(rawQueries[0]), /account_number_encrypted/i);
    assert.match(collectSqlText(rawQueries[0]), /jsonb_array_elements_text/i);
    assert.match(collectSqlText(rawQueries[0]), /account_candidate_present/i);
    assert.ok(collectBoundValues(rawQueries[0]).some((value) =>
      typeof value === "string"
      && value.includes('"row_id":"row-1"')
      && value.includes('"account_values":["ACC9999","ACC1001"]')),
    );
    assert.deepEqual(matches, [{
      rowId: "row-1",
      recordCount: 2,
      isHistorical: false,
      latestPaymentDate: "2026-08-01",
      latestCreatedAt: "2026-08-01T08:00:00.000Z",
      latestStaffNickname: "Collector Alpha",
      latestCreatedByLogin: "collector.login",
      latestAccountNumber: "ACC-1001",
      matchedAccountHash: "account-hash-1001",
      latestAmount: "150.50",
      sourceImportName: "NPL CC P10 JULY",
      sourceFilename: "npl.xlsx",
      purgedAt: null,
      purgedBy: null,
      matchBasis: "source_and_identifier",
    }]);
  } finally {
    (dbRead as unknown as { execute: typeof dbRead.execute }).execute = originalExecute;
  }
});

test("SearchRepository.findCollectionStatusesForRows maps minimal purge history", async () => {
  const repository = new SearchRepository();
  const originalExecute = dbRead.execute;

  (dbRead as unknown as { execute: typeof dbRead.execute }).execute = (async () => ({
    rows: [{
      row_id: "row-history",
      record_count: 1,
      is_historical: true,
      payment_date: "2025-12-15",
      created_at: new Date("2025-12-15T04:00:00.000Z"),
      collection_staff_nickname: "Collector History",
      created_by_login: "collector.history",
      account_number: null,
      account_number_encrypted: null,
      account_number_search_hash: "history-account-hash",
      amount: "99.90",
      source_import_name: "Historical Source",
      source_filename: "historical.xlsx",
      purged_at: new Date("2026-08-05T05:00:00.000Z"),
      purged_by: "superuser.audit",
      match_basis: "source_row",
    }],
  })) as unknown as typeof dbRead.execute;

  try {
    const matches = await repository.findCollectionStatusesForRows([{
      rowId: "row-history",
      sourceImportId: "import-history",
      icHash: "history-ic-hash",
      icValue: null,
      phoneHash: null,
      phoneValue: null,
      accountHashes: ["history-account-hash"],
      accountValues: ["COLLECTION-2002"],
    }], { kind: "all" });

    assert.deepEqual(matches, [{
      rowId: "row-history",
      recordCount: 1,
      isHistorical: true,
      latestPaymentDate: "2025-12-15",
      latestCreatedAt: "2025-12-15T04:00:00.000Z",
      latestStaffNickname: "Collector History",
      latestCreatedByLogin: "collector.history",
      latestAccountNumber: null,
      matchedAccountHash: "history-account-hash",
      latestAmount: "99.90",
      sourceImportName: "Historical Source",
      sourceFilename: "historical.xlsx",
      purgedAt: "2026-08-05T05:00:00.000Z",
      purgedBy: "superuser.audit",
      matchBasis: "source_row",
    }]);
  } finally {
    (dbRead as unknown as { execute: typeof dbRead.execute }).execute = originalExecute;
  }
});

test("SearchRepository.findCollectionStatusesForRows applies the authorized owner scope", async () => {
  const repository = new SearchRepository();
  const rawQueries: unknown[] = [];
  const originalExecute = dbRead.execute;
  (dbRead as unknown as { execute: typeof dbRead.execute }).execute = (async (
    query: Parameters<typeof dbRead.execute>[0],
  ) => {
    rawQueries.push(query);
    return { rows: [] };
  }) as unknown as typeof dbRead.execute;

  try {
    await repository.findCollectionStatusesForRows([{
      rowId: "row-1",
      sourceImportId: "import-1",
      icHash: "hash",
      icValue: "931120115437",
      phoneHash: null,
      phoneValue: null,
      accountHashes: [],
      accountValues: [],
    }], { kind: "created_by", username: "User.One" });

    const text = collectSqlText(rawQueries[0]);
    const values = collectBoundValues(rawQueries[0]);
    assert.match(text, /lower\(record\.created_by_login\)/i);
    assert.ok(values.includes("user.one"));
  } finally {
    (dbRead as unknown as { execute: typeof dbRead.execute }).execute = originalExecute;
  }
});

test("SearchRepository.findCollectionStatusesForRows decrypts retired account shadows fail closed", async () => {
  const repository = new SearchRepository();
  const originalExecute = dbRead.execute;
  const previousKey = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  const previousRetiredFields = process.env.COLLECTION_PII_RETIRED_FIELDS;
  const secret = "search-repository-test-collection-pii-key";

  process.env.COLLECTION_PII_ENCRYPTION_KEY = secret;
  process.env.COLLECTION_PII_RETIRED_FIELDS = "accountNumber";
  (dbRead as unknown as { execute: typeof dbRead.execute }).execute = (async (
    _query: Parameters<typeof dbRead.execute>[0],
  ) => ({
    rows: [{
      row_id: "row-encrypted",
      record_count: 1,
      is_historical: false,
      payment_date: "2026-08-02",
      created_at: new Date("2026-08-02T08:00:00.000Z"),
      collection_staff_nickname: "Collector Alpha",
      created_by_login: "collector.login",
      account_number: null,
      account_number_encrypted: encryptCollectionPiiWithSecret("ACC-ENCRYPTED-1002", secret),
      account_number_search_hash: "account-hash",
      amount: "200.00",
      source_import_name: "NPL AUGUST",
      source_filename: "august.xlsx",
      purged_at: null,
      purged_by: null,
      match_basis: "source_row",
    }],
  })) as unknown as typeof dbRead.execute;

  try {
    const matches = await repository.findCollectionStatusesForRows([{
      rowId: "row-encrypted",
      sourceImportId: "import-2",
      icHash: null,
      icValue: null,
      phoneHash: null,
      phoneValue: null,
      accountHashes: ["account-hash"],
      accountValues: [],
    }], { kind: "all" });

    assert.equal(matches[0]?.latestAccountNumber, "ACC-ENCRYPTED-1002");
  } finally {
    (dbRead as unknown as { execute: typeof dbRead.execute }).execute = originalExecute;
    if (previousKey === undefined) {
      delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
    } else {
      process.env.COLLECTION_PII_ENCRYPTION_KEY = previousKey;
    }
    if (previousRetiredFields === undefined) {
      delete process.env.COLLECTION_PII_RETIRED_FIELDS;
    } else {
      process.env.COLLECTION_PII_RETIRED_FIELDS = previousRetiredFields;
    }
  }
});

test("SearchRepository.findSavedCollectionSourceForRecord uses bounded parameters and exact matching", async () => {
  const repository = new SearchRepository();
  const selectedSourceImportId = "import-1'; DROP TABLE data_rows; --";
  const rawQueries: unknown[] = [];
  const originalExecute = db.execute;
  (db as unknown as { execute: typeof db.execute }).execute = (async (query) => {
    rawQueries.push(query);
    return {
      rows: [{
        row_id: "row-1",
        source_import_id: selectedSourceImportId,
        source_import_name: "NPL JULY",
        source_filename: "july.xlsx",
        source_created_at: new Date("2026-07-01T00:00:00.000Z"),
        json_data_jsonb: {
          Name: "Mohd Bin Sudin",
          IC: "931120-11-5437",
          Phone: "0123456789",
          "Account Number": "ACC1001'; DROP TABLE imports; --",
        },
      }],
    };
  }) as typeof db.execute;

  try {
    const match = await repository.findSavedCollectionSourceForRecord({
      customerName: "Mohd Bin Sudin",
      icNumber: "931120115437",
      customerPhone: "0123456789",
      accountNumber: "ACC1001'; DROP TABLE imports; --",
      sourceImportId: selectedSourceImportId,
    });

    assert.equal(rawQueries.length, 1);
    assert.deepEqual(match, {
      rowId: "row-1",
      sourceImportId: selectedSourceImportId,
      sourceImportName: "NPL JULY",
      sourceFilename: "july.xlsx",
      matchBasis: "ic",
      matchAccuracy: 100,
      matchedFields: ["customer_name", "ic_number", "customer_phone", "account_number"],
      comparedFields: ["customer_name", "ic_number", "customer_phone", "account_number"],
      totalDue: null,
      billingPrincipalOsp: null,
      callingDate: null,
      callingWindowEnd: null,
      callingWindowEndExclusive: null,
    });
    const sqlText = collectSqlLiteralText(rawQueries[0]);
    assert.doesNotMatch(sqlText, /DROP TABLE imports/i);
    assert.doesNotMatch(sqlText, /DROP TABLE data_rows/i);
    assert.match(sqlText, /imp\.id\s*=/i);
    assert.ok(collectBoundValues(rawQueries[0]).some((value) =>
      typeof value === "string" && value.includes("931120115437"),
    ));
    assert.ok(collectBoundValues(rawQueries[0]).some((value) =>
      value === selectedSourceImportId,
    ));
  } finally {
    (db as unknown as { execute: typeof db.execute }).execute = originalExecute;
  }
});

test("SearchRepository.getCollectionSettlementProjection scopes an exact numeric cumulative window", async () => {
  const repository = new SearchRepository();
  let capturedQuery: unknown;
  const originalExecute = db.execute;
  (db as unknown as { execute: typeof db.execute }).execute = (async (query) => {
    capturedQuery = query;
    return {
      rows: [{
        existing_cumulative: "120.00",
        current_entry: "80.00",
        projected_cumulative: "200.00",
        remaining_after_save: "0.00",
        projected_total_due_covered: true,
        projected_entry_is_abort: true,
      }],
    };
  }) as typeof db.execute;

  try {
    const projection = await repository.getCollectionSettlementProjection({
      sourceImportId: "import-a",
      sourceDataRowId: "row-a",
      callingDate: "2026-08-12",
      callingWindowEndExclusive: "2026-09-12",
      paymentDate: "2026-09-11",
      currentAmount: "80.00",
      totalDue: "200.00",
      excludeRecordId: "record-edit",
    });

    assert.deepEqual(projection, {
      existingCumulative: "120.00",
      currentEntry: "80.00",
      projectedCumulative: "200.00",
      remainingAfterSave: "0.00",
      projectedTotalDueCovered: true,
      projectedCpStatus: "abort_cp",
    });
    const sqlText = collectSqlText(capturedQuery);
    assert.match(sqlText, /SUM\(record\.amount\)/i);
    assert.match(sqlText, /prior_cumulative/i);
    assert.match(sqlText, /projected_entry_is_abort/i);
    assert.match(sqlText, /record\.source_import_id\s*=/i);
    assert.match(sqlText, /record\.source_data_row_id\s*=/i);
    assert.match(sqlText, /record\.calling_date\s*=/i);
    assert.match(sqlText, /record\.payment_date\s*>=/i);
    assert.match(sqlText, /record\.payment_date\s*</i);
    assert.match(sqlText, /record\.duplicate_receipt_flag\s*=\s*false/i);
    assert.doesNotMatch(sqlText, /parseFloat|::float|double precision/i);
    const boundValues = collectBoundValues(capturedQuery);
    for (const expected of [
      "import-a",
      "row-a",
      "2026-08-12",
      "2026-09-12",
      "80.00",
      "200.00",
      "record-edit",
    ]) {
      assert.ok(boundValues.includes(expected), `missing bound settlement value ${expected}`);
    }
  } finally {
    (db as unknown as { execute: typeof db.execute }).execute = originalExecute;
  }
});

test("SearchRepository.searchDataRows skips deep offset data queries without using cursor pagination", async () => {
  const repository = new SearchRepository();
  const queries: string[] = [];
  const restore = withMockedDbExecute((queryText) => {
    queries.push(queryText);
    return { rows: [{ total: 45 }] };
  });

  try {
    const result = await repository.searchDataRows({
      importId: "import-1",
      search: "Alice",
      limit: 50,
      offset: MAX_SEARCH_OFFSET + 1,
      columnFilters: [],
      cursor: null,
    });

    assert.deepEqual(result, {
      rows: [],
      total: 45,
      nextCursorRowId: null,
    });
    assert.equal(queries.length, 1);
    assert.match(queries[0] || "", /COUNT\(\*\)::int AS total/i);
    assert.doesNotMatch(queries[0] || "", /\bOFFSET\b/i);
  } finally {
    restore();
  }
});

test("SearchRepository.searchDataRows still allows deep traversal via cursor pagination", async () => {
  const repository = new SearchRepository();
  const queries: string[] = [];
  const restore = withMockedDbExecute((queryText) => {
    queries.push(queryText);
    return {
      rows: [
        {
          id: "row-1",
          importId: "import-1",
          jsonDataJsonb: { name: "Alice" },
          total: 45,
        },
      ],
    };
  });

  try {
    const result = await repository.searchDataRows({
      importId: "import-1",
      search: "Alice",
      limit: 50,
      offset: MAX_SEARCH_OFFSET + 1,
      columnFilters: [],
      cursor: "row-0",
    });

    assert.deepEqual(result, {
      rows: [
        {
          id: "row-1",
          importId: "import-1",
          jsonDataJsonb: { name: "Alice" },
        },
      ],
      total: 45,
      nextCursorRowId: null,
    });
    assert.equal(queries.length, 1);
    assert.match(queries[0] || "", /COUNT\(\*\)\s+OVER\(\)::int AS total/i);
    assert.match(queries[0] || "", /\bLIMIT\b/i);
    assert.doesNotMatch(queries[0] || "", /\bOFFSET\b/i);
  } finally {
    restore();
  }
});

test("SearchRepository.searchDataRows ignores column filters that are not real columns for the import", async () => {
  const repository = new SearchRepository();
  const rawQueries: unknown[] = [];
  const originalExecute = dbRead.execute;

  (dbRead as unknown as {
    execute: typeof dbRead.execute;
  }).execute = (async (query) => {
    rawQueries.push(query);
    const queryText = collectSqlText(query);

    if (/jsonb_object_keys/i.test(queryText)) {
      return { rows: [{ column_name: "name" }] };
    }

    return {
      rows: [
        {
          id: "row-1",
          importId: "import-1",
          jsonDataJsonb: { name: "Alice" },
          total: 1,
        },
      ],
    };
  }) as typeof dbRead.execute;

  try {
    const result = await repository.searchDataRows({
      importId: "import-1",
      search: null,
      limit: 50,
      offset: 0,
      columnFilters: [
        { column: "name", operator: "contains", value: "Alice" },
        { column: "DROP TABLE users", operator: "contains", value: "blocked-value" },
      ],
      cursor: null,
    });

    assert.deepEqual(result, {
      rows: [
        {
          id: "row-1",
          importId: "import-1",
          jsonDataJsonb: { name: "Alice" },
        },
      ],
      total: 1,
      nextCursorRowId: null,
    });

    assert.equal(rawQueries.length, 2);
    assert.match(collectSqlText(rawQueries[0]), /jsonb_object_keys/i);

    const dataBoundValues = collectBoundValues(rawQueries[1]);

    assert.match(collectSqlText(rawQueries[1]), /COUNT\(\*\)\s+OVER\(\)::int AS total/i);
    assert.ok(dataBoundValues.includes("name"));
    assert.ok(!dataBoundValues.includes("DROP TABLE users"));
    assert.ok(!dataBoundValues.includes("blocked-value"));
  } finally {
    (dbRead as unknown as {
      execute: typeof dbRead.execute;
    }).execute = originalExecute;
  }
});

test("SearchRepository.advancedSearchDataRows skips deep offset scans and still reports totals", async () => {
  const repository = new SearchRepository();
  const queries: string[] = [];
  const restore = withMockedDbExecute((queryText) => {
    queries.push(queryText);
    if (/jsonb_object_keys/i.test(queryText)) {
      return { rows: [{ column_name: "name" }] };
    }

    return { rows: [{ total: 88 }] };
  });

  try {
    const result = await repository.advancedSearchDataRows(
      [{ field: "name", operator: "contains", value: "Alice" }],
      "AND",
      50,
      MAX_SEARCH_OFFSET + 1,
    );

    assert.deepEqual(result, {
      rows: [],
      total: 88,
    });
    assert.equal(queries.length, 2);
    assert.match(queries[1] || "", /COUNT\(\*\)::int AS total/i);
    assert.doesNotMatch(queries[1] || "", /\bOFFSET\b/i);
  } finally {
    restore();
  }
});

test("SearchRepository.advancedSearchDataRows caches allowed columns and filters unsafe fields", async (t) => {
  t.mock.method(Date, "now", () => 1_000_000);

  const repository = new SearchRepository();
  const rawQueries: unknown[] = [];
  const originalExecute = dbRead.execute;
  let schemaLookupCount = 0;

  (dbRead as unknown as {
    execute: typeof dbRead.execute;
  }).execute = (async (query) => {
    rawQueries.push(query);
    const queryText = collectSqlText(query);

    if (/jsonb_object_keys/i.test(queryText)) {
      schemaLookupCount += 1;
      return { rows: [{ column_name: "name" }] };
    }

    if (/COUNT\(\*\)::int AS total/i.test(queryText)) {
      return { rows: [{ total: 1 }] };
    }

    return {
      rows: [
        {
          id: "row-1",
          importId: "import-1",
          jsonDataJsonb: { name: "Alice" },
          importName: "Import Alpha",
          importFilename: "alpha.csv",
        },
      ],
    };
  }) as typeof dbRead.execute;

  try {
    await repository.advancedSearchDataRows(
      [
        { field: "name", operator: "contains", value: "Alice" },
        { field: "DROP TABLE users", operator: "contains", value: "blocked-value" },
      ],
      "AND",
      50,
      0,
    );
    await repository.advancedSearchDataRows(
      [{ field: "name", operator: "contains", value: "Alice" }],
      "AND",
      50,
      0,
    );

    assert.equal(schemaLookupCount, 1);
    assert.equal(rawQueries.length, 5);

    const boundValues = rawQueries.flatMap((query) => collectBoundValues(query));
    assert.ok(boundValues.includes("name"));
    assert.ok(!boundValues.includes("DROP TABLE users"));
    assert.ok(!boundValues.includes("blocked-value"));
  } finally {
    (dbRead as unknown as {
      execute: typeof dbRead.execute;
    }).execute = originalExecute;
  }
});

test("SearchRepository.advancedSearchDataRows refreshes allowed columns after TTL expiry", async (t) => {
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);

  const repository = new SearchRepository();
  const originalExecute = dbRead.execute;
  let schemaLookupCount = 0;

  (dbRead as unknown as {
    execute: typeof dbRead.execute;
  }).execute = (async (query) => {
    const queryText = collectSqlText(query);

    if (/jsonb_object_keys/i.test(queryText)) {
      schemaLookupCount += 1;
      return { rows: [{ column_name: "name" }] };
    }

    if (/COUNT\(\*\)::int AS total/i.test(queryText)) {
      return { rows: [{ total: 1 }] };
    }

    return {
      rows: [
        {
          id: "row-1",
          importId: "import-1",
          jsonDataJsonb: { name: "Alice" },
          importName: "Import Alpha",
          importFilename: "alpha.csv",
        },
      ],
    };
  }) as typeof dbRead.execute;

  try {
    await repository.advancedSearchDataRows(
      [{ field: "name", operator: "contains", value: "Alice" }],
      "AND",
      50,
      0,
    );
    now += 60_001;
    await repository.advancedSearchDataRows(
      [{ field: "name", operator: "contains", value: "Alice" }],
      "AND",
      50,
      0,
    );

    assert.equal(schemaLookupCount, 2);
  } finally {
    (dbRead as unknown as {
      execute: typeof dbRead.execute;
    }).execute = originalExecute;
  }
});

test("SearchRepository resolves a history source only through the exact active import and row pair", async () => {
  const repository = new SearchRepository();
  const rawQueries: unknown[] = [];
  const originalExecute = dbRead.execute;
  (dbRead as unknown as { execute: typeof dbRead.execute }).execute = (async (query: unknown) => {
    rawQueries.push(query);
    return {
      rows: [{
        id: "row-1",
        import_id: "import-1",
        json_data_jsonb: { "Account No": "ACC-1001" },
        canonical_obligation_key: "account:opaque-hash",
      }],
    };
  }) as typeof dbRead.execute;

  try {
    const result = await repository.findCollectionHistorySourceRow({
      sourceImportId: "import-1",
      sourceDataRowId: "row-1",
    });

    assert.deepEqual(result, {
      id: "row-1",
      importId: "import-1",
      jsonDataJsonb: { "Account No": "ACC-1001" },
      sourceObligationKey: "account:opaque-hash",
    });
    const sqlText = collectSqlText(rawQueries[0]);
    assert.match(sqlText, /source_import\.is_deleted = false/i);
    assert.match(sqlText, /data_row\.import_id\s*=/i);
    assert.match(sqlText, /data_row\.id\s*=/i);
    assert.match(sqlText, /collection_source_rows/i);
    const values = collectBoundValues(rawQueries[0]);
    assert.ok(values.includes("import-1"));
    assert.ok(values.includes("row-1"));
  } finally {
    (dbRead as unknown as { execute: typeof dbRead.execute }).execute = originalExecute;
  }
});

test("SearchRepository returns deterministic paginated history with POOL kept separate", async () => {
  const repository = new SearchRepository();
  const rawQueries: unknown[] = [];
  const originalExecute = dbRead.execute;
  (dbRead as unknown as { execute: typeof dbRead.execute }).execute = (async (query) => {
    rawQueries.push(query);
    return {
      rows: [{
        history_item_count: 3,
        record_count: 2,
        active_record_count: 1,
        historical_record_count: 1,
        pool_contribution_count: 1,
        summary_collection_amount: "150.00",
        summary_pool_amount: "350.00",
        summary_total_covered_amount: "500.00",
        summary_effective_status: "abort_cp",
        item_id: "pool:record-1:1",
        item_kind: "pool",
        is_historical: false,
        payment_date: "2026-09-03",
        created_at: new Date("2026-09-03T03:00:00.000Z"),
        amount: "350.00",
        classification_source: "manual_verified_abort",
        automatic_classification: null,
        effective_status: "abort_cp",
        settlement_date: "2026-09-03",
        collection_staff_nickname: null,
        created_by_login: "superuser.one",
        source_import_name: null,
        source_filename: null,
        purged_at: null,
        purged_by: null,
        manual_reason: null,
        manual_note: null,
        manual_reference: null,
      }],
    };
  }) as typeof dbRead.execute;

  try {
    const result = await repository.findCollectionHistoryForRow({
      candidate: {
        rowId: "row-1",
        sourceImportId: "import-1",
        icHash: null,
        icValue: null,
        phoneHash: null,
        phoneValue: null,
        accountHashes: ["account-search-hash"],
        accountValues: ["ACC-1001"],
      },
      sourceObligationKey: "account:source-blind-index-hash",
      viewerScope: { kind: "all" },
      includeManualAuditDetails: false,
      includeSourceDetails: false,
      page: 1,
      pageSize: 2,
    });

    assert.equal(rawQueries.length, 1);
    const sqlText = collectSqlText(rawQueries[0]);
    assert.match(sqlText, /record\.source_data_row_id/i);
    assert.match(sqlText, /record\.source_obligation_key/i);
    assert.doesNotMatch(
      sqlText,
      /record\.account_number_search_hash\s+IN/i,
      "canonical obligation history must not widen to every contract on the same account",
    );
    assert.doesNotMatch(sqlText, /customer_name/i);
    assert.match(sqlText, /record\.settlement_override_status = 'ACTIVE'/i);
    assert.match(sqlText, /purged_pool_history/i);
    assert.match(sqlText, /record\.automatic_classification/i);
    assert.match(sqlText, /record\.manual_settlement_revoked_at/i);
    assert.match(
      sqlText,
      /record\.payment_date\s*<=\s*override_row\.manual_settlement_date/i,
      "later Collection payments must not retroactively validate an earlier POOL settlement",
    );
    assert.match(
      sqlText,
      /BOOL_OR\(record\.classification = 'abort_cp'\)/i,
      "an automatic ABORT in the cycle must supersede an earlier manual POOL",
    );
    assert.match(sqlText, /AND NOT COALESCE\(total\.has_automatic_abort, false\)/i);
    assert.match(
      sqlText,
      /WHEN cycle\.manual_is_valid THEN 'manual_verified_abort'/i,
      "Collection rows whose effective ABORT comes from POOL must expose the manual status source",
    );
    assert.match(
      sqlText,
      /WHEN COALESCE\(cycle\.has_automatic_abort, false\) AND record\.classification = 'cp' THEN 'cp'/i,
      "pre-closure CP rows retain their automatic status after the POOL is superseded",
    );
    assert.match(
      sqlText,
      /WHEN COALESCE\(cycle\.has_automatic_abort, false\) THEN 'superseded_by_automatic'/i,
    );
    assert.match(sqlText, /COALESCE\(total\.collection_amount, 0\) \+ override_row\.pool_amount >= override_row\.total_due/i);
    assert.match(
      sqlText,
      /SUM\(amount\) FILTER \(\s*WHERE item_kind = 'collection'\s*\)/i,
      "the summary must include active and purged collection history",
    );
    assert.match(sqlText, /ORDER BY payment_date DESC, created_at DESC, item_id DESC/i);
    assert.deepEqual(result.summary, {
      recordCount: 2,
      activeRecordCount: 1,
      historicalRecordCount: 1,
      poolContributionCount: 1,
      collectionAmount: "150.00",
      poolAmount: "350.00",
      totalCoveredAmount: "500.00",
      effectiveStatus: "abort_cp",
    });
    assert.equal(result.total, 3);
    assert.equal(result.totalPages, 2);
    assert.equal(result.hasNextPage, true);
    assert.equal(result.items[0]?.kind, "pool");
    assert.equal(result.items[0]?.amount, "350.00");
    assert.equal("reason" in (result.items[0] || {}), false);
  } finally {
    (dbRead as unknown as { execute: typeof dbRead.execute }).execute = originalExecute;
  }
});

test("SearchRepository uses account identity only as a legacy fallback without a canonical obligation", async () => {
  const repository = new SearchRepository();
  const rawQueries: unknown[] = [];
  const originalExecute = dbRead.execute;
  (dbRead as unknown as { execute: typeof dbRead.execute }).execute = (async (query: unknown) => {
    rawQueries.push(query);
    return { rows: [] };
  }) as unknown as typeof dbRead.execute;
  try {
    await repository.findCollectionHistoryForRow({
      candidate: {
        rowId: "legacy-row",
        sourceImportId: "legacy-import",
        icHash: null,
        icValue: null,
        phoneHash: null,
        phoneValue: null,
        accountHashes: ["legacy-account-hash"],
        accountValues: ["ACC-LEGACY"],
      },
      sourceObligationKey: null,
      viewerScope: { kind: "all" },
      includeManualAuditDetails: false,
      includeSourceDetails: false,
      page: 1,
      pageSize: 10,
    });
    const sqlText = collectSqlText(rawQueries[0]);
    assert.match(sqlText, /record\.account_number_search_hash\s+IN/i);
    assert.ok(collectBoundValues(rawQueries[0]).includes("legacy-account-hash"));
  } finally {
    (dbRead as unknown as { execute: typeof dbRead.execute }).execute = originalExecute;
  }
});

test("SearchRepository exposes manual reason and reference only when explicitly authorized", async () => {
  const repository = new SearchRepository();
  const originalExecute = dbRead.execute;
  (dbRead as unknown as { execute: typeof dbRead.execute }).execute = (async () => ({
    rows: [{
      history_item_count: 1,
      record_count: 0,
      active_record_count: 0,
      historical_record_count: 0,
      pool_contribution_count: 1,
      summary_collection_amount: "0.00",
      summary_pool_amount: "350.00",
      summary_total_covered_amount: "350.00",
      summary_effective_status: "unclassified",
      item_id: "pool:record-1:1",
      item_kind: "pool",
      is_historical: false,
      payment_date: "2026-09-03",
      created_at: new Date("2026-09-03T03:00:00.000Z"),
      amount: "350.00",
      classification_source: "manual_verified_abort",
      automatic_classification: null,
      effective_status: "abort_cp",
      settlement_date: "2026-09-03",
      collection_staff_nickname: null,
      created_by_login: "superuser.one",
      source_import_name: "Saved Source",
      source_filename: "saved.xlsx",
      purged_at: null,
      purged_by: null,
      manual_reason: "EXTERNAL_UNASSIGNED_PAYMENT",
      manual_note: "Verified against statement",
      manual_reference: "BANK-REF-1",
    }],
  })) as unknown as typeof dbRead.execute;

  try {
    const result = await repository.findCollectionHistoryForRow({
      candidate: {
        rowId: "row-1",
        sourceImportId: "import-1",
        icHash: null,
        icValue: null,
        phoneHash: null,
        phoneValue: null,
        accountHashes: [],
        accountValues: [],
      },
      sourceObligationKey: "account:hash",
      viewerScope: { kind: "all" },
      includeManualAuditDetails: true,
      includeSourceDetails: true,
      page: 1,
      pageSize: 10,
    });

    assert.equal(result.items[0]?.reason, "EXTERNAL_UNASSIGNED_PAYMENT");
    assert.equal(result.items[0]?.note, "Verified against statement");
    assert.equal(result.items[0]?.reference, "BANK-REF-1");
    assert.equal(result.items[0]?.sourceFilename, "saved.xlsx");
  } finally {
    (dbRead as unknown as { execute: typeof dbRead.execute }).execute = originalExecute;
  }
});
