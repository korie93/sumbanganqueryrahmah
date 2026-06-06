import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCsvContent,
  createCsvBlob,
  CSV_MIME_TYPE,
  CSV_UTF8_BOM,
  escapeCsvCell,
  normalizeCsvCellValue,
} from "@/lib/csv";

test("escapeCsvCell uses RFC 4180 quoting and preserves valid falsey values", () => {
  assert.equal(escapeCsvCell("Ali \"Alpha\", Team"), "\"Ali \"\"Alpha\"\", Team\"");
  assert.equal(escapeCsvCell("line\r\nbreak"), "\"line\r\nbreak\"");
  assert.equal(escapeCsvCell(0), "\"0\"");
  assert.equal(escapeCsvCell(false), "\"false\"");
  assert.equal(escapeCsvCell(null), "\"\"");
  assert.equal(escapeCsvCell("undefined"), "\"\"");
});

test("buildCsvContent escapes headers and rows with CRLF line endings", () => {
  const csv = buildCsvContent(
    ["Name, full", "Amount", "Active"],
    [
      ["Ali \"Alpha\"", 0, false],
      ["Siti", 125.5, true],
    ],
  );

  assert.equal(
    csv,
    "\"Name, full\",\"Amount\",\"Active\"\r\n\"Ali \"\"Alpha\"\"\",\"0\",\"false\"\r\n\"Siti\",\"125.5\",\"true\"",
  );
});

test("createCsvBlob prefixes UTF-8 BOM by default for Excel compatibility", async () => {
  const csv = buildCsvContent(["Nama"], [["Aminah"]]);
  const blob = createCsvBlob(csv);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const noBomBytes = new Uint8Array(await createCsvBlob(csv, { withBom: false }).arrayBuffer());

  assert.equal(blob.type, CSV_MIME_TYPE);
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(await blob.text(), csv);
  assert.equal(await createCsvBlob(csv, { withBom: false }).text(), csv);
  assert.notDeepEqual([...noBomBytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(CSV_UTF8_BOM.charCodeAt(0), 0xfeff);
});

test("normalizeCsvCellValue stringifies complex values without throwing", () => {
  assert.equal(normalizeCsvCellValue({ a: 1 }), "{\"a\":1}");
  assert.equal(normalizeCsvCellValue(["x", 2]), "[\"x\",2]");
  assert.equal(normalizeCsvCellValue(Number.NaN), "");
});
