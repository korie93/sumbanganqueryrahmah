import assert from "node:assert/strict";
import test from "node:test";
import type { Import } from "../../../shared/schema-postgres";
import { logger } from "../../lib/logger";
import {
  assertSafeSqlIdentifierAlias,
  ImportsRepository,
  resolveRemainingImportsReadLimit,
} from "../imports.repository";
import { db } from "../../db-postgres";

class MockPagedSelectBuilder<TRow extends object> {
  private limitValue = 0;

  constructor(
    private readonly rows: TRow[],
    private readonly calls: Array<{ limit: number; offset: number }>,
  ) {}

  from() {
    return this;
  }

  where() {
    return this;
  }

  orderBy() {
    return this;
  }

  limit(limit: number) {
    this.limitValue = limit;
    return this;
  }

  offset(offset: number) {
    this.calls.push({
      limit: this.limitValue,
      offset,
    });
    return Promise.resolve(this.rows.slice(offset, offset + this.limitValue));
  }
}

function createImportRows(count: number): Import[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `import-${index + 1}`,
    name: `Import ${index + 1}`,
    filename: `import-${index + 1}.xlsx`,
    createdAt: new Date(`2026-04-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`),
    isDeleted: false,
    createdBy: "tester",
  }));
}

test("resolveRemainingImportsReadLimit enforces the page size and hard cap", () => {
  assert.equal(resolveRemainingImportsReadLimit(0), 1000);
  assert.equal(resolveRemainingImportsReadLimit(9_500), 500);
  assert.equal(resolveRemainingImportsReadLimit(10_000), 0);
  assert.equal(resolveRemainingImportsReadLimit(99_999), 0);
});

test("assertSafeSqlIdentifierAlias accepts strict alphanumeric aliases", () => {
  assert.equal(assertSafeSqlIdentifierAlias("i"), "i");
  assert.equal(assertSafeSqlIdentifierAlias("import_rows_2026"), "import_rows_2026");
});

test("assertSafeSqlIdentifierAlias rejects unsafe alias input before sql.raw is used", () => {
  assert.throws(
    () => assertSafeSqlIdentifierAlias("i; DROP TABLE imports; --"),
    /Invalid SQL alias identifier/i,
  );
  assert.throws(
    () => assertSafeSqlIdentifierAlias("data-rows"),
    /Invalid SQL alias identifier/i,
  );
});

test("getImports returns all rows below the safety cap without warning", async (t) => {
  const rows = createImportRows(1_500);
  const selectCalls: Array<{ limit: number; offset: number }> = [];
  let warningCount = 0;

  t.mock.method(db, "select", (() =>
    new MockPagedSelectBuilder(rows, selectCalls)) as unknown as typeof db.select);
  t.mock.method(logger, "warn", (() => {
    warningCount += 1;
  }) as typeof logger.warn);

  const repository = new ImportsRepository();
  const result = await repository.getImports();

  assert.equal(result.length, 1_500);
  assert.equal(warningCount, 0);
  assert.deepEqual(selectCalls, [
    { limit: 1_000, offset: 0 },
    { limit: 1_000, offset: 1_000 },
  ]);
});

test("getImports stops at the safety cap and warns only when more rows remain", async (t) => {
  const rows = createImportRows(10_050);
  const selectCalls: Array<{ limit: number; offset: number }> = [];
  const warnings: Array<Record<string, unknown> | undefined> = [];

  t.mock.method(db, "select", (() =>
    new MockPagedSelectBuilder(rows, selectCalls)) as unknown as typeof db.select);
  t.mock.method(logger, "warn", ((_message, metadata) => {
    warnings.push(metadata);
  }) as typeof logger.warn);

  const repository = new ImportsRepository();
  const result = await repository.getImports();

  assert.equal(result.length, 10_000);
  assert.deepEqual(selectCalls[selectCalls.length - 1], {
    limit: 1,
    offset: 10_000,
  });
  assert.deepEqual(warnings, [
    {
      loadedImports: 10_000,
      maxResults: 10_000,
    },
  ]);
});
