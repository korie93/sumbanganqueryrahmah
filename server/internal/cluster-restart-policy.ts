export function recordUnexpectedWorkerExit(params: {
  now: number;
  unexpectedExitTimestamps: number[];
  restartFailureWindowMs: number;
  maxRestartAttempts: number;
  restartBlockMs: number;
}): {
  nextUnexpectedExitTimestamps: number[];
  restartBlockedUntil: number | null;
  shouldBlockRestarts: boolean;
} {
  const nextUnexpectedExitTimestamps = params.unexpectedExitTimestamps
    .filter((ts) => params.now - ts <= params.restartFailureWindowMs);
  nextUnexpectedExitTimestamps.push(params.now);

  if (nextUnexpectedExitTimestamps.length > params.maxRestartAttempts) {
    return {
      nextUnexpectedExitTimestamps,
      restartBlockedUntil: params.now + params.restartBlockMs,
      shouldBlockRestarts: true,
    };
  }

  return {
    nextUnexpectedExitTimestamps,
    restartBlockedUntil: null,
    shouldBlockRestarts: false,
  };
}

export function planClusterSpawnAttempt(params: {
  now: number;
  lastSpawnAttemptTime: number;
  restartThrottleMs: number;
}): {
  shouldSpawn: boolean;
  remainingDelayMs: number;
  nextLastSpawnAttemptTime: number;
} {
  const timeSinceLastSpawn = params.now - params.lastSpawnAttemptTime;
  if (timeSinceLastSpawn >= params.restartThrottleMs) {
    return {
      shouldSpawn: true,
      remainingDelayMs: 0,
      nextLastSpawnAttemptTime: params.now,
    };
  }

  return {
    shouldSpawn: false,
    remainingDelayMs: params.restartThrottleMs - timeSinceLastSpawn,
    nextLastSpawnAttemptTime: params.lastSpawnAttemptTime,
  };
}

export function shouldRestoreMinimumClusterCapacity(params: {
  fatalStartupLockReason: string | null;
  restartBlockedUntil: number;
  now: number;
  workerCount: number;
  minWorkers: number;
}): boolean {
  if (params.fatalStartupLockReason) {
    return false;
  }
  if (params.now < params.restartBlockedUntil) {
    return false;
  }
  return params.workerCount < params.minWorkers;
}
