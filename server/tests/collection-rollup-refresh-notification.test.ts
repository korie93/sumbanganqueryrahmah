import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL,
  CollectionRollupRefreshNotificationSubscriber,
} from "../lib/collection-rollup-refresh-notification";
import { logger } from "../lib/logger";

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
    `LISTEN ${COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL}`,
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
    `LISTEN ${COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL}`,
  ]);
  assert.equal(firstClient.listenerCount("notification"), 0);
  assert.equal(firstClient.listenerCount("error"), 0);
  assert.equal(firstClient.listenerCount("end"), 0);
  assert.equal(firstClient.endCalls, 1);

  await subscriber.stop();
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

test("CollectionRollupRefreshNotificationSubscriber contains notification callback failures", async (t) => {
  const client = new FakeNotificationClient();
  const warnings: string[] = [];
  t.mock.method(
    logger,
    "warn",
    ((message: string) => {
      warnings.push(message);
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
    warnings.includes("Collection rollup notification callback failed; polling fallback remains active"),
    true,
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
