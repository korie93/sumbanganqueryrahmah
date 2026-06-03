import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL,
  CollectionRollupRefreshNotificationSubscriber,
  assertSafeChannelName,
  escapePostgresNotificationChannel,
  removePostgresNotificationClientListener,
  resolveCollectionRollupRefreshReconnectDelayMs,
} from "../lib/collection-rollup-refresh-notification";
import { logger } from "../lib/logger";
import { getInternalMetricsSnapshot } from "../internal/metrics";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error("Timed out waiting for predicate."));
        return;
      }
      setTimeout(tick, 10).unref?.();
    };
    tick();
  });
}

class FakeNotificationClient extends EventEmitter {
  listenQueries: string[] = [];
  endCalls = 0;

  constructor(private readonly options: { connectError?: Error; endError?: Error } = {}) {
    super();
  }

  async connect(): Promise<void> {
    if (this.options.connectError) {
      throw this.options.connectError;
    }
  }

  async query(sqlText: string): Promise<void> {
    this.listenQueries.push(sqlText);
  }

  async end(): Promise<void> {
    this.endCalls += 1;
    if (this.options.endError) {
      throw this.options.endError;
    }
  }
}

function createNotificationListenerEntryForTest() {
  return {
    handleEnd: () => undefined,
    handleError: (error: unknown) => {
      void error;
    },
    handleNotification: (message: { channel?: string }) => {
      void message;
    },
  };
}

type NotificationListenerEntryForTest = ReturnType<typeof createNotificationListenerEntryForTest>;

type NotificationListenerRegistryForTest = {
  readonly size: number;
  subscribe(client: FakeNotificationClient, entry: NotificationListenerEntryForTest): void;
  teardown(): void;
};

function getNotificationListenerRegistryForTest(
  subscriber: CollectionRollupRefreshNotificationSubscriber,
): NotificationListenerRegistryForTest {
  return (subscriber as unknown as {
    listenerRegistry: NotificationListenerRegistryForTest;
  }).listenerRegistry;
}

function createListenerRemovalClient(options: {
  readonly includeOff?: boolean;
  readonly includeRemoveListener?: boolean;
}) {
  const emitter = new EventEmitter();
  const client = {
    connect: async () => undefined,
    end: async () => undefined,
    on: emitter.on.bind(emitter),
    query: async () => undefined,
    ...(options.includeOff ? { off: emitter.off.bind(emitter) } : {}),
    ...(options.includeRemoveListener
      ? { removeListener: emitter.removeListener.bind(emitter) }
      : {}),
  };

  return { client, emitter };
}

test("CollectionRollupRefreshNotificationSubscriber reuses runtime PostgreSQL SSL policy", () => {
  const source = readFileSync(
    path.resolve(__dirname, "../lib/collection-rollup-refresh-notification.ts"),
    "utf8",
  );

  assert.match(source, /buildPgSslPoolConfig\(runtimeConfig\.database\.ssl\)/);
  assert.match(source, /\.\.\.sslConfig/);
});

test("collection rollup reconnect delay uses bounded deterministic exponential backoff", () => {
  assert.equal(
    resolveCollectionRollupRefreshReconnectDelayMs({
      attempt: 0,
      baseDelayMs: 20,
      maxDelayMs: 100,
      jitterRatio: 0,
      channel: COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL,
    }),
    20,
  );
  assert.equal(
    resolveCollectionRollupRefreshReconnectDelayMs({
      attempt: 2,
      baseDelayMs: 20,
      maxDelayMs: 100,
      jitterRatio: 0,
      channel: COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL,
    }),
    80,
  );
  assert.equal(
    resolveCollectionRollupRefreshReconnectDelayMs({
      attempt: 8,
      baseDelayMs: 20,
      maxDelayMs: 100,
      jitterRatio: 0,
      channel: COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL,
    }),
    100,
  );

  const jitteredDelay = resolveCollectionRollupRefreshReconnectDelayMs({
    attempt: 1,
    baseDelayMs: 20,
    maxDelayMs: 100,
    jitterRatio: 0.2,
    channel: COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL,
  });

  assert.equal(
    jitteredDelay,
    resolveCollectionRollupRefreshReconnectDelayMs({
      attempt: 1,
      baseDelayMs: 20,
      maxDelayMs: 100,
      jitterRatio: 0.2,
      channel: COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL,
    }),
  );
  assert.equal(jitteredDelay >= 40 && jitteredDelay <= 48, true);
});

