import crypto from "node:crypto";
import { setMaxListeners } from "node:events";
import { logger as defaultLogger } from "../lib/logger";
import { internalMetrics } from "../internal/metrics";
import {
  clearStartupServiceDegraded,
  markStartupServiceDegraded,
} from "../internal/startup-health";
import { isProductionLikeEnvironment } from "../config/runtime-environment";
import type { SharedRateLimitStoreConfig } from "../middleware/rate-limit-runtime";
import {
  createRedisReconnectStrategy,
  REDIS_UNAVAILABLE_WARNING_REPEAT_MS,
} from "../middleware/redis-rate-limit-store";
import type { SessionRevocationRecord, SessionRevocationStore } from "./session-revocation-store";

type LoggerLike = Pick<typeof defaultLogger, "warn"> & Partial<Pick<typeof defaultLogger, "error">>;

type RedisSessionRevocationClientLike = {
  connect: () => Promise<unknown>;
  destroy?: () => void;
  eval?: (
    script: string,
    options: { arguments: string[]; keys: string[] },
  ) => Promise<unknown>;
  get: (key: string) => Promise<unknown>;
  on?: (event: string, listener: (error: unknown) => void) => unknown;
  quit?: () => Promise<unknown>;
  set: (key: string, value: string, options: { NX?: boolean; PX: number }) => Promise<unknown>;
};

type RedisSessionRevocationSocketOptions = {
  reconnectStrategy: (retries: number, cause?: Error) => number | false;
  rejectUnauthorized?: boolean;
  tls?: boolean;
};

type RedisSessionRevocationClientFactory = (options: {
  socket: RedisSessionRevocationSocketOptions;
  url: string;
}) => RedisSessionRevocationClientLike;

type RedisSessionRevocationStoreOptions = {
  config: SharedRateLimitStoreConfig;
  createRedisClient?: RedisSessionRevocationClientFactory;
  logger?: LoggerLike;
  now?: () => number;
  prefix?: string;
  recoveryTimeoutMs?: number;
  recoveryRetryMs?: number;
  warningRepeatMs?: number;
};

