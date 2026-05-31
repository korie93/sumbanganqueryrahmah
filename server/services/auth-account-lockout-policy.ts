export const FAILED_LOGIN_LOCKOUT_REASON = "too_many_failed_password_attempts";

export const FAILED_LOGIN_LOCKOUT_THRESHOLDS = [
  { attempts: 4, lockoutMs: 5 * 60 * 1000 },
  { attempts: 5, lockoutMs: 15 * 60 * 1000 },
  { attempts: 10, lockoutMs: 60 * 60 * 1000 },
  { attempts: 20, lockoutMs: 24 * 60 * 60 * 1000 },
] as const;

type FailedLoginLockoutStateInput = {
  failedLoginAttempts?: number | null | undefined;
  lockedAt?: Date | string | null | undefined;
  lockedBySystem?: boolean | null | undefined;
  lockedReason?: string | null | undefined;
};

export type FailedLoginLockoutStatus =
  | {
    active: false;
    expired: false;
    kind: "not_system_failed_login_lockout";
  }
  | {
    active: false;
    attempts: number;
    expired: true;
    expiresAt: Date;
    kind: "system_failed_login_lockout";
    lockoutMs: number;
    remainingMs: 0;
  }
  | {
    active: true;
    attempts: number;
    expired: false;
    expiresAt: Date;
    kind: "system_failed_login_lockout";
    lockoutMs: number;
    remainingMs: number;
  };

function normalizeLockoutDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function getFailedLoginLockoutDurationMs(attempts: unknown): number {
  const normalizedAttempts = Math.max(0, Math.trunc(Number(attempts) || 0));
  const threshold = [...FAILED_LOGIN_LOCKOUT_THRESHOLDS]
    .reverse()
    .find((candidate) => normalizedAttempts >= candidate.attempts);
  return threshold?.lockoutMs ?? FAILED_LOGIN_LOCKOUT_THRESHOLDS[0].lockoutMs;
}

export function getSystemFailedLoginLockoutStatus(
  state: FailedLoginLockoutStateInput,
  now: Date = new Date(),
): FailedLoginLockoutStatus {
  const lockedAt = normalizeLockoutDate(state.lockedAt);
  const lockedReason = String(state.lockedReason || "").trim();
  if (
    !lockedAt
    || state.lockedBySystem !== true
    || lockedReason !== FAILED_LOGIN_LOCKOUT_REASON
  ) {
    return {
      active: false,
      expired: false,
      kind: "not_system_failed_login_lockout",
    };
  }

  const attempts = Math.max(0, Math.trunc(Number(state.failedLoginAttempts) || 0));
  const lockoutMs = getFailedLoginLockoutDurationMs(attempts);
  const expiresAt = new Date(lockedAt.getTime() + lockoutMs);
  const remainingMs = Math.max(0, expiresAt.getTime() - now.getTime());

  if (remainingMs <= 0) {
    return {
      active: false,
      attempts,
      expired: true,
      expiresAt,
      kind: "system_failed_login_lockout",
      lockoutMs,
      remainingMs: 0,
    };
  }

  return {
    active: true,
    attempts,
    expired: false,
    expiresAt,
    kind: "system_failed_login_lockout",
    lockoutMs,
    remainingMs,
  };
}
