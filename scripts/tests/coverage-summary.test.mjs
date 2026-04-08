import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  formatCoverageSummaryMarkdown,
  loadCoverageSummaryFromFile,
  readCoverageSummary,
} from "../lib/coverage-summary.mjs";

test("coverage summary parser reads the standard c8 total metrics", () => {
  const metrics = readCoverageSummary({
    total: {
      lines: { total: 100, covered: 88, skipped: 0, pct: 88 },
      statements: { total: 120, covered: 102, skipped: 0, pct: 85 },
      branches: { total: 40, covered: 26, skipped: 0, pct: 65 },
      functions: { total: 50, covered: 41, skipped: 0, pct: 82 },
    },
  });

  assert.equal(metrics.lines.pct, 88);
  assert.equal(metrics.branches.covered, 26);
});

test("coverage summary markdown formatter renders a GitHub-friendly table", () => {
  const markdown = formatCoverageSummaryMarkdown({
    lines: { total: 100, covered: 88, pct: 88 },
    statements: { total: 120, covered: 102, pct: 85 },
    branches: { total: 40, covered: 26, pct: 65 },
    functions: { total: 50, covered: 41, pct: 82 },
  });

  assert.match(markdown, /## Coverage Summary/);
  assert.match(markdown, /\| Lines \| 88% \| 88\/100 \|/);
  assert.match(markdown, /\| Branches \| 65% \| 26\/40 \|/);
});

test("coverage summary loader reads metrics from disk", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "coverage-summary-"));
  const summaryPath = path.join(tempDir, "coverage-summary.json");

  try {
    await fs.writeFile(summaryPath, JSON.stringify({
      total: {
        lines: { total: 10, covered: 10, skipped: 0, pct: 100 },
        statements: { total: 10, covered: 9, skipped: 0, pct: 90 },
        branches: { total: 5, covered: 4, skipped: 0, pct: 80 },
        functions: { total: 8, covered: 7, skipped: 0, pct: 87.5 },
      },
    }), "utf8");

    const metrics = await loadCoverageSummaryFromFile(summaryPath);
    assert.equal(metrics.functions.pct, 87.5);
    assert.equal(metrics.statements.covered, 9);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
