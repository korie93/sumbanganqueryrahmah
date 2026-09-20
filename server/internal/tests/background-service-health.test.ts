import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { logger } from "../../lib/logger";
import { startBackgroundServiceWithHealthSignal } from "../background-service-health";
import {
  clearStartupServiceDegraded,
  getStartupHealthSnapshot,
  markStartupServiceDegraded,
} from "../startup-health";

async function flushAsyncWork() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

async function listenOnLoopback(server: Server) {
  const listening = once(server, "listening");
  server.listen(0, "127.0.0.1");
  await listening;
}

async function closeTestServer(server: Server) {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test("schema-dependent background startup waits for listening and runs only once", async (t) => {
  const server = createServer();
  const initialListeningListeners = server.listenerCount("listening");
  let attempts = 0;
  const handle = startBackgroundServiceWithHealthSignal({
    service: "collection-rollup-refresh-queue",
    failureReason: "COLLECTION_ROLLUP_REFRESH_QUEUE_START_FAILED",
    failureDetails: "Collection queue could not start.",
    failureLogMessage: "Collection queue could not start",
    startAfterListening: server,
    start: async () => { attempts += 1; },
  });
  t.after(async () => {
    handle.stop();
    await closeTestServer(server);
  });

  assert.equal(attempts, 0);
  await flushAsyncWork();
  assert.equal(attempts, 0, "Registration must not bootstrap tables before storage is ready");
  assert.equal(server.listenerCount("listening"), initialListeningListeners + 1);

  await listenOnLoopback(server);
  await flushAsyncWork();
  assert.equal(attempts, 1);
  assert.equal(server.listenerCount("listening"), initialListeningListeners);
  server.emit("listening");
  await flushAsyncWork();
  assert.equal(attempts, 1, "A later listening event must not start the queue again");
});

test("stopping before listening removes the pending startup hook", async (t) => {
  const server = createServer();
  const initialListeningListeners = server.listenerCount("listening");
  let attempts = 0;
  const handle = startBackgroundServiceWithHealthSignal({
    service: "backup-job-queue",
    failureReason: "BACKUP_JOB_QUEUE_START_FAILED",
    failureDetails: "Backup queue could not start.",
    failureLogMessage: "Backup queue could not start",
    startAfterListening: server,
    start: async () => { attempts += 1; },
  });
  t.after(async () => {
    handle.stop();
    await closeTestServer(server);
  });

  assert.equal(attempts, 0);
  assert.equal(server.listenerCount("listening"), initialListeningListeners + 1);
  handle.stop();
  handle.stop();
  assert.equal(server.listenerCount("listening"), initialListeningListeners);

  await listenOnLoopback(server);
  await flushAsyncWork();
  assert.equal(attempts, 0, "A failed or cancelled app startup must not awaken the queue");
});

test("a background service registered after listening starts immediately", async (t) => {
  const server = createServer();
  t.after(() => closeTestServer(server));
  await listenOnLoopback(server);
  const initialListeningListeners = server.listenerCount("listening");
  let attempts = 0;
  const handle = startBackgroundServiceWithHealthSignal({
    service: "backup-job-queue",
    failureReason: "BACKUP_JOB_QUEUE_START_FAILED",
    failureDetails: "Backup queue could not start.",
    failureLogMessage: "Backup queue could not start",
    startAfterListening: server,
    start: async () => { attempts += 1; },
  });
  t.after(() => handle.stop());

  assert.equal(attempts, 1);
  await flushAsyncWork();
  assert.equal(attempts, 1);
  assert.equal(server.listenerCount("listening"), initialListeningListeners);
});

test("listening-gated startup still reports degradation and retries to recovery", { timeout: 5_000 }, async (t) => {
  const server = createServer();
  const initialListeningListeners = server.listenerCount("listening");
  const service = "collection-rollup-refresh-queue";
  clearStartupServiceDegraded(service);
  let degradedAtFailure = false;
  const errorMock = t.mock.method(logger, "error", () => {
    degradedAtFailure = getStartupHealthSnapshot().degradedServices.some((entry) =>
      entry.service === service && entry.reason === "COLLECTION_ROLLUP_REFRESH_QUEUE_START_FAILED");
  });
  let attempts = 0;
  let markRecovered: () => void = () => {};
  const recovered = new Promise<void>((resolve) => { markRecovered = resolve; });
  const handle = startBackgroundServiceWithHealthSignal({
    service,
    failureReason: "COLLECTION_ROLLUP_REFRESH_QUEUE_START_FAILED",
    failureDetails: "Collection queue could not start.",
    failureLogMessage: "Collection queue could not start",
    startAfterListening: server,
    retryDelayMs: 1,
    maxRetryDelayMs: 1,
    start: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("transient queue startup failure");
      markRecovered();
    },
  });
  t.after(async () => {
    handle.stop();
    clearStartupServiceDegraded(service);
    await closeTestServer(server);
  });

  assert.equal(attempts, 0);
  await listenOnLoopback(server);
  await recovered;
  await flushAsyncWork();

  assert.equal(attempts, 2);
  assert.equal(errorMock.mock.callCount(), 1);
  assert.equal(degradedAtFailure, true);
  assert.equal(getStartupHealthSnapshot().degradedServices.some((entry) => entry.service === service), false);
  assert.equal(server.listenerCount("listening"), initialListeningListeners);
});

