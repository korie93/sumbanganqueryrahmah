import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionSourceMatch } from "@/lib/api";
import {
  buildUnusableCollectionSourceMatchDiagnostics,
} from "@/pages/collection/collection-source-match-diagnostics";

function createUnusableMatch(index: number): CollectionSourceMatch {
  return {
    sourceImportId: `private-import-id-${index}`,
    sourceImportName: `Saved Source ${index}`,
    sourceFilename: `source-${index}.xlsx`,
    matchBasis: "ic",
    matchAccuracy: 90 + index,
    matchedFields: ["customer_name", "ic_number"],
    comparedFields: ["customer_name", "ic_number"],
    totalDue: null,
    billingPrincipalOsp: null,
  };
}

test("unusable source diagnostics are bounded and omit raw import IDs", () => {
  const matches = Array.from({ length: 7 }, (_, index) => createUnusableMatch(index));
  const diagnostics = buildUnusableCollectionSourceMatchDiagnostics(matches);

  assert.equal(diagnostics.items.length, 5);
  assert.equal(diagnostics.totalCount, 7);
  assert.equal(diagnostics.omittedCount, 2);
  assert.deepEqual(diagnostics.items[0], {
    displayKey: "Saved Source 0:source-0.xlsx:90:customer_name,ic_number:1",
    sourceLabel: "Saved Source 0",
    sourceFilename: "source-0.xlsx",
    matchAccuracy: 90,
    matchedFieldsLabel: "Name, IC",
  });
  assert.doesNotMatch(JSON.stringify(diagnostics), /private-import-id/);
});

test("usable source matches are excluded from the TOTAL DUE diagnostic list", () => {
  const usableMatch = {
    ...createUnusableMatch(1),
    totalDue: "10.00",
  } as CollectionSourceMatch;
  const diagnostics = buildUnusableCollectionSourceMatchDiagnostics([
    createUnusableMatch(0),
    usableMatch,
  ]);

  assert.equal(diagnostics.totalCount, 1);
  assert.equal(diagnostics.items[0]?.sourceLabel, "Saved Source 0");
});
