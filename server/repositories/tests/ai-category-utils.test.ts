import assert from "node:assert/strict";
import test from "node:test";
import {
  extractIc,
  extractName,
  mapCategorySampleRow,
  normalizeRuleArray,
  parseJsonData,
  parseJsonObject,
} from "../ai-category-utils";

test("AI category helpers parse JSON objects safely", () => {
  assert.deepEqual(parseJsonObject({ key: "value" }), { key: "value" });
  assert.deepEqual(parseJsonObject('{"key":"value"}'), { key: "value" });
  assert.deepEqual(parseJsonObject("[1,2,3]"), {});
  assert.deepEqual(parseJsonObject("bad-json"), {});

  assert.deepEqual(parseJsonData('{"Nama":"Ali"}'), { Nama: "Ali" });
  assert.deepEqual(parseJsonData("bad-json"), {});
});

test("AI category rule array helper supports array, text, and postgres-array shaped values", () => {
  assert.deepEqual(normalizeRuleArray([" Ali ", "", "B40"]), [" Ali ", "B40"]);
  assert.deepEqual(normalizeRuleArray("B40"), ["B40"]);
  assert.deepEqual(normalizeRuleArray('{"B40","M40"}'), ["B40", "M40"]);
  assert.deepEqual(normalizeRuleArray(""), []);
});

test("AI category sample helpers extract known name and IC keys with safe fallbacks", () => {
  assert.equal(extractName({ Nama: "Ali" }), "Ali");
  assert.equal(extractName({ "Customer Name": "Siti" }), "Siti");
  assert.equal(extractName({}), "-");

  assert.equal(extractIc({ "No. MyKad": "900101015555" }), "900101015555");
  assert.equal(extractIc({ IC: "A123" }), "A123");
  assert.equal(extractIc({}), "-");

  assert.deepEqual(
    mapCategorySampleRow({
      jsonData: '{"Nama":"Ali","No. MyKad":"900101015555"}',
      importName: "March import",
      importFilename: "march.csv",
    }),
    {
      name: "Ali",
      ic: "900101015555",
      source: "March import",
    },
  );

  assert.deepEqual(
    mapCategorySampleRow({
      jsonData: {},
      importName: null,
      importFilename: "fallback.csv",
    }),
    {
      name: "-",
      ic: "-",
      source: "fallback.csv",
    },
  );
});
