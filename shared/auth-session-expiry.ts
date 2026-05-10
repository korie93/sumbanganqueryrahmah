export const AUTH_SESSION_TTL_SECONDS = 24 * 60 * 60;
export const AUTH_SESSION_MAX_AGE_MS = AUTH_SESSION_TTL_SECONDS * 1000;

export type NormalizedSessionExpiry = {
  expiresAtIso: string;
  expiresAtMs: number;
};

type NormalizeSessionExpiryOptions = {
  allowExpired?: boolean;
  nowMs?: number;
};

function normalizeTimestampMs(value: unknown): number | null {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const numericTimestamp = Number(normalized);
  if (Number.isFinite(numericTimestamp) && numericTimestamp > 0) {
    return numericTimestamp;
  }

  const parsedTimestamp = Date.parse(normalized);
  return Number.isFinite(parsedTimestamp) && parsedTimestamp > 0 ? parsedTimestamp : null;
}

export function calculateSessionExpiry(nowMs = Date.now()): NormalizedSessionExpiry {
  const safeNowMs = Number.isFinite(nowMs) && nowMs > 0 ? nowMs : Date.now();
  const expiresAtMs = safeNowMs + AUTH_SESSION_MAX_AGE_MS;
  return {
    expiresAtIso: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
  };
}

export function normalizeSessionExpiry(
  value: unknown,
  options: NormalizeSessionExpiryOptions = {},
): NormalizedSessionExpiry | null {
  const expiresAtMs = normalizeTimestampMs(value);
  if (expiresAtMs === null) {
    return null;
  }

  const nowMs = Number.isFinite(options.nowMs) ? Number(options.nowMs) : Date.now();
  if (options.allowExpired !== true && expiresAtMs <= nowMs) {
    return null;
  }

  return {
    expiresAtIso: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
  };
}

export function isSessionExpired(value: unknown, nowMs = Date.now()): boolean {
  const normalized = normalizeSessionExpiry(value, {
    allowExpired: true,
    nowMs,
  });
  return !normalized || normalized.expiresAtMs <= nowMs;
}
