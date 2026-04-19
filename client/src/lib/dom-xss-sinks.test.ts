import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

const CLIENT_SRC_DIR = path.resolve(process.cwd(), "client", "src")
const ALLOWED_DANGEROUS_HTML_SINK_FILE = path.join(
  CLIENT_SRC_DIR,
  "components",
  "ui",
  "chart.tsx"
)

async function collectRuntimeSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await collectRuntimeSourceFiles(entryPath)))
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      files.push(entryPath)
    }
  }

  return files
}

test("client runtime keeps DOM HTML injection sinks tightly scoped", async () => {
  const runtimeFiles = await collectRuntimeSourceFiles(CLIENT_SRC_DIR)
  const dangerousHtmlFiles: string[] = []
  const rawInnerHtmlFiles: string[] = []
  const outerHtmlFiles: string[] = []
  const adjacentHtmlFiles: string[] = []
  const srcDocFiles: string[] = []
  const contextualFragmentFiles: string[] = []

  for (const filePath of runtimeFiles) {
    const source = await readFile(filePath, "utf8")

    if (source.includes("dangerouslySetInnerHTML")) {
      dangerousHtmlFiles.push(filePath)
    }

    if (source.includes("innerHTML")) {
      rawInnerHtmlFiles.push(filePath)
    }

    if (source.includes("outerHTML")) {
      outerHtmlFiles.push(filePath)
    }

    if (source.includes("insertAdjacentHTML")) {
      adjacentHtmlFiles.push(filePath)
    }

    if (source.includes("srcDoc")) {
      srcDocFiles.push(filePath)
    }

    if (source.includes("createContextualFragment")) {
      contextualFragmentFiles.push(filePath)
    }
  }

  assert.deepEqual(dangerousHtmlFiles, [])
  assert.deepEqual(rawInnerHtmlFiles, [])
  assert.deepEqual(outerHtmlFiles, [])
  assert.deepEqual(adjacentHtmlFiles, [])
  assert.deepEqual(srcDocFiles, [])
  assert.deepEqual(contextualFragmentFiles, [])

  const chartSource = await readFile(ALLOWED_DANGEROUS_HTML_SINK_FILE, "utf8")
  assert.doesNotMatch(chartSource, /dangerouslySetInnerHTML/)
})
