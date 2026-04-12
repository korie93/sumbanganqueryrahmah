import { sql } from "drizzle-orm";

const DATABASE_NOW_DRIFT_TOLERANCE_MS = 30_000;

export function createCurrentTimestampSql() {
  return sql`CURRENT_TIMESTAMP`;
}

export function shouldUseDatabaseCurrentTimestamp(
  value: Date | string | number | null | undefined,
  referenceNowMs: number = Date.now(),
): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  const timestamp =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return Math.abs(timestamp - referenceNowMs) <= DATABASE_NOW_DRIFT_TOLERANCE_MS;
}
