import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCollectionPiiScriptSelectClause,
  buildCollectionPiiScriptSelectColumns,
  parseCollectionPiiScriptFields,
} from "./collection-pii-script-columns";

test("buildCollectionPiiScriptSelectColumns only includes requested staged fields", () => {
  const columns = buildCollectionPiiScriptSelectColumns(
    new Set(["icNumber", "customerPhone", "accountNumber"]),
  );

  assert.deepEqual(columns, [
    "id",
    "ic_number",
    "ic_number_encrypted",
    "ic_number_search_hash",
    "customer_phone",
    "customer_phone_encrypted",
    "customer_phone_search_hash",
    "account_number",
    "account_number_encrypted",
    "account_number_search_hash",
  ]);
});

test("buildCollectionPiiScriptSelectClause keeps customer-name search-hash array when requested", () => {
  const clause = buildCollectionPiiScriptSelectClause(new Set(["customerName"]));

  assert.match(clause, /\bcustomer_name\b/);
  assert.match(clause, /\bcustomer_name_search_hashes\b/);
  assert.doesNotMatch(clause, /\bic_number\b/);
  assert.doesNotMatch(clause, /\bcustomer_phone\b/);
  assert.doesNotMatch(clause, /\baccount_number\b/);
});

test("parseCollectionPiiScriptFields accepts staged field lists", () => {
  const fields = parseCollectionPiiScriptFields("icNumber,customerPhone,accountNumber");

  assert.deepEqual(Array.from(fields), [
    "icNumber",
    "customerPhone",
    "accountNumber",
  ]);
});

test("parseCollectionPiiScriptFields rejects unknown field names", () => {
  assert.throws(
    () => parseCollectionPiiScriptFields("customerName,passportNumber"),
    /Unknown collection PII field 'passportNumber'/,
  );
});
