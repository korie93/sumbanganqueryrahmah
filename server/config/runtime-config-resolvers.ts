import os from "node:os";

export type ParsedDatabaseUrl = {
  database: string;
  host: string;
  password: string;
  port: number;
  user: string;
};

export type ResolvedPostgresRuntimeCredentials = {
  connectionString: string | null;
  database: string;
  host: string;
  isProductionLike: boolean;
  password: string;
  user: string;
};

const POSTGRES_CREDENTIAL_MAX_LENGTH = 255;
const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

function containsWhitespaceOrControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x20 || codePoint === 0x7F || /\s/.test(character)) {
      return true;
    }
  }
  return false;
}

function assertPostgresCredentialField(name: string, value: string): void {
  if (!value) {
    throw new Error(`${name} is required before PostgreSQL startup.`);
  }

  if (value.length > POSTGRES_CREDENTIAL_MAX_LENGTH) {
    throw new Error(`${name} must be ${POSTGRES_CREDENTIAL_MAX_LENGTH} characters or fewer.`);
  }

  if (containsWhitespaceOrControlCharacter(value)) {
    throw new Error(`${name} must not contain whitespace or control characters.`);
  }
}

function assertPostgresHostField(value: string): void {
  assertPostgresCredentialField("PG_HOST", value);
  if (URL_SCHEME_PATTERN.test(value)) {
    throw new Error("PG_HOST must be a hostname, IP address, or Unix socket path, not a connection URL.");
  }
}

export function parseDatabaseUrl(rawValue: string | null): ParsedDatabaseUrl | null {
  if (!rawValue) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(rawValue);
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

export function assertPostgresRuntimeCredentialFormat(
  credentials: ResolvedPostgresRuntimeCredentials,
): void {
  assertPostgresHostField(credentials.host);
  assertPostgresCredentialField("PG_USER", credentials.user);
  assertPostgresCredentialField("PG_DATABASE", credentials.database);

  const parsedConnectionString = parseDatabaseUrl(credentials.connectionString);
  if (!parsedConnectionString) {
    if (credentials.isProductionLike && !credentials.password) {
      throw new Error("PG_PASSWORD is required on production-like hosts when DATABASE_URL is not used.");
    }
    return;
  }

  if (!parsedConnectionString.host) {
    throw new Error("DATABASE_URL must include a PostgreSQL host.");
  }
  if (!parsedConnectionString.user) {
    throw new Error("DATABASE_URL must include a PostgreSQL username.");
  }
  if (!parsedConnectionString.database) {
    throw new Error("DATABASE_URL must include a PostgreSQL database name.");
  }
  if (credentials.isProductionLike && !parsedConnectionString.password) {
    throw new Error(
      "DATABASE_URL must include a password on production-like hosts; PG_PASSWORD is ignored when DATABASE_URL is passed to the PostgreSQL pool.",
    );
  }
}

export function resolveDefaultPgMaxConnections() {
  const cpuCount = typeof os.availableParallelism === "function"
    ? os.availableParallelism()
    : os.cpus().length;
  const normalizedCpuCount = Math.max(1, Number.isFinite(cpuCount) ? Math.trunc(cpuCount) : 1);
  return Math.min(50, Math.max(10, normalizedCpuCount * 2));
}

export function resolveCookieSameSite(value: string | null): "strict" | "lax" {
  if (!value) {
    return "strict";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "strict" || normalized === "lax") {
    return normalized;
  }

  throw new Error("SESSION_COOKIE_SAMESITE must be one of: strict or lax.");
}

export function resolveDatabaseBootstrapMode(
  value: string | null,
  options: { isProductionLike?: boolean } = {},
): "runtime" | "migration" {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "runtime" || normalized === "migration") {
    return normalized;
  }

  return options.isProductionLike ? "migration" : "runtime";
}

export function resolveTwoFactorTotpAlgorithm(value: string | null): "sha1" | "sha256" {
  return String(value || "").trim().toUpperCase() === "SHA1" ? "sha1" : "sha256";
}
