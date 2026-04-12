import { type SQL } from "drizzle-orm";
import { db } from "../db-postgres";

export type BackupCursorRow = {
  id: string;
};

export type BackupPageFetcher<T extends BackupCursorRow> = (
  lastId: string | null,
) => Promise<T[]>;

export async function safeSelectBackupRows<T extends Record<string, unknown>>(
  query: SQL,
): Promise<T[]> {
  try {
    const result = await db.execute(query);
    return (Array.isArray(result.rows) ? result.rows : []) as T[];
  } catch (error) {
    const message = String((error as { message?: string })?.message || "");
    if (/relation\s+["']?[\w.]+["']?\s+does not exist/i.test(message)) {
      return [];
    }
    throw error;
  }
}

export async function selectBackupRows<T extends Record<string, unknown>>(
  query: SQL,
): Promise<T[]> {
  const result = await db.execute(query);
  return (Array.isArray(result.rows) ? result.rows : []) as T[];
}
