export type IntegerParseOptions = {
  readonly min?: number;
  readonly max?: number;
  readonly fallback?: number | null;
};

const STRICT_INTEGER_PATTERN = /^-?\d+$/;

function resolveIntegerFallback(options: IntegerParseOptions): number | null {
  if (options.fallback === undefined) return null;
  if (options.fallback === null) return null;
  if (!Number.isSafeInteger(options.fallback)) return null;
  if (options.min !== undefined && options.fallback < options.min) return null;
  if (options.max !== undefined && options.fallback > options.max) return null;
  return options.fallback;
}

export function safeParseInteger(raw: unknown, options: IntegerParseOptions = {}): number | null {
  let parsed: number | null = null;

  if (typeof raw === "number") {
    parsed = Number.isSafeInteger(raw) ? raw : null;
  } else if (typeof raw === "string") {
    const normalized = raw.trim();
    parsed = STRICT_INTEGER_PATTERN.test(normalized) ? Number(normalized) : null;
  }

  if (parsed === null || !Number.isSafeInteger(parsed)) {
    return resolveIntegerFallback(options);
  }

  if (options.min !== undefined && parsed < options.min) {
    return resolveIntegerFallback(options);
  }
  if (options.max !== undefined && parsed > options.max) {
    return resolveIntegerFallback(options);
  }

  return parsed;
}
