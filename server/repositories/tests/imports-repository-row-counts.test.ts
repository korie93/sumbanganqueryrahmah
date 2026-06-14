import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const IMPORTS_REPOSITORY_PATH = path.resolve(import.meta.dirname, "..", "imports.repository.ts");

test("imports row-count query uses parameter-safe IN predicates instead of raw ANY array casts", () => {
  const source = readFileSync(IMPORTS_REPOSITORY_PATH, "utf8");

  assert.match(
    source,
    /where\(inArray\(dataRows\.importId,\s*importIds\)\)/,
    "row-count lookup should use Drizzle inArray so import IDs are parameterized as an IN list",
  );
  assert.doesNotMatch(
    source,
    /ANY\(\$\{importIds\}::text\[\]\)/,
    "raw ANY(${importIds}::text[]) is invalid because Drizzle expands arrays into a record tuple",
  );
});

test("imports list query serializes bigint source sizes as JavaScript numbers", () => {
  const source = readFileSync(IMPORTS_REPOSITORY_PATH, "utf8");

  assert.match(
    source,
    /i\.source_size_bytes::double precision as "sourceSizeBytes"/,
    "raw PostgreSQL bigint values must be cast because node-postgres returns int8 columns as strings",
  );
});

test("imports list exposes paginated saved-file detail metadata", () => {
  const source = readFileSync(IMPORTS_REPOSITORY_PATH, "utf8");

  assert.match(source, /i\.last_opened_at as "lastOpenedAt"/);
  assert.match(source, /buildImportDuplicateSql\("i"\)\} as "isDuplicate"/);
  assert.match(source, /listImportsWithRowCountsOffsetPage/);
  assert.match(source, /buildLikePattern\(createdBy, "contains"\)/);
});
