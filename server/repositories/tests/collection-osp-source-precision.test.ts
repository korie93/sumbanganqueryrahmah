import assert from "node:assert/strict";
import test from "node:test";
import { assertCollectionOspBaselinePrecision } from "../collection-osp-source-scope-repository-utils";
import { resolveCollectionOspAuthoritativeBaseline } from "../collection-osp-v7-repository-utils";

test("source preview and create retain NUMERIC(16,2) precision with controlled overflow", () => {
  assert.doesNotThrow(() => assertCollectionOspBaselinePrecision("99999999999999.99"));
  assert.doesNotThrow(() => assertCollectionOspBaselinePrecision("0.00"));
  // Individually valid NUMERIC(14,2) source rows can exceed the aggregate bound.
  const overflow = 99_999_999_999_999n * 101n;
  assert.throws(() => assertCollectionOspBaselinePrecision("100000000000000.00"), { reason: "INVALID_SOURCE" });
  assert.throws(() => resolveCollectionOspAuthoritativeBaseline({ aging: "D3", derivedBaselineCents: overflow }), { reason: "INVALID_SOURCE" });
});
