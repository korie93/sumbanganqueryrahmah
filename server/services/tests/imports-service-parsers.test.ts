import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeImportDataPageCursor,
  normalizeImportRow,
  parseCreateImportBody,
  parseImportDataPageCursor,
  parseRenameBody,
} from "../imports-service-parsers";

test("parseCreateImportBody accepts both rows and data payload keys", () => {
  assert.deepEqual(
    parseCreateImportBody({
      name: "March Import",
      filename: "march.xlsx",
      data: [{ a: 1 }],
    }),
    {
      name: "March Import",
      filename: "march.xlsx",
      dataRows: [{ a: 1 }],
    },
  );
});

test("parseRenameBody returns a normalized name field", () => {
  assert.deepEqual(parseRenameBody({ name: "Updated Import" }), {
    name: "Updated Import",
  });
});

test("import data page cursor round-trips through parser", () => {
  const cursor = encodeImportDataPageCursor({
    lastRowId: "row-99",
    page: 4,
  });

  assert.deepEqual(parseImportDataPageCursor(cursor), {
    lastRowId: "row-99",
    page: 4,
  });
});

test("parseImportDataPageCursor rejects invalid cursors", () => {
  assert.equal(parseImportDataPageCursor("not-base64"), null);
  assert.equal(
    parseImportDataPageCursor(
      Buffer.from(JSON.stringify({ lastRowId: "", page: 1 }), "utf8").toString("base64url"),
    ),
    null,
  );
});

test("normalizeImportRow rejects non-object rows", () => {
  assert.throws(() => normalizeImportRow("bad-row"), /Invalid jsonDataJsonb/);
});

test("normalizeImportRow rejects object rows with non-JSON values", () => {
  assert.throws(
    () => normalizeImportRow({ name: "Alice", nested: { invalid: Number.NaN } }),
    /Invalid jsonDataJsonb/,
  );
});
