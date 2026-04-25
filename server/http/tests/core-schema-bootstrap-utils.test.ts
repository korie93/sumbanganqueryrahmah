import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureCorePerformanceTrigramIndexes,
  type CoreSchemaSqlExecutor,
} from "../../internal/core-schema-bootstrap-utils";

function collectSqlText(query: unknown): string {
  if (query && typeof query === "object" && "queryChunks" in query) {
    const chunks = (query as { queryChunks?: unknown[] }).queryChunks || [];
    return chunks
      .map((chunk) => {
        if (typeof chunk === "string") {
          return chunk;
        }
        if (chunk && typeof chunk === "object" && "value" in chunk) {
          return String((chunk as { value?: unknown }).value ?? "");
        }
        return String(chunk ?? "");
      })
      .join("");
  }

  return String(query ?? "");
}

test("core performance bootstrap creates lower-case trigram index for global JSON search", async () => {
  const statements: string[] = [];
  const database = {
    execute: async (query: unknown) => {
      statements.push(collectSqlText(query));
      return { rows: [] };
    },
  } as unknown as CoreSchemaSqlExecutor;

  await ensureCorePerformanceTrigramIndexes(database);

  assert.ok(
    statements.some((statement) =>
      /CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_data_rows_json_text_lower_trgm/i.test(statement)
      && /USING GIN \(lower\(json_data::text\) gin_trgm_ops\)/i.test(statement),
    ),
    "expected a lower(json_data::text) trigram index for case-insensitive global search",
  );
});
