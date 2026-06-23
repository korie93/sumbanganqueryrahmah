import assert from "node:assert/strict";
import test from "node:test";
import {
  buildViewerRowAriaLabel,
  formatViewerCellValue,
} from "@/pages/viewer/viewer-row-aria";

test("formatViewerCellValue replaces empty values with a visible fallback", () => {
  assert.equal(formatViewerCellValue(null), "-");
  assert.equal(formatViewerCellValue(undefined), "-");
  assert.equal(formatViewerCellValue("   \n  "), "-");
  assert.equal(formatViewerCellValue("  Account   active  "), "Account active");
  assert.equal(formatViewerCellValue(0), "0");
});

test("buildViewerRowAriaLabel summarizes the first visible fields", () => {
  assert.equal(
    buildViewerRowAriaLabel({
      row: {
        __rowId: 2,
        accountNumber: "ACC-123",
        amount: "150.00",
        customerName: "Aisyah",
        note: "Long form follow-up note that is trimmed safely for screen readers",
      },
      visibleHeaders: ["customerName", "accountNumber", "amount", "note"],
    }),
    "Viewer row 3, customerName Aisyah, accountNumber ACC-123, amount 150.00, 4 fields shown",
  );
});

test("buildViewerRowAriaLabel never announces an empty field value", () => {
  assert.equal(
    buildViewerRowAriaLabel({
      row: {
        __rowId: 0,
        customerName: " ",
      },
      visibleHeaders: ["customerName"],
    }),
    "Viewer row 1, customerName -, 1 field shown",
  );
});
