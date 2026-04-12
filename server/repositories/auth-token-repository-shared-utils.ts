import { sql } from "drizzle-orm";

export function asUtcTimestamp(columnSql: ReturnType<typeof sql>) {
  return sql`${columnSql}`;
}

export function normalizeAuthTokenHash(tokenHash: string): string {
  return String(tokenHash || "").trim();
}

export function resolveAuthTokenConsumptionState<TId extends string>(
  idRaw: TId,
  now?: Date,
): { id: string; now: Date; nowIso: string } | null {
  const id = String(idRaw || "").trim();
  if (!id) {
    return null;
  }

  const resolvedNow = now ?? new Date();
  return {
    id,
    now: resolvedNow,
    nowIso: resolvedNow.toISOString(),
  };
}