test("assertSafeChannelName accepts only bounded PostgreSQL notification channel identifiers", () => {
  assert.equal(assertSafeChannelName("collection_updates"), "collection_updates");
  assert.equal(assertSafeChannelName("collection-updates"), "collection-updates");
  assert.equal(assertSafeChannelName("_collection_updates_01"), "_collection_updates_01");

  assert.throws(() => assertSafeChannelName("legit; DROP TABLE users; --"), /Invalid PostgreSQL/);
  assert.throws(() => assertSafeChannelName("collection updates"), /Invalid PostgreSQL/);
  assert.throws(() => assertSafeChannelName("collection'updates"), /Invalid PostgreSQL/);
  assert.throws(() => assertSafeChannelName("collection\"updates"), /Invalid PostgreSQL/);
  assert.throws(() => assertSafeChannelName("collection\0updates"), /Invalid PostgreSQL/);
  assert.throws(() => assertSafeChannelName("1_collection_updates"), /Invalid PostgreSQL/);
  assert.throws(() => assertSafeChannelName("a".repeat(64)), /Invalid PostgreSQL/);
  assert.throws(() => assertSafeChannelName("select_all"), /Invalid PostgreSQL/);
  assert.throws(() => assertSafeChannelName(null), /must be a string/);
});

test("escapePostgresNotificationChannel quotes safe channel identifiers for LISTEN interpolation", () => {
  assert.equal(
    escapePostgresNotificationChannel(COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL),
    `"${COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL}"`,
  );
  assert.equal(escapePostgresNotificationChannel("collection-updates"), "\"collection-updates\"");
  assert.throws(() => escapePostgresNotificationChannel("legit; DROP TABLE users; --"), /Invalid PostgreSQL/);
});

test("CollectionRollupRefreshNotificationSubscriber listens on the queue channel and forwards notifications", async () => {
  const client = new FakeNotificationClient();
  let wakeCount = 0;

  const subscriber = new CollectionRollupRefreshNotificationSubscriber({
    clientFactory: () => client,
    reconnectDelayMs: 20,
  });

  await subscriber.start(() => {
    wakeCount += 1;
  });

  assert.deepEqual(client.listenQueries, [
    `LISTEN "${COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL}"`,
  ]);

  client.emit("notification", {
    channel: COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL,
  });
  client.emit("notification", {
    channel: "different_channel",
  });

  assert.equal(wakeCount, 1);

  await subscriber.stop();
  assert.equal(client.endCalls, 1);
});

test("CollectionRollupRefreshNotificationSubscriber removes PostgreSQL listeners on stop", async () => {
  const client = new FakeNotificationClient();
  let wakeCount = 0;

  const subscriber = new CollectionRollupRefreshNotificationSubscriber({
    clientFactory: () => client,
    reconnectDelayMs: 20,
  });

  await subscriber.start(() => {
    wakeCount += 1;
  });

  assert.equal(client.listenerCount("notification"), 1);
  assert.equal(client.listenerCount("error"), 1);
  assert.equal(client.listenerCount("end"), 1);

  await subscriber.stop();

  assert.equal(client.listenerCount("notification"), 0);
  assert.equal(client.listenerCount("error"), 0);
  assert.equal(client.listenerCount("end"), 0);

  client.emit("notification", {
    channel: COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL,
  });
  assert.equal(wakeCount, 0);
});

test("removePostgresNotificationClientListener uses removeListener when available", () => {
  const { client, emitter } = createListenerRemovalClient({
    includeRemoveListener: true,
  });
  const listener = () => undefined;

  client.on("end", listener);
  assert.equal(emitter.listenerCount("end"), 1);

  removePostgresNotificationClientListener(client, "end", listener);
  assert.equal(emitter.listenerCount("end"), 0);
});

test("removePostgresNotificationClientListener falls back to off when removeListener is unavailable", () => {
  const { client, emitter } = createListenerRemovalClient({
    includeOff: true,
  });
  const listener = (message: { channel?: string }) => {
    assert.equal(message.channel, COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL);
  };

  client.on("notification", listener);
  assert.equal(emitter.listenerCount("notification"), 1);

  removePostgresNotificationClientListener(client, "notification", listener);
  assert.equal(emitter.listenerCount("notification"), 0);
});

