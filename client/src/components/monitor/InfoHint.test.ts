import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("InfoHint uses a real button instead of a non-interactive tabbable element", () => {
  const source = readFileSync(new URL("./InfoHint.tsx", import.meta.url), "utf8")

  assert.match(source, /<button[\s\S]*type="button"/)
  assert.doesNotMatch(source, /tabIndex=\{0\}/)
  assert.doesNotMatch(source, /role="note"/)
})
