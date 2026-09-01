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
const readySummarySource = readFileSync(
  path.resolve(process.cwd(), "client/src/pages/collection/SaveCollectionReadySummary.tsx"),
  "utf8",
);

test("save collection fields use explicit invalid props for Edge a11y inspection", () => {
  assert.match(saveCollectionPageSource, /function getInvalidFieldProps/);
  assert.match(saveCollectionPageSource, /getAriaRequiredProps\(true\)/);
  assert.match(saveCollectionPageSource, /getAriaInvalidProps\(Boolean\(errorMessage\)\)/);
  assert.match(saveCollectionPageSource, /name="customerName"[\s\S]*\{\.\.\.requiredFieldProps\}[\s\S]*\{\.\.\.customerNameValidationProps\}/);
  assert.match(saveCollectionPageSource, /name="customerIcNumber"[\s\S]*\{\.\.\.requiredFieldProps\}[\s\S]*\{\.\.\.icNumberValidationProps\}/);
  assert.match(saveCollectionPageSource, /name="accountNumber"[\s\S]*\{\.\.\.accountNumberValidationProps\}/);
  assert.match(saveCollectionPageSource, /name="cardNumber"[\s\S]*\{\.\.\.cardNumberValidationProps\}/);
  assert.match(saveCollectionPageSource, /type="password"[\s\S]*name="cardNumber"|name="cardNumber"[\s\S]*type="password"/);
  assert.match(saveCollectionPageSource, /Isi sekurang-kurangnya satu: Account Number atau Card Number\./);
  assert.match(saveCollectionPageSource, /const batchValidationProps = getInvalidFieldProps/);
  assert.match(saveCollectionPageSource, /const paymentDateValidationProps = getInvalidFieldProps/);
  assert.match(saveCollectionPageSource, /<select[\s\S]*\{\.\.\.requiredFieldProps\}[\s\S]*\{\.\.\.batchValidationProps\}/);
  assert.doesNotMatch(saveCollectionPageSource, /"aria-invalid": "true" as const/);
  assert.match(saveCollectionPageSource, /<select[\s\S]*\{\.\.\.batchValidationProps\}/);
  assert.match(saveCollectionPageSource, /<DatePickerField[\s\S]*\{\.\.\.paymentDateValidationProps\}/);
  assert.match(saveCollectionPageSource, /name="collectionAmount"[\s\S]*\{\.\.\.requiredFieldProps\}[\s\S]*\{\.\.\.amountValidationProps\}/);
  assert.doesNotMatch(saveCollectionPageSource, /aria-invalid=\{/);
  assert.doesNotMatch(saveCollectionPageSource, /aria-required=\{/);

  const batchSelectMatch = saveCollectionPageSource.match(/<select[\s\S]*?<\/select>/);
  assert.ok(batchSelectMatch);
  assert.doesNotMatch(batchSelectMatch[0], /aria-invalid=\{/);
  assert.doesNotMatch(batchSelectMatch[0], /aria-required=\{/);

  const datePickerStart = saveCollectionPageSource.indexOf("<DatePickerField");
  assert.notEqual(datePickerStart, -1);
  const datePickerEnd = saveCollectionPageSource.indexOf("/>", datePickerStart);
  assert.notEqual(datePickerEnd, -1);
  const datePickerSource = saveCollectionPageSource.slice(datePickerStart, datePickerEnd + 2);
  assert.match(datePickerSource, /required/);
  assert.match(datePickerSource, /\{\.\.\.paymentDateValidationProps\}/);
  assert.doesNotMatch(datePickerSource, /\{\.\.\.requiredFieldProps\}/);

  const phoneNameIndex = saveCollectionPageSource.indexOf('name="customerPhoneNumber"');
  assert.notEqual(phoneNameIndex, -1);
  const phoneInputStart = saveCollectionPageSource.lastIndexOf("<Input", phoneNameIndex);
  const phoneInputEnd = saveCollectionPageSource.indexOf("/>", phoneNameIndex);
  assert.notEqual(phoneInputStart, -1);
  assert.notEqual(phoneInputEnd, -1);
  const phoneInputSource = saveCollectionPageSource.slice(phoneInputStart, phoneInputEnd + 2);
  assert.match(phoneInputSource, /\{\.\.\.requiredFieldProps\}/);

  for (const name of ["accountNumber", "cardNumber"]) {
    const nameIndex = saveCollectionPageSource.indexOf(`name="${name}"`);
    assert.notEqual(nameIndex, -1);
    const inputStart = saveCollectionPageSource.lastIndexOf("<Input", nameIndex);
    const inputEnd = saveCollectionPageSource.indexOf("/>", nameIndex);
    const inputSource = saveCollectionPageSource.slice(inputStart, inputEnd + 2);
    assert.doesNotMatch(inputSource, /\{\.\.\.requiredFieldProps\}/);
    assert.match(inputSource, new RegExp(`\\{\\.\\.\\.${name === "accountNumber" ? "accountNumber" : "cardNumber"}ValidationProps\\}`));
  }
});

test("save action remains discoverable without presenting an incomplete form as save-ready", () => {
  assert.match(saveCollectionPageSource, /variant=\{state\.readiness\.isReady \? "default" : "outline"\}/);
  assert.match(saveCollectionPageSource, /aria-describedby="save-collection-readiness-status"/);
  assert.match(saveCollectionPageSource, /state\.readiness\.isReady[\s\S]*\? "Save Collection"[\s\S]*: "Semak Medan Wajib"/);
  assert.match(saveCollectionPageSource, /onClick=\{state\.handleSubmit\}/);
});

test("save readiness definition list keeps validation details in valid dd elements", () => {
  assert.match(
    readySummarySource,
    /<dd className="mt-1 text-xs leading-relaxed text-destructive">\{item\.error\}<\/dd>/,
  );
  assert.doesNotMatch(readySummarySource, /<p[^>]*>\{item\.error\}<\/p>/);
});

test("save collection form grid responds to available width and text scaling", () => {
  assert.match(
    saveCollectionPageSource,
    /grid-cols-\[repeat\(auto-fit,minmax\(min\(100%,24rem\),1fr\)\)\]/,
  );
  assert.match(saveCollectionPageSource, /className="col-span-full"/);
  assert.doesNotMatch(saveCollectionPageSource, /lg:grid-cols-2/);
  assert.doesNotMatch(saveCollectionPageSource, /lg:col-span-2/);
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
