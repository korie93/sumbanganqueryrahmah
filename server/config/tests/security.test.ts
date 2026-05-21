import assert from "node:assert/strict";
import test from "node:test";
import {
  getCollectionPiiRetiredFields,
  getTwoFactorTotpAlgorithm,
} from "../security";

test("collection PII retired fields are memoized instead of allocated per call", () => {
  assert.equal(getCollectionPiiRetiredFields(), getCollectionPiiRetiredFields());
});

test("two-factor TOTP algorithm is exposed through runtime security config", () => {
  assert.match(getTwoFactorTotpAlgorithm(), /^(sha1|sha256)$/);
});
