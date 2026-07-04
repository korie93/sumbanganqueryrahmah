import crypto from "node:crypto";
import {
  type ClientRateLimitInfo,
  type Options,
  type Store,
} from "express-rate-limit";
import { LRUCache } from "lru-cache";
import { z } from "zod";
import { internalMetrics } from "../internal/metrics";
import { logger as defaultLogger } from "../lib/logger";
import type { SharedRateLimitStoreConfig } from "./rate-limit-runtime";

type LoggerLike = Pick<typeof defaultLogger, "warn">;

type RedisClientLike = {
  connect: () => Promise<unknown>;
  decr: (key: string) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
  eval: (
    script: string,
    options: { arguments: string[]; keys: string[] },
  ) => Promise<unknown>;
  get: (key: string) => Promise<unknown>;
  multi?: () => RedisMultiLike;
  on?: (event: string, listener: (error?: unknown) => void) => unknown;
  pTTL: (key: string) => Promise<unknown>;
  quit?: () => Promise<unknown>;
};

type RedisMultiLike = {
  exec: () => Promise<unknown>;
  get: (key: string) => RedisMultiLike;
  pTTL: (key: string) => RedisMultiLike;
};

type RedisClientFactory = (options: {
  socket: { reconnectStrategy: (retries: number, cause?: Error) => number | false };
  url: string;
}) => RedisClientLike;

type RedisRateLimitStoreOptions = {
  config: SharedRateLimitStoreConfig;
  createRedisClient?: RedisClientFactory;
  logger?: LoggerLike;
  now?: () => number;
  prefix: string;
  warningRepeatMs?: number;
};

