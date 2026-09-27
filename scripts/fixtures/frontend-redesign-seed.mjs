import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

// This supplements, never alters, the shared card-number fixture. No application
// imports or dotenv bootstrap are needed for one synthetic nickname.
export function validateRedesignSeedEnvironment(env, tempParent = os.tmpdir()) {
  assert.equal(env.SQR_REDESIGN_ISOLATED_CLUSTER, "1");
  assert.equal(env.PG_HOST, "127.0.0.1");
  assert.equal(env.PG_DATABASE, "sqr_collection_card_test");
  assert.equal(env.PG_USER, "sqr_fixture");
  assert.equal(env.DATABASE_URL, undefined);
  assert.match(env.PG_PORT || "", /^\d+$/);
  assert.ok(Number(env.PG_PORT) > 0 && Number(env.PG_PORT) <= 65535);
  assert.match(env.SEED_SUPERUSER_USERNAME || "", /^collectioncardfixture[a-f0-9]{12}$/);
  const dataDir = env.SQR_REDESIGN_DATA_DIR;
  assert.ok(dataDir && path.isAbsolute(dataDir));
  assert.equal(path.basename(dataDir), "postgres");
  const fixtureRoot = path.dirname(dataDir);
  assert.equal(path.dirname(fixtureRoot), path.resolve(tempParent));
  assert.match(path.basename(fixtureRoot), /^sqr-collection-card-no-[a-zA-Z0-9]+$/);
  return { dataDir, fixtureRoot };
}

async function main() {
  const tempParent = await realpath(os.tmpdir());
  const { dataDir, fixtureRoot } = validateRedesignSeedEnvironment(process.env, tempParent);
  for (const directory of [fixtureRoot, dataDir]) {
    const state = await lstat(directory);
    assert.equal(state.isSymbolicLink(), false);
    assert.equal(state.isDirectory(), true);
    assert.equal(await realpath(directory), path.resolve(directory));
  }
  const connection = new pg.Client({
    host: "127.0.0.1", port: Number(process.env.PG_PORT), user: "sqr_fixture",
    password: process.env.PG_PASSWORD, database: "sqr_collection_card_test",
    ssl: false, connectionTimeoutMillis: 3_000,
  });
  let transactionStarted = false;
  try {
    await connection.connect();
    const state = await connection.query("SHOW data_directory");
    assert.equal(await realpath(state.rows[0].data_directory), await realpath(dataDir));
    const identity = await connection.query("SELECT current_database() AS database, current_user AS username");
    assert.deepEqual(identity.rows[0], { database: "sqr_collection_card_test", username: "sqr_fixture" });
    const owner = process.env.SEED_SUPERUSER_USERNAME;
    const account = await connection.query("SELECT role FROM users WHERE username=$1", [owner]);
    assert.equal(account.rows.length, 1);
    assert.equal(account.rows[0].role, "superuser");
    const records = await connection.query("SELECT count(*)::int AS count FROM collection_records WHERE created_by_login=$1 AND collection_staff_nickname='Fixture Collector'", [owner]);
    assert.equal(records.rows[0].count, 59);
    const nicknames = await connection.query("SELECT count(*)::int AS count FROM collection_staff_nicknames");
    assert.equal(nicknames.rows[0].count, 0, "Supplement requires a fresh, unseeded nickname table");
    await connection.query("BEGIN");
    transactionStarted = true;
    await connection.query("INSERT INTO collection_staff_nicknames(id,nickname,is_active,role_scope,created_by) VALUES($1,'Fixture Collector',true,'both',$2)", [randomUUID(), owner]);
    await connection.query("COMMIT");
    transactionStarted = false;
    console.log("Added one synthetic active Collection nickname in the verified fresh redesign fixture.");
  } finally {
    try { if (transactionStarted) await connection.query("ROLLBACK"); }
    finally { await connection.end(); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error("Supplemental redesign fixture rejected or failed; sensitive details suppressed.");
    process.exitCode = 1;
  });
}
