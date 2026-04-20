import assert from "node:assert/strict";
import test from "node:test";
import {
  DESIGN_TOKEN_COLOR_COMPATIBILITY_REQUIREMENTS,
  formatDesignTokenColorCompatibilityReport,
  validateDesignTokenColorCompatibility,
} from "../lib/design-token-color-compatibility.mjs";

function buildCompliantFilesByPath() {
  return {
    "client/src/theme-tokens.css": [
      "--primary-border: 217 91% 42%;",
      "--accent-border: 214 28% 74%;",
      ".dark {",
      "--primary-border: 217 91% 59%;",
      "--destructive-border: 0 62% 39%;",
      "}",
    ].join("\n"),
  };
}

test("design token color compatibility accepts explicit browser-safe theme border tokens", () => {
  const validation = validateDesignTokenColorCompatibility({
    filesByPath: buildCompliantFilesByPath(),
  });

  assert.deepEqual(validation.failures, []);
  assert.equal(validation.summary.fileCount, DESIGN_TOKEN_COLOR_COMPATIBILITY_REQUIREMENTS.length);
  assert.equal(
    validation.summary.ruleCount,
    DESIGN_TOKEN_COLOR_COMPATIBILITY_REQUIREMENTS.reduce(
      (total, requirement) => total + requirement.checks.length,
      0,
    ),
  );
});

test("design token color compatibility rejects missing required files", () => {
  const validation = validateDesignTokenColorCompatibility({ filesByPath: {} });

  assert.equal(validation.failures.length, 1);
  assert.match(validation.failures[0], /theme-tokens\.css/);
});

test("design token color compatibility flags relative hsl syntax", () => {
  const validation = validateDesignTokenColorCompatibility({
    filesByPath: {
      "client/src/theme-tokens.css": [
        "--primary-border: 217 91% 42%;",
        "--accent-border: 214 28% 74%;",
        ".dark {",
        "--primary-border: 217 91% 59%;",
        "--destructive-border: 0 62% 39%;",
        "}",
        "--accent-border: hsl(from hsl(var(--accent)) h s l / alpha);",
      ].join("\n"),
    },
  });

  assert.equal(validation.failures.length, 1);
  assert.match(validation.failures[0], /avoid relative hsl/i);
});

test("design token color compatibility report summarizes successful checks", () => {
  const report = formatDesignTokenColorCompatibilityReport({
    failures: [],
    summary: {
      fileCount: 1,
      checkedFileCount: 1,
      ruleCount: 5,
      checkedRuleCount: 5,
    },
  });

  assert.match(report, /inspected 1\/1 files and 5\/5 color rules/i);
  assert.match(report, /browser-safe hsl channel values/i);
});
