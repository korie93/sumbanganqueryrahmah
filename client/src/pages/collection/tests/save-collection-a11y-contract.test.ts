import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const saveCollectionPageSource = readFileSync(
  path.resolve(process.cwd(), "client/src/pages/collection/SaveCollectionPage.tsx"),
  "utf8",
);
const saveCollectionProgressSource = readFileSync(
  path.resolve(process.cwd(), "client/src/pages/collection/SaveCollectionProgress.tsx"),
  "utf8",
);

test("save collection fields use explicit invalid props for Edge a11y inspection", () => {
  assert.match(saveCollectionPageSource, /function getInvalidFieldProps/);
  assert.match(saveCollectionPageSource, /getAriaInvalidProps\(Boolean\(errorMessage\)\)/);
  assert.match(saveCollectionPageSource, /const batchValidationProps = getInvalidFieldProps/);
  assert.match(saveCollectionPageSource, /const paymentDateValidationProps = getInvalidFieldProps/);
  assert.doesNotMatch(saveCollectionPageSource, /"aria-invalid": "true" as const/);
  assert.match(saveCollectionPageSource, /<select[\s\S]*\{\.\.\.batchValidationProps\}/);
  assert.match(saveCollectionPageSource, /<DatePickerField[\s\S]*\{\.\.\.paymentDateValidationProps\}/);
  assert.doesNotMatch(saveCollectionPageSource, /aria-invalid=\{/);

  const batchSelectMatch = saveCollectionPageSource.match(/<select[\s\S]*?<\/select>/);
  assert.ok(batchSelectMatch);
  assert.doesNotMatch(batchSelectMatch[0], /aria-invalid=\{/);
});

test("save collection progress exposes non-visual step state text", () => {
  assert.match(saveCollectionProgressSource, /import \{ getAriaCurrentStepProps \} from "@\/lib\/aria-state-props"/);
  assert.match(saveCollectionProgressSource, /function getStepStateLabel/);
  assert.match(saveCollectionProgressSource, /if \(state === "complete"\) return "Complete"/);
  assert.match(saveCollectionProgressSource, /if \(state === "failed"\) return "Failed"/);
  assert.match(saveCollectionProgressSource, /if \(state === "active"\) return "In progress"/);
  assert.match(saveCollectionProgressSource, /return "Pending"/);
  assert.match(saveCollectionProgressSource, /<span className="sr-only">\{getStepStateLabel\(step\.state\)\}<\/span>/);
  assert.match(saveCollectionProgressSource, /\{\.\.\.getAriaCurrentStepProps\(step\.state === "active"\)\}/);
  assert.doesNotMatch(saveCollectionProgressSource, /aria-current=\{/);
  assert.match(saveCollectionProgressSource, /aria-live="polite"/);
  assert.match(saveCollectionProgressSource, /aria-atomic="true"/);
});
