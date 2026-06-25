import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTableDensityStorageKey,
  normalizeTableDensity,
  resolveTableDensity,
} from "@/hooks/usePersistentTableDensity";

test("table density accepts only supported preferences", () => {
  assert.equal(normalizeTableDensity("compact"), "compact");
  assert.equal(normalizeTableDensity("comfortable"), "comfortable");
  assert.equal(normalizeTableDensity("dense"), "comfortable");
  assert.equal(normalizeTableDensity(null), "comfortable");
});

test("table density storage keys are scoped and normalized per user", () => {
  assert.equal(
    buildTableDensityStorageKey("activity", " SQR User.One "),
    "sqr:table-density:activity:sqr_user_one",
  );
  assert.equal(
    buildTableDensityStorageKey("viewer", ""),
    "sqr:table-density:viewer:anonymous",
  );
});

test("mobile always resolves to comfortable table density", () => {
  assert.equal(resolveTableDensity("compact", true), "comfortable");
  assert.equal(resolveTableDensity("compact", false), "compact");
});
