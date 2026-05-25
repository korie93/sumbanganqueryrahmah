import crypto from "node:crypto";
import { logger as defaultLogger } from "../lib/logger";
import type { SharedRateLimitStoreConfig } from "../middleware/rate-limit-runtime";
import { REDIS_UNAVAILABLE_WARNING_REPEAT_MS } from "../middleware/redis-rate-limit-store";
import {
  buildTwoFactorReplayKey,
  type ConsumeTwoFactorReplayCodeParams,
  type TwoFactorReplayStore,
} from "./two-factor-replay-cache";

type LoggerLike = Pick<typeof defaultLogger, "warn">;

type RedisTwoFactorReplayClientLike = {
  connect: () => Promise<unknown>;
  on?: (event: string, listener: (error: unknown) => void) => unknown;
  quit?: () => Promise<unknown>;
  set: (
    key: string,
    value: string,
    options: { NX: true; PX: number },
  ) => Promise<unknown>;
};

type RedisTwoFactorReplayClientFactory = (options: {
  socket: { reconnectStrategy: (retries: number, cause?: Error) => number | false };
  url: string;
}) => RedisTwoFactorReplayClientLike;

type RedisTwoFactorReplayStoreOptions = {
  config: SharedRateLimitStoreConfig;
  createRedisClient?: RedisTwoFactorReplayClientFactory;
  logger?: LoggerLike;
  now?: () => number;
  prefix?: string;
  ttlMs?: number;
  warningRepeatMs?: number;
};

const DEFAULT_TWO_FACTOR_REDIS_REPLAY_TTL_MS = 120_000;
const REDIS_RECONNECT_BASE_DELAY_MS = 500;
const REDIS_RECONNECT_MAX_DELAY_MS = 30_000;
let defaultRedisClientFactoryPromise: Promise<RedisTwoFactorReplayClientFactory> | null = null;

async function resolveDefaultRedisClientFactory(): Promise<RedisTwoFactorReplayClientFactory> {
  defaultRedisClientFactoryPromise ??= import("redis")
    .then((redisModule) => redisModule.createClient as unknown as RedisTwoFactorReplayClientFactory);

  return defaultRedisClientFactoryPromise;
}

function normalizeRedisPrefix(prefix: string) {
  return prefix
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, ":")
    .replace(/:{2,}/g, ":")
    .replace(/^:+|:+$/g, "")
    || "sqr:two-factor-replay";
}

function isRedisSetNxSuccess(result: unknown) {
  return result === "OK" || result === true;
}

function isRedisSetNxConflict(result: unknown) {
  return result == null || result === false;
}

export function createTwoFactorReplayRedisReconnectStrategy(logger: LoggerLike = defaultLogger) {
  return (retries: number, cause?: Error) => {
    const normalizedRetries = Math.max(0, Math.trunc(Number(retries) || 0));
    const delayMs = Math.min(
      REDIS_RECONNECT_MAX_DELAY_MS,
      REDIS_RECONNECT_BASE_DELAY_MS * (2 ** Math.min(normalizedRetries, 6)),
    );

    logger.warn("Redis 2FA replay store reconnect scheduled", {
      delayMs,
      error: cause instanceof Error ? cause.message : undefined,
      retries: normalizedRetries,
    });

    return delayMs;
  };
}

export class RedisTwoFactorReplayStore implements TwoFactorReplayStore {
  private readonly config: SharedRateLimitStoreConfig;
  private readonly createRedisClient: RedisTwoFactorReplayClientFactory | null;
  private readonly logger: LoggerLike;
  private readonly now: () => number;
  private readonly prefix: string;
  private readonly ttlMs: number;
  private client: RedisTwoFactorReplayClientLike | null = null;
  private clientPromise: Promise<RedisTwoFactorReplayClientLike | null> | null = null;
  private lastWarningAt = 0;
  private shuttingDown = false;
  private warningEmitted = false;
  private readonly warningRepeatMs: number;

  constructor(options: RedisTwoFactorReplayStoreOptions) {
    this.config = options.config;
    this.createRedisClient = options.createRedisClient ?? null;
    this.logger = options.logger ?? defaultLogger;
    this.now = options.now ?? Date.now;
    this.prefix = normalizeRedisPrefix(options.prefix ?? "sqr:two-factor-replay");
    this.ttlMs = Math.max(1_000, Math.trunc(Number(options.ttlMs || DEFAULT_TWO_FACTOR_REDIS_REPLAY_TTL_MS)));
    this.warningRepeatMs = Math.max(1, Math.trunc(Number(options.warningRepeatMs ?? REDIS_UNAVAILABLE_WARNING_REPEAT_MS)));
  }

  async consume(params: ConsumeTwoFactorReplayCodeParams) {
    const replayKey = buildTwoFactorReplayKey(params);
    if (!replayKey) {
      return false;
    }

    const client = await this.getClient();
    if (!client) {
      return false;
    }

    try {
      const result = await client.set(this.buildRedisKey(replayKey), "1", {
        NX: true,
        PX: this.ttlMs,
      });

      if (isRedisSetNxSuccess(result)) {
        this.warningEmitted = false;
        this.lastWarningAt = 0;
        return true;
      }
      if (isRedisSetNxConflict(result)) {
        this.warningEmitted = false;
        this.lastWarningAt = 0;
        return false;
      }

      throw new Error("Redis TOTP replay SET NX returned an invalid response.");
    } catch (error) {
      this.handleRedisFailure(error);
      return false;
    }
  }

  async close() {
    this.shuttingDown = true;
    const pendingClient = await this.clientPromise?.catch(() => null);
    const client = this.client ?? pendingClient;
    this.client = null;
    this.clientPromise = null;
    if (client?.quit) {
      await client.quit().catch((error) => {
        this.logRedisFailure(error);
      });
    }
  }

  private buildRedisKey(replayKey: string) {
    const digest = crypto.createHash("sha256").update(replayKey).digest("hex");
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

  private async connect(): Promise<RedisTwoFactorReplayClientLike | null> {
    let client: RedisTwoFactorReplayClientLike | null = null;

    try {
      const createRedisClient = this.createRedisClient ?? await resolveDefaultRedisClientFactory();
      client = createRedisClient({
        url: this.config.redisUrl as string,
        socket: {
          reconnectStrategy: createTwoFactorReplayRedisReconnectStrategy(this.logger),
        },
      });
      client.on?.("error", (error) => {
        this.logRedisFailure(error);
      });
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
    this.logger.warn("Redis 2FA replay store unavailable; rejecting TOTP replay checks closed", {
      provider: this.config.provider,
      error: error instanceof Error ? error.message : "Unknown Redis failure",
    });
  }

  private async closeClient(client: RedisTwoFactorReplayClientLike | null) {
    if (!client?.quit) {
      return;
    }

    await client.quit().catch(() => undefined);
  }
}

export function createTwoFactorReplayStore(config: SharedRateLimitStoreConfig): TwoFactorReplayStore | null {
  if (config.provider !== "redis") {
    return null;
  }

  return new RedisTwoFactorReplayStore({ config });
}
