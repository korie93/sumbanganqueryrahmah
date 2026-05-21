import crypto from "node:crypto";
import {
  MemoryStore,
  type ClientRateLimitInfo,
  type Options,
  type Store,
} from "express-rate-limit";
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
  on?: (event: string, listener: (error: unknown) => void) => unknown;
  pTTL: (key: string) => Promise<unknown>;
  quit?: () => Promise<unknown>;
};

type RedisClientFactory = (options: {
  socket: { reconnectStrategy: (retries: number, cause?: Error) => number | false };
  url: string;
}) => RedisClientLike;

type RedisRateLimitStoreOptions = {
  config: SharedRateLimitStoreConfig;
  createRedisClient?: RedisClientFactory;
  logger?: LoggerLike;
  prefix: string;
};

const REDIS_INCREMENT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return { current, ttl }
`;

let defaultRedisClientFactoryPromise: Promise<RedisClientFactory> | null = null;

const REDIS_RECONNECT_BASE_DELAY_MS = 500;
const REDIS_RECONNECT_MAX_DELAY_MS = 30_000;

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

function parseIncrementResult(result: unknown): { totalHits: number; ttlMs: number } | null {
  if (!Array.isArray(result) || result.length < 2) {
    return null;
  }

  const totalHits = parseRedisInteger(result[0]);
  const ttlMs = parseRedisInteger(result[1]);
  if (totalHits == null || ttlMs == null) {
    return null;
  }

  return {
    totalHits,
    ttlMs,
  };
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
  private readonly logger: LoggerLike;
  private readonly fallbackStore = new MemoryStore();
  private clientPromise: Promise<RedisClientLike | null> | null = null;
  private warningEmitted = false;
  private windowMs = 60_000;

  constructor(options: RedisRateLimitStoreOptions) {
    this.config = options.config;
    this.createRedisClient = options.createRedisClient ?? null;
    this.logger = options.logger ?? defaultLogger;
    this.prefix = normalizeRedisPrefix(options.prefix);
  }

  init(options: Options) {
    this.windowMs = Math.max(1, Math.trunc(options.windowMs));
    this.fallbackStore.init(options);
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const client = await this.getClient();
    if (!client) {
      return this.fallbackStore.get(key);
    }

    try {
      const redisKey = this.buildRedisKey(key);
      const [rawHits, rawTtl] = await Promise.all([
        client.get(redisKey),
        client.pTTL(redisKey),
      ]);
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
      return this.fallbackStore.get(key);
    }
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const client = await this.getClient();
    if (!client) {
      return this.fallbackStore.increment(key);
    }

    try {
      const result = parseIncrementResult(
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
      return this.fallbackStore.increment(key);
    }
  }

  async decrement(key: string): Promise<void> {
    const client = await this.getClient();
    if (!client) {
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
      await this.fallbackStore.decrement(key);
    }
  }

  async resetKey(key: string): Promise<void> {
    const client = await this.getClient();
    if (!client) {
      await this.fallbackStore.resetKey(key);
      return;
    }

    try {
      await client.del(this.buildRedisKey(key));
    } catch (error) {
      this.handleRedisFailure(error);
      await this.fallbackStore.resetKey(key);
    }
  }

  async shutdown(): Promise<void> {
    this.fallbackStore.shutdown();
    const client = await this.clientPromise?.catch(() => null);
    this.clientPromise = null;
    if (client?.quit) {
      await client.quit().catch((error) => {
        this.handleRedisFailure(error);
      });
    }
  }

  private buildRedisKey(key: string) {
    const digest = crypto.createHash("sha256").update(key).digest("hex");
    return `${this.prefix}:${digest}`;
  }

  private async getClient() {
    if (this.config.provider !== "redis" || !this.config.redisUrl) {
      return null;
    }

    this.clientPromise ??= this.connect();
    return this.clientPromise;
  }

  private async connect(): Promise<RedisClientLike | null> {
    try {
      const createRedisClient = this.createRedisClient ?? await resolveDefaultRedisClientFactory();
      const client = createRedisClient({
        url: this.config.redisUrl as string,
        socket: {
          reconnectStrategy: createRedisReconnectStrategy(this.logger),
        },
      });
      client.on?.("error", (error) => {
        this.handleRedisFailure(error);
      });
      await client.connect();
      return client;
    } catch (error) {
      this.handleRedisFailure(error);
      return null;
    }
  }

  private handleRedisFailure(error: unknown) {
    this.clientPromise = null;
    if (this.warningEmitted) {
      return;
    }

    this.warningEmitted = true;
    this.logger.warn("Redis rate-limit store unavailable; falling back to process-local memory", {
      provider: this.config.provider,
      error: error instanceof Error ? error.message : "Unknown Redis failure",
    });
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
