export type JsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function shouldLogJsonParseFailure(): boolean {
  return Boolean(import.meta.env?.DEV);
}

export function safeJsonParse<T>(
  raw: string | null | undefined,
  fallback: T,
  debugContext?: string,
): T {
  if (raw === null || raw === undefined || raw === "") {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    if (shouldLogJsonParseFailure()) {
      console.warn(
        "[safeJsonParse] Failed to parse JSON",
        debugContext ? `(context: ${debugContext})` : "",
      );
    }
    return fallback;
  }
}

export function safeJsonParseResult<T>(
  raw: string | null | undefined,
): JsonResult<T> {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: false, error: "Empty input" };
  }

  try {
    return { ok: true, data: JSON.parse(raw) as T };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Parse failed",
    };
  }
}
