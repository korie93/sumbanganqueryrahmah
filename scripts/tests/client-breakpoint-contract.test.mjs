import assert from "node:assert/strict";
import test from "node:test";
import {
  CLIENT_BREAKPOINT_CONTRACT_REQUIREMENTS,
  formatClientBreakpointContractReport,
  validateClientBreakpointContract,
} from "../lib/client-breakpoint-contract.mjs";

function buildCompliantFilesByPath() {
  return Object.fromEntries([
    ...CLIENT_BREAKPOINT_CONTRACT_REQUIREMENTS.map((requirement) => [
      requirement.filePath,
      requirement.checks.map((check) => check.snippet).join("\n"),
    ]),
    [
      "client/src/components/PublicAuthLayout.css",
      [
        "@media (min-width: 640px) {}",
        "@media (min-width: 768px) {}",
        "@media (max-width: 767px) {}",
      ].join("\n"),
    ],
    [
      "client/src/pages/Landing.css",
      "@media (max-width: 1023px) {}",
    ],
    [
      "client/src/app/AuthenticatedAppShell.css",
      "@media (min-width: 1024px) {}",
    ],
  ]);
}

test("client breakpoint contract accepts the shared responsive tiers and guarded consumers", () => {
  const validation = validateClientBreakpointContract({
    filesByPath: buildCompliantFilesByPath(),
  });

  assert.deepEqual(validation.failures, []);
  assert.equal(validation.summary.requirementFileCount, CLIENT_BREAKPOINT_CONTRACT_REQUIREMENTS.length);
  assert.equal(validation.summary.cssFileCount, 3);
  assert.equal(validation.summary.cssBreakpointCount, 5);
});

test("client breakpoint contract flags missing guarded files", () => {
  const filesByPath = buildCompliantFilesByPath();
  delete filesByPath["client/src/pages/Dashboard.tsx"];

  const validation = validateClientBreakpointContract({ filesByPath });

  assert.equal(validation.failures.length, 1);
  assert.match(validation.failures[0], /client\/src\/pages\/Dashboard\.tsx/);
});

test("client breakpoint contract flags unsupported CSS width breakpoints", () => {
  const filesByPath = buildCompliantFilesByPath();
  filesByPath["client/src/pages/Login.css"] = "@media (max-width: 900px) {}";

  const validation = validateClientBreakpointContract({ filesByPath });

  assert.equal(validation.failures.length, 1);
  assert.match(validation.failures[0], /unsupported responsive breakpoint 900px/i);
});

test("client breakpoint contract report summarizes successful checks", () => {
  const report = formatClientBreakpointContractReport({
    failures: [],
    summary: {
      requirementFileCount: 10,
      checkedRequirementFileCount: 10,
      requirementCount: 25,
      checkedRequirementCount: 25,
      cssFileCount: 7,
      cssBreakpointCount: 11,
    },
  });

  assert.match(report, /inspected 10\/10 targeted files, 25\/25 contract markers, and 7 CSS files/i);
  assert.match(report, /standardized around 640\/767\/768\/1023\/1024/i);
});
