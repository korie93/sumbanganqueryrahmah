import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.resolve(process.cwd(), "client/src/pages/collection/useCollectionSourceMatching.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

test("collection source matching aborts requests on identity change and unmount", () => {
  assert.match(source, /controllerRef\.current\?\.abort\(\)/);
  assert.match(source, /useEffect\(\(\) => \(\) => \{/);
  assert.match(source, /requestIdRef\.current \+= 1/);
});

test("collection source matching ignores aborted and superseded responses", () => {
  assert.match(
    source,
    /if \(controller\.signal\.aborted \|\| requestId !== requestIdRef\.current\) return;/,
  );
  assert.match(
    source,
    /controller\.signal\.aborted \|\| requestId !== requestIdRef\.current \|\| isAbortError\(matchingError\)/,
  );
});
