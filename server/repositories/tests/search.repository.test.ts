import assert from "node:assert/strict";
import test from "node:test";
import { db, dbRead } from "../../db-postgres";
import { encryptCollectionPiiWithSecret } from "../../lib/collection-pii-encryption-crypto";
import { normalizeSearchJsonPayload } from "../search-repository-shared";
import {
  MAX_SEARCH_OFFSET,
  SearchRepository,
} from "../search.repository";
import { collectBoundValues, collectSqlText } from "./sql-test-utils";

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
        payment_date: "2026-08-01",
        created_at: new Date("2026-08-01T08:00:00.000Z"),
        collection_staff_nickname: "Collector Alpha",
        created_by_login: "collector.login",
        account_number: "ACC-1001",
        account_number_encrypted: null,
        amount: "150.50",
        source_import_name: "NPL CC P10 JULY",
        source_filename: "npl.xlsx",
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
      accountHash: null,
      accountValue: "ACC1001",
    }], { kind: "all" });

    assert.equal(rawQueries.length, 1);
    assert.match(collectSqlText(rawQueries[0]), /jsonb_to_recordset/i);
    assert.match(collectSqlText(rawQueries[0]), /source_data_row_id/i);
    assert.match(collectSqlText(rawQueries[0]), /account_number_encrypted/i);
    assert.match(
      collectSqlText(rawQueries[0]),
      /candidate\.account_hash IS NULL AND candidate\.account_value IS NULL/i,
    );
    assert.ok(collectBoundValues(rawQueries[0]).some((value) =>
      typeof value === "string" && value.includes('"row_id":"row-1"')),
    );
    assert.deepEqual(matches, [{
      rowId: "row-1",
      recordCount: 2,
      latestPaymentDate: "2026-08-01",
      latestCreatedAt: "2026-08-01T08:00:00.000Z",
      latestStaffNickname: "Collector Alpha",
      latestCreatedByLogin: "collector.login",
      latestAccountNumber: "ACC-1001",
      latestAmount: "150.50",
      sourceImportName: "NPL CC P10 JULY",
      sourceFilename: "npl.xlsx",
      matchBasis: "source_and_identifier",
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
      accountHash: null,
      accountValue: null,
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
      payment_date: "2026-08-02",
      created_at: new Date("2026-08-02T08:00:00.000Z"),
      collection_staff_nickname: "Collector Alpha",
      created_by_login: "collector.login",
      account_number: null,
      account_number_encrypted: encryptCollectionPiiWithSecret("ACC-ENCRYPTED-1002", secret),
      amount: "200.00",
      source_import_name: "NPL AUGUST",
      source_filename: "august.xlsx",
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
      accountHash: "account-hash",
      accountValue: null,
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
  const rawQueries: unknown[] = [];
  const originalExecute = db.execute;
  (db as unknown as { execute: typeof db.execute }).execute = (async (query) => {
    rawQueries.push(query);
    return {
      rows: [{
        row_id: "row-1",
        source_import_id: "import-1",
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
    });

    assert.equal(rawQueries.length, 1);
    assert.deepEqual(match, {
      rowId: "row-1",
      sourceImportId: "import-1",
      sourceImportName: "NPL JULY",
      sourceFilename: "july.xlsx",
      matchBasis: "ic",
    });
    const sqlText = collectSqlText(rawQueries[0]);
    assert.doesNotMatch(sqlText, /DROP TABLE imports/i);
    assert.ok(collectBoundValues(rawQueries[0]).some((value) =>
      typeof value === "string" && value.includes("931120115437"),
    ));
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
