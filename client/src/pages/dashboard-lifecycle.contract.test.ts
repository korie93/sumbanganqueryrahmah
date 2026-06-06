import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("dashboard lifecycle uses AbortController and TanStack Query signals instead of mountedRef", () => {
  const source = readFileSync(path.resolve(__dirname, "Dashboard.tsx"), "utf8");

  assert.doesNotMatch(source, /mountedRef/);
  assert.match(source, /lifecycleAbortControllerRef = useRef<AbortController \| null>\(null\)/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /queryFn: \(\{ signal \}\) => getAnalyticsSummary\(\{ signal \}\)/);
  assert.match(source, /queryFn: \(\{ signal \}\) => getLoginTrends\(trendDays, \{ signal \}\)/);
  assert.match(source, /queryFn: \(\{ signal \}\) => getRecentLoginActivity\(8, \{ signal \}\)/);
  assert.match(source, /const secondaryDashboardQueriesEnabled = !summaryLoading && !trendsLoading && !topUsersLoading/);
  assert.match(source, /enabled: secondaryDashboardQueriesEnabled/);
  assert.match(source, /function useDashboardRetryHandler\(refetch: DashboardRefetch\)/);
});
