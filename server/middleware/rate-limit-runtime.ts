type RateLimiterTopologyWarningOptions = {
  distributedStoreConfigured: boolean;
  workerCount: number;
};

export type RateLimiterStoreProvider = "memory" | "redis";

export type SharedRateLimitStoreConfig = {
  distributedStoreConfigured: boolean;
  provider: RateLimiterStoreProvider;
  redisUrl: string | null;
};

const RATE_LIMIT_STORE_PROVIDERS = new Set<RateLimiterStoreProvider>(["memory", "redis"]);

export function resolveSharedRateLimitStoreConfig(options: {
  provider?: string | null;
  redisUrl?: string | null;
}): SharedRateLimitStoreConfig {
  const provider = String(options.provider || "memory").trim().toLowerCase();
  const redisUrl = String(options.redisUrl || "").trim() || null;

  if (!RATE_LIMIT_STORE_PROVIDERS.has(provider as RateLimiterStoreProvider)) {
    throw new Error("SQR_RATE_LIMIT_STORE must be one of: memory or redis.");
  }

  if (provider === "redis") {
    if (!redisUrl) {
      throw new Error("SQR_REDIS_RATE_LIMIT_URL is required when SQR_RATE_LIMIT_STORE=redis.");
    }
    if (!/^rediss?:\/\//i.test(redisUrl)) {
      throw new Error("SQR_REDIS_RATE_LIMIT_URL must start with redis:// or rediss://.");
    }
  } else if (redisUrl) {
    throw new Error("SQR_REDIS_RATE_LIMIT_URL requires SQR_RATE_LIMIT_STORE=redis.");
  }

  return {
    distributedStoreConfigured: provider === "redis",
    provider: provider as RateLimiterStoreProvider,
    redisUrl,
  };
}

export function buildRateLimiterTopologyWarning(
  options: RateLimiterTopologyWarningOptions,
): string | null {
  if (options.distributedStoreConfigured || options.workerCount <= 1) {
    return null;
  }

  return "Rate limiters currently use process-local in-memory storage; each worker or instance receives an independent quota. Configure a shared store with SQR_RATE_LIMIT_STORE=redis and SQR_REDIS_RATE_LIMIT_URL before enabling multi-worker or multi-instance production deployments.";
}
