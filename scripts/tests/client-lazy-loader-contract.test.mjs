import assert from "node:assert/strict";
import test from "node:test";
import {
  ALLOWLISTED_REACT_LAZY_FILES,
  RAW_LAZY_RULES,
  formatClientLazyLoaderContractReport,
  validateClientLazyLoaderContract,
} from "../lib/client-lazy-loader-contract.mjs";

function buildCompliantFilesByPath() {
  return {
    "client/src/lib/lazy-with-preload.ts": "const component = lazy(load);",
    "client/src/app/AppProviders.tsx": 'const Toaster = lazyWithPreload(() => import("@/components/ui/toaster"));',
    "client/src/pages/Viewer.tsx": 'const ViewerContent = lazyWithPreload(() => import("@/pages/viewer/ViewerContent"));',
  };
}

test("client lazy-loader contract accepts lazyWithPreload usage and the allowlisted implementation", () => {
  const validation = validateClientLazyLoaderContract({
    filesByPath: buildCompliantFilesByPath(),
  });

  assert.deepEqual(validation.failures, []);
  assert.equal(validation.summary.fileCount, 3);
  assert.equal(validation.summary.allowlistedFileCount, ALLOWLISTED_REACT_LAZY_FILES.size);
  assert.equal(validation.summary.ruleCount, RAW_LAZY_RULES.length);
});

test("client lazy-loader contract flags raw lazy(...) usage outside the allowlist", () => {
  const filesByPath = buildCompliantFilesByPath();
  filesByPath["client/src/pages/AuditLogs.tsx"] = 'const AuditLogsRecordsList = lazy(() => import("@/pages/audit-logs/AuditLogsRecordsList"));';

  const validation = validateClientLazyLoaderContract({ filesByPath });

  assert.equal(validation.failures.length, 1);
  assert.match(validation.failures[0], /AuditLogs\.tsx/);
  assert.match(validation.failures[0], /lazyWithPreload/);
});

test("client lazy-loader contract flags React.lazy(...) usage outside the allowlist", () => {
  const filesByPath = buildCompliantFilesByPath();
  filesByPath["client/src/pages/Dashboard.tsx"] = 'const DashboardCharts = React.lazy(() => import("@/pages/dashboard/DashboardCharts"));';

  const validation = validateClientLazyLoaderContract({ filesByPath });

  assert.equal(validation.failures.length, 1);
  assert.match(validation.failures[0], /Dashboard\.tsx/);
  assert.match(validation.failures[0], /React\.lazy/);
});

test("client lazy-loader contract report summarizes successful checks", () => {
  const report = formatClientLazyLoaderContractReport({
    failures: [],
    summary: {
      allowlistedFileCount: 1,
      fileCount: 42,
      ruleCount: 2,
    },
  });

  assert.match(report, /inspected 42 client source files against 2 raw lazy rules/i);
  assert.match(report, /route through lazyWithPreload with retryable imports/i);
  assert.match(report, /1 allowlisted loader implementation file/i);
});