test("startBackgroundServiceWithHealthSignal marks startup health degraded on start failure", async (t) => {
  const service = "backup-job-queue";
  clearStartupServiceDegraded(service);
  const errorMock = t.mock.method(logger, "error", () => undefined);

  try {
    const handle = startBackgroundServiceWithHealthSignal({
      service,
      failureReason: "BACKUP_JOB_QUEUE_START_FAILED",
      failureDetails: "Backup background job queue failed to start; see server logs.",
      failureLogMessage: "Failed to start backup background job queue",
      retryDelayMs: 60_000,
      start: async () => {
        throw new Error("queue bootstrap failed");
      },
    });
    t.after(() => handle.stop());

    await flushAsyncWork();

    const snapshot = getStartupHealthSnapshot();
    assert.equal(snapshot.degraded, true);
    assert.deepEqual(snapshot.degradedServices.map((entry) => entry.service), [service]);
    assert.equal(snapshot.degradedServices[0].reason, "BACKUP_JOB_QUEUE_START_FAILED");
    assert.equal(errorMock.mock.callCount(), 1);
  } finally {
    clearStartupServiceDegraded(service);
  }
});

test("startBackgroundServiceWithHealthSignal clears stale degraded state on successful start", async (t) => {
  const service = "backup-job-queue";
  markStartupServiceDegraded(service, "BACKUP_JOB_QUEUE_START_FAILED", "Previous failure.");

  try {
    const handle = startBackgroundServiceWithHealthSignal({
      service,
      failureReason: "BACKUP_JOB_QUEUE_START_FAILED",
      failureDetails: "Backup background job queue failed to start; see server logs.",
      failureLogMessage: "Failed to start backup background job queue",
      start: async () => undefined,
    });
    t.after(() => handle.stop());

    await flushAsyncWork();

    const snapshot = getStartupHealthSnapshot();
    assert.equal(snapshot.degradedServices.some((entry) => entry.service === service), false);
  } finally {
    clearStartupServiceDegraded(service);
  }
});

test("startBackgroundServiceWithHealthSignal retries failed startup and clears degraded state on recovery", async (t) => {
  const service = "backup-job-queue";
  clearStartupServiceDegraded(service);
  const errorMock = t.mock.method(logger, "error", () => undefined);
  let attempts = 0;

  const handle = startBackgroundServiceWithHealthSignal({
    service,
    failureReason: "BACKUP_JOB_QUEUE_START_FAILED",
    failureDetails: "Backup background job queue failed to start; see server logs.",
    failureLogMessage: "Failed to start backup background job queue",
    retryDelayMs: 1,
    maxRetryDelayMs: 1,
    start: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("transient queue bootstrap failure");
      }
    },
  });
  t.after(() => {
    handle.stop();
    clearStartupServiceDegraded(service);
  });

  await sleep(20);

  assert.equal(attempts, 2);
  assert.equal(errorMock.mock.callCount(), 1);
  assert.equal(getStartupHealthSnapshot().degradedServices.some((entry) => entry.service === service), false);
});

test("startBackgroundServiceWithHealthSignal stop cancels pending retries", async (t) => {
  const service = "collection-rollup-refresh-queue";
  clearStartupServiceDegraded(service);
  t.mock.method(logger, "error", () => undefined);
  let attempts = 0;

  const handle = startBackgroundServiceWithHealthSignal({
    service,
    failureReason: "COLLECTION_ROLLUP_REFRESH_QUEUE_START_FAILED",
    failureDetails: "Collection rollup refresh queue failed to start; see server logs.",
    failureLogMessage: "Failed to start collection rollup refresh queue",
    retryDelayMs: 5,
    maxRetryDelayMs: 5,
    start: async () => {
      attempts += 1;
      throw new Error("persistent queue bootstrap failure");
    },
  });
  t.after(() => {
    handle.stop();
    clearStartupServiceDegraded(service);
  });

  await flushAsyncWork();
  handle.stop();
  await sleep(20);

  assert.equal(attempts, 1);
});

test("startBackgroundServiceWithHealthSignal stop clears stale degraded service state", async (t) => {
  const service = "background-job-queue";
  clearStartupServiceDegraded(service);
  t.mock.method(logger, "error", () => undefined);

  const handle = startBackgroundServiceWithHealthSignal({
    service,
    failureReason: "BACKGROUND_JOB_QUEUE_START_FAILED",
    failureDetails: "Background job queue failed to start; see server logs.",
    failureLogMessage: "Failed to start background job queue",
    retryDelayMs: 60_000,
    start: async () => {
      throw new Error("queue bootstrap failed");
    },
  });
  t.after(() => {
    handle.stop();
    clearStartupServiceDegraded(service);
  });

  await flushAsyncWork();
  assert.equal(
    getStartupHealthSnapshot().degradedServices.some((entry) => entry.service === service),
    true,
  );

  handle.stop();

  assert.equal(
    getStartupHealthSnapshot().degradedServices.some((entry) => entry.service === service),
    false,
  );
});
