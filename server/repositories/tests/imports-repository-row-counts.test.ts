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
