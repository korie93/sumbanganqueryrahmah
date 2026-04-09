import pg from "pg";

const { Pool } = pg;

function parseDatabaseUrl(rawValue) {
  const normalized = String(rawValue || "").trim();
  if (!normalized) {
    return null;
  }

  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must start with postgres:// or postgresql://.");
  }

  const pathname = url.pathname.replace(/^\/+/, "");
  const port = Number.parseInt(url.port || "5432", 10);

  return {
    database: decodeURIComponent(pathname),
    host: url.hostname,
    password: decodeURIComponent(url.password || ""),
    port: Number.isFinite(port) ? port : 5432,
    user: decodeURIComponent(url.username || ""),
  };
}

export function buildPostgresPreflightConfig(env = process.env) {
  const databaseUrl = String(env.DATABASE_URL || "").trim();
  const parsedDatabaseUrl = parseDatabaseUrl(databaseUrl);
  const explicitPortValue = String(env.PG_PORT || "").trim();
  const explicitPort = explicitPortValue
    ? Number.parseInt(explicitPortValue, 10)
    : Number.NaN;

  return {
    connectionString: databaseUrl || null,
    database: String(env.PG_DATABASE || "").trim() || parsedDatabaseUrl?.database || "",
    host: String(env.PG_HOST || "").trim() || parsedDatabaseUrl?.host || "127.0.0.1",
    password: String(env.PG_PASSWORD || "").trim() || parsedDatabaseUrl?.password || "",
    port: Number.isFinite(explicitPort) ? explicitPort : (parsedDatabaseUrl?.port || 5432),
    user: String(env.PG_USER || "").trim() || parsedDatabaseUrl?.user || "",
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
    throw new Error(
      `${context} requires PG_USER and PG_DATABASE to be set, or a DATABASE_URL, before starting the server.`,
    );
  }

  const poolConfig = config.connectionString
    ? {
        connectionString: config.connectionString,
        connectionTimeoutMillis,
        max: 1,
      }
    : {
        database: config.database,
        host: config.host,
        password: config.password,
        port: config.port,
        user: config.user,
        connectionTimeoutMillis,
        max: 1,
      };

  const pool = new PoolImpl(poolConfig);

  try {
    await pool.query("SELECT 1");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${context} requires PostgreSQL to be reachable at ${config.host}:${config.port}/${config.database} `
      + `for user "${config.user}". Check DATABASE_URL or PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, and PG_DATABASE. `
      + `Connection failed: ${message}`,
    );
  } finally {
    await pool.end().catch(() => {});
  }
}
