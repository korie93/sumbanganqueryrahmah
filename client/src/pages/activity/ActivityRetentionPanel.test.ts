import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("activity retention panel cancels requests and explains active-ban protection", async () => {
  const source = await readFile(
    new URL("./ActivityRetentionPanel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /statusControllerRef\.current\?\.abort\(\)/);
  assert.match(source, /cleanupControllerRef\.current\?\.abort\(\)/);
  assert.match(source, /mountedRef\.current = false/);
  assert.match(source, /Active bans remained protected/);
  assert.match(source, /Never removed while the ban remains active/);
});
