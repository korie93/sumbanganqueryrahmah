export type RuntimeWsSharedBusProvider = "memory" | "redis";

export type RuntimeWsSharedBusConfig = {
  distributedBusConfigured: boolean;
  provider: RuntimeWsSharedBusProvider;
  redisUrl: string | null;
};

type RuntimeWsSharedBusConfigOptions = {
  provider?: string | null;
  redisUrl?: string | null;
  sharedRedisUrl?: string | null;
};

const RUNTIME_WS_SHARED_BUS_PROVIDERS = new Set<RuntimeWsSharedBusProvider>(["memory", "redis"]);

export function resolveRuntimeWsSharedBusConfig(
  options: RuntimeWsSharedBusConfigOptions,
): RuntimeWsSharedBusConfig {
  const provider = String(options.provider || "memory").trim().toLowerCase() as RuntimeWsSharedBusProvider;
  const explicitRedisUrl = String(options.redisUrl || "").trim();
  const sharedRedisUrl = String(options.sharedRedisUrl || "").trim();
  const redisUrl = explicitRedisUrl || sharedRedisUrl || null;

  if (!RUNTIME_WS_SHARED_BUS_PROVIDERS.has(provider)) {
    throw new Error("SQR_WS_SHARED_BUS must be one of: memory or redis.");
  }

  if (provider === "redis") {
    if (!redisUrl) {
      throw new Error("SQR_REDIS_WS_URL or SQR_REDIS_RATE_LIMIT_URL is required when SQR_WS_SHARED_BUS=redis.");
    }
    if (!/^rediss?:\/\//i.test(redisUrl)) {
      throw new Error("SQR_REDIS_WS_URL must start with redis:// or rediss://.");
    }
  } else if (explicitRedisUrl) {
    throw new Error("SQR_REDIS_WS_URL requires SQR_WS_SHARED_BUS=redis.");
  }

  return {
    distributedBusConfigured: provider === "redis",
    provider,
    redisUrl,
  };
}
