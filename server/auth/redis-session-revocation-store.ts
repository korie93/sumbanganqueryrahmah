import crypto from "node:crypto";
import { logger as defaultLogger } from "../lib/logger";
import { internalMetrics } from "../internal/metrics";
import {
  clearStartupServiceDegraded,
  markStartupServiceDegraded,
} from "../internal/startup-health";
import type { SharedRateLimitStoreConfig } from "../middleware/rate-limit-runtime";
import {
  createRedisReconnectStrategy,
  REDIS_UNAVAILABLE_WARNING_REPEAT_MS,
} from "../middleware/redis-rate-limit-store";
import type { SessionRevocationRecord, SessionRevocationStore } from "./session-revocation-store";

type LoggerLike = Pick<typeof defaultLogger, "warn"> & Partial<Pick<typeof defaultLogger, "error">>;

type RedisSessionRevocationClientLike = {
  connect: () => Promise<unknown>;
  eval?: (
    script: string,
    options: { arguments: string[]; keys: string[] },
  ) => Promise<unknown>;
  get: (key: string) => Promise<unknown>;
  on?: (event: string, listener: (error: unknown) => void) => unknown;
  quit?: () => Promise<unknown>;
  set: (key: string, value: string, options: { NX?: boolean; PX: number }) => Promise<unknown>;
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
const SESSION_REVOCATION_HEALTH_SERVICE = "session-revocation-store";
const SESSION_REVOCATION_DEGRADED_REASON = "SESSION_REVOCATION_REDIS_UNAVAILABLE";
const SESSION_REVOCATION_FAIL_CLOSED_MODE = "fail-closed-mode";
const SESSION_REVOCATION_VALUE = "1";
const ATOMIC_REVOKE_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if existing then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX')
return 1
`;

// AUDIT-FIX [M2]: production HA depends on a managed Redis/Sentinel/cluster endpoint
// with persistence and failover; a single local Redis node is acceptable only for strict
// local development because revocation checks intentionally fail closed on outages.
let defaultRedisClientFactoryPromise: Promise<RedisSessionRevocationClientFactory> | null = null;

export enum RedisSessionRevocationErrorClass {
  NON_RETRYABLE = "NON_RETRYABLE",
  RETRYABLE = "RETRYABLE",
  UNKNOWN = "UNKNOWN",
}

export class RedisSessionRevocationUnavailableError extends Error {
  constructor(message = "Redis session revocation store is unavailable.") {
    super(message);
    this.name = "RedisSessionRevocationUnavailableError";
  }
}

type RedisSessionRevocationErrorLike = {
  code?: unknown;
  name?: unknown;
};

const RETRYABLE_REDIS_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "NR_CLOSED",
  "SOCKET_CLOSED",
]);

const NON_RETRYABLE_REDIS_ERROR_CODES = new Set([
  "NOAUTH",
  "NOPERM",
  "WRONGPASS",
  "WRONGTYPE",
]);

function readRedisErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "";
  }

  const errorLike = error as RedisSessionRevocationErrorLike;
  return typeof errorLike.code === "string" ? errorLike.code.trim().toUpperCase() : "";
}

function readRedisErrorName(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "";
  }

  const errorLike = error as RedisSessionRevocationErrorLike;
  return typeof errorLike.name === "string" ? errorLike.name.trim() : "";
}

export function classifyRedisSessionRevocationError(error: unknown): RedisSessionRevocationErrorClass {
  const code = readRedisErrorCode(error);
  if (RETRYABLE_REDIS_ERROR_CODES.has(code)) {
    return RedisSessionRevocationErrorClass.RETRYABLE;
  }
  if (NON_RETRYABLE_REDIS_ERROR_CODES.has(code)) {
    return RedisSessionRevocationErrorClass.NON_RETRYABLE;
  }

  const name = readRedisErrorName(error).toLowerCase();
  if (name.includes("timeout") || name.includes("socket") || name.includes("connection")) {
    return RedisSessionRevocationErrorClass.RETRYABLE;
  }
  if (name.includes("auth") || name.includes("permission")) {
    return RedisSessionRevocationErrorClass.NON_RETRYABLE;
  }
  return RedisSessionRevocationErrorClass.UNKNOWN;
}

function sanitizeRedisSessionRevocationError(error: unknown): Record<string, string> | undefined {
  const code = readRedisErrorCode(error);
  const name = readRedisErrorName(error);
  return {
    ...(code ? { code } : {}),
    ...(name ? { name } : {}),
  };
}

function buildFailClosedHealthDetail(classification: RedisSessionRevocationErrorClass): string {
  return `${SESSION_REVOCATION_FAIL_CLOSED_MODE}:${classification}`;
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
  private readonly pendingRevocationKeys = new Set<string>();
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
    const redisKey = this.buildRedisKey(jwtId);
    if (this.pendingRevocationKeys.has(redisKey)) {
      return true;
    }

    const client = await this.getClient();
    if (!client) {
      this.logRedisFailure(new Error("Redis session revocation store is unavailable."));
      return true;
    }

    try {
      const value = await client.get(redisKey);
      this.recordRedisRecovery();
      return value != null;
    } catch (error) {
      this.handleRedisFailure(error, "isRevoked");
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

    const redisKey = this.buildRedisKey(record.jwtId);
    this.pendingRevocationKeys.add(redisKey);
    try {
      await this.writeRevocationAtomically(client, redisKey, resolveTtlMs(record.expiresAtMs));
      this.recordRedisRecovery();
    } catch (error) {
      this.handleRedisFailure(error, "revoke");
      throw new RedisSessionRevocationUnavailableError(
        "Redis session revocation write failed.",
      );
    } finally {
      this.pendingRevocationKeys.delete(redisKey);
    }
  }

  async close() {
    this.shuttingDown = true;
    const pendingClient = await (this.clientPromise?.catch(() => null) ?? null);
    const client = this.client ?? pendingClient;
    this.client = null;
    this.clientPromise = null;
    this.pendingRevocationKeys.clear();
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
        .catch((error) => {
          this.logRedisFailure(error, "connect-finalize");
        });
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
      this.recordRedisRecovery();
      return client;
    } catch (error) {
      await this.closeClient(client);
      this.logRedisFailure(error, "connect");
      return null;
    }
  }

  private async writeRevocationAtomically(
    client: RedisSessionRevocationClientLike,
    redisKey: string,
    ttlMs: number,
  ) {
    if (client.eval) {
      await client.eval(ATOMIC_REVOKE_SCRIPT, {
        arguments: [SESSION_REVOCATION_VALUE, String(ttlMs)],
        keys: [redisKey],
      });
      return;
    }

    await client.set(redisKey, SESSION_REVOCATION_VALUE, { NX: true, PX: ttlMs });
  }

  private handleRedisFailure(error: unknown, operation: string) {
    const client = this.client;
    this.client = null;
    void this.closeClient(client);
    this.logRedisFailure(error, operation);
  }

  private logRedisFailure(error: unknown, operation = "unknown") {
    const classification = classifyRedisSessionRevocationError(error);
    internalMetrics.increment("sessionRevocationRedisErrorsTotal");

    const now = this.now();
    if (this.warningEmitted && now - this.lastWarningAt < this.warningRepeatMs) {
      return;
    }
    markStartupServiceDegraded(
      SESSION_REVOCATION_HEALTH_SERVICE,
      SESSION_REVOCATION_DEGRADED_REASON,
      buildFailClosedHealthDetail(classification),
    );
    this.warningEmitted = true;
    this.lastWarningAt = now;
    const logPayload = {
      classification,
      error: sanitizeRedisSessionRevocationError(error),
      event: "session_revocation_redis_failure",
      operation,
      provider: this.config.provider,
      retryable: classification === RedisSessionRevocationErrorClass.RETRYABLE,
    };
    const log = this.logger.error ?? this.logger.warn;
    log.call(
      this.logger,
      "Redis session revocation store unavailable; rejecting session checks closed",
      logPayload,
    );
  }

  private recordRedisRecovery() {
    clearStartupServiceDegraded(SESSION_REVOCATION_HEALTH_SERVICE);
    this.warningEmitted = false;
    this.lastWarningAt = 0;
  }

  private async closeClient(client: RedisSessionRevocationClientLike | null) {
    if (!client?.quit) {
      return;
    }

    try {
      await client.quit();
    } catch (error) {
      this.logRedisFailure(error, "close");
    }
  }
}

export function createSessionRevocationStore(config: SharedRateLimitStoreConfig): SessionRevocationStore | null {
  if (config.provider !== "redis") {
    return null;
  }

  return new RedisSessionRevocationStore({ config });
}
