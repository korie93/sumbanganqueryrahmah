import assert from "node:assert/strict";
import test from "node:test";

import { assertCollectionPiiPostgresReady } from "./collection-pii-postgres";

test("assertCollectionPiiPostgresReady passes through successful preflight checks", async () => {
  let calledContext = "";

  await assertCollectionPiiPostgresReady(
    "Collection PII status",
    async (_env, options) => {
      calledContext = options?.context ?? "";
    },
  );

  assert.equal(calledContext, "Collection PII status");
});

test("assertCollectionPiiPostgresReady wraps Postgres auth failures with rollout guidance", async () => {
  await assert.rejects(
    () =>
      assertCollectionPiiPostgresReady(
        "Collection PII status",
        async () => {
          throw new Error("client password must be a string");
        },
      ),
    /client password must be a string.*DATABASE_URL or PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, and PG_DATABASE/i,
  );
});
