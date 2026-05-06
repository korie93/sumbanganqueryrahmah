import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const commandSource = readFileSync(
  path.resolve(process.cwd(), "client", "src", "components", "ui", "command.tsx"),
  "utf8",
)

test("command palette input wrapper exposes a visible keyboard focus indicator", () => {
  assert.match(commandSource, /focus-within:ring-2/)
  assert.match(commandSource, /focus-within:ring-ring/)
  assert.match(commandSource, /focus-within:ring-offset-2/)
  assert.match(commandSource, /focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2/)
})

test("command palette items keep focus-visible styling distinct from selection state", () => {
  assert.match(commandSource, /focus-visible:bg-accent/)
  assert.match(commandSource, /focus-visible:text-accent-foreground/)
  assert.match(commandSource, /focus-visible:ring-2/)
  assert.match(commandSource, /data-\[selected=true\]:text-accent-foreground/)
})
