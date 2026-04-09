import assert from "node:assert/strict";
import test from "node:test";
import { buildProtectedCollectionPiiSelect } from "../collection-pii-select-utils";

function flattenSqlChunk(chunk: unknown): string {
  if (chunk === null || chunk === undefined) {
    return "";
  }
  if (typeof chunk === "string") {
    return chunk;
  }
  if (Array.isArray(chunk)) {
    return chunk.map((item) => flattenSqlChunk(item)).join("");
  }
  if (typeof chunk === "object") {
    const value = (chunk as { value?: unknown; queryChunks?: unknown[] }).value;
    if (value !== undefined) {
      return flattenSqlChunk(value);
    }
    const queryChunks = (chunk as { queryChunks?: unknown[] }).queryChunks;
    if (Array.isArray(queryChunks)) {
      return queryChunks.map((item) => flattenSqlChunk(item)).join("");
    }
  }
  return "";
}

test("buildProtectedCollectionPiiSelect omits plaintext when encrypted shadows exist", () => {
  const sqlText = flattenSqlChunk(
    buildProtectedCollectionPiiSelect("customer_name", "customer_name_encrypted", "customerName"),
  ).replace(/\s+/g, " ").trim();

  assert.match(
    sqlText,
    /CASE WHEN NULLIF\(trim\(COALESCE\(customer_name_encrypted, ''\)\), ''\) IS NOT NULL THEN NULL ELSE NULLIF\(trim\(COALESCE\(customer_name, ''\)\), ''\) END AS "customerName"/,
  );
});

test("buildProtectedCollectionPiiSelect emits NULL aliases for retired plaintext fields", () => {
  const previous = process.env.COLLECTION_PII_RETIRED_FIELDS;
  process.env.COLLECTION_PII_RETIRED_FIELDS = "customerName";

  try {
    const sqlText = flattenSqlChunk(
      buildProtectedCollectionPiiSelect(
        "customer_name",
        "customer_name_encrypted",
        "customerName",
        "customerName",
      ),
    ).replace(/\s+/g, " ").trim();

    assert.equal(sqlText, 'NULL AS "customerName"');
  } finally {
    if (previous === undefined) {
      delete process.env.COLLECTION_PII_RETIRED_FIELDS;
    } else {
      process.env.COLLECTION_PII_RETIRED_FIELDS = previous;
    }
  }
});
