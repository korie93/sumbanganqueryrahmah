import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const source = readFileSync(path.join(repoRoot, "client/src/app/useAppShellRuntimeState.ts"), "utf8");

test("app shell runtime config failures are observable and still fall back safely", () => {
  assert.match(source, /import\s+\{\s*logClientError\s*\}\s+from\s+"@\/lib\/client-logger"/);
  assert.match(source, /catch\s*\(\s*error\s*\)/);
  assert.match(source, /logClientError\("Failed to load app runtime config:",\s*error,\s*\{/);
  assert.match(source, /event:\s*"app_runtime_config_load_failed"/);
  assert.match(source, /setSystemName\(DEFAULT_SYSTEM_NAME\)/);
  assert.match(source, /setRuntimeConfig\(DEFAULT_RUNTIME_CONFIG\)/);
});
