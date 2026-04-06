import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGeneralSearchAdvancedStatusText,
  buildGeneralSearchMobileSheetDescription,
} from "@/pages/general-search/general-search-controls-utils";

test("buildGeneralSearchAdvancedStatusText summarizes active filters", () => {
  assert.equal(
    buildGeneralSearchAdvancedStatusText(2, "OR"),
    "2 filters configured with OR logic.",
  );
  assert.equal(
    buildGeneralSearchAdvancedStatusText(1, "AND"),
    "1 filter configured with AND logic.",
  );
});

test("buildGeneralSearchAdvancedStatusText falls back to setup guidance", () => {
  assert.equal(
    buildGeneralSearchAdvancedStatusText(0, "AND"),
    "Open the filter sheet to choose fields, operators, and values.",
  );
});

test("buildGeneralSearchMobileSheetDescription switches copy by mode", () => {
  assert.equal(
    buildGeneralSearchMobileSheetDescription(true),
    "Adjust field rules here, then search with the current logic.",
  );
  assert.equal(
    buildGeneralSearchMobileSheetDescription(false),
    "Prefer a quick keyword search? Use the compact query field below.",
  );
});
