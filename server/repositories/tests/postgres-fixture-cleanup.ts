import { setTimeout as delay } from "node:timers/promises";

type FixtureMaintenanceDatabase = {
  query: (statement: string, parameters?: string[]) => Promise<{ rows: Array<{ count?: unknown }> }>;
};

const GENERATED_FIXTURE_DATABASE = /^sqr_osp_(?:v9|perf|effective|backup_v3)_\d+_[a-f0-9]{10}$/;
const DRAIN_ATTEMPTS = 10;
const DRAIN_DELAY_MS = 50;

// pg-pool can resolve end() before the underlying client sockets finish closing.
// Let those connections drain naturally: terminating them here races their idle
// error listeners and can fail a test whose assertions already completed.
export async function dropDrainedOspFixtureDatabase(
  maintenance: FixtureMaintenanceDatabase,
  databaseName: string,
  wait: (milliseconds: number) => Promise<void> = delay,
): Promise<void> {
  if (!GENERATED_FIXTURE_DATABASE.test(databaseName)) {
    throw new Error("Refusing to clean up a database outside the generated OSP test fixtures.");
  }

  for (let attempt = 0; attempt < DRAIN_ATTEMPTS; attempt += 1) {
    const result = await maintenance.query(
      `SELECT COUNT(*)::int AS count FROM pg_stat_activity
        WHERE datname = $1 AND backend_type = 'client backend'`,
      [databaseName],
    );
    const remaining = result.rows[0]?.count;
    if (typeof remaining !== "number" || !Number.isSafeInteger(remaining) || remaining < 0) {
      throw new Error("PostgreSQL returned an invalid OSP fixture backend count.");
    }
    if (remaining === 0) {
      await maintenance.query(`DROP DATABASE "${databaseName}"`);
      return;
    }
    if (attempt + 1 < DRAIN_ATTEMPTS) {
      await wait(DRAIN_DELAY_MS * (attempt + 1));
    }
  }

  throw new Error(`OSP fixture database ${databaseName} still has client backends after bounded drainage; refusing to terminate sessions or drop it.`);
}
