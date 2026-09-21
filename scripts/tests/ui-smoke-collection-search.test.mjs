import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const smokeSource = readFileSync(path.resolve("scripts/ui-smoke.mjs"), "utf8");
const filtersSource = readFileSync(
  path.resolve("client/src/pages/collection-records/CollectionRecordsFilters.tsx"),
  "utf8",
);
const helperStart = smokeSource.indexOf("const filterCollectionRecordsBySearch = async");
const helperEnd = smokeSource.indexOf("const fillReceiptAmountInput = async", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart);

test("collection smoke uses the desktop search input independently of placeholder copy", async () => {
  assert.match(filtersSource, /<Input\b[^>]*\bid="collection-records-search"[^>]*\btype="search"/);

  const searchValue = "00009007199254740993";
  const filledValues = [];
  const targetRow = {};
  const page = {
    locator(selector) {
      assert.equal(selector, "#collection-records-search");
      return {
        async fill(value) {
          filledValues.push(value);
        },
      };
    },
    getByRole(role, options) {
      assert.equal(role, "button");
      assert.equal(options.name, "Filter");
      assert.equal(options.exact, true);
      return {};
    },
  };

  // Run the actual helper without starting the browser and database workflow.
  const filterCollectionRecordsBySearch = vm.runInNewContext(
    `${smokeSource.slice(helperStart, helperEnd)}\nfilterCollectionRecordsBySearch;`,
    {
      findVisibleCollectionRecord: async (actualPage, actualSearchValue) => {
        assert.equal(actualPage, page);
        assert.equal(actualSearchValue, searchValue);
        return targetRow;
      },
    },
    { filename: "scripts/ui-smoke.mjs" },
  );

  assert.equal(await filterCollectionRecordsBySearch(page, `  ${searchValue}  `), targetRow);
  assert.deepEqual(filledValues, [searchValue]);
});
