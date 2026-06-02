import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { attachLocalRuntimeGlue } from "../local-runtime-glue";

test("local runtime glue sweeps AI caches in the background and clears the timer on close", (t) => {
  const server = new EventEmitter();
  const intervalHandle = {
    unrefCalls: 0,
    unref() {
      this.unrefCalls += 1;
      return this;
    },
  };
  const clearedHandles: unknown[] = [];
  let intervalHandler: TimerHandler | undefined;
  let intervalDelay: number | undefined;
  let gcObserverCalls = 0;
  let processHandlerAttached = false;
  let runtimeLoopStarted = false;
  let stopRuntimeMonitorCalls = 0;
  let disposeDebugStateCalls = 0;
  const sweepCalls: number[] = [];

  t.mock.method(Date, "now", () => 123_456);
  t.mock.method(
    globalThis,
    "setInterval",
    (((handler: TimerHandler, delay?: number) => {
      intervalHandler = handler;
      intervalDelay = Number(delay ?? 0);
      return intervalHandle;
    }) as unknown) as typeof setInterval,
  );
  t.mock.method(
    globalThis,
    "clearInterval",
    (((handle?: ReturnType<typeof setInterval>) => {
      if (handle) {
        clearedHandles.push(handle);
      }
    }) as unknown) as typeof clearInterval,
  );

  attachLocalRuntimeGlue({
    server: server as never,
    aiSearchService: {
      clearSearchCache: () => undefined,
      disposeDebugState: () => {
        disposeDebugStateCalls += 1;
      },
      sweepCaches: (now?: number) => {
        sweepCalls.push(Number(now));
      },
    },
    attachGcObserver: () => {
      gcObserverCalls += 1;
    },
    attachProcessMessageHandlers: () => {
      processHandlerAttached = true;
    },
    startRuntimeLoops: () => {
      runtimeLoopStarted = true;
    },
    stopRuntimeMonitor: () => {
      stopRuntimeMonitorCalls += 1;
    },
  });

  assert.equal(gcObserverCalls, 1);
  assert.equal(processHandlerAttached, true);
  assert.equal(runtimeLoopStarted, true);
  assert.equal(intervalDelay, 30_000);
  assert.equal(intervalHandle.unrefCalls, 1);
  assert.equal(typeof intervalHandler, "function");

  if (typeof intervalHandler === "function") {
    intervalHandler();
  }

  assert.deepEqual(sweepCalls, [123_456]);

  server.emit("close");

  assert.deepEqual(clearedHandles, [intervalHandle]);
  assert.equal(disposeDebugStateCalls, 1);
  assert.equal(stopRuntimeMonitorCalls, 1);
});
