import assert from "node:assert/strict";
import test from "node:test";
import {
  findMissingRuntimeSchemaTables,
  RUNTIME_REQUIRED_SCHEMA_TABLES,
  verifyRuntimeSchemaReady,
} from "../../internal/runtime-schema-verification";

function createSchemaExecutor(existingTables: readonly string[]) {
  return {
    async execute() {
      return {
        rows: existingTables.map((table_name) => ({ table_name })),
      };
    },
  };
}

test("findMissingRuntimeSchemaTables reports only missing required public tables", async () => {
  const missing = await findMissingRuntimeSchemaTables(
    createSchemaExecutor(["users", "imports"]),
    ["users", "imports", "data_rows"],
  );

  assert.deepEqual(missing, ["data_rows"]);
});

test("verifyRuntimeSchemaReady fails fast with migration guidance instead of running runtime DDL", async () => {
  await assert.rejects(
    () => verifyRuntimeSchemaReady(createSchemaExecutor(["users"])),
    /Database schema is not migration-ready.*Run npm run db:migrate/i,
  );
});

test("verifyRuntimeSchemaReady accepts a fully migrated table set", async () => {
  await assert.doesNotReject(() =>
    verifyRuntimeSchemaReady(createSchemaExecutor(RUNTIME_REQUIRED_SCHEMA_TABLES)),
  );
});

test("verifyRuntimeSchemaReady can verify a focused runtime table subset", async () => {
  await assert.doesNotReject(() =>
    verifyRuntimeSchemaReady(createSchemaExecutor(["backups"]), ["backups"]),
  );
});
