import { logger } from "../lib/logger";

const DEFAULT_INTELLIGENCE_FAILSAFE_LOG_COOLDOWN_MS = 60_000;

const lastLogAtByKey = new Map<string, number>();

type IntelligenceFailSafeLogParams = {
  engine: string;
  operation: string;
  error: unknown;
  cooldownMs?: number;
  nowMs?: number;
};

export function logIntelligenceFailSafe(params: IntelligenceFailSafeLogParams): boolean {
  const nowMs = params.nowMs ?? Date.now();
  const cooldownMs = params.cooldownMs ?? DEFAULT_INTELLIGENCE_FAILSAFE_LOG_COOLDOWN_MS;
  const key = `${params.engine}:${params.operation}`;
  const lastLogAt = lastLogAtByKey.get(key);
  if (lastLogAt !== undefined && nowMs - lastLogAt < cooldownMs) {
    return false;
  }

  lastLogAtByKey.set(key, nowMs);
  logger.warn("Intelligence engine entered fail-safe path", {
    engine: params.engine,
    operation: params.operation,
    error: params.error,
  });
  return true;
}

export function resetIntelligenceFailSafeLogStateForTests() {
  lastLogAtByKey.clear();
}
