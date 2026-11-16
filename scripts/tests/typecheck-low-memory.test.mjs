import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { spawnSync } from "node:child_process";
import { checkTypecheckBatch, verifyTypecheckBatch } from "../lib/typecheck-low-memory.mjs";

function fixture(extraOptions = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "sqr-types-"));
  const config = path.join(directory, "tsconfig.json");
  writeFileSync(config, JSON.stringify({ compilerOptions: {
    strict: true, noEmit: true, skipLibCheck: true, types: [], target: "ES2020", ...extraOptions,
  }, include: ["*.ts"] }));
  writeFileSync(path.join(directory, "ambient.d.ts"), "declare const globalNumber: number;");
  writeFileSync(path.join(directory, "augmentation.ts"), "export {}; declare global { interface SharedTicket { id: number } }");
  writeFileSync(path.join(directory, "model.ts"), "export interface Model { value: number }");
  writeFileSync(path.join(directory, "consumer.ts"), 'import type { Model } from "./model"; const a: string = globalNumber; const b: SharedTicket = { id: "bad" }; const c: Model = { value: "bad" };');
  return { directory, config };
}

test("batched semantic checks preserve full-program globals, augmentations and imported types", async () => {
  const { config } = fixture();
  const plan = await checkTypecheckBatch(config);
  assert.deepEqual(plan.diagnostics, []);
  assert.equal(plan.rootCount, 4);
  assert.equal(plan.files.length, 4);
  const actual = [];
  for (const file of plan.files) {
    const result = await checkTypecheckBatch(config, [file]);
    verifyTypecheckBatch(plan, result, [file]);
    actual.push(...result.diagnostics);
  }
  const parsed = ts.getParsedCommandLineOfConfigFile(config, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: assert.fail });
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const expected = ts.getPreEmitDiagnostics(program).map(({ code, start }) => [code, start]);
  assert.deepEqual(actual.map(({ code, start }) => [code, start]), expected);
  assert.equal(actual.length, 3);
  assert.ok(actual.every(({ code }) => code === 2322));
});

test("changed source and missing batch coverage cannot produce a pass", async () => {
  const { directory, config } = fixture();
  const plan = await checkTypecheckBatch(config);
  writeFileSync(path.join(directory, "model.ts"), "export interface Model { value: string }");
  const result = await checkTypecheckBatch(config, [plan.files[0]]);
  assert.throws(() => verifyTypecheckBatch(plan, result, [plan.files[0]]), /changed/);
  assert.throws(() => verifyTypecheckBatch(plan, { ...plan, files: [] }, [plan.files[0]]), /coverage/);
  await assert.rejects(checkTypecheckBatch(config, ["missing.ts"]), /Invalid/);
});

test("configuration requiring build semantics is rejected instead of weakened", async () => {
  const { config } = fixture({ incremental: true });
  await assert.rejects(checkTypecheckBatch(config), /standard typecheck/);
});

test("standard CI typecheck and strict root configuration remain in place", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const config = JSON.parse(readFileSync("tsconfig.json", "utf8"));
  assert.equal(pkg.scripts.typecheck, "tsc --noEmit");
  assert.equal(pkg.scripts["typecheck:low-memory"], "node scripts/run-typecheck-low-memory.mjs --context-types=node");
  assert.equal(config.compilerOptions.strict, true);
  assert.deepEqual(config.include, ["client/src", "server", "shared"]);
});

test("explicit installed type context is shared without changing compiler options", async () => {
  const { directory, config } = fixture();
  const typeDirectory = path.join(directory, "node_modules", "@types", "test-context");
  mkdirSync(typeDirectory, { recursive: true });
  writeFileSync(path.join(typeDirectory, "index.d.ts"), "declare const sharedEnvironmentValue: number;");
  const consumer = path.join(directory, "consumer.ts");
  writeFileSync(consumer, "export const count: number = sharedEnvironmentValue;");
  const before = readFileSync(config, "utf8");
  assert.ok((await checkTypecheckBatch(config, [consumer])).diagnostics.some(({ code }) => code === 2304));
  assert.deepEqual((await checkTypecheckBatch(config, [consumer], ["test-context"])).diagnostics, []);
  assert.equal(readFileSync(config, "utf8"), before);
  await assert.rejects(checkTypecheckBatch(config, [consumer], ["missing-context"]), /unavailable/);
});

test("CLI rejects real type errors and reports success only after every clean batch", () => {
  const { directory, config } = fixture();
  const run = () => spawnSync(process.execPath, ["scripts/run-typecheck-low-memory.mjs",
    `--project=${config}`, "--batch-size=1", "--heap-mb=256"], {
    encoding: "utf8", timeout: 60_000, maxBuffer: 1024 * 1024, windowsHide: true,
  });
  const failed = run();
  assert.ifError(failed.error);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /TS2322/);
  assert.doesNotMatch(failed.stdout, /PASS:/);
  writeFileSync(path.join(directory, "consumer.ts"), 'import type { Model } from "./model"; const a: number = globalNumber; const b: SharedTicket = { id: 1 }; const c: Model = { value: 1 };');
  const passed = run();
  assert.ifError(passed.error);
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /4\/4 checked/);
  assert.match(passed.stdout, /PASS: all 4 root files checked/);
});
