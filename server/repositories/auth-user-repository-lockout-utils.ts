import type {
  DerivedFailedLoginAttemptState,
} from "./auth-user-repository-types";

export function deriveFailedLoginAttemptState(params: {
  previousAttempts: number;
  lockedAt: unknown;
  maxAllowedAttempts: number;
  lockedReason: string;
  now: Date;
}): DerivedFailedLoginAttemptState {
  const previousAttempts = Math.max(0, Number(params.previousAttempts || 0));
  const nextAttempts = previousAttempts + 1;
  const wasLocked = params.lockedAt instanceof Date
    ? !Number.isNaN(params.lockedAt.getTime())
    : Boolean(params.lockedAt);
  const safeMaxAllowedAttempts = Math.max(0, Math.floor(Number(params.maxAllowedAttempts) || 0));
  const locked = wasLocked || nextAttempts > safeMaxAllowedAttempts;
  const newlyLocked = !wasLocked && locked;

  return {
    nextAttempts,
    locked,
    newlyLocked,
    nextLockedAt: locked
      ? (params.lockedAt instanceof Date ? params.lockedAt : params.now)
      : null,
    nextLockedReason: locked ? params.lockedReason : null,
    nextLockedBySystem: locked,
  };
}
