import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SavedCustomerComparison } from "@/pages/analysis/SavedCustomerComparison";
import { SavedCustomerComparisonResults } from "@/pages/analysis/SavedCustomerComparisonResults";
import type { ImportComparisonResponse } from "@shared/common/import-comparison-contract";

test("saved customer comparison renders compact labelled controls while loading", () => {
  const markup = renderToStaticMarkup(createElement(SavedCustomerComparison, {
    baselineId: "baseline",
    currentId: "current",
  }));

  assert.match(markup, /Customer &amp; Account Comparison/);
  assert.match(markup, /Search customer comparison/);
  assert.match(markup, /Filter customer comparison status/);
  assert.match(markup, /aria-live="polite"/);
});

test("saved customer comparison lifecycle aborts replaced and unmounted requests", () => {
  const source = readFileSync(
    new URL("./useSavedCustomerComparison.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /requestControllerRef\.current\?\.abort\(\)/);
  assert.match(source, /requestIdRef\.current !== requestId/);
  assert.match(source, /return \(\) => \{\s*controller\.abort\(\)/s);
  assert.match(source, /window\.clearTimeout\(timer\)/);
});

test("saved customer comparison results expose status, match basis, and both account sides", () => {
  const data: ImportComparisonResponse = {
    baseline: { id: "baseline", name: "June", filename: "june.xlsx", rowCount: 1 },
    current: { id: "current", name: "July", filename: "july.xlsx", rowCount: 1 },
    summary: {
      baselineIdentities: 1,
      currentIdentities: 1,
      matched: 0,
      accountChanged: 1,
      baselineOnly: 0,
      currentOnly: 0,
      conflicts: 0,
      unidentified: 0,
      baselineDuplicateRows: 0,
      currentDuplicateRows: 0,
    },
    items: [{
      id: "comparison-item",
      category: "account_changed",
      matchBasis: "ic",
      baseline: {
        customerName: "Nur Aina",
        icNumber: "910101101234",
        customerPhone: "0123456789",
        accountNumbers: ["ACC001"],
        occurrences: 1,
      },
      current: {
        customerName: "Nur Aina",
        icNumber: "910101101234",
        customerPhone: "0123456789",
        accountNumbers: ["ACC001", "ACC002"],
        occurrences: 1,
      },
    }],
    pagination: {
      mode: "offset",
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
    matching: {
      strategy: "deterministic_customer_account_v1",
      identifiers: ["ic", "account", "phone_and_name", "none"],
    },
  };

  const markup = renderToStaticMarkup(createElement(SavedCustomerComparisonResults, { data }));

  assert.match(markup, /Account changed/);
  assert.match(markup, /Matched by IC/);
  assert.match(markup, /0123456789/);
  assert.match(markup, /ACC001/);
  assert.match(markup, /ACC002/);
  assert.match(markup, /Customer and account differences between June and July/);
});
