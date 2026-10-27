import assert from "node:assert/strict";
import test from "node:test";
import { createFloatingAIRuntimeLoader } from "./floating-ai-runtime-loader";

const runtime = { default: () => null };

test("creating the floating AI loader does not import its runtime", () => {
  let imports = 0;
  createFloatingAIRuntimeLoader(async () => { imports += 1; return runtime; });
  assert.equal(imports, 0);
});

test("concurrent activations share one runtime import and reuse its completed module", async () => {
  let imports = 0;
  let resolveRuntime!: (value: typeof runtime) => void;
  const load = createFloatingAIRuntimeLoader(() => {
    imports += 1;
    return new Promise((resolve) => { resolveRuntime = resolve; });
  });
  const first = load();
  const second = load();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(imports, 1);
  resolveRuntime(runtime);
  assert.equal(await first, runtime);
  assert.equal(load(), first);
  assert.equal(await load(), runtime);
  assert.equal(imports, 1);
});

test("a failed runtime import can be retried without duplicate concurrent attempts", async () => {
  let imports = 0;
  const load = createFloatingAIRuntimeLoader(async () => {
    imports += 1;
    if (imports === 1) throw new Error("synthetic chunk unavailable");
    return runtime;
  });
  const first = load();
  assert.equal(load(), first);
  await assert.rejects(first, /synthetic chunk unavailable/);
  const retry = load();
  assert.notEqual(retry, first);
  assert.equal(load(), retry);
  assert.equal(await retry, runtime);
  assert.equal(imports, 2);
});

test("synchronous importer failures follow the same retry lifecycle", async () => {
  let imports = 0;
  const load = createFloatingAIRuntimeLoader(() => {
    imports += 1;
    if (imports === 1) throw new Error("synthetic import failure");
    return Promise.resolve(runtime);
  });
  await assert.rejects(load(), /synthetic import failure/);
  assert.equal(await load(), runtime);
  assert.equal(imports, 2);
});

test("a rejected primary module uses the separate build-owned retry entry", async () => {
  let primary = 0;
  let alternate = 0;
  const load = createFloatingAIRuntimeLoader(
    async () => { primary += 1; throw new Error("synthetic failed module URL"); },
    async () => { alternate += 1; return runtime; },
  );
  await assert.rejects(load(), /synthetic failed module URL/);
  const retry = load();
  assert.equal(load(), retry);
  assert.equal(await retry, runtime);
  assert.equal(await load(), runtime);
  assert.equal(primary, 1);
  assert.equal(alternate, 1);
});