type RedisConnection = {
  client: RedisSessionRevocationClientLike;
  cancellation: AbortController;
  pendingWrites: number;
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

export function resolveRedisSessionRevocationSocketOptions(
  redisLogger: LoggerLike,
  redisUrl?: string | null,
): RedisSessionRevocationSocketOptions {
  const reconnectStrategy = createRedisReconnectStrategy(redisLogger);
  if (!isProductionLikeEnvironment()) {
    return { reconnectStrategy };
  }

  if (isLoopbackRedisUrl(redisUrl)) {
    return { reconnectStrategy };
  }

  if (!isTlsRedisUrl(redisUrl)) {
    throw new Error(
      "Production Redis session revocation URL must use rediss:// unless it targets loopback.",
    );
  }

  return {
    // AUDIT-FIX [M4]: production revocation Redis must use TLS with peer verification.
    reconnectStrategy,
    rejectUnauthorized: true,
    tls: true,
  };
}

function isTlsRedisUrl(redisUrl: string | null | undefined): boolean {
  try {
    return new URL(String(redisUrl || "")).protocol === "rediss:";
  } catch {
    return false;
  }
}

function isLoopbackRedisUrl(redisUrl: string | null | undefined): boolean {
  try {
    const url = new URL(String(redisUrl || ""));
    if (url.protocol !== "redis:") {
      return false;
    }
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

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

function boundedRecoveryDelay(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(60_000, Math.trunc(value))) : 5_000;
}

export class RedisSessionRevocationStore implements SessionRevocationStore {
  private readonly config: SharedRateLimitStoreConfig;
  private readonly createRedisClient: RedisSessionRevocationClientFactory | null;
  private readonly logger: LoggerLike;
  private readonly now: () => number;
  private readonly prefix: string;
  private connection: RedisConnection | null = null;
  private clientPromise: Promise<RedisConnection | null> | null = null;
  private recoveryPromise: Promise<void> | null = null;
  private recoveryTimer: NodeJS.Timeout | null = null;
  private readonly recoveryTimeoutMs: number;
  private readonly recoveryRetryMs: number;
  private readonly recoveryProbeKey: string;
  private failureVersion = 0;
  private degraded = false;
  private writeFailure = false;
  private lastWarningAt = 0;
  private readonly pendingRevocationKeys = new Map<string, number>();
  private shuttingDown = false;
  private warningEmitted = false;
  private readonly warningRepeatMs: number;

  constructor(options: RedisSessionRevocationStoreOptions) {
    this.config = options.config;
    this.createRedisClient = options.createRedisClient ?? null;
    this.logger = options.logger ?? defaultLogger;
    this.now = options.now ?? Date.now;
    this.prefix = normalizeRedisPrefix(options.prefix);
    this.recoveryTimeoutMs = boundedRecoveryDelay(options.recoveryTimeoutMs);
    this.recoveryRetryMs = boundedRecoveryDelay(options.recoveryRetryMs);
    // Read-only, unguessable probe in the same ACL namespace; never a real JWT or a write.
    this.recoveryProbeKey = this.buildRedisKey(crypto.randomUUID());
    this.warningRepeatMs = Math.max(1, Math.trunc(Number(options.warningRepeatMs ?? REDIS_UNAVAILABLE_WARNING_REPEAT_MS)));
  }

  async isRevoked(jwtId: string): Promise<boolean> {
    const redisKey = this.buildRedisKey(jwtId);
    if (this.pendingRevocationKeys.has(redisKey)) {
      return true;
    }

    const connection = await this.getClient();
    if (!connection) {
      if (!this.degraded) this.logRedisFailure(new RedisSessionRevocationUnavailableError());
      return true;
    }

    const version = this.failureVersion;
    try {
      const value = await this.withDeadline(connection, () => connection.client.get(redisKey));
      if (!this.isCurrent(connection) || version !== this.failureVersion) return true;
      this.recordRedisRecovery(connection, version);
      return value != null || this.pendingRevocationKeys.has(redisKey);
    } catch (error) {
      this.handleRedisFailure(connection, error, "isRevoked");
      return true;
    }
  }

  async revoke(record: SessionRevocationRecord): Promise<void> {
    const connection = await this.getClient();
    if (!connection) {
      const error = new RedisSessionRevocationUnavailableError();
      if (!this.degraded) this.logRedisFailure(error);
      throw error;
    }

    const redisKey = this.buildRedisKey(record.jwtId);
    this.pendingRevocationKeys.set(redisKey, (this.pendingRevocationKeys.get(redisKey) ?? 0) + 1);
    connection.pendingWrites += 1;
    const version = this.failureVersion;
    try {
      await this.withDeadline(connection, () => this.writeRevocationAtomically(
        connection.client, redisKey, resolveTtlMs(record.expiresAtMs),
      ));
      if (!this.isCurrent(connection) || version !== this.failureVersion) {
        throw new RedisSessionRevocationUnavailableError();
      }
      this.recordRedisRecovery(connection, version, true);
    } catch (error) {
      this.handleRedisFailure(connection, error, "revoke");
      throw new RedisSessionRevocationUnavailableError(
        "Redis session revocation write failed.",
      );
    } finally {
      connection.pendingWrites -= 1;
      const remaining = (this.pendingRevocationKeys.get(redisKey) ?? 1) - 1;
      if (remaining > 0) this.pendingRevocationKeys.set(redisKey, remaining);
      else this.pendingRevocationKeys.delete(redisKey);
    }
  }

  async close() {
    this.shuttingDown = true;
    this.clearRecoveryTimer();
    if (this.connection) this.retireConnection(this.connection);
    this.clientPromise = null;
    this.pendingRevocationKeys.clear();
  }

  private buildRedisKey(jwtId: string) {
    const digest = crypto.createHash("sha256").update(String(jwtId || "")).digest("hex");
    return `${this.prefix}:${digest}`;
  }

  private async getClient() {
    if (this.config.provider !== "redis" || !this.config.redisUrl || this.shuttingDown) {
      return null;
    }
    if (this.clientPromise) return this.clientPromise;
    if (this.connection) return this.connection;

    if (!this.clientPromise) {
      const clientPromise = this.connect();
      this.clientPromise = clientPromise;
      void clientPromise
        .finally(() => {
          if (this.clientPromise === clientPromise) {
            this.clientPromise = null;
          }
        })
        .catch(() => { /* connect() already records sanitized failures. */ });
    }

    return this.clientPromise;
  }

  private async connect(): Promise<RedisConnection | null> {
    let connection: RedisConnection | null = null;
    try {
      const createRedisClient = this.createRedisClient ?? await resolveDefaultRedisClientFactory();
      if (this.shuttingDown) return null;
      const client = createRedisClient({
        socket: resolveRedisSessionRevocationSocketOptions(this.logger, this.config.redisUrl),
        url: this.config.redisUrl as string,
      });
      const candidate = { client, cancellation: new AbortController(), pendingWrites: 0 };
      // A single connection legitimately serves many concurrent session checks.
      setMaxListeners(0, candidate.cancellation.signal);
      connection = candidate;
      this.connection = candidate;
      client.on?.("error", (error) => {
        if (this.isCurrent(candidate)) this.logRedisFailure(error, "connection");
      });
      client.on?.("ready", () => {
        if (this.isCurrent(candidate)) this.startRecovery();
      });
      await this.withDeadline(candidate, () => client.connect());
      // A successful handshake alone does not prove GET/EVAL permissions or storage health.
      return this.isCurrent(candidate) ? candidate : null;
    } catch (error) {
      if (connection) this.handleRedisFailure(connection, error, "connect");
      else this.logRedisFailure(error, "connect");
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

  private isCurrent(connection: RedisConnection) {
    return !this.shuttingDown && this.connection === connection;
  }

  private handleRedisFailure(connection: RedisConnection, error: unknown, operation: string) {
    if (!this.isCurrent(connection)) return;
    // Retiring a failed reader also aborts any writes using this connection.
    // Record that uncertainty before stale write callbacks are ignored.
    if (operation === "revoke" || connection.pendingWrites > 0) this.writeFailure = true;
    this.logRedisFailure(error, operation);
    this.retireConnection(connection);
  }

  private logRedisFailure(error: unknown, operation = "unknown") {
    if (this.shuttingDown) return;
    const classification = classifyRedisSessionRevocationError(error);
    internalMetrics.increment("sessionRevocationRedisErrorsTotal");
    this.degraded = true;
    this.failureVersion += 1;
    markStartupServiceDegraded(
      SESSION_REVOCATION_HEALTH_SERVICE,
      SESSION_REVOCATION_DEGRADED_REASON,
      buildFailClosedHealthDetail(classification),
    );
    this.scheduleRecovery();
    const now = this.now();
    if (this.warningEmitted && now - this.lastWarningAt < this.warningRepeatMs) return;
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

  private recordRedisRecovery(connection: RedisConnection, version: number, write = false) {
    if (!this.isCurrent(connection) || version !== this.failureVersion) return;
    if (write) this.writeFailure = false;
    // GET/PING cannot establish recovery from a failed EVAL/SET (for example an ACL denial).
    if (this.writeFailure) return;
    this.degraded = false;
    this.clearRecoveryTimer();
    clearStartupServiceDegraded(SESSION_REVOCATION_HEALTH_SERVICE);
    this.warningEmitted = false;
    this.lastWarningAt = 0;
  }

  private clearRecoveryTimer() {
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
  }

  private scheduleRecovery() {
    if (this.shuttingDown || !this.degraded || this.recoveryTimer || this.recoveryPromise) return;
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      this.startRecovery();
    }, this.recoveryRetryMs);
    this.recoveryTimer.unref();
  }

  private startRecovery() {
    if (this.shuttingDown || !this.degraded || this.recoveryPromise) return;
    this.clearRecoveryTimer();
    const recovery = this.probeRecovery();
    this.recoveryPromise = recovery;
    void recovery.finally(() => {
      if (this.recoveryPromise === recovery) this.recoveryPromise = null;
      this.scheduleRecovery();
    }).catch(() => { /* Probe failures are handled inside probeRecovery(). */ });
  }

  private async probeRecovery() {
    const connection = await this.getClient();
    if (!connection || !this.isCurrent(connection)) return;
    const version = this.failureVersion;
    try {
      await this.withDeadline(connection, () => connection.client.get(this.recoveryProbeKey));
      this.recordRedisRecovery(connection, version);
    } catch (error) {
      this.handleRedisFailure(connection, error, "recovery");
    }
  }

  private retireConnection(connection: RedisConnection) {
    if (this.connection === connection) {
      this.connection = null;
      this.clientPromise = null;
    }
    connection.cancellation.abort();
    try {
      // QUIT can hang on an unresponsive socket; node-redis destroy flushes queued commands.
      if (connection.client.destroy) connection.client.destroy();
      else void connection.client.quit?.().catch(() => {});
    } catch { /* A disconnected/retired client must not change the replacement's health. */ }
  }

  private withDeadline<T>(connection: RedisConnection, operation: () => Promise<T>): Promise<T> {
    const signal = connection.cancellation.signal;
    return new Promise<T>((resolve, reject) => {
      const abort = () => fail(new RedisSessionRevocationUnavailableError());
      const timer = setTimeout(() => fail(Object.assign(
        new RedisSessionRevocationUnavailableError(), { code: "ETIMEDOUT" },
      )), this.recoveryTimeoutMs);
      // Keep a pending request bounded even when it is the only remaining work in a test/process.
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
      };
      const fail = (error: unknown) => { cleanup(); reject(error); };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) { abort(); return; }
      void Promise.resolve().then(() => {
        signal.throwIfAborted();
        return operation();
      }).then(
        (value) => { cleanup(); resolve(value); }, fail,
      );
    });
  }
}

export function createSessionRevocationStore(config: SharedRateLimitStoreConfig): SessionRevocationStore | null {
  if (config.provider !== "redis") {
    return null;
  }

  return new RedisSessionRevocationStore({ config });
}
