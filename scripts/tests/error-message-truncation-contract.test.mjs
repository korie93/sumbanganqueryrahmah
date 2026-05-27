import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const rootDir = process.cwd();

function readRepoFile(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("client API helpers preserve full server messages for expandable UI", () => {
  const apiClientSource = readRepoFile("client/src/lib/api-client.ts");
  const authSessionSource = readRepoFile("client/src/lib/api/auth-session-api.ts");

  assert.doesNotMatch(apiClientSource, /normalizedText\.slice\(0,\s*237\)/);
  assert.doesNotMatch(authSessionSource, /normalizedText\.slice\(0,\s*240\)/);
});

test("long toast and login messages use the shared expandable disclosure", () => {
  const toasterSource = readRepoFile("client/src/components/ui/toaster.tsx");
  const loginSource = readRepoFile("client/src/pages/Login.tsx");
  const expandableSource = readRepoFile("client/src/components/ExpandableMessage.tsx");

  assert.match(toasterSource, /<ExpandableMessage>\{description\}<\/ExpandableMessage>/);
  assert.match(loginSource, /<ExpandableMessage>\{error\}<\/ExpandableMessage>/);
  assert.match(expandableSource, /aria-expanded=\{expanded\}/);
  assert.match(expandableSource, /aria-controls=\{messageId\}/);
  assert.match(expandableSource, /Papar mesej penuh/);
});
