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

  constructor(private readonly options: { connectError?: Error } = {}) {
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

  await subscriber.stop();
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
