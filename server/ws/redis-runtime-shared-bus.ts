import crypto from "node:crypto";
import { logger as defaultLogger } from "../lib/logger";
import {
  parseRuntimeWsSharedBusEvent,
  RUNTIME_WS_SHARED_BUS_CHANNEL,
  type RuntimeWsSharedBus,
  type RuntimeWsSharedBusEvent,
  type RuntimeWsSharedBusPublishEvent,
  serializeRuntimeWsSharedBusEvent,
} from "./runtime-shared-bus";
import { sanitizeRuntimeWebSocketError } from "./ws-lifecycle";

type LoggerLike = Pick<typeof defaultLogger, "debug" | "warn">;

type RedisRuntimeWsClientLike = {
  connect: () => Promise<unknown>;
  duplicate?: () => RedisRuntimeWsClientLike;
  on?: (event: string, handler: (...args: unknown[]) => void) => unknown;
  publish?: (channel: string, message: string) => Promise<number> | Promise<unknown>;
  quit?: () => Promise<unknown>;
  subscribe?: (channel: string, handler: (message: string) => void) => Promise<unknown>;
  unsubscribe?: (channel: string) => Promise<unknown>;
};

type RedisRuntimeWsClientFactory = (options: {
  socket: {
    reconnectStrategy: (retries: number, cause: Error) => number;
  };
  url: string;
}) => RedisRuntimeWsClientLike;

type RedisRuntimeWsSharedBusOptions = {
  channel?: string;
  createRedisClient?: RedisRuntimeWsClientFactory;
  instanceId?: string;
  logger?: LoggerLike;
  redisUrl: string;
  retryMs?: number;
};

let defaultRedisClientFactoryPromise: Promise<RedisRuntimeWsClientFactory> | null = null;

async function resolveDefaultRedisClientFactory(): Promise<RedisRuntimeWsClientFactory> {
  defaultRedisClientFactoryPromise ??= import("redis")
    .then((redisModule) => redisModule.createClient as unknown as RedisRuntimeWsClientFactory);
  return defaultRedisClientFactoryPromise;
}

export function createRuntimeWsRedisReconnectStrategy(logger: LoggerLike = defaultLogger) {
  return (retries: number, cause: Error) => {
    const delayMs = Math.min(30_000, 500 * (2 ** Math.min(6, Math.max(0, retries))));
    logger.warn("Redis WebSocket shared bus reconnect scheduled", {
      delayMs,
      error: cause.message,
      retries,
    });
    return delayMs;
  };
}

