import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../../db-postgres";
import {
  MAX_SEARCH_OFFSET,
  SearchRepository,
} from "../search.repository";
import { collectBoundValues, collectSqlText } from "./sql-test-utils";

function withMockedDbExecute(
  handler: (queryText: string) => { rows?: unknown[] },
): () => void {
  const originalExecute = db.execute;

  (db as unknown as {
    execute: typeof db.execute;
  }).execute = (async (query) => handler(collectSqlText(query))) as typeof db.execute;

  return () => {
    (db as unknown as {
      execute: typeof db.execute;
    }).execute = originalExecute;
  };
}

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
    });
    assert.equal(queries.length, 1);
    assert.match(queries[0] || "", /COUNT\(\*\)::int AS total/i);
    assert.doesNotMatch(queries[0] || "", /\bOFFSET\b/i);
  } finally {
    restore();
  }
});

test("SearchRepository.searchGlobalDataRows reuses a single windowed query when page data is available", async () => {
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
          total: 12,
        },
      ],
    };
  });

  try {
    const result = await repository.searchGlobalDataRows({
      search: "Alice",
      limit: 50,
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
      ],
      total: 12,
    });
    assert.equal(queries.length, 1);
    assert.match(queries[0] || "", /COUNT\(\*\)\s+OVER\(\)::int AS total/i);
  } finally {
    restore();
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
  const originalExecute = db.execute;

  (db as unknown as {
    execute: typeof db.execute;
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
  }) as typeof db.execute;

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
    (db as unknown as {
      execute: typeof db.execute;
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
