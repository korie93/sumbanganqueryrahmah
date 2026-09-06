import assert from "node:assert/strict";
import test from "node:test";
import { dropDrainedOspFixtureDatabase } from "./postgres-fixture-cleanup";

const databaseName = "sqr_osp_v9_1788660000000_012345abcd";

function fakeMaintenance(counts: unknown[]) {
  const calls: Array<{ statement: string; parameters?: string[] }> = [];
  let index = 0;
  return {
    calls,
    async query(statement: string, parameters?: string[]) {
      calls.push({ statement, ...(parameters === undefined ? {} : { parameters }) });
      if (statement.startsWith("DROP DATABASE")) return { rows: [] };
      return { rows: [{ count: counts[Math.min(index++, counts.length - 1)] }] };
    },
  };
}

test("OSP fixture cleanup drops an immediately drained generated database without terminating clients", async () => {
  for (const prefix of ["sqr_osp_v9", "sqr_osp_perf", "sqr_osp_effective", "sqr_osp_backup_v3", "sqr_osp_rollup"]) {
    const name = `${prefix}_1788660000000_012345abcd`;
    const maintenance = fakeMaintenance([0]);
    await dropDrainedOspFixtureDatabase(maintenance, name, async () => assert.fail("No delay is needed."));

    assert.equal(maintenance.calls.length, 2);
    assert.match(maintenance.calls[0].statement, /datname = \$1 AND backend_type = 'client backend'/);
    assert.deepEqual(maintenance.calls[0].parameters, [name]);
    assert.deepEqual(maintenance.calls[1], { statement: `DROP DATABASE "${name}"` });
    assert.equal(maintenance.calls.some(({ statement }) => /terminate|FORCE|IF EXISTS/.test(statement)), false);
  }
});

test("OSP fixture cleanup waits for closing pool backends before dropping the database", async () => {
  const maintenance = fakeMaintenance([3, 2, 1, 0]);
  const delays: number[] = [];
  await dropDrainedOspFixtureDatabase(maintenance, databaseName, async (milliseconds) => {
    assert.equal(maintenance.calls.some(({ statement }) => statement.startsWith("DROP")), false);
    delays.push(milliseconds);
  });

  assert.deepEqual(delays, [50, 100, 150]);
  assert.equal(maintenance.calls.length, 5);
  assert.equal(maintenance.calls[maintenance.calls.length - 1]?.statement, `DROP DATABASE "${databaseName}"`);
});

test("OSP fixture cleanup fails visibly if client backends never drain, without dropping or terminating", async () => {
  const maintenance = fakeMaintenance([1]);
  const delays: number[] = [];
  await assert.rejects(
    dropDrainedOspFixtureDatabase(maintenance, databaseName, async (milliseconds) => { delays.push(milliseconds); }),
    /still has client backends after bounded drainage/,
  );

  assert.equal(maintenance.calls.length, 10);
  assert.equal(delays.length, 9);
  assert.equal(delays.reduce((total, milliseconds) => total + milliseconds, 0), 2_250);
  assert.equal(maintenance.calls.some(({ statement }) => /DROP|terminate/.test(statement)), false);
});

test("OSP fixture cleanup propagates backend query errors without dropping the database", async () => {
  const failure = new Error("Cannot inspect PostgreSQL backends.");
  const statements: string[] = [];
  await assert.rejects(dropDrainedOspFixtureDatabase({
    async query(statement) { statements.push(statement); throw failure; },
  }, databaseName), (error) => error === failure);
  assert.equal(statements.length, 1);
  assert.doesNotMatch(statements[0], /DROP|terminate/);
});

test("OSP fixture cleanup propagates database drop errors without hiding them", async () => {
  const failure = new Error("Database drop was denied.");
  const statements: string[] = [];
  await assert.rejects(dropDrainedOspFixtureDatabase({
    async query(statement) {
      statements.push(statement);
      if (statement.startsWith("DROP")) throw failure;
      return { rows: [{ count: 0 }] };
    },
  }, databaseName), (error) => error === failure);
  assert.equal(statements.length, 2);
});

test("OSP fixture cleanup rejects missing or malformed backend counts", async () => {
  for (const count of [undefined, null, "0", -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const maintenance = fakeMaintenance([count]);
    await assert.rejects(dropDrainedOspFixtureDatabase(maintenance, databaseName), /invalid OSP fixture backend count/);
    assert.equal(maintenance.calls.length, 1);
  }
});

test("OSP fixture cleanup rejects broad, arbitrary, and injected database names before any query", async () => {
  for (const name of [
    "", "postgres", "sqr_db", "sqr_osp_v9", "sqr_osp_v9_1788660000000",
    "sqr_osp_v9_1788660000000_012345abc", "sqr_osp_v9_1788660000000_012345abcde",
    "sqr_osp_other_1788660000000_012345abcd", "sqr_osp_v9_notatimestamp_012345abcd",
    `${databaseName}\"; DROP DATABASE postgres; --`, `${databaseName} `, ` ${databaseName}`,
  ]) {
    const maintenance = fakeMaintenance([0]);
    await assert.rejects(dropDrainedOspFixtureDatabase(maintenance, name), /outside the generated OSP test fixtures/);
    assert.equal(maintenance.calls.length, 0);
  }
});
