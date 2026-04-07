import pg from "pg";

const { Pool } = pg;

export function buildPostgresPreflightConfig(env = process.env) {
  const port = Number.parseInt(String(env.PG_PORT || "5432"), 10);

  return {
    database: String(env.PG_DATABASE || "").trim(),
    host: String(env.PG_HOST || "127.0.0.1").trim(),
    password: String(env.PG_PASSWORD || "").trim(),
    port: Number.isFinite(port) ? port : 5432,
    user: String(env.PG_USER || "").trim(),
  };
}

export async function assertPostgresConnection(
  env = process.env,
  {
    connectionTimeoutMillis = 5_000,
    context = "Local verification",
    PoolImpl = Pool,
  } = {},
) {
  const config = buildPostgresPreflightConfig(env);

  if (!config.user || !config.database) {
    throw new Error(`${context} requires PG_USER and PG_DATABASE to be set before starting the server.`);
  }

  const pool = new PoolImpl({
    ...config,
    connectionTimeoutMillis,
    max: 1,
  });

  try {
    await pool.query("SELECT 1");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${context} requires PostgreSQL to be reachable at ${config.host}:${config.port}/${config.database} `
      + `for user "${config.user}". Check PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, and PG_DATABASE. `
      + `Connection failed: ${message}`,
    );
  } finally {
    await pool.end().catch(() => {});
  }
}
