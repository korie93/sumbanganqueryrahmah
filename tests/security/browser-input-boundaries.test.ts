import assert from "node:assert/strict";
import test from "node:test";
import { resolveSafeNavigationUrl, resolveSafePreviewSourceUrl } from "../../client/src/lib/safe-url";
import { buildCsvContent, neutralizeCsvFormulaInjection } from "../../client/src/lib/csv";

const baseUrl = "https://sqr.audit.invalid/collection/records";

// These are string fixtures, not network requests or external URLs to visit.
for (const value of [
  "javascript:alert(1)", "JaVaScRiPt:alert(1)", "java\nscript:alert(1)",
  "data:text/html,<script>alert(1)</script>", "file:///audit/private.txt", "vbscript:msgbox(1)",
  "//outside.audit.invalid/login", "https://sqr.audit.invalid.outside.invalid/",
  "https://sqr.audit.invalid@outside.audit.invalid/", "https://sqr.audit.invalid:444/",
  "http://sqr.audit.invalid/", "https://outside.audit.invalid/",
]) {
  test(`navigation and preview reject a different origin or executable scheme: ${JSON.stringify(value)}`, () => {
    assert.equal(resolveSafeNavigationUrl(value, { baseUrl }), null);
    assert.equal(resolveSafePreviewSourceUrl(value, { baseUrl }), null);
  });
}

test("preview blob allowance stays origin-bound and can be disabled", () => {
  const ownedBlob = "blob:https://sqr.audit.invalid/audit-receipt";
  assert.equal(resolveSafePreviewSourceUrl(ownedBlob, { baseUrl }), ownedBlob);
  assert.equal(resolveSafePreviewSourceUrl(ownedBlob, { baseUrl, allowBlob: false }), null);
  assert.equal(resolveSafePreviewSourceUrl("blob:https://outside.audit.invalid/audit-receipt", { baseUrl }), null);
  assert.equal(resolveSafePreviewSourceUrl("blob:null/audit-receipt", { baseUrl }), null);
});

test("safe same-origin deep links retain path, query and fragment", () => {
  const expected = "https://sqr.audit.invalid/collection/records?page=2#receipt";
  assert.equal(resolveSafeNavigationUrl("/collection/records?page=2#receipt", { baseUrl }), expected);
});

for (const value of ["=1+1", "+SUM(1,2)", "-SUM(1,2)", "@SUM(1,2)", "\t=1+1", "\r=1+1", "\n=1+1", "  =1+1"]) {
  test(`CSV export neutralizes formula-like text ${JSON.stringify(value)}`, () => {
    assert.equal(neutralizeCsvFormulaInjection(value), `'${value}`);
  });
}

test("CSV export neutralizes headers too and keeps quotation/newlines in one quoted field", () => {
  assert.equal(buildCsvContent(["=1+1", "Note"], [["=1+1", 'A,"B"\nC']]),
    '"\'=1+1","Note"\r\n"\'=1+1","A,""B""\nC"');
  for (const value of ["-15.25", "+15", "0.00", "ordinary text"]) {
    assert.equal(neutralizeCsvFormulaInjection(value), value);
  }
});
