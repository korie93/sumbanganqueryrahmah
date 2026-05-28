import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join, relative } from "node:path"
import test from "node:test"

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url))
const CLIENT_SRC_DIR = join(REPO_ROOT, "client", "src")
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"])
const ARBITRARY_TYPOGRAPHY_CLASS_PATTERN = /\b(?:text|tracking)-\[/

function listSourceFiles(directory: string): string[] {
  const files: string[] = []

  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry)
    const stats = statSync(fullPath)

    if (stats.isDirectory()) {
      files.push(...listSourceFiles(fullPath))
      continue
    }

    if (SOURCE_EXTENSIONS.has(fullPath.slice(fullPath.lastIndexOf(".")))) {
      files.push(fullPath)
    }
  }

  return files
}

test("client typography uses Tailwind design tokens instead of arbitrary values", () => {
  const matches = listSourceFiles(CLIENT_SRC_DIR)
    .filter((filePath) => ARBITRARY_TYPOGRAPHY_CLASS_PATTERN.test(readFileSync(filePath, "utf8")))
    .map((filePath) => relative(CLIENT_SRC_DIR, filePath))

  assert.deepEqual(matches, [])
})

test("Tailwind exposes compact typography tokens used by operational surfaces", () => {
  const tailwindConfigSource = readFileSync(join(REPO_ROOT, "tailwind.config.ts"), "utf8")

  for (const token of [
    "xxs",
    "2xs",
    "nav-sm",
    "dashboard-metric",
    "monitor-hero-expanded",
    "label-sm",
    "label-md",
    "label-xl",
    "label-4xl",
  ]) {
    assert.match(tailwindConfigSource, new RegExp(`\"${token}\"|${token}:`))
  }
})
