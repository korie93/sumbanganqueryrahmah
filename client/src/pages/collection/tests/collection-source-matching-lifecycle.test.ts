import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.resolve(process.cwd(), "client/src/pages/collection/useCollectionSourceMatching.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

test("collection source matching aborts requests on identity change and unmount", () => {
  assert.match(source, /matchingControllerRef\.current\?\.abort\(\)/);
  assert.match(source, /useEffect\(\(\) => \(\) => \{/);
  assert.match(source, /matchingRequestIdRef\.current \+= 1/);
  assert.match(source, /sourceFilesRequestIdRef\.current \+= 1/);
  assert.match(source, /return \(\) => \{\n\s+window\.clearTimeout\(timer\);\n\s+controller\.abort\(\);/);
});

test("collection source matching ignores aborted and superseded responses", () => {
  assert.match(
    source,
    /requestId !== matchingRequestIdRef\.current\n\s+\|\| requestFingerprint !== identityFingerprintRef\.current/,
  );
  assert.match(
    source,
    /requestFingerprint !== identityFingerprintRef\.current\n\s+\|\| isAbortError\(matchingError\)/,
  );
  assert.match(source, /requestId !== sourceFilesRequestIdRef\.current/);
  assert.match(source, /identityFingerprintRef\.current = identityFingerprint/);
});

test("collection source matching validates identity before starting the API request", () => {
  const validationIndex = source.indexOf("validateSaveCollectionIdentityFields(identity)");
  const sourceSelectionIndex = source.indexOf("if (!selectedSourceFileId)");
  const requestIndex = source.indexOf("await getCollectionSourceMatches(identity, selectedSourceFileId");

  assert.notEqual(validationIndex, -1);
  assert.notEqual(sourceSelectionIndex, -1);
  assert.notEqual(requestIndex, -1);
  assert.ok(validationIndex < requestIndex);
  assert.ok(sourceSelectionIndex < requestIndex);
  assert.match(source, /if \(Object\.keys\(validationErrors\)\.length > 0\) \{/);
  assert.match(source, /onValidationErrors\?\.\(validationErrors\)/);
  assert.match(source, /Pilih fail Saved sebelum semak matching\./);
});

test("collection source matching loads only bounded file metadata before matching one selected file", () => {
  assert.match(source, /await getCollectionSavedSourceFiles\(\{/);
  assert.match(source, /limit: 100/);
  assert.match(source, /setSelectedSourceFile\(nextSource\)/);
  assert.match(source, /match\.sourceImportId === selectedSourceFileId/);
  assert.doesNotMatch(source, /find\(\(match\) => match\.totalDue !== null\)/);
});

test("collection source verification is invalidated when identity, payment date, or amount changes", () => {
  assert.match(source, /paymentDate: identity\.paymentDate\.trim\(\)/);
  assert.match(source, /amount: identity\.amount\.trim\(\)/);
  assert.match(source, /invalidateVerifiedMatch\(\);\n\s+\}, \[identityFingerprint/);
  assert.match(source, /onSelectionChange\(""\)/);
});

test("collection source matching turns backend failures into safe user-facing messages", () => {
  assert.match(source, /import \{ resolveMutationErrorMessage \} from "@\/lib\/mutation-feedback"/);
  assert.match(source, /setError\(resolveMutationErrorMessage\(/);
  assert.doesNotMatch(source, /matchingError instanceof Error\s*\? matchingError\.message/);
});
