import pg from "pg";
import { buildPgSslPoolConfig } from "../config/database-ssl";
import { runtimeConfig } from "../config/runtime";
import { logger } from "./logger";

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
const PG_NOTIFICATION_EXPECTED_LISTENER_COUNT = 3;
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

class PgNotificationListenerRegistry {
  private readonly listeners = new Map<PgNotificationClientLike, PgNotificationListenerEntry>();

  get size(): number {
    return this.listeners.size;
  }

  has(client: PgNotificationClientLike): boolean {
    return this.listeners.has(client);
  }

  subscribe(client: PgNotificationClientLike, entry: PgNotificationListenerEntry): void {
    this.unsubscribe(client);
    this.raiseMaxListenersIfNeeded(client);

    client.on("notification", entry.handleNotification);
    client.on("error", entry.handleError);
    client.on("end", entry.handleEnd);
    this.listeners.set(client, entry);
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
    }
  }

  teardown(): void {
    for (const client of Array.from(this.listeners.keys())) {
      this.unsubscribe(client);
    }
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
    event: "end" | "error" | "notification",
    listener: ((message: PgNotification) => void) | ((error: unknown) => void) | (() => void),
  ): void {
    if (event === "notification") {
      const notificationListener = listener as (message: PgNotification) => void;
      if (client.off) {
        client.off(event, notificationListener);
      } else {
        client.removeListener?.(event, notificationListener);
      }
      return;
    }
    if (event === "error") {
      const errorListener = listener as (error: unknown) => void;
      if (client.off) {
        client.off(event, errorListener);
      } else {
        client.removeListener?.(event, errorListener);
      }
      return;
    }
    const endListener = listener as () => void;
    if (client.off) {
      client.off(event, endListener);
    } else {
      client.removeListener?.(event, endListener);
    }
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
  private readonly listenerRegistry = new PgNotificationListenerRegistry();
  private readonly closingClients = new Set<PgNotificationClientLike>();
  private notifyCallback: (() => unknown) | null = null;

  constructor(options: CollectionRollupRefreshNotificationSubscriberOptions = {}) {
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;

    const activeClient = this.currentClient;
    this.currentClient = null;
    if (activeClient) {
      this.removeClientListeners(activeClient);
      await this.safeCloseClient(activeClient, "stop");
    }
    this.listenerRegistry.teardown();
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
            logger.warn("Collection rollup notification callback failed; polling fallback remains active", {
              channel: this.channel,
              error,
            });
          });
        }
      } catch (error) {
        logger.warn("Collection rollup notification callback failed; polling fallback remains active", {
          channel: this.channel,
          error,
        });
      }
    };
    const disconnectSafely = () => {
      void this.handleDisconnect(client).catch((error) => {
        logger.warn("Collection rollup notification disconnect cleanup failed; polling fallback remains active", {
          channel: this.channel,
          error,
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
      void this.ensureConnected().catch((error) => {
        logger.warn("Collection rollup notification reconnect failed; polling fallback remains active", {
          channel: this.channel,
          error,
        });
        this.scheduleReconnect();
      });
    }, delayMs);
    this.reconnectTimer.unref?.();
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
