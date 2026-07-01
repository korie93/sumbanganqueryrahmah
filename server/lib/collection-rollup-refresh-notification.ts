import pg from "pg";
import { buildPgSslPoolConfig } from "../config/database-ssl";
import { runtimeConfig } from "../config/runtime";
import { internalMetrics, type InternalMetricName } from "../internal/metrics";
import { logger, sanitizeErrorStackForLog } from "./logger";

const { Client } = pg;

export const COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL = "collection_rollup_refresh_queue";

type PgNotification = {
  channel?: string;
};

type PgNotificationClientLike = {
  connect(): Promise<unknown>;
  end(): Promise<void>;
  getMaxListeners?(): number;
  on(event: "notification", listener: (message: PgNotification) => void): unknown;
  on(event: "error", listener: (error: unknown) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  off?(event: "notification", listener: (message: PgNotification) => void): unknown;
  off?(event: "error", listener: (error: unknown) => void): unknown;
  off?(event: "end", listener: () => void): unknown;
  query(sqlText: string): Promise<unknown>;
  removeListener?(event: "notification", listener: (message: PgNotification) => void): unknown;
  removeListener?(event: "error", listener: (error: unknown) => void): unknown;
  removeListener?(event: "end", listener: () => void): unknown;
  setMaxListeners?(n: number): unknown;
};

type PgNotificationClientFactory = () => PgNotificationClientLike;

type CollectionRollupRefreshNotificationSubscriberOptions = {
  channel?: string;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  reconnectJitterRatio?: number;
  clientFactory?: PgNotificationClientFactory;
};

const DEFAULT_ROLLUP_REFRESH_NOTIFICATION_RECONNECT_DELAY_MS = 5_000;
const DEFAULT_ROLLUP_REFRESH_NOTIFICATION_MAX_RECONNECT_DELAY_MS = 60_000;
const DEFAULT_ROLLUP_REFRESH_NOTIFICATION_RECONNECT_JITTER_RATIO = 0.2;
const PG_NOTIFICATION_LISTENER_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const PG_NOTIFICATION_EXPECTED_LISTENER_COUNT = 3;
const PG_NOTIFICATION_LISTENER_TTL_MS = 30 * 60 * 1000;
const PG_NOTIFICATION_MAX_LISTENER_REGISTRATIONS = 5;
const PG_NOTIFICATION_LISTENER_LIMIT_BUFFER = 4;
const SAFE_PG_CHANNEL_PATTERN = /^[a-z_][a-z0-9_-]{0,62}$/i;
const FORBIDDEN_PG_CHANNEL_KEYWORDS = [
  "alter",
  "create",
  "delete",
  "drop",
  "exec",
  "execute",
  "insert",
  "select",
  "truncate",
  "update",
] as const;

type RollupNotificationAsyncOperation =
  | "notify_callback"
  | "disconnect_cleanup"
  | "reconnect";

const ROLLUP_NOTIFICATION_FAILURE_MESSAGES = {
  notify_callback: "Collection rollup notification callback failed; polling fallback remains active",
  disconnect_cleanup: "Collection rollup notification disconnect cleanup failed; polling fallback remains active",
  reconnect: "Collection rollup notification reconnect failed; polling fallback remains active",
} as const satisfies Record<RollupNotificationAsyncOperation, string>;

const ROLLUP_NOTIFICATION_FAILURE_METRICS = {
  notify_callback: "collectionRollupNotificationCallbackFailuresTotal",
  disconnect_cleanup: "collectionRollupNotificationDisconnectFailuresTotal",
  reconnect: "collectionRollupNotificationReconnectFailuresTotal",
} as const satisfies Record<RollupNotificationAsyncOperation, InternalMetricName>;
const ROLLUP_NOTIFICATION_LOG_SOURCE = "collection_rollup_refresh_notification";

export type CollectionRollupRefreshNotificationSubscriberLike = {
  start(onNotify: () => void): Promise<void>;
  stop?(): Promise<void> | void;
};

export function assertSafeChannelName(channel: unknown): string {
  if (typeof channel !== "string") {
    throw new TypeError("PostgreSQL LISTEN/NOTIFY channel name must be a string.");
  }
  if (!SAFE_PG_CHANNEL_PATTERN.test(channel)) {
    throw new Error("Invalid PostgreSQL LISTEN/NOTIFY channel name.");
  }

  const channelSegments = channel.toLowerCase().split(/[_-]+/);
  if (FORBIDDEN_PG_CHANNEL_KEYWORDS.some((keyword) => channelSegments.includes(keyword))) {
    throw new Error("Invalid PostgreSQL LISTEN/NOTIFY channel name.");
  }

  return channel;
}

export function escapePostgresNotificationChannel(channel: unknown): string {
  return pg.escapeIdentifier(assertSafeChannelName(channel));
}

function readErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.trim() ? code : undefined;
}

