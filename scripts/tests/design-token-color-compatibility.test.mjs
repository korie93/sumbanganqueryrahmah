import assert from "node:assert/strict";
import test from "node:test";
import {
  DESIGN_TOKEN_COLOR_COMPATIBILITY_REQUIREMENTS,
  formatDesignTokenColorCompatibilityReport,
  validateDesignTokenColorCompatibility,
} from "../lib/design-token-color-compatibility.mjs";

function buildCompliantFilesByPath() {
  return {
    "client/src/styles/tokens/index.css": [
      ":root {",
      "--primary-border: hsl(217 91% 42%);",
      "--accent-border: hsl(214 28% 74%);",
      "}",
      ".dark {",
      "--primary-border: hsl(207 60% 48%);",
      "--destructive-border: hsl(357 72% 38%);",
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
  assert.match(validation.failures[0], /styles\/tokens\/index\.css/);
});

test("design token color compatibility flags relative hsl syntax", () => {
  const validation = validateDesignTokenColorCompatibility({
    filesByPath: {
      "client/src/styles/tokens/index.css": [
        ":root {",
        "--primary-border: hsl(217 91% 42%);",
        "--accent-border: hsl(214 28% 74%);",
        "}",
        ".dark {",
        "--primary-border: hsl(207 60% 48%);",
        "--destructive-border: hsl(357 72% 38%);",
        "}",
        "--accent-border: hsl(from hsl(var(--accent)) h s l / alpha);",
      ].join("\n"),
    },
  });

  assert.equal(validation.failures.length, 1);
  assert.match(validation.failures[0], /avoid relative hsl/i);
});

test("color compatibility accepts resolved semantic aliases but rejects undefined references or later invalid overrides", () => {
  const file = "client/src/styles/tokens/index.css";
  const source = buildCompliantFilesByPath()[file].replace(
    "--primary-border: hsl(217 91% 42%);",
    "--primary: 207 58% 32%; --primary-border: hsl(var(--primary));",
  );
  assert.deepEqual(validateDesignTokenColorCompatibility({ filesByPath: { [file]: source } }).failures, []);
  for (const invalid of [
    source.replace("hsl(var(--primary))", "hsl(var(--missing))"),
    source.replace("--primary: 207 58% 32%;", "--primary: var(--cycle); --cycle: var(--primary);"),
    source.replace("--primary-border: hsl(var(--primary));", "--primary-border: hsl(var(--primary)); --primary-border: bad;"),
    source.replace(":root {", ".unrelated {"),
  ]) assert.ok(validateDesignTokenColorCompatibility({ filesByPath: { [file]: invalid } }).failures.length > 0);
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
  assert.match(report, /browser-safe hsl values/i);
});
