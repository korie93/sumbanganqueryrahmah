import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const drizzleConfigSource = readFileSync(new URL("../../drizzle.config.ts", import.meta.url), "utf8");

test("drizzle migration config uses DATABASE_SSL_CA_FILE with verified TLS only", () => {
  assert.match(
    drizzleConfigSource,
    /import \{ readFileSync \} from "node:fs";/,
  );
  assert.match(
    drizzleConfigSource,
    /const databaseSslCaFile = String\(process\.env\.DATABASE_SSL_CA_FILE \|\| ""\)\.trim\(\);/,
  );
  assert.match(
    drizzleConfigSource,
    /ca: readFileSync\(databaseSslCaFile, "utf8"\),\s*rejectUnauthorized: true,/s,
  );
  assert.doesNotMatch(
    drizzleConfigSource,
    /rejectUnauthorized:\s*false/,
  );
});

test("drizzle migration config applies TLS CA to both url and pg field credentials", () => {
  assert.match(
    drizzleConfigSource,
    /\? \{ url: databaseUrl, \.\.\.dbSslCredentials \}/,
  );
  assert.match(
    drizzleConfigSource,
    /database: process\.env\.PG_DATABASE \?\? "sqr_db",\s*\.\.\.dbSslCredentials,/s,
  );
});
