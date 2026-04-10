import assert from "node:assert/strict";
import test from "node:test";
import {
  BROWSER_STORAGE_SAFETY_RULES,
  collectBrowserStorageSafetyMatches,
  formatBrowserStorageSafetyReport,
} from "../lib/browser-storage-safety.mjs";

test("browser storage safety reports success when direct localStorage access is absent", () => {
  const result = {
    matches: [],
    summary: {
      fileCount: 10,
      ruleCount: BROWSER_STORAGE_SAFETY_RULES.length,
    },
  };

  const report = formatBrowserStorageSafetyReport(result);

  assert.match(report, /inspected 10 client files against 1 direct-access rules/i);
  assert.match(report, /routes localStorage access through browser-storage safety helpers/i);
});

test("browser storage safety report lists violations with file paths", () => {
  const report = formatBrowserStorageSafetyReport({
    matches: [
      {
        filePath: "client/src/pages/Maintenance.tsx",
        label: "client source avoids direct localStorage property access",
        snippet: "localStorage.getItem(",
      },
    ],
    summary: {
      fileCount: 1,
      ruleCount: BROWSER_STORAGE_SAFETY_RULES.length,
    },
  });

  assert.match(report, /Maintenance\.tsx/);
  assert.match(report, /localStorage\.getItem/);
});

test("browser storage safety collector ignores test files and reports direct access in source files", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");

  const repoRoot = mkdtempSync(path.join(tmpdir(), "browser-storage-safety-"));
  const sourceDir = path.join(repoRoot, "client", "src", "pages");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(
    path.join(sourceDir, "Bad.tsx"),
    "export const bad = () => localStorage.setItem('activeTab', 'home');\n",
    "utf8",
  );
  writeFileSync(
    path.join(sourceDir, "Bad.test.tsx"),
    "test('ok', () => localStorage.setItem('activeTab', 'home'));\n",
    "utf8",
  );

  const result = collectBrowserStorageSafetyMatches({ repoRoot });

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].filePath, "client/src/pages/Bad.tsx");
});
