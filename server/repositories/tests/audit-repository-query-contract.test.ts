import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("server/repositories/audit.repository.ts", "utf8");

test("audit log stats use index-friendly timestamp range counts", () => {
  assert.match(source, /countAuditLogs\(sql`WHERE timestamp < \$\{cutoff30\}`\)/);
  assert.match(source, /countAuditLogs\(sql`WHERE timestamp < \$\{cutoff365\}`\)/);
  assert.match(source, /ORDER BY timestamp ASC\s+LIMIT 1/s);
  assert.doesNotMatch(source, /COUNT\(\*\) FILTER/i);
});

