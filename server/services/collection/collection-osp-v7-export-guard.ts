// CSV and XLSX remain available; PNG and PDF each require fresh authorization
// and a separate private dataset. Allow all four formats while retaining the
// single-flight guard and the global authenticated API limiter.
const MAX_EXPORTS_PER_USER_PER_WINDOW = 4;
const EXPORT_RATE_WINDOW_MS = 60_000;
const MAX_TRACKED_USERS = 1_000;

export class CollectionOspV7ExportGuardError extends Error {
  readonly statusCode: 429;
  readonly rateLimit: { limit: number; retryAfterMs: number; resetAfterMs?: number };

  constructor(message: string, rateLimit: { limit: number; retryAfterMs: number; resetAfterMs?: number }) {
    super(message);
    this.name = "CollectionOspV7ExportGuardError";
    this.statusCode = 429;
    this.rateLimit = rateLimit;
  }
}

export type CollectionOspV7ExportGuard = {
  run<T>(username: string, operation: () => Promise<T>): Promise<T>;
  snapshot(): { inFlight: number; trackedUsers: number };
};

export function createCollectionOspV7ExportGuard(options: {
  maxConcurrent?: number;
  maxPerUserPerWindow?: number;
  maxTrackedUsers?: number;
  now?: () => number;
  windowMs?: number;
} = {}): CollectionOspV7ExportGuard {
  const maxConcurrent = Math.max(1, Math.floor(options.maxConcurrent ?? 1));
  const maxPerUserPerWindow = Math.max(
    1,
    Math.floor(options.maxPerUserPerWindow ?? MAX_EXPORTS_PER_USER_PER_WINDOW),
  );
  const windowMs = Math.max(1_000, Math.floor(options.windowMs ?? EXPORT_RATE_WINDOW_MS));
  const maxTrackedUsers = Math.max(1, Math.floor(options.maxTrackedUsers ?? MAX_TRACKED_USERS));
  const now = options.now ?? Date.now;
  const recentStartsByUser = new Map<string, number[]>();
  let inFlight = 0;

  function prune(currentTime: number) {
    for (const [username, starts] of recentStartsByUser) {
      const retained = starts.filter((startedAt) => currentTime - startedAt < windowMs);
      if (retained.length === 0) {
        recentStartsByUser.delete(username);
      } else if (retained.length !== starts.length) {
        recentStartsByUser.set(username, retained);
      }
    }
  }

  return {
    async run<T>(username: string, operation: () => Promise<T>): Promise<T> {
      const currentTime = now();
      prune(currentTime);
      if (!recentStartsByUser.has(username) && recentStartsByUser.size >= maxTrackedUsers) {
        // A tracked slot becomes available when all its retained starts expire.
        const retryAfterMs = Math.max(1, Math.min(...Array.from(
          recentStartsByUser.values(),
          (starts) => Math.max(...starts) + windowMs - currentTime,
        )));
        throw new CollectionOspV7ExportGuardError(
          "Billing Principal export capacity is temporarily unavailable. Please try again shortly.",
          { limit: maxTrackedUsers, retryAfterMs, resetAfterMs: retryAfterMs },
        );
      }
      const starts = recentStartsByUser.get(username) ?? [];
      if (starts.length >= maxPerUserPerWindow) {
        const retryAfterMs = Math.max(1, Math.min(...starts) + windowMs - currentTime);
        throw new CollectionOspV7ExportGuardError(
          "Too many Billing Principal exports were requested. Please wait a minute and try again.",
          { limit: maxPerUserPerWindow, retryAfterMs, resetAfterMs: retryAfterMs },
        );
      }
      if (inFlight >= maxConcurrent) {
        throw new CollectionOspV7ExportGuardError(
          "A Billing Principal export is already running. Please try again shortly.",
          // One-second retry guidance is not a prediction of export completion.
          { limit: maxConcurrent, retryAfterMs: 1_000 },
        );
      }

      starts.push(currentTime);
      recentStartsByUser.set(username, starts);
      inFlight += 1;
      try {
        return await operation();
      } finally {
        inFlight = Math.max(0, inFlight - 1);
      }
    },
    snapshot() {
      prune(now());
      return { inFlight, trackedUsers: recentStartsByUser.size };
    },
  };
}
