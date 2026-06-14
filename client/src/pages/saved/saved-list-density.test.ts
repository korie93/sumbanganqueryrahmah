import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSavedListDensityStorageKey,
  normalizeSavedListDensity,
  resolveSavedListDensity,
} from "@/pages/saved/useSavedListDensity";

test("saved list density accepts only supported preferences", () => {
  assert.equal(normalizeSavedListDensity("compact"), "compact");
  assert.equal(normalizeSavedListDensity("comfortable"), "comfortable");
  assert.equal(normalizeSavedListDensity("dense"), "comfortable");
  assert.equal(normalizeSavedListDensity(null), "comfortable");
});

test("saved list density storage keys are normalized per user", () => {
  assert.equal(
    buildSavedListDensityStorageKey(" SQR User.One "),
    "sqr:saved-list-density:sqr_user_one",
  );
  assert.equal(
    buildSavedListDensityStorageKey(""),
    "sqr:saved-list-density:anonymous",
  );
});

test("mobile always resolves to the comfortable density", () => {
  assert.equal(resolveSavedListDensity("compact", true), "comfortable");
  assert.equal(resolveSavedListDensity("compact", false), "compact");
});
