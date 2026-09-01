import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.resolve(process.cwd(), "client/src/pages/collection/useCollectionSourceMatching.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

test("auto matching aborts in-flight requests on identity change and unmount", () => {
  assert.match(source, /matchingControllerRef\.current\?\.abort\(\)/);
  assert.match(source, /useEffect\(\(\) => \(\) => \{/);
  assert.match(source, /matchingRequestIdRef\.current \+= 1/);
});

test("auto matching ignores aborted and superseded responses", () => {
  assert.match(source, /requestId !== matchingRequestIdRef\.current/);
  assert.match(source, /requestFingerprint !== identityFingerprintRef\.current/);
  assert.match(source, /isAbortError\(matchingError\)/);
});

test("auto matching validates identity, date, and amount before its request", () => {
  const validationIndex = source.indexOf("validateSaveCollectionIdentityFields(identity)");
  const requestIndex = source.indexOf("await getCollectionSourceMatches(identity, { signal: controller.signal })");

  assert.notEqual(validationIndex, -1);
  assert.notEqual(requestIndex, -1);
  assert.ok(validationIndex < requestIndex);
  assert.doesNotMatch(source, /sourceImportId/);
  assert.doesNotMatch(source, /getCollectionSavedSourceFiles/);
});

test("auto matching sends only identity, payment date, and amount", () => {
  assert.match(source, /getCollectionSourceMatches\(identity, \{ signal: controller\.signal \}\)/);
  assert.doesNotMatch(source, /selectedSourceFile/);
  assert.doesNotMatch(source, /sourceFiles/);
});
