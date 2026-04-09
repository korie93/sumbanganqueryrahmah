import { assertPostgresConnection } from "./lib/postgres-preflight.mjs";

type AssertPostgresConnectionFn = typeof assertPostgresConnection;

export async function assertCollectionPiiPostgresReady(
  context: string,
  assertConnection: AssertPostgresConnectionFn = assertPostgresConnection,
) {
  try {
    await assertConnection(process.env, { context });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${message} Collection PII rollout commands read and update live PostgreSQL rows, `
      + "so confirm DATABASE_URL or PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, and PG_DATABASE before retrying.",
    );
  }
}
