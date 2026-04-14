import assert from "node:assert/strict";
import test from "node:test";
import { buildCollectionMonthDetailsRowAriaLabel } from "@/pages/collection-summary/collection-summary-row-aria";

test("buildCollectionMonthDetailsRowAriaLabel summarizes monthly collection records", () => {
  assert.equal(
    buildCollectionMonthDetailsRowAriaLabel({
      formattedAmount: "RM 150.00",
      formattedPaymentDate: "14/04/2026",
      index: 3,
      record: {
        id: "rec-1",
        customerName: "Aisyah Binti Omar",
        icNumber: "900101-01-1234",
        customerPhone: "0123456789",
        accountNumber: "ACC-123",
        batch: "P10",
        paymentDate: "2026-04-14",
        amount: "150.00",
        receiptFile: null,
        receipts: [],
        receiptTotalAmount: "0.00",
        receiptValidationStatus: "unverified",
        receiptValidationMessage: null,
        receiptCount: 0,
        duplicateReceiptFlag: false,
        createdByLogin: "superuser",
        collectionStaffNickname: "Collector Alpha",
        createdAt: "2026-04-14T00:00:00.000Z",
      },
    }),
    "Monthly collection record 3, customer Aisyah Binti Omar, amount RM 150.00, payment date 14/04/2026, batch P10, account ACC-123, staff Collector Alpha",
  );
});
