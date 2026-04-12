import path from "node:path";

export const DEFAULT_COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS = 15_000;
export const DEFAULT_COLLECTION_RECEIPT_EXTERNAL_SCAN_REJECT_EXIT_CODES = "1";
export const EXTERNAL_SCAN_OUTPUT_LIMIT = 2_000;
export const BARE_COMMAND_PATTERN = /^[a-zA-Z0-9._-]+$/;
export const UNSAFE_ENV_VALUE_PATTERN = /[\0\r\n]/;
export const EXTERNAL_SCAN_TEMPLATE_PATTERN = /\{[^}]+\}/g;
export const EXTERNAL_SCAN_FILE_PLACEHOLDER = "{file}";
export const EXTERNAL_SCAN_FILENAME_PLACEHOLDER = "{filename}";

export type ExternalScanConfig = {
  enabled: boolean;
  command: string | null;
  args: string[];
  timeoutMs: number;
  failClosed: boolean;
  cleanExitCodes: Set<number>;
  rejectExitCodes: Set<number>;
};

export function readOptionalString(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function readInt(name: string, fallback: number, minimum = 1) {
  const parsed = Number(readOptionalString(name) ?? fallback);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(minimum, Math.floor(parsed));
}

export function parseExitCodeSet(rawValue: string, fallbackRawValue: string): Set<number> {
  const source = String(rawValue || fallbackRawValue)
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.trunc(entry));
  return new Set(source.length ? source : [0]);
}

export function parseScannerArgsJson(): string[] {
  const raw = readOptionalString("COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON");
  if (!raw) {
    return [EXTERNAL_SCAN_FILE_PLACEHOLDER];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
      throw new Error("must be a JSON array of strings");
    }
    for (const entry of parsed) {
      if (UNSAFE_ENV_VALUE_PATTERN.test(entry)) {
        throw new Error("must not contain control characters");
      }
    }
    return parsed as string[];
  } catch (error) {
    throw new Error(
      `COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON ${error instanceof Error ? error.message : "is invalid"}.`,
    );
  }
}

export function validateScannerArgs(args: string[]): string[] {
  let containsFilePlaceholder = false;

  for (const entry of args) {
    const placeholders = entry.match(EXTERNAL_SCAN_TEMPLATE_PATTERN) ?? [];
    for (const placeholder of placeholders) {
      if (
        placeholder === EXTERNAL_SCAN_FILE_PLACEHOLDER
        || placeholder === EXTERNAL_SCAN_FILENAME_PLACEHOLDER
      ) {
        containsFilePlaceholder = true;
        continue;
      }

      throw new Error(
        `must only use ${EXTERNAL_SCAN_FILE_PLACEHOLDER} and ${EXTERNAL_SCAN_FILENAME_PLACEHOLDER} placeholders.`,
      );
    }

    if (
      entry.includes(EXTERNAL_SCAN_FILE_PLACEHOLDER)
      || entry.includes(EXTERNAL_SCAN_FILENAME_PLACEHOLDER)
    ) {
      containsFilePlaceholder = true;
    }
  }

  if (!containsFilePlaceholder) {
    throw new Error(
      `must include at least one ${EXTERNAL_SCAN_FILE_PLACEHOLDER} or ${EXTERNAL_SCAN_FILENAME_PLACEHOLDER} placeholder.`,
    );
  }

  return args;
}

export function buildScanArgs(config: ExternalScanConfig, filePath: string): string[] {
  return config.args.map((entry) =>
    entry
      .replace(/\{file\}/g, filePath)
      .replace(/\{filename\}/g, path.basename(filePath)));
}

export function summarizeOutput(output: string): string | null {
  const normalized = String(output || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, EXTERNAL_SCAN_OUTPUT_LIMIT);
}
