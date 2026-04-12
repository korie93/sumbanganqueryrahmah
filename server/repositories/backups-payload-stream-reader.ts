import type { BackupPayloadChunkReader } from "./backups-restore-shared-utils";
import type { BackupDatasetKey } from "./backups-payload-reader-shared";

export function createSequentialAsyncBackupPayloadChunkReader(
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
