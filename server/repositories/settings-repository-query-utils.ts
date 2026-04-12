import { sql } from "drizzle-orm";

export function buildTextInList(values: string[]) {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

export function queryRows<T extends Record<string, unknown>>(result: { rows?: unknown[] }): T[] {
  return Array.isArray(result.rows) ? (result.rows as T[]) : [];
}

export function firstQueryRow<T extends Record<string, unknown>>(
  result: { rows?: unknown[] },
): T | undefined {
  return queryRows<T>(result)[0];
}

export function buildSettingsValueMap(result: { rows?: unknown[] }): Map<string, string> {
  const values = new Map<string, string>();
  for (const row of queryRows<{ key?: unknown; value?: unknown }>(result)) {
    values.set(String(row.key), String(row.value ?? ""));
  }
  return values;
}
