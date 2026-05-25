import { parseAndValidatePgSearchPath } from "./config/db-search-path";

export type PgRuntimePoolOptionsConfig = {
  searchPath: string;
  statementTimeoutMs: number;
};

export function buildPgRuntimePoolOptions(config: PgRuntimePoolOptionsConfig): string {
  const searchPath = parseAndValidatePgSearchPath(config.searchPath).join(",");
  const statementTimeoutMs = Math.trunc(config.statementTimeoutMs);

  if (!Number.isSafeInteger(statementTimeoutMs) || statementTimeoutMs < 1_000) {
    throw new Error("PG_STATEMENT_TIMEOUT_MS must be a safe integer of at least 1000.");
  }

  return `-c search_path=${searchPath} -c statement_timeout=${statementTimeoutMs}`;
}
