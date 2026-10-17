import assert from "node:assert/strict";
import test from "node:test";
import {
  CLIENT_BREAKPOINT_CONTRACT_REQUIREMENTS,
  formatClientBreakpointContractReport,
  loadClientBreakpointContractFiles,
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
      "client/src/pages/landing-v21/landing-v21.css",
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

test("actual client styles and guarded consumers satisfy the release breakpoint gate", () => {
  const filesByPath = loadClientBreakpointContractFiles({ cwd: process.cwd() });
  const dailyCssPath = "client/src/pages/collection/CollectionDailyPage.css";

  assert.equal(typeof filesByPath[dailyCssPath], "string", "The repository scan includes Collection Daily styles");
  const validation = validateClientBreakpointContract({ filesByPath });

  assert.deepEqual(validation.failures, [], formatClientBreakpointContractReport(validation));
});

test("actual Collection Daily styles cannot introduce a separate 1280px viewport tier", () => {
  const filesByPath = loadClientBreakpointContractFiles({ cwd: process.cwd() });
  const dailyCssPath = "client/src/pages/collection/CollectionDailyPage.css";
  assert.equal(typeof filesByPath[dailyCssPath], "string");
  filesByPath[dailyCssPath] += "\n@media (min-width: 1280px) { .collection-daily-summary-metrics { display: grid; } }\n";

  const validation = validateClientBreakpointContract({ filesByPath });

  assert.deepEqual(validation.failures, [
    `${dailyCssPath}: unsupported responsive breakpoint 1280px (allowed: 640, 767, 768, 1023, 1024px)`,
  ]);
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

test("only the namespaced V21 stylesheet may retain approved reference breakpoints", () => {
  const filesByPath = buildCompliantFilesByPath();
  const landingPath = "client/src/pages/landing-v21/landing-v21.css";
  filesByPath[landingPath] = [390, 900, 1040].map(width => `@media (max-width: ${width}px) {}`).join("\n");
  assert.deepEqual(validateClientBreakpointContract({ filesByPath }).failures, []);
  filesByPath["client/src/pages/Login.css"] = filesByPath[landingPath];
  assert.equal(validateClientBreakpointContract({ filesByPath }).failures.length, 3);
  delete filesByPath["client/src/pages/Login.css"];
  filesByPath[landingPath] = "@media (max-width: 999px) {}";
  assert.equal(validateClientBreakpointContract({ filesByPath }).failures.length, 1);
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

test("only the isolated V17 auth stylesheet may retain the canonical reference breakpoints", () => {
  const filesByPath = buildCompliantFilesByPath();
  const authPath = "client/src/components/auth/AuthV17Layout.css";
  const widths = [380, 699, 700, 980, 981, 1200];
  filesByPath[authPath] = widths.map((width) => `@media (min-width: ${width}px) {}`).join("\n");
  assert.deepEqual(validateClientBreakpointContract({ filesByPath }).failures, []);

  // Neither nearby auth files nor authenticated workspace CSS inherit the exception.
  for (const otherPath of ["client/src/pages/Login.css", "client/src/components/auth/Other.css", "client/src/app/AuthenticatedAppShell.css"]) {
    const copy = { ...filesByPath, [otherPath]: filesByPath[authPath] };
    assert.equal(validateClientBreakpointContract({ filesByPath: copy }).failures.length, widths.length);
  }

  filesByPath[authPath] = "@media (max-width: 999px) {}";
  assert.equal(validateClientBreakpointContract({ filesByPath }).failures.length, 1);
});
