import assert from "node:assert/strict";
import test from "node:test";
import {
  applyImportColumnMapping,
  parseImportColumnMapping,
  validateImportColumnMappingSources,
} from "../import-column-mapping";

test("column mapping renames included columns and removes excluded columns", () => {
  const mapping = parseImportColumnMapping([
    { source: "Customer Name", target: "customer_name" },
    { source: "Internal Note", target: null },
  ]);

  const mapped = applyImportColumnMapping(
    {
      "Customer Name": "Alice",
      "Internal Note": "private",
      Amount: "42",
    },
    mapping,
  );

  assert.deepEqual({ ...mapped }, {
    customer_name: "Alice",
    Amount: "42",
  });
});

test("column mapping accepts JSON string payloads", () => {
  const mapping = parseImportColumnMapping(JSON.stringify([
    { source: "Customer Name", target: "customer_name" },
  ]));

  assert.deepEqual(mapping, [
    { source: "Customer Name", target: "customer_name" },
  ]);
});

test("column mapping rejects malformed JSON string payloads", () => {
  assert.throws(
    () => parseImportColumnMapping("[{\"source\":\"Name\","),
    /valid JSON/i,
  );
});

test("column mapping rejects oversized JSON string payloads before validation", () => {
  assert.throws(
    () => parseImportColumnMapping(`"${"x".repeat(65 * 1024)}"`),
    /valid JSON/i,
  );
});

test("column mapping rejects deeply nested JSON string payloads", () => {
  assert.throws(
    () => parseImportColumnMapping("[[[[{\"source\":\"Name\",\"target\":\"name\"}]]]]"),
    /valid JSON/i,
  );
});

test("column mapping rejects duplicate targets case-insensitively", () => {
  assert.throws(
    () => parseImportColumnMapping([
      { source: "Name", target: "customer" },
      { source: "Alias", target: "CUSTOMER" },
    ]),
    /target columns must be unique/i,
  );
});

test("column mapping rejects prototype-related property names", () => {
  assert.throws(
    () => parseImportColumnMapping([
      { source: "Name", target: "__proto__" },
    ]),
    /reserved column name/i,
  );
});

test("column mapping rejects source columns absent from the uploaded file", () => {
  assert.throws(
    () => validateImportColumnMappingSources(
      ["Name", "Amount"],
      [{ source: "Missing", target: "missing" }],
    ),
    /not present in the file/i,
  );
});
