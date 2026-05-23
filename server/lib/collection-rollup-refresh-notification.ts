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
  on(event: "notification", listener: (message: PgNotification) => void): unknown;
  on(event: "error", listener: (error: unknown) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  off?(event: "notification", listener: (message: PgNotification) => void): unknown;
  off?(event: "error", listener: (error: unknown) => void): unknown;
  off?(event: "end", listener: () => void): unknown;
  query(sqlText: string): Promise<unknown>;
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

export type CollectionRollupRefreshNotificationSubscriberLike = {
  start(onNotify: () => void): Promise<void>;
  stop?(): Promise<void> | void;
};

function assertSafeChannelName(channel: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(channel)) {
    throw new Error(`Invalid PostgreSQL LISTEN/NOTIFY channel: "${channel}"`);
  }
  return channel;
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
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private readonly reconnectJitterRatio: number;
  private readonly clientFactory: PgNotificationClientFactory;
  private started = false;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private currentClient: PgNotificationClientLike | null = null;
  private readonly clientListenerCleanups = new WeakMap<PgNotificationClientLike, () => void>();
  private activeClientListenerCleanupCount = 0;
  private readonly closingClients = new WeakSet<PgNotificationClientLike>();
  private notifyCallback: (() => unknown) | null = null;

  constructor(options: CollectionRollupRefreshNotificationSubscriberOptions = {}) {
    this.channel = assertSafeChannelName(
      options.channel ?? COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL,
    );
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
  }

  getDiagnostics(): { activeClient: boolean; pendingListenerCleanups: number; reconnectPending: boolean } {
    return {
      activeClient: Boolean(this.currentClient),
      pendingListenerCleanups: this.activeClientListenerCleanupCount,
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

    client.on("notification", handleNotification);
    client.on("error", handleError);
    client.on("end", handleEnd);
    this.clientListenerCleanups.set(client, () => {
      client.off?.("notification", handleNotification);
      client.off?.("error", handleError);
      client.off?.("end", handleEnd);
    });
    this.activeClientListenerCleanupCount += 1;

    try {
      await client.connect();
      await client.query(`LISTEN ${this.channel}`);

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
    const cleanup = this.clientListenerCleanups.get(client);
    if (!cleanup) {
      return;
    }

    cleanup();
    this.clientListenerCleanups.delete(client);
    this.activeClientListenerCleanupCount = Math.max(0, this.activeClientListenerCleanupCount - 1);
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
