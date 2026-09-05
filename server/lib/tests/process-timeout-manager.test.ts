import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { createProcessTimeoutChain, type ProcessTimeoutChain } from "../process-timeout-manager";

class FakeTimeoutProcess extends EventEmitter {
  readonly killSignals: NodeJS.Signals[] = [];

  kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
    this.killSignals.push(signal);
    return true;
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForSignal(signal: Promise<void>, timeoutMs = 1_000) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for process timeout signal")), timeoutMs);
    signal.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

test("process timeout chain sends soft then hard kill signals", async () => {
  const child = new FakeTimeoutProcess();
  let softTimeouts = 0;
  let hardTimeouts = 0;
  let resolveHardTimeout!: () => void;
  const hardTimeoutReached = new Promise<void>((resolve) => {
    resolveHardTimeout = resolve;
  });

  createProcessTimeoutChain({
    hardTimeoutMs: 5,
    onHardTimeout: () => {
      hardTimeouts += 1;
      resolveHardTimeout();
    },
    onSoftTimeout: () => {
      softTimeouts += 1;
    },
    process: child,
    softTimeoutMs: 1,
  });

  await waitForSignal(hardTimeoutReached);

  assert.equal(softTimeouts, 1);
  assert.equal(hardTimeouts, 1);
  assert.deepEqual(child.killSignals, ["SIGTERM", "SIGKILL"]);
});

test("process timeout chain can preserve hard timeout after soft-timeout cleanup", async () => {
  const child = new FakeTimeoutProcess();
  let chain: ProcessTimeoutChain | null = null;
  let resolveHardTimeout!: () => void;
  const hardTimeoutReached = new Promise<void>((resolve) => {
    resolveHardTimeout = resolve;
  });

  chain = createProcessTimeoutChain({
    hardTimeoutMs: 5,
    onHardTimeout: resolveHardTimeout,
    onSoftTimeout: () => {
      chain?.cancel({ preserveHardTimeout: true });
    },
    process: child,
    softTimeoutMs: 1,
  });

  await waitForSignal(hardTimeoutReached);

  assert.deepEqual(child.killSignals, ["SIGTERM", "SIGKILL"]);
});

test("process timeout chain cancel prevents pending timeout signals", async () => {
  const child = new FakeTimeoutProcess();
  const chain = createProcessTimeoutChain({
    hardTimeoutMs: 5,
    process: child,
    softTimeoutMs: 20,
  });

  chain.cancel();
  await wait(30);

  assert.deepEqual(child.killSignals, []);
});

test("process timeout chain clean exit cancels timers and reports exit details", async () => {
  const child = new FakeTimeoutProcess();
  let cleanExit: { code: number | null; signal: NodeJS.Signals | null } | null = null;

  createProcessTimeoutChain({
    hardTimeoutMs: 5,
    onCleanExit: (code, signal) => {
      cleanExit = { code, signal };
    },
    process: child,
    softTimeoutMs: 20,
    watchExit: true,
  });

  child.emit("close", 0, null);
  await wait(30);

  assert.deepEqual(cleanExit, { code: 0, signal: null });
  assert.deepEqual(child.killSignals, []);
});

test("process timeout chain handles exit before close once", async () => {
  const child = new FakeTimeoutProcess();
  const cleanExits: Array<{ code: number | null; signal: NodeJS.Signals | null }> = [];

  createProcessTimeoutChain({
    hardTimeoutMs: 5,
    onCleanExit: (code, signal) => {
      cleanExits.push({ code, signal });
    },
    process: child,
    softTimeoutMs: 20,
    watchExit: true,
  });

  child.emit("exit", 0, null);
  child.emit("close", 0, null);
  await wait(30);

  assert.deepEqual(cleanExits, [{ code: 0, signal: null }]);
  assert.deepEqual(child.killSignals, []);
});
