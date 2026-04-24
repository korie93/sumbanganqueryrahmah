import assert from "node:assert/strict";
import test from "node:test";
import type { SQLWrapper } from "drizzle-orm";
import { BackupsBootstrap } from "../../internal/backupsBootstrap";
import { db } from "../../db-postgres";
import { logger } from "../../lib/logger";

test("BackupsBootstrap rethrows bootstrap failures and remains retryable", async (t) => {
  const bootstrap = new BackupsBootstrap();
  const failure = new Error("boom");
  let shouldFail = true;
  let executeCalls = 0;
  let infoCalls = 0;
  let errorCalls = 0;

  t.mock.method(db, "execute", async (_query: SQLWrapper) => {
    executeCalls += 1;
    if (shouldFail) {
      throw failure;
    }

    return { rows: [] } as unknown as Awaited<ReturnType<typeof db.execute>>;
  });
  t.mock.method(logger, "info", () => {
    infoCalls += 1;
  });
  t.mock.method(logger, "error", () => {
    errorCalls += 1;
  });

  await assert.rejects(() => bootstrap.ensureTable(), failure);
  const executeCallsAfterFailure = executeCalls;

  shouldFail = false;
  await bootstrap.ensureTable();
  const executeCallsAfterSuccess = executeCalls;
  await bootstrap.ensureTable();

  assert.equal(errorCalls, 1);
  assert.equal(infoCalls, 1);
  assert.ok(executeCallsAfterFailure >= 1);
  assert.ok(executeCallsAfterSuccess > executeCallsAfterFailure);
  assert.equal(executeCalls, executeCallsAfterSuccess);
});
