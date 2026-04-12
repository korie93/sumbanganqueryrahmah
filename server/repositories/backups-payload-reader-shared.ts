import type { BackupDataPayload } from "./backups-repository-types";

export type BackupDatasetKey = keyof BackupDataPayload;
export type BackupPayloadSource = BackupDataPayload | string;
export type BackupPayloadChunkSource = BackupPayloadSource | AsyncIterable<string>;

export function isAsyncIterableSource(value: unknown): value is AsyncIterable<string> {
  return typeof value === "object"
    && value !== null
    && Symbol.asyncIterator in value
    && typeof (value as AsyncIterable<string>)[Symbol.asyncIterator] === "function";
}

export function wrapSyncGeneratorAsAsync<T>(generator: Generator<T[]>): AsyncGenerator<T[]> {
  return (async function* () {
    for (const chunk of generator) {
      yield chunk;
    }
  })();
}
