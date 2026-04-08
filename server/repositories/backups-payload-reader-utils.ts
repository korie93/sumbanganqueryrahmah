import type { BackupDataPayload } from "./backups-repository-types";
import type { BackupPayloadChunkReader } from "./backups-restore-shared-utils";

type BackupDatasetKey = keyof BackupDataPayload;
type BackupPayloadSource = BackupDataPayload | string;
type BackupPayloadChunkSource = BackupPayloadSource | AsyncIterable<string>;

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

function* iterateArrayChunksFromObjectSource<T>(
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

function* iterateArrayChunksFromStringSource<T>(
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

function isAsyncIterableSource(value: unknown): value is AsyncIterable<string> {
  return typeof value === "object"
    && value !== null
    && Symbol.asyncIterator in value
    && typeof (value as AsyncIterable<string>)[Symbol.asyncIterator] === "function";
}

function wrapSyncGeneratorAsAsync<T>(generator: Generator<T[]>): AsyncGenerator<T[]> {
  return (async function* () {
    for (const chunk of generator) {
      yield chunk;
    }
  })();
}

function createSequentialAsyncBackupPayloadChunkReader(
  source: AsyncIterable<string>,
): BackupPayloadChunkReader {
  const iterator = source[Symbol.asyncIterator]();
  let buffer = "";
  let ended = false;
  let started = false;

  const fillBuffer = async () => {
    while (!ended && buffer.length === 0) {
      const result = await iterator.next();
      if (result.done) {
        ended = true;
        break;
      }
      const chunk = String(result.value ?? "");
      if (chunk) {
        buffer += chunk;
      }
    }
  };

  const peekChar = async (): Promise<string | undefined> => {
    await fillBuffer();
    return buffer[0];
  };

  const readChar = async (): Promise<string | undefined> => {
    await fillBuffer();
    if (!buffer.length) {
      return undefined;
    }
    const char = buffer[0];
    buffer = buffer.slice(1);
    return char;
  };

  const skipWhitespaceAsync = async () => {
    while (true) {
      const next = await peekChar();
      if (!next || !/\s/.test(next)) {
        return;
      }
      await readChar();
    }
  };

  const expectChar = async (expected: string) => {
    const actual = await readChar();
    if (actual !== expected) {
      throw new Error("Invalid backup payload format.");
    }
  };

  const readJsonStringTokenAsync = async (): Promise<string> => {
    const firstChar = await readChar();
    if (firstChar !== "\"") {
      throw new Error("Invalid backup payload format.");
    }

    let raw = "\"";
    let escaped = false;

    while (true) {
      const char = await readChar();
      if (!char) {
        throw new Error("Invalid backup payload format.");
      }
      raw += char;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        return raw;
      }
    }
  };

  const readPrimitiveValueRawAsync = async (): Promise<string> => {
    let raw = "";
    while (true) {
      const next = await peekChar();
      if (!next || next === "," || next === "]" || next === "}" || /\s/.test(next)) {
        break;
      }
      raw += await readChar();
    }
    if (!raw) {
      throw new Error("Invalid backup payload format.");
    }
    return raw;
  };

  const readCompositeValueRawAsync = async (
    openingChar: "{" | "[",
    closingChar: "}" | "]",
  ): Promise<string> => {
    let raw = "";
    let depth = 0;
    let inString = false;
    let escaped = false;

    while (true) {
      const char = await readChar();
      if (!char) {
        throw new Error("Invalid backup payload format.");
      }
      raw += char;

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }

      if (char === openingChar) {
        depth += 1;
        continue;
      }

      if (char === closingChar) {
        depth -= 1;
        if (depth === 0) {
          return raw;
        }
      }
    }
  };

  const readJsonValueRawAsync = async (): Promise<string> => {
    const next = await peekChar();
    if (!next) {
      throw new Error("Invalid backup payload format.");
    }
    if (next === "\"") {
      return readJsonStringTokenAsync();
    }
    if (next === "{") {
      return readCompositeValueRawAsync("{", "}");
    }
    if (next === "[") {
      return readCompositeValueRawAsync("[", "]");
    }
    return readPrimitiveValueRawAsync();
  };

  const advanceToDatasetAsync = async (targetKey: BackupDatasetKey): Promise<boolean> => {
    if (!started) {
      await skipWhitespaceAsync();
      await expectChar("{");
      started = true;
    }

    while (true) {
      await skipWhitespaceAsync();
      const next = await peekChar();

      if (!next) {
        throw new Error("Invalid backup payload format.");
      }
      if (next === ",") {
        await readChar();
        continue;
      }
      if (next === "}") {
        await readChar();
        ended = true;
        return false;
      }

      const keyTokenRaw = await readJsonStringTokenAsync();
      const key = JSON.parse(keyTokenRaw) as string;
      await skipWhitespaceAsync();
      await expectChar(":");
      await skipWhitespaceAsync();

      if (key === targetKey) {
        return true;
      }

      await readJsonValueRawAsync();
    }
  };

  return {
    iterateArrayChunks<T>(key: BackupDatasetKey, chunkSize: number): AsyncGenerator<T[]> {
      const safeChunkSize = Math.max(1, Math.floor(chunkSize));
      return (async function* (): AsyncGenerator<T[]> {
        const foundDataset = await advanceToDatasetAsync(key);
        if (!foundDataset) {
          return;
        }

        await skipWhitespaceAsync();
        await expectChar("[");
        await skipWhitespaceAsync();

        let chunk: T[] = [];

        while (true) {
          const next = await peekChar();
          if (!next) {
            throw new Error("Invalid backup payload format.");
          }
          if (next === "]") {
            await readChar();
            break;
          }

          chunk.push(JSON.parse(await readJsonValueRawAsync()) as T);
          if (chunk.length >= safeChunkSize) {
            yield chunk;
            chunk = [];
          }

          await skipWhitespaceAsync();
          const separator = await peekChar();
          if (!separator) {
            throw new Error("Invalid backup payload format.");
          }
          if (separator === ",") {
            await readChar();
            await skipWhitespaceAsync();
            continue;
          }
          if (separator === "]") {
            continue;
          }
          throw new Error("Invalid backup payload format.");
        }

        if (chunk.length > 0) {
          yield chunk;
        }
      })();
    },
  };
}

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
