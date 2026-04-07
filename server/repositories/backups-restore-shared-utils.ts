import type { BackupDataPayload } from "./backups-repository-types";

export type BackupPayloadReader = {
  getArray<T>(key: keyof BackupDataPayload): T[];
  iterateArrayChunks<T>(key: keyof BackupDataPayload, chunkSize: number): Generator<T[]>;
};

export type BackupRestoreExecutor = {
  execute: (query: unknown) => Promise<{ rows?: Array<Record<string, unknown>> }>;
  insert: (...args: any[]) => any;
};

export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value as any);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function chunkArray<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}
