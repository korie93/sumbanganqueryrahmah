import type { BackupPayloadChunkReader } from "./backups-restore-shared-utils";
import {
  isAsyncIterableSource,
  type BackupDatasetKey,
  type BackupPayloadChunkSource,
  type BackupPayloadSource,
  wrapSyncGeneratorAsAsync,
} from "./backups-payload-reader-shared";
import {
  iterateArrayChunksFromObjectSource,
  iterateArrayChunksFromStringSource,
  parseTopLevelBackupMemberRanges,
} from "./backups-payload-section-reader-helpers";
import { createSequentialAsyncBackupPayloadChunkReader } from "./backups-payload-stream-reader";

export function createBackupPayloadSectionReader(source: BackupPayloadSource) {
  if (typeof source !== "string") {
    return {
      getArray<T>(key: BackupDatasetKey): T[] {
        const value = source[key];
        return Array.isArray(value) ? (value as T[]) : [];
      },
      iterateArrayChunks<T>(key: BackupDatasetKey, chunkSize: number): AsyncGenerator<T[]> {
        return wrapSyncGeneratorAsAsync(
          iterateArrayChunksFromObjectSource<T>(source, key, chunkSize),
        );
      },
    };
  }

  const memberRanges = parseTopLevelBackupMemberRanges(source);

  return {
    getArray<T>(key: BackupDatasetKey): T[] {
      const range = memberRanges.get(key);
      if (!range) {
        return [];
      }
      const rawValue = source.slice(range.start, range.end);
      const parsed = JSON.parse(rawValue) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error(`Invalid backup payload dataset: ${key}`);
      }
      return parsed as T[];
    },
    iterateArrayChunks<T>(key: BackupDatasetKey, chunkSize: number): AsyncGenerator<T[]> {
      return wrapSyncGeneratorAsAsync(
        iterateArrayChunksFromStringSource<T>(source, memberRanges.get(key), chunkSize),
      );
    },
  };
}

export function createBackupPayloadChunkReader(source: BackupPayloadChunkSource): BackupPayloadChunkReader {
  if (isAsyncIterableSource(source)) {
    return createSequentialAsyncBackupPayloadChunkReader(source);
  }

  const reader = createBackupPayloadSectionReader(source);
  return {
    iterateArrayChunks<T>(key: BackupDatasetKey, chunkSize: number): AsyncGenerator<T[]> {
      return reader.iterateArrayChunks<T>(key, chunkSize);
    },
  };
}
