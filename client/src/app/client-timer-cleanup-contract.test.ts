import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type TimerCleanupContract = {
  filePath: string;
  setupPattern: RegExp;
  cleanupPatterns: readonly RegExp[];
};

const TIMER_CLEANUP_CONTRACTS: TimerCleanupContract[] = [
  {
    filePath: "../hooks/useTimers.ts",
    setupPattern: /const timerId = window\.setTimeout/,
    cleanupPatterns: [
      /for \(const timerId of timeoutIdsRef\.current\)[\s\S]*window\.clearTimeout\(timerId\)/,
      /for \(const timerId of intervalIdsRef\.current\)[\s\S]*window\.clearInterval\(timerId\)/,
      /useEffect\(\(\) => clearAllTimers, \[clearAllTimers\]\)/,
    ],
  },
  {
    filePath: "../components/useDelayedVisibleFlag.ts",
    setupPattern: /const timer = window\.setTimeout/,
    cleanupPatterns: [/return\s+\(\)\s*=>\s*\{[\s\S]*window\.clearTimeout\(timer\)/],
  },
  {
    filePath: "../pages/viewer/useViewerDataState.ts",
    setupPattern: /VIEWER_SEARCH_DEBOUNCE_MS/,
    cleanupPatterns: [/return\s+\(\)\s*=>\s*window\.clearTimeout\(timer\)/],
  },
  {
    filePath: "../pages/collection-records/useCollectionRecordsData.ts",
    setupPattern: /COLLECTION_RECORDS_AUTO_FETCH_DEBOUNCE_MS/,
    cleanupPatterns: [/return\s+\(\)\s*=>\s*window\.clearTimeout\(timer\)/],
  },
  {
    filePath: "../pages/collection/useSaveCollectionDraftState.ts",
    setupPattern: /setTimeout\(\(\)\s*=>\s*\{/,
    cleanupPatterns: [/window\.clearTimeout\(timer\)/],
  },
  {
    filePath: "../components/useFloatingAILayoutState.ts",
    setupPattern: /resizeDebounceHandle\s*=\s*window\.setTimeout/,
    cleanupPatterns: [/window\.clearTimeout\(resizeDebounceHandle\)/],
  },
  {
    filePath: "../pages/Landing.tsx",
    setupPattern: /LANDING_DEFERRED_SECTION_FALLBACK_DELAY_MS/,
    cleanupPatterns: [/window\.clearTimeout\(timeoutHandle\)/],
  },
  {
    filePath: "../components/monitor/MonitorDeferredSection.tsx",
    setupPattern: /timeoutHandle\s*=\s*window\.setTimeout\(markReady,\s*timeoutMs\)/,
    cleanupPatterns: [/window\.clearTimeout\(timeoutHandle\)/],
  },
  {
    filePath: "../pages/activity/ActivityDeferredSection.tsx",
    setupPattern: /timeoutHandle\s*=\s*window\.setTimeout\(markReady,\s*timeoutMs\)/,
    cleanupPatterns: [/window\.clearTimeout\(timeoutHandle\)/],
  },
  {
    filePath: "../pages/dashboard/DashboardDeferredSections.tsx",
    setupPattern: /timeoutHandle\s*=\s*window\.setTimeout\(markReady,\s*timeoutMs\)/,
    cleanupPatterns: [/window\.clearTimeout\(timeoutHandle\)/],
  },
  {
    filePath: "../app/AuthenticatedAppShell.tsx",
    setupPattern: /fallbackTimeoutId = window\.setTimeout\(markReady,\s*FLOATING_AI_FALLBACK_READY_DELAY_MS\)/,
    cleanupPatterns: [
      /window\.clearTimeout\(fallbackTimeoutId\)/,
      /window\.cancelIdleCallback\(idleCallbackId\)/,
    ],
  },
  {
    filePath: "../app/useSingleTabSession.ts",
    setupPattern: /const heartbeatId = window\.setInterval\(syncLockState,\s*SINGLE_TAB_LOCK_HEARTBEAT_MS\)/,
    cleanupPatterns: [
      /window\.clearInterval\(heartbeatId\)/,
      /document\.removeEventListener\("visibilitychange", handleVisibilityChange\)/,
    ],
  },
  {
    filePath: "../app/useAppShellMaintenanceState.ts",
    setupPattern: /const timer = setManagedInterval\(checkMaintenance,\s*MAINTENANCE_STATUS_POLL_INTERVAL_MS\)/,
    cleanupPatterns: [
      /const \{ clearManagedInterval, setManagedInterval \} = useTimers\(\)/,
      /clearManagedInterval\(timer\)/,
      /document\.removeEventListener\("visibilitychange", handleVisibilityChange\)/,
    ],
  },
  {
    filePath: "../pages/Login.tsx",
    setupPattern: /lockedCountdownIntervalRef\.current = window\.setInterval\(refreshCountdown,\s*1000\)/,
    cleanupPatterns: [
      /window\.clearInterval\(lockedCountdownIntervalRef\.current\)/,
      /lockedCountdownIntervalRef\.current = null/,
      /mountedRef\.current = false;[\s\S]*clearLockedCountdownInterval\(\)/,
    ],
  },
  {
    filePath: "../pages/Login.tsx",
    setupPattern: /const frameId = window\.requestAnimationFrame/,
    cleanupPatterns: [
      /window\.cancelAnimationFrame\(frameId\)/,
    ],
  },
  {
    filePath: "../pages/Maintenance.tsx",
    setupPattern: /pollIntervalId = setManagedInterval\(\(\) => \{[\s\S]*MAINTENANCE_STATUS_POLL_INTERVAL_MS\)/,
    cleanupPatterns: [
      /const startPolling = \(\) => \{[\s\S]*stopPolling\(\);\s*pollIntervalId = setManagedInterval/,
      /clearManagedInterval\(pollIntervalId\)/,
      /const tick = window\.setInterval\(\(\) => \{[\s\S]*return\s+\(\)\s*=>\s*\{[\s\S]*window\.clearInterval\(tick\)/,
    ],
  },
  {
    filePath: "../pages/ActivateAccount.tsx",
    setupPattern: /const timeoutId = window\.setTimeout\(\(\) => \{/,
    cleanupPatterns: [/window\.clearTimeout\(timeoutId\)/],
  },
  {
    filePath: "../pages/ChangePassword.tsx",
    setupPattern: /redirectTimeoutRef\.current = window\.setTimeout\(\(\) => \{/,
    cleanupPatterns: [
      /window\.clearTimeout\(redirectTimeoutRef\.current\)/,
      /redirectTimeoutRef\.current = null/,
    ],
  },
  {
    filePath: "../hooks/useSystemMetrics.ts",
    setupPattern: /scheduledPollRef\.current = window\.setTimeout\(\(\) => \{/,
    cleanupPatterns: [
      /clearScheduledPoll\(\)/,
      /document\.removeEventListener\("visibilitychange", handleVisibilityChange\)/,
    ],
  },
  {
    filePath: "../components/useAIChatRuntimeRefs.ts",
    setupPattern: /retryTimersRef\.current\.forEach/,
    cleanupPatterns: [
      /globalThis\.clearTimeout\(requestTimeoutRef\.current\)/,
      /globalThis\.clearInterval\(typingIntervalRef\.current\)/,
      /retryTimersRef\.current\.forEach\(\(timerId\) => globalThis\.clearTimeout\(timerId\)\)/,
      /globalThis\.clearTimeout\(slowNoticeTimerRef\.current\)/,
    ],
  },
  {
    filePath: "../pages/ai/useAIPageRuntimeRefs.ts",
    setupPattern: /retryTimersRef = useRef<number\[\]>\(\[\]\)/,
    cleanupPatterns: [
      /retryTimersRef\.current\.forEach\(\(timerId\) => window\.clearTimeout\(timerId\)\)/,
      /window\.clearTimeout\(slowNoticeTimerRef\.current\)/,
      /window\.clearInterval\(typingTimerRef\.current\)/,
    ],
  },
];

const ONE_SHOT_TIMER_EXCEPTIONS = [
  {
    filePath: "../lib/download.ts",
    expectedPattern: /window\.setTimeout\(\(\) => \{[\s\S]*revokeTrackedObjectUrl\(objectUrl\)/,
  },
  {
    filePath: "../lib/web-vitals.ts",
    expectedPattern: /window\.setTimeout\(start,\s*WEB_VITALS_FALLBACK_START_DELAY_MS\)/,
  },
  {
    filePath: "../app/single-tab-session.ts",
    expectedPattern: /window\.setTimeout\(performReload,\s*0\)/,
  },
] as const;

function readClientSource(relativePath: string) {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

test("debounce and deferred fallback timers are cleaned up by their owners", () => {
  for (const contract of TIMER_CLEANUP_CONTRACTS) {
    const source = readClientSource(contract.filePath);

    assert.match(source, contract.setupPattern, `${contract.filePath} should still own its timer setup`);
    for (const cleanupPattern of contract.cleanupPatterns) {
      assert.match(source, cleanupPattern, `${contract.filePath} must clear its timer during cleanup`);
    }
  }
});

test("one-shot utility timers are documented as non-lifecycle exceptions", () => {
  for (const exception of ONE_SHOT_TIMER_EXCEPTIONS) {
    const source = readClientSource(exception.filePath);

    assert.match(source, exception.expectedPattern, `${exception.filePath} should remain an audited one-shot timer`);
  }
});

test("AI page typing interval remains owned by runtime cleanup refs", () => {
  const typingSource = readClientSource("../pages/ai/useAIPageTypingAction.ts");
  const runtimeSource = readClientSource("../pages/ai/useAIPageRuntimeRefs.ts");

  assert.match(typingSource, /stopTyping\(\);[\s\S]*typingTimerRef\.current = window\.setInterval/);
  assert.match(runtimeSource, /window\.clearInterval\(typingTimerRef\.current\)/);
  assert.match(runtimeSource, /typingTimerRef\.current = null/);
});

test("receipt and download object URLs stay owned by explicit cleanup paths", () => {
  const downloadSource = readClientSource("../lib/download.ts");
  const draftPreviewSource = readClientSource("../pages/collection/useCollectionReceiptDraftPreviews.ts");
  const dailyReceiptViewerSource = readClientSource("../pages/collection/useCollectionDailyReceiptViewer.ts");
  const recordsReceiptPreviewSource = readClientSource("../pages/collection-records/useCollectionReceiptPreview.ts");

  assert.match(downloadSource, /const objectUrl = URL\.createObjectURL\(blob\)/);
  assert.match(downloadSource, /revokeTrackedObjectUrl\(objectUrl\)/);
  assert.match(downloadSource, /URL\.revokeObjectURL\(objectUrl\)/);

  assert.match(draftPreviewSource, /const sourceUrl = URL\.createObjectURL\(file\)/);
  assert.match(draftPreviewSource, /URL\.revokeObjectURL\(sourceUrl\)/);
  assert.match(draftPreviewSource, /function revokeCollectionReceiptDraftPreview/);
  assert.match(draftPreviewSource, /for \(const preview of previewCache\.values\(\)\) \{[\s\S]*revokeCollectionReceiptDraftPreview\(preview\)/);

  assert.match(dailyReceiptViewerSource, /const clearPreviewObjectUrl = useCallback/);
  assert.match(dailyReceiptViewerSource, /URL\.revokeObjectURL\(previewObjectUrlRef\.current\)/);
  assert.match(dailyReceiptViewerSource, /abortPreviewRequest\(\);[\s\S]*abortDownloadRequest\(\);[\s\S]*clearPreviewObjectUrl\(\);/);
  assert.match(dailyReceiptViewerSource, /URL\.revokeObjectURL\(objectUrl\);[\s\S]*return;/);

  assert.match(recordsReceiptPreviewSource, /const clearReceiptPreviewObjectUrl = useCallback/);
  assert.match(recordsReceiptPreviewSource, /URL\.revokeObjectURL\(receiptPreviewUrlRef\.current\)/);
  assert.match(recordsReceiptPreviewSource, /abortReceiptPreviewRequest\(\);[\s\S]*abortReceiptDownloadRequest\(\);[\s\S]*clearReceiptPreviewObjectUrl\(\);/);
  assert.match(recordsReceiptPreviewSource, /URL\.revokeObjectURL\(objectUrl\);[\s\S]*return;/);
});
