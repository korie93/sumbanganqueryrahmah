import { logClientWarning, type ClientLoggerEnvironment } from "@/lib/client-logger";

export type JsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function safeJsonParse<T>(
  raw: string | null | undefined,
  fallback: T,
  debugContext?: string,
  env: ClientLoggerEnvironment = import.meta.env,
): T {
  if (raw === null || raw === undefined || raw === "") {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    logClientWarning(
      "[safeJsonParse] Failed to parse JSON",
      undefined,
      debugContext ? { context: debugContext } : undefined,
      env,
    );
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