test("removePostgresNotificationClientListener records unavailable cleanup primitives", (t) => {
  const { client } = createListenerRemovalClient({});
  const errors: Array<{ message: string; meta?: Record<string, unknown> }> = [];
  const beforeFailures = getInternalMetricsSnapshot()
    .counters.collectionRollupNotificationListenerRemovalFailuresTotal;
  t.mock.method(
    logger,
    "error",
    ((message: string, meta?: Record<string, unknown>) => {
      errors.push(meta ? { message, meta } : { message });
    }) as typeof logger.error,
  );

  assert.throws(
    () => removePostgresNotificationClientListener(client, "end", () => undefined),
    /does not support listener removal/,
  );

  assert.equal(
    getInternalMetricsSnapshot().counters.collectionRollupNotificationListenerRemovalFailuresTotal,
    beforeFailures + 1,
  );
  assert.equal(
    errors.some(({ message, meta }) => (
      message === "PostgreSQL notification listener removal is unavailable"
      && meta?.event === "collection_rollup_listener_removal_unavailable"
      && meta.status === "failed"
    )),
    true,
  );
});

test("CollectionRollupRefreshNotificationSubscriber retries after the initial connection fails", async () => {
  const firstClient = new FakeNotificationClient({
    connectError: new Error("connect failed"),
  });
  const secondClient = new FakeNotificationClient();
  const createdClients: FakeNotificationClient[] = [];

  const subscriber = new CollectionRollupRefreshNotificationSubscriber({
    reconnectDelayMs: 20,
    clientFactory: () => {
      const client = createdClients.length === 0 ? firstClient : secondClient;
      createdClients.push(client);
      return client;
    },
  });

  await subscriber.start(() => undefined);
  await waitFor(() => secondClient.listenQueries.length === 1);

  assert.equal(createdClients.length >= 2, true);
  assert.deepEqual(secondClient.listenQueries, [
    `LISTEN "${COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL}"`,
  ]);
  assert.equal(firstClient.listenerCount("notification"), 0);
  assert.equal(firstClient.listenerCount("error"), 0);
  assert.equal(firstClient.listenerCount("end"), 0);
  assert.equal(firstClient.endCalls, 1);

  await subscriber.stop();
});

test("CollectionRollupRefreshNotificationSubscriber cancels pending reconnects on stop", async () => {
  const firstClient = new FakeNotificationClient({
    connectError: new Error("connect failed"),
  });
  const createdClients: FakeNotificationClient[] = [];

  const subscriber = new CollectionRollupRefreshNotificationSubscriber({
    reconnectDelayMs: 25,
    clientFactory: () => {
      const client = createdClients.length === 0
        ? firstClient
        : new FakeNotificationClient();
      createdClients.push(client);
      return client;
    },
  });

  await subscriber.start(() => undefined);

  assert.equal(createdClients.length, 1);
  assert.equal(subscriber.getDiagnostics().reconnectPending, true);

  await subscriber.stop();

  assert.deepEqual(subscriber.getDiagnostics(), {
    activeClient: false,
    pendingListenerCleanups: 0,
    reconnectPending: false,
  });

  await new Promise((resolve) => {
    setTimeout(resolve, 75);
  });

  assert.equal(createdClients.length, 1);
  assert.equal(firstClient.listenerCount("notification"), 0);
  assert.equal(firstClient.listenerCount("error"), 0);
  assert.equal(firstClient.listenerCount("end"), 0);
  assert.equal(firstClient.endCalls, 1);
});

test("CollectionRollupRefreshNotificationSubscriber cleans old listeners before reconnecting after disconnect", async (t) => {
  const firstClient = new FakeNotificationClient();
  const secondClient = new FakeNotificationClient();
  const createdClients: FakeNotificationClient[] = [];
  t.mock.method(logger, "warn", (() => undefined) as typeof logger.warn);

  const subscriber = new CollectionRollupRefreshNotificationSubscriber({
    reconnectDelayMs: 20,
    clientFactory: () => {
      const client = createdClients.length === 0 ? firstClient : secondClient;
      createdClients.push(client);
      return client;
    },
  });

  await subscriber.start(() => undefined);
  firstClient.emit("error", new Error("connection dropped"));
  await waitFor(() => secondClient.listenQueries.length === 1);

  assert.equal(firstClient.listenerCount("notification"), 0);
  assert.equal(firstClient.listenerCount("error"), 0);
  assert.equal(firstClient.listenerCount("end"), 0);
  assert.equal(firstClient.endCalls, 1);
  assert.equal(secondClient.listenerCount("notification"), 1);
  assert.equal(secondClient.listenerCount("error"), 1);
  assert.equal(secondClient.listenerCount("end"), 1);

  await subscriber.stop();
  assert.equal(secondClient.listenerCount("notification"), 0);
  assert.equal(secondClient.listenerCount("error"), 0);
  assert.equal(secondClient.listenerCount("end"), 0);
});

