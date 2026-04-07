import { createClientRandomUnitInterval } from "@/lib/secure-id";

export const WS_RECONNECT_BASE_DELAY_MS = 1_000;
export const WS_RECONNECT_MAX_DELAY_MS = 30_000;

export function resolveAutoLogoutReconnectDelayMs(
  attempt: number,
  randomValue = createClientRandomUnitInterval(),
): number {
  const safeAttempt = Math.max(0, Math.trunc(attempt));
  const safeRandom = Math.min(1, Math.max(0, randomValue));
  const exponentialDelay = Math.min(
    WS_RECONNECT_BASE_DELAY_MS * (2 ** safeAttempt),
    WS_RECONNECT_MAX_DELAY_MS,
  );
  const jitteredDelay = exponentialDelay * (0.8 + (safeRandom * 0.4));
  return Math.round(Math.min(WS_RECONNECT_MAX_DELAY_MS, jitteredDelay));
}
