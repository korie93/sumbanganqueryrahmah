export const SQR_MIGRATION_ADVISORY_LOCK_KEYS = Object.freeze([
  0x535152,
  0x4d494752,
]);

export function buildPostgresMigrationAdvisoryLockQueries() {
  return {
    lock: "SELECT pg_advisory_lock($1, $2)",
    unlock: "SELECT pg_advisory_unlock($1, $2)",
    values: [...SQR_MIGRATION_ADVISORY_LOCK_KEYS],
  };
}

export async function withPostgresMigrationAdvisoryLock(pool, task, options = {}) {
  const log = options.log ?? console.log;
  const queries = buildPostgresMigrationAdvisoryLockQueries();
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    log("Acquiring SQR migration advisory lock...");
    await client.query(queries.lock, queries.values);
    lockAcquired = true;

    return await task();
  } finally {
    try {
      if (lockAcquired) {
        await client.query(queries.unlock, queries.values);
        log("Released SQR migration advisory lock.");
      }
    } finally {
      client.release();
    }
  }
}
