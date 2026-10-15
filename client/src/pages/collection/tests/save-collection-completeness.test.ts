import assert from "node:assert/strict";
import test from "node:test";
import { getSaveCollectionCompleteness } from "../save-collection-completeness";
import { getSaveCollectionReadiness, type SaveCollectionFormValues } from "../save-collection-page-utils";

const valid: SaveCollectionFormValues = {
  staffNickname: "Synthetic Collector",
  customerName: "Synthetic Customer",
  icNumber: "DEMO-IDENTITY",
  customerPhone: "+60123456789",
  accountNumber: "000123",
  cardNumber: "",
  batch: "P10",
  paymentDate: "2026-01-01",
  amount: "12.30",
};

test("blank form counts account/card as one missing requirement", () => {
  const readiness = getSaveCollectionReadiness({ ...valid, customerName: "", icNumber: "", customerPhone: "", accountNumber: "", paymentDate: "", amount: "" });
  const result = getSaveCollectionCompleteness(readiness);
  assert.equal(result.completed, 1);
  assert.equal(result.total, 7);
  assert.equal(result.remaining, 6);
  assert.equal(readiness.invalidFields.length, 7);
});

test("account-only and card-only both satisfy the same group without leaking identifiers", () => {
  for (const values of [valid, { ...valid, accountNumber: "", cardNumber: "00004567" }]) {
    const result = getSaveCollectionCompleteness(getSaveCollectionReadiness(values));
    assert.equal(result.completed, 7);
    assert.equal(result.remaining, 0);
    assert.equal(result.items.find((item) => item.label === "Account / Card Number")?.complete, true);
    assert.equal(JSON.stringify(result).includes("00004567"), false);
    assert.equal(JSON.stringify(result).includes(valid.icNumber), false);
  }
});

test("invalid supplied identifier remains incomplete even with valid alternative", () => {
  const result = getSaveCollectionCompleteness(getSaveCollectionReadiness({ ...valid, cardNumber: "1".repeat(129) }));
  assert.equal(result.completed, 6);
  assert.equal(result.items.find((item) => item.label === "Account / Card Number")?.complete, false);
});

test("nickname failure remains distinct from seven completed groups and cannot imply readiness", () => {
  const readiness = getSaveCollectionReadiness({ ...valid, staffNickname: "" });
  const result = getSaveCollectionCompleteness(readiness);
  assert.equal(result.completed, 7);
  assert.match(result.nicknameError ?? "", /nickname is required/i);
  assert.equal(readiness.isReady, false);
});

test("progress follows authoritative date, phone, batch and amount errors", () => {
  const readiness = getSaveCollectionReadiness(valid);
  const errors = { customerPhone: "Invalid", paymentDate: "Future", batch: "Invalid", amount: "Invalid" };
  const result = getSaveCollectionCompleteness({ ...readiness, errors, isReady: false });
  assert.equal(result.completed, 3);
  assert.equal(result.remaining, 4);
  assert.deepEqual(result.items.filter((item) => !item.complete).map((item) => item.label), ["Phone Number", "Batch", "Payment Date", "Amount (RM)"]);
});
