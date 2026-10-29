import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolvePlaywrightLaunchOptions } from "../lib/playwright-chrome.mjs";

function assertPlaywrightUsesSystemChrome(workflowPath) {
  const workflow = readFileSync(workflowPath, "utf8");
  const resolveStepIndex = workflow.indexOf("Resolve system Chrome");
  const dependencyStepIndex = workflow.indexOf("Install Playwright Chromium dependencies");

  assert.ok(resolveStepIndex > 0, `${workflowPath} must resolve the system Chrome path`);
  assert.ok(dependencyStepIndex > 0, `${workflowPath} must install only Playwright Chromium dependencies`);
  assert.ok(dependencyStepIndex > resolveStepIndex, `${workflowPath} must resolve Chrome before installing deps`);
  assert.match(workflow, /command -v google-chrome-stable/);
  assert.match(workflow, /PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=\$CHROME_BIN/);
  assert.match(workflow, /CHROME_PATH=\$CHROME_BIN/);
  assert.match(workflow, /npx playwright install-deps chromium/);
  assert.doesNotMatch(workflow, /playwright install --with-deps chromium/);
  assert.doesNotMatch(workflow, /require\("playwright"\)\.chromium\.executablePath\(\)/);
}

test("application smoke and release workflows retain system Chrome", () => {
  assertPlaywrightUsesSystemChrome(".github/workflows/ci.yml");
  assertPlaywrightUsesSystemChrome(".github/workflows/release-verification.yml");
});

test("only the sanitizer regression uses the lockfile-paired Chromium", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const steps = workflow.split(/(?=^      - name: )/m);
  const installIndex = steps.findIndex(step => step.includes("name: Install locked Chromium for sanitizer regression"));
  const probeIndex = steps.findIndex(step => step.includes("name: Verify sanitizers under strict Trusted Types"));
  assert.ok(installIndex > 0 && installIndex < probeIndex, "Install the paired browser before running the sanitizer probe");
  assert.match(steps[installIndex], /run: npx --no-install playwright install --only-shell chromium/);
  assert.match(steps[probeIndex], /PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: ""/);
  assert.match(steps[probeIndex], /CHROME_PATH: ""/);
  assert.match(steps[probeIndex], /run: npm run test:trusted-types:browser/);
  for (const [index, step] of steps.entries()) {
    if (index === probeIndex) continue;
    assert.doesNotMatch(step, /(?:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH|CHROME_PATH): ""/, "Other smoke steps must keep the system browser");
  }
});

test("empty step-scoped browser overrides select Playwright's paired browser", () => {
  assert.deepEqual(
    resolvePlaywrightLaunchOptions({ env: { PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: "", CHROME_PATH: "" } }),
    { headless: true },
  );
});

test("resolvePlaywrightLaunchOptions uses an explicit absolute Chrome executable", () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "sqr-playwright-chrome-"));
  const executablePath = path.join(temporaryDirectory, process.platform === "win32" ? "chrome.cmd" : "chrome");

  try {
    writeFileSync(executablePath, process.platform === "win32" ? "@echo off\r\n" : "#!/bin/sh\nexit 0\n");
    if (process.platform !== "win32") {
      chmodSync(executablePath, 0o755);
    }

    assert.deepEqual(
      resolvePlaywrightLaunchOptions({
        env: {
          PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: executablePath,
        },
      }),
      {
        executablePath,
        headless: true,
      },
    );
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("resolvePlaywrightLaunchOptions rejects relative executable paths", () => {
  assert.throws(
    () =>
      resolvePlaywrightLaunchOptions({
        env: {
          PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: "google-chrome-stable",
        },
      }),
    /absolute path/i,
  );
});
