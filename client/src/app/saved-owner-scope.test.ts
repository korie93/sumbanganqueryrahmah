import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isPageEnabled } from "./monitorAccess";

const source = readFileSync(new URL("./AppPageRenderer.tsx", import.meta.url), "utf8");

test("Saved's React owner key follows authenticated account identity and role", () => {
  assert.match(source, /<SavedPage key=\{JSON\.stringify\(\[user\.id \?\? user\.username, user\.role\]\)\}/);
  const key = source.match(/<SavedPage key=\{([^}]+)\}/)?.[1];
  assert.ok(key);
  assert.doesNotMatch(key, /fullName|email|imports|page|search|Date|random/);
});

test("the authenticated permission gate denies Saved before creating its owner", () => {
  for (const role of ["user", "admin", "manager"]) {
    assert.equal(isPageEnabled(role, "saved", { saved: false }, true), false);
  }
  const gate = source.indexOf("if (!pageEnabled)");
  const saved = source.indexOf('case "saved":');
  assert.ok(gate >= 0 && gate < saved);
  assert.match(source.slice(gate, saved), /return <ForbiddenPage \/>/);
});
