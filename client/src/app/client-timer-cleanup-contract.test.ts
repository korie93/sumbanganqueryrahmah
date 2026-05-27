import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type TimerCleanupContract = {
  filePath: string;
  setupPattern: RegExp;
  cleanupPattern: RegExp;
};

const TIMER_CLEANUP_CONTRACTS: TimerCleanupContract[] = [
  {
    filePath: "../pages/viewer/useViewerDataState.ts",
    setupPattern: /VIEWER_SEARCH_DEBOUNCE_MS/,
    cleanupPattern: /return\s+\(\)\s*=>\s*window\.clearTimeout\(timer\)/,
  },
  {
    filePath: "../pages/collection-records/useCollectionRecordsData.ts",
    setupPattern: /COLLECTION_RECORDS_AUTO_FETCH_DEBOUNCE_MS/,
    cleanupPattern: /return\s+\(\)\s*=>\s*window\.clearTimeout\(timer\)/,
  },
  {
    filePath: "../pages/collection/useSaveCollectionDraftState.ts",
    setupPattern: /setTimeout\(\(\)\s*=>\s*\{/,
    cleanupPattern: /window\.clearTimeout\(timer\)/,
  },
  {
    filePath: "../components/useFloatingAILayoutState.ts",
    setupPattern: /resizeDebounceHandle\s*=\s*window\.setTimeout/,
    cleanupPattern: /window\.clearTimeout\(resizeDebounceHandle\)/,
  },
  {
    filePath: "../pages/Landing.tsx",
    setupPattern: /LANDING_DEFERRED_SECTION_FALLBACK_DELAY_MS/,
    cleanupPattern: /window\.clearTimeout\(timeoutHandle\)/,
  },
  {
    filePath: "../components/monitor/MonitorDeferredSection.tsx",
    setupPattern: /timeoutHandle\s*=\s*window\.setTimeout\(markReady,\s*timeoutMs\)/,
    cleanupPattern: /window\.clearTimeout\(timeoutHandle\)/,
  },
  {
    filePath: "../pages/activity/ActivityDeferredSection.tsx",
    setupPattern: /timeoutHandle\s*=\s*window\.setTimeout\(markReady,\s*timeoutMs\)/,
    cleanupPattern: /window\.clearTimeout\(timeoutHandle\)/,
  },
  {
    filePath: "../pages/dashboard/DashboardDeferredSections.tsx",
    setupPattern: /timeoutHandle\s*=\s*window\.setTimeout\(markReady,\s*timeoutMs\)/,
    cleanupPattern: /window\.clearTimeout\(timeoutHandle\)/,
  },
];

function readClientSource(relativePath: string) {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

test("debounce and deferred fallback timers are cleaned up by their owners", () => {
  for (const contract of TIMER_CLEANUP_CONTRACTS) {
    const source = readClientSource(contract.filePath);

    assert.match(source, contract.setupPattern, `${contract.filePath} should still own its timer setup`);
    assert.match(source, contract.cleanupPattern, `${contract.filePath} must clear its timer during cleanup`);
  }
});
