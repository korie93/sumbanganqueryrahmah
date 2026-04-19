import assert from "node:assert/strict";
import test from "node:test";
import { buildPgPoolConfig, stopPgPoolBackgroundTasks } from "./db-postgres";
import { runtimeConfig } from "./config/runtime";

test.after(() => {
  stopPgPoolBackgroundTasks();
});

test("buildPgPoolConfig keeps search_path and statement_timeout explicit in pg connection options", () => {
  const config = buildPgPoolConfig({
    ...runtimeConfig.database,
    searchPath: "public",
    statementTimeoutMs: 47_000,
  });

  assert.match(String(config.options || ""), /-c search_path=public\b/);
  assert.match(String(config.options || ""), /-c statement_timeout=47000\b/);
  assert.equal(config.statement_timeout, 47_000);
});
