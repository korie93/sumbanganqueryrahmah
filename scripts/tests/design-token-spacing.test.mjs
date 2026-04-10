import assert from "node:assert/strict";
import test from "node:test";
import {
  DESIGN_TOKEN_SPACING_REQUIREMENTS,
  formatDesignTokenSpacingContractReport,
  validateDesignTokenSpacingContract,
} from "../lib/design-token-spacing.mjs";

function buildCompliantFilesByPath() {
  return Object.fromEntries(
    DESIGN_TOKEN_SPACING_REQUIREMENTS.map((requirement) => [
      requirement.filePath,
      requirement.checks.map((check) => check.snippet).join("\n"),
    ]),
  );
}

test("design token spacing contract accepts the guarded theme and layout markers", () => {
  const validation = validateDesignTokenSpacingContract({
    filesByPath: buildCompliantFilesByPath(),
  });

  assert.deepEqual(validation.failures, []);
  assert.equal(validation.summary.fileCount, DESIGN_TOKEN_SPACING_REQUIREMENTS.length);
  assert.equal(
    validation.summary.snippetCount,
    DESIGN_TOKEN_SPACING_REQUIREMENTS.reduce((total, requirement) => total + requirement.checks.length, 0),
  );
});

test("design token spacing contract flags missing required files", () => {
  const filesByPath = buildCompliantFilesByPath();
  delete filesByPath["client/src/theme-tokens.css"];

  const validation = validateDesignTokenSpacingContract({ filesByPath });

  assert.equal(validation.failures.length, 1);
  assert.match(validation.failures[0], /client\/src\/theme-tokens\.css/);
});

test("design token spacing contract flags missing spacing markers with readable labels", () => {
  const filesByPath = buildCompliantFilesByPath();
  filesByPath["tailwind.config.ts"] = [
    "spacing: {",
    "\"4\": \"var(--spacing-4)\"",
  ].join("\n");

  const validation = validateDesignTokenSpacingContract({ filesByPath });

  assert.equal(validation.failures.length, 2);
  assert.match(validation.failures[0], /half-step token/i);
});

test("design token spacing contract report summarizes successful checks", () => {
  const report = formatDesignTokenSpacingContractReport({
    failures: [],
    summary: {
      fileCount: 5,
      checkedFileCount: 5,
      snippetCount: 15,
      checkedSnippetCount: 15,
    },
  });

  assert.match(report, /inspected 5\/5 files and 15\/15 spacing markers/i);
  assert.match(report, /tailwind, and shell layout surfaces/i);
});