function readErrorName(error: unknown): string {
  if (error instanceof Error && error.name.trim()) {
    return error.name;
  }
  if (error === null) {
    return "NullError";
  }
  return `${typeof error}Error`;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (error === null) {
    return "Null error";
  }
  return `${typeof error} error`;
}

function readErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

function createDefaultClient(): PgNotificationClientLike {
  const sslConfig = buildPgSslPoolConfig(runtimeConfig.database.ssl);

  return new Client(
    runtimeConfig.database.connectionString
      ? {
          connectionString: runtimeConfig.database.connectionString,
          application_name: "sqr-rollup-queue-listener",
          options: `-c search_path=${runtimeConfig.database.searchPath}`,
          ...sslConfig,
        }
      : {
          host: runtimeConfig.database.host,
          port: runtimeConfig.database.port,
          user: runtimeConfig.database.user,
          password: runtimeConfig.database.password,
          database: runtimeConfig.database.database,
          application_name: "sqr-rollup-queue-listener",
          options: `-c search_path=${runtimeConfig.database.searchPath}`,
          ...sslConfig,
        },
  );
}

type PgNotificationListenerEntry = {
  handleEnd: () => void;
  handleError: (error: unknown) => void;
  handleNotification: (message: PgNotification) => void;
};

type PgNotificationListenerRegistration = PgNotificationListenerEntry & {
  id: number;
  registeredAt: number;
};

type PgNotificationListenerRegistryOptions = {
  isProtectedClient?: (client: PgNotificationClientLike) => boolean;
};

type PgNotificationEventName = "end" | "error" | "notification";

type PgNotificationEventListener =
  | ((message: PgNotification) => void)
  | ((error: unknown) => void)
  | (() => void);

export function removePostgresNotificationClientListener(
  client: PgNotificationClientLike,
  event: PgNotificationEventName,
  listener: PgNotificationEventListener,
): void {
  if (event === "notification") {
    const notificationListener = listener as (message: PgNotification) => void;
    if (typeof client.removeListener === "function") {
      client.removeListener(event, notificationListener);
      return;
    }
    if (typeof client.off === "function") {
      client.off(event, notificationListener);
      return;
    }
  } else if (event === "error") {
    const errorListener = listener as (error: unknown) => void;
    if (typeof client.removeListener === "function") {
      client.removeListener(event, errorListener);
      return;
    }
    if (typeof client.off === "function") {
      client.off(event, errorListener);
      return;
    }
  } else {
    const endListener = listener as () => void;
    if (typeof client.removeListener === "function") {
      client.removeListener(event, endListener);
      return;
    }
    if (typeof client.off === "function") {
      client.off(event, endListener);
      return;
    }
  }

  internalMetrics.increment("collectionRollupNotificationListenerRemovalFailuresTotal");
  logger.error("PostgreSQL notification listener removal is unavailable", {
    event: "collection_rollup_listener_removal_unavailable",
    expected: "removeListener_or_off",
    found: "none",
    operation: "remove_listener",
    source: "collection_rollup_notification",
    status: "failed",
  });
  throw new Error("PostgreSQL notification client does not support listener removal.");
}

class PgNotificationListenerRegistry {
  private readonly isProtectedClient: (client: PgNotificationClientLike) => boolean;
  private readonly listeners = new Map<PgNotificationClientLike, PgNotificationListenerRegistration>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private nextListenerId = 0;

  constructor(options: PgNotificationListenerRegistryOptions = {}) {
    this.isProtectedClient = options.isProtectedClient ?? (() => false);
  }

  get size(): number {
    return this.listeners.size;
  }

  has(client: PgNotificationClientLike): boolean {
    return this.listeners.has(client);
  }

  subscribe(client: PgNotificationClientLike, entry: PgNotificationListenerEntry): void {
    this.unsubscribe(client);
    this.pruneExpiredListeners(Date.now());
    this.evictOldestListenersUntilBelowLimit();
    this.raiseMaxListenersIfNeeded(client);

    client.on("notification", entry.handleNotification);
    client.on("error", entry.handleError);
    client.on("end", entry.handleEnd);
    this.listeners.set(client, {
      ...entry,
      id: this.nextListenerId,
      registeredAt: Date.now(),
    });
    this.nextListenerId += 1;
    this.ensurePeriodicCleanup();
  }

