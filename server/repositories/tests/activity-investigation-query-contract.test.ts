import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("activity investigation query uses bound identifiers and exact session audit linkage", async () => {
  const source = await readFile(
    new URL("../activity-repository-investigation-operations.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /eq\(userActivity\.id, activityId\)/);
  assert.match(source, /eq\(bannedSessions\.activityId, activityId\)/);
  assert.match(source, /eq\(auditLogs\.targetResource, targetResource\)/);
  assert.match(source, /if \(auditEventRows\.length === 0\)/);
  assert.match(source, /position\(\$\{legacyActivityMarker\}/);
  assert.doesNotMatch(source, /WHERE.*\$\{activityId\}/);
  assert.match(source, /ACTIVITY_INVESTIGATION_AUDIT_LIMIT = 20/);
  assert.match(source, /countActivityRows\(relatedSessionCondition\)/);
  assert.match(source, /\.limit\(relatedPage\.pageSize\)/);
  assert.match(source, /\.offset\(relatedSessionsOffset\)/);
  assert.match(source, /ne\(userActivity\.id, activityId\)/);
  assert.match(source, /eq\(userActivity\.userId, activity\.userId\)/);
  assert.match(source, /countDistinct\(userActivity\.userId\)/);
  assert.match(source, /or\(\.\.\.relatedConditions\)/);
  assert.match(source, /relatedSessionsPagination/);
});
