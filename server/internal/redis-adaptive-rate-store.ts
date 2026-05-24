import crypto from "node:crypto";
import { logger as defaultLogger } from "../lib/logger";
import type { AdaptiveRateStateStore } from "./apiProtection";
import type { SharedRateLimitStoreConfig } from "../middleware/rate-limit-runtime";
import { createRedisReconnectStrategy } from "../middleware/redis-rate-limit-store";

type LoggerLike = Pick<typeof defaultLogger, "warn">;

type RedisAdaptiveRateClientLike = {
  connect: () => Promise<unknown>;
  eval: (
    script: string,
    options: { arguments: string[]; keys: string[] },
  ) => Promise<unknown>;
  on?: (event: string, listener: (error: unknown) => void) => unknown;
  quit?: () => Promise<unknown>;
};

type RedisAdaptiveRateClientFactory = (options: {
  socket: { reconnectStrategy: (retries: number, cause?: Error) => number | false };
  url: string;
}) => RedisAdaptiveRateClientLike;

type RedisAdaptiveRateStateStoreOptions = {
  config: SharedRateLimitStoreConfig;
  createRedisClient?: RedisAdaptiveRateClientFactory;
  logger?: LoggerLike;
  prefix?: string;
};

const ADAPTIVE_RATE_INCREMENT_SCRIPT = `
local raw = redis.call("GET", KEYS[1])
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local staleGraceMs = tonumber(ARGV[3])
local count = 0
local resetAt = now + windowMs

if raw then
  local ok, bucket = pcall(cjson.decode, raw)
  if ok and type(bucket) == "table" then
    count = tonumber(bucket["count"]) or 0
    resetAt = tonumber(bucket["resetAt"]) or resetAt
  end
end

if resetAt <= now then
  count = 1
  resetAt = now + windowMs
else
  count = count + 1
end

local ttlMs = math.max(1, resetAt + staleGraceMs - now)
local nextBucket = cjson.encode({
  count = count,
  lastSeenAt = now,
  resetAt = resetAt
})
redis.call("SET", KEYS[1], nextBucket, "PX", ttlMs)
return { count, now, resetAt }
`;

let defaultRedisClientFactoryPromise: Promise<RedisAdaptiveRateClientFactory> | null = null;

async function resolveDefaultRedisClientFactory(): Promise<RedisAdaptiveRateClientFactory> {
  defaultRedisClientFactoryPromise ??= import("redis")
    .then((redisModule) => redisModule.createClient as unknown as RedisAdaptiveRateClientFactory);
  return defaultRedisClientFactoryPromise;
}

function parseRedisNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAdaptiveRateIncrementResult(result: unknown): {
  count: number;
  lastSeenAt: number;
  resetAt: number;
} | null {
  if (!Array.isArray(result) || result.length < 3) {
    return null;
  }

  const count = parseRedisNumber(result[0]);
  const lastSeenAt = parseRedisNumber(result[1]);
  const resetAt = parseRedisNumber(result[2]);
  if (count == null || lastSeenAt == null || resetAt == null) {
    return null;
  }

  return { count, lastSeenAt, resetAt };
}

function normalizeRedisPrefix(prefix: string | undefined) {
  return String(prefix || "sqr:adaptive-rate")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, ":")
    .replace(/:{2,}/g, ":")
    .replace(/^:+|:+$/g, "")
    || "sqr:adaptive-rate";
}

export class RedisAdaptiveRateStateStore implements AdaptiveRateStateStore {
  private readonly config: SharedRateLimitStoreConfig;
  private readonly createRedisClient: RedisAdaptiveRateClientFactory | null;
  private readonly logger: LoggerLike;
  private readonly prefix: string;
  private client: RedisAdaptiveRateClientLike | null = null;
  private clientPromise: Promise<RedisAdaptiveRateClientLike | null> | null = null;
  private shuttingDown = false;
  private warningEmitted = false;

  constructor(options: RedisAdaptiveRateStateStoreOptions) {
    this.config = options.config;
    this.createRedisClient = options.createRedisClient ?? null;
    this.logger = options.logger ?? defaultLogger;
    this.prefix = normalizeRedisPrefix(options.prefix);
  }

  async increment(options: {
    bucketKey: string;
    now: number;
    staleGraceMs: number;
    windowMs: number;
  }) {
    const client = await this.getClient();
    if (!client) {
      return null;
    }

    try {
      const result = parseAdaptiveRateIncrementResult(
        await client.eval(ADAPTIVE_RATE_INCREMENT_SCRIPT, {
          keys: [this.buildRedisKey(options.bucketKey)],
          arguments: [
            String(Math.max(0, Math.trunc(options.now))),
            String(Math.max(1, Math.trunc(options.windowMs))),
            String(Math.max(0, Math.trunc(options.staleGraceMs))),
          ],
        }),
      );
      if (!result) {
        throw new Error("Redis adaptive rate increment returned an invalid response.");
      }
      this.warningEmitted = false;
      return result;
    } catch (error) {
      this.handleRedisFailure(error);
      return null;
    }
  }

  async close() {
    this.shuttingDown = true;
    const pendingClient = await (this.clientPromise?.catch(() => null) ?? null);
    const client = this.client ?? pendingClient;
    this.client = null;
    this.clientPromise = null;
    await this.closeClient(client);
  }

  private buildRedisKey(bucketKey: string) {
    const digest = crypto.createHash("sha256").update(bucketKey).digest("hex");
    return `${this.prefix}:${digest}`;
  }

  private async getClient() {
    if (this.config.provider !== "redis" || !this.config.redisUrl || this.shuttingDown) {
      return null;
    }
    if (this.client) {
      return this.client;
    }

    if (!this.clientPromise) {
      const clientPromise = this.connect();
      this.clientPromise = clientPromise;
      void clientPromise
        .finally(() => {
          if (this.clientPromise === clientPromise) {
            this.clientPromise = null;
          }
        })
        .catch(() => undefined);
    }

    return this.clientPromise;
  }

  private async connect(): Promise<RedisAdaptiveRateClientLike | null> {
    let client: RedisAdaptiveRateClientLike | null = null;
    try {
      const createRedisClient = this.createRedisClient ?? await resolveDefaultRedisClientFactory();
      client = createRedisClient({
        socket: {
          reconnectStrategy: createRedisReconnectStrategy(this.logger),
        },
        url: this.config.redisUrl as string,
      });
      client.on?.("error", (error) => this.logRedisFailure(error));
      await client.connect();
      if (this.shuttingDown) {
        await this.closeClient(client);
        return null;
      }
      this.client = client;
      this.warningEmitted = false;
      return client;
    } catch (error) {
      await this.closeClient(client);
      this.logRedisFailure(error);
      return null;
    }
  }

  private handleRedisFailure(error: unknown) {
    const client = this.client;
    this.client = null;
    void this.closeClient(client);
    this.logRedisFailure(error);
  }

  private logRedisFailure(error: unknown) {
    if (this.warningEmitted) {
      return;
    }
    this.warningEmitted = true;
    this.logger.warn("Redis adaptive rate state unavailable; falling back to process-local memory", {
      provider: this.config.provider,
      error: error instanceof Error ? error.message : "Unknown Redis failure",
    });
  }

  private async closeClient(client: RedisAdaptiveRateClientLike | null) {
    await client?.quit?.().catch(() => undefined);
  }
}

export function createAdaptiveRateStateStore(config: SharedRateLimitStoreConfig): AdaptiveRateStateStore | null {
  if (config.provider !== "redis") {
    return null;
  }

  return new RedisAdaptiveRateStateStore({
    config,
  });
}
