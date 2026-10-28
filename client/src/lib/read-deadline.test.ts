import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import test, { type TestContext } from "node:test";
import {
  READ_DEADLINE_MESSAGE,
  READ_DEADLINE_MS,
  ReadDeadlineError,
  isReadDeadlineError,
  withReadDeadline,
} from "./read-deadline";

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((accept, refuse) => { resolve = accept; reject = refuse; });
  return { promise, resolve, reject };
}

function clock(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
}

function resources(t: TestContext, signal: AbortSignal) {
  return {
    timer: t.mock.method(globalThis, "setTimeout"),
    clear: t.mock.method(globalThis, "clearTimeout"),
    add: t.mock.method(signal, "addEventListener"),
    remove: t.mock.method(signal, "removeEventListener"),
  };
}

test("a pending header read expires at 60000ms, never at 59999ms, without aborting its owner", async (t) => {
  clock(t);
  assert.equal(READ_DEADLINE_MS, 60_000);
  const caller = new AbortController();
  const headers = deferred<string>();
  let child: AbortSignal | undefined;
  let rejection: unknown;
  const read = withReadDeadline((signal) => { child = signal; return headers.promise; }, caller.signal);
  void read.catch((error: unknown) => { rejection = error; });
  assert.ok(child);
  assert.notEqual(child, caller.signal);
  t.mock.timers.tick(59_999);
  await Promise.resolve();
  assert.equal(rejection, undefined);
  assert.equal(child.aborted, false);
  t.mock.timers.tick(1);
  await assert.rejects(read, (error: unknown) => isReadDeadlineError(error)
    && error.name === "ReadDeadlineError" && error.message === READ_DEADLINE_MESSAGE);
  assert.equal(child.aborted, true);
  assert.equal(caller.signal.aborted, false);
});

test("receiving headers does not remove or restart the deadline while the body remains pending", async (t) => {
  clock(t);
  const caller = new AbortController();
  const headers = deferred<void>();
  const body = deferred<string>();
  let readingBody = false;
  const read = withReadDeadline(async () => {
    await headers.promise;
    readingBody = true;
    return body.promise;
  }, caller.signal);
  const rejected = assert.rejects(read, ReadDeadlineError);
  t.mock.timers.tick(10_000);
  headers.resolve();
  await Promise.resolve();
  assert.equal(readingBody, true);
  t.mock.timers.tick(49_999);
  assert.equal(caller.signal.aborted, false);
  t.mock.timers.tick(1);
  await rejected;
});

test("retry waiting uses the same full-operation deadline instead of a fresh wait budget", async (t) => {
  clock(t);
  const caller = new AbortController();
  const body = deferred<string>();
  let retried = false;
  const read = withReadDeadline(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 50_000));
    retried = true;
    return body.promise;
  }, caller.signal);
  const rejected = assert.rejects(read, ReadDeadlineError);
  t.mock.timers.tick(50_000);
  await Promise.resolve();
  assert.equal(retried, true);
  t.mock.timers.tick(10_000);
  await rejected;
});

test("caller cancellation wins before the deadline and keeps AbortError classification", async (t) => {
  clock(t);
  const caller = new AbortController();
  let child: AbortSignal | undefined;
  const read = withReadDeadline((signal) => {
    child = signal;
    return new Promise<string>(() => {});
  }, caller.signal);
  const rejected = assert.rejects(read, (error: unknown) => error instanceof DOMException
    && error.name === "AbortError" && !isReadDeadlineError(error));
  t.mock.timers.tick(59_999);
  caller.abort(new Error("Synthetic caller cancellation reason"));
  await rejected;
  assert.equal(child?.aborted, true);
  t.mock.timers.tick(1);
  await rejected;
});

