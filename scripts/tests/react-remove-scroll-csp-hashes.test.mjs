import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { generateReactRemoveScrollBarStyleHashes } from "../lib/react-remove-scroll-csp-hashes.mjs";

test("react-remove-scroll CSP hash generator matches the checked-in Helmet allowlist", () => {
  const { hashes } = generateReactRemoveScrollBarStyleHashes();
  const source = readFileSync(
    path.join(process.cwd(), "server", "internal", "local-http-security.ts"),
    "utf8",
  );

  assert.equal(hashes.length, 31);
  for (const hash of hashes) {
    assert.match(source, new RegExp(hash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
