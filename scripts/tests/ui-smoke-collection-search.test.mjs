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

test("collection smoke waits for the filtered response before using a previously visible row", async () => {
  assert.match(filtersSource, /<Input\b[^>]*\bid="collection-records-search"[^>]*\btype="search"/);

  const searchValue = "00009007199254740993";
  const filledValues = [];
  const steps = [];
  let finishResponse;
  const response = new Promise((resolve) => { finishResponse = resolve; });
  const targetRow = {};
  const page = {
    locator(selector) {
      assert.equal(selector, "#collection-records-search");
      return {
        async fill(value) {
          steps.push("fill");
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
      waitForCollectionListResponse: (actualPage, actualSearchValue) => {
        assert.equal(actualPage, page);
        assert.equal(actualSearchValue, searchValue);
        steps.push("arm response");
        return response;
      },
      recordMatchesCollectionSearch: (record, value) => record.accountNumber === value,
      waitForCollectionFilterButtonEnabled: async () => {
        steps.push("settled");
        return true;
      },
      findVisibleCollectionRecord: () => { assert.fail("Must not return a pre-debounce row"); },
      waitForCollectionRecordVisible: async (actualPage, actualSearchValue) => {
        assert.equal(actualPage, page);
        assert.equal(actualSearchValue, searchValue);
        steps.push("row");
        return targetRow;
      },
    },
    { filename: "scripts/ui-smoke.mjs" },
  );

  let completed = false;
  const result = filterCollectionRecordsBySearch(page, `  ${searchValue}  `).then((value) => {
    completed = true;
    return value;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(completed, false);
  assert.deepEqual(steps, ["arm response", "fill"]);
  finishResponse({ status: () => 200, json: async () => ({ records: [{ accountNumber: searchValue }] }) });
  assert.equal(await result, targetRow);
  assert.deepEqual(steps, ["arm response", "fill", "settled", "row"]);
  assert.deepEqual(filledValues, [searchValue]);
});

test("cached Collection searches still apply the Filter action and wait for loading to settle", async () => {
  const steps = [];
  const targetRow = {};
  const page = {
    locator: () => ({ fill: async () => { steps.push("fill"); } }),
    getByRole: () => ({ click: async () => { steps.push("filter"); } }),
  };
  const filter = vm.runInNewContext(
    `${smokeSource.slice(helperStart, helperEnd)}\nfilterCollectionRecordsBySearch;`,
    {
      waitForCollectionListResponse: async () => { steps.push("response"); return null; },
      waitForCollectionFilterButtonEnabled: async () => { steps.push("settled"); return true; },
      findVisibleCollectionRecord: async () => { steps.push("row"); return targetRow; },
    },
  );
  assert.equal(await filter(page, "000000000000000002"), targetRow);
  assert.deepEqual(steps, ["response", "fill", "settled", "response", "filter", "settled", "row"]);
});
