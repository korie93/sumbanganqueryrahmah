import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionRecordsSearch } from "./CollectionRecordsSearch";

for (const mobile of [false, true]) {
  test(`CollectionRecordsSearch keeps unrestricted exact search outside filters on ${mobile ? "mobile" : "desktop"}`, () => {
    const id = mobile ? "collection-records-search-mobile" : "collection-records-search";
    for (const value of ["00009007199254740993", "9007199254740993", "4181-3402-3185-3188", "Customer ABC / batch 4", "001.50"]) {
      const markup = renderToStaticMarkup(createElement(CollectionRecordsSearch, { mobile, value, onChange: () => undefined }));
      const input = markup.match(/<input\b[^>]*>/)?.[0];
      assert.ok(input);
      assert.match(markup, new RegExp(`for="${id}"`));
      assert.match(input, new RegExp(`id="${id}"`));
      assert.match(input, /type="search"/);
      assert.ok(input.includes(`value="${value}"`));
      assert.match(input, /placeholder="Cari nama \/ IC \/ akaun \/ Card No \/ batch \/ telefon \/ jumlah bayaran"/);
      assert.match(input, /h-11.*text-base/);
      assert.doesNotMatch(input, /(?:maxLength|inputMode|pattern|disabled)="/i);
      assert.match(input, /autoComplete="off"/);
      assert.match(input, /autoCapitalize="none"/);
      assert.match(input, /spellcheck="false"/);
      assert.doesNotMatch(markup, /role="dialog"|<button\b/);
    }
  });
}

test("CollectionRecordsSearch forwards typed strings without numeric conversion or truncation", () => {
  const source = readFileSync("client/src/pages/collection-records/CollectionRecordsSearch.tsx", "utf8");
  assert.match(source, /onChange=\{\(event\) => onChange\(event\.target\.value\)\}/);
  assert.doesNotMatch(source, /Number\(|parseInt\(|parseFloat\(|\.slice\(|\.substring\(/);
});
