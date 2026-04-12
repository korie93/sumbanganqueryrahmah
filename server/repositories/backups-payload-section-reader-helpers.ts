import type {
  BackupDatasetKey,
} from "./backups-payload-reader-shared";
import type { BackupDataPayload } from "./backups-repository-types";

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

export function parseTopLevelBackupMemberRanges(source: string): Map<string, { start: number; end: number }> {
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

export function* iterateArrayChunksFromObjectSource<T>(
  source: BackupDataPayload,
  key: BackupDatasetKey,
  chunkSize: number,
): Generator<T[]> {
  const value = source[key];
  if (!Array.isArray(value) || value.length === 0) {
    return;
  }

  const safeChunkSize = Math.max(1, Math.floor(chunkSize));
  for (let index = 0; index < value.length; index += safeChunkSize) {
    yield value.slice(index, index + safeChunkSize) as T[];
  }
}

export function* iterateArrayChunksFromStringSource<T>(
  source: string,
  range: { start: number; end: number } | undefined,
  chunkSize: number,
): Generator<T[]> {
  if (!range) {
    return;
  }

  const safeChunkSize = Math.max(1, Math.floor(chunkSize));
  let index = skipWhitespace(source, range.start);

  if (source[index] !== "[") {
    throw new Error("Invalid backup payload format.");
  }

  index = skipWhitespace(source, index + 1);
  let chunk: T[] = [];

  while (index < range.end && source[index] !== "]") {
    const valueStart = index;
    const valueEnd = skipJsonValue(source, valueStart);
    chunk.push(JSON.parse(source.slice(valueStart, valueEnd)) as T);

    if (chunk.length >= safeChunkSize) {
      yield chunk;
      chunk = [];
    }

    index = skipWhitespace(source, valueEnd);
    if (source[index] === ",") {
      index = skipWhitespace(source, index + 1);
      continue;
    }
    if (source[index] === "]") {
      break;
    }

    throw new Error("Invalid backup payload format.");
  }

  if (chunk.length > 0) {
    yield chunk;
  }
}