test("CollectionRollupRefreshNotificationSubscriber keeps listener count stable across reconnect loops", async (t) => {
  const reconnectCycles = 12;
  const createdClients: FakeNotificationClient[] = [];
  t.mock.method(logger, "warn", (() => undefined) as typeof logger.warn);

  const subscriber = new CollectionRollupRefreshNotificationSubscriber({
    reconnectDelayMs: 1,
    clientFactory: () => {
      const client = new FakeNotificationClient();
      createdClients.push(client);
      return client;
    },
  });

  await subscriber.start(() => undefined);
  assert.equal(createdClients.length, 1);
  assert.equal(subscriber.getDiagnostics().pendingListenerCleanups, 1);

  for (let index = 0; index < reconnectCycles; index += 1) {
    const previousClient = createdClients[index];
    previousClient.emit("error", new Error(`disconnect-${index}`));
    await waitFor(() => (
      createdClients.length >= index + 2
      && createdClients[index + 1].listenQueries.length === 1
    ));

    assert.equal(previousClient.listenerCount("notification"), 0);
    assert.equal(previousClient.listenerCount("error"), 0);
    assert.equal(previousClient.listenerCount("end"), 0);
    assert.equal(previousClient.endCalls, 1);
    assert.equal(subscriber.getDiagnostics().pendingListenerCleanups, 1);
  }

  await subscriber.stop();

  for (const client of createdClients) {
    assert.equal(client.listenerCount("notification"), 0);
    assert.equal(client.listenerCount("error"), 0);
    assert.equal(client.listenerCount("end"), 0);
  }
  assert.deepEqual(subscriber.getDiagnostics(), {
    activeClient: false,
    pendingListenerCleanups: 0,
    reconnectPending: false,
  });
});

test("CollectionRollupRefreshNotificationSubscriber caps stale listener registrations", () => {
  const subscriber = new CollectionRollupRefreshNotificationSubscriber({
    clientFactory: () => new FakeNotificationClient(),
    reconnectDelayMs: 20,
  });
  const registry = getNotificationListenerRegistryForTest(subscriber);
  const clients = Array.from({ length: 6 }, () => new FakeNotificationClient());
  const beforeEvictions = getInternalMetricsSnapshot()
    .counters.collectionRollupNotificationListenerEvictionsTotal;

  for (const client of clients) {
    registry.subscribe(client, createNotificationListenerEntryForTest());
  }

  assert.equal(registry.size, 5);
  assert.equal(clients[0].listenerCount("notification"), 0);
  assert.equal(clients[0].listenerCount("error"), 0);
  assert.equal(clients[0].listenerCount("end"), 0);

  for (const client of clients.slice(1)) {
    assert.equal(client.listenerCount("notification"), 1);
    assert.equal(client.listenerCount("error"), 1);
    assert.equal(client.listenerCount("end"), 1);
  }
  assert.equal(
    getInternalMetricsSnapshot().counters.collectionRollupNotificationListenerEvictionsTotal,
    beforeEvictions + 1,
  );

  registry.teardown();
  for (const client of clients) {
    assert.equal(client.listenerCount("notification"), 0);
    assert.equal(client.listenerCount("error"), 0);
    assert.equal(client.listenerCount("end"), 0);
  }
});

test("CollectionRollupRefreshNotificationSubscriber prunes expired stale listener registrations", (t) => {
  const subscriber = new CollectionRollupRefreshNotificationSubscriber({
    clientFactory: () => new FakeNotificationClient(),
    reconnectDelayMs: 20,
  });
  const registry = getNotificationListenerRegistryForTest(subscriber);
  const staleClient = new FakeNotificationClient();
  const freshClient = new FakeNotificationClient();
  const beforeExpired = getInternalMetricsSnapshot()
    .counters.collectionRollupNotificationListenerExpiredTotal;
  let nowMs = 1_800_000_000_000;

  t.mock.method(Date, "now", () => nowMs);

  registry.subscribe(staleClient, createNotificationListenerEntryForTest());
  nowMs += 30 * 60 * 1000 + 1;
  registry.subscribe(freshClient, createNotificationListenerEntryForTest());

  assert.equal(registry.size, 1);
  assert.equal(staleClient.listenerCount("notification"), 0);
  assert.equal(staleClient.listenerCount("error"), 0);
  assert.equal(staleClient.listenerCount("end"), 0);
  assert.equal(freshClient.listenerCount("notification"), 1);
  assert.equal(freshClient.listenerCount("error"), 1);
  assert.equal(freshClient.listenerCount("end"), 1);
  assert.equal(
    getInternalMetricsSnapshot().counters.collectionRollupNotificationListenerExpiredTotal,
    beforeExpired + 1,
  );

  registry.teardown();
  assert.equal(freshClient.listenerCount("notification"), 0);
  assert.equal(freshClient.listenerCount("error"), 0);
  assert.equal(freshClient.listenerCount("end"), 0);
});

