import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAndValidatePgSearchPath,
  validatePgSearchPath,
} from "../../config/db-search-path";

test("parseAndValidatePgSearchPath keeps valid bare and quoted schema entries", () => {
  assert.deepEqual(
    parseAndValidatePgSearchPath('public, "$user", reporting_schema'),
    ["public", "\"$user\"", "reporting_schema"],
  );
});

test("parseAndValidatePgSearchPath rejects malformed schema segments", () => {
  assert.throws(
    () => parseAndValidatePgSearchPath("public;drop schema public"),
    /Invalid PG search_path/i,
  );
  assert.throws(
    () => parseAndValidatePgSearchPath("public, reporting schema"),
    /Invalid PG search_path/i,
  );
  assert.throws(
    () => parseAndValidatePgSearchPath('public, ""'),
    /Invalid PG search_path/i,
  );
});

test("validatePgSearchPath returns a normalized comma-separated search path", () => {
  assert.equal(
    validatePgSearchPath("public,reporting"),
    "public, reporting",
  );
});
