import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const clientSrcRoot = path.resolve(process.cwd(), "client/src");

function readClientSource(relativePath: string) {
  return readFileSync(path.join(clientSrcRoot, relativePath), "utf8");
}

test("analysis loading skeleton uses one CSS variable for pulse delays", () => {
  const component = readClientSource("pages/analysis/AnalysisLoadingSkeleton.tsx");
  const globalCss = readClientSource("index.css");

  assert.match(component, /"--pulse-delay": `\$\{delayMs\}ms`/);
  assert.doesNotMatch(component, /data-pulse-delay/);
  assert.match(globalCss, /animation-delay:\s*var\(--pulse-delay,\s*0ms\)/);
  assert.doesNotMatch(globalCss, /\.analysis-skeleton-pulse\[data-pulse-delay=/);
});

test("design tokens keep a broad monospace fallback stack", () => {
  const tokens = readClientSource("theme-tokens.css");

  assert.match(
    tokens,
    /--font-mono:\s*ui-monospace,\s*"Cascadia Code",\s*"Menlo",\s*"Consolas",\s*"DejaVu Sans Mono",\s*monospace;/,
  );
});