export function createRedisRuntimeWsSharedBus(options: RedisRuntimeWsSharedBusOptions): RuntimeWsSharedBus {
  const logger = options.logger ?? defaultLogger;
  const channel = options.channel ?? RUNTIME_WS_SHARED_BUS_CHANNEL;
  const instanceId = options.instanceId ?? crypto.randomUUID();
  const retryMs = Math.max(1_000, Math.trunc(Number(options.retryMs || 5_000)));
  const handlers = new Set<(event: RuntimeWsSharedBusEvent) => void>();
  let publisher: RedisRuntimeWsClientLike | null = null;
  let subscriber: RedisRuntimeWsClientLike | null = null;
  let publisherPromise: Promise<RedisRuntimeWsClientLike | null> | null = null;
  let subscriberPromise: Promise<RedisRuntimeWsClientLike | null> | null = null;
  let closed = false;
  let retryHandle: NodeJS.Timeout | null = null;
  let subscriberGeneration = 0;

  const logFailure = (operation: string, error: unknown) => {
    if (closed) {
      return;
    }

    logger.warn("Redis WebSocket shared bus unavailable", {
      error: sanitizeRuntimeWebSocketError(error),
      operation,
    });
  };

  const clearRetry = () => {
    if (retryHandle) {
      clearTimeout(retryHandle);
      retryHandle = null;
    }
  };

  const scheduleSubscriberRetry = () => {
    if (closed || retryHandle || handlers.size === 0) {
      return;
    }

    retryHandle = setTimeout(() => {
      retryHandle = null;
      void ensureSubscriber();
    }, retryMs);
    retryHandle.unref();
  };

  const closeSubscriberIfIdle = async () => {
    if (closed || handlers.size > 0) {
      return;
    }

    subscriberGeneration += 1;
    clearRetry();
    const currentSubscriber = subscriber;
    const currentSubscriberPromise = subscriberPromise;
    subscriber = null;
    subscriberPromise = null;

    const resolvedClients = await Promise.allSettled([currentSubscriberPromise])
      .then((results) => [
        currentSubscriber,
        ...results
          .filter((result): result is PromiseFulfilledResult<RedisRuntimeWsClientLike | null> =>
            result.status === "fulfilled")
          .map((result) => result.value),
      ])
      .then((clients) => clients.filter((client): client is RedisRuntimeWsClientLike => Boolean(client)));

    await Promise.allSettled(Array.from(new Set(resolvedClients)).map(async (client) => {
      try {
        await client.unsubscribe?.(channel);
      } catch (error) {
        logger.debug("Redis WebSocket shared bus unsubscribe failed after last handler removed", {
          error: sanitizeRuntimeWebSocketError(error),
        });
      }
      await client.quit?.();
    }));
  };

  const createClient = async () => {
    const factory = options.createRedisClient ?? await resolveDefaultRedisClientFactory();
    const client = factory({
      socket: {
        reconnectStrategy: createRuntimeWsRedisReconnectStrategy(logger),
      },
      url: options.redisUrl,
    });
    client.on?.("error", (error) => logFailure("client-error", error));
    await client.connect();
    return client;
  };

  const handleRawMessage = (message: string) => {
    const event = parseRuntimeWsSharedBusEvent(message);
    if (!event || event.originId === instanceId) {
      return;
    }

    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        logger.warn("WebSocket shared bus handler failed", {
          error: sanitizeRuntimeWebSocketError(error),
          type: event.type,
        });
      }
    }
  };

  async function ensurePublisher() {
    if (closed) {
      return null;
    }
    if (publisher) {
      return publisher;
    }

    publisherPromise ??= createClient()
      .then((client) => {
        if (closed) {
          void client.quit?.().catch((error) => {
            logger.debug("Redis WebSocket shared bus publisher quit failed after close", {
              error: sanitizeRuntimeWebSocketError(error),
            });
          });
          return null;
        }
        publisher = client;
        return client;
      })
      .catch((error) => {
        publisherPromise = null;
        logFailure("publisher-connect", error);
        return null;
      });
    return publisherPromise;
  }

  async function ensureSubscriber() {
    if (closed || handlers.size === 0) {
      return null;
    }
    if (subscriber) {
      return subscriber;
    }

    const generation = subscriberGeneration;
    subscriberPromise ??= createClient()
      .then(async (client) => {
        if (closed || handlers.size === 0 || generation !== subscriberGeneration) {
          await client.quit?.();
          return null;
        }
        if (!client.subscribe) {
          throw new Error("Redis client does not expose subscribe().");
        }
        await client.subscribe(channel, handleRawMessage);
        if (closed || handlers.size === 0 || generation !== subscriberGeneration) {
          await client.unsubscribe?.(channel);
          await client.quit?.();
          return null;
        }
        subscriber = client;
        return client;
      })
      .catch((error) => {
        if (generation === subscriberGeneration) {
          subscriberPromise = null;
          logFailure("subscriber-connect", error);
          scheduleSubscriberRetry();
        }
        return null;
      });
    return subscriberPromise;
  }

  return {
    instanceId,
    async close() {
      closed = true;
      clearRetry();
      const clients = await Promise.allSettled([publisherPromise, subscriberPromise]);
      const resolvedClients = [
        publisher,
        subscriber,
        ...clients
          .filter((result): result is PromiseFulfilledResult<RedisRuntimeWsClientLike | null> =>
            result.status === "fulfilled")
          .map((result) => result.value),
      ].filter((client): client is RedisRuntimeWsClientLike => Boolean(client));
      publisher = null;
      subscriber = null;
      publisherPromise = null;
      subscriberPromise = null;
      handlers.clear();
      await Promise.allSettled(Array.from(new Set(resolvedClients)).map(async (client) => {
        try {
          await client.unsubscribe?.(channel);
        } catch (error) {
          logger.debug("Redis WebSocket shared bus unsubscribe failed during shutdown", {
            error: sanitizeRuntimeWebSocketError(error),
          });
        }
        await client.quit?.();
      }));
    },
    publish(event: RuntimeWsSharedBusPublishEvent) {
      const message = serializeRuntimeWsSharedBusEvent(instanceId, event, logger);
      if (!message || closed) {
        return;
      }

      void ensurePublisher()
        .then((client) => {
          if (closed) {
            return undefined;
          }
          return client?.publish?.(channel, message);
        })
        .catch((error) => {
          publisher = null;
          publisherPromise = null;
          logFailure("publish", error);
        });
    },
    subscribe(handler) {
      if (closed) {
        return () => undefined;
      }

      handlers.add(handler);
      void ensureSubscriber();
      return () => {
        handlers.delete(handler);
        if (handlers.size === 0) {
          void closeSubscriberIfIdle();
        }
      };
    },
  };
}
