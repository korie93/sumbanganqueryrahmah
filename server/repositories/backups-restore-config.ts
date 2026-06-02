import { BACKUP_CHUNK_SIZE } from "./backups-repository-types";
import { readOptionalString } from "../config/runtime-config-read-utils";

export const RESTORE_CHUNK_SIZE_ENV = "RESTORE_CHUNK_SIZE";
export const MIN_RESTORE_CHUNK_SIZE = 1;
export const MAX_RESTORE_CHUNK_SIZE = 5_000;
export const DEFAULT_RESTORE_CHUNK_SIZE = BACKUP_CHUNK_SIZE;

type RestoreChunkSizeEnv = {
  readonly RESTORE_CHUNK_SIZE?: string | undefined;
};

function readRuntimeRestoreChunkSizeEnv(): RestoreChunkSizeEnv {
  return {
    RESTORE_CHUNK_SIZE: readOptionalString(RESTORE_CHUNK_SIZE_ENV) ?? undefined,
  };
}

export function resolveRestoreChunkSize(
  env: RestoreChunkSizeEnv = readRuntimeRestoreChunkSizeEnv(),
): number {
  const rawValue = env.RESTORE_CHUNK_SIZE?.trim();
  if (!rawValue) {
    return DEFAULT_RESTORE_CHUNK_SIZE;
  }

  if (!/^\d+$/.test(rawValue)) {
    return DEFAULT_RESTORE_CHUNK_SIZE;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (
    !Number.isSafeInteger(parsed)
    || parsed < MIN_RESTORE_CHUNK_SIZE
    || parsed > MAX_RESTORE_CHUNK_SIZE
  ) {
    return DEFAULT_RESTORE_CHUNK_SIZE;
  }

  return parsed;
}
