import assert from "node:assert/strict";
import test from "node:test";
import {
  CollectionOspV7ExportGuardError,
  createCollectionOspV7ExportGuard,
} from "../collection/collection-osp-v7-export-guard";

test("V7 heavy export guard limits concurrent work and per-user starts", async () => {
  let releaseFirst: (() => void) | undefined;
  const firstFinished = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const guard = createCollectionOspV7ExportGuard({
    maxConcurrent: 1,
    maxPerUserPerWindow: 1,
    windowMs: 60_000,
  });

  const first = guard.run("manager.one", async () => firstFinished);
  await assert.rejects(
    guard.run("manager.two", async () => undefined),
    (error) => error instanceof CollectionOspV7ExportGuardError && error.statusCode === 429,
  );
  releaseFirst?.();
  await first;

  await assert.rejects(
    guard.run("manager.one", async () => undefined),
    (error) => error instanceof CollectionOspV7ExportGuardError && error.statusCode === 429,
  );
});

test("default export guard permits CSV, XLSX, and separately authorized PNG/PDF datasets", async () => {
  const guard = createCollectionOspV7ExportGuard();

  await guard.run("manager.workflow", async () => "csv");
  await guard.run("manager.workflow", async () => "xlsx");
  await guard.run("manager.workflow", async () => "png-data");
  await guard.run("manager.workflow", async () => "pdf-data");

  await assert.rejects(
    guard.run("manager.workflow", async () => "extra"),
    (error) => error instanceof CollectionOspV7ExportGuardError && error.statusCode === 429,
  );
});

test("export quota retry metadata follows the exact sliding window without changing admission", async () => {
  let now = 1_000;
  const guard = createCollectionOspV7ExportGuard({ maxPerUserPerWindow: 2, windowMs: 60_000, now: () => now });
  await guard.run("staff", async () => undefined);
  now = 11_000;
  await guard.run("staff", async () => undefined);
  now = 21_001;
  await assert.rejects(guard.run("staff", async () => undefined), (error) => {
    assert.ok(error instanceof CollectionOspV7ExportGuardError);
    assert.deepEqual(error.rateLimit, { limit: 2, retryAfterMs: 39_999, resetAfterMs: 39_999 });
    return true;
  });
  now = 61_000;
  await guard.run("staff", async () => undefined);
});

test("tracked export capacity retry waits for the last retained start of the earliest expiring user", async () => {
  let now = 1_000;
  const guard = createCollectionOspV7ExportGuard({ maxTrackedUsers: 1, windowMs: 60_000, now: () => now });
  await guard.run("staff", async () => undefined);
  now = 11_000;
  await guard.run("staff", async () => undefined);
  now = 21_001;
  await assert.rejects(guard.run("other", async () => undefined), (error) => {
    assert.ok(error instanceof CollectionOspV7ExportGuardError);
    assert.deepEqual(error.rateLimit, { limit: 1, retryAfterMs: 49_999, resetAfterMs: 49_999 });
    return true;
  });
  now = 71_000;
  await guard.run("other", async () => undefined);
});

test("concurrent export retry guidance does not invent a completion reset time", async () => {
  let finish: (() => void) | undefined;
  const guard = createCollectionOspV7ExportGuard();
  const first = guard.run("staff", () => new Promise<void>((resolve) => { finish = resolve; }));
  try {
    await assert.rejects(guard.run("other", async () => undefined), (error) => {
      assert.ok(error instanceof CollectionOspV7ExportGuardError);
      assert.deepEqual(error.rateLimit, { limit: 1, retryAfterMs: 1_000 });
      return true;
    });
  } finally {
    finish?.();
    await first;
  }
});
