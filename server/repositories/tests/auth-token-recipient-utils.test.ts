import assert from "node:assert/strict";
import test from "node:test";
import { assertAuthTokenRecipient } from "../auth-token-recipient-utils";

test("recovery issuance accepts the same normalized recipient", () => {
  assert.doesNotThrow(() => assertAuthTokenRecipient(
    { email: "  Owner@Example.test ", status: "active" }, " owner@example.test ",
  ));
});

test("recovery issuance fails closed for stale, missing or cleared recipients", () => {
  const target = { email: "corrected@example.test", status: "active" };
  for (const expected of ["old@example.test", "", "   ", null, undefined]) {
    assert.throws(() => assertAuthTokenRecipient(target, expected), { statusCode: 409, code: "CONFLICT" });
  }
  for (const unavailable of [undefined, { ...target, email: null }, { ...target, status: "deleted" }]) {
    assert.throws(() => assertAuthTokenRecipient(unavailable, target.email), { statusCode: 409, code: "CONFLICT" });
  }
});
