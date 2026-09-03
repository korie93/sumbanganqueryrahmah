import { type SQL } from "drizzle-orm";
import { db } from "../db-postgres";

export type BackupCursorRow = {
  id: string;
};

export type BackupCompositeCursorRow = {
  backupCursor: string;
};

export type BackupQueryExecutor = Pick<typeof db, "execute">;

type BackupSavepointExecutor = BackupQueryExecutor & {
  transaction: <T>(callback: (tx: BackupQueryExecutor) => Promise<T>) => Promise<T>;
};

export type BackupPageFetcher<T extends BackupCursorRow | BackupCompositeCursorRow> = (
  lastId: string | null,
) => Promise<T[]>;

export async function safeSelectBackupRows<T extends Record<string, unknown>>(
  query: SQL,
  executor: BackupQueryExecutor = db,
): Promise<T[]> {
  try {
    const nestedTransaction = (executor as Partial<BackupSavepointExecutor>).transaction;
    const result = (executor !== db && typeof nestedTransaction === "function"
      ? await nestedTransaction.call(executor, (savepoint) => savepoint.execute(query))
      : await executor.execute(query)) as { rows?: unknown[] };
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
  executor: BackupQueryExecutor = db,
): Promise<T[]> {
  const result = await executor.execute(query);
  return (Array.isArray(result.rows) ? result.rows : []) as T[];
}
