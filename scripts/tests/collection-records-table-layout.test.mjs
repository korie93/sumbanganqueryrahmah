import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildSync } from "esbuild";

// Render the actual components without a browser, database or dotenv. CSS geometry
// is covered separately by the built-frontend Collection polish Playwright tests.
const bundle = buildSync({
  stdin: {
    resolveDir: process.cwd(),
    contents: `
      import { createElement } from "react";
      import { renderToStaticMarkup } from "react-dom/server";
      import { Table } from "./client/src/components/ui/table";
      import { CollectionRecordsDesktopTable } from "./client/src/pages/collection-records/CollectionRecordsDesktopTable";
      const record = {
        id: "synthetic-record", customerName: "Synthetic Customer", icNumber: "000000000001",
        customerPhone: "0100000000", accountNumber: "00000000000001", cardNumber: "00009007199254740993",
        batch: "P10", paymentDate: "2026-10-05", amount: "1250.00", receipts: [],
        collectionStaffNickname: "Synthetic Collector", createdAt: "2026-10-05T00:00:00Z",
      };
      const props = { loadingRecords: false, visibleRecords: [record], paginatedRecords: [record],
        pageOffset: 50, canEdit: true, canDeleteRow: () => true,
        onViewReceipt() {}, onEdit() {}, onDelete() {} };
      const render = (overrides) => renderToStaticMarkup(createElement(CollectionRecordsDesktopTable, { ...props, ...overrides }));
      console.log(JSON.stringify({
        rows: render({}), readonly: render({ canEdit: false, canDeleteRow: () => false }),
        empty: render({ visibleRecords: [], paginatedRecords: [] }), loading: render({ loadingRecords: true }),
        shared: renderToStaticMarkup(createElement(Table, { "aria-label": "Unchanged shared table" })),
      }));
    `,
  },
  bundle: true, platform: "node", format: "cjs", packages: "external",
  loader: { ".css": "empty" }, write: false, logLevel: "silent",
});
const markup = JSON.parse(execFileSync(process.execPath, ["--input-type=commonjs"], {
  input: bundle.outputFiles[0].text, encoding: "utf8", windowsHide: true,
}));

test("records use one named, keyboard-focusable scroll owner without changing table semantics", () => {
  assert.equal((markup.rows.match(/overflow-auto/g) || []).length, 1);
  assert.match(markup.rows, /tabindex="0"[^>]*role="region"[^>]*aria-label="Collection records, scroll to view more columns and rows"/);
  assert.match(markup.rows, /<table[^>]*aria-label="Collection records"/);
  assert.equal((markup.rows.match(/scope="col"/g) || []).length, 18);
  assert.doesNotMatch(markup.rows, /containerProps|420px/);
});

test("pinned identity and actions preserve full identifiers, pagination and permissions", () => {
  for (const value of ["Synthetic Customer", "00000000000001", "00009007199254740993", "1,250.00"]) {
    assert.ok(markup.rows.includes(value));
  }
  assert.match(markup.rows, /<th[^>]*collection-records-table-identity/);
  assert.match(markup.rows, /<td[^>]*collection-records-table-identity/);
  assert.match(markup.rows, /<th[^>]*collection-records-table-actions/);
  assert.match(markup.rows, /<td[^>]*collection-records-table-actions/);
  assert.match(markup.rows, /aria-label="Actions for record 51"/);
  assert.doesNotMatch(markup.readonly, /aria-label="Actions for record/);
  assert.doesNotMatch(markup.readonly, /collection-records-table-actions|collection-records-table-scroll--actions/);
});

test("empty/loading records remain compact visible status messages without a wide empty table", () => {
  assert.match(markup.empty, /role="status"/);
  assert.match(markup.empty, /No collection records found\./);
  assert.match(markup.loading, /role="status"/);
  assert.match(markup.loading, /Loading records\.\.\./);
  for (const content of [markup.empty, markup.loading]) {
    assert.doesNotMatch(content, /<table|min-h-|2140px|Synthetic Customer/);
  }
});

test("shared Table defaults remain unchanged for other screens", () => {
  assert.match(markup.shared, /tabindex="0" class="relative w-full overflow-auto"/);
  assert.match(markup.shared, /aria-label="Unchanged shared table"/);
  assert.doesNotMatch(markup.shared, /collection-records-table-scroll|role="region"/);
});

test("records height and sticky backgrounds use existing safe viewport and semantic tokens", () => {
  const css = readFileSync(new URL("../../client/src/pages/collection-records/CollectionRecordsDesktopTable.css", import.meta.url), "utf8");
  assert.match(css, /max-height: min\(40rem, calc\(var\(--viewport-min-height-value\) \* 0\.64\)\)/);
  assert.match(css, /isolation: isolate/);
  assert.match(css, /background: hsl\(var\(--card\)\)/);
  assert.match(css, /z-index: var\(--z-sticky-content\)/);
  assert.doesNotMatch(css, /\bmin-height\s*:/);
});
