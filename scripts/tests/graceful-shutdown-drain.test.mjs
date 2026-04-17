import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const indexLocalPath = path.join(rootDir, "server", "index-local.ts");

test("local shutdown path drains idle and remaining connections before force-exit fallback", async () => {
  const source = await fs.readFile(indexLocalPath, "utf8");

  assert.match(source, /server\.closeIdleConnections\?\.\(\);/);
  assert.match(source, /server\.closeAllConnections\?\.\(\);/);
  assert.match(source, /Graceful shutdown is still draining active connections/);
});
