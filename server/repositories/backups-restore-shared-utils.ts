import type { BackupDataPayload } from "./backups-repository-types";
import type { db } from "../db-postgres";

type BackupRestoreExecute = (typeof db)["execute"];

export type BackupPayloadReader = {
  getArray<T>(key: keyof BackupDataPayload): T[];
  iterateArrayChunks<T>(key: keyof BackupDataPayload, chunkSize: number): AsyncGenerator<T[]>;
};

export type BackupPayloadChunkReader = Pick<BackupPayloadReader, "iterateArrayChunks">;

export type BackupRestoreExecutor = {
  execute: BackupRestoreExecute;
  insert: (table: unknown) => {
    values: (rows: unknown) => {
      onConflictDoNothing: () => {
        returning: (fields?: unknown) => Promise<Array<Record<string, unknown>>>;
      };
    };
  };
};

export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(typeof value === "string" || typeof value === "number" ? value : String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function chunkArray<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}
