import crypto from "node:crypto";
import { logger as defaultLogger } from "../lib/logger";
import type { SharedRateLimitStoreConfig } from "../middleware/rate-limit-runtime";
import {
  createRedisReconnectStrategy,
  REDIS_UNAVAILABLE_WARNING_REPEAT_MS,
} from "../middleware/redis-rate-limit-store";
import type { SessionRevocationRecord, SessionRevocationStore } from "./session-revocation-store";

type LoggerLike = Pick<typeof defaultLogger, "warn">;

type RedisSessionRevocationClientLike = {
  connect: () => Promise<unknown>;
  get: (key: string) => Promise<unknown>;
  on?: (event: string, listener: (error: unknown) => void) => unknown;
  quit?: () => Promise<unknown>;
  set: (key: string, value: string, options: { PX: number }) => Promise<unknown>;
};

type RedisSessionRevocationClientFactory = (options: {
  socket: { reconnectStrategy: (retries: number, cause?: Error) => number | false };
  url: string;
}) => RedisSessionRevocationClientLike;

type RedisSessionRevocationStoreOptions = {
  config: SharedRateLimitStoreConfig;
  createRedisClient?: RedisSessionRevocationClientFactory;
  logger?: LoggerLike;
  now?: () => number;
  prefix?: string;
  warningRepeatMs?: number;
};

const MIN_REVOCATION_TTL_MS = 1_000;
const DEFAULT_REVOCATION_TTL_MS = 24 * 60 * 60 * 1000;

let defaultRedisClientFactoryPromise: Promise<RedisSessionRevocationClientFactory> | null = null;

export class RedisSessionRevocationUnavailableError extends Error {
  constructor(message = "Redis session revocation store is unavailable.") {
    super(message);
    this.name = "RedisSessionRevocationUnavailableError";
  }
}

async function resolveDefaultRedisClientFactory(): Promise<RedisSessionRevocationClientFactory> {
  defaultRedisClientFactoryPromise ??= import("redis")
    .then((redisModule) => redisModule.createClient as unknown as RedisSessionRevocationClientFactory);
  return defaultRedisClientFactoryPromise;
}

function normalizeRedisPrefix(prefix: string | undefined) {
  return String(prefix || "sqr:session-revoked")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, ":")
    .replace(/:{2,}/g, ":")
    .replace(/^:+|:+$/g, "")
    || "sqr:session-revoked";
}

function resolveTtlMs(expiresAtMs: number, now = Date.now()): number {
  const parsed = Math.trunc(Number(expiresAtMs));
  if (!Number.isFinite(parsed) || parsed <= now) {
    return DEFAULT_REVOCATION_TTL_MS;
  }
  return Math.max(MIN_REVOCATION_TTL_MS, parsed - now);
}

export class RedisSessionRevocationStore implements SessionRevocationStore {
  private readonly config: SharedRateLimitStoreConfig;
  private readonly createRedisClient: RedisSessionRevocationClientFactory | null;
  private readonly logger: LoggerLike;
  private readonly now: () => number;
  private readonly prefix: string;
  private client: RedisSessionRevocationClientLike | null = null;
  private clientPromise: Promise<RedisSessionRevocationClientLike | null> | null = null;
  private lastWarningAt = 0;
  private shuttingDown = false;
  private warningEmitted = false;
  private readonly warningRepeatMs: number;

  constructor(options: RedisSessionRevocationStoreOptions) {
    this.config = options.config;
    this.createRedisClient = options.createRedisClient ?? null;
    this.logger = options.logger ?? defaultLogger;
    this.now = options.now ?? Date.now;
    this.prefix = normalizeRedisPrefix(options.prefix);
    this.warningRepeatMs = Math.max(1, Math.trunc(Number(options.warningRepeatMs ?? REDIS_UNAVAILABLE_WARNING_REPEAT_MS)));
  }

  async isRevoked(jwtId: string): Promise<boolean> {
    const client = await this.getClient();
    if (!client) {
      this.logRedisFailure(new Error("Redis session revocation store is unavailable."));
      return true;
    }

    try {
      const value = await client.get(this.buildRedisKey(jwtId));
      this.warningEmitted = false;
      this.lastWarningAt = 0;
      return value != null;
    } catch (error) {
      this.handleRedisFailure(error);
      return true;
    }
  }

  async revoke(record: SessionRevocationRecord): Promise<void> {
    const client = await this.getClient();
    if (!client) {
      const error = new RedisSessionRevocationUnavailableError();
      this.logRedisFailure(error);
      throw error;
    }

    try {
      await client.set(
        this.buildRedisKey(record.jwtId),
        "1",
        { PX: resolveTtlMs(record.expiresAtMs) },
      );
      this.warningEmitted = false;
      this.lastWarningAt = 0;
    } catch (error) {
      this.handleRedisFailure(error);
      throw new RedisSessionRevocationUnavailableError(
        "Redis session revocation write failed.",
      );
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

  private buildRedisKey(jwtId: string) {
    const digest = crypto.createHash("sha256").update(String(jwtId || "")).digest("hex");
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

  private async connect(): Promise<RedisSessionRevocationClientLike | null> {
    let client: RedisSessionRevocationClientLike | null = null;
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
    void this.closeClient(client);
    this.logRedisFailure(error);
  }

  private logRedisFailure(error: unknown) {
    const now = this.now();
    if (this.warningEmitted && now - this.lastWarningAt < this.warningRepeatMs) {
      return;
    }
    this.warningEmitted = true;
    this.lastWarningAt = now;
    this.logger.warn("Redis session revocation store unavailable; rejecting session checks closed", {
      provider: this.config.provider,
      error: error instanceof Error ? error.message : "Unknown Redis failure",
    });
  }

  private async closeClient(client: RedisSessionRevocationClientLike | null) {
    await client?.quit?.().catch(() => undefined);
  }
}

export function createSessionRevocationStore(config: SharedRateLimitStoreConfig): SessionRevocationStore | null {
  if (config.provider !== "redis") {
    return null;
  }

  return new RedisSessionRevocationStore({ config });
}