  unsubscribe(client: PgNotificationClientLike): void {
    const entry = this.listeners.get(client);
    if (!entry) {
      return;
    }

    try {
      this.removeListener(client, "notification", entry.handleNotification);
      this.removeListener(client, "error", entry.handleError);
      this.removeListener(client, "end", entry.handleEnd);
    } finally {
      this.listeners.delete(client);
      this.stopPeriodicCleanupIfIdle();
    }
  }

  teardown(): void {
    for (const client of Array.from(this.listeners.keys())) {
      this.unsubscribe(client);
    }
    this.stopPeriodicCleanup();
  }

  private ensurePeriodicCleanup(): void {
    if (this.cleanupTimer || this.listeners.size === 0) {
      return;
    }

    this.cleanupTimer = setInterval(() => {
      this.pruneExpiredListeners(Date.now());
      this.stopPeriodicCleanupIfIdle();
    }, PG_NOTIFICATION_LISTENER_CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  private stopPeriodicCleanupIfIdle(): void {
    if (this.listeners.size === 0) {
      this.stopPeriodicCleanup();
    }
  }

  private stopPeriodicCleanup(): void {
    if (!this.cleanupTimer) {
      return;
    }

    clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  private pruneExpiredListeners(now: number): void {
    let expiredCount = 0;

    for (const [client, entry] of Array.from(this.listeners.entries())) {
      if (
        !this.isProtectedClient(client)
        && now - entry.registeredAt > PG_NOTIFICATION_LISTENER_TTL_MS
      ) {
        this.unsubscribe(client);
        expiredCount += 1;
      }
    }

    if (expiredCount > 0) {
      internalMetrics.increment("collectionRollupNotificationListenerExpiredTotal", expiredCount);
      logger.warn("Expired collection rollup notification listener registrations were removed", {
        event: "collection_rollup_notification_listener_expired",
        durationMs: PG_NOTIFICATION_LISTENER_TTL_MS,
        operation: "listener_registry_cleanup",
        removedCount: expiredCount,
        status: "cleaned",
      });
    }
  }

  private evictOldestListenersUntilBelowLimit(): void {
    let evictionCount = 0;

    while (this.listeners.size >= PG_NOTIFICATION_MAX_LISTENER_REGISTRATIONS) {
      const oldestClient = this.findOldestEvictableClient();
      if (!oldestClient) {
        break;
      }

      this.unsubscribe(oldestClient);
      evictionCount += 1;
    }

    if (evictionCount > 0) {
      internalMetrics.increment("collectionRollupNotificationListenerEvictionsTotal", evictionCount);
      logger.warn("Collection rollup notification listener registry cap evicted stale registrations", {
        event: "collection_rollup_notification_listener_evicted",
        limit: PG_NOTIFICATION_MAX_LISTENER_REGISTRATIONS,
        operation: "listener_registry_cleanup",
        removedCount: evictionCount,
        status: "cleaned",
      });
    }
  }

  private findOldestEvictableClient(): PgNotificationClientLike | null {
    let oldestClient: PgNotificationClientLike | null = null;
    let oldestEntry: PgNotificationListenerRegistration | null = null;

    for (const [client, entry] of this.listeners.entries()) {
      if (this.isProtectedClient(client)) {
        continue;
      }
      if (
        !oldestEntry
        || entry.registeredAt < oldestEntry.registeredAt
        || (entry.registeredAt === oldestEntry.registeredAt && entry.id < oldestEntry.id)
      ) {
        oldestClient = client;
        oldestEntry = entry;
      }
    }

    return oldestClient;
  }

  private raiseMaxListenersIfNeeded(client: PgNotificationClientLike): void {
    const getMaxListeners = client.getMaxListeners;
    const setMaxListeners = client.setMaxListeners;
    if (!getMaxListeners || !setMaxListeners) {
      return;
    }

    const requiredLimit = PG_NOTIFICATION_EXPECTED_LISTENER_COUNT + PG_NOTIFICATION_LISTENER_LIMIT_BUFFER;
    const currentLimit = getMaxListeners.call(client);
    if (currentLimit < requiredLimit) {
      setMaxListeners.call(client, requiredLimit);
    }
  }

  private removeListener(
    client: PgNotificationClientLike,
    event: PgNotificationEventName,
    listener: PgNotificationEventListener,
  ): void {
    removePostgresNotificationClientListener(client, event, listener);
  }
}

export function resolveCollectionRollupRefreshReconnectDelayMs(params: {
  attempt: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
  channel: string;
}): number {
  const attempt = Math.max(0, Math.floor(params.attempt));
  const baseDelayMs = Math.max(1, Math.floor(params.baseDelayMs));
  const maxDelayMs = Math.max(baseDelayMs, Math.floor(params.maxDelayMs));
  const jitterRatio = Math.min(0.5, Math.max(0, params.jitterRatio));
  const exponentialDelayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.min(attempt, 10));
  const jitterWindowMs = Math.floor(exponentialDelayMs * jitterRatio);

  if (jitterWindowMs <= 0) {
    return exponentialDelayMs;
  }

  const channelSeed = Array.from(params.channel).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const deterministicJitterMs = (channelSeed + attempt * 17) % (jitterWindowMs + 1);

  return Math.min(maxDelayMs, exponentialDelayMs + deterministicJitterMs);
}

export class CollectionRollupRefreshNotificationSubscriber
  implements CollectionRollupRefreshNotificationSubscriberLike
{
  private readonly channel: string;
  private readonly escapedChannelIdentifier: string;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private readonly reconnectJitterRatio: number;
  private readonly clientFactory: PgNotificationClientFactory;
  private started = false;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private currentClient: PgNotificationClientLike | null = null;
  private readonly listenerRegistry: PgNotificationListenerRegistry;
  private readonly closingClients = new Set<PgNotificationClientLike>();
  private notifyCallback: (() => unknown) | null = null;

  constructor(options: CollectionRollupRefreshNotificationSubscriberOptions = {}) {
    this.listenerRegistry = new PgNotificationListenerRegistry({
      isProtectedClient: (client) => client === this.currentClient,
    });
    this.channel = assertSafeChannelName(
      options.channel ?? COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL,
    );
    this.escapedChannelIdentifier = escapePostgresNotificationChannel(this.channel);
    this.reconnectDelayMs = Math.max(1, options.reconnectDelayMs ?? DEFAULT_ROLLUP_REFRESH_NOTIFICATION_RECONNECT_DELAY_MS);
    this.maxReconnectDelayMs = Math.max(
      this.reconnectDelayMs,
      options.maxReconnectDelayMs ?? DEFAULT_ROLLUP_REFRESH_NOTIFICATION_MAX_RECONNECT_DELAY_MS,
    );
    this.reconnectJitterRatio = Math.min(
      0.5,
      Math.max(
        0,
        options.reconnectJitterRatio ?? DEFAULT_ROLLUP_REFRESH_NOTIFICATION_RECONNECT_JITTER_RATIO,
      ),
    );
    this.clientFactory = options.clientFactory ?? createDefaultClient;
  }

  async start(onNotify: () => void): Promise<void> {
    this.started = true;
    this.notifyCallback = onNotify;
    await this.ensureConnected();
  }

  async stop(): Promise<void> {
    this.started = false;
    this.notifyCallback = null;
    this.cancelPendingReconnect();
    this.reconnectAttempt = 0;
    const pendingConnect = this.connectPromise;

    const activeClient = this.currentClient;
    this.currentClient = null;
    if (activeClient) {
      this.removeClientListeners(activeClient);
      await this.safeCloseClient(activeClient, "stop");
    }
    this.listenerRegistry.teardown();
    if (pendingConnect) {
      await pendingConnect.catch((error) => {
        this.recordAsyncFailure({
          critical: true,
          error,
          operation: "disconnect_cleanup",
        });
      });
    }
  }

  getDiagnostics(): { activeClient: boolean; pendingListenerCleanups: number; reconnectPending: boolean } {
    return {
      activeClient: Boolean(this.currentClient),
      pendingListenerCleanups: this.listenerRegistry.size,
      reconnectPending: Boolean(this.reconnectTimer),
    };
  }

  private async ensureConnected(): Promise<void> {
    if (!this.started || this.currentClient) {
      return;
    }
    if (this.connectPromise) {
      await this.connectPromise;
      return;
    }

    this.connectPromise = this.connectClient();
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private async connectClient(): Promise<void> {
    const client = this.clientFactory();
    const handleNotification = (message: PgNotification) => {
      if (!this.started || message.channel !== this.channel) {
        return;
      }
      try {
        const notifyResult = this.notifyCallback?.();
        if (notifyResult && typeof (notifyResult as Promise<unknown>).then === "function") {
          void Promise.resolve(notifyResult).catch((error) => {
            this.recordAsyncFailure({
              critical: false,
              error,
              operation: "notify_callback",
            });
          });
        }
      } catch (error) {
        this.recordAsyncFailure({
          critical: false,
          error,
          operation: "notify_callback",
        });
      }
    };
    const disconnectSafely = () => {
      void this.handleDisconnect(client).catch((error) => {
        this.recordAsyncFailure({
          critical: true,
          error,
          operation: "disconnect_cleanup",
        });
        this.scheduleReconnect();
      });
    };
    const handleError = (error: unknown) => {
      logger.warn("Collection rollup notification listener error; polling fallback remains active", {
        channel: this.channel,
        error,
      });
      disconnectSafely();
    };
    const handleEnd = () => {
      logger.warn("Collection rollup notification listener ended; polling fallback remains active", {
        channel: this.channel,
      });
      disconnectSafely();
    };

    this.listenerRegistry.subscribe(client, {
      handleEnd,
      handleError,
      handleNotification,
    });

    try {
      await client.connect();
      await client.query(`LISTEN ${this.escapedChannelIdentifier}`);

      if (!this.started) {
        await this.safeCloseClient(client, "start-aborted");
        return;
      }

      this.currentClient = client;
      this.reconnectAttempt = 0;
      logger.info("Collection rollup notification listener online", {
        channel: this.channel,
      });
    } catch (error) {
      this.removeClientListeners(client);
      await this.safeCloseClient(client, "connect-failure");
      logger.warn("Failed to start collection rollup notification listener; polling fallback remains active", {
        channel: this.channel,
        error,
      });
      this.scheduleReconnect();
    }
  }

  private async handleDisconnect(client: PgNotificationClientLike): Promise<void> {
    if (this.closingClients.has(client)) {
      return;
    }

    this.closingClients.add(client);
    try {
      if (this.currentClient === client) {
        this.currentClient = null;
      }
      this.removeClientListeners(client);
      await this.safeCloseClient(client, "disconnect");
      this.scheduleReconnect();
    } finally {
      this.closingClients.delete(client);
    }
  }

  private removeClientListeners(client: PgNotificationClientLike): void {
    this.listenerRegistry.unsubscribe(client);
  }

  private recordAsyncFailure(params: {
    critical: boolean;
    error: unknown;
    operation: RollupNotificationAsyncOperation;
  }): void {
    internalMetrics.increment(ROLLUP_NOTIFICATION_FAILURE_METRICS[params.operation]);
    if (params.critical) {
      internalMetrics.increment("collectionRollupNotificationCriticalFailuresTotal");
    }

    logger.warn(ROLLUP_NOTIFICATION_FAILURE_MESSAGES[params.operation], {
      capturedAt: new Date().toISOString(),
      category: "fire_and_forget",
      channel: this.channel,
      critical: params.critical,
      code: readErrorCode(params.error),
      details: runtimeConfig.app.isProductionLike ? undefined : readErrorMessage(params.error),
      event: "collection_rollup_notification_async_failure",
      name: readErrorName(params.error),
      operation: params.operation,
      source: ROLLUP_NOTIFICATION_LOG_SOURCE,
      stack: runtimeConfig.app.isProductionLike
        ? undefined
        : sanitizeErrorStackForLog(readErrorStack(params.error), {
            productionLike: false,
          }),
      status: params.critical ? "critical_failure" : "contained_failure",
    });
  }

  private scheduleReconnect(): void {
    if (!this.started || this.reconnectTimer) {
      return;
    }

    const delayMs = resolveCollectionRollupRefreshReconnectDelayMs({
      attempt: this.reconnectAttempt,
      baseDelayMs: this.reconnectDelayMs,
      maxDelayMs: this.maxReconnectDelayMs,
      jitterRatio: this.reconnectJitterRatio,
      channel: this.channel,
    });
    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.started) {
        logger.debug("Collection rollup reconnect skipped after stop", {
          event: "collection_rollup_reconnect_cancelled_after_stop",
          operation: "reconnect",
          source: "collection_rollup_notification",
          status: "cancelled",
        });
        return;
      }

      void this.ensureConnected().catch((error) => {
        this.recordAsyncFailure({
          critical: true,
          error,
          operation: "reconnect",
        });
        this.scheduleReconnect();
      });
    }, delayMs);
    this.reconnectTimer.unref?.();
  }

  private cancelPendingReconnect(): void {
    if (!this.reconnectTimer) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private async safeCloseClient(
    client: PgNotificationClientLike,
    reason: "stop" | "start-aborted" | "connect-failure" | "disconnect",
  ): Promise<void> {
    this.removeClientListeners(client);

    try {
      await client.end();
    } catch (error) {
      logger.warn("Failed to close collection rollup notification client cleanly; polling fallback remains active", {
        channel: this.channel,
        reason,
        error,
      });
    }
  }
}
