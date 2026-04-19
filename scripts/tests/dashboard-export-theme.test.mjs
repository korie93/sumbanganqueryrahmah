import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const dashboardUtilsPath = path.resolve(
  process.cwd(),
  "client/src/pages/dashboard/utils.ts",
);

test("dashboard PDF export resolves theme colors from design tokens instead of legacy hardcoded hex values", () => {
  const dashboardUtils = readFileSync(dashboardUtilsPath, "utf8");

  assert.doesNotMatch(dashboardUtils, /#1e293b|#ffffff|#e2e8f0|#475569/i);
  assert.match(dashboardUtils, /hsl\(var\(--background\)\)/);
  assert.match(dashboardUtils, /hsl\(var\(--foreground\)\)/);
  assert.match(dashboardUtils, /hsl\(var\(--border\)\)/);
  assert.match(dashboardUtils, /hsl\(var\(--muted-foreground\)\)/);
  assert.match(dashboardUtils, /formatDashboardExportRgbColor/);
  assert.match(dashboardUtils, /backgroundColor: safeBackgroundColor/);
  assert.match(dashboardUtils, /color: \$\{safeForegroundColor\} !important/);
});
