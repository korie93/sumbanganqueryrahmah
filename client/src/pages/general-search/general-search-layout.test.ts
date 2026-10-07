import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { OperationalPage } from "@/components/layout/OperationalPage";
import { GeneralSearchDesktopResultsTable } from "./GeneralSearchDesktopResultsTable";

const readSource = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

test("General Search opts into existing report width while search controls stay capped", () => {
  const page = readSource("../GeneralSearch.tsx");
  const controls = readSource("./GeneralSearchDesktopControls.tsx");
  assert.match(page, /OperationalPage width="report" className="general-search-page"/);
  assert.match(controls, /w-full max-w-6xl/);
  const html = renderToStaticMarkup(createElement(OperationalPage, { width: "report", children: "Results" }));
  assert.match(html, /max-w-\[1480px\]/);
});

test("General Search table height is only a responsive maximum, leaving short results compact", () => {
  const css = readSource("./general-search-layout.css");
  assert.match(css, /max-height: clamp\(10rem, calc\(var\(--viewport-min-height-value\) - 26rem\), 52rem\)/);
  assert.doesNotMatch(css, /(?:^|[;{])\s*(?:height|min-height):/);
  assert.match(css, /overflow-anchor: none/);
  const desktop = readSource("./GeneralSearchDesktopResultsTable.tsx");
  assert.match(desktop, /viewport\.clientHeight/);
  assert.match(desktop, /firstRow\.getBoundingClientRect\(\)\.height/);
  assert.match(desktop, /observer\?\.disconnect\(\)/);
  assert.match(desktop, /window\.removeEventListener\("resize", schedule\)/);
});

test("desktop results preserve escaped data and named controls in normal and low-spec modes", () => {
  const results = Array.from({ length: 100 }, (_, index) => ({
    id: `synthetic-${index}`, "Customer Name": `Synthetic ${index}`, "Card No": `<unsafe-${index}>`,
  }));
  for (const isLowSpecMode of [false, true]) {
    const html = renderToStaticMarkup(createElement(GeneralSearchDesktopResultsTable, {
      currentPage: 1, resultsPerPage: 100, canSeeSourceFile: false, isLowSpecMode,
      headers: ["Customer Name", "Card No"], onRecordSelect: () => {},
      renderCellValue: (text) => text, results,
    }));
    assert.equal((html.match(/data-testid="button-view-/g) ?? []).length, isLowSpecMode ? 27 : 100);
    assert.equal((html.match(/role="region"/g) ?? []).length, 1);
    assert.match(html, /aria-label="General search result columns"/);
    assert.match(html, /&lt;unsafe-0&gt;/);
    assert.doesNotMatch(html, /<unsafe-/);
    if (isLowSpecMode) assert.match(html, /style="height:3796px"/);
  }
});

test("shared horizontal scroller keeps the same default markup with an optional viewport ref", () => {
  const props = { ariaLabel: "Example", children: "Synthetic content" };
  const initial = renderToStaticMarkup(createElement(HorizontalScrollHint, props));
  const withRef = renderToStaticMarkup(createElement(HorizontalScrollHint, { ...props, viewportRef: { current: null } }));
  assert.equal(withRef, initial);
});
