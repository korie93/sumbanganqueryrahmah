import pg from "pg";
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
  clientFactory?: PgNotificationClientFactory;
};

const DEFAULT_ROLLUP_REFRESH_NOTIFICATION_RECONNECT_DELAY_MS = 5_000;

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
  return new Client(
    runtimeConfig.database.connectionString
      ? {
          connectionString: runtimeConfig.database.connectionString,
          application_name: "sqr-rollup-queue-listener",
          options: `-c search_path=${runtimeConfig.database.searchPath}`,
        }
      : {
          host: runtimeConfig.database.host,
          port: runtimeConfig.database.port,
          user: runtimeConfig.database.user,
          password: runtimeConfig.database.password,
          database: runtimeConfig.database.database,
          application_name: "sqr-rollup-queue-listener",
          options: `-c search_path=${runtimeConfig.database.searchPath}`,
        },
  );
}

export class CollectionRollupRefreshNotificationSubscriber
  implements CollectionRollupRefreshNotificationSubscriberLike
{
  private readonly channel: string;
  private readonly reconnectDelayMs: number;
  private readonly clientFactory: PgNotificationClientFactory;
  private started = false;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private currentClient: PgNotificationClientLike | null = null;
  private readonly clientListenerCleanups = new WeakMap<PgNotificationClientLike, () => void>();
  private readonly closingClients = new WeakSet<PgNotificationClientLike>();
  private notifyCallback: (() => unknown) | null = null;

  constructor(options: CollectionRollupRefreshNotificationSubscriberOptions = {}) {
    this.channel = assertSafeChannelName(
      options.channel ?? COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL,
    );
    this.reconnectDelayMs = Math.max(1, options.reconnectDelayMs ?? DEFAULT_ROLLUP_REFRESH_NOTIFICATION_RECONNECT_DELAY_MS);
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

    const activeClient = this.currentClient;
    this.currentClient = null;
    if (activeClient) {
      this.removeClientListeners(activeClient);
      await this.safeCloseClient(activeClient, "stop");
    }
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

    try {
      await client.connect();
      await client.query(`LISTEN ${this.channel}`);

      if (!this.started) {
        await this.safeCloseClient(client, "start-aborted");
        return;
      }

      this.currentClient = client;
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
  }

  private scheduleReconnect(): void {
    if (!this.started || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureConnected().catch((error) => {
        logger.warn("Collection rollup notification reconnect failed; polling fallback remains active", {
          channel: this.channel,
          error,
        });
        this.scheduleReconnect();
      });
    }, this.reconnectDelayMs);
    this.reconnectTimer.unref?.();
  }

  private async safeCloseClient(
    client: PgNotificationClientLike,
    reason: "stop" | "start-aborted" | "connect-failure" | "disconnect",
  ): Promise<void> {
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
