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
  const navigationSource = readSource("api/maintenance-navigation.ts");

  assert.match(source, /notifyMaintenanceMode\(parsed\)/);
  assert.match(navigationSource, /function notifyMaintenanceMode/);
  assert.match(navigationSource, /shouldRedirectForMaintenance\(payload, "user"\)/);
  assert.match(navigationSource, /new CustomEvent\("maintenance-updated"/);
  assert.match(navigationSource, /window\.history\.replaceState\(\{\}, "", "\/maintenance"\)/);
  assert.doesNotMatch(source, /window\.location\.href/);
  assert.doesNotMatch(navigationSource, /window\.location\.href/);
});
