import test from "node:test";
import assert from "node:assert/strict";

import { buildProtectedCollectionPiiSelectSql } from "../lib/perf-collection-baseline-sql.mjs";

test("buildProtectedCollectionPiiSelectSql omits plaintext when encrypted shadows exist", () => {
  const sqlText = buildProtectedCollectionPiiSelectSql({
    columnName: "customer_name",
    encryptedColumnName: "customer_name_encrypted",
    aliasName: "customer_name",
    fieldName: "customerName",
    env: {},
  }).replace(/\s+/g, " ").trim();

  assert.equal(
    sqlText,
    "CASE WHEN NULLIF(trim(COALESCE(customer_name_encrypted, '')), '') IS NOT NULL THEN NULL ELSE NULLIF(trim(COALESCE(customer_name, '')), '') END AS customer_name",
  );
});

test("buildProtectedCollectionPiiSelectSql emits NULL aliases for retired plaintext fields", () => {
  const sqlText = buildProtectedCollectionPiiSelectSql({
    columnName: "customer_name",
    encryptedColumnName: "customer_name_encrypted",
    aliasName: "customer_name",
    fieldName: "customerName",
    env: {
      COLLECTION_PII_RETIRED_FIELDS: "customerName,icNumber",
    },
  }).trim();

  assert.equal(sqlText, "NULL AS customer_name");
});
