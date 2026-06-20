import { safeJsonParse } from "../lib/safe-json";

const BACKUP_JSON_PARSE_LIMITS = {
  maxArrayLength: 100_000,
  maxDepth: 40,
  maxObjectKeys: 5_000,
  maxRawBytes: 50 * 1024 * 1024,
  maxStringLength: 2 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
} as const;

export function parseBackupJsonValue<T>(raw: string, context: string): T {
  const parseResult = safeJsonParse<T>(raw, context, {
    ...BACKUP_JSON_PARSE_LIMITS,
    logFailures: false,
  });
  if (!parseResult.success) {
    throw new Error("Invalid backup payload format.");
  }

  return parseResult.data;
}