test("CollectionRollupRefreshNotificationSubscriber contains notification callback failures", async (t) => {
  const client = new FakeNotificationClient();
  const warnings: Array<{ message: string; meta?: Record<string, unknown> }> = [];
  const beforeFailures = getInternalMetricsSnapshot()
    .counters.collectionRollupNotificationCallbackFailuresTotal;
  t.mock.method(
    logger,
    "warn",
    ((message: string, meta?: Record<string, unknown>) => {
      warnings.push(meta ? { message, meta } : { message });
    }) as typeof logger.warn,
  );

  const subscriber = new CollectionRollupRefreshNotificationSubscriber({
    clientFactory: () => client,
    reconnectDelayMs: 20,
  });

  await subscriber.start(() => {
    throw new Error("callback failed");
  });

  assert.doesNotThrow(() => {
    client.emit("notification", {
      channel: COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL,
    });
  });
  assert.equal(
    warnings.some(({ message, meta }) => (
      message === "Collection rollup notification callback failed; polling fallback remains active"
      && meta?.event === "collection_rollup_notification_async_failure"
      && meta.operation === "notify_callback"
      && !("error" in meta)
    )),
    true,
  );
  assert.equal(
    getInternalMetricsSnapshot().counters.collectionRollupNotificationCallbackFailuresTotal,
    beforeFailures + 1,
  );

  await subscriber.stop();
});

test("CollectionRollupRefreshNotificationSubscriber observes rejected async notification callbacks", async (t) => {
  const client = new FakeNotificationClient();
  const warnings: Array<{ message: string; meta?: Record<string, unknown> }> = [];
  const beforeFailures = getInternalMetricsSnapshot()
    .counters.collectionRollupNotificationCallbackFailuresTotal;
  t.mock.method(
    logger,
    "warn",
    ((message: string, meta?: Record<string, unknown>) => {
      warnings.push(meta ? { message, meta } : { message });
    }) as typeof logger.warn,
  );

  const subscriber = new CollectionRollupRefreshNotificationSubscriber({
    clientFactory: () => client,
    reconnectDelayMs: 20,
  });

  await subscriber.start(async () => {
    throw new Error("callback failed");
  });

  client.emit("notification", {
    channel: COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL,
  });

  await waitFor(() => warnings.length > 0);
  assert.equal(
    warnings.some(({ message, meta }) => (
      message === "Collection rollup notification callback failed; polling fallback remains active"
      && meta?.event === "collection_rollup_notification_async_failure"
      && meta.operation === "notify_callback"
      && meta.critical === false
    )),
    true,
  );
  assert.equal(
    getInternalMetricsSnapshot().counters.collectionRollupNotificationCallbackFailuresTotal,
    beforeFailures + 1,
  );

  await subscriber.stop();
});

test("CollectionRollupRefreshNotificationSubscriber logs close failures without breaking shutdown", async (t) => {
  const client = new FakeNotificationClient({
    endError: new Error("close failed"),
  });
  const warnings: Array<{ message: string; meta?: Record<string, unknown> }> = [];

  t.mock.method(
    logger,
    "warn",
    ((message: string, meta?: Record<string, unknown>) => {
      warnings.push(meta ? { message, meta } : { message });
    }) as typeof logger.warn,
  );

  const subscriber = new CollectionRollupRefreshNotificationSubscriber({
    clientFactory: () => client,
    reconnectDelayMs: 20,
  });

  await subscriber.start(() => undefined);
  await assert.doesNotReject(async () => {
    await subscriber.stop();
  });

  assert.equal(client.endCalls, 1);
  assert.equal(
    warnings.some(({ message, meta }) => (
      message === "Failed to close collection rollup notification client cleanly; polling fallback remains active"
      && meta?.reason === "stop"
    )),
    true,
  );
});
