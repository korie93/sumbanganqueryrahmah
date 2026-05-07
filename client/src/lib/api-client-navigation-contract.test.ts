import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readSource(fileName: string) {
  return readFileSync(path.resolve(__dirname, fileName), "utf8");
}

test("maintenance API failures route through app state without forcing a hard reload", () => {
  const source = readSource("api-client.ts");

  assert.match(source, /function notifyMaintenanceMode/);
  assert.match(source, /new CustomEvent\("maintenance-updated"/);
  assert.match(source, /window\.history\.replaceState\(\{\}, "", "\/maintenance"\)/);
  assert.doesNotMatch(source, /window\.location\.href/);
});
