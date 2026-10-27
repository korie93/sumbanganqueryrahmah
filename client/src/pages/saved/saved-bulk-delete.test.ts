import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteSavedImports,
  SAVED_BULK_DELETE_CONCURRENCY,
} from "@/pages/saved/saved-bulk-delete";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

test("bulk deletion runs at most three requests and refills each available slot", async () => {
  const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const completions = new Map(ids.map((id) => [id, deferred()]));
  const starts = new Map(ids.map((id) => [id, deferred()]));
  const calls: string[] = [];
  const controller = new AbortController();
  let active = 0;
  let peak = 0;
  const operation = deleteSavedImports(ids, {
    signal: controller.signal,
    deleteOne: async (id, options) => {
      assert.equal(options.signal, controller.signal);
      calls.push(id);
      active += 1;
      peak = Math.max(peak, active);
      starts.get(id)!.resolve();
      try {
        await completions.get(id)!.promise;
      } finally {
        active -= 1;
      }
    },
  });

  assert.equal(SAVED_BULK_DELETE_CONCURRENCY, 3);
  assert.deepEqual(calls, ["a", "b", "c"]);
  completions.get("b")!.resolve();
  await starts.get("d")!.promise;
  assert.deepEqual(calls, ["a", "b", "c", "d"]);
  assert.equal(active, 3);
  completions.get("a")!.resolve();
  await starts.get("e")!.promise;
  completions.get("c")!.resolve();
  await starts.get("f")!.promise;
  assert.equal(active, 3);
  for (const completion of completions.values()) completion.resolve();

  assert.deepEqual(await operation, { deletedIds: ids, failedIds: [] });
  assert.equal(peak, 3);
  assert.equal(active, 0);
  assert.deepEqual(calls, ids);
  assert.equal(new Set(calls).size, ids.length);
});

test("out-of-order failures retain input order and do not prevent later deletions", async () => {
  const ids = ["a", "b", "c", "d"];
  const completions = new Map(ids.map((id) => [id, deferred()]));
  const startedLast = deferred();
  const calls: string[] = [];
  const operation = deleteSavedImports(ids, {
    signal: new AbortController().signal,
    deleteOne: (id) => {
      calls.push(id);
      if (id === "d") startedLast.resolve();
      return completions.get(id)!.promise;
    },
  });
  completions.get("b")!.reject(new Error("synthetic denied file"));
  await startedLast.promise;
  completions.get("d")!.reject(new Error("synthetic failed file"));
  completions.get("c")!.resolve();
  completions.get("a")!.resolve();

  assert.deepEqual(await operation, { deletedIds: ["a", "c"], failedIds: ["b", "d"] });
  assert.deepEqual(calls, ids);
});

test("all failed requests are reported once without automatic retries", async () => {
  const ids = ["a", "b", "c", "d", "e"];
  const calls: string[] = [];
  const result = await deleteSavedImports(ids, {
    signal: new AbortController().signal,
    deleteOne: async (id) => {
      calls.push(id);
      throw new Error("synthetic delete failure");
    },
  });
  assert.deepEqual(result, { deletedIds: [], failedIds: ids });
  assert.deepEqual(calls, ids);
});

test("synchronous request throws are isolated from the remaining selected files", async () => {
  const calls: string[] = [];
  const result = await deleteSavedImports(["a", "b", "c", "d"], {
    signal: new AbortController().signal,
    deleteOne: (id) => {
      calls.push(id);
      if (id === "a" || id === "d") throw new Error("synthetic synchronous failure");
      return Promise.resolve(false);
    },
  });
  assert.deepEqual(result, { deletedIds: ["b", "c"], failedIds: ["a", "d"] });
  assert.deepEqual(calls, ["a", "b", "c", "d"]);
});

test("empty selections never dispatch a deletion", async () => {
  let calls = 0;
  const result = await deleteSavedImports([], {
    signal: new AbortController().signal,
    deleteOne: async () => { calls += 1; },
  });
  assert.deepEqual(result, { deletedIds: [], failedIds: [] });
  assert.equal(calls, 0);
});

test("a pre-aborted selection rejects with AbortError before any request starts", async () => {
  const controller = new AbortController();
  controller.abort(new Error("synthetic caller reason"));
  let calls = 0;
  await assert.rejects(deleteSavedImports(["a", "b"], {
    signal: controller.signal,
    deleteOne: async () => { calls += 1; },
  }), isAbortError);
  assert.equal(calls, 0);
});

test("cancellation stops queued requests and waits for every already-started request", async () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const completions = new Map(ids.map((id) => [id, deferred()]));
  const calls: string[] = [];
  const controller = new AbortController();
  let active = 0;
  let settled = false;
  const operation = deleteSavedImports(ids, {
    signal: controller.signal,
    deleteOne: async (id) => {
      calls.push(id);
      active += 1;
      try {
        await completions.get(id)!.promise;
      } finally {
        active -= 1;
      }
    },
  });
  void operation.then(() => { settled = true; }, () => { settled = true; });
  const rejected = assert.rejects(operation, isAbortError);
  assert.deepEqual(calls, ["a", "b", "c"]);
  controller.abort();
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(active, 3);

  completions.get("a")!.resolve();
  completions.get("b")!.reject(new Error("synthetic aborted transport"));
  completions.get("c")!.resolve();
  await rejected;
  assert.deepEqual(calls, ["a", "b", "c"]);
  assert.equal(active, 0);
  assert.equal(settled, true);
});

test("a synchronous cancellation in a request prevents all subsequent dispatches", async () => {
  const controller = new AbortController();
  const calls: string[] = [];
  await assert.rejects(deleteSavedImports(["a", "b", "c", "d"], {
    signal: controller.signal,
    deleteOne: async (id) => {
      calls.push(id);
      controller.abort();
    },
  }), isAbortError);
  assert.deepEqual(calls, ["a"]);
});

test("the queue snapshots selection without mutating or reading later caller changes", async () => {
  const ids = ["a", "b", "c", "d"];
  const firstWave = deferred();
  const calls: string[] = [];
  const operation = deleteSavedImports(ids, {
    signal: new AbortController().signal,
    deleteOne: async (id) => {
      calls.push(id);
      await firstWave.promise;
    },
  });
  ids[3] = "replacement";
  ids.push("unselected");
  firstWave.resolve();
  assert.deepEqual(await operation, { deletedIds: ["a", "b", "c", "d"], failedIds: [] });
  assert.deepEqual(calls, ["a", "b", "c", "d"]);
  assert.deepEqual(ids, ["a", "b", "c", "replacement", "unselected"]);
});
