import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildSync } from "esbuild";

// Render the real tables with synthetic values. The browser suite checks geometry.
const bundle = buildSync({
  stdin: {
    resolveDir: process.cwd(),
    contents: `
      import { createElement } from "react";
      import { renderToStaticMarkup } from "react-dom/server";
      import { BillingPrincipalClientResultTable, BillingPrincipalSystemResultTable } from "./client/src/pages/collection/BillingPrincipalSavedTargetWorkspace";
      import { createBillingPrincipalVisualExportFixture } from "./client/src/pages/collection/billing-principal-v7-test-fixture";
      const fixture = createBillingPrincipalVisualExportFixture();
      const props = { target: fixture.overview.target, overview: { ok: true, ...fixture.overview },
        editable: true, saving: false, exporting: false, onSave: async () => {}, onDirtyChange: () => {} };
      const client = (overrides) => renderToStaticMarkup(createElement(BillingPrincipalClientResultTable, { ...props, ...overrides }));
      console.log(JSON.stringify({
        system: renderToStaticMarkup(createElement(BillingPrincipalSystemResultTable, fixture.overview.systemResult)),
        client: client({}), readonly: client({ editable: false }),
        saving: client({ saving: true }), exporting: client({ exporting: true }),
      }));
    `,
  },
  bundle: true, platform: "node", format: "cjs", packages: "external",
  loader: { ".css": "empty" }, write: false, logLevel: "silent",
});
const markup = JSON.parse(execFileSync(process.execPath, ["--input-type=commonjs"], {
  input: bundle.outputFiles[0].text, encoding: "utf8", windowsHide: true,
}));

test("each Billing result table has one named keyboard-focusable scroll owner", () => {
  for (const [kind, label, columns] of [["system", "Table A System Result", 8], ["client", "Table B Client Result", 7]]) {
    const html = markup[kind];
    assert.equal((html.match(/overflow-auto/g) ?? []).length, 1);
    assert.match(html, /tabindex="0"[^>]*role="region"/);
    assert.ok(html.includes(`aria-label="${label}, scroll to view more columns"`));
    assert.equal((html.match(/scope="col"/g) ?? []).length, columns);
    assert.doesNotMatch(html, /overflow-x-auto|containerProps/);
  }
});

test("Aging remains pinned for column headings, aging rows and ALL totals in both tables", () => {
  for (const html of [markup.system, markup.client, markup.readonly]) {
    assert.match(html, /<th[^>]*billing-osp-table-aging[^>]*>Aging<\/th>/);
    assert.match(html, /<td[^>]*billing-osp-table-aging[^>]*>D3<\/td>/);
    assert.match(html, /<td[^>]*billing-osp-table-aging[^>]*>ALL/);
    assert.equal((html.match(/billing-osp-table-aging/g) ?? []).length, 3);
  }
});

test("editable percentages and calculated amounts have text labels and separate input outlines", () => {
  const html = markup.client;
  assert.equal((html.match(/>Editable<\/span>/g) ?? []).length, 2);
  assert.equal((html.match(/>Calculated<\/span>/g) ?? []).length, 4);
  const inputs = html.match(/<input[^>]*>/g) ?? [];
  assert.equal(inputs.length, 2);
  assert.ok(inputs.every((input) => input.includes("border-border") && input.includes("border ")));
  assert.match(html, /aria-label="D3 private target percentage"/);
  assert.match(html, /aria-label="D3 client result percentage"/);
  assert.match(html, /value="50\.0000"/);
  assert.match(html, /value="75\.0000"/);
  assert.match(html, /h-11[^\"]*md:h-9/);
  for (const value of ["RM10,000.00", "RM5,000.00", "RM7,500.00", "-RM2,500.00", "75.00%"]) {
    assert.ok(html.includes(value), value);
  }
  for (const value of ["RM8,000.00", "-RM3,000.00", "80.00%"]) assert.ok(markup.system.includes(value), value);
});

test("permission and busy states preserve read-only values and disable percentage editing", () => {
  assert.doesNotMatch(markup.readonly, /<input|<button|>Editable<\/span>/);
  assert.equal((markup.readonly.match(/>Saved<\/span>/g) ?? []).length, 2);
  assert.match(markup.readonly, /75\.00%/);
  for (const html of [markup.saving, markup.exporting]) {
    const inputs = html.match(/<input[^>]*>/g) ?? [];
    assert.equal(inputs.length, 2);
    assert.ok(inputs.every((input) => input.includes('disabled=""')));
  }
});

test("pinned Billing cells use opaque semantic surfaces and a local stacking context", () => {
  const css = readFileSync(new URL("../../client/src/pages/collection/BillingPrincipalSavedTargetWorkspace.css", import.meta.url), "utf8");
  assert.match(css, /isolation: isolate/);
  assert.match(css, /position: sticky;\s*left: 0/);
  assert.match(css, /box-shadow: inset -1px 0 hsl\(var\(--border\)\)/);
  assert.match(css, /background: hsl\(var\(--card\)\)/);
  assert.match(css, /tfoot td\.billing-osp-table-aging/);
  assert.match(css, /background: var\(--dm-table-row\)/);
  assert.match(css, /background: var\(--dm-table-row-hover\)/);
  assert.doesNotMatch(css, /overflow(?:-[xy])?\s*:/);
});
