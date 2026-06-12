import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("activity retention query protects active bans and coordinates concurrent workers", async () => {
  const source = await readFile(
    new URL("../activity-repository-session-operations.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /pg_try_advisory_xact_lock/);
  assert.match(source, /FOR UPDATE OF activity SKIP LOCKED/);
  assert.match(source, /NOT EXISTS \(\s*SELECT 1\s*FROM public\.banned_sessions ban/s);
  assert.match(source, /ban\.activity_id = activity\.id/);
  assert.match(source, /logout_reason, ''\) NOT IN \('BANNED', 'KICKED'\)/);
  assert.match(
    source,
    /DELETE FROM public\.user_activity activity[\s\S]*NOT EXISTS \([\s\S]*FROM public\.banned_sessions ban/,
  );
});
