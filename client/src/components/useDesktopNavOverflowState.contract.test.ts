import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("desktop nav overflow resize listener stays passive and removable", () => {
  const source = readFileSync(path.resolve(__dirname, "useDesktopNavOverflowState.ts"), "utf8");

  assert.match(source, /window\.addEventListener\("resize", scheduleOverflowUpdate, \{ passive: true \}\)/);
  assert.match(source, /window\.removeEventListener\("resize", scheduleOverflowUpdate\)/);
});
