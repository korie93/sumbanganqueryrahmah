import assert from "node:assert/strict";
import test from "node:test";
import { buildViewerRowAriaLabel } from "@/pages/viewer/viewer-row-aria";

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
