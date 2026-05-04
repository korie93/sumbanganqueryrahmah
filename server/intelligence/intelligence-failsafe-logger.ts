import { logger } from "../lib/logger";

const DEFAULT_INTELLIGENCE_FAILSAFE_LOG_COOLDOWN_MS = 60_000;
export const INTELLIGENCE_FAILSAFE_LOG_MAX_KEYS = 256;
export const INTELLIGENCE_FAILSAFE_LOG_STALE_MS = 10 * 60_000;
const INTELLIGENCE_FAILSAFE_LOG_SWEEP_INTERVAL_MS = 5 * 60_000;

const lastLogAtByKey = new Map<string, number>();
let lastPruneAtMs = 0;
let sweepTimer: ReturnType<typeof setInterval> | null = null;

type IntelligenceFailSafeLogParams = {
  engine: string;
  operation: string;
  error: unknown;
  cooldownMs?: number;
  nowMs?: number;
};

function unrefInterval(handle: ReturnType<typeof setInterval>) {
  if (typeof handle === "object" && handle && "unref" in handle) {
    handle.unref();
  }
}

export function pruneIntelligenceFailSafeLogState(nowMs = Date.now()): number {
  for (const [key, lastLogAt] of lastLogAtByKey.entries()) {
    if (nowMs - lastLogAt >= INTELLIGENCE_FAILSAFE_LOG_STALE_MS) {
      lastLogAtByKey.delete(key);
    }
  }

  if (lastLogAtByKey.size > INTELLIGENCE_FAILSAFE_LOG_MAX_KEYS) {
    const sortedEntries = Array.from(lastLogAtByKey.entries())
      .sort((left, right) => left[1] - right[1]);
    for (const [key] of sortedEntries) {
      if (lastLogAtByKey.size <= INTELLIGENCE_FAILSAFE_LOG_MAX_KEYS) {
        break;
      }
      lastLogAtByKey.delete(key);
    }
  }

  lastPruneAtMs = nowMs;
  return lastLogAtByKey.size;
}

function pruneIntelligenceFailSafeLogStateIfNeeded(nowMs: number) {
  if (
    lastLogAtByKey.size <= INTELLIGENCE_FAILSAFE_LOG_MAX_KEYS
    && nowMs - lastPruneAtMs < INTELLIGENCE_FAILSAFE_LOG_SWEEP_INTERVAL_MS
  ) {
    return;
  }

  pruneIntelligenceFailSafeLogState(nowMs);
}

function startIntelligenceFailSafeLogSweep() {
  if (sweepTimer) {
    return;
  }

  sweepTimer = setInterval(() => {
    pruneIntelligenceFailSafeLogState();
  }, INTELLIGENCE_FAILSAFE_LOG_SWEEP_INTERVAL_MS);
  unrefInterval(sweepTimer);
}

export function logIntelligenceFailSafe(params: IntelligenceFailSafeLogParams): boolean {
  const nowMs = params.nowMs ?? Date.now();
  const cooldownMs = params.cooldownMs ?? DEFAULT_INTELLIGENCE_FAILSAFE_LOG_COOLDOWN_MS;
  const key = `${params.engine}:${params.operation}`;
  const lastLogAt = lastLogAtByKey.get(key);
  if (lastLogAt !== undefined && nowMs - lastLogAt < cooldownMs) {
    return false;
  }

  lastLogAtByKey.set(key, nowMs);
  pruneIntelligenceFailSafeLogStateIfNeeded(nowMs);
  logger.warn("Intelligence engine entered fail-safe path", {
    engine: params.engine,
    operation: params.operation,
    error: params.error,
  });
  return true;
}

startIntelligenceFailSafeLogSweep();

export function getIntelligenceFailSafeLogStateSizeForTests() {
  return lastLogAtByKey.size;
}

export function resetIntelligenceFailSafeLogStateForTests() {
  lastLogAtByKey.clear();
  lastPruneAtMs = 0;
}