const REDIS_INCREMENT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return { current, ttl }
`;

const RedisIncrementEvalResultSchema = z.tuple([
  z.number().int().min(1),
  z.number().int(),
]);

type RedisIncrementEvalResult = z.infer<typeof RedisIncrementEvalResultSchema>;

let defaultRedisClientFactoryPromise: Promise<RedisClientFactory> | null = null;

const REDIS_RECONNECT_BASE_DELAY_MS = 500;
const REDIS_RECONNECT_MAX_DELAY_MS = 30_000;
export const REDIS_RATE_LIMIT_FALLBACK_MAX_KEYS = 10_000;
export const REDIS_RATE_LIMIT_FALLBACK_TTL_MS = 60_000;
export const REDIS_UNAVAILABLE_WARNING_REPEAT_MS = 60_000;

type FallbackRateLimitEntry = {
  resetTime: Date;
  totalHits: number;
};

class BoundedMemoryRateLimitStore implements Store {
  readonly localKeys = true;
  private readonly cache = new LRUCache<string, FallbackRateLimitEntry>({
    max: REDIS_RATE_LIMIT_FALLBACK_MAX_KEYS,
    ttl: REDIS_RATE_LIMIT_FALLBACK_TTL_MS,
    updateAgeOnGet: false,
  });
  private readonly now: () => number;
  private windowMs = REDIS_RATE_LIMIT_FALLBACK_TTL_MS;

  constructor(now: () => number) {
    this.now = now;
  }

  init(options: Options): void {
    this.windowMs = Math.max(1, Math.trunc(Number(options.windowMs) || REDIS_RATE_LIMIT_FALLBACK_TTL_MS));
    this.cache.clear();
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.resetTime.getTime() <= this.now()) {
      this.cache.delete(key);
      return undefined;
    }

    return {
      resetTime: entry.resetTime,
      totalHits: entry.totalHits,
    };
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const existing = await this.get(key);
    const nowMs = this.now();
    const resetTime = existing?.resetTime instanceof Date
      ? existing.resetTime
      : new Date(nowMs + this.windowMs);
    const totalHits = (existing?.totalHits ?? 0) + 1;
    const ttl = Math.max(1, resetTime.getTime() - nowMs);
    const entry = { resetTime, totalHits };
    this.cache.set(key, entry, { ttl });
    return entry;
  }

  async decrement(key: string): Promise<void> {
    const existing = await this.get(key);
    if (!existing) {
      return;
    }
    if (!(existing.resetTime instanceof Date)) {
      this.cache.delete(key);
      return;
    }

    const totalHits = existing.totalHits - 1;
    if (totalHits <= 0) {
      this.cache.delete(key);
      return;
    }

    this.cache.set(key, {
      resetTime: existing.resetTime,
      totalHits,
    }, {
      ttl: Math.max(1, existing.resetTime.getTime() - this.now()),
    });
  }

  async resetKey(key: string): Promise<void> {
    this.cache.delete(key);
  }

  shutdown(): void {
    this.cache.clear();
  }

  get size(): number {
    this.cache.purgeStale();
    return this.cache.size;
  }
}

async function resolveDefaultRedisClientFactory(): Promise<RedisClientFactory> {
  defaultRedisClientFactoryPromise ??= import("redis")
    .then((redisModule) => redisModule.createClient as unknown as RedisClientFactory);

  return defaultRedisClientFactoryPromise;
}

function parseRedisInteger(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : Number.parseInt(String(value ?? ""), 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function mapIncrementEvalResult([totalHits, ttlMs]: RedisIncrementEvalResult): { totalHits: number; ttlMs: number } {
  return {
    totalHits,
    ttlMs,
  };
}

function parseRedisPipelinePair(result: unknown): [unknown, unknown] | null {
  if (!Array.isArray(result) || result.length < 2) {
    return null;
  }

  const [first, second] = result;
  if (Array.isArray(first) && Array.isArray(second) && first.length >= 2 && second.length >= 2) {
    return [first[1], second[1]];
  }

  return [first, second];
}

function normalizeRedisPrefix(prefix: string) {
  return prefix
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, ":")
    .replace(/:{2,}/g, ":")
    .replace(/^:+|:+$/g, "")
    || "sqr:rate-limit";
}

export function createRedisReconnectStrategy(logger: LoggerLike = defaultLogger) {
  return (retries: number, cause?: Error) => {
    const normalizedRetries = Math.max(0, Math.trunc(Number(retries) || 0));
    const delayMs = Math.min(
      REDIS_RECONNECT_MAX_DELAY_MS,
      REDIS_RECONNECT_BASE_DELAY_MS * (2 ** Math.min(normalizedRetries, 6)),
    );

    logger.warn("Redis rate-limit store reconnect scheduled", {
      delayMs,
      error: cause instanceof Error ? cause.message : undefined,
      retries: normalizedRetries,
    });

    return delayMs;
  };
}

export class RedisRateLimitStore implements Store {
  readonly localKeys = false;
  readonly prefix: string;

  private readonly config: SharedRateLimitStoreConfig;
  private readonly createRedisClient: RedisClientFactory | null;
  private readonly fallbackStore: BoundedMemoryRateLimitStore;
  private readonly logger: LoggerLike;
  private readonly now: () => number;
  private client: RedisClientLike | null = null;
  private clientPromise: Promise<RedisClientLike | null> | null = null;
  private lastWarningAt = 0;
  private shuttingDown = false;
  private warningEmitted = false;
  private readonly warningRepeatMs: number;
  private windowMs = 60_000;

  constructor(options: RedisRateLimitStoreOptions) {
    this.config = options.config;
    this.createRedisClient = options.createRedisClient ?? null;
    this.logger = options.logger ?? defaultLogger;
    this.now = options.now ?? Date.now;
    this.fallbackStore = new BoundedMemoryRateLimitStore(this.now);
    this.prefix = normalizeRedisPrefix(options.prefix);
    this.warningRepeatMs = Math.max(1, Math.trunc(Number(options.warningRepeatMs ?? REDIS_UNAVAILABLE_WARNING_REPEAT_MS)));
  }

  init(options: Options) {
    this.windowMs = Math.max(1, Math.trunc(options.windowMs));
    this.fallbackStore.init(options);
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const client = await this.getClient();
    if (!client) {
      this.recordFallbackUsage();
      return this.fallbackStore.get(key);
    }

    try {
      const redisKey = this.buildRedisKey(key);
      const [rawHits, rawTtl] = await this.getRedisHitsAndTtl(client, redisKey);
      const totalHits = parseRedisInteger(rawHits);
      const ttlMs = parseRedisInteger(rawTtl);
      if (!totalHits || ttlMs == null || ttlMs < 0) {
        return undefined;
      }

      return {
        totalHits,
        resetTime: new Date(Date.now() + ttlMs),
      };
    } catch (error) {
      this.handleRedisFailure(error);
      this.recordFallbackUsage();
      return this.fallbackStore.get(key);
    }
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const client = await this.getClient();
    if (!client) {
      this.recordFallbackUsage();
      return this.fallbackStore.increment(key);
    }

    try {
      const result = this.parseIncrementResult(
        await client.eval(REDIS_INCREMENT_SCRIPT, {
          keys: [this.buildRedisKey(key)],
          arguments: [String(this.windowMs)],
        }),
      );
      if (!result) {
        throw new Error("Redis rate-limit increment returned an invalid response.");
      }

      return {
        totalHits: result.totalHits,
        resetTime: new Date(Date.now() + Math.max(0, result.ttlMs)),
      };
    } catch (error) {
      this.handleRedisFailure(error);
      this.recordFallbackUsage();
      return this.fallbackStore.increment(key);
    }
  }

  async decrement(key: string): Promise<void> {
    const client = await this.getClient();
    if (!client) {
      this.recordFallbackUsage();
      await this.fallbackStore.decrement(key);
      return;
    }

    try {
      const redisKey = this.buildRedisKey(key);
      const nextHits = parseRedisInteger(await client.decr(redisKey)) ?? 0;
      if (nextHits <= 0) {
        await client.del(redisKey);
      }
    } catch (error) {
      this.handleRedisFailure(error);
      this.recordFallbackUsage();
      await this.fallbackStore.decrement(key);
    }
  }

  async resetKey(key: string): Promise<void> {
    const client = await this.getClient();
    if (!client) {
      this.recordFallbackUsage();
      await this.fallbackStore.resetKey(key);
      return;
    }

    try {
      await client.del(this.buildRedisKey(key));
    } catch (error) {
      this.handleRedisFailure(error);
      this.recordFallbackUsage();
      await this.fallbackStore.resetKey(key);
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    this.fallbackStore.shutdown();
    const pendingClient = await this.clientPromise?.catch(() => null);
    const client = this.client ?? pendingClient;
    this.client = null;
    this.clientPromise = null;
    if (client?.quit) {
      await client.quit().catch((error) => {
        this.logRedisFailure(error, { allowDuringShutdown: true });
      });
    }
  }

  private buildRedisKey(key: string) {
    const digest = crypto.createHash("sha256").update(key).digest("hex");
    return `${this.prefix}:${digest}`;
  }

  private async getRedisHitsAndTtl(client: RedisClientLike, redisKey: string): Promise<[unknown, unknown]> {
    if (typeof client.multi === "function") {
      const pipelineResult = parseRedisPipelinePair(
        await client.multi().get(redisKey).pTTL(redisKey).exec(),
      );
      if (!pipelineResult) {
        throw new Error("Redis rate-limit GET+PTTL pipeline returned an invalid response.");
      }
      return pipelineResult;
    }

    return Promise.all([
      client.get(redisKey),
      client.pTTL(redisKey),
    ]);
  }

  private recordFallbackUsage() {
    internalMetrics.increment("redisRateLimitFallbackMemoryStoreUsesTotal");
  }

  getFallbackStoreSizeForTests(): number {
    return this.fallbackStore.size;
  }

  private parseIncrementResult(result: unknown): { totalHits: number; ttlMs: number } | null {
    const parsed = RedisIncrementEvalResultSchema.safeParse(result);
    if (!parsed.success) {
      internalMetrics.increment("redisRateLimitEvalTypeErrorsTotal");
      this.logger.warn("Redis rate-limit eval returned an invalid response; falling back to process-local memory", {
        event: "redis_rate_limit_eval_type_error",
        issues: parsed.error.issues.length,
      });
      return null;
    }

    return mapIncrementEvalResult(parsed.data);
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

  private async connect(): Promise<RedisClientLike | null> {
    let client: RedisClientLike | null = null;

    try {
      const createRedisClient = this.createRedisClient ?? await resolveDefaultRedisClientFactory();
      client = createRedisClient({
        url: this.config.redisUrl as string,
        socket: {
          reconnectStrategy: createRedisReconnectStrategy(this.logger),
        },
      });
      this.attachRedisClientEventHandlers(client);
      await client.connect();

      if (this.shuttingDown) {
        await this.closeClient(client);
        return null;
      }

      this.client = client;
      this.warningEmitted = false;
      this.lastWarningAt = 0;
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
    if (this.warningEmitted) {
      void this.closeClient(client);
      return;
    }

    void this.closeClient(client);
    this.logRedisFailure(error);
  }

  private attachRedisClientEventHandlers(client: RedisClientLike): void {
    client.on?.("error", (error) => {
      if (this.shuttingDown) {
        return;
      }
      this.logRedisFailure(error);
    });
    client.on?.("end", () => {
      this.handleRedisDisconnect(client, "end");
    });
    client.on?.("close", () => {
      this.handleRedisDisconnect(client, "close");
    });
  }

  private handleRedisDisconnect(client: RedisClientLike, event: "close" | "end"): void {
    if (this.shuttingDown) {
      return;
    }

    if (this.client === client) {
      this.client = null;
    }

    this.logRedisFailure(new Error(`Redis client emitted ${event}`));
  }

  private logRedisFailure(error: unknown, options: { allowDuringShutdown?: boolean } = {}) {
    if (this.shuttingDown && !options.allowDuringShutdown) {
      return;
    }

    const now = this.now();
    if (this.warningEmitted && now - this.lastWarningAt < this.warningRepeatMs) {
      return;
    }

    this.warningEmitted = true;
    this.lastWarningAt = now;
    this.logger.warn("Redis rate-limit store unavailable; falling back to process-local memory", {
      provider: this.config.provider,
      error: error instanceof Error ? error.message : "Unknown Redis failure",
    });
  }

  private async closeClient(client: RedisClientLike | null) {
    if (!client?.quit) {
      return;
    }

    await client.quit().catch(() => undefined);
  }
}

export function createSharedRateLimitStore(options: {
  config: SharedRateLimitStoreConfig;
  prefix: string;
}): Store | undefined {
  if (options.config.provider !== "redis") {
    return undefined;
  }

  return new RedisRateLimitStore(options);
}
