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
