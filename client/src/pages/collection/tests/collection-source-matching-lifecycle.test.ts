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

test("collection source matching validates identity before starting the API request", () => {
  const validationIndex = source.indexOf("validateSaveCollectionIdentityFields(identity)");
  const requestIndex = source.indexOf("await getCollectionSourceMatches(identity");

  assert.notEqual(validationIndex, -1);
  assert.notEqual(requestIndex, -1);
  assert.ok(validationIndex < requestIndex);
  assert.match(source, /if \(Object\.keys\(validationErrors\)\.length > 0\) \{/);
  assert.match(source, /onValidationErrors\?\.\(validationErrors\)/);
  assert.match(source, /Lengkapkan maklumat customer yang ditanda sebelum semak matching\./);
});

test("collection source matching turns backend failures into safe user-facing messages", () => {
  assert.match(source, /import \{ resolveMutationErrorMessage \} from "@\/lib\/mutation-feedback"/);
  assert.match(source, /setError\(resolveMutationErrorMessage\(/);
  assert.doesNotMatch(source, /matchingError instanceof Error\s*\? matchingError\.message/);
});
