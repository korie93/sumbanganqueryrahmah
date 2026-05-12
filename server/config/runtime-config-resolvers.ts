import os from "node:os";

export type ParsedDatabaseUrl = {
  database: string;
  host: string;
  password: string;
  port: number;
  user: string;
};

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

export function resolveDatabaseBootstrapMode(value: string | null): "runtime" | "migration" {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "runtime" || normalized === "migration") {
    return normalized;
  }

  return "runtime";
}
