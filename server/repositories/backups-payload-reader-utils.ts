import type { BackupDataPayload } from "./backups-repository-types";

type BackupDatasetKey = keyof BackupDataPayload;
type BackupPayloadSource = BackupDataPayload | string;

function skipWhitespace(source: string, start: number): number {
  let index = start;
  while (index < source.length && /\s/.test(source[index] || "")) {
    index += 1;
  }
  return index;
}

function readJsonStringToken(source: string, start: number): { raw: string; nextIndex: number } {
  if (source[start] !== "\"") {
    throw new Error("Invalid backup payload format.");
  }

  let index = start + 1;
  let escaped = false;

  while (index < source.length) {
    const char = source[index];
    if (escaped) {
      escaped = false;
      index += 1;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      index += 1;
      continue;
    }
    if (char === "\"") {
      return {
        raw: source.slice(start, index + 1),
        nextIndex: index + 1,
      };
    }
    index += 1;
  }

  throw new Error("Invalid backup payload format.");
}

function skipJsonValue(source: string, start: number): number {
  const firstChar = source[start];
  if (!firstChar) {
    throw new Error("Invalid backup payload format.");
  }

  if (firstChar === "\"") {
    return readJsonStringToken(source, start).nextIndex;
  }

  if (firstChar === "{" || firstChar === "[") {
    const openingChar = firstChar;
    const closingChar = firstChar === "{" ? "}" : "]";
    let index = start;
    let depth = 0;
    let inString = false;
    let escaped = false;

    while (index < source.length) {
      const char = source[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        index += 1;
        continue;
      }

      if (char === "\"") {
        inString = true;
        index += 1;
        continue;
      }

      if (char === openingChar) {
        depth += 1;
      } else if (char === closingChar) {
        depth -= 1;
        if (depth === 0) {
          return index + 1;
        }
      }

      index += 1;
    }

    throw new Error("Invalid backup payload format.");
  }

  let index = start;
  while (index < source.length) {
    const char = source[index];
    if (char === "," || char === "}" || /\s/.test(char)) {
      break;
    }
    index += 1;
  }

  return index;
}

function parseTopLevelBackupMemberRanges(source: string): Map<string, { start: number; end: number }> {
  const ranges = new Map<string, { start: number; end: number }>();
  let index = skipWhitespace(source, 0);

  if (source[index] !== "{") {
    throw new Error("Invalid backup payload format.");
  }

  index = skipWhitespace(source, index + 1);
  while (index < source.length && source[index] !== "}") {
    const keyToken = readJsonStringToken(source, index);
    const key = JSON.parse(keyToken.raw) as string;
    index = skipWhitespace(source, keyToken.nextIndex);

    if (source[index] !== ":") {
      throw new Error("Invalid backup payload format.");
    }

    index = skipWhitespace(source, index + 1);
    const valueStart = index;
    const valueEnd = skipJsonValue(source, valueStart);
    ranges.set(key, {
      start: valueStart,
      end: valueEnd,
    });

    index = skipWhitespace(source, valueEnd);
    if (source[index] === ",") {
      index = skipWhitespace(source, index + 1);
      continue;
    }
    if (source[index] === "}") {
      break;
    }

    throw new Error("Invalid backup payload format.");
  }

  return ranges;
}

export function createBackupPayloadSectionReader(source: BackupPayloadSource) {
  if (typeof source !== "string") {
    return {
      getArray<T>(key: BackupDatasetKey): T[] {
        const value = source[key];
        return Array.isArray(value) ? (value as T[]) : [];
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
  };
}
