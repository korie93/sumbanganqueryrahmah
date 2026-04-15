import assert from "node:assert/strict";
import test from "node:test";
import { createRetryableModuleLoader } from "./retryable-module-loader";

test("createRetryableModuleLoader reuses the cached promise while the import succeeds", async () => {
  let loadCount = 0;
  const loadModule = createRetryableModuleLoader(async () => {
    loadCount += 1;
    return { value: loadCount };
  });

  const [first, second] = await Promise.all([loadModule(), loadModule()]);

  assert.equal(loadCount, 1);
  assert.equal(first.value, 1);
  assert.equal(second.value, 1);
});

test("createRetryableModuleLoader resets the cached promise after a failed import", async () => {
  let loadCount = 0;
  const loadModule = createRetryableModuleLoader(async () => {
    loadCount += 1;
    if (loadCount === 1) {
      throw new Error("temporary module load failure");
    }

    return { value: loadCount };
  });

  await assert.rejects(() => loadModule(), /temporary module load failure/i);

  const recovered = await loadModule();
  assert.equal(loadCount, 2);
  assert.equal(recovered.value, 2);
});
