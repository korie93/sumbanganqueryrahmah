import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  CollectionRollupRefreshNotificationSubscriber,
} from "../../lib/collection-rollup-refresh-notification";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

test("collection rollup notification subscriber removes listeners when startup is aborted", async () => {
  const connectDeferred = createDeferred<void>();
  const queryDeferred = createDeferred<unknown>();
  const emitter = new EventEmitter();
  let endCalls = 0;
  let queryStarted = false;

  const client = {
    connect: () => connectDeferred.promise,
    end: async () => {
      endCalls += 1;
    },
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    query: () => {
      queryStarted = true;
      return queryDeferred.promise;
    },
  };
  const subscriber = new CollectionRollupRefreshNotificationSubscriber({
    clientFactory: () => client,
    reconnectDelayMs: 60_000,
  });

  const startPromise = subscriber.start(() => {});

  assert.equal(emitter.listenerCount("notification"), 1);
  assert.equal(emitter.listenerCount("error"), 1);
  assert.equal(emitter.listenerCount("end"), 1);
  assert.equal(subscriber.getDiagnostics().pendingListenerCleanups, 1);

  const stopPromise = subscriber.stop();
  connectDeferred.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(queryStarted, true);

  queryDeferred.resolve(null);
  await Promise.all([startPromise, stopPromise]);

  assert.equal(endCalls, 1);
  assert.equal(emitter.listenerCount("notification"), 0);
  assert.equal(emitter.listenerCount("error"), 0);
  assert.equal(emitter.listenerCount("end"), 0);
  assert.deepEqual(subscriber.getDiagnostics(), {
    activeClient: false,
    pendingListenerCleanups: 0,
    reconnectPending: false,
  });
});