test("an already aborted owner starts no work, timer or abort listener", async (t) => {
  clock(t);
  const caller = new AbortController();
  caller.abort();
  const watched = resources(t, caller.signal);
  let calls = 0;
  const read = withReadDeadline(async () => { calls += 1; return "unexpected"; }, caller.signal);
  assert.equal(calls, 0);
  assert.equal(watched.timer.mock.callCount(), 0);
  assert.equal(watched.add.mock.callCount(), 0);
  await assert.rejects(read, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
});

test("success clears its timer and listener before returning and cannot later abort completed work", async (t) => {
  clock(t);
  const caller = new AbortController();
  const watched = resources(t, caller.signal);
  let child: AbortSignal | undefined;
  const value = await withReadDeadline(async (signal) => { child = signal; return "complete"; }, caller.signal);
  assert.equal(value, "complete");
  assert.equal(watched.timer.mock.callCount(), 1);
  assert.equal(watched.clear.mock.callCount(), 1);
  assert.equal(watched.add.mock.callCount(), 1);
  assert.equal(watched.remove.mock.callCount(), 1);
  t.mock.timers.tick(READ_DEADLINE_MS);
  caller.abort();
  assert.equal(child?.aborted, false);
});

test("ordinary rejection and synchronous throws preserve their error and release resources", async (t) => {
  clock(t);
  for (const synchronous of [false, true]) {
    const caller = new AbortController();
    const add = t.mock.method(caller.signal, "addEventListener");
    const remove = t.mock.method(caller.signal, "removeEventListener");
    const failure = new Error("Synthetic read failure");
    let child: AbortSignal | undefined;
    const read = withReadDeadline((signal) => {
      child = signal;
      if (synchronous) throw failure;
      return Promise.reject(failure);
    }, caller.signal);
    await assert.rejects(read, (error: unknown) => error === failure);
    assert.equal(add.mock.callCount(), 1);
    assert.equal(remove.mock.callCount(), 1);
    t.mock.timers.tick(READ_DEADLINE_MS);
    caller.abort();
    assert.equal(child?.aborted, false);
  }
});

test("timeouts release resources and beat cooperative abort rejection", async (t) => {
  clock(t);
  const caller = new AbortController();
  const watched = resources(t, caller.signal);
  const read = withReadDeadline((signal) => new Promise<string>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted fetch", "AbortError")), { once: true });
  }), caller.signal, 25);
  const rejected = assert.rejects(read, ReadDeadlineError);
  t.mock.timers.tick(24);
  assert.equal(caller.signal.aborted, false);
  t.mock.timers.tick(1);
  await rejected;
  assert.equal(watched.clear.mock.callCount(), 1);
  assert.equal(watched.remove.mock.callCount(), 1);
  assert.equal(caller.signal.aborted, false);
});

test("cancellation during operation invocation wins over an immediate result", async (t) => {
  clock(t);
  const caller = new AbortController();
  const read = withReadDeadline(() => {
    caller.abort();
    return Promise.resolve("must not escape cancellation");
  }, caller.signal);
  await assert.rejects(read, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
});

test("late resolution and rejection cannot replace the timeout or leak an unhandled rejection", async (t) => {
  clock(t);
  const unhandled: unknown[] = [];
  const record = (error: unknown) => { unhandled.push(error); };
  process.on("unhandledRejection", record);
  t.after(() => { process.removeListener("unhandledRejection", record); });
  const lateSuccess = deferred<string>();
  const lateFailure = deferred<string>();
  const first = withReadDeadline(() => lateSuccess.promise, new AbortController().signal);
  const second = withReadDeadline(() => lateFailure.promise, new AbortController().signal);
  const firstRejected = assert.rejects(first, ReadDeadlineError);
  const secondRejected = assert.rejects(second, ReadDeadlineError);
  t.mock.timers.tick(READ_DEADLINE_MS);
  await Promise.all([firstRejected, secondRejected]);
  lateSuccess.resolve("obsolete result");
  lateFailure.reject(new Error("Obsolete synthetic failure"));
  await nextTurn();
  await nextTurn();
  assert.deepEqual(unhandled, []);
  await assert.rejects(first, ReadDeadlineError);
  await assert.rejects(second, ReadDeadlineError);
});

test("overlapping reads have independent timers and signals", async (t) => {
  clock(t);
  const ownerA = new AbortController(), ownerB = new AbortController();
  const responseA = deferred<string>(), responseB = deferred<string>();
  let signalA: AbortSignal | undefined, signalB: AbortSignal | undefined;
  const first = withReadDeadline((signal) => { signalA = signal; return responseA.promise; }, ownerA.signal);
  const firstRejected = assert.rejects(first, ReadDeadlineError);
  t.mock.timers.tick(1000);
  const second = withReadDeadline((signal) => { signalB = signal; return responseB.promise; }, ownerB.signal);
  t.mock.timers.tick(59_000);
  await firstRejected;
  assert.equal(signalA?.aborted, true);
  assert.equal(signalB?.aborted, false);
  assert.equal(ownerA.signal.aborted, false);
  assert.equal(ownerB.signal.aborted, false);
  responseB.resolve("independent result");
  assert.equal(await second, "independent result");
  t.mock.timers.tick(1000);
  assert.equal(signalB?.aborted, false);
});

test("deadline errors expose only the fixed safe message and cannot be spoofed by response text", () => {
  const error = new ReadDeadlineError();
  assert.equal(error.message, "Permintaan mengambil masa terlalu lama. Sila cuba semula.");
  assert.equal(isReadDeadlineError(error), true);
  assert.equal(isReadDeadlineError(new Error(READ_DEADLINE_MESSAGE)), false);
  assert.equal(isReadDeadlineError({ name: "ReadDeadlineError", message: READ_DEADLINE_MESSAGE }), false);
});

test("a successful result past the monotonic deadline cannot escape a delayed timer callback", async (t) => {
  clock(t);
  let elapsed = 0;
  t.mock.method(performance, "now", () => elapsed);
  const caller = new AbortController();
  let child: AbortSignal | undefined;
  const read = withReadDeadline(async (signal) => {
    child = signal;
    elapsed = READ_DEADLINE_MS;
    return "expired synchronous result";
  }, caller.signal);
  await assert.rejects(read, ReadDeadlineError);
  assert.equal(child?.aborted, true);
  assert.equal(caller.signal.aborted, false);
});
