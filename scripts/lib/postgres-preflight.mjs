import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

function readOptionalEnvString(env, name) {
  return String(env[name] || "").trim();
}

function isLoopbackHostname(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

function resolvePublicAppHost(env) {
  const publicBaseUrl =
    readOptionalEnvString(env, "PUBLIC_APP_URL")
    || readOptionalEnvString(env, "APP_BASE_URL")
    || readOptionalEnvString(env, "CLIENT_APP_URL");
  if (!publicBaseUrl) {
    return null;
  }

  try {
    return new URL(publicBaseUrl).hostname || null;
  } catch {
    return null;
  }
}

function isStrictLocalDevelopmentEnvironment(env) {
  if (String(env.NODE_ENV || "development").trim().toLowerCase() !== "development") {
    return false;
  }

  const host = readOptionalEnvString(env, "HOST");
  if (host && !isLoopbackHostname(host)) {
    return false;
  }

  const publicAppHost = resolvePublicAppHost(env);
  if (!publicAppHost) {
    return true;
  }

  return isLoopbackHostname(publicAppHost);
}

function isProductionLikeEnvironment(env) {
  const nodeEnv = String(env.NODE_ENV || "development").trim().toLowerCase();
  if (nodeEnv === "test") {
    return false;
  }
  if (nodeEnv === "production" || (nodeEnv && nodeEnv !== "development")) {
    return true;
  }
  return !isStrictLocalDevelopmentEnvironment(env);
}

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
  const explicitPortValue = String(env.PG_PORT || env.PGPORT || "").trim();
  const explicitPort = explicitPortValue
    ? Number.parseInt(explicitPortValue, 10)
    : Number.NaN;

  return {
    connectionString: databaseUrl || null,
    database: String(env.PG_DATABASE || env.PGDATABASE || "").trim() || parsedDatabaseUrl?.database || "",
    host: String(env.PG_HOST || env.PGHOST || "").trim() || parsedDatabaseUrl?.host || "127.0.0.1",
    password: String(env.PG_PASSWORD || env.PGPASSWORD || "").trim() || parsedDatabaseUrl?.password || "",
    port: Number.isFinite(explicitPort) ? explicitPort : (parsedDatabaseUrl?.port || 5432),
    user: String(env.PG_USER || env.PGUSER || "").trim() || parsedDatabaseUrl?.user || "",
  };
}

function resolvePostgresSslConfig(env = process.env) {
  const rawSslFlag = readOptionalEnvString(env, "DATABASE_SSL").toLowerCase();
  const productionLike = isProductionLikeEnvironment(env);

  if (!rawSslFlag && !productionLike) {
    return {};
  }

  if (FALSE_VALUES.has(rawSslFlag)) {
    if (productionLike) {
      throw new Error("DATABASE_SSL=false is not allowed on production-like hosts.");
    }

    return {};
  }

  if (rawSslFlag && !TRUE_VALUES.has(rawSslFlag)) {
    throw new Error("DATABASE_SSL must be a boolean flag (1/0, true/false, yes/no, on/off).");
  }

  const ssl = { rejectUnauthorized: true };
  const inlineCa = readOptionalEnvString(env, "DATABASE_SSL_CA");
  if (inlineCa) {
    return { ssl: { ...ssl, ca: inlineCa } };
  }

  const caFile = readOptionalEnvString(env, "DATABASE_SSL_CA_FILE");
  if (!caFile) {
    return { ssl };
  }

  const resolvedCaFile = path.resolve(process.cwd(), caFile);
  const ca = fs.readFileSync(resolvedCaFile, "utf8").trim();
  if (!ca) {
    throw new Error("DATABASE_SSL_CA_FILE could not be read as a non-empty PEM certificate.");
  }

  return { ssl: { ...ssl, ca } };
}

function resolvePgSearchPathOption(env = process.env) {
  const searchPath = readOptionalEnvString(env, "PG_SEARCH_PATH") || "public";
  if (!/^[A-Za-z_][A-Za-z0-9_]*(,[A-Za-z_][A-Za-z0-9_]*)*$/.test(searchPath)) {
    throw new Error("PG_SEARCH_PATH must be a comma-separated list of PostgreSQL identifiers.");
  }

  return `-c search_path=${searchPath}`;
}

export function buildPostgresPoolConfig(
  env = process.env,
  {
    connectionTimeoutMillis = 5_000,
    max = 1,
  } = {},
) {
  const config = buildPostgresPreflightConfig(env);
  const commonConfig = {
    connectionTimeoutMillis,
    max,
    options: resolvePgSearchPathOption(env),
    ...resolvePostgresSslConfig(env),
  };

  return config.connectionString
    ? {
        connectionString: config.connectionString,
        ...commonConfig,
      }
    : {
        database: config.database,
        host: config.host,
        password: config.password,
        port: config.port,
        user: config.user,
        ...commonConfig,
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

  const poolConfig = buildPostgresPoolConfig(env, {
    connectionTimeoutMillis,
    max: 1,
  });

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
    await pool.end().catch((cleanupError) => {
      const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      console.warn(`${context} PostgreSQL preflight cleanup failed: ${message}`);
    });
  }
}
